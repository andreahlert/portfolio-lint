import { describe, expect, it } from 'vitest'
import { overallocatedAssignee } from '../../src/rules/overallocated-assignee.js'
import { ctx, makeItem, makeProject } from '../fixtures.js'

describe('overallocated-assignee', () => {
  it('flags people above the WIP limit by name', () => {
    const items = [
      ...[1, 2, 3, 4].map(() => makeItem({ statusCategory: 'in_progress', assigneeId: 'u1' })),
      makeItem({ statusCategory: 'in_progress', assigneeId: 'u2' }),
      makeItem({ assigneeId: 'u1' }),
    ]
    const r = overallocatedAssignee.evaluate(makeProject(items, [{ id: 'u1', name: 'Ana' }]), ctx())
    expect(r.applicable).toBe(2)
    expect(r.violations).toHaveLength(1)
    expect(r.violations[0]?.itemKey).toBeUndefined()
    expect(r.violations[0]?.message).toContain('Ana has 4')
  })
  it('respects a custom limit', () => {
    const items = [1, 2, 3, 4].map(() => makeItem({ statusCategory: 'in_progress', assigneeId: 'u1' }))
    expect(overallocatedAssignee.evaluate(makeProject(items), ctx({ maxWipPerPerson: 4 })).violations).toHaveLength(0)
  })
  it('does not apply with no in-progress assignees', () => {
    expect(overallocatedAssignee.evaluate(makeProject([makeItem({ assigneeId: 'u1' })]), ctx()).applicable).toBe(0)
  })
})
