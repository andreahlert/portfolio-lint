import type { Rule } from './rule.js'
import type { LintConfig } from '../config.js'
import { median, personName, violation } from './helpers.js'

export interface WipLimit {
  /** Limit actually applied to this team. */
  limit: number
  /** Median in-progress count across people with WIP. */
  teamMedian: number
  /** True when the limit came from the team median rather than the configured baseline. */
  adaptive: boolean
}

/**
 * Effective WIP limit for a team. With enough people the limit follows the team
 * (factor x median) so a consulting team that legitimately runs 6 parallel items
 * is not flagged wholesale, while the hard limit still catches mis-statused work.
 */
export function effectiveWipLimit(counts: number[], config: LintConfig): WipLimit {
  const teamMedian = median(counts)
  if (counts.length < config.wipAdaptiveMinPeople) return { limit: config.maxWipPerPerson, teamMedian, adaptive: false }
  const adaptive = Math.ceil(config.wipOutlierFactor * teamMedian)
  const limit = Math.min(config.wipHardLimit, Math.max(config.maxWipPerPerson, adaptive))
  return { limit, teamMedian, adaptive: limit !== config.maxWipPerPerson }
}

export const overallocatedAssignee: Rule = {
  id: 'overallocated-assignee',
  dimension: 'consistency',
  weight: 2,
  description:
    'No person should carry far more in-progress items than their team. The limit is max(baseline 3, 2x team median), capped at 10.',
  forecastImpact:
    'Capacity forecasts assume a person finishes what they start. Someone with many parallel items is multitasking or mis-statused, so per-person throughput is unpredictable.',
  remediation:
    'Have the listed people finish or park items until they are under the limit. Enforce a WIP limit on the board, or raise maxWipPerPerson for teams that legitimately run wide.',
  forecasts: ['capacity'],
  evaluate(project, ctx) {
    const counts = new Map<string, number>()
    for (const i of project.items) {
      if (i.statusCategory === 'in_progress' && i.assigneeId) {
        counts.set(i.assigneeId, (counts.get(i.assigneeId) ?? 0) + 1)
      }
    }
    const wip = effectiveWipLimit([...counts.values()], ctx.config)
    const violations = []
    for (const [id, n] of counts) {
      if (n > wip.limit) {
        const basis = wip.adaptive ? `limit ${wip.limit}, team median ${wip.teamMedian}` : `limit ${wip.limit}`
        violations.push(violation(this.id, project, `${personName(project, id)} has ${n} items in progress (${basis})`))
      }
    }
    return { ruleId: this.id, applicable: counts.size, violations }
  },
}
