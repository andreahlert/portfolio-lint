import type { Rule } from './rule.js'
import { evaluateItems } from './helpers.js'

export const missingAssignee: Rule = {
  id: 'missing-assignee',
  dimension: 'completeness',
  weight: 2,
  description: 'Items in progress must have an assignee.',
  forecastImpact:
    'Capacity forecasts allocate work to people. Unassigned in-progress work cannot be attributed, so per-person load and finish dates are wrong.',
  remediation: 'Assign an owner to each listed item. Add a workflow validator requiring assignee on the in-progress transition.',
  forecasts: ['capacity'],
  evaluate(project) {
    const population = project.items.filter((i) => i.statusCategory === 'in_progress')
    return evaluateItems(this.id, project, population, (i) =>
      i.assigneeId ? null : `${i.key} is in progress without an assignee`,
    )
  },
}
