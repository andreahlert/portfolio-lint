import { DEFAULT_CONFIG, DEFAULT_FORECAST_CONFIG, type ForecastConfig, type LintConfigInput, type ProjectConfigOverride } from './config.js'

export type NumericConfigKey =
  | 'staleInProgressDays'
  | 'staleOpenDays'
  | 'maxWipPerPerson'
  | 'wipOutlierFactor'
  | 'wipHardLimit'
  | 'wipAdaptiveMinPeople'
  | 'outlierFactor'

export interface ConfigField {
  key: NumericConfigKey
  label: string
  help: string
  min: number
  integer: boolean
  default: number
  /** Rules that read this setting. */
  rules: string[]
}

/** Every numeric setting, in the order a settings form should show them. All of them can be overridden per project. */
export const CONFIG_FIELDS: readonly ConfigField[] = [
  {
    key: 'staleInProgressDays',
    label: 'Stale in-progress after (days)',
    help: 'An in-progress item with no update for longer than this is stale.',
    min: 1,
    integer: true,
    default: DEFAULT_CONFIG.staleInProgressDays,
    rules: ['stale-in-progress'],
  },
  {
    key: 'staleOpenDays',
    label: 'Stale open after (days)',
    help: 'An open (to do) item with no update for longer than this is a zombie.',
    min: 1,
    integer: true,
    default: DEFAULT_CONFIG.staleOpenDays,
    rules: ['stale-open'],
  },
  {
    key: 'maxWipPerPerson',
    label: 'Baseline WIP per person',
    help: 'Baseline number of in-progress items one person may hold. The limit adapts to the team median when enough people have WIP.',
    min: 1,
    integer: true,
    default: DEFAULT_CONFIG.maxWipPerPerson,
    rules: ['overallocated-assignee'],
  },
  {
    key: 'wipOutlierFactor',
    label: 'WIP outlier factor',
    help: 'Multiplier on the team median that turns a busy person into an outlier. Effective limit = max(baseline, factor x median).',
    min: 1,
    integer: false,
    default: DEFAULT_CONFIG.wipOutlierFactor,
    rules: ['overallocated-assignee'],
  },
  {
    key: 'wipHardLimit',
    label: 'WIP hard limit',
    help: 'Nobody may hold more in-progress items than this, whatever the team median.',
    min: 1,
    integer: true,
    default: DEFAULT_CONFIG.wipHardLimit,
    rules: ['overallocated-assignee'],
  },
  {
    key: 'wipAdaptiveMinPeople',
    label: 'People needed before WIP adapts',
    help: 'Minimum number of people with WIP before the limit adapts to the team. Below this the baseline applies.',
    min: 1,
    integer: true,
    default: DEFAULT_CONFIG.wipAdaptiveMinPeople,
    rules: ['overallocated-assignee'],
  },
  {
    key: 'outlierFactor',
    label: 'Estimate outlier factor',
    help: 'An estimate larger than factor x the project median is an outlier.',
    min: 1,
    integer: false,
    default: DEFAULT_CONFIG.outlierFactor,
    rules: ['estimate-outlier'],
  },
]

export type ForecastNumericKey = 'historyWeeks' | 'simulations' | 'seed'

export interface ForecastField {
  key: ForecastNumericKey
  label: string
  help: string
  min: number
  integer: boolean
  default: number
}

export const FORECAST_FIELDS: readonly ForecastField[] = [
  {
    key: 'historyWeeks',
    label: 'Throughput history (weeks)',
    help: 'Weeks of completed work sampled for weekly throughput. Shorter reacts faster, longer is steadier.',
    min: 1,
    integer: true,
    default: DEFAULT_FORECAST_CONFIG.historyWeeks,
  },
  {
    key: 'simulations',
    label: 'Monte Carlo runs',
    help: 'Simulated futures per project. More runs smooth the p50/p85/p95 dates but cost time.',
    min: 1,
    integer: true,
    default: DEFAULT_FORECAST_CONFIG.simulations,
  },
  {
    key: 'seed',
    label: 'Random seed',
    help: 'Fixed seed so two scans on the same data give the same dates.',
    min: 0,
    integer: true,
    default: DEFAULT_FORECAST_CONFIG.seed,
  },
]

export class ConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigError'
  }
}

function asObject(raw: unknown, what: string): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new ConfigError(`${what}: expected a JSON object`)
  return raw as Record<string, unknown>
}

function readNumber(obj: Record<string, unknown>, key: string, what: string, opts: { min?: number; integer?: boolean } = {}): number | undefined {
  const v = obj[key]
  if (v === undefined || v === null) return undefined
  const min = opts.min ?? 0
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || (opts.integer && !Number.isInteger(v))) {
    throw new ConfigError(`${what}: ${key} must be ${opts.integer ? 'an integer' : 'a number'} >= ${min}`)
  }
  return v
}

function readRuleIds(obj: Record<string, unknown>, what: string): string[] | undefined {
  const v = obj['disabledRules']
  if (v === undefined || v === null) return undefined
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) throw new ConfigError(`${what}: disabledRules must be an array of rule ids`)
  return [...new Set(v as string[])]
}

/** Validates the keys a project may override. Unknown keys are dropped, bad values throw ConfigError. */
export function validateProjectOverride(raw: unknown, source = 'override'): ProjectConfigOverride {
  const obj = asObject(raw, source)
  const out: ProjectConfigOverride = {}
  for (const f of CONFIG_FIELDS) {
    // Overrides keep the CLI's lenient floor (>= 0) so existing config files stay valid.
    const v = readNumber(obj, f.key, source, { integer: f.integer })
    if (v !== undefined) out[f.key] = v
  }
  const disabled = readRuleIds(obj, source)
  if (disabled) out.disabledRules = disabled
  return out
}

/** Validates a full portfolio config (what the CLI reads from disk and what the Jira app keeps in storage). */
export function validateConfig(raw: unknown, source = 'config'): LintConfigInput {
  const obj = asObject(raw, source)
  const out: LintConfigInput = validateProjectOverride(obj, source)
  if (obj['now'] !== undefined) {
    const v = obj['now']
    if (typeof v !== 'string' || Number.isNaN(Date.parse(v))) throw new ConfigError(`${source}: now must be an ISO datetime`)
    out.now = v
  }
  if (obj['projects'] !== undefined) {
    const projects = asObject(obj['projects'], `${source}: projects`)
    out.projects = Object.fromEntries(Object.entries(projects).map(([key, v]) => [key, validateProjectOverride(v, `${source}: projects.${key}`)]))
  }
  if (obj['forecast'] !== undefined) {
    const f = asObject(obj['forecast'], `${source}: forecast`)
    const what = `${source}: forecast`
    const forecast: Partial<ForecastConfig> = {}
    if (f['enabled'] !== undefined) {
      if (typeof f['enabled'] !== 'boolean') throw new ConfigError(`${what}: enabled must be true or false`)
      forecast.enabled = f['enabled']
    }
    for (const field of FORECAST_FIELDS) {
      const v = readNumber(f, field.key, what, { min: field.min, integer: field.integer })
      if (v !== undefined) forecast[field.key] = v
    }
    out.forecast = forecast
  }
  return out
}
