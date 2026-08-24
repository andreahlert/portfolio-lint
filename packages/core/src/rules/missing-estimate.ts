import type { Rule } from './rule.js'
import { evaluateItems, isEpic, isOpen } from './helpers.js'

export const missingEstimate: Rule = {
  id: 'missing-estimate',
  dimension: 'completeness',
  weight: 3,
  description: 'Open, non-epic items must carry an estimate (points or hours).',
  forecastImpact:
    'Capacity and scope forecasts sum estimates. Every unestimated item is invisible to the model, so remaining work and team load are understated.',
  remediation:
    'Run an estimation session for the listed items. Make estimate a required field on transition out of backlog.',
  forecasts: ['capacity', 'scope'],
  evaluate(project) {
    const population = project.items.filter((i) => !isEpic(i) && isOpen(i))
    return evaluateItems(this.id, project, population, (i) =>
      i.estimate === undefined || i.estimate <= 0 ? `${i.key} has no estimate` : null,
    )
  },
}
