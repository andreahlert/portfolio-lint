import { describe, expect, it } from 'vitest'
import { staleOpen } from '../../src/rules/stale-open.js'
import { ctx, daysAgo, makeItem, makeProject } from '../fixtures.js'

describe('stale-open', () => {
  it('flags todo items older than 90 days', () => {
    const fresh = makeItem({ key: 'P-1', updatedAt: daysAgo(10) })
    const zombie = makeItem({ key: 'P-2', updatedAt: daysAgo(120) })
    const r = staleOpen.evaluate(makeProject([fresh, zombie]), ctx())
    expect(r.applicable).toBe(2)
    expect(r.violations.map((v) => v.itemKey)).toEqual(['P-2'])
  })
  it('ignores in-progress and done', () => {
    const items = [
      makeItem({ statusCategory: 'in_progress', updatedAt: daysAgo(120) }),
      makeItem({ statusCategory: 'done', updatedAt: daysAgo(120) }),
    ]
    expect(staleOpen.evaluate(makeProject(items), ctx()).applicable).toBe(0)
  })
})
