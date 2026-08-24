import type { Rule } from './rule.js'
import { evaluateItems, isEpic, isOpen } from './helpers.js'

export const epicWithoutChildren: Rule = {
  id: 'epic-without-children',
  dimension: 'traceability',
  weight: 1,
  description: 'Open epics must have at least one child item.',
  forecastImpact:
    'An epic with no children has no measurable scope. Scope forecasts either ignore it (understating work) or treat it as done (overstating progress).',
  remediation: 'Break each listed epic into stories or tasks, or close it if it is a placeholder.',
  forecasts: ['scope'],
  evaluate(project) {
    const parents = new Set(project.items.map((i) => i.parentId).filter(Boolean))
    const population = project.items.filter((i) => isEpic(i) && isOpen(i))
    return evaluateItems(this.id, project, population, (epic) =>
      parents.has(epic.id) ? null : `${epic.key} is an open epic with no child items`,
    )
  },
}
