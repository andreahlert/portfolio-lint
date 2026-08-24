import { describe, expect, it } from 'vitest'
import { missingEstimate } from '../../src/rules/missing-estimate.js'
import { ctx, makeItem, makeProject } from '../fixtures.js'

describe('missing-estimate', () => {
  it('flags open non-epic items without estimate', () => {
    const a = makeItem({ key: 'P-1', estimate: 3 })
    const b = makeItem({ key: 'P-2' })
    const c = makeItem({ key: 'P-3', estimate: 0 })
    const r = missingEstimate.evaluate(makeProject([a, b, c]), ctx())
    expect(r.applicable).toBe(3)
    expect(r.violations.map((v) => v.itemKey)).toEqual(['P-2', 'P-3'])
    expect(r.violations[0]?.message).toContain('P-2')
  })
  it('ignores epics and done items', () => {
    const epic = makeItem({ key: 'P-1', type: 'epic' })
    const done = makeItem({ key: 'P-2', statusCategory: 'done', resolvedAt: '2026-08-01' })
    const r = missingEstimate.evaluate(makeProject([epic, done]), ctx())
    expect(r.applicable).toBe(0)
    expect(r.violations).toHaveLength(0)
  })
})
