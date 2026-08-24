import type { ItemType, Person, Project, StatusCategory, WorkItem } from './model.js'

/** Subset of the Jira Cloud REST v3 issue shape that the mapper reads. */
export interface JiraIssue {
  id: string
  key: string
  fields: {
    summary?: string
    issuetype?: { name?: string; subtask?: boolean }
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
  /** e.g. "customfield_10016". When set and numeric, used as the estimate in points. */
  storyPointsField?: string
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

export function mapJiraType(name: string | undefined, subtask?: boolean): ItemType {
  const n = (name ?? '').toLowerCase()
  if (n === 'epic') return 'epic'
  if (n === 'story' || n === 'user story') return 'story'
  if (n === 'task' || n === 'sub-task' || n === 'subtask' || subtask) return 'task'
  if (n === 'bug' || n === 'defect') return 'bug'
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
    type: mapJiraType(f.issuetype?.name, f.issuetype?.subtask),
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

  const sp = opts.storyPointsField ? f[opts.storyPointsField] : undefined
  if (typeof sp === 'number' && !Number.isNaN(sp)) {
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

export function mapJiraProject(meta: JiraProjectMeta, issues: JiraIssue[], opts: JiraMapOptions = {}): Project {
  const items = issues.map((i) => mapJiraIssue(i, opts))
  const people = new Map<string, Person>()
  for (const issue of issues) {
    const a = issue.fields.assignee
    if (a?.accountId && !people.has(a.accountId)) people.set(a.accountId, { id: a.accountId, name: a.displayName ?? a.accountId })
  }
  const hasPoints = !!opts.storyPointsField && items.some((i) => i.estimate !== undefined)
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
export function detectStoryPointsField(fields: Array<{ id: string; name?: string; schema?: { type?: string } }>): string | undefined {
  const candidates = fields.filter((f) => /story\s*point/i.test(f.name ?? ''))
  const numeric = candidates.find((f) => f.schema?.type === 'number')
  return (numeric ?? candidates[0])?.id
}
