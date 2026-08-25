import api, { route, type Response as ForgeResponse } from '@forge/api'
import { fetchStoryPointsFields } from './jiraClient'

export type FixAction =
  | { type: 'setEstimate'; value: number }
  | { type: 'assign'; accountId: string }
  | { type: 'setDueDate'; date: string }
  | { type: 'setParent'; parentKey: string }
  | { type: 'transition'; transitionId: string }
  | { type: 'deleteLink'; linkId: string }

export interface FixResult {
  ok: true
  /** Human-readable note about what changed, e.g. which field received the estimate. */
  note: string
}

export interface EpicOption {
  key: string
  summary: string
}

export interface TransitionOption {
  id: string
  name: string
  to: string
  toCategory: string
}

export interface LinkOption {
  id: string
  type: string
  /** "blocks", "is blocked by", ... as Jira phrases it from this issue's point of view. */
  direction: string
  otherKey: string
  otherSummary: string
}

export interface FixOptions {
  epics?: EpicOption[]
  transitions?: TransitionOption[]
  links?: LinkOption[]
}

const ISSUE_KEY = /^[A-Z][A-Z0-9_]*-\d+$/
const DATE = /^\d{4}-\d{2}-\d{2}$/

export class FixError extends Error {}

function assertIssueKey(key: string): void {
  if (!ISSUE_KEY.test(key)) throw new FixError(`Not an issue key: ${key}`)
}

async function jiraErrorText(res: ForgeResponse): Promise<string> {
  try {
    const body = (await res.json()) as { errorMessages?: string[]; errors?: Record<string, string> }
    const parts = [...(body.errorMessages ?? []), ...Object.entries(body.errors ?? {}).map(([k, v]) => `${k}: ${v}`)]
    if (parts.length) return parts.join(' ')
  } catch {
    // fall through
  }
  return `Jira returned ${res.status}`
}

const asUser = () => api.asUser()

async function jsonRequest(path: ReturnType<typeof route>, init: { method: string; body?: unknown }): Promise<ForgeResponse> {
  return asUser().requestJira(path, {
    method: init.method,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
}

async function editFields(issueKey: string, fields: Record<string, unknown>): Promise<ForgeResponse> {
  return jsonRequest(route`/rest/api/3/issue/${issueKey}`, { method: 'PUT', body: { fields } })
}

/**
 * Writes the estimate where the scan will read it. The mapper takes the first story points field holding a number,
 * so every field that already has a value is overwritten (sites often carry both the company-managed and the
 * team-managed field); an issue estimated in time keeps using time. Only unestimated issues fall through to
 * "first field that accepts the value".
 */
async function setEstimate(issueKey: string, value: number): Promise<FixResult> {
  if (!Number.isFinite(value) || value <= 0) throw new FixError('Estimate must be a positive number')
  const fields = await fetchStoryPointsFields()
  const current = await currentEstimates(issueKey, fields)
  const filled = fields.filter((f) => typeof current[f] === 'number')
  let lastError = ''
  if (filled.length > 0) {
    const res = await editFields(issueKey, Object.fromEntries(filled.map((f) => [f, value])))
    if (res.ok) return { ok: true, note: `Story points set to ${value}` }
    lastError = await jiraErrorText(res)
    // A field missing from the edit screen fails the whole edit; retry one by one and accept partial success.
    let written = 0
    for (const field of filled) {
      const one = await editFields(issueKey, { [field]: value })
      if (one.ok) written++
      else lastError = await jiraErrorText(one)
    }
    if (written > 0) return { ok: true, note: `Story points set to ${value}${written < filled.length ? ` (${written} of ${filled.length} fields)` : ''}` }
    throw new FixError(lastError)
  }
  if (typeof current.timeoriginalestimate === 'number' && current.timeoriginalestimate > 0) {
    const res = await editFields(issueKey, { timetracking: { originalEstimate: `${value}h` } })
    if (res.ok) return { ok: true, note: `Original estimate set to ${value}h` }
    throw new FixError(await jiraErrorText(res))
  }
  for (const field of fields) {
    const res = await editFields(issueKey, { [field]: value })
    if (res.ok) return { ok: true, note: `Story points set to ${value}` }
    lastError = await jiraErrorText(res)
  }
  const res = await editFields(issueKey, { timetracking: { originalEstimate: `${value}h` } })
  if (res.ok) return { ok: true, note: `Original estimate set to ${value}h` }
  throw new FixError(lastError || (await jiraErrorText(res)))
}

/** Current values of the story points fields plus the original time estimate, read as the user. */
async function currentEstimates(issueKey: string, fields: string[]): Promise<Record<string, unknown>> {
  const list = [...fields, 'timeoriginalestimate'].join(',')
  const res = await asUser().requestJira(route`/rest/api/3/issue/${issueKey}?fields=${list}`, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new FixError(await jiraErrorText(res))
  const issue = (await res.json()) as { fields?: Record<string, unknown> }
  return issue.fields ?? {}
}

export async function applyFix(issueKey: string, action: FixAction): Promise<FixResult> {
  assertIssueKey(issueKey)
  switch (action.type) {
    case 'setEstimate':
      return setEstimate(issueKey, Number(action.value))
    case 'assign': {
      if (!action.accountId) throw new FixError('Pick a user')
      const res = await jsonRequest(route`/rest/api/3/issue/${issueKey}/assignee`, { method: 'PUT', body: { accountId: action.accountId } })
      if (!res.ok) throw new FixError(await jiraErrorText(res))
      return { ok: true, note: 'Assignee set' }
    }
    case 'setDueDate': {
      if (!DATE.test(action.date)) throw new FixError('Pick a date')
      const res = await editFields(issueKey, { duedate: action.date })
      if (!res.ok) throw new FixError(await jiraErrorText(res))
      return { ok: true, note: `Due date set to ${action.date}` }
    }
    case 'setParent': {
      assertIssueKey(action.parentKey)
      const res = await editFields(issueKey, { parent: { key: action.parentKey } })
      if (!res.ok) throw new FixError(await jiraErrorText(res))
      return { ok: true, note: `Parent set to ${action.parentKey}` }
    }
    case 'transition': {
      if (!/^\d+$/.test(action.transitionId)) throw new FixError('Pick a transition')
      const res = await jsonRequest(route`/rest/api/3/issue/${issueKey}/transitions`, { method: 'POST', body: { transition: { id: action.transitionId } } })
      if (!res.ok) throw new FixError(await jiraErrorText(res))
      return { ok: true, note: 'Status changed' }
    }
    case 'deleteLink': {
      if (!/^\d+$/.test(action.linkId)) throw new FixError('Pick a link')
      const res = await asUser().requestJira(route`/rest/api/3/issueLink/${action.linkId}`, { method: 'DELETE' })
      if (!res.ok) throw new FixError(await jiraErrorText(res))
      return { ok: true, note: 'Link removed' }
    }
    default:
      throw new FixError('Unknown fix action')
  }
}

async function openEpics(projectKey: string): Promise<EpicOption[]> {
  const body = {
    jql: `project = "${projectKey.replace(/"/g, '')}" AND hierarchyLevel = 1 AND statusCategory != Done ORDER BY created DESC`,
    fields: ['summary'],
    maxResults: 100,
  }
  const res = await jsonRequest(route`/rest/api/3/search/jql`, { method: 'POST', body })
  if (!res.ok) throw new FixError(await jiraErrorText(res))
  const data = (await res.json()) as { issues?: Array<{ key: string; fields?: { summary?: string } }> }
  return (data.issues ?? []).map((i) => ({ key: i.key, summary: i.fields?.summary ?? '' }))
}

async function transitionsFor(issueKey: string): Promise<TransitionOption[]> {
  const res = await asUser().requestJira(route`/rest/api/3/issue/${issueKey}/transitions`, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new FixError(await jiraErrorText(res))
  const data = (await res.json()) as {
    transitions?: Array<{ id: string; name: string; to?: { name?: string; statusCategory?: { key?: string } } }>
  }
  return (data.transitions ?? []).map((t) => ({ id: t.id, name: t.name, to: t.to?.name ?? t.name, toCategory: t.to?.statusCategory?.key ?? '' }))
}

async function linksFor(issueKey: string): Promise<LinkOption[]> {
  const res = await asUser().requestJira(route`/rest/api/3/issue/${issueKey}?fields=issuelinks`, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new FixError(await jiraErrorText(res))
  const data = (await res.json()) as {
    fields?: {
      issuelinks?: Array<{
        id: string
        type?: { name?: string; inward?: string; outward?: string }
        inwardIssue?: { key?: string; fields?: { summary?: string } }
        outwardIssue?: { key?: string; fields?: { summary?: string } }
      }>
    }
  }
  return (data.fields?.issuelinks ?? []).map((l) => {
    const other = l.inwardIssue ?? l.outwardIssue
    return {
      id: l.id,
      type: l.type?.name ?? 'link',
      direction: l.inwardIssue ? (l.type?.inward ?? 'inward') : (l.type?.outward ?? 'outward'),
      otherKey: other?.key ?? '?',
      otherSummary: other?.fields?.summary ?? '',
    }
  })
}

export type FixOptionKind = 'epics' | 'transitions' | 'links'

export async function fixOptions(issueKey: string, projectKey: string, kinds: FixOptionKind[]): Promise<FixOptions> {
  assertIssueKey(issueKey)
  const out: FixOptions = {}
  if (kinds.includes('epics')) out.epics = await openEpics(projectKey)
  if (kinds.includes('transitions')) out.transitions = await transitionsFor(issueKey)
  if (kinds.includes('links')) out.links = await linksFor(issueKey)
  return out
}
