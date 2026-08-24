import type { Rule } from './rule.js'
import { evaluateItems, isEpic } from './helpers.js'

export const missingParent: Rule = {
  id: 'missing-parent',
  dimension: 'traceability',
  weight: 2,
  description: 'Non-epic items must roll up to an epic or parent.',
  forecastImpact:
    'Scope forecasts roll work up to deliverables. Orphan items cannot be attributed to any epic, so epic completion percentages and burn-ups are understated.',
  remediation: 'Link each listed item to its epic. Close or delete items that belong to no deliverable.',
  forecasts: ['scope'],
  evaluate(project) {
    const population = project.items.filter((i) => !isEpic(i))
    return evaluateItems(this.id, project, population, (i) =>
      i.parentId ? null : `${i.key} has no parent epic`,
    )
  },
}
