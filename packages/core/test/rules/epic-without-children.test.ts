import { describe, expect, it } from 'vitest'
import { epicWithoutChildren } from '../../src/rules/epic-without-children.js'
import { ctx, makeItem, makeProject } from '../fixtures.js'

describe('epic-without-children', () => {
  it('flags open epics with no children', () => {
    const full = makeItem({ id: 'e1', key: 'E-1', type: 'epic' })
    const empty = makeItem({ id: 'e2', key: 'E-2', type: 'epic' })
    const child = makeItem({ key: 'P-1', parentId: 'e1' })
    const r = epicWithoutChildren.evaluate(makeProject([full, empty, child]), ctx())
    expect(r.applicable).toBe(2)
    expect(r.violations.map((v) => v.itemKey)).toEqual(['E-2'])
  })
  it('ignores done epics', () => {
    const done = makeItem({ type: 'epic', statusCategory: 'done', resolvedAt: '2026-08-01' })
    expect(epicWithoutChildren.evaluate(makeProject([done]), ctx()).applicable).toBe(0)
  })
})
