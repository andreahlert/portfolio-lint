import { storage } from '@forge/api'
import { lintPortfolio, type LintConfig, type ProjectReport, type Report, type Violation } from '@portfolio-lint/core'
import { fetchPortfolio, listProjectKeys } from './jiraClient'

export const KEY_LATEST = 'report:latest'
export const KEY_CONFIG = 'config'
export const KEY_HISTORY = 'history'
const KEY_VIOLATIONS_PREFIX = 'report:violations:'
const HISTORY_LIMIT = 30

export interface HistoryPoint {
  scannedAt: string
  score: number
  grade: string
}

/**
 * Stored report is trimmed: the full violations list can exceed Forge storage value limits on big sites.
 * `violations` holds a sample spread evenly across projects; each project's own list is stored under
 * its own key (see loadProjectViolations) so project pages stay complete up to MAX_STORED_PER_PROJECT.
 */
export interface StoredReport extends Omit<Report, 'violations'> {
  violationCount: number
  violations: Report['violations']
}

const MAX_STORED_VIOLATIONS = 500
const MAX_STORED_PER_PROJECT = 500

function groupByProject(violations: Violation[]): Map<string, Violation[]> {
  const byProject = new Map<string, Violation[]>()
  for (const v of violations) {
    const list = byProject.get(v.projectKey)
    if (list) list.push(v)
    else byProject.set(v.projectKey, [v])
  }
  return byProject
}

/** Round-robin across projects so a big project cannot crowd the others out of the stored sample. */
export function sampleAcrossProjects(violations: Violation[], limit: number): Violation[] {
  if (violations.length <= limit) return violations
  const queues = [...groupByProject(violations).values()]
  const out: Violation[] = []
  let cursor = 0
  while (out.length < limit) {
    const q = queues[cursor % queues.length]
    if (q && q.length > 0) out.push(q.shift() as Violation)
    cursor += 1
  }
  return out
}

export async function loadConfig(): Promise<Partial<LintConfig>> {
  return ((await storage.get(KEY_CONFIG)) as Partial<LintConfig> | undefined) ?? {}
}

export async function saveConfig(config: Partial<LintConfig>): Promise<void> {
  await storage.set(KEY_CONFIG, config)
}

export async function loadLatest(): Promise<StoredReport | undefined> {
  return (await storage.get(KEY_LATEST)) as StoredReport | undefined
}

export async function loadHistory(): Promise<HistoryPoint[]> {
  return ((await storage.get(KEY_HISTORY)) as HistoryPoint[] | undefined) ?? []
}

/** Full (capped) violation list for one project, or undefined when the project was never stored. */
export async function loadProjectViolations(projectKey: string): Promise<Violation[] | undefined> {
  return (await storage.get(KEY_VIOLATIONS_PREFIX + projectKey)) as Violation[] | undefined
}

export async function runScan(projectKeys?: string[]): Promise<StoredReport> {
  const keys = projectKeys && projectKeys.length > 0 ? projectKeys : await listProjectKeys()
  const portfolio = await fetchPortfolio(keys, 'Jira portfolio')
  const config = await loadConfig()
  const report = lintPortfolio(portfolio, config)
  const stored: StoredReport = {
    ...report,
    violationCount: report.violations.length,
    violations: sampleAcrossProjects(report.violations, MAX_STORED_VIOLATIONS),
  }
  const previous = await loadLatest()
  const byProject = groupByProject(report.violations)
  for (const p of report.projects) {
    await storage.set(KEY_VIOLATIONS_PREFIX + p.key, (byProject.get(p.key) ?? []).slice(0, MAX_STORED_PER_PROJECT))
  }
  for (const p of previous?.projects ?? []) {
    if (!report.projects.some((q) => q.key === p.key)) await storage.delete(KEY_VIOLATIONS_PREFIX + p.key)
  }
  await storage.set(KEY_LATEST, stored)
  const history = await loadHistory()
  history.push({ scannedAt: report.scannedAt, score: report.score, grade: report.grade })
  await storage.set(KEY_HISTORY, history.slice(-HISTORY_LIMIT))
  return stored
}

export function projectFromReport(report: StoredReport, projectKey: string): ProjectReport | undefined {
  return report.projects.find((p) => p.key === projectKey)
}
