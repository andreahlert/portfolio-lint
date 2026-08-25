import { describe, expect, it } from 'vitest'
import { ALL_RULES, getRule } from '../../src/rules/index.js'
import { DIMENSIONS, FORECAST_TYPES } from '../../src/model.js'

describe('rule registry', () => {
  it('has 13 rules with unique ids', () => {
    expect(ALL_RULES).toHaveLength(13)
    expect(new Set(ALL_RULES.map((r) => r.id)).size).toBe(13)
  })
  it('every rule has valid metadata', () => {
    for (const r of ALL_RULES) {
      expect(DIMENSIONS).toContain(r.dimension)
      expect([1, 2, 3]).toContain(r.weight)
      expect(r.forecasts.length).toBeGreaterThan(0)
      for (const f of r.forecasts) expect(FORECAST_TYPES).toContain(f)
      expect(r.description.length).toBeGreaterThan(10)
      expect(r.forecastImpact.length).toBeGreaterThan(10)
      expect(r.remediation.length).toBeGreaterThan(10)
    }
  })
  it('every dimension and forecast has at least one rule', () => {
    for (const d of DIMENSIONS) expect(ALL_RULES.some((r) => r.dimension === d)).toBe(true)
    for (const f of FORECAST_TYPES) expect(ALL_RULES.some((r) => r.forecasts.includes(f))).toBe(true)
  })
  it('getRule finds by id', () => {
    expect(getRule('missing-estimate')?.dimension).toBe('completeness')
    expect(getRule('nope')).toBeUndefined()
  })
})
