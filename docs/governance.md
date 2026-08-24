# Agent governance for PMOs

How to let AI agents act on portfolio data without losing accountability.
Companion to the [Portfolio AI-Readiness Framework](framework.md).

## Scope

This applies when an AI agent (Jira Rovo, Copilot, a custom MCP agent, an automation with an LLM step)
can read or change work items, dates, assignments, priorities or estimates in a portfolio.

Two failure modes are common in 2026 PMOs:

1. **Silent execution.** An agent "cleans up" the backlog, closes 200 stale items, and the quarterly forecast changes overnight with no owner.
2. **Silent advice.** An agent's forecast lands in a steering committee deck as a fact, with no record of which data it read or how good that data was.

Governance here means: every agent action on portfolio data has a decision class, a human role, and an audit record.
Readiness scores feed the policy: an agent should not forecast from data it would fail to forecast from.

## Principles

1. Agents recommend by default. Execution rights are granted per decision class, not per agent.
2. Readiness gates agent actions. Below a configured score, agents may report but not change.
3. Every agent action is logged in a format a human can review without the agent.
4. Reversibility decides autonomy. Reversible, low-impact actions may be automated; irreversible ones may not.
5. Humans own outcomes. An agent can hold a step in a workflow; a person holds the result.

## RACI for eight PMO decisions

R = does the work, A = accountable for the outcome, C = consulted before, I = informed after.
"Agent: execute" means the agent may perform the change directly under policy.

| Decision | Agent may | Human role | Readiness gate |
|---|---|---|---|
| Fill missing estimates from history | Recommend | Team lead: A, R | none (this improves readiness) |
| Flag and propose closing stale items | Recommend | Project manager: A; Team: C | none |
| Close stale items older than N days | Execute (reversible) | Project manager: A, I | project >= 60 |
| Reassign work to balance WIP | Recommend | Team lead: A, R | capacity forecast reliable |
| Move a due date | Recommend | Project manager: A, R; Sponsor: I | schedule forecast reliable |
| Split or restructure an epic | Recommend | Product owner: A, R | none |
| Escalate a schedule slip | Execute (notification only) | PMO: A; Sponsor: I | schedule forecast not unreliable |
| Change scope baseline | Never | Sponsor: A; PM: R; PMO: C | not applicable |

Adapt the table. The point is that the table exists, is versioned, and the agent's permissions match it.

## Agent policy template

Store one policy per agent next to the portfolio config. Example (`agents/backlog-hygiene.yml`):

```yaml
agent: backlog-hygiene
owner: pmo@example.com            # accountable human
purpose: Keep the backlog current so forecasts reflect reality.
data:
  read: [work-items, people, sprints]
  write: [work-items.status, work-items.labels]
decisions:
  - class: close-stale-items
    mode: execute                   # recommend | execute | never
    conditions:
      staleOpenDays: 180
      readiness:
        projectScoreAtLeast: 60
    reversible: true
    notify: [project-manager]
  - class: move-due-date
    mode: recommend
  - class: change-scope-baseline
    mode: never
limits:
  maxChangesPerRun: 50
  requireDryRunFirst: true
audit:
  sink: jira-issue-comments        # where the log lives
  retentionDays: 365
review:
  cadence: quarterly
  reviewer: pmo-lead
```

## Audit log record

One record per action, append-only, human-readable without tooling:

```json
{
  "ts": "2026-08-24T09:41:00Z",
  "agentId": "backlog-hygiene",
  "actor": "agent",
  "action": "close-stale-items",
  "target": ["ALPHA-3", "ALPHA-24"],
  "approvedBy": null,
  "rationale": "todo, not updated for 145 and 136 days, policy staleOpenDays=180 not met: skipped ALPHA-24, closed ALPHA-3",
  "readiness": { "project": "ALPHA", "score": 78.7, "scope": "degraded" },
  "reversible": true
}
```

Fields:

| Field | Meaning |
|---|---|
| `ts` | ISO timestamp |
| `agentId` | Policy the agent ran under |
| `actor` | `agent`, `human`, or `human-via-agent` (a person accepted an agent recommendation) |
| `action` | Decision class from the RACI table |
| `target` | Item keys or person ids affected |
| `approvedBy` | Human id when mode is recommend and someone accepted; `null` for autonomous execution |
| `rationale` | Plain-language reason, including the rule or threshold that triggered it |
| `readiness` | Score and forecast label at the time of the action |
| `reversible` | Whether an undo exists |

Rovo agents, Jira automation and custom agents can all write this shape to issue comments, a database, or a log stream.
The `portfolio-lint` Forge app ships a read-only advisor agent and writes no audit records because it changes nothing.

## Mapping to PMBOK Guide 8th edition

PMBOK 8 (November 2025) keeps performance domains and adds explicit guidance on AI use in project work.
Where this policy lands:

| PMBOK domain | What governance adds |
|---|---|
| Planning | Readiness gates decide when an AI forecast may inform a plan |
| Measurement | Readiness score as a leading indicator; audit log as evidence |
| Project work | Decision classes and RACI for agent actions in the workflow |
| Uncertainty | Forecast labels (reliable, degraded, unreliable) make data risk explicit |
| Stakeholders | Notification rules per decision class |

## Mapping to Canada's Directive on Automated Decision-Making

The Treasury Board of Canada Secretariat's
[Directive on Automated Decision-Making](https://www.tbs-sct.canada.ca/pol/doc-eng.aspx?id=32592)
binds federal institutions, not private PMOs, but it is the clearest public template for the question
"how much autonomy should software have over a decision". Its ideas translate directly:

| Directive concept | PMO equivalent |
|---|---|
| Impact assessment (levels I to IV) | Decision class with mode recommend, execute or never |
| Notice and explanation | `rationale` field and notification rules |
| Human intervention for higher impact levels | Human A/R role required for irreversible changes |
| Peer review and testing | Dry run required before first live execution; quarterly policy review |
| Monitoring | Readiness trend plus audit log retention |
| Recourse | Reversibility flag and an undo path for executed actions |

Organisations operating in Ontario should also watch the province's public-sector AI rules
under the Enhancing Digital Security and Trust Act, 2024; the same decision-class approach satisfies both.

## Checklist

- [ ] Every agent with write access has a policy file with an accountable human.
- [ ] Decision classes and modes match the RACI table.
- [ ] Readiness gates are configured for every execute-mode class.
- [ ] Audit records are written for every action and retained.
- [ ] Policies are reviewed on a cadence; changes are versioned.
- [ ] The portfolio readiness score is reported alongside every AI forecast.
