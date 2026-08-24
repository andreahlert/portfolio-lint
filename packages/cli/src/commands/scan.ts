import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { CsvFormatError, lintPortfolio, parsePortfolioCsv, type LintConfig, type Portfolio, type Report } from '@portfolio-lint/core'
import { fetchJiraPortfolio, JiraHttpError } from '../connectors/jira.js'
import { ConfigError, loadConfigFile } from '../config.js'
import { renderJson } from '../render/json.js'
import { renderMarkdown } from '../render/markdown.js'
import { renderTable } from '../render/table.js'

export type ScanFormat = 'table' | 'md' | 'json'

export interface ScanOptions {
  source?: string
  file?: string
  url?: string
  email?: string
  token?: string
  projects?: string
  format?: string
  out?: string
  config?: string
  failUnder?: number
  now?: string
  name?: string
}

export interface ScanIO {
  stdout: (s: string) => void
  stderr: (s: string) => void
  env?: NodeJS.ProcessEnv
  cwd?: string
  fetchImpl?: typeof fetch
}

export const EXIT_OK = 0
export const EXIT_FAIL_UNDER = 1
export const EXIT_ERROR = 2

export class UsageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UsageError'
  }
}

export interface ScanOutcome {
  code: number
  report?: Report
}

export async function runScan(opts: ScanOptions, io: ScanIO): Promise<ScanOutcome> {
  try {
    const cwd = io.cwd ?? process.cwd()
    const env = io.env ?? process.env
    const format = parseFormat(opts.format)
    const fileConfig = loadConfigFile(opts.config, cwd)
    const config: Partial<LintConfig> = { ...fileConfig }
    if (opts.now !== undefined) {
      if (Number.isNaN(Date.parse(opts.now))) throw new UsageError(`--now must be an ISO datetime, got "${opts.now}"`)
      config.now = opts.now
    }
    const scannedAt = config.now ?? new Date().toISOString()

    const { portfolio, warnings } = await loadPortfolio(opts, { cwd, env, scannedAt, ...(io.fetchImpl ? { fetchImpl: io.fetchImpl } : {}) })
    for (const w of warnings) io.stderr(`warning: ${w}\n`)

    const report = lintPortfolio(portfolio, config)
    const rendered = format === 'json' ? renderJson(report) : format === 'md' ? renderMarkdown(report) : renderTable(report)
    if (opts.out) {
      writeFileSync(resolve(cwd, opts.out), rendered)
      io.stderr(`report written to ${opts.out}\n`)
    } else {
      io.stdout(rendered)
    }

    if (opts.failUnder !== undefined && report.score < opts.failUnder) {
      io.stderr(`score ${report.score} is below --fail-under ${opts.failUnder}\n`)
      return { code: EXIT_FAIL_UNDER, report }
    }
    return { code: EXIT_OK, report }
  } catch (e) {
    io.stderr(`error: ${describeError(e)}\n`)
    return { code: EXIT_ERROR }
  }
}

function parseFormat(f: string | undefined): ScanFormat {
  const v = f ?? 'table'
  if (v === 'table' || v === 'md' || v === 'json') return v
  throw new UsageError(`--format must be table, md or json, got "${v}"`)
}

interface LoadContext {
  cwd: string
  env: NodeJS.ProcessEnv
  scannedAt: string
  fetchImpl?: typeof fetch
}

async function loadPortfolio(opts: ScanOptions, ctx: LoadContext): Promise<{ portfolio: Portfolio; warnings: string[] }> {
  const source = opts.source ?? (opts.file ? 'csv' : 'jira')
  if (source === 'csv') {
    if (!opts.file) throw new UsageError('--file is required with --source csv')
    const path = resolve(ctx.cwd, opts.file)
    let text: string
    try {
      text = readFileSync(path, 'utf8')
    } catch {
      throw new UsageError(`Cannot read CSV file: ${path}`)
    }
    const name = opts.name ?? opts.file.replace(/^.*[\\/]/, '').replace(/\.csv$/i, '')
    const result = parsePortfolioCsv(text, { name, scannedAt: ctx.scannedAt })
    return { portfolio: result.portfolio, warnings: result.warnings }
  }
  if (source === 'jira') {
    const url = opts.url ?? ctx.env['JIRA_URL']
    const email = opts.email ?? ctx.env['JIRA_EMAIL']
    const token = opts.token ?? ctx.env['JIRA_TOKEN']
    const projects = (opts.projects ?? ctx.env['JIRA_PROJECTS'] ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const missing = [
      !url && '--url (or JIRA_URL)',
      !email && '--email (or JIRA_EMAIL)',
      !token && '--token (or JIRA_TOKEN)',
      projects.length === 0 && '--projects (or JIRA_PROJECTS)',
    ].filter((x): x is string => Boolean(x))
    if (missing.length > 0) throw new UsageError(`Missing for Jira scan: ${missing.join(', ')}`)
    const result = await fetchJiraPortfolio({
      url: url!,
      email: email!,
      token: token!,
      projects,
      scannedAt: ctx.scannedAt,
      ...(opts.name ? { name: opts.name } : {}),
      ...(ctx.fetchImpl ? { fetchImpl: ctx.fetchImpl } : {}),
    })
    return { portfolio: result.portfolio, warnings: result.warnings }
  }
  throw new UsageError(`--source must be jira or csv, got "${source}"`)
}

function describeError(e: unknown): string {
  if (e instanceof CsvFormatError) return `${e.message} See docs/csv-format.md.`
  if (e instanceof JiraHttpError || e instanceof ConfigError || e instanceof UsageError) return e.message
  if (e instanceof Error) {
    if (/fetch failed|ENOTFOUND|ECONNREFUSED/.test(e.message)) return `Cannot reach Jira: ${e.message}. Check the site URL and network.`
    return e.message
  }
  return String(e)
}
