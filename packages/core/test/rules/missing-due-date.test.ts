import { describe, expect, it } from 'vitest'
import { missingDueDate } from '../../src/rules/missing-due-date.js'
import { ctx, makeItem, makeProject } from '../fixtures.js'

describe('missing-due-date', () => {
  it('flags open epics without due date', () => {
    const ok = makeItem({ key: 'E-1', type: 'epic', dueDate: '2026-12-01' })
    const bad = makeItem({ key: 'E-2', type: 'epic' })
    const r = missingDueDate.evaluate(makeProject([ok, bad]), ctx())
    expect(r.applicable).toBe(2)
    expect(r.violations.map((v) => v.itemKey)).toEqual(['E-2'])
  })
  it('ignores done epics and non-epics', () => {
    const doneEpic = makeItem({ type: 'epic', statusCategory: 'done' })
    const task = makeItem()
    expect(missingDueDate.evaluate(makeProject([doneEpic, task]), ctx()).applicable).toBe(0)
  })
})
