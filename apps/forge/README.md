# portfolio-lint for Jira (Atlassian Forge)

Runs the Portfolio AI-Readiness Framework inside Jira Cloud. No data leaves Atlassian: the app runs on Forge,
reads issues with `read:jira-work`, stores reports in Forge storage, and ships a read-only Rovo agent.

## Modules

| Module | What it does |
|---|---|
| `jira:globalPage` Portfolio Readiness | Portfolio score, grade, forecast labels, delivery forecast per project (p50/p85, commitment verdict, confidence), per-project table, remediation, violations, trend. "Scan now" button. |
| `jira:projectPage` AI Readiness | Same for one project, plus per-rule table. |
| `scheduledTrigger` daily | Rescans every project the app can read (up to 20 projects, 2000 issues each). |
| `rovo:agent` Portfolio Readiness Advisor | Answers "how ready are we", "what to fix first", "explain rule X" via two actions: `getPortfolioScore`, `explainRule`. |
| `jira:customField` Readiness, Readiness findings | Read-only fields owned by the app: the rule ids an issue violates (list of strings) and their count (number). Filled by the scan, trimmed by inline fixes. Usable as columns, on cards, in filters and JQL (`Readiness = "missing-estimate"`, `"Readiness findings" >= 2`). |
| `jira:jqlFunction` readinessFindings | `issue in readinessFindings("stale-open")` or `issue in readinessFindings()` for any finding; `not in` works too. Expands to a clause on the fields above. |
| `consumer` field-sync | Async events queue that writes the field values after each scan, outside the 25 s invocation budget. |

## Prerequisites

- Node 20 or 22 (Forge CLI warns on 24 but works).
- An Atlassian account with a Jira Cloud site you can install apps on.
- An API token from [id.atlassian.com](https://id.atlassian.com/manage-profile/security/api-tokens).

## Build and deploy

From the repository root:

```bash
npm install
npm run build                     # builds @portfolio-lint/core, the app imports it
cd apps/forge
npx forge login                   # once; or set FORGE_EMAIL and FORGE_API_TOKEN
npx forge register                # first time only: prints the app id
```

Paste the printed `ari:cloud:ecosystem::app/...` into `manifest.yml` under `app.id`, then:

```bash
npx forge lint
npx forge deploy -e development
npx forge install -e development  # pick Jira, enter your site URL
```

Open Jira, Apps menu, Portfolio Readiness, click Scan now. The daily trigger runs afterwards.

## Configuration

Thresholds live in Forge storage under key `config` (same shape as `.portfoliolintrc.json`).
Jira admins edit them in the Settings tab of the portfolio page; project admins set per-project overrides
in the Settings tab of the project page (stored under `config.projects.<KEY>`). Defaults:
stale in progress 14 days, stale open 90 days, baseline WIP 3, outlier factor 5.

## Development notes

- `src/index.ts`: resolver (`getReport`, `scanNow`, `getProjectReport`, `listRules`, `getDocs`, `getSettings`, `saveSettings`, `saveProjectSettings`, `getFixOptions`, `fixIssue`), scheduled handler, Rovo actions.
- `src/fixes.ts`: inline fixes, written with `api.asUser()` so Jira permissions and history stay with the person clicking. `src/permissions.ts`: Jira admin / project admin checks that gate the Settings tabs.
- `src/fields.ts`: Readiness custom fields. `runScan` queues one event per 800 issues plus a reconcile event per project; the consumer resolves the field ids once (`GET /rest/api/3/field`, matched by the `/static/<moduleKey>` suffix of `schema.custom`, cached in storage), writes both fields with `POST /rest/api/3/app/field/value?generateChangelog=false` in chunks of 100 issues, and the reconcile event clears issues that still carry a value but have no finding (found with `cf[id] is not EMPTY`). Jira errors return `InvocationError` so the queue retries (up to 3 times). `fixIssue` drops the fixed rule from the issue right away.
- Custom field gotcha: Forge string fields only match with `=` in JQL (`~` never matches), so the rules field is `collection: list` with one entry per rule. The number field is what makes `is not EMPTY` and `>= n` cheap.
- `src/frontend/`: `docs.tsx` (in-app rule reference and per-rule modal), `settings.tsx` (global settings and per-project overrides, validated by `@portfolio-lint/core` config schema), `findings.tsx` and `fix.tsx` (compact findings table with Fix buttons).
- UI Kit gotcha: the `@forge/react` reconciler copies `children` into host-element props on every update and serializes the whole doc to the host. A `React.Context.Provider` element inside those props is circular and silently freezes the sandbox (every later click is ignored, no error anywhere). Keep any Provider above the first host element (see `DocsHost` in the pages).
- UI Kit gotcha: `route` from `@forge/api` URL-encodes interpolated values, so build JQL and field lists with plain strings.
- `src/jiraClient.ts`: `api.asApp().requestJira`, `POST /rest/api/3/search/jql` with `nextPageToken` pagination, story points field detection.
- `src/scan.ts`: runs `lintPortfolio` from `@portfolio-lint/core`, stores the latest report (violations capped at 500) and a 30-point score history.
- UI is Forge UI Kit (`@forge/react`), rendered natively, no custom iframe.
- `npm run typecheck -w portfolio-lint-forge` checks the app without deploying. `npx forge lint` needs a login.
- Forge bundles with webpack + ts-loader using `tsconfig.json`. Two constraints: `noEmit` must be off (ts-loader needs output) and relative imports must be extensionless (`./scan`, not `./scan.js`); the Forge resolver does not map `.js` to `.ts`.
- Forge CLI is non-interactive only with `--non-interactive`; `forge register` still prompts for a Developer Space on first use, so run it in a real TTY.
- Auth without a TTY: export `FORGE_EMAIL` and `FORGE_API_TOKEN` (API token from [id.atlassian.com](https://id.atlassian.com/manage-profile/security/api-tokens)).
- No Jira site yet? Create a free developer site at [go.atlassian.com/cloud-dev](https://go.atlassian.com/cloud-dev) (Cloud Developer Bundle, 5 users, no credit card).

## Marketplace notes

The app uses only Forge storage and Jira REST, so it qualifies for the "Runs on Atlassian" badge.
Forge consumption pricing (2026) applies to invocations beyond the free tier; a daily scan of 20 projects is well inside it.
