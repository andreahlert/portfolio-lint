import type { Person, Project, WorkItem } from '../src/model.js'
import { resolveConfig, type LintConfig } from '../src/config.js'
import type { RuleContext } from '../src/rules/rule.js'

export const NOW = new Date('2026-08-24T00:00:00Z')

let seq = 0

export function makeItem(overrides: Partial<WorkItem> = {}): WorkItem {
  seq += 1
  const id = overrides.id ?? `id-${seq}`
  return {
    id,
    key: overrides.key ?? `P-${seq}`,
    title: 'Item',
    type: 'task',
    status: 'To Do',
    statusCategory: 'todo',
    dependsOn: [],
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-20T00:00:00Z',
    labels: [],
    ...overrides,
  }
}

export function makeProject(items: WorkItem[], people: Person[] = []): Project {
  return {
    id: 'proj-1',
    key: 'P',
    name: 'Project P',
    source: 'csv',
    estimateUnit: 'points',
    items,
    people,
  }
}

export function ctx(config: Partial<LintConfig> = {}): RuleContext {
  return { config: resolveConfig(config), now: NOW }
}

/** ISO datetime N days before NOW. */
export function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * 86_400_000).toISOString()
}
