import { describe, expect, it } from 'vitest'
import { missingParent } from '../../src/rules/missing-parent.js'
import { ctx, makeItem, makeProject } from '../fixtures.js'

describe('missing-parent', () => {
  it('flags non-epic items without parent', () => {
    const epic = makeItem({ id: 'e1', key: 'E-1', type: 'epic' })
    const ok = makeItem({ key: 'P-1', parentId: 'e1' })
    const bad = makeItem({ key: 'P-2' })
    const r = missingParent.evaluate(makeProject([epic, ok, bad]), ctx())
    expect(r.applicable).toBe(2)
    expect(r.violations.map((v) => v.itemKey)).toEqual(['P-2'])
  })
  it('does not apply when only epics exist', () => {
    expect(missingParent.evaluate(makeProject([makeItem({ type: 'epic' })]), ctx()).applicable).toBe(0)
  })
})
