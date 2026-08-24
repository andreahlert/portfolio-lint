import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { LintConfig } from '@portfolio-lint/core'

export const CONFIG_FILENAME = '.portfoliolintrc.json'

export class ConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigError'
  }
}

const NUMERIC_KEYS = ['staleInProgressDays', 'staleOpenDays', 'maxWipPerPerson', 'outlierFactor'] as const

/**
 * Load a partial config. Explicit path must exist; the default file is optional.
 */
export function loadConfigFile(path: string | undefined, cwd: string = process.cwd()): Partial<LintConfig> {
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

export function validateConfig(raw: unknown, source = 'config'): Partial<LintConfig> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new ConfigError(`${source}: expected a JSON object`)
  }
  const obj = raw as Record<string, unknown>
  const out: Partial<LintConfig> = {}
  for (const k of NUMERIC_KEYS) {
    const v = obj[k]
    if (v === undefined) continue
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw new ConfigError(`${source}: ${k} must be a non-negative number`)
    out[k] = v
  }
  if (obj['disabledRules'] !== undefined) {
    const v = obj['disabledRules']
    if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) throw new ConfigError(`${source}: disabledRules must be an array of rule ids`)
    out.disabledRules = v as string[]
  }
  if (obj['now'] !== undefined) {
    const v = obj['now']
    if (typeof v !== 'string' || Number.isNaN(Date.parse(v))) throw new ConfigError(`${source}: now must be an ISO datetime`)
    out.now = v
  }
  return out
}
