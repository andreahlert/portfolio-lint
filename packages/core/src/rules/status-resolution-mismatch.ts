import type { Rule } from './rule.js'
import { evaluateItems, isDone } from './helpers.js'

export const statusResolutionMismatch: Rule = {
  id: 'status-resolution-mismatch',
  dimension: 'consistency',
  weight: 2,
  description: 'Done items must have a resolution date, and only done items may have one.',
  forecastImpact:
    'Schedule forecasts learn cycle time from resolution dates. Done work without a resolution date, or open work with one, corrupts the throughput history the model trains on.',
  remediation: 'Fix the workflow so the done transition sets resolution and reopening clears it. Bulk-correct the listed items.',
  forecasts: ['schedule'],
  evaluate(project) {
    return evaluateItems(this.id, project, project.items, (i) => {
      if (isDone(i) && !i.resolvedAt) return `${i.key} is done but has no resolution date`
      if (!isDone(i) && i.resolvedAt) return `${i.key} has a resolution date but is not done`
      return null
    })
  },
}
