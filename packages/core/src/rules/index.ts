import type { Rule } from './rule.js'
import { missingEstimate } from './missing-estimate.js'
import { missingAssignee } from './missing-assignee.js'
import { missingDueDate } from './missing-due-date.js'
import { missingParent } from './missing-parent.js'
import { epicWithoutChildren } from './epic-without-children.js'
import { brokenDependency } from './broken-dependency.js'
import { staleInProgress } from './stale-in-progress.js'
import { staleOpen } from './stale-open.js'
import { overdueOpen } from './overdue-open.js'
import { overallocatedAssignee } from './overallocated-assignee.js'
import { estimateOutlier } from './estimate-outlier.js'
import { statusResolutionMismatch } from './status-resolution-mismatch.js'

export const ALL_RULES: Rule[] = [
  missingEstimate,
  missingAssignee,
  missingDueDate,
  missingParent,
  epicWithoutChildren,
  brokenDependency,
  staleInProgress,
  staleOpen,
  overdueOpen,
  overallocatedAssignee,
  estimateOutlier,
  statusResolutionMismatch,
]

export function getRule(id: string): Rule | undefined {
  return ALL_RULES.find((r) => r.id === id)
}

export type { Rule, RuleContext } from './rule.js'
