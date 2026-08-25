import Resolver from '@forge/resolver'
import {
  ALL_RULES,
  CONFIG_FIELDS,
  ConfigError,
  DEFAULT_CONFIG,
  FORECAST_FIELDS,
  getRule,
  validateConfig,
  validateProjectOverride,
  type LintConfigInput,
  type ProjectForecast,
} from '@portfolio-lint/core'
import { jqlReadiness, removeRuleFromIssue, syncFields } from './fields'
import { applyFix, FixError, fixOptions, type FixAction, type FixOptionKind } from './fixes'
import { listProjectKeys } from './jiraClient'
import { isJiraAdmin, isProjectAdmin } from './permissions'
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

const ruleMeta = () =>
  ALL_RULES.map((r) => ({
    id: r.id,
    dimension: r.dimension,
    weight: r.weight,
    forecasts: r.forecasts,
    description: r.description,
    forecastImpact: r.forecastImpact,
    remediation: r.remediation,
    settings: CONFIG_FIELDS.filter((f) => f.rules.includes(r.id)).map((f) => f.key),
  }))

resolver.define('listRules', async () => ruleMeta())

/** Everything the in-app Docs tab needs: rule metadata, settings metadata and the stored config. */
resolver.define('getDocs', async () => ({
  rules: ruleMeta(),
  fields: CONFIG_FIELDS,
  forecastFields: FORECAST_FIELDS,
  defaults: DEFAULT_CONFIG,
  config: await loadConfig(),
}))

async function knownProjects(): Promise<Array<{ key: string; name: string }>> {
  const report = await loadLatest()
  if (report) return report.projects.map((p) => ({ key: p.key, name: p.name }))
  const keys = await listProjectKeys()
  return keys.map((key) => ({ key, name: key }))
}

resolver.define('getSettings', async ({ payload }) => {
  const projectKey = typeof payload?.projectKey === 'string' && payload.projectKey ? (payload.projectKey as string) : undefined
  const [config, canEdit, projects] = await Promise.all([
    loadConfig(),
    projectKey ? isProjectAdmin(projectKey) : isJiraAdmin(),
    knownProjects(),
  ])
  return {
    config,
    defaults: DEFAULT_CONFIG,
    fields: CONFIG_FIELDS,
    forecastFields: FORECAST_FIELDS,
    rules: ruleMeta().map((r) => ({ id: r.id, dimension: r.dimension, weight: r.weight, description: r.description })),
    canEdit,
    projects,
  }
})

const userMessage = (e: unknown): string => (e instanceof ConfigError || e instanceof FixError ? e.message : String(e))

/** Portfolio-wide settings. Jira admins only; validated with the same rules as the CLI config file. */
resolver.define('saveSettings', async ({ payload }) => {
  if (!(await isJiraAdmin())) return { ok: false, error: 'Only Jira administrators can change portfolio settings.' }
  try {
    const current = await loadConfig()
    const next = validateConfig(payload?.config ?? {}, 'settings')
    // The global form never edits per-project overrides; keep whatever project admins saved.
    if (current.projects) next.projects = current.projects
    await saveConfig(next)
    return { ok: true, config: next }
  } catch (e) {
    return { ok: false, error: userMessage(e) }
  }
})

/** One project's overrides. Project admins (or Jira admins) only. An empty override removes the entry. */
resolver.define('saveProjectSettings', async ({ payload }) => {
  const projectKey = String(payload?.projectKey ?? '')
  if (!projectKey) return { ok: false, error: 'Missing project key.' }
  if (!(await isProjectAdmin(projectKey))) return { ok: false, error: `Only administrators of ${projectKey} can change its settings.` }
  try {
    const override = validateProjectOverride(payload?.override ?? {}, `settings for ${projectKey}`)
    const current = await loadConfig()
    const projects = { ...(current.projects ?? {}) }
    if (Object.keys(override).length === 0) delete projects[projectKey]
    else projects[projectKey] = override
    const next: LintConfigInput = { ...current }
    if (Object.keys(projects).length === 0) delete next.projects
    else next.projects = projects
    await saveConfig(next)
    return { ok: true, config: next }
  } catch (e) {
    return { ok: false, error: userMessage(e) }
  }
})

/** Options for the inline fix dialog: open epics, available transitions, existing links. Read as the user. */
resolver.define('getFixOptions', async ({ payload }) => {
  try {
    const kinds = (Array.isArray(payload?.kinds) ? payload.kinds : []) as FixOptionKind[]
    return { ok: true, options: await fixOptions(String(payload?.issueKey ?? ''), String(payload?.projectKey ?? ''), kinds) }
  } catch (e) {
    return { ok: false, error: userMessage(e) }
  }
})

/** Applies one fix to one issue, as the current user, so Jira permissions and history stay honest. */
resolver.define('fixIssue', async ({ payload }) => {
  try {
    const issueKey = String(payload?.issueKey ?? '')
    const result = await applyFix(issueKey, (payload?.action ?? {}) as FixAction)
    if (typeof payload?.ruleId === 'string' && payload.ruleId) await removeRuleFromIssue(issueKey, payload.ruleId)
    return { ok: true, note: result.note }
  } catch (e) {
    return { ok: false, error: userMessage(e) }
  }
})

export const handler = resolver.getDefinitions()

/** Async events consumer that writes the Readiness custom fields (see fields.ts). */
export { syncFields, jqlReadiness }

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
