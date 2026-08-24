import { describe, expect, it } from 'vitest'
import { forecastLabel, grade, mean, min, scoreRule, weightedMean } from '../src/scorer.js'
import { DEFAULT_CONFIG, resolveConfig } from '../src/config.js'

describe('scoreRule', () => {
  it('is 100 * (1 - violations/applicable)', () => {
    const violations = [1, 2, 3].map((i) => ({ ruleId: 'r', projectKey: 'P', itemKey: `P-${i}`, message: 'm' }))
    expect(scoreRule({ ruleId: 'r', applicable: 10, violations })).toBe(70)
  })
  it('is null when nothing applies', () => {
    expect(scoreRule({ ruleId: 'r', applicable: 0, violations: [] })).toBeNull()
  })
  it('never goes below 0 even if violations exceed applicable', () => {
    const violations = [1, 2].map((i) => ({ ruleId: 'r', projectKey: 'P', message: `${i}` }))
    expect(scoreRule({ ruleId: 'r', applicable: 1, violations })).toBe(0)
  })
})

describe('grade', () => {
  it('uses A/B/C/D/F bands', () => {
    expect(grade(100)).toBe('A')
    expect(grade(90)).toBe('A')
    expect(grade(89.9)).toBe('B')
    expect(grade(75)).toBe('B')
    expect(grade(60)).toBe('C')
    expect(grade(40)).toBe('D')
    expect(grade(39)).toBe('F')
  })
})

describe('forecastLabel', () => {
  it('maps score bands to labels', () => {
    expect(forecastLabel(75)).toBe('reliable')
    expect(forecastLabel(50)).toBe('degraded')
    expect(forecastLabel(49)).toBe('unreliable')
  })
})

describe('aggregation helpers', () => {
  it('weightedMean skips null and weights the rest', () => {
    expect(weightedMean([{ score: 100, weight: 3 }, { score: 0, weight: 1 }, { score: null, weight: 3 }])).toBe(75)
    expect(weightedMean([{ score: null, weight: 3 }])).toBeNull()
  })
  it('mean and min skip null', () => {
    expect(mean([80, null, 60])).toBe(70)
    expect(mean([null])).toBeNull()
    expect(min([80, null, 60])).toBe(60)
    expect(min([null])).toBeNull()
  })
})

describe('resolveConfig', () => {
  it('returns defaults for empty input', () => {
    expect(resolveConfig({})).toEqual(DEFAULT_CONFIG)
  })
  it('overrides only the given keys', () => {
    const c = resolveConfig({ maxWipPerPerson: 5 })
    expect(c.maxWipPerPerson).toBe(5)
    expect(c.staleInProgressDays).toBe(14)
  })
  it('ignores undefined values', () => {
    expect(resolveConfig({ staleOpenDays: undefined }).staleOpenDays).toBe(90)
  })
})
