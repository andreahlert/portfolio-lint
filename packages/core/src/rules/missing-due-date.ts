import type { Rule } from './rule.js'
import { evaluateItems, isEpic, isOpen } from './helpers.js'

export const missingDueDate: Rule = {
  id: 'missing-due-date',
  dimension: 'completeness',
  weight: 2,
  description: 'Open epics must have a due date.',
  forecastImpact:
    'Schedule forecasts compare projected finish against commitment. Without a due date on the epic there is no commitment to measure slippage against.',
  remediation: 'Set a target date on each listed epic, even if provisional. Review dates at every portfolio checkpoint.',
  forecasts: ['schedule'],
  evaluate(project) {
    const population = project.items.filter((i) => isEpic(i) && isOpen(i))
    return evaluateItems(this.id, project, population, (i) =>
      i.dueDate ? null : `${i.key} is an open epic without a due date`,
    )
  },
}
