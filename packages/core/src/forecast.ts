/**
 * Delivery forecast: Monte Carlo on historical throughput plus critical path over the
 * dependency graph. The point is not the date itself but how much of the uncertainty
 * comes from dirty data, so the report can say "fix these N items and the p85 moves by X weeks".
 */
import type { LintConfig } from './config.js'
import type { Portfolio, Project, WorkItem } from './model.js'
import { daysBetween, isBeforeToday, median } from './rules/helpers.js'
import { round1 } from './scorer.js'

export type ThroughputUnit = 'points' | 'items'
export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'none'
export type CommitmentVerdict = 'on-track' | 'at-risk' | 'late'
export type ForecastStatus = 'ok' | 'no-open-work' | 'no-history'

export interface FinishEstimate {
  weeks: number
  /** ISO date (yyyy-mm-dd). */
  date: string
}

export interface FinishRange {
  p50: FinishEstimate
  p85: FinishEstimate
  p95: FinishEstimate
}

export interface ThroughputSummary {
  unit: ThroughputUnit
  /** Weekly completed work over the history window, oldest week first. */
  perWeek: number[]
  mean: number
  /** Weeks in the window with any completed work. */
  activeWeeks: number
}

export interface RemainingWork {
  unit: ThroughputUnit
  openItems: number
  estimatedItems: number
  unestimatedItems: number
  /** Sum of known estimates (points mode) or open item count (items mode). */
  knownWork: number
  /** Median estimate in the project, used for unestimated items in the counterfactual. */
  typicalEstimate: number | null
}

export interface PathItem {
  key: string
  projectKey: string
  title: string
  estimate?: number
  /** Data problems on this item that distort the forecast. */
  issues: string[]
}

export interface CriticalPath {
  /** Blocker first, final item last. A single item means the heaviest open item outweighs every chain. */
  items: PathItem[]
  /** Path weight: estimates, with unestimated items counted at the typical estimate. */
  estimate: number
  unestimated: number
  crossProject: boolean
  /** Item keys of each cycle that touches this project. */
  cycles: string[][]
}

export interface Commitment {
  /** Latest due date among the project's open epics. */
  dueDate: string
  /** Weeks between the p85 finish and the commitment; positive means late. */
  p85SlipWeeks: number
  verdict: CommitmentVerdict
}

export interface ProjectForecast {
  key: string
  name: string
  status: ForecastStatus
  throughput: ThroughputSummary | null
  remaining: RemainingWork
  finish: FinishRange | null
  /** Same simulation with every unestimated open item pinned to the typical estimate. */
  finishIfEstimated: FinishRange | null
  /** p85 weeks now minus p85 weeks if estimated. How much uncertainty the missing estimates add. */
  scopeUncertaintyWeeks: number | null
  commitment: Commitment | null
  criticalPath: CriticalPath
  confidence: { level: ConfidenceLevel; reasons: string[] }
  /** Items whose data problems most distort this forecast, highest leverage first. */
  leverage: PathItem[]
}

export interface ForecastReport {
  historyWeeks: number
  simulations: number
  seed: number
  projects: ProjectForecast[]
  /** Latest p85 across projects: when the programme as a whole lands. */
  programme: { p85: FinishEstimate | null; drivenBy: string | null }
}

const WEEK_MS = 7 * 86_400_000
const MAX_WEEKS = 520
const LEVERAGE_LIMIT = 10
/** How much each data problem distorts a forecast. Missing size hurts most; an overdue date is only a symptom. */
const ISSUE_WEIGHT: Record<string, number> = { 'missing-estimate': 3, 'missing-assignee': 2, 'stale-in-progress': 2, 'overdue-open': 1 }

function issueWeight(i: PathItem): number {
  return i.issues.reduce((n, id) => n + (ISSUE_WEIGHT[id] ?? 1), 0)
}

/** mulberry32: small, seedable, good enough for bootstrap sampling. */
export function prng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))
  return sorted[idx] as number
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function finishAt(now: Date, weeks: number): FinishEstimate {
  return { weeks, date: isoDate(new Date(now.getTime() + weeks * WEEK_MS)) }
}

function hasEstimate(i: WorkItem): boolean {
  return i.estimate !== undefined && i.estimate > 0
}

function isOpenWork(i: WorkItem): boolean {
  return i.type !== 'epic' && i.statusCategory !== 'done'
}

export function weeklyThroughput(project: Project, now: Date, historyWeeks: number): { perWeek: number[]; unit: ThroughputUnit; doneInWindow: number } {
  const done = project.items.filter((i) => i.type !== 'epic' && i.statusCategory === 'done' && i.resolvedAt && !Number.isNaN(Date.parse(i.resolvedAt)))
  const inWindow: Array<{ bucket: number; item: WorkItem }> = []
  for (const item of done) {
    const age = now.getTime() - Date.parse(item.resolvedAt as string)
    if (age < 0) continue
    const bucket = Math.floor(age / WEEK_MS)
    if (bucket < historyWeeks) inWindow.push({ bucket, item })
  }
  const estimated = inWindow.filter((x) => hasEstimate(x.item)).length
  const unit: ThroughputUnit = inWindow.length > 0 && estimated / inWindow.length >= 0.5 ? 'points' : 'items'
  const perWeek = new Array<number>(historyWeeks).fill(0)
  for (const { bucket, item } of inWindow) {
    const idx = historyWeeks - 1 - bucket
    perWeek[idx] = (perWeek[idx] as number) + (unit === 'points' ? (item.estimate ?? 0) : 1)
  }
  return { perWeek, unit, doneInWindow: inWindow.length }
}

interface SimInput {
  knownWork: number
  unestimated: number
  estimatePool: number[]
  perWeek: number[]
  simulations: number
  seed: number
  /** When set, unestimated items take this value instead of a sample. */
  pinUnestimatedTo?: number
}

export function simulateFinish(input: SimInput): number[] {
  const rand = prng(input.seed)
  const active = input.perWeek.filter((w) => w > 0)
  if (active.length === 0) return []
  const results: number[] = []
  for (let s = 0; s < input.simulations; s += 1) {
    let remaining = input.knownWork
    for (let u = 0; u < input.unestimated; u += 1) {
      if (input.pinUnestimatedTo !== undefined) remaining += input.pinUnestimatedTo
      else remaining += input.estimatePool[Math.floor(rand() * input.estimatePool.length)] as number
    }
    let weeks = 0
    while (remaining > 0 && weeks < MAX_WEEKS) {
      remaining -= input.perWeek[Math.floor(rand() * input.perWeek.length)] as number
      weeks += 1
    }
    results.push(weeks)
  }
  return results.sort((a, b) => a - b)
}

function toRange(sorted: number[], now: Date): FinishRange {
  return {
    p50: finishAt(now, percentile(sorted, 0.5)),
    p85: finishAt(now, percentile(sorted, 0.85)),
    p95: finishAt(now, percentile(sorted, 0.95)),
  }
}

interface Graph {
  nodes: Map<string, WorkItem>
  projectOf: Map<string, string>
  weight: Map<string, number>
  /** Longest path weight ending at the node, and the predecessor on that path. */
  dist: Map<string, number>
  prev: Map<string, string | null>
  cycles: string[][]
}

function buildGraph(portfolio: Portfolio, typical: Map<string, number | null>, units: Map<string, ThroughputUnit>): Graph {
  const nodes = new Map<string, WorkItem>()
  const projectOf = new Map<string, string>()
  const weight = new Map<string, number>()
  for (const p of portfolio.projects) {
    for (const i of p.items) {
      if (!isOpenWork(i)) continue
      nodes.set(i.id, i)
      projectOf.set(i.id, p.key)
      const w = units.get(p.key) === 'points' ? (hasEstimate(i) ? (i.estimate as number) : (typical.get(p.key) ?? 1)) : 1
      weight.set(i.id, w)
    }
  }
  const dist = new Map<string, number>()
  const prev = new Map<string, string | null>()
  const state = new Map<string, 'active' | 'done'>()
  const stack: string[] = []
  const cycles: string[][] = []
  const seenCycles = new Set<string>()

  const visit = (id: string): number => {
    const cached = dist.get(id)
    if (cached !== undefined) return cached
    state.set(id, 'active')
    stack.push(id)
    let best = 0
    let bestPrev: string | null = null
    const item = nodes.get(id) as WorkItem
    for (const dep of item.dependsOn) {
      if (!nodes.has(dep)) continue
      if (state.get(dep) === 'active') {
        const start = stack.indexOf(dep)
        const cycle = stack.slice(start).map((x) => (nodes.get(x) as WorkItem).key)
        const sig = [...cycle].sort().join('|')
        if (!seenCycles.has(sig)) {
          seenCycles.add(sig)
          cycles.push(cycle)
        }
        continue
      }
      const d = visit(dep)
      if (d > best || bestPrev === null) {
        best = d
        bestPrev = dep
      }
    }
    stack.pop()
    state.set(id, 'done')
    const total = best + (weight.get(id) as number)
    dist.set(id, total)
    prev.set(id, bestPrev)
    return total
  }
  for (const id of nodes.keys()) visit(id)
  return { nodes, projectOf, weight, dist, prev, cycles }
}

function itemIssues(item: WorkItem, config: LintConfig, now: Date): string[] {
  const issues: string[] = []
  if (!hasEstimate(item)) issues.push('missing-estimate')
  if (item.statusCategory === 'in_progress' && !item.assigneeId) issues.push('missing-assignee')
  if (item.statusCategory === 'in_progress' && daysBetween(item.updatedAt, now) > config.staleInProgressDays) issues.push('stale-in-progress')
  if (item.dueDate && isBeforeToday(item.dueDate, now)) issues.push('overdue-open')
  return issues
}

function pathItem(item: WorkItem, projectKey: string, config: LintConfig, now: Date): PathItem {
  const out: PathItem = { key: item.key, projectKey, title: item.title, issues: itemIssues(item, config, now) }
  if (hasEstimate(item)) out.estimate = item.estimate as number
  return out
}

function criticalPathFor(project: Project, graph: Graph, config: LintConfig, now: Date): CriticalPath {
  let endId: string | null = null
  let best = -1
  for (const i of project.items) {
    const d = graph.dist.get(i.id)
    if (d !== undefined && d > best) {
      best = d
      endId = i.id
    }
  }
  const chain: WorkItem[] = []
  let cursor = endId
  while (cursor) {
    chain.push(graph.nodes.get(cursor) as WorkItem)
    cursor = graph.prev.get(cursor) ?? null
  }
  chain.reverse()
  const items = chain.map((i) => pathItem(i, graph.projectOf.get(i.id) as string, config, now))
  const localKeys = new Set(project.items.map((i) => i.key))
  const cycles = graph.cycles.filter((c) => c.some((k) => localKeys.has(k)))
  return {
    items,
    estimate: items.length > 0 ? round1(chain.reduce((n, i) => n + (graph.weight.get(i.id) as number), 0)) : 0,
    unestimated: items.filter((i) => i.estimate === undefined).length,
    crossProject: items.some((i) => i.projectKey !== project.key),
    cycles,
  }
}

function latestEpicDue(project: Project): string | null {
  let latest: string | null = null
  for (const i of project.items) {
    if (i.type !== 'epic' || i.statusCategory === 'done' || !i.dueDate) continue
    if (Number.isNaN(Date.parse(i.dueDate))) continue
    if (latest === null || Date.parse(i.dueDate) > Date.parse(latest)) latest = i.dueDate
  }
  return latest
}

function commitmentFor(dueDate: string | null, finish: FinishRange | null, now: Date): Commitment | null {
  if (!dueDate || !finish) return null
  const due = Date.parse(dueDate)
  const p85 = now.getTime() + finish.p85.weeks * WEEK_MS
  const p50 = now.getTime() + finish.p50.weeks * WEEK_MS
  const slip = round1((p85 - due) / WEEK_MS)
  const verdict: CommitmentVerdict = p85 <= due ? 'on-track' : p50 <= due ? 'at-risk' : 'late'
  return { dueDate: dueDate.slice(0, 10), p85SlipWeeks: slip, verdict }
}

function confidenceFor(f: Omit<ProjectForecast, 'confidence' | 'leverage'>, historyWeeks: number): { level: ConfidenceLevel; reasons: string[] } {
  if (f.status !== 'ok' || !f.throughput || !f.finish) {
    const reason =
      f.status === 'no-open-work'
        ? 'no open work to forecast'
        : `no completed items with a resolution date in the last ${historyWeeks} weeks, so throughput is unknown`
    return { level: 'none', reasons: [reason] }
  }
  const reasons: string[] = []
  let level: ConfidenceLevel = 'high'
  const downgrade = (to: ConfidenceLevel, reason: string) => {
    reasons.push(reason)
    if (to === 'low' || level === 'high') level = to
  }
  if (f.throughput.activeWeeks < 4) {
    downgrade('low', `only ${f.throughput.activeWeeks} of the last ${historyWeeks} weeks have completed work`)
  }
  const share = f.remaining.openItems === 0 ? 0 : f.remaining.unestimatedItems / f.remaining.openItems
  if (f.remaining.unit === 'points' && share > 0.3) {
    downgrade('low', `${f.remaining.unestimatedItems} of ${f.remaining.openItems} open items (${Math.round(share * 100)}%) have no estimate`)
  } else if (f.remaining.unit === 'points' && share > 0.1) {
    downgrade('medium', `${f.remaining.unestimatedItems} of ${f.remaining.openItems} open items (${Math.round(share * 100)}%) have no estimate`)
  }
  if (f.remaining.unit === 'items' && f.remaining.unestimatedItems > 0) {
    downgrade('medium', `throughput measured in items because most completed work has no estimate; item sizes are assumed equal`)
  }
  if (f.criticalPath.unestimated > 0) {
    downgrade('medium', `${f.criticalPath.unestimated} of ${f.criticalPath.items.length} items on the critical path have no estimate`)
  }
  for (const c of f.criticalPath.cycles) downgrade('low', `dependency cycle: ${[...c, c[0]].join(' -> ')}`)
  const active = f.throughput.perWeek.filter((w) => w > 0)
  if (active.length >= 4) {
    const m = active.reduce((a, b) => a + b, 0) / active.length
    const sd = Math.sqrt(active.reduce((a, b) => a + (b - m) ** 2, 0) / active.length)
    if (m > 0 && sd / m > 1) downgrade('medium', `weekly throughput is erratic (coefficient of variation ${round1(sd / m)})`)
  }
  if (f.finish.p95.weeks >= MAX_WEEKS) downgrade('low', 'some simulations never finish within 10 years; throughput is too low for the remaining work')
  return { level, reasons }
}

function leverageFor(project: Project, path: CriticalPath, config: LintConfig, now: Date): PathItem[] {
  const out: PathItem[] = path.items.filter((i) => i.issues.length > 0)
  const onPath = new Set(out.map((i) => i.key))
  const inProgress = project.items
    .filter((i) => isOpenWork(i) && i.statusCategory === 'in_progress' && !onPath.has(i.key))
    .map((i) => pathItem(i, project.key, config, now))
    .filter((i) => i.issues.length > 0)
    .sort((a, b) => issueWeight(b) - issueWeight(a))
  return [...out.sort((a, b) => issueWeight(b) - issueWeight(a)), ...inProgress].slice(0, LEVERAGE_LIMIT)
}

export function forecastPortfolio(portfolio: Portfolio, config: LintConfig, now: Date): ForecastReport {
  const { historyWeeks, simulations, seed } = config.forecast
  const typical = new Map<string, number | null>()
  const units = new Map<string, ThroughputUnit>()
  const throughputs = new Map<string, ReturnType<typeof weeklyThroughput>>()
  for (const p of portfolio.projects) {
    const pool = p.items.filter(hasEstimate).map((i) => i.estimate as number)
    typical.set(p.key, pool.length > 0 ? median(pool) : null)
    const t = weeklyThroughput(p, now, historyWeeks)
    // Points mode needs an estimate pool to price unestimated work; otherwise fall back to items.
    if (t.unit === 'points' && pool.length === 0) t.unit = 'items'
    throughputs.set(p.key, t)
    units.set(p.key, t.unit)
  }
  const graph = buildGraph(portfolio, typical, units)

  const projects: ProjectForecast[] = portfolio.projects.map((project, index) => {
    const t = throughputs.get(project.key) as ReturnType<typeof weeklyThroughput>
    const open = project.items.filter(isOpenWork)
    const estimated = open.filter(hasEstimate)
    const unestimated = open.length - estimated.length
    const unit = t.unit
    const remaining: RemainingWork = {
      unit,
      openItems: open.length,
      estimatedItems: estimated.length,
      unestimatedItems: unestimated,
      knownWork: unit === 'points' ? round1(estimated.reduce((n, i) => n + (i.estimate as number), 0)) : open.length,
      typicalEstimate: typical.get(project.key) ?? null,
    }
    const activeWeeks = t.perWeek.filter((w) => w > 0).length
    const throughput: ThroughputSummary | null =
      t.doneInWindow > 0
        ? { unit, perWeek: t.perWeek.map(round1), mean: round1(t.perWeek.reduce((a, b) => a + b, 0) / historyWeeks), activeWeeks }
        : null
    const status: ForecastStatus = open.length === 0 ? 'no-open-work' : throughput === null ? 'no-history' : 'ok'

    let finish: FinishRange | null = null
    let finishIfEstimated: FinishRange | null = null
    let scopeUncertaintyWeeks: number | null = null
    if (status === 'ok') {
      const pool = project.items.filter(hasEstimate).map((i) => i.estimate as number)
      const base = {
        knownWork: remaining.knownWork,
        unestimated: unit === 'points' ? unestimated : 0,
        estimatePool: pool,
        perWeek: t.perWeek,
        simulations,
        seed: seed + index,
      }
      const runs = simulateFinish(base)
      finish = toRange(runs, now)
      if (unit === 'points' && unestimated > 0) {
        const pinned = simulateFinish({ ...base, pinUnestimatedTo: typical.get(project.key) ?? 0 })
        finishIfEstimated = toRange(pinned, now)
        scopeUncertaintyWeeks = finish.p85.weeks - finishIfEstimated.p85.weeks
      } else {
        finishIfEstimated = finish
        scopeUncertaintyWeeks = 0
      }
    }

    const criticalPath = criticalPathFor(project, graph, config, now)
    const partial = {
      key: project.key,
      name: project.name,
      status,
      throughput,
      remaining,
      finish,
      finishIfEstimated,
      scopeUncertaintyWeeks,
      commitment: commitmentFor(latestEpicDue(project), finish, now),
      criticalPath,
    }
    return { ...partial, confidence: confidenceFor(partial, historyWeeks), leverage: leverageFor(project, criticalPath, config, now) }
  })

  let programme: ForecastReport['programme'] = { p85: null, drivenBy: null }
  for (const p of projects) {
    if (p.finish && (!programme.p85 || p.finish.p85.weeks > programme.p85.weeks)) programme = { p85: p.finish.p85, drivenBy: p.key }
  }
  return { historyWeeks, simulations, seed, projects, programme }
}
