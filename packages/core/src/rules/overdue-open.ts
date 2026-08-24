import type { Rule } from './rule.js'
import { evaluateItems, isBeforeToday, isOpen } from './helpers.js'

export const overdueOpen: Rule = {
  id: 'overdue-open',
  dimension: 'freshness',
  weight: 2,
  description: 'Open items must not have a due date in the past.',
  forecastImpact:
    'A past due date on open work means either the date or the status is wrong. Schedule forecasts trained on this data learn that commitments are meaningless.',
  remediation: 'For each listed item, either close it, move the due date with a reason, or escalate it as a slip.',
  forecasts: ['schedule'],
  evaluate(project, ctx) {
    const population = project.items.filter((i) => isOpen(i) && !!i.dueDate)
    return evaluateItems(this.id, project, population, (i) =>
      isBeforeToday(i.dueDate as string, ctx.now) ? `${i.key} is open and overdue (due ${i.dueDate})` : null,
    )
  },
}
