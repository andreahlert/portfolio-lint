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
  it('resolves links into other projects of the same scan', () => {
    const remote = makeItem({ id: 'remote', key: 'Q-1' })
    const local = makeItem({ key: 'P-1', dependsOn: ['remote'] })
    const withRemote = brokenDependency.evaluate(makeProject([local]), ctx({}, [remote]))
    expect(withRemote.violations).toHaveLength(0)
    const withoutRemote = brokenDependency.evaluate(makeProject([local]), ctx())
    expect(withoutRemote.violations.map((v) => v.itemKey)).toEqual(['P-1'])
  })
  it('does not apply without dependencies', () => {
    expect(brokenDependency.evaluate(makeProject([makeItem()]), ctx()).applicable).toBe(0)
  })
})
