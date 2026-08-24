# portfolio-lint: design spec

Date: 2026-08-24
Status: approved in conversation (design presented, user said "develop")

## 1. Purpose

Reference implementation of the **Portfolio AI-Readiness Framework**: measure, on real
project data, whether a portfolio's data can support AI-driven forecasting (schedule,
capacity, scope) and agent-driven execution. Output a score, the violations behind it,
what forecast each violation breaks, and a deterministic remediation list.

Positioning (from research 2026-08-24): Jira hygiene apps check admin configuration;
PMO "AI readiness" assessments are questionnaires; agent-governance frameworks are
generic. Nothing measures portfolio delivery data against forecast readiness, cross-tool,
with a named framework and open code. This project fills that gap.

## 2. Non-goals (MVP)

- Asana / Azure DevOps connectors (CSV covers cross-tool in MVP; Asana is next).
- LLM-generated remediation (rules carry deterministic remediation text; LLM later).
- Marketplace submission (app is built and lintable; deploy needs an Atlassian login).
- Editing Jira data. Read-only always.

## 3. Framework

Four dimensions, each a weighted set of rules. Score 0 to 100 per rule, dimension,
project, portfolio.

| Dimension | Question it answers |
|---|---|
| Completeness | Are the fields a forecast needs actually filled? |
| Freshness | Does the data reflect reality today? |
| Consistency | Do values agree with each other and with team norms? |
| Traceability | Can work be rolled up to epics, owners, dependencies? |

Three forecast types, each mapped to the rules it depends on. Forecast readiness label =
min score among its rules: `reliable` (>= 75), `degraded` (>= 50), `unreliable` (< 50).

| Forecast | Depends on rules |
|---|---|
| schedule | missing-due-date, stale-in-progress, overdue-open, broken-dependency, status-resolution-mismatch |
| capacity | missing-estimate, missing-assignee, overallocated-assignee, estimate-outlier |
| scope | missing-parent, epic-without-children, stale-open, missing-estimate |

Grades: A >= 90, B >= 75, C >= 60, D >= 40, F < 40.

Governance chapter (doc only in MVP): agent policy template, RACI for agents in a PMO,
audit-log spec, mapping to PMBOK 8 domains and to Canada's Directive on Automated
Decision-Making.

## 4. Canonical model (packages/core)

```ts
type StatusCategory = 'todo' | 'in_progress' | 'done'
type ItemType = 'epic' | 'story' | 'task' | 'bug' | 'other'

interface Person { id: string; name: string }

interface WorkItem {
  id: string; key: string; title: string
  type: ItemType; status: string; statusCategory: StatusCategory
  assigneeId?: string
  estimate?: number            // points or hours, unit per project
  startDate?: string; dueDate?: string   // ISO date
  parentId?: string            // epic or parent item id
  dependsOn: string[]          // ids this item is blocked by
  createdAt: string; updatedAt: string; resolvedAt?: string
  labels: string[]
}

interface Project {
  id: string; key: string; name: string
  source: 'jira' | 'csv' | 'asana' | 'other'
  estimateUnit: 'points' | 'hours' | 'unknown'
  items: WorkItem[]; people: Person[]
}

interface Portfolio { name: string; scannedAt: string; projects: Project[] }
```

## 5. Rules (12)

Each rule: `id`, `dimension`, `weight` (1..3), `description`, `forecastImpact`,
`remediation`, `evaluate(project, config) -> { applicable: number; violations: Violation[] }`.
Violation: `{ ruleId, projectKey, itemKey?, message }`.
Rule score = `100 * (1 - violations/applicable)`; rule with `applicable = 0` is skipped
(not counted) at aggregation.

| id | dimension | weight | applicable population | violation |
|---|---|---|---|---|
| missing-estimate | Completeness | 3 | non-epic, not done | estimate undefined or 0 |
| missing-assignee | Completeness | 2 | in_progress | no assigneeId |
| missing-due-date | Completeness | 2 | epics, not done | no dueDate |
| missing-parent | Traceability | 2 | non-epic | no parentId |
| epic-without-children | Traceability | 1 | epics, not done | zero items with parentId = epic |
| broken-dependency | Consistency | 2 | items with dependsOn | any dependsOn id not in project |
| stale-in-progress | Freshness | 3 | in_progress | updatedAt older than `staleInProgressDays` (14) |
| stale-open | Freshness | 1 | todo | updatedAt older than `staleOpenDays` (90) |
| overdue-open | Freshness | 2 | not done, has dueDate | dueDate < now |
| overallocated-assignee | Consistency | 2 | people with >= 1 in_progress item | in_progress count > `maxWipPerPerson` (3) |
| estimate-outlier | Consistency | 1 | non-epic with estimate, when >= 5 estimated | estimate > `outlierFactor` (5) x median |
| status-resolution-mismatch | Consistency | 2 | all items | done without resolvedAt, or resolvedAt without done |

Config (`.portfoliolintrc.json`, all optional): `staleInProgressDays`, `staleOpenDays`,
`maxWipPerPerson`, `outlierFactor`, `now` (ISO, for reproducible runs), `disabledRules`.

## 6. Scoring

- Dimension score = weighted mean of its rule scores (skip rules with applicable = 0).
- Project score = mean of dimension scores (skip empty dimensions).
- Portfolio score = mean of project scores weighted by item count.
- Forecast readiness per project and per portfolio as in section 3.
- Report object: `{ portfolio, scannedAt, score, grade, dimensions, forecasts, projects: [{ key, score, grade, dimensions, forecasts, rules: [{ id, applicable, violations, score }] }], violations[], remediation[] }`.
- Remediation list = rules sorted by `(100 - score) * weight * applicable` desc, each with
  rule remediation text and top 5 example item keys.

## 7. Packages

npm workspaces, TypeScript (ESM), vitest.

```
portfolio-lint/
  package.json                 workspaces: packages/*, apps/*
  packages/core                model, rules, scorer, report, csv parser (no IO)
  packages/cli                 bin: portfolio-lint. commands: scan, rules. connectors: jira, csv. renderers: table, md, json
  apps/forge                   Atlassian Forge app (Jira Cloud): globalPage, projectPage, scheduledTrigger, storage, rovo:agent
  docs/                        design.md, framework.md, rules.md (generated), governance.md, csv-format.md
  examples/                    sample-portfolio.csv (synthetic, with known violations)
```

### packages/core
- `model.ts`, `rules/*.ts` (one file per rule), `rules/index.ts` (registry),
  `scorer.ts`, `report.ts`, `csv.ts` (parse canonical CSV text into Portfolio),
  `config.ts` (defaults + merge).
- Pure functions. No network, no fs.

### packages/cli
- `portfolio-lint scan --source csv --file examples/sample-portfolio.csv [--format table|md|json] [--out path] [--config path]`
- `portfolio-lint scan --source jira --url https://x.atlassian.net --email e --token t --projects KEY1,KEY2`
  (env fallback: `JIRA_URL`, `JIRA_EMAIL`, `JIRA_TOKEN`)
- `portfolio-lint rules` prints the rule catalogue (also used to generate docs/rules.md).
- Jira connector: REST v3, `POST /rest/api/3/search/jql` with pagination (`nextPageToken`),
  story points field detected via `GET /rest/api/3/field` (name matches /story point/i),
  fallback `timeoriginalestimate` seconds to hours. Maps: issuetype (Epic -> epic, Story ->
  story, Task/Sub-task -> task, Bug -> bug), statusCategory key (new -> todo,
  indeterminate -> in_progress, done -> done), parent, issuelinks where inward type is
  "is blocked by" -> dependsOn.
- Exit code 0 always on successful scan (score is information, not a gate) unless
  `--fail-under <n>` is given and portfolio score is lower.

### apps/forge
- manifest.yml: `jira:globalPage` (portfolio dashboard), `jira:projectPage` (project
  detail), `scheduledTrigger` (daily scan, stores latest report in Forge storage),
  `rovo:agent` "Portfolio Readiness Advisor" with two `action`s: `getPortfolioScore`,
  `explainRule`. Scopes: `read:jira-work`, `storage:app`.
- Resolver fetches issues via `@forge/api` `asApp()` with the same mapping as the CLI
  connector (shared mapper in core: `mapJiraIssue`). Runs core scoring. UI Kit
  (`@forge/react`) renders score, dimension table, top violations.
- Not deployed in this session. README has `forge register/deploy/install` steps.
  `forge lint` must pass.

## 8. Error handling

- Jira auth or network error: CLI exits 2 with the HTTP status and a one-line hint.
- CSV: missing required column -> exit 2 listing required columns. Bad date -> row
  skipped with a warning to stderr, count reported.
- Core never throws on data shape; rules treat undefined as missing.

## 9. Testing

- core: one test file per rule with a minimal fixture (positive + negative case), scorer
  tests (weights, skip applicable=0, grades, forecast labels), csv parser tests.
- cli: csv end-to-end on `examples/sample-portfolio.csv` asserting known counts; jira
  mapper test on a fixture JSON of a search response.
- forge: `forge lint` clean; resolver logic is core + mapper, covered above.

## 10. Acceptance (MVP done when)

1. `npm test` green across workspaces.
2. `npx portfolio-lint scan --source csv --file examples/sample-portfolio.csv` prints a
   table with portfolio score, grade, 4 dimensions, 3 forecast labels, top remediation.
3. `--format md` produces a report suitable for pasting in Confluence/LinkedIn.
4. `portfolio-lint rules` output equals `docs/rules.md`.
5. `apps/forge` passes `forge lint`.
6. docs: framework.md, governance.md, csv-format.md written, README links all.
