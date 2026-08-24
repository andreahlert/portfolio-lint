import type { Rule } from './rule.js'
import { evaluateItems } from './helpers.js'

export const brokenDependency: Rule = {
  id: 'broken-dependency',
  dimension: 'consistency',
  weight: 2,
  description: 'Every dependency must point to an item that exists in the project.',
  forecastImpact:
    'Schedule forecasts walk the dependency graph to compute critical path. A dangling link breaks the walk, so downstream dates are computed without the blocker.',
  remediation: 'Repair or remove the dangling links on the listed items. If the blocker lives in another project, include that project in the scan.',
  forecasts: ['schedule'],
  evaluate(project) {
    const ids = new Set(project.items.map((i) => i.id))
    const population = project.items.filter((i) => i.dependsOn.length > 0)
    return evaluateItems(this.id, project, population, (i) => {
      const missing = i.dependsOn.filter((d) => !ids.has(d))
      return missing.length ? `${i.key} depends on unknown item(s): ${missing.join(', ')}` : null
    })
  },
}
