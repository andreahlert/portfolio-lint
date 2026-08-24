# Portfolio AI-Readiness Framework

Version 0.1, August 2026. Reference implementation: this repository.

## Why this exists

Every major work management tool now ships AI forecasting: Jira Rovo agents, monday's AI Work Platform,
Planview and Planisware copilots. All of them read the same thing: the work items your teams typed in.
When 30% of stories have no estimate, half the epics have no due date and "in progress" items have not
moved in six weeks, the forecast is a confident number built on noise.

PMI's Pulse of the Profession 2026 reports that about a third of complex projects still fail to deliver
their intended benefits. Nobody is short of dashboards. What is missing is a way to answer one question
before trusting an AI forecast: **is our portfolio data good enough for this forecast, and if not, what do we fix first?**

The framework answers that question with a score you can compute from any tool, a label per forecast type,
and a prioritized remediation list.

## Definition

**Portfolio AI-Readiness** is the degree to which a portfolio's work item data supports reliable
schedule, capacity and scope forecasts.

It is measured on a 0 to 100 scale, per project and for the whole portfolio, by a deterministic set of rules.
No model, no sampling, no black box. Two people running the same rules on the same data get the same score.

## Four dimensions

| Dimension | Question it answers | Typical failures |
|---|---|---|
| Completeness | Are the fields a forecast needs filled in? | Missing estimate, assignee, due date |
| Freshness | Does the data reflect reality today? | Stale in-progress items, zombie backlog, overdue items nobody moved |
| Consistency | Does the data agree with itself? | Done without resolution, 40-point stories next to 3-point ones, 7 items in progress for one person |
| Traceability | Can an item be connected to a deliverable? | Orphan tasks, placeholder epics, links to items that do not exist |

## Three forecast types

Each rule declares which forecasts it degrades. A forecast is only as reliable as its weakest input.

| Forecast | Depends on rules |
|---|---|
| Schedule (when will it land) | missing-due-date, broken-dependency, stale-in-progress, overdue-open, status-resolution-mismatch |
| Capacity (can the team absorb it) | missing-estimate, missing-assignee, overallocated-assignee, estimate-outlier |
| Scope (what is actually in) | missing-estimate, missing-parent, epic-without-children, stale-open |

Labels: **reliable** (>= 75), **degraded** (>= 50), **unreliable** (< 50), **n/a** (no applicable items).

## Scoring

1. **Rule score** = `100 * (1 - violations / applicable)`. A rule with zero applicable items returns `null` and is skipped.
2. **Dimension score** = weighted mean of its rules (weights 1 to 3, declared per rule).
3. **Project score** = mean of the four dimensions.
4. **Portfolio score** = mean of project scores weighted by item count.
5. **Forecast label** = minimum rule score among the rules that feed that forecast.
6. **Grade**: A >= 90, B >= 75, C >= 60, D >= 40, F below.
7. **Remediation priority** = `(100 - rule score) * weight * applicable`, summed across projects. Highest first, with up to five example items.

Why the minimum for forecast labels: a schedule forecast with perfect due dates but 40% stale in-progress
items is not "mostly fine", it is wrong about where the work is right now.

## Canonical model

The framework is tool-agnostic. Every connector maps its source to this shape:

```
Portfolio { name, scannedAt, projects[] }
Project   { key, name, source, estimateUnit (points|hours), items[], people[] }
WorkItem  { id, key, title, type (epic|story|task|bug|other),
            statusCategory (todo|in_progress|done), assigneeId?, estimate?,
            startDate?, dueDate?, parentId?, dependsOn[], createdAt, updatedAt, resolvedAt?, labels[] }
```

Jira, Azure DevOps, Asana, monday, Linear and a spreadsheet can all be expressed in it.
The rules never look at anything outside this model, so a new connector inherits every rule for free.

## Rule catalogue

Twelve rules ship in version 0.1. See [rules.md](rules.md) for the generated reference (dimension, weight,
forecasts, impact, remediation). Thresholds are configurable: stale in progress (14 days), stale open (90 days),
WIP per person (3), outlier factor (5x median).

## How to adopt it

1. **Baseline.** Scan the portfolio once (`portfolio-lint scan`). Record score, grade and forecast labels.
2. **Fix the top three.** The remediation list is sorted by impact. Each entry names the items and the workflow change that prevents recurrence.
3. **Gate.** Add `--fail-under` to a weekly job or CI. Treat a drop below the threshold like a failing build.
4. **Trend.** Keep the JSON reports. Readiness over time is a better PMO KPI than on-time percentage, because it is leading, not lagging.
5. **Then trust the forecast.** A forecast labelled reliable is one where the inputs are at least present, current and consistent. It still needs judgment.

## Relationship to existing practice

- PMBOK Guide 8th edition (2025) treats data quality and AI as project management concerns. This framework gives the "Measurement" and "Planning" domains a concrete, computable metric.
- DORA and SPACE measure engineering flow; this measures whether the planning layer above it can be forecast at all.
- Jira "hygiene" apps score individual issues or admin configuration. This framework scores the portfolio and maps every finding to the forecast it breaks.

## Extending

- **New rule**: implement `Rule` (`id, dimension, weight, forecasts, evaluate(project, ctx)`), add it to `ALL_RULES`, add a test. The doc and CLI pick it up automatically.
- **New connector**: map the source to the canonical model. Nothing else changes.
- **New forecast type**: add it to `FORECAST_TYPES` and tag the relevant rules.

## Limitations

- Rules measure data quality, not plan quality. A complete, fresh, consistent plan can still be a bad plan.
- Thresholds are defaults from consulting practice, not research constants. Calibrate per organisation.
- Cross-project dependencies are only visible when both projects are in the same scan.
- Version 0.1 has no rule for capacity supply (availability, leave). It scores demand-side data only.
