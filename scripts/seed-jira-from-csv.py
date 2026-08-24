#!/usr/bin/env python3
"""
Loads a portfolio-lint CSV (docs/csv-format.md) into a Jira Cloud site: one company-managed
project per project_key, epics, children with parent/assignee/due date/story points/labels,
status transitions and "Blocks" links for depends_on.

What Jira will NOT reproduce from the CSV: created/updated timestamps (always "now"),
resolution dates (set by the Done transition), and assignees other than the site users
(every assigned row is mapped to the API user). Freshness rules therefore read as clean on
a freshly seeded site; use the CSV with the CLI for the full picture.

  export JIRA_URL=https://your-site.atlassian.net JIRA_EMAIL=... JIRA_TOKEN=...
  python3 scripts/seed-jira-from-csv.py examples/erp-portfolio.csv --state /tmp/erp-seed-state.json

Re-runnable: the state file records created keys, applied transitions and links.
"""
import argparse
import base64
import csv
import json
import os
import sys
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

ap = argparse.ArgumentParser()
ap.add_argument("csv")
ap.add_argument("--state", default="seed-state.json")
ap.add_argument("--projects", default="", help="comma-separated project keys to load (default: all)")
ap.add_argument("--threads", type=int, default=6)
ap.add_argument("--kanban", default="ERPPMO", help="comma-separated keys created with the kanban template")
args = ap.parse_args()

SITE = os.environ["JIRA_URL"].rstrip("/")
AUTH = base64.b64encode(f"{os.environ['JIRA_EMAIL']}:{os.environ['JIRA_TOKEN']}".encode()).decode()
SCRUM = "com.pyxis.greenhopper.jira:gh-simplified-scrum-classic"
KANBAN = "com.pyxis.greenhopper.jira:gh-simplified-kanban-classic"
STORY_POINTS = "customfield_10046"  # "Story Points" on company-managed projects; adjust per site

lock = threading.Lock()
stats = {"req": 0, "retry": 0}


def req(method, path, body=None, attempt=0):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(
        SITE + path,
        data=data,
        method=method,
        headers={"Authorization": "Basic " + AUTH, "Accept": "application/json", "Content-Type": "application/json"},
    )
    with lock:
        stats["req"] += 1
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            t = resp.read().decode()
            return resp.status, (json.loads(t) if t else None)
    except urllib.error.HTTPError as e:
        txt = e.read().decode()[:400]
        if e.code in (429, 502, 503, 504) and attempt < 6:
            wait = float(e.headers.get("Retry-After") or 2 * (attempt + 1))
            with lock:
                stats["retry"] += 1
            time.sleep(wait)
            return req(method, path, body, attempt + 1)
        return e.code, txt
    except (urllib.error.URLError, TimeoutError) as e:
        if attempt < 4:
            time.sleep(3)
            return req(method, path, body, attempt + 1)
        return 0, str(e)


# ---------- state ----------
state = {"keys": {}, "transitioned": [], "linked": []}
if os.path.exists(args.state):
    state = json.load(open(args.state))
transitioned = set(state["transitioned"])
linked = set(state["linked"])


def save_state():
    with lock:
        state["transitioned"] = sorted(transitioned)
        state["linked"] = sorted(linked)
        tmp = args.state + ".tmp"
        json.dump(state, open(tmp, "w"))
        os.replace(tmp, args.state)


# ---------- input ----------
rows = list(csv.DictReader(open(args.csv, newline="", encoding="utf-8")))
projects = {}
for r in rows:
    projects.setdefault(r["project_key"], {"name": r["project_name"], "rows": []})["rows"].append(r)
wanted = [k for k in projects if not args.projects or k in args.projects.split(",")]
print(f"{len(rows)} rows, projects {wanted}")

st, me = req("GET", "/rest/api/3/myself")
assert st == 200, me
ME = me["accountId"]

TYPE_ALIASES = {
    "epic": ["epic", "épico"],
    "story": ["story", "história", "historia", "user story"],
    "task": ["task", "tarefa", "tarea"],
    "bug": ["bug", "erro", "defeito"],
}


def ensure_project(key, name):
    st, p = req("GET", f"/rest/api/3/project/{key}")
    if st == 200:
        return p
    template = KANBAN if key in args.kanban.split(",") else SCRUM
    st, p = req("POST", "/rest/api/3/project", {
        "key": key, "name": name[:80], "projectTypeKey": "software", "projectTemplateKey": template,
        "leadAccountId": ME, "assigneeType": "UNASSIGNED",
    })
    if st != 201:
        print("create project failed", key, st, p)
        sys.exit(1)
    print("created project", key)
    return req("GET", f"/rest/api/3/project/{key}")[1]


def ensure_story_points_on_screens(pkey):
    """Company-managed templates put Story Points on the story screen only; add it to every project screen."""
    st, res = req("GET", f"/rest/api/3/screens?queryString={pkey}&maxResults=50")
    for screen in (res or {}).get("values", []):
        if not screen["name"].startswith(pkey + ":"):
            continue
        st, tabs = req("GET", f"/rest/api/3/screens/{screen['id']}/tabs")
        if st != 200 or not tabs:
            continue
        tab = tabs[0]["id"]
        st, fields = req("GET", f"/rest/api/3/screens/{screen['id']}/tabs/{tab}/fields")
        if any(f["id"] == STORY_POINTS for f in (fields or [])):
            continue
        st, r = req("POST", f"/rest/api/3/screens/{screen['id']}/tabs/{tab}/fields", {"fieldId": STORY_POINTS})
        print(f"  screen {screen['name']}: add {STORY_POINTS} -> {st}")


def type_map(project):
    by_name = {t["name"].lower(): t["id"] for t in project["issueTypes"] if not t.get("subtask")}
    out = {}
    for canon, names in TYPE_ALIASES.items():
        for n in names:
            if n in by_name:
                out[canon] = by_name[n]
                break
    out.setdefault("story", out.get("task"))
    out.setdefault("task", out.get("story"))
    out["other"] = out["task"]
    return out


def fields_for(pkey, tmap, r, parent_key=None):
    t = r["type"].lower()
    f = {"project": {"key": pkey}, "issuetype": {"id": tmap.get(t, tmap["other"])}, "summary": r["title"][:250]}
    if r.get("assignee_id"):
        f["assignee"] = {"accountId": ME}
    if r.get("due_date"):
        f["duedate"] = r["due_date"]
    if r.get("estimate") and t != "epic":
        f[STORY_POINTS] = float(r["estimate"])
    if parent_key:
        f["parent"] = {"key": parent_key}
    labels = [l for l in r.get("labels", "").split(";") if l]
    if labels:
        f["labels"] = labels
    return {"fields": f}


def bulk_create(batch):
    """batch: list of (csv_key, fields). Returns list of (csv_key, jira_key)."""
    st, res = req("POST", "/rest/api/3/issue/bulk", {"issueUpdates": [f for _, f in batch]})
    if st != 201:
        # fall back to one-by-one so a single bad row does not sink the batch
        out = []
        for ck, f in batch:
            s2, r2 = req("POST", "/rest/api/3/issue", f)
            if s2 == 201:
                out.append((ck, r2["key"]))
            else:
                print("  create failed", ck, s2, str(r2)[:200])
        return out
    out = []
    ok_idx = 0
    failed = {e.get("failedElementNumber") for e in res.get("errors", [])}
    created = res.get("issues", [])
    for i, (ck, _) in enumerate(batch):
        if i in failed:
            continue
        if ok_idx < len(created):
            out.append((ck, created[ok_idx]["key"]))
            ok_idx += 1
    for e in res.get("errors", []):
        print("  bulk error", batch[e.get("failedElementNumber", 0)][0], str(e)[:200])
    return out


def create_issues(pkey, tmap, items, parent_of):
    todo = [(r["key"], fields_for(pkey, tmap, r, parent_of(r))) for r in items if r["key"] not in state["keys"]]
    batches = [todo[i:i + 50] for i in range(0, len(todo), 50)]
    done = 0
    with ThreadPoolExecutor(max_workers=min(args.threads, 4)) as ex:
        futures = [ex.submit(bulk_create, b) for b in batches]
        for fut in as_completed(futures):
            for ck, jk in fut.result():
                with lock:
                    state["keys"][ck] = jk
            done += 1
            if done % 5 == 0 or done == len(batches):
                save_state()
                print(f"  {pkey}: {done}/{len(batches)} batches, {len(state['keys'])} keys mapped, {stats['req']} requests")


def transitions_for(pkey):
    sample = next((state["keys"][r["key"]] for r in projects[pkey]["rows"] if r["key"] in state["keys"]), None)
    if not sample:
        return {}
    st, res = req("GET", f"/rest/api/3/issue/{sample}/transitions")
    out = {}
    for t in res.get("transitions", []):
        cat = t["to"]["statusCategory"]["key"]
        out.setdefault({"indeterminate": "in_progress", "done": "done", "new": "todo"}.get(cat, cat), t["id"])
    return out


def transition(jk, tid):
    st, res = req("POST", f"/rest/api/3/issue/{jk}/transitions", {"transition": {"id": tid}})
    return st == 204, res


def link(blocker, blocked):
    st, res = req("POST", "/rest/api/3/issueLink", {
        # Jira's create-link payload: inwardIssue carries the outward description ("blocks").
        "type": {"name": "Blocks"}, "inwardIssue": {"key": blocker}, "outwardIssue": {"key": blocked},
    })
    return st in (200, 201), res


def run_parallel(label, jobs, fn):
    ok = 0
    fail = 0
    with ThreadPoolExecutor(max_workers=args.threads) as ex:
        futures = {ex.submit(fn, *j): j for j in jobs}
        for i, fut in enumerate(as_completed(futures), 1):
            good, res = fut.result()
            if good:
                ok += 1
            else:
                fail += 1
                if fail <= 5:
                    print(f"  {label} failed", futures[fut], str(res)[:160])
            if i % 200 == 0:
                save_state()
                print(f"  {label}: {i}/{len(jobs)} ({fail} failed, {stats['req']} requests, {stats['retry']} retries)")
    save_state()
    print(f"  {label}: {ok} ok, {fail} failed")


# ---------- main ----------
t0 = time.time()
for pkey in wanted:
    proj = projects[pkey]
    print(f"== {pkey} ({len(proj['rows'])} rows)")
    meta = ensure_project(pkey, proj["name"])
    ensure_story_points_on_screens(pkey)
    tmap = type_map(meta)
    epics = [r for r in proj["rows"] if r["type"].lower() == "epic"]
    others = [r for r in proj["rows"] if r["type"].lower() != "epic"]
    create_issues(pkey, tmap, epics, lambda r: None)
    create_issues(pkey, tmap, others, lambda r: state["keys"].get(r.get("parent_key") or "") if r.get("parent_key") else None)

    tmap_tr = transitions_for(pkey)
    jobs = []
    for r in proj["rows"]:
        cat = r["status_category"]
        jk = state["keys"].get(r["key"])
        if jk and cat in ("in_progress", "done") and cat in tmap_tr and jk not in transitioned:
            jobs.append((jk, tmap_tr[cat]))

    def do_transition(jk, tid):
        good, res = transition(jk, tid)
        if good:
            with lock:
                transitioned.add(jk)
        return good, res

    run_parallel("transitions", jobs, do_transition)

# links after every project exists, so cross-project links resolve
print("== links")
jobs = []
for pkey in wanted:
    for r in projects[pkey]["rows"]:
        blocked = state["keys"].get(r["key"])
        if not blocked:
            continue
        for dep in [x for x in r.get("depends_on", "").split(";") if x]:
            blocker = state["keys"].get(dep)
            if not blocker:
                continue  # dangling in the CSV on purpose; Jira cannot link to a missing issue
            lid = f"{blocker}>{blocked}"
            if lid not in linked:
                jobs.append((blocker, blocked, lid))


def do_link(blocker, blocked, lid):
    good, res = link(blocker, blocked)
    if good:
        with lock:
            linked.add(lid)
    return good, res


if jobs:
    # sanity check on the first link: the blocked issue must read "is blocked by" the blocker
    b, d_, lid = jobs[0]
    good, res = do_link(b, d_, lid)
    st, issue = req("GET", f"/rest/api/3/issue/{d_}?fields=issuelinks")
    ok = any(l.get("inwardIssue", {}).get("key") == b for l in issue["fields"]["issuelinks"])
    print(f"  link direction check on {d_}: {'ok' if ok else 'REVERSED, fix link() before continuing'}")
    if not ok:
        for l in issue["fields"]["issuelinks"]:
            req("DELETE", f"/rest/api/3/issueLink/{l['id']}")
        linked.discard(lid)
        save_state()
        sys.exit(1)
    run_parallel("links", jobs[1:], do_link)

print(f"done in {round(time.time() - t0)}s, {stats['req']} requests, {stats['retry']} retries, {len(state['keys'])} issues mapped")
