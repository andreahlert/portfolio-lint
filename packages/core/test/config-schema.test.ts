import { describe, expect, it } from 'vitest'
import { CONFIG_FIELDS, ConfigError, DEFAULT_CONFIG, FORECAST_FIELDS, validateConfig, validateProjectOverride } from '../src/index.js'
import { ALL_RULES } from '../src/rules/index.js'

describe('config schema', () => {
  it('lists every numeric setting with its default and a known rule', () => {
    const ids = new Set(ALL_RULES.map((r) => r.id))
    for (const f of CONFIG_FIELDS) {
      expect(DEFAULT_CONFIG[f.key]).toBe(f.default)
      expect(f.rules.length).toBeGreaterThan(0)
      for (const r of f.rules) expect(ids.has(r)).toBe(true)
    }
    expect(FORECAST_FIELDS.map((f) => f.key)).toEqual(['historyWeeks', 'simulations', 'seed'])
  })
  it('validates overrides, drops unknown keys and dedupes disabled rules', () => {
    expect(validateProjectOverride({ staleOpenDays: 30, bogus: 1, disabledRules: ['a', 'a'] })).toEqual({ staleOpenDays: 30, disabledRules: ['a'] })
    expect(() => validateProjectOverride({ staleOpenDays: 1.5 })).toThrow(ConfigError)
    expect(() => validateProjectOverride({ wipOutlierFactor: -1 })).toThrow(/wipOutlierFactor/)
    expect(() => validateProjectOverride([])).toThrow(/expected a JSON object/)
  })
  it('validates forecast tuning through the field list', () => {
    expect(validateConfig({ forecast: { enabled: false, seed: 0 } })).toEqual({ forecast: { enabled: false, seed: 0 } })
    expect(() => validateConfig({ forecast: { historyWeeks: 0 } })).toThrow(/historyWeeks must be an integer >= 1/)
  })
})
