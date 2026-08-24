import type { Project, RuleResult, Violation, WorkItem } from '../model.js'

export function isDone(item: WorkItem): boolean {
  return item.statusCategory === 'done'
}

export function isOpen(item: WorkItem): boolean {
  return item.statusCategory !== 'done'
}

export function isEpic(item: WorkItem): boolean {
  return item.type === 'epic'
}

/** Whole days from `from` to `to`. Invalid dates yield 0 (treated as fresh). */
export function daysBetween(from: string, to: Date): number {
  const t = Date.parse(from)
  if (Number.isNaN(t)) return 0
  return Math.floor((to.getTime() - t) / 86_400_000)
}

/** Compare a date-only or datetime string with `now`, at day granularity. */
export function isBeforeToday(date: string, now: Date): boolean {
  const t = Date.parse(date)
  if (Number.isNaN(t)) return false
  const dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return t < dayStart
}

export function median(nums: number[]): number {
  if (nums.length === 0) return 0
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 1 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2
}

export function violation(ruleId: string, project: Project, message: string, item?: WorkItem): Violation {
  return item
    ? { ruleId, projectKey: project.key, itemKey: item.key, message }
    : { ruleId, projectKey: project.key, message }
}

/** Build a RuleResult from a population and a predicate that returns a message when violated. */
export function evaluateItems(
  ruleId: string,
  project: Project,
  population: WorkItem[],
  violates: (item: WorkItem) => string | null,
): RuleResult {
  const violations: Violation[] = []
  for (const item of population) {
    const msg = violates(item)
    if (msg) violations.push(violation(ruleId, project, msg, item))
  }
  return { ruleId, applicable: population.length, violations }
}

export function personName(project: Project, id: string): string {
  return project.people.find((p) => p.id === id)?.name ?? id
}
