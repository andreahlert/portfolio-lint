import type { Rule } from './rule.js'
import { evaluateItems } from './helpers.js'

export const brokenDependency: Rule = {
  id: 'broken-dependency',
  dimension: 'consistency',
  weight: 2,
  description: 'Every dependency must point to an item that exists somewhere in the scanned portfolio.',
  forecastImpact:
    'Schedule forecasts walk the dependency graph to compute critical path. A dangling link breaks the walk, so downstream dates are computed without the blocker.',
  remediation:
    'Repair or remove the dangling links on the listed items. Links into projects outside the scan count as dangling: add those projects to the scan or drop the link.',
  forecasts: ['schedule'],
  evaluate(project, ctx) {
    const local = new Set(project.items.map((i) => i.id))
    const known = (id: string) => local.has(id) || ctx.portfolioItems.has(id)
    const population = project.items.filter((i) => i.dependsOn.length > 0)
    return evaluateItems(this.id, project, population, (i) => {
      const missing = i.dependsOn.filter((d) => !known(d))
      return missing.length ? `${i.key} depends on unknown item(s): ${missing.join(', ')}` : null
    })
  },
}
