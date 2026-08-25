import { describe, expect, it } from 'vitest'
import { effectiveWipLimit, overallocatedAssignee } from '../../src/rules/overallocated-assignee.js'
import { resolveConfig } from '../../src/config.js'
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
  it('adapts the limit to the team once enough people have WIP', () => {
    // three people at 5 each, one at 9: median 5, limit max(3, 2*5)=10 capped at 10, nobody flagged
    const items = [
      ...[1, 2, 3, 4, 5].map(() => makeItem({ statusCategory: 'in_progress', assigneeId: 'u1' })),
      ...[1, 2, 3, 4, 5].map(() => makeItem({ statusCategory: 'in_progress', assigneeId: 'u2' })),
      ...[1, 2, 3, 4, 5].map(() => makeItem({ statusCategory: 'in_progress', assigneeId: 'u3' })),
      ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(() => makeItem({ statusCategory: 'in_progress', assigneeId: 'u4' })),
    ]
    const r = overallocatedAssignee.evaluate(makeProject(items), ctx())
    expect(r.applicable).toBe(4)
    expect(r.violations).toHaveLength(0)
  })
  it('still flags a real outlier in a busy team and shows the team median', () => {
    const items = [
      ...[1, 2, 3, 4].map(() => makeItem({ statusCategory: 'in_progress', assigneeId: 'u1' })),
      ...[1, 2, 3, 4].map(() => makeItem({ statusCategory: 'in_progress', assigneeId: 'u2' })),
      ...[1, 2, 3, 4].map(() => makeItem({ statusCategory: 'in_progress', assigneeId: 'u3' })),
      ...Array.from({ length: 12 }, () => makeItem({ statusCategory: 'in_progress', assigneeId: 'u4' })),
    ]
    const r = overallocatedAssignee.evaluate(makeProject(items, [{ id: 'u4', name: 'Bo' }]), ctx())
    expect(r.violations.map((v) => v.message)).toEqual(['Bo has 12 items in progress (limit 8, team median 4)'])
  })
  it('keeps the fixed baseline for small teams', () => {
    const items = [
      ...[1, 2, 3, 4, 5].map(() => makeItem({ statusCategory: 'in_progress', assigneeId: 'u1' })),
      ...[1, 2, 3, 4, 5].map(() => makeItem({ statusCategory: 'in_progress', assigneeId: 'u2' })),
    ]
    expect(overallocatedAssignee.evaluate(makeProject(items), ctx()).violations).toHaveLength(2)
  })
  it('effectiveWipLimit follows max(baseline, factor x median) capped at the hard limit', () => {
    const c = resolveConfig()
    expect(effectiveWipLimit([1, 1], c)).toEqual({ limit: 3, teamMedian: 1, adaptive: false })
    expect(effectiveWipLimit([1, 1, 1], c)).toEqual({ limit: 3, teamMedian: 1, adaptive: false })
    expect(effectiveWipLimit([3, 4, 5], c)).toEqual({ limit: 8, teamMedian: 4, adaptive: true })
    expect(effectiveWipLimit([8, 9, 10], c)).toEqual({ limit: 10, teamMedian: 9, adaptive: true })
    expect(effectiveWipLimit([3, 4, 5], resolveConfig({ wipAdaptiveMinPeople: 5 }))).toEqual({ limit: 3, teamMedian: 4, adaptive: false })
  })
})
