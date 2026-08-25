import api, { route, storage, type Response as ForgeResponse } from '@forge/api'
import { InvocationError, InvocationErrorCode, Queue, type AsyncEvent } from '@forge/events'
import type { Portfolio, Report } from '@portfolio-lint/core'

/**
 * App-owned Jira custom fields ("Readiness" list of rule ids + "Readiness findings" number) so findings show up in
 * the issue navigator, list view, boards and JQL without opening the app. Values are written as the app through the
 * Forge-only field value API; users cannot edit them. The list type matters: Forge string fields only support exact
 * `=` matching in JQL, so one value per rule is what makes `cf[id] = "missing-estimate"` work.
 */
export const RULES_FIELD_KEY = 'readiness-rules'
export const COUNT_FIELD_KEY = 'readiness-findings'
export const QUEUE_KEY = 'field-sync'

const KEY_FIELD_IDS = 'fields:ids'
/** Values per async event; keeps every event well under the 200 KB push limit. */
const VALUES_PER_EVENT = 800
const EVENTS_PER_PUSH = 50
/** Issues per Jira write. */
const ISSUES_PER_WRITE = 100
const SEARCH_PAGE = 1000
const MAX_RECONCILE_ISSUES = 20000

export interface FieldIds {
  /** e.g. customfield_10123 */
  rules: string
  count: string
}

export type IssueFieldValue = [issueId: string, rules: string[]]

export type SyncEvent =
  | { kind: 'values'; projectKey: string; values: IssueFieldValue[] }
  | { kind: 'reconcile'; projectKey: string; keep: string[] }

export class FieldsError extends Error {}

interface FieldMeta {
  id: string
  key?: string
  schema?: { custom?: string }
}

function jsonInit(method: string, body: unknown): { method: string; body: string; headers: Record<string, string> } {
  return { method, body: JSON.stringify(body), headers: { Accept: 'application/json', 'Content-Type': 'application/json' } }
}

async function errorText(res: ForgeResponse): Promise<string> {
  return `Jira ${res.status}: ${(await res.text()).slice(0, 300)}`
}

function moduleKeyOf(field: FieldMeta): string | undefined {
  const ari = field.schema?.custom ?? field.key ?? ''
  const m = /\/static\/([a-zA-Z0-9_-]+)$/.exec(ari)
  return m?.[1]
}

/** Numeric ids of the app's fields, resolved once from GET /rest/api/3/field and cached in storage. */
export async function resolveFieldIds(refresh = false): Promise<FieldIds> {
  if (!refresh) {
    const cached = (await storage.get(KEY_FIELD_IDS)) as FieldIds | undefined
    if (cached?.rules && cached?.count) return cached
  }
  const res = await api.asApp().requestJira(route`/rest/api/3/field`, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new FieldsError(await errorText(res))
  const fields = (await res.json()) as FieldMeta[]
  const byKey = new Map<string, string>()
  for (const f of fields) {
    const key = moduleKeyOf(f)
    if (key) byKey.set(key, f.id)
  }
  const rules = byKey.get(RULES_FIELD_KEY)
  const count = byKey.get(COUNT_FIELD_KEY)
  if (!rules || !count) throw new FieldsError('Readiness fields not found on this site; reinstall the app to add them')
  const ids = { rules, count }
  await storage.set(KEY_FIELD_IDS, ids)
  return ids
}

/** "customfield_10123" -> 10123, for `cf[10123]` in JQL. */
export function numericId(fieldId: string): string {
  return fieldId.replace(/^customfield_/, '')
}

/** Per project, the issues with findings and the sorted rule ids they violate. Item-less violations are skipped. */
export function fieldValues(report: Report, portfolio: Portfolio): Map<string, IssueFieldValue[]> {
  const idByKey = new Map<string, string>()
  for (const project of portfolio.projects) for (const item of project.items) idByKey.set(item.key, item.id)
  const perProject = new Map<string, Map<string, Set<string>>>()
  for (const v of report.violations) {
    if (!v.itemKey) continue
    const id = idByKey.get(v.itemKey)
    if (!id) continue
    let issues = perProject.get(v.projectKey)
    if (!issues) perProject.set(v.projectKey, (issues = new Map()))
    let rules = issues.get(id)
    if (!rules) issues.set(id, (rules = new Set()))
    rules.add(v.ruleId)
  }
  const out = new Map<string, IssueFieldValue[]>()
  for (const project of report.projects) {
    const issues = perProject.get(project.key) ?? new Map<string, Set<string>>()
    out.set(
      project.key,
      [...issues.entries()].map(([id, rules]) => [id, [...rules].sort()] as IssueFieldValue),
    )
  }
  return out
}

/** Builds the async events for one scan: value chunks per project plus one reconcile event that clears stale values. */
export function syncEvents(values: Map<string, IssueFieldValue[]>): SyncEvent[] {
  const events: SyncEvent[] = []
  for (const [projectKey, list] of values) {
    for (let i = 0; i < list.length; i += VALUES_PER_EVENT) {
      events.push({ kind: 'values', projectKey, values: list.slice(i, i + VALUES_PER_EVENT) })
    }
    events.push({ kind: 'reconcile', projectKey, keep: list.map(([id]) => id) })
  }
  return events
}

/** Queues the field sync for a finished scan. Failures are logged, never propagated: the scan itself succeeded. */
export async function queueFieldSync(report: Report, portfolio: Portfolio): Promise<number> {
  const events = syncEvents(fieldValues(report, portfolio))
  const queue = new Queue({ key: QUEUE_KEY })
  let pushed = 0
  try {
    for (let i = 0; i < events.length; i += EVENTS_PER_PUSH) {
      const batch = events.slice(i, i + EVENTS_PER_PUSH).map((body) => ({ body }))
      await queue.push(batch)
      pushed += batch.length
    }
  } catch (e) {
    console.error(`field sync: queued ${pushed}/${events.length} events before failing: ${String(e)}`)
  }
  return pushed
}

interface FieldUpdate {
  customField: string
  issueIds: number[]
  value: string[] | number | null
}

/** Groups issues by value so each call carries one update per distinct value, then writes both fields in one request. */
async function writeValues(ids: FieldIds, values: IssueFieldValue[]): Promise<void> {
  for (let i = 0; i < values.length; i += ISSUES_PER_WRITE) {
    const chunk = values.slice(i, i + ISSUES_PER_WRITE)
    const byRules = new Map<string, number[]>()
    const byCount = new Map<number, number[]>()
    for (const [id, rules] of chunk) {
      const n = Number(id)
      if (!Number.isFinite(n)) continue
      const key = rules.join(',')
      byRules.set(key, [...(byRules.get(key) ?? []), n])
      byCount.set(rules.length, [...(byCount.get(rules.length) ?? []), n])
    }
    const updates: FieldUpdate[] = [
      ...[...byRules].map(([value, issueIds]) => ({ customField: ids.rules, issueIds, value: value ? value.split(',') : null })),
      ...[...byCount].map(([value, issueIds]) => ({ customField: ids.count, issueIds, value: value || null })),
    ]
    if (updates.length === 0) continue
    const res = await api.asApp().requestJira(route`/rest/api/3/app/field/value?generateChangelog=false`, jsonInit('POST', { updates }))
    if (!res.ok) throw new FieldsError(await errorText(res))
  }
}

async function clearValues(ids: FieldIds, issueIds: string[]): Promise<void> {
  await writeValues(
    ids,
    issueIds.map((id) => [id, []] as IssueFieldValue),
  )
}

/** Ids of every issue in the project that currently carries a value, straight from the Jira index. */
async function issuesWithValues(ids: FieldIds, projectKey: string): Promise<string[]> {
  const jql = `project = "${projectKey.replace(/"/g, '')}" AND cf[${numericId(ids.count)}] is not EMPTY`
  const found: string[] = []
  let nextPageToken: string | undefined
  do {
    const body: Record<string, unknown> = { jql, fields: ['id'], maxResults: SEARCH_PAGE }
    if (nextPageToken) body.nextPageToken = nextPageToken
    const res = await api.asApp().requestJira(route`/rest/api/3/search/jql`, jsonInit('POST', body))
    if (!res.ok) throw new FieldsError(await errorText(res))
    const page = (await res.json()) as { issues?: Array<{ id: string }>; nextPageToken?: string; isLast?: boolean }
    for (const issue of page.issues ?? []) found.push(issue.id)
    nextPageToken = page.isLast ? undefined : page.nextPageToken
  } while (nextPageToken && found.length < MAX_RECONCILE_ISSUES)
  return found
}

function retry(reason: string): InvocationError {
  console.error(`field sync: ${reason}`)
  return new InvocationError({ retryAfter: 60, retryReason: InvocationErrorCode.FUNCTION_RETRY_REQUEST })
}

/** Async events consumer. Runs outside the 25 s scan budget; Jira errors ask the queue to retry. */
export async function syncFields(event: AsyncEvent<SyncEvent>): Promise<InvocationError | void> {
  const body = event.body
  const attempt = event.retryContext?.retryCount ?? 0
  let ids: FieldIds
  try {
    ids = await resolveFieldIds(attempt > 0)
  } catch (e) {
    // Fields missing means the app was deployed but not upgraded on the site; retrying will not help.
    console.error(`field sync skipped: ${String(e)}`)
    return
  }
  try {
    if (body.kind === 'values') {
      await writeValues(ids, body.values)
    } else if (body.kind === 'reconcile') {
      const keep = new Set(body.keep)
      const stale = (await issuesWithValues(ids, body.projectKey)).filter((id) => !keep.has(id))
      if (stale.length > 0) await clearValues(ids, stale)
    }
  } catch (e) {
    if (attempt >= 3) {
      console.error(`field sync gave up after ${attempt} retries: ${String(e)}`)
      return
    }
    return retry(String(e))
  }
}

/**
 * Drops one rule from an issue's Readiness value right after an inline fix, so the column updates without
 * waiting for the next scan. Best effort: errors are logged and swallowed.
 */
export async function removeRuleFromIssue(issueKey: string, ruleId: string): Promise<void> {
  try {
    const ids = await resolveFieldIds()
    const res = await api.asApp().requestJira(route`/rest/api/3/issue/${issueKey}?fields=${ids.rules}`, {
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) throw new FieldsError(await errorText(res))
    const issue = (await res.json()) as { id: string; fields?: Record<string, unknown> }
    const current = issue.fields?.[ids.rules]
    if (!Array.isArray(current) || current.length === 0) return
    const remaining = current.map(String).filter((r) => r !== ruleId)
    if (remaining.length === current.length) return
    await writeValues(ids, [[issue.id, remaining]])
  } catch (e) {
    console.error(`field update after fix failed for ${issueKey}: ${String(e)}`)
  }
}

/** JQL function: `issue in readinessFindings("missing-estimate")` or `issue in readinessFindings()` for any finding. */
export async function jqlReadiness(args: { clause?: { operator?: string; arguments?: unknown[] } }): Promise<{ jql: string }> {
  const ids = await resolveFieldIds()
  const operator = String(args.clause?.operator ?? 'in').toLowerCase()
  const rule = String(args.clause?.arguments?.[0] ?? '')
    .replace(/[^a-zA-Z0-9-]/g, '')
    .toLowerCase()
  const rulesField = `cf[${numericId(ids.rules)}]`
  const countField = `cf[${numericId(ids.count)}]`
  if (operator === 'not in') {
    return { jql: rule ? `(${rulesField} is EMPTY OR ${rulesField} != "${rule}")` : `${countField} is EMPTY` }
  }
  return { jql: rule ? `${rulesField} = "${rule}"` : `${countField} > 0` }
}
