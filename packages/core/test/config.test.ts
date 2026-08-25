import { describe, expect, it } from 'vitest'
import { configForProject, resolveConfig } from '../src/config.js'
import { lintPortfolio } from '../src/report.js'
import { makeItem, makeProject } from './fixtures.js'

describe('config', () => {
  it('fills forecast defaults and keeps per-project overrides', () => {
    const c = resolveConfig({ forecast: { simulations: 10 }, projects: { A: { staleOpenDays: 30 } } })
    expect(c.forecast).toEqual({ enabled: true, historyWeeks: 12, simulations: 10, seed: 42 })
    expect(c.projects).toEqual({ A: { staleOpenDays: 30 } })
  })
  it('configForProject applies overrides, unions disabled rules and hides other projects', () => {
    const c = resolveConfig({ disabledRules: ['stale-open'], projects: { A: { maxWipPerPerson: 6, disabledRules: ['missing-parent'] }, B: {} } })
    const a = configForProject(c, 'A')
    expect(a.maxWipPerPerson).toBe(6)
    expect(a.disabledRules.sort()).toEqual(['missing-parent', 'stale-open'])
    expect(a.projects).toBeUndefined()
    const z = configForProject(c, 'Z')
    expect(z.maxWipPerPerson).toBe(3)
    expect(z.disabledRules).toEqual(['stale-open'])
  })
  it('a rule disabled for one project is skipped there, still scored elsewhere, and never feeds its forecast', () => {
    const a = { ...makeProject([makeItem({ type: 'task', statusCategory: 'in_progress', assigneeId: 'u1' })]), key: 'A', id: 'A' }
    const b = { ...makeProject([makeItem({ type: 'task', statusCategory: 'in_progress', assigneeId: 'u1' })]), key: 'B', id: 'B' }
    const report = lintPortfolio(
      { name: 't', scannedAt: '2026-08-24T00:00:00Z', projects: [a, b] },
      { now: '2026-08-24T00:00:00Z', forecast: { enabled: false }, projects: { A: { disabledRules: ['missing-estimate'] } } },
    )
    const ruleA = report.projects[0]!.rules.find((r) => r.id === 'missing-estimate')!
    const ruleB = report.projects[1]!.rules.find((r) => r.id === 'missing-estimate')!
    expect(ruleA).toMatchObject({ applicable: 0, violations: 0, score: null })
    expect(ruleB.score).toBe(0)
    expect(report.projects[0]!.forecasts.scope.limitedBy).not.toBe('missing-estimate')
    expect(report.projects[1]!.forecasts.scope.limitedBy).toBe('missing-estimate')
    expect(report.forecast).toBeUndefined()
  })
})
