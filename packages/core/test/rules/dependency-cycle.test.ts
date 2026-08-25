import { describe, expect, it } from 'vitest'
import { dependencyCycle, dependencyCycles } from '../../src/rules/dependency-cycle.js'
import { ctx, makeItem, makeProject } from '../fixtures.js'

describe('dependency-cycle', () => {
  it('flags every item on a cycle and names the chain', () => {
    const a = makeItem({ id: 'a', key: 'P-1', dependsOn: ['c'] })
    const b = makeItem({ id: 'b', key: 'P-2', dependsOn: ['a'] })
    const c = makeItem({ id: 'c', key: 'P-3', dependsOn: ['b'] })
    const d = makeItem({ id: 'd', key: 'P-4', dependsOn: ['a'] })
    const r = dependencyCycle.evaluate(makeProject([a, b, c, d]), ctx())
    expect(r.applicable).toBe(4)
    expect(r.violations.map((v) => v.itemKey).sort()).toEqual(['P-1', 'P-2', 'P-3'])
    expect(r.violations[0]?.message).toMatch(/P-\d -> P-\d -> P-\d -> P-\d/)
  })
  it('flags a self dependency', () => {
    const a = makeItem({ id: 'a', key: 'P-1', dependsOn: ['a'] })
    const r = dependencyCycle.evaluate(makeProject([a]), ctx())
    expect(r.violations.map((v) => v.itemKey)).toEqual(['P-1'])
  })
  it('ignores dangling links and acyclic chains', () => {
    const a = makeItem({ id: 'a', dependsOn: ['ghost'] })
    const b = makeItem({ id: 'b', dependsOn: ['a'] })
    const c = makeItem({ id: 'c', dependsOn: ['a', 'b'] })
    expect(dependencyCycle.evaluate(makeProject([a, b, c]), ctx()).violations).toHaveLength(0)
    expect(dependencyCycles([a, b, c])).toEqual([])
  })
  it('does not apply without dependencies', () => {
    expect(dependencyCycle.evaluate(makeProject([makeItem()]), ctx()).applicable).toBe(0)
  })
  it('handles long chains without blowing the stack', () => {
    const items = Array.from({ length: 5000 }, (_, i) => makeItem({ id: `n${i}`, dependsOn: i > 0 ? [`n${i - 1}`] : [] }))
    expect(dependencyCycles(items)).toEqual([])
  })
})
