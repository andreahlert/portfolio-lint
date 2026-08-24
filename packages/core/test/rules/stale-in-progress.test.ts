import { describe, expect, it } from 'vitest'
import { staleInProgress } from '../../src/rules/stale-in-progress.js'
import { ctx, daysAgo, makeItem, makeProject } from '../fixtures.js'

describe('stale-in-progress', () => {
  it('flags in-progress items older than the threshold', () => {
    const fresh = makeItem({ key: 'P-1', statusCategory: 'in_progress', updatedAt: daysAgo(3) })
    const stale = makeItem({ key: 'P-2', statusCategory: 'in_progress', updatedAt: daysAgo(20) })
    const r = staleInProgress.evaluate(makeProject([fresh, stale]), ctx())
    expect(r.applicable).toBe(2)
    expect(r.violations.map((v) => v.itemKey)).toEqual(['P-2'])
    expect(r.violations[0]?.message).toContain('20 days')
  })
  it('respects a custom threshold', () => {
    const item = makeItem({ statusCategory: 'in_progress', updatedAt: daysAgo(20) })
    expect(staleInProgress.evaluate(makeProject([item]), ctx({ staleInProgressDays: 30 })).violations).toHaveLength(0)
  })
  it('ignores todo items', () => {
    expect(staleInProgress.evaluate(makeProject([makeItem({ updatedAt: daysAgo(200) })]), ctx()).applicable).toBe(0)
  })
})
