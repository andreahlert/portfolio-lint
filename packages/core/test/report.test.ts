import { describe, expect, it } from 'vitest'
import { lintPortfolio } from '../src/report.js'
import type { Portfolio } from '../src/model.js'
import { makeItem, makeProject, NOW } from './fixtures.js'

const NOW_ISO = NOW.toISOString()

function portfolio(projects: Portfolio['projects']): Portfolio {
  return { name: 'test', scannedAt: NOW_ISO, projects }
}

describe('lintPortfolio', () => {
  it('weights the portfolio score by item count', () => {
    const big = { ...makeProject(Array.from({ length: 10 }, () => makeItem({ estimate: 3, parentId: 'x' }))), key: 'BIG' }
    const small = { ...makeProject([makeItem(), makeItem()]), key: 'SMALL', id: 'p2' }
    const r = lintPortfolio(portfolio([big, small]), { now: NOW_ISO })
    const [pb, ps] = r.projects
    expect(pb?.key).toBe('BIG')
    expect(ps?.key).toBe('SMALL')
    const expected = Math.round(((pb!.score * 10 + ps!.score * 2) / 12) * 10) / 10
    expect(r.score).toBe(expected)
    expect(pb!.score).toBeGreaterThan(ps!.score)
  })

  it('computes traceability from missing-parent alone when there are no epics', () => {
    const p = makeProject([makeItem(), makeItem()])
    const r = lintPortfolio(portfolio([p]), { now: NOW_ISO })
    const pr = r.projects[0]!
    expect(pr.dimensions.traceability).toBe(0)
    expect(pr.rules.find((x) => x.id === 'epic-without-children')?.score).toBeNull()
  })

  it('skips disabled rules everywhere', () => {
    const p = makeProject([makeItem()])
    const r = lintPortfolio(portfolio([p]), { now: NOW_ISO, disabledRules: ['missing-estimate'] })
    expect(r.rulesEvaluated).not.toContain('missing-estimate')
    expect(r.projects[0]!.rules.some((x) => x.id === 'missing-estimate')).toBe(false)
    expect(r.remediation.some((x) => x.ruleId === 'missing-estimate')).toBe(false)
  })

  it('sorts remediation by priority and caps examples at 5', () => {
    const items = Array.from({ length: 8 }, (_, i) => makeItem({ key: `P-${i}`, parentId: 'e' }))
    const r = lintPortfolio(portfolio([makeProject(items)]), { now: NOW_ISO })
    const first = r.remediation[0]!
    expect(first.ruleId).toBe('missing-estimate')
    expect(first.examples).toHaveLength(5)
    expect(first.violations).toBe(8)
    for (let i = 1; i < r.remediation.length; i++) {
      expect(r.remediation[i - 1]!.priority).toBeGreaterThanOrEqual(r.remediation[i]!.priority)
    }
  })

  it('labels forecasts from the minimum of their rules', () => {
    const items = [makeItem({ estimate: 3, parentId: 'e' }), makeItem({ parentId: 'e' })]
    const r = lintPortfolio(portfolio([makeProject(items)]), { now: NOW_ISO })
    const pr = r.projects[0]!
    expect(pr.forecasts.capacity.score).toBe(50)
    expect(pr.forecasts.capacity.label).toBe('degraded')
    expect(pr.forecasts.schedule.score).toBe(100)
    expect(pr.forecasts.schedule.label).toBe('reliable')
  })

  it('handles an empty portfolio', () => {
    const r = lintPortfolio(portfolio([]), { now: NOW_ISO })
    expect(r.score).toBe(100)
    expect(r.grade).toBe('A')
    expect(r.forecasts.schedule.label).toBe('n/a')
  })
})
