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
| Schedule (when will it land) | missing-due-date, broken-dependency, dependency-cycle, stale-in-progress, overdue-open, status-resolution-mismatch |
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

Two rules of credibility: a rule with nothing to check never feeds a label (a project without dependencies
cannot be "unreliable" on dependencies), and every rule looks at the whole scan, not one project, so a link
into a sibling project is a real link.

## The delivery forecast

The score says whether a forecast can be trusted. The framework also produces the forecast, so the two can be
read together: "p85 is April, low confidence, and 31 of those weeks are missing estimates".

1. **Throughput**: completed work per week over the last N weeks (default 12) from resolution dates. Points when at least half of the completed items carry an estimate, else items.
2. **Monte Carlo**: each run draws a random week of throughput from that history until the open work is consumed. Unestimated items draw a size from the project's own estimate distribution. p50, p85 and p95 are the weeks by which 50%, 85% and 95% of runs finish. p85 is the date to commit to.
3. **Scope uncertainty**: the same simulation with every unestimated item pinned to the project's median estimate. The p85 difference is the uncertainty that missing estimates alone add. That is the number to show the team before an estimation session.
4. **Critical path**: the longest chain by estimate through the open items of the whole scan, so a chain that crosses project boundaries is followed. Unestimated items on it count at the project median. Cycles are reported as such; nothing downstream of a cycle can be scheduled.
5. **Commitment**: p85 against the latest due date of an open epic. on-track (p85 before it), at-risk (p50 before, p85 after), late (p50 after).
6. **Confidence**: high, medium or low from history length, share of unestimated work, gaps on the critical path, cycles and throughput variance. Every downgrade carries its reason.
7. **Fix first**: items on the critical path with data problems, then in-progress items, ranked by how much each problem distorts the dates (missing estimate > missing assignee, stale > overdue).

The simulation is seeded, so two runs on the same data agree. It is a throughput model, not a plan: it says
when the current team finishes the current backlog at the current pace. Adding people or cutting scope
changes the inputs, not the method.

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

Thirteen rules ship in version 0.1. See [rules.md](rules.md) for the generated reference (dimension, weight,
forecasts, impact, remediation). Thresholds are configurable per portfolio and per project: stale in progress
(14 days), stale open (90 days), outlier factor (5x median). The WIP limit adapts to the team: baseline 3 per
person, raised to 2x the team median once three or more people are in progress, capped at 10, so the rule
finds the outlier in a busy team instead of flagging everyone.

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
- Cross-project dependencies are only visible when both projects are in the same scan. Links to projects outside the scan count as broken.
- The forecast needs resolution dates. Work that is deleted or bulk-closed without a resolution date leaves no throughput to sample.
- Version 0.1 has no rule for capacity supply (availability, leave). It scores demand-side data only.
