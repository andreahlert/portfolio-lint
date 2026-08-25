import type { Rule } from './rule.js'
import type { WorkItem } from '../model.js'
import { violation } from './helpers.js'

/**
 * Strongly connected components of the dependency graph (Tarjan). Nodes are item ids,
 * edges go from an item to the items it depends on. Returns only components that form a cycle.
 */
export function dependencyCycles(items: WorkItem[]): WorkItem[][] {
  const byId = new Map(items.map((i) => [i.id, i]))
  const index = new Map<string, number>()
  const low = new Map<string, number>()
  const onStack = new Set<string>()
  const stack: string[] = []
  const cycles: WorkItem[][] = []
  let counter = 0

  const visit = (id: string): void => {
    index.set(id, counter)
    low.set(id, counter)
    counter += 1
    stack.push(id)
    onStack.add(id)
    const item = byId.get(id) as WorkItem
    for (const dep of item.dependsOn) {
      if (!byId.has(dep)) continue
      if (!index.has(dep)) {
        visit(dep)
        low.set(id, Math.min(low.get(id) as number, low.get(dep) as number))
      } else if (onStack.has(dep)) {
        low.set(id, Math.min(low.get(id) as number, index.get(dep) as number))
      }
    }
    if (low.get(id) === index.get(id)) {
      const component: WorkItem[] = []
      let top: string | undefined
      do {
        top = stack.pop()
        if (top === undefined) break
        onStack.delete(top)
        component.push(byId.get(top) as WorkItem)
      } while (top !== id)
      const selfLoop = component.length === 1 && (component[0] as WorkItem).dependsOn.includes(id)
      if (component.length > 1 || selfLoop) cycles.push(component.reverse())
    }
  }

  for (const item of items) if (!index.has(item.id)) visit(item.id)
  return cycles
}

export const dependencyCycle: Rule = {
  id: 'dependency-cycle',
  dimension: 'consistency',
  weight: 2,
  description: 'Dependencies must not form a cycle (A blocks B blocks A).',
  forecastImpact:
    'A cycle has no valid order, so critical path and start dates cannot be computed for anything downstream of it. Forecasting tools either drop the whole chain or loop.',
  remediation: 'Break each listed cycle by removing or reversing one link. Usually one of the links was meant as "relates to", not "blocks".',
  forecasts: ['schedule'],
  evaluate(project) {
    const population = project.items.filter((i) => i.dependsOn.length > 0)
    const violations = []
    for (const cycle of dependencyCycles(project.items)) {
      const chain = [...cycle.map((i) => i.key), (cycle[0] as WorkItem).key].join(' -> ')
      for (const item of cycle) violations.push(violation(this.id, project, `${item.key} is in a dependency cycle: ${chain}`, item))
    }
    return { ruleId: this.id, applicable: population.length, violations }
  },
}
