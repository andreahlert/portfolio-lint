import { describe, expect, it } from 'vitest'
import { forecastPortfolio, percentile, prng, simulateFinish, weeklyThroughput } from '../src/forecast.js'
import { resolveConfig } from '../src/config.js'
import { NOW, daysAgo, makeItem, makeProject } from './fixtures.js'
import type { Portfolio, WorkItem } from '../src/model.js'

const cfg = resolveConfig({ forecast: { simulations: 500, seed: 7 } })

function done(estimate: number | undefined, daysBack: number): WorkItem {
  return makeItem({ statusCategory: 'done', status: 'Done', estimate, resolvedAt: daysAgo(daysBack), updatedAt: daysAgo(daysBack) })
}

function portfolioOf(items: WorkItem[], key = 'P'): Portfolio {
  return { name: 't', scannedAt: NOW.toISOString(), projects: [{ ...makeProject(items), key, id: key }] }
}

describe('forecast primitives', () => {
  it('prng is deterministic and in [0, 1)', () => {
    const a = prng(1)
    const b = prng(1)
    const xs = Array.from({ length: 100 }, () => a())
    expect(Array.from({ length: 100 }, () => b())).toEqual(xs)
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true)
  })
  it('percentile picks by rank', () => {
    expect(percentile([1, 2, 3, 4, 5], 0.5)).toBe(3)
    expect(percentile([1, 2, 3, 4, 5], 0.85)).toBe(4)
    expect(percentile([], 0.5)).toBe(0)
  })
  it('weeklyThroughput buckets resolutions oldest first and picks the unit by estimate coverage', () => {
    const items = [done(5, 1), done(3, 2), done(8, 9), done(undefined, 30)]
    const t = weeklyThroughput(makeProject(items), NOW, 4)
    expect(t.unit).toBe('points')
    expect(t.perWeek).toEqual([0, 0, 8, 8])
    expect(t.doneInWindow).toBe(3)
    const mostlyUnestimated = weeklyThroughput(makeProject([done(undefined, 1), done(undefined, 2), done(4, 3)]), NOW, 4)
    expect(mostlyUnestimated.unit).toBe('items')
    expect(mostlyUnestimated.perWeek).toEqual([0, 0, 0, 3])
  })
  it('simulateFinish returns sorted weeks and finishes faster with more throughput', () => {
    const slow = simulateFinish({ knownWork: 100, unestimated: 0, estimatePool: [5], perWeek: [5, 5, 5, 5], simulations: 50, seed: 1 })
    const fast = simulateFinish({ knownWork: 100, unestimated: 0, estimatePool: [5], perWeek: [20, 20, 20, 20], simulations: 50, seed: 1 })
    expect(slow).toEqual([...slow].sort((a, b) => a - b))
    expect(percentile(slow, 0.5)).toBe(20)
    expect(percentile(fast, 0.5)).toBe(5)
    expect(simulateFinish({ knownWork: 10, unestimated: 0, estimatePool: [], perWeek: [0, 0], simulations: 5, seed: 1 })).toEqual([])
  })
})

describe('forecastPortfolio', () => {
  it('reports no-open-work and no-history states without dates', () => {
    const idle = forecastPortfolio(portfolioOf([done(3, 2)]), cfg, NOW).projects[0]!
    expect(idle.status).toBe('no-open-work')
    expect(idle.finish).toBeNull()
    expect(idle.confidence.level).toBe('none')
    const fresh = forecastPortfolio(portfolioOf([makeItem({ estimate: 3 })]), cfg, NOW).projects[0]!
    expect(fresh.status).toBe('no-history')
    expect(fresh.confidence.reasons[0]).toContain('no completed items')
  })
  it('turns missing estimates into scope uncertainty and a leverage list', () => {
    const history = Array.from({ length: 12 }, (_, w) => [done(5, w * 7 + 1), done(5, w * 7 + 3)]).flat()
    const open = [
      ...Array.from({ length: 10 }, () => makeItem({ estimate: 5 })),
      ...Array.from({ length: 10 }, () => makeItem({ statusCategory: 'in_progress', status: 'In Progress', assigneeId: 'u1' })),
      makeItem({ estimate: 50 }),
    ]
    const p = forecastPortfolio(portfolioOf([...history, ...open]), cfg, NOW).projects[0]!
    expect(p.status).toBe('ok')
    expect(p.remaining).toMatchObject({ unit: 'points', openItems: 21, unestimatedItems: 10, knownWork: 100, typicalEstimate: 5 })
    expect(p.throughput?.mean).toBe(10)
    expect(p.finish!.p85.weeks).toBeGreaterThanOrEqual(p.finishIfEstimated!.p85.weeks)
    expect(p.scopeUncertaintyWeeks).toBeGreaterThanOrEqual(0)
    expect(p.confidence.level).toBe('low')
    expect(p.confidence.reasons.some((r) => r.includes('48%'))).toBe(true)
    expect(p.leverage.length).toBe(10)
    expect(p.leverage.every((i) => i.issues.includes('missing-estimate'))).toBe(true)
    // heaviest single item is the "critical path" when nothing chains
    expect(p.criticalPath.items.map((i) => i.estimate)).toEqual([50])
  })
  it('follows the longest dependency chain across projects and flags cycles', () => {
    const history = Array.from({ length: 12 }, (_, w) => done(4, w * 7 + 1))
    const remote = makeItem({ id: 'r1', key: 'Q-1', estimate: 8 })
    const a = makeItem({ id: 'a', key: 'P-1', estimate: 3, dependsOn: ['r1'] })
    const b = makeItem({ id: 'b', key: 'P-2', dependsOn: ['a'] })
    const c = makeItem({ id: 'c', key: 'P-3', estimate: 2, dependsOn: ['b'] })
    const x = makeItem({ id: 'x', key: 'P-8', estimate: 1, dependsOn: ['y'] })
    const y = makeItem({ id: 'y', key: 'P-9', estimate: 1, dependsOn: ['x'] })
    const portfolio: Portfolio = {
      name: 't',
      scannedAt: NOW.toISOString(),
      projects: [
        { ...makeProject([...history, a, b, c, x, y]), key: 'P', id: 'P' },
        { ...makeProject([remote, done(8, 3)]), key: 'Q', id: 'Q' },
      ],
    }
    const [p, q] = forecastPortfolio(portfolio, cfg, NOW).projects
    expect(p!.criticalPath.items.map((i) => i.key)).toEqual(['Q-1', 'P-1', 'P-2', 'P-3'])
    expect(p!.criticalPath.crossProject).toBe(true)
    expect(p!.criticalPath.unestimated).toBe(1)
    // 8 + 3 + typical(median of 4,4,...,3,2,1,1 = 4) + 2
    expect(p!.criticalPath.estimate).toBe(17)
    expect(p!.criticalPath.cycles).toEqual([['P-8', 'P-9']])
    expect(p!.confidence.level).toBe('low')
    expect(p!.confidence.reasons.some((r) => r.includes('dependency cycle'))).toBe(true)
    expect(p!.leverage[0]!.key).toBe('P-2')
    expect(q!.criticalPath.items.map((i) => i.key)).toEqual(['Q-1'])
  })
  it('compares p85 with the latest open epic due date', () => {
    const history = Array.from({ length: 12 }, (_, w) => done(10, w * 7 + 1))
    const epic = makeItem({ type: 'epic', dueDate: daysAgo(-70) })
    const late = forecastPortfolio(portfolioOf([...history, epic, makeItem({ estimate: 200 })]), cfg, NOW).projects[0]!
    expect(late.commitment?.verdict).toBe('late')
    expect(late.commitment?.p85SlipWeeks).toBeGreaterThan(0)
    const ok = forecastPortfolio(portfolioOf([...history, epic, makeItem({ estimate: 20 })]), cfg, NOW).projects[0]!
    expect(ok.commitment?.verdict).toBe('on-track')
    expect(ok.commitment?.dueDate).toBe(daysAgo(-70).slice(0, 10))
  })
})
