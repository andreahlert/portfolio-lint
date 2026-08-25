import { describe, expect, it } from 'vitest'
import { ConfigError, validateConfig } from '../src/config.js'

describe('validateConfig', () => {
  it('accepts the new WIP keys, per-project overrides and forecast tuning', () => {
    const c = validateConfig({
      wipOutlierFactor: 1.5,
      wipHardLimit: 8,
      wipAdaptiveMinPeople: 4,
      projects: { ALPHA: { maxWipPerPerson: 5, disabledRules: ['stale-open'] }, BETA: {} },
      forecast: { enabled: false, historyWeeks: 8, simulations: 500, seed: 1 },
    })
    expect(c).toEqual({
      wipOutlierFactor: 1.5,
      wipHardLimit: 8,
      wipAdaptiveMinPeople: 4,
      projects: { ALPHA: { maxWipPerPerson: 5, disabledRules: ['stale-open'] }, BETA: {} },
      forecast: { enabled: false, historyWeeks: 8, simulations: 500, seed: 1 },
    })
  })
  it('rejects bad overrides with the path in the message', () => {
    expect(() => validateConfig({ projects: { A: { maxWipPerPerson: -1 } } })).toThrow(/projects\.A: maxWipPerPerson/)
    expect(() => validateConfig({ projects: ['A'] })).toThrow(ConfigError)
    expect(() => validateConfig({ forecast: { simulations: 0 } })).toThrow(/simulations must be an integer >= 1/)
    expect(() => validateConfig({ forecast: { enabled: 'yes' } })).toThrow(/enabled must be true or false/)
    expect(() => validateConfig({ forecast: { historyWeeks: 2.5 } })).toThrow(/historyWeeks/)
  })
})
