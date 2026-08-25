export interface LintConfig {
  /** in_progress items not updated for more than this many days are stale. */
  staleInProgressDays: number
  /** todo items not updated for more than this many days are zombies. */
  staleOpenDays: number
  /**
   * Baseline WIP limit per person. The effective limit adapts to the team when at least
   * `wipAdaptiveMinPeople` people have work in progress: max(baseline, wipOutlierFactor x team median),
   * never above `wipHardLimit`.
   */
  maxWipPerPerson: number
  /** Multiplier on the team median that turns a busy person into an outlier. */
  wipOutlierFactor: number
  /** Nobody is allowed more in-progress items than this, whatever the team median. */
  wipHardLimit: number
  /** Minimum number of people with WIP before the limit adapts to the team. */
  wipAdaptiveMinPeople: number
  /** Estimates larger than factor x median are outliers. */
  outlierFactor: number
  /** Rule ids to skip entirely. */
  disabledRules: string[]
  /** ISO datetime used as "now" for reproducible runs. Defaults to wall clock. */
  now?: string
  /** Per-project overrides, keyed by project key. Anything not overridden inherits the portfolio value. */
  projects?: Record<string, ProjectConfigOverride>
  /** Delivery forecast tuning. */
  forecast: ForecastConfig
}

/** Keys a project may override. */
export type ProjectConfigOverride = Partial<
  Pick<
    LintConfig,
    'staleInProgressDays' | 'staleOpenDays' | 'maxWipPerPerson' | 'wipOutlierFactor' | 'wipHardLimit' | 'wipAdaptiveMinPeople' | 'outlierFactor' | 'disabledRules'
  >
>

export interface ForecastConfig {
  /** Set false to skip the Monte Carlo and critical path pass. */
  enabled: boolean
  /** Weeks of completion history sampled for throughput. */
  historyWeeks: number
  /** Monte Carlo runs per project. */
  simulations: number
  /** PRNG seed so two runs on the same data agree. */
  seed: number
}

export const DEFAULT_FORECAST_CONFIG: ForecastConfig = {
  enabled: true,
  historyWeeks: 12,
  simulations: 2000,
  seed: 42,
}

export const DEFAULT_CONFIG: LintConfig = {
  staleInProgressDays: 14,
  staleOpenDays: 90,
  maxWipPerPerson: 3,
  wipOutlierFactor: 2,
  wipHardLimit: 10,
  wipAdaptiveMinPeople: 3,
  outlierFactor: 5,
  disabledRules: [],
  forecast: DEFAULT_FORECAST_CONFIG,
}

/** What callers pass in: every key optional, forecast keys optional too. */
export type LintConfigInput = Partial<Omit<LintConfig, 'forecast'>> & { forecast?: Partial<ForecastConfig> }

export function resolveConfig(partial: LintConfigInput = {}): LintConfig {
  const merged: LintConfig = { ...DEFAULT_CONFIG, ...stripUndefined(partial), forecast: DEFAULT_FORECAST_CONFIG }
  merged.disabledRules = [...(merged.disabledRules ?? [])]
  merged.forecast = { ...DEFAULT_FORECAST_CONFIG, ...stripUndefined(partial.forecast ?? {}) }
  if (partial.projects) {
    merged.projects = Object.fromEntries(Object.entries(partial.projects).map(([k, v]) => [k, stripUndefined(v ?? {})]))
  }
  return merged
}

/** Portfolio config with one project's overrides applied. `projects` is dropped so rules never see other projects' settings. */
export function configForProject(config: LintConfig, projectKey: string): LintConfig {
  const override = config.projects?.[projectKey]
  const { projects: _projects, ...base } = config
  if (!override) return { ...base }
  const merged: LintConfig = { ...base, ...stripUndefined(override) }
  // Project-level disables add to the portfolio-level ones; a project cannot re-enable a globally disabled rule.
  merged.disabledRules = [...new Set([...base.disabledRules, ...(override.disabledRules ?? [])])]
  return merged
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  const out: Partial<T> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v
  }
  return out
}
