import { describe, expect, it } from 'vitest'
import { missingAssignee } from '../../src/rules/missing-assignee.js'
import { ctx, makeItem, makeProject } from '../fixtures.js'

describe('missing-assignee', () => {
  it('flags in-progress items with no assignee', () => {
    const ok = makeItem({ key: 'P-1', statusCategory: 'in_progress', assigneeId: 'u1' })
    const bad = makeItem({ key: 'P-2', statusCategory: 'in_progress' })
    const r = missingAssignee.evaluate(makeProject([ok, bad]), ctx())
    expect(r.applicable).toBe(2)
    expect(r.violations.map((v) => v.itemKey)).toEqual(['P-2'])
  })
  it('does not apply to todo or done items', () => {
    const r = missingAssignee.evaluate(makeProject([makeItem(), makeItem({ statusCategory: 'done' })]), ctx())
    expect(r.applicable).toBe(0)
  })
})
