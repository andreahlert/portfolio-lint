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
| schedule | missing-due-date, stale-in-progress, overdue-open, broken-dependency, dependency-cycle, status-resolution-mismatch |
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

## 5. Rules (13)

Each rule: `id`, `dimension`, `weight` (1..3), `description`, `forecastImpact`,
`remediation`, `evaluate(project, ctx) -> { applicable: number; violations: Violation[] }` where
`ctx = { config, now, portfolioItems }` and `portfolioItems` is every item in the scan keyed by id.
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
| broken-dependency | Consistency | 2 | items with dependsOn | any dependsOn id not in the scan (any project) |
| dependency-cycle | Consistency | 2 | items with dependsOn | item on a cycle of dependsOn links (Tarjan SCC) |
| stale-in-progress | Freshness | 3 | in_progress | updatedAt older than `staleInProgressDays` (14) |
| stale-open | Freshness | 1 | todo | updatedAt older than `staleOpenDays` (90) |
| overdue-open | Freshness | 2 | not done, has dueDate | dueDate < now |
| overallocated-assignee | Consistency | 2 | people with >= 1 in_progress item | in_progress count > limit, limit = `maxWipPerPerson` (3) for < `wipAdaptiveMinPeople` (3) people, else `min(wipHardLimit 10, max(maxWipPerPerson, wipOutlierFactor 2 x team median))` |
| estimate-outlier | Consistency | 1 | non-epic with estimate, when >= 5 estimated | estimate > `outlierFactor` (5) x median |
| status-resolution-mismatch | Consistency | 2 | all items | done without resolvedAt, or resolvedAt without done |

Config (`.portfoliolintrc.json`, all optional): `staleInProgressDays`, `staleOpenDays`,
`maxWipPerPerson`, `wipOutlierFactor`, `wipHardLimit`, `wipAdaptiveMinPeople`, `outlierFactor`,
`now` (ISO, for reproducible runs), `disabledRules`, `projects` (per-key overrides of the above;
project `disabledRules` union with the portfolio list), `forecast` (`enabled`, `historyWeeks`,
`simulations`, `seed`). `configForProject(config, key)` resolves the per-project view; a rule
disabled for one project reports `applicable = 0` there.

## 6. Scoring

- Dimension score = weighted mean of its rule scores (skip rules with applicable = 0).
- Project score = mean of dimension scores (skip empty dimensions).
- Portfolio score = mean of project scores weighted by item count.
- Forecast readiness per project and per portfolio as in section 3.
- Report object: `{ portfolio, scannedAt, score, grade, dimensions, forecasts, projects: [{ key, score, grade, dimensions, forecasts, rules: [{ id, applicable, violations, score }] }], violations[], remediation[] }`.
- Remediation list = rules sorted by `(100 - score) * weight * applicable` desc, each with
  rule remediation text and top 5 example item keys.
- `report.forecast` (when `config.forecast.enabled`): see section 6a.

## 6a. Delivery forecast (`forecast.ts`)

Pure function `forecastPortfolio(portfolio, config, now) -> ForecastReport`.

- Throughput per project: done non-epic items bucketed by `resolvedAt` week over `historyWeeks`.
  Unit `points` when >= 50% of them have an estimate (and the project has an estimate pool), else `items`.
- Open work: non-epic, not done. `knownWork` = sum of estimates (points) or count (items).
- Simulation (mulberry32 PRNG, seed + project index, `simulations` runs): remaining = knownWork +
  one sample from the project's estimate pool per unestimated item; subtract a random history
  week until <= 0; cap 520 weeks. p50/p85/p95 by rank. `finishIfEstimated` pins unestimated
  items to the median estimate; `scopeUncertaintyWeeks = p85 - p85(pinned)`.
- Critical path: DAG over all open items in the scan, node weight = estimate or project median
  (1 in items mode). Longest path by memoized DFS over `dependsOn`; back edges recorded as cycles
  and skipped. Per project: the node with the largest path weight and its chain (may cross projects,
  may be a single heavy item).
- Commitment: latest `dueDate` among open epics vs p85/p50 dates.
- Confidence: high unless downgraded (activeWeeks < 4 low; unestimated share > 30% low, > 10%
  medium; items mode with unestimated work medium; unestimated on path medium; cycle low;
  throughput cv > 1 medium; p95 at cap low). Reasons kept as strings.
- Leverage: path items with issues, then in-progress items with issues, weighted
  missing-estimate 3, missing-assignee 2, stale-in-progress 2, overdue-open 1, top 10.
- Programme: max p85 across projects and the project that drives it.

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
  `scorer.ts`, `report.ts`, `forecast.ts` (Monte Carlo + critical path),
  `csv.ts` (parse canonical CSV text into Portfolio),
  `config.ts` (defaults + merge + per-project resolution).
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
