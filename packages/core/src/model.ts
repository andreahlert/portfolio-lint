/**
 * Canonical portfolio model. Every connector (Jira, CSV, Asana) maps into this shape,
 * and every rule reads only from it.
 */

export type StatusCategory = 'todo' | 'in_progress' | 'done'
export type ItemType = 'epic' | 'story' | 'task' | 'bug' | 'other'
export type Source = 'jira' | 'csv' | 'asana' | 'other'
export type EstimateUnit = 'points' | 'hours' | 'unknown'

export interface Person {
  id: string
  name: string
}

export interface WorkItem {
  id: string
  key: string
  title: string
  type: ItemType
  status: string
  statusCategory: StatusCategory
  assigneeId?: string
  /** Points or hours; unit is declared on the project. */
  estimate?: number
  /** ISO date or datetime. */
  startDate?: string
  dueDate?: string
  /** id of the epic or parent item inside the same project. */
  parentId?: string
  /** ids of items this item is blocked by. */
  dependsOn: string[]
  createdAt: string
  updatedAt: string
  resolvedAt?: string
  labels: string[]
}

export interface Project {
  id: string
  key: string
  name: string
  source: Source
  estimateUnit: EstimateUnit
  items: WorkItem[]
  people: Person[]
}

export interface Portfolio {
  name: string
  /** ISO datetime of the scan. */
  scannedAt: string
  projects: Project[]
}

export type Dimension = 'completeness' | 'freshness' | 'consistency' | 'traceability'
export const DIMENSIONS: Dimension[] = ['completeness', 'freshness', 'consistency', 'traceability']

export type ForecastType = 'schedule' | 'capacity' | 'scope'
export const FORECAST_TYPES: ForecastType[] = ['schedule', 'capacity', 'scope']

export type ForecastLabel = 'reliable' | 'degraded' | 'unreliable'
export type Grade = 'A' | 'B' | 'C' | 'D' | 'F'

export interface Violation {
  ruleId: string
  projectKey: string
  /** Absent for project-level or person-level violations. */
  itemKey?: string
  message: string
}

export interface RuleResult {
  ruleId: string
  /** Size of the population the rule applies to. 0 means "not applicable, skip". */
  applicable: number
  violations: Violation[]
}
