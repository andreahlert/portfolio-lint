import { describe, expect, it } from 'vitest'
import { statusResolutionMismatch } from '../../src/rules/status-resolution-mismatch.js'
import { ctx, makeItem, makeProject } from '../fixtures.js'

describe('status-resolution-mismatch', () => {
  it('flags done without resolvedAt and open with resolvedAt', () => {
    const okDone = makeItem({ key: 'P-1', statusCategory: 'done', resolvedAt: '2026-08-10' })
    const okOpen = makeItem({ key: 'P-2' })
    const badDone = makeItem({ key: 'P-3', statusCategory: 'done' })
    const badOpen = makeItem({ key: 'P-4', statusCategory: 'in_progress', resolvedAt: '2026-08-10' })
    const r = statusResolutionMismatch.evaluate(makeProject([okDone, okOpen, badDone, badOpen]), ctx())
    expect(r.applicable).toBe(4)
    expect(r.violations.map((v) => v.itemKey)).toEqual(['P-3', 'P-4'])
  })
})
