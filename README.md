# portfolio-lint

[![CI](https://github.com/andreahlert/portfolio-lint/actions/workflows/ci.yml/badge.svg)](https://github.com/andreahlert/portfolio-lint/actions/workflows/ci.yml) MIT licensed.

Lint your project portfolio before you let AI forecast it.

`portfolio-lint` is the reference implementation of the **Portfolio AI-Readiness Framework**:
twelve deterministic rules that score how ready a portfolio's data is for schedule, capacity and scope
forecasting, and tell you what to fix first. It runs on Jira Cloud (CLI and native Forge app) and on any
tool that can export CSV.

```
Portfolio readiness: 85.4 / 100  grade B

forecast  score  label
--------  -----  --------
schedule  75.0   reliable
capacity  68.8   degraded
scope     77.1   reliable

Remediation (highest impact first)
1  missing-estimate            2  Run an estimation session for the listed items...   ALPHA-15, BETA-15
2  missing-parent              2  Link each listed item to its epic...                ALPHA-16, BETA-18
3  status-resolution-mismatch  2  Fix the workflow so the done transition sets...     ALPHA-20, ALPHA-22
```

## Why

Jira, monday, Planview and Planisware all ship AI forecasting now. They all read the same work items.
If a third of the stories have no estimate and half the epics have no date, the forecast is confident noise.
Existing "hygiene" apps score individual issues or admin configuration. Nothing scores the portfolio,
across tools, and maps each finding to the forecast it breaks. This does.

Read the [framework](docs/framework.md), the [rule catalogue](docs/rules.md) and the
[agent governance guide](docs/governance.md) for PMOs running AI agents on portfolio data.

## Quick start

Requires Node 20 or newer.

```bash
git clone https://github.com/andreahlert/portfolio-lint
cd portfolio-lint
npm install
npm run build
npm run scan:example          # scans examples/sample-portfolio.csv
```

### Scan Jira Cloud

```bash
export JIRA_URL=https://acme.atlassian.net
export JIRA_EMAIL=you@acme.com
export JIRA_TOKEN=...          # https://id.atlassian.com/manage-profile/security/api-tokens
node packages/cli/dist/bin.js scan --source jira --projects ALPHA,BETA --format md --out readiness.md
```

### Scan a CSV export

Any tool works if you can produce the columns in [docs/csv-format.md](docs/csv-format.md).

```bash
node packages/cli/dist/bin.js scan --file export.csv --format json --out readiness.json
```

### Try it on a realistic portfolio

`examples/erp-portfolio.csv` is a synthetic SAP-style ERP programme: 8 workstreams (finance, supply chain, manufacturing, HR, integrations, data migration, analytics, PMO), about 3,600 items, 3,300 dependency links (some across projects), and hygiene noise that differs per workstream. It is generated, deterministic and free of real data.

```bash
npm run scan:erp                     # scan it
npm run gen:erp                      # regenerate (see scripts/gen-erp-portfolio.mjs for --seed, --scale, --now)
```

`scripts/seed-jira-from-csv.py` loads any portfolio-lint CSV into a Jira Cloud site (projects, epics, links, transitions) to try the Forge app at scale.

### Gate it

```bash
node packages/cli/dist/bin.js scan --file export.csv --fail-under 75   # exit 1 when below
```

Exit codes: `0` ok, `1` score below `--fail-under`, `2` usage, connection or format error.

### Options

| Option | Meaning |
|---|---|
| `--source jira\|csv` | Defaults to csv when `--file` is given |
| `--format table\|md\|json` | Default table |
| `--out <path>` | Write the report to a file |
| `--config <path>` | Thresholds, defaults to `.portfoliolintrc.json` if present |
| `--fail-under <score>` | CI gate |
| `--now <iso>` | Freeze time for reproducible runs |
| `--name <name>` | Portfolio name in the report |

`portfolio-lint rules` lists the rules; `rules --format md` regenerates `docs/rules.md`.

### Config file

```json
{
  "staleInProgressDays": 14,
  "staleOpenDays": 90,
  "maxWipPerPerson": 3,
  "outlierFactor": 5,
  "disabledRules": ["estimate-outlier"]
}
```

## How scoring works

- Rule score = `100 * (1 - violations / applicable)`; rules with nothing applicable are skipped.
- Dimension (completeness, freshness, consistency, traceability) = weighted mean of its rules.
- Project = mean of dimensions. Portfolio = item-weighted mean of projects.
- Forecast label (schedule, capacity, scope) = minimum score among the rules that feed it: reliable >= 75, degraded >= 50, unreliable below.
- Remediation priority = `(100 - score) * weight * applicable`, so a heavy rule failing on many items rises to the top.

Full detail in [docs/framework.md](docs/framework.md).

## Jira app (Forge)

`apps/forge` is a native Jira Cloud app: portfolio and project pages, a daily scheduled scan, and a
Rovo agent ("Portfolio Readiness Advisor") that answers "what should we fix first" from the latest report.
Data never leaves Atlassian. See [apps/forge/README.md](apps/forge/README.md).

![Portfolio Readiness page in Jira: score 81.7 grade B, forecast reliability per project, remediation list](docs/img/forge-global-page.jpg)

Screenshot from a Jira Cloud dev site (Portuguese locale) with two seeded projects; the mapper reads issue type hierarchy levels, so localized sites work out of the box.

## Repository

```
packages/core   rules, scorer, canonical model, CSV parser, Jira mapper (no I/O)
packages/cli    portfolio-lint command: Jira connector, renderers, config
apps/forge      Jira Cloud app (UI Kit, scheduled trigger, Rovo agent)
docs/           framework, rules, csv-format, governance, design
examples/       sample portfolio with planted violations, generated ERP programme (3.6k items)
scripts/        ERP portfolio generator, Jira seeder
```

```bash
npm test -ws                         # core + cli tests
npm run typecheck -w portfolio-lint-forge
```

## Roadmap

- Connectors: Azure DevOps, Asana, Linear.
- Capacity supply rules (availability, leave) once a people source exists.
- Settings page in the Forge app; per-project thresholds.
- Readiness badge for READMEs and portfolio dashboards.

## License

MIT. Built by [André Ahlert](https://www.linkedin.com/in/ahlert).
