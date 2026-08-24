import { describe, expect, it } from 'vitest'
import { brokenDependency } from '../../src/rules/broken-dependency.js'
import { ctx, makeItem, makeProject } from '../fixtures.js'

describe('broken-dependency', () => {
  it('flags dependencies on unknown ids and lists them', () => {
    const a = makeItem({ id: 'a', key: 'P-1' })
    const ok = makeItem({ key: 'P-2', dependsOn: ['a'] })
    const bad = makeItem({ key: 'P-3', dependsOn: ['a', 'ghost'] })
    const r = brokenDependency.evaluate(makeProject([a, ok, bad]), ctx())
    expect(r.applicable).toBe(2)
    expect(r.violations.map((v) => v.itemKey)).toEqual(['P-3'])
    expect(r.violations[0]?.message).toContain('ghost')
  })
  it('does not apply without dependencies', () => {
    expect(brokenDependency.evaluate(makeProject([makeItem()]), ctx()).applicable).toBe(0)
  })
})
