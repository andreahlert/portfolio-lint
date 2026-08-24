import type { ItemType, Person, Project, StatusCategory, WorkItem } from './model.js'

/** Subset of the Jira Cloud REST v3 issue shape that the mapper reads. */
export interface JiraIssue {
  id: string
  key: string
  fields: {
    summary?: string
    issuetype?: { name?: string; subtask?: boolean; hierarchyLevel?: number }
    status?: { name?: string; statusCategory?: { key?: string } }
    assignee?: { accountId?: string; displayName?: string } | null
    duedate?: string | null
    created?: string
    updated?: string
    resolutiondate?: string | null
    parent?: { id?: string; key?: string } | null
    labels?: string[]
    timeoriginalestimate?: number | null
    issuelinks?: Array<{
      type?: { name?: string; inward?: string; outward?: string }
      inwardIssue?: { id?: string; key?: string }
      outwardIssue?: { id?: string; key?: string }
    }>
    [custom: string]: unknown
  }
}

export interface JiraMapOptions {
  /**
   * e.g. "customfield_10016", or several ids (company-managed "Story Points" and
   * team-managed "Story point estimate" coexist on many sites). The first numeric value wins.
   */
  storyPointsField?: string | string[]
  /** Optional custom field holding the start date (e.g. "customfield_10015"). */
  startDateField?: string
}

export const JIRA_BASE_FIELDS = [
  'summary',
  'issuetype',
  'status',
  'assignee',
  'duedate',
  'created',
  'updated',
  'resolutiondate',
  'parent',
  'labels',
  'timeoriginalestimate',
  'issuelinks',
]

const STORY_NAMES = new Set(['story', 'user story', 'história', 'historia', 'historia de usuario', 'histoire', 'user-story'])
const TASK_NAMES = new Set(['task', 'sub-task', 'subtask', 'tarefa', 'subtarefa', 'tarea', 'subtarea', 'tâche', 'sous-tâche', 'aufgabe', 'unteraufgabe'])
const BUG_NAMES = new Set(['bug', 'defect', 'erro', 'defeito', 'defecto', 'fehler', 'bogue'])

/**
 * Maps a Jira issue type to the framework's item type. Uses `hierarchyLevel` when Jira sends it
 * (1 = epic, -1 = subtask) so localized sites (História, Tarefa, Epic) still map correctly, then
 * falls back to a small multilingual name table.
 */
export function mapJiraType(name: string | undefined, subtask?: boolean, hierarchyLevel?: number): ItemType {
  const n = (name ?? '').trim().toLowerCase()
  if (hierarchyLevel === 1 || n === 'epic' || n === 'épico' || n === 'epopeya') return 'epic'
  if (hierarchyLevel === -1 || subtask) return 'task'
  if (STORY_NAMES.has(n)) return 'story'
  if (TASK_NAMES.has(n)) return 'task'
  if (BUG_NAMES.has(n)) return 'bug'
  return 'other'
}

export function mapJiraStatusCategory(key: string | undefined): StatusCategory {
  if (key === 'done') return 'done'
  if (key === 'indeterminate') return 'in_progress'
  return 'todo'
}

export function mapJiraIssue(issue: JiraIssue, opts: JiraMapOptions = {}): WorkItem {
  const f = issue.fields
  const item: WorkItem = {
    id: issue.id,
    key: issue.key,
    title: f.summary ?? '',
    type: mapJiraType(f.issuetype?.name, f.issuetype?.subtask, f.issuetype?.hierarchyLevel),
    status: f.status?.name ?? '',
    statusCategory: mapJiraStatusCategory(f.status?.statusCategory?.key),
    dependsOn: [],
    createdAt: f.created ?? '',
    updatedAt: f.updated ?? f.created ?? '',
    labels: f.labels ?? [],
  }
  if (f.assignee?.accountId) item.assigneeId = f.assignee.accountId
  if (f.duedate) item.dueDate = f.duedate
  if (f.resolutiondate) item.resolvedAt = f.resolutiondate
  if (f.parent?.id) item.parentId = f.parent.id

  const sp = readStoryPoints(f, opts.storyPointsField)
  if (sp !== undefined) {
    item.estimate = sp
  } else if (typeof f.timeoriginalestimate === 'number' && f.timeoriginalestimate > 0) {
    item.estimate = Math.round((f.timeoriginalestimate / 3600) * 100) / 100
  }

  const sd = opts.startDateField ? f[opts.startDateField] : undefined
  if (typeof sd === 'string' && sd) item.startDate = sd

  for (const link of f.issuelinks ?? []) {
    const inward = link.type?.inward ?? ''
    if (link.inwardIssue?.id && /blocked by|depends on/i.test(inward)) {
      item.dependsOn.push(link.inwardIssue.id)
    }
  }
  return item
}

export interface JiraProjectMeta {
  id: string
  key: string
  name: string
}

function storyPointsFieldList(field: string | string[] | undefined): string[] {
  if (!field) return []
  return Array.isArray(field) ? field : [field]
}

function readStoryPoints(fields: JiraIssue['fields'], field: string | string[] | undefined): number | undefined {
  for (const id of storyPointsFieldList(field)) {
    const v = fields[id]
    if (typeof v === 'number' && !Number.isNaN(v)) return v
  }
  return undefined
}

export function mapJiraProject(meta: JiraProjectMeta, issues: JiraIssue[], opts: JiraMapOptions = {}): Project {
  const items = issues.map((i) => mapJiraIssue(i, opts))
  const people = new Map<string, Person>()
  for (const issue of issues) {
    const a = issue.fields.assignee
    if (a?.accountId && !people.has(a.accountId)) people.set(a.accountId, { id: a.accountId, name: a.displayName ?? a.accountId })
  }
  const hasPoints = storyPointsFieldList(opts.storyPointsField).length > 0 && items.some((i) => i.estimate !== undefined)
  return {
    id: meta.id,
    key: meta.key,
    name: meta.name,
    source: 'jira',
    estimateUnit: hasPoints ? 'points' : items.some((i) => i.estimate !== undefined) ? 'hours' : 'unknown',
    items,
    people: [...people.values()],
  }
}

/** Pick the story points field id from GET /rest/api/3/field output. */
export interface JiraFieldMeta {
  id: string
  name?: string
  schema?: { type?: string; custom?: string }
}

const STORY_POINTS_NAME = /story\s*-?\s*point|story\s*-?\s*punkte|pontos?\s+de\s+hist|puntos?\s+de\s+hist|points?\s+d'hist|punti\s+storia/i

/**
 * Returns every field that can hold story points, numeric fields first. Matches by Jira's own
 * custom type key (`jsw-story-points`, used by team-managed projects) and by localized names
 * (Story Points, Pontos de história, Puntos de historia, Points d'histoire, Story-Punkte).
 */
export function detectStoryPointsFields(fields: JiraFieldMeta[]): string[] {
  const candidates = fields.filter(
    (f) => STORY_POINTS_NAME.test(f.name ?? '') || /jsw-story-points|gh-story-points/.test(f.schema?.custom ?? ''),
  )
  const numeric = candidates.filter((f) => f.schema?.type === 'number')
  const rest = candidates.filter((f) => f.schema?.type !== 'number')
  return [...numeric, ...rest].map((f) => f.id)
}

/** First story points field found, if any. Prefer `detectStoryPointsFields` to read both fields. */
export function detectStoryPointsField(fields: JiraFieldMeta[]): string | undefined {
  return detectStoryPointsFields(fields)[0]
}
