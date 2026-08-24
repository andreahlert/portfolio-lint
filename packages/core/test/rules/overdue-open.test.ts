import { describe, expect, it } from 'vitest'
import { overdueOpen } from '../../src/rules/overdue-open.js'
import { ctx, makeItem, makeProject } from '../fixtures.js'

describe('overdue-open', () => {
  it('flags open items whose due date is before today', () => {
    const future = makeItem({ key: 'P-1', dueDate: '2026-09-01' })
    const today = makeItem({ key: 'P-2', dueDate: '2026-08-24' })
    const past = makeItem({ key: 'P-3', dueDate: '2026-08-01' })
    const r = overdueOpen.evaluate(makeProject([future, today, past]), ctx())
    expect(r.applicable).toBe(3)
    expect(r.violations.map((v) => v.itemKey)).toEqual(['P-3'])
  })
  it('ignores done items and items without due date', () => {
    const items = [makeItem({ statusCategory: 'done', dueDate: '2026-01-01' }), makeItem()]
    expect(overdueOpen.evaluate(makeProject(items), ctx()).applicable).toBe(0)
  })
})
