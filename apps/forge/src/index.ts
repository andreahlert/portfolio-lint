import Resolver from '@forge/resolver'
import { ALL_RULES, getRule, type LintConfigInput, type ProjectForecast } from '@portfolio-lint/core'
import { loadConfig, loadHistory, loadLatest, loadProjectViolations, projectFromReport, runScan, saveConfig, type StoredReport } from './scan'

const resolver = new Resolver()

resolver.define('getReport', async () => {
  const report = await loadLatest()
  const history = await loadHistory()
  return { report: report ?? null, history }
})

resolver.define('scanNow', async ({ payload }) => {
  const keys = Array.isArray(payload?.projectKeys) ? (payload.projectKeys as string[]) : undefined
  const report = await runScan(keys)
  return { report, history: await loadHistory() }
})

resolver.define('getProjectReport', async ({ payload }) => {
  const projectKey = String(payload?.projectKey ?? '')
  const report = await loadLatest()
  if (!report) return { project: null, scannedAt: null, violations: [], violationCount: 0, forecast: null }
  const project = projectFromReport(report, projectKey) ?? null
  const forecast = report.forecast?.projects.find((p) => p.key === projectKey) ?? null
  // Per-project list is complete up to its cap; the report-level list is only a cross-project sample.
  const violations = (await loadProjectViolations(projectKey)) ?? report.violations.filter((v) => v.projectKey === projectKey)
  const violationCount = project ? project.rules.reduce((n, r) => n + r.violations, 0) : 0
  return { project, scannedAt: report.scannedAt, violations, violationCount, forecast, historyWeeks: report.forecast?.historyWeeks }
})

resolver.define('listRules', async () =>
  ALL_RULES.map((r) => ({
    id: r.id,
    dimension: r.dimension,
    weight: r.weight,
    forecasts: r.forecasts,
    description: r.description,
    forecastImpact: r.forecastImpact,
    remediation: r.remediation,
  })),
)

resolver.define('getConfig', async () => loadConfig())

resolver.define('saveConfig', async ({ payload }) => {
  const config = (payload?.config ?? {}) as LintConfigInput
  await saveConfig(config)
  return config
})

export const handler = resolver.getDefinitions()

/** Daily scheduled scan of every project the app can see. */
export async function scheduled(): Promise<void> {
  await runScan()
}

interface ActionPayload {
  projectKey?: string
  ruleId?: string
}

function summarizeForecast(p: ProjectForecast) {
  return {
    project: p.key,
    status: p.status,
    confidence: p.confidence.level,
    limits: p.confidence.reasons,
    openItems: p.remaining.openItems,
    unestimatedItems: p.remaining.unestimatedItems,
    throughputPerWeek: p.throughput ? `${p.throughput.mean} ${p.throughput.unit}` : null,
    p50: p.finish?.p50.date ?? null,
    p85: p.finish?.p85.date ?? null,
    p95: p.finish?.p95.date ?? null,
    p85IfAllEstimated: p.finishIfEstimated?.p85.date ?? null,
    weeksOfUncertaintyFromMissingEstimates: p.scopeUncertaintyWeeks,
    commitment: p.commitment,
    criticalPath: p.criticalPath.items.map((i) => i.key),
    criticalPathCrossesProjects: p.criticalPath.crossProject,
    dependencyCycles: p.criticalPath.cycles,
    fixFirst: p.leverage.slice(0, 5).map((i) => ({ key: i.key, problems: i.issues })),
  }
}

function summarize(report: StoredReport, projectKey?: string) {
  const project = projectKey ? projectFromReport(report, projectKey) : undefined
  if (projectKey && !project) {
    return { found: false, message: `No project ${projectKey} in the latest report (scanned ${report.scannedAt}).` }
  }
  const scope = project ?? report
  return {
    found: true,
    scannedAt: report.scannedAt,
    scope: project ? `project ${project.key} (${project.name})` : 'whole portfolio',
    score: scope.score,
    grade: scope.grade,
    forecasts: scope.forecasts,
    dimensions: scope.dimensions,
    projects: report.projects.map((p) => ({ key: p.key, name: p.name, score: p.score, grade: p.grade, forecasts: p.forecasts })),
    remediation: (project?.remediation ?? report.remediation).slice(0, 5).map((r) => ({
      rule: r.ruleId,
      violations: r.violations,
      fix: r.remediation,
      impact: r.forecastImpact,
      examples: r.examples,
    })),
    violationCount: report.violationCount,
    deliveryForecast: report.forecast
      ? {
          method: `Monte Carlo on ${report.forecast.historyWeeks} weeks of throughput, ${report.forecast.simulations} runs per project, plus critical path over the dependency graph`,
          programmeFinishP85: report.forecast.programme.p85?.date ?? null,
          drivenBy: report.forecast.programme.drivenBy,
          projects: (project ? report.forecast.projects.filter((p) => p.key === project.key) : report.forecast.projects).map(summarizeForecast),
        }
      : null,
  }
}

/** Rovo action: latest score and remediation. */
export async function getPortfolioScore(payload: ActionPayload): Promise<unknown> {
  const report = await loadLatest()
  if (!report) return { found: false, message: 'No report yet. Open the Portfolio Readiness page in Jira and run a scan.' }
  return summarize(report, payload?.projectKey?.trim() || undefined)
}

/** Rovo action: rule explanation. */
export async function explainRule(payload: ActionPayload): Promise<unknown> {
  const id = String(payload?.ruleId ?? '').trim().toLowerCase()
  const rule = getRule(id)
  if (!rule) return { found: false, message: `Unknown rule "${id}". Known rules: ${ALL_RULES.map((r) => r.id).join(', ')}.` }
  return {
    found: true,
    id: rule.id,
    dimension: rule.dimension,
    weight: rule.weight,
    forecasts: rule.forecasts,
    description: rule.description,
    forecastImpact: rule.forecastImpact,
    remediation: rule.remediation,
  }
}
