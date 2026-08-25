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
Use `npx forge storage` or the `saveConfig` resolver from a future settings page. Defaults:
stale in progress 14 days, stale open 90 days, max WIP 3, outlier factor 5.

## Development notes

- `src/index.ts`: resolver (`getReport`, `scanNow`, `getProjectReport`, `listRules`, `getConfig`, `saveConfig`), scheduled handler, Rovo actions.
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
