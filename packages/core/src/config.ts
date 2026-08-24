export interface LintConfig {
  /** in_progress items not updated for more than this many days are stale. */
  staleInProgressDays: number
  /** todo items not updated for more than this many days are zombies. */
  staleOpenDays: number
  /** More than this many in_progress items per person is over-allocation. */
  maxWipPerPerson: number
  /** Estimates larger than factor x median are outliers. */
  outlierFactor: number
  /** Rule ids to skip entirely. */
  disabledRules: string[]
  /** ISO datetime used as "now" for reproducible runs. Defaults to wall clock. */
  now?: string
}

export const DEFAULT_CONFIG: LintConfig = {
  staleInProgressDays: 14,
  staleOpenDays: 90,
  maxWipPerPerson: 3,
  outlierFactor: 5,
  disabledRules: [],
}

export function resolveConfig(partial: Partial<LintConfig> = {}): LintConfig {
  const merged: LintConfig = { ...DEFAULT_CONFIG, ...stripUndefined(partial) }
  merged.disabledRules = [...(merged.disabledRules ?? [])]
  return merged
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  const out: Partial<T> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v
  }
  return out
}
