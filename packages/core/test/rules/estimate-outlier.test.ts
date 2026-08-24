import { describe, expect, it } from 'vitest'
import { estimateOutlier } from '../../src/rules/estimate-outlier.js'
import { ctx, makeItem, makeProject } from '../fixtures.js'

describe('estimate-outlier', () => {
  it('flags estimates above factor x median', () => {
    const items = [3, 5, 5, 8, 40].map((e, i) => makeItem({ key: `P-${i + 1}`, estimate: e }))
    const r = estimateOutlier.evaluate(makeProject(items), ctx())
    expect(r.applicable).toBe(5)
    expect(r.violations.map((v) => v.itemKey)).toEqual(['P-5'])
    expect(r.violations[0]?.message).toContain('median (5)')
  })
  it('does not apply with fewer than 5 estimated items', () => {
    const items = [1, 100, 1, 1].map((e) => makeItem({ estimate: e }))
    expect(estimateOutlier.evaluate(makeProject(items), ctx()).applicable).toBe(0)
  })
  it('ignores epics', () => {
    const items = [
      ...[3, 3, 3, 3, 3].map((e) => makeItem({ estimate: e })),
      makeItem({ type: 'epic', estimate: 500 }),
    ]
    expect(estimateOutlier.evaluate(makeProject(items), ctx()).violations).toHaveLength(0)
  })
})
