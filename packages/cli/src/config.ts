import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { LintConfigInput, ProjectConfigOverride } from '@portfolio-lint/core'

export const CONFIG_FILENAME = '.portfoliolintrc.json'

export class ConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigError'
  }
}

const NUMERIC_KEYS = [
  'staleInProgressDays',
  'staleOpenDays',
  'maxWipPerPerson',
  'wipOutlierFactor',
  'wipHardLimit',
  'wipAdaptiveMinPeople',
  'outlierFactor',
] as const

/**
 * Load a partial config. Explicit path must exist; the default file is optional.
 */
export function loadConfigFile(path: string | undefined, cwd: string = process.cwd()): LintConfigInput {
  const explicit = path !== undefined
  const file = resolve(cwd, path ?? CONFIG_FILENAME)
  if (!existsSync(file)) {
    if (explicit) throw new ConfigError(`Config file not found: ${file}`)
    return {}
  }
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'))
  } catch (e) {
    throw new ConfigError(`Config file is not valid JSON: ${file} (${(e as Error).message})`)
  }
  return validateConfig(raw, file)
}

function asObject(raw: unknown, what: string): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new ConfigError(`${what}: expected a JSON object`)
  return raw as Record<string, unknown>
}

function readNumber(obj: Record<string, unknown>, key: string, what: string, opts: { min?: number; integer?: boolean } = {}): number | undefined {
  const v = obj[key]
  if (v === undefined) return undefined
  const min = opts.min ?? 0
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || (opts.integer && !Number.isInteger(v))) {
    throw new ConfigError(`${what}: ${key} must be ${opts.integer ? 'an integer' : 'a number'} >= ${min}`)
  }
  return v
}

function readRuleIds(obj: Record<string, unknown>, what: string): string[] | undefined {
  const v = obj['disabledRules']
  if (v === undefined) return undefined
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) throw new ConfigError(`${what}: disabledRules must be an array of rule ids`)
  return v as string[]
}

function readOverride(raw: unknown, what: string): ProjectConfigOverride {
  const obj = asObject(raw, what)
  const out: ProjectConfigOverride = {}
  for (const k of NUMERIC_KEYS) {
    const v = readNumber(obj, k, what)
    if (v !== undefined) out[k] = v
  }
  const disabled = readRuleIds(obj, what)
  if (disabled) out.disabledRules = disabled
  return out
}

export function validateConfig(raw: unknown, source = 'config'): LintConfigInput {
  const obj = asObject(raw, source)
  const out: LintConfigInput = readOverride(obj, source)
  if (obj['now'] !== undefined) {
    const v = obj['now']
    if (typeof v !== 'string' || Number.isNaN(Date.parse(v))) throw new ConfigError(`${source}: now must be an ISO datetime`)
    out.now = v
  }
  if (obj['projects'] !== undefined) {
    const projects = asObject(obj['projects'], `${source}: projects`)
    out.projects = Object.fromEntries(Object.entries(projects).map(([key, v]) => [key, readOverride(v, `${source}: projects.${key}`)]))
  }
  if (obj['forecast'] !== undefined) {
    const f = asObject(obj['forecast'], `${source}: forecast`)
    const what = `${source}: forecast`
    const forecast: LintConfigInput['forecast'] = {}
    if (f['enabled'] !== undefined) {
      if (typeof f['enabled'] !== 'boolean') throw new ConfigError(`${what}: enabled must be true or false`)
      forecast.enabled = f['enabled']
    }
    const historyWeeks = readNumber(f, 'historyWeeks', what, { min: 1, integer: true })
    const simulations = readNumber(f, 'simulations', what, { min: 1, integer: true })
    const seed = readNumber(f, 'seed', what, { integer: true })
    if (historyWeeks !== undefined) forecast.historyWeeks = historyWeeks
    if (simulations !== undefined) forecast.simulations = simulations
    if (seed !== undefined) forecast.seed = seed
    out.forecast = forecast
  }
  return out
}
