import type { Rule } from './rule.js'
import { evaluateItems, isEpic, median } from './helpers.js'

export const estimateOutlier: Rule = {
  id: 'estimate-outlier',
  dimension: 'consistency',
  weight: 1,
  description: 'Estimates should be on the same scale; no item should exceed factor x median (default 5x). Needs at least 5 estimated items.',
  forecastImpact:
    'Capacity forecasts treat estimates as comparable units. One item estimated on a different scale skews velocity and remaining-work sums.',
  remediation: 'Re-estimate the listed items or split them. Agree on one scale (Fibonacci points or hours) per project.',
  forecasts: ['capacity'],
  evaluate(project, ctx) {
    const estimated = project.items.filter((i) => !isEpic(i) && typeof i.estimate === 'number' && i.estimate > 0)
    if (estimated.length < 5) return { ruleId: this.id, applicable: 0, violations: [] }
    const med = median(estimated.map((i) => i.estimate as number))
    const limit = ctx.config.outlierFactor * med
    return evaluateItems(this.id, project, estimated, (i) =>
      (i.estimate as number) > limit ? `${i.key} estimate ${i.estimate} exceeds ${ctx.config.outlierFactor}x median (${med})` : null,
    )
  },
}
