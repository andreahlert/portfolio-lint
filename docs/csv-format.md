# CSV input format

`portfolio-lint scan --source csv --file <path>` reads one CSV with one row per work item.
Use it for tools without a connector yet (Asana, Azure DevOps, monday, Excel exports).

## Columns

Header row required. Column order is free. Names are case-insensitive.

| Column | Required | Values |
|---|---|---|
| `project_key` | yes | Short key, groups rows into projects (`ALPHA`) |
| `project_name` | no | Display name, first row per project wins |
| `key` | yes | Unique item key inside the project (`ALPHA-12`) |
| `title` | yes | Free text |
| `type` | yes | `epic`, `story`, `task`, `bug`, anything else becomes `other` |
| `status` | no | Free text status name |
| `status_category` | yes | `todo`, `in_progress`, `done` (also accepts `new`, `open`, `indeterminate`, `closed`, `completed`) |
| `assignee_id` | no | Stable id of the person |
| `assignee_name` | no | Display name, used in messages |
| `estimate` | no | Number (points or hours) |
| `estimate_unit` | no | `points` or `hours`, first row per project wins |
| `start_date` | no | ISO date |
| `due_date` | no | ISO date |
| `parent_key` | no | `key` of the epic or parent item in the same project |
| `depends_on` | no | Semicolon-separated `key`s this item is blocked by |
| `created_at` | yes | ISO date or datetime |
| `updated_at` | yes | ISO date or datetime |
| `resolved_at` | no | ISO date or datetime |
| `labels` | no | Semicolon-separated |

Rows with a missing required value or an unparseable `created_at`/`updated_at` are skipped
with a warning on stderr. Invalid optional dates are ignored with a warning.

## Sample

`examples/sample-portfolio.csv` has two synthetic projects (33 items) with planted violations.
With `--now 2026-08-24T00:00:00Z` and default config the expected counts are:

| Rule | ALPHA | BETA |
|---|---|---|
| missing-estimate | 1 (ALPHA-15) | 1 (BETA-15) |
| missing-assignee | 1 (ALPHA-14) | 0 |
| missing-due-date | 1 (ALPHA-2) | 0 |
| missing-parent | 1 (ALPHA-16) | 1 (BETA-18) |
| epic-without-children | 1 (ALPHA-3) | 0 |
| broken-dependency | 1 (ALPHA-19) | 0 |
| stale-in-progress | 1 (ALPHA-14) | 0 |
| stale-open | 2 (ALPHA-3, ALPHA-24) | 0 |
| overdue-open | 1 (ALPHA-17) | 0 |
| overallocated-assignee | 1 (Ana Souza) | 0 |
| estimate-outlier | 1 (ALPHA-18) | 0 |
| status-resolution-mismatch | 2 (ALPHA-20, ALPHA-22) | 0 |

Total: 16 violations.

## Larger example

`examples/erp-portfolio.csv` is a generated ERP programme (8 projects, about 3,600 rows) with
dependency chains inside and across projects. Regenerate it with `npm run gen:erp`; the
generator accepts `--seed`, `--scale` and `--now`. Cross-project `depends_on` keys are kept
as given and surface as `broken-dependency`, which is how the rule treats any blocker outside
the item's project.
