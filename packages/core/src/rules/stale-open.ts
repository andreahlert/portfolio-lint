import type { Rule } from './rule.js'
import { daysBetween, evaluateItems } from './helpers.js'

export const staleOpen: Rule = {
  id: 'stale-open',
  dimension: 'freshness',
  weight: 1,
  description: 'Backlog items must not sit untouched for too long (default 90 days).',
  forecastImpact:
    'Scope forecasts count the backlog as remaining work. Zombie items that nobody will do inflate remaining scope and push projected end dates out.',
  remediation: 'Triage the listed items: schedule, close as will-not-do, or move to an icebox that is excluded from forecasting.',
  forecasts: ['scope'],
  evaluate(project, ctx) {
    const limit = ctx.config.staleOpenDays
    const population = project.items.filter((i) => i.statusCategory === 'todo')
    return evaluateItems(this.id, project, population, (i) => {
      const days = daysBetween(i.updatedAt, ctx.now)
      return days > limit ? `${i.key} in backlog, not updated for ${days} days` : null
    })
  },
}
