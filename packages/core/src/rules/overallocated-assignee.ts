import type { Rule } from './rule.js'
import { personName, violation } from './helpers.js'

export const overallocatedAssignee: Rule = {
  id: 'overallocated-assignee',
  dimension: 'consistency',
  weight: 2,
  description: 'No person should have more in-progress items than the WIP limit (default 3).',
  forecastImpact:
    'Capacity forecasts assume a person finishes what they start. Someone with many parallel items is multitasking or mis-statused, so per-person throughput is unpredictable.',
  remediation: 'Have the listed people finish or park items until they are under the limit. Enforce a WIP limit on the board.',
  forecasts: ['capacity'],
  evaluate(project, ctx) {
    const counts = new Map<string, number>()
    for (const i of project.items) {
      if (i.statusCategory === 'in_progress' && i.assigneeId) {
        counts.set(i.assigneeId, (counts.get(i.assigneeId) ?? 0) + 1)
      }
    }
    const violations = []
    for (const [id, n] of counts) {
      if (n > ctx.config.maxWipPerPerson) {
        violations.push(
          violation(this.id, project, `${personName(project, id)} has ${n} items in progress (limit ${ctx.config.maxWipPerPerson})`),
        )
      }
    }
    return { ruleId: this.id, applicable: counts.size, violations }
  },
}
