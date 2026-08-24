import type { Rule } from './rule.js'
import { daysBetween, evaluateItems } from './helpers.js'

export const staleInProgress: Rule = {
  id: 'stale-in-progress',
  dimension: 'freshness',
  weight: 3,
  description: 'Items in progress must have been updated recently (default 14 days).',
  forecastImpact:
    'Schedule forecasts assume in-progress work is moving. Stale items inflate work-in-progress and hide blocked work, so projected finish dates are optimistic.',
  remediation: 'Ask each owner to update or re-status the listed items. Add a weekly "stale in progress" filter to the team ritual.',
  forecasts: ['schedule'],
  evaluate(project, ctx) {
    const limit = ctx.config.staleInProgressDays
    const population = project.items.filter((i) => i.statusCategory === 'in_progress')
    return evaluateItems(this.id, project, population, (i) => {
      const days = daysBetween(i.updatedAt, ctx.now)
      return days > limit ? `${i.key} in progress, not updated for ${days} days` : null
    })
  },
}
