import { storage } from '@forge/api'
import { lintPortfolio, type LintConfig, type ProjectReport, type Report } from '@portfolio-lint/core'
import { fetchPortfolio, listProjectKeys } from './jiraClient.js'

export const KEY_LATEST = 'report:latest'
export const KEY_CONFIG = 'config'
export const KEY_HISTORY = 'history'
const HISTORY_LIMIT = 30

export interface HistoryPoint {
  scannedAt: string
  score: number
  grade: string
}

/** Stored report is trimmed: violations list can exceed Forge storage value limits on big sites. */
export interface StoredReport extends Omit<Report, 'violations'> {
  violationCount: number
  violations: Report['violations']
}

const MAX_STORED_VIOLATIONS = 500

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

export async function runScan(projectKeys?: string[]): Promise<StoredReport> {
  const keys = projectKeys && projectKeys.length > 0 ? projectKeys : await listProjectKeys()
  const portfolio = await fetchPortfolio(keys, 'Jira portfolio')
  const config = await loadConfig()
  const report = lintPortfolio(portfolio, config)
  const stored: StoredReport = {
    ...report,
    violationCount: report.violations.length,
    violations: report.violations.slice(0, MAX_STORED_VIOLATIONS),
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
