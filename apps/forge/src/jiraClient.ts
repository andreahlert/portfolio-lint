import api, { route } from '@forge/api'
import {
  detectStoryPointsFields,
  JIRA_BASE_FIELDS,
  mapJiraProject,
  type JiraIssue,
  type Portfolio,
  type Project,
} from '@portfolio-lint/core'

/** Upper bound so a scheduled scan on a big site stays inside Forge invocation limits. */
export const MAX_PROJECTS_PER_SCAN = 20
export const MAX_ISSUES_PER_PROJECT = 2000
/** Jira returns at most 100 issues per search page for this field set, whatever maxResults says. */
const PAGE_SIZE = 100
/**
 * Projects fetched at once. Pages within a project are sequential (nextPageToken), so
 * concurrency across projects is what keeps a 4k-issue site inside the 25 s invocation limit.
 */
const PROJECT_CONCURRENCY = 4

interface FieldMeta {
  id: string
  name?: string
  schema?: { type?: string }
}

interface ProjectMeta {
  id: string
  key: string
  name: string
}

interface SearchPage {
  issues?: JiraIssue[]
  nextPageToken?: string
  isLast?: boolean
}

interface JsonInit {
  method?: string
  body?: string
}

async function getJson<T>(path: ReturnType<typeof route>, init: JsonInit = {}): Promise<T> {
  const res = await api.asApp().requestJira(path, {
    ...init,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
  })
  if (!res.ok) throw new Error(`Jira ${res.status} on ${String(path)}: ${(await res.text()).slice(0, 200)}`)
  return (await res.json()) as T
}

export async function listProjectKeys(): Promise<string[]> {
  const page = await getJson<{ values?: ProjectMeta[] }>(route`/rest/api/3/project/search?maxResults=${MAX_PROJECTS_PER_SCAN}&orderBy=key`)
  return (page.values ?? []).map((p) => p.key)
}

export async function fetchStoryPointsFields(): Promise<string[]> {
  const fields = await getJson<FieldMeta[]>(route`/rest/api/3/field`)
  return detectStoryPointsFields(fields)
}

export async function fetchProject(key: string, storyPointsFields: string[]): Promise<Project> {
  const meta = await getJson<ProjectMeta>(route`/rest/api/3/project/${key}`)
  const fields = [...JIRA_BASE_FIELDS, ...storyPointsFields]
  const issues: JiraIssue[] = []
  let nextPageToken: string | undefined
  do {
    const page = await getJson<SearchPage>(route`/rest/api/3/search/jql`, {
      method: 'POST',
      body: JSON.stringify({
        jql: `project = "${key}" ORDER BY created ASC`,
        fields,
        maxResults: PAGE_SIZE,
        ...(nextPageToken ? { nextPageToken } : {}),
      }),
    })
    issues.push(...(page.issues ?? []))
    nextPageToken = page.isLast || issues.length >= MAX_ISSUES_PER_PROJECT ? undefined : page.nextPageToken
  } while (nextPageToken)
  return mapJiraProject({ id: meta.id, key: meta.key, name: meta.name }, issues, { storyPointsField: storyPointsFields })
}

/** Run `fn` over `items` with at most `limit` in flight, keeping input order. */
export async function mapConcurrent<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array<R>(items.length)
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next
      next += 1
      out[i] = await fn(items[i] as T)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

export async function fetchPortfolio(projectKeys: string[], name: string): Promise<Portfolio> {
  const storyPointsFields = await fetchStoryPointsFields()
  const keys = projectKeys.slice(0, MAX_PROJECTS_PER_SCAN)
  const projects = await mapConcurrent(keys, PROJECT_CONCURRENCY, (key) => fetchProject(key, storyPointsFields))
  return { name, scannedAt: new Date().toISOString(), projects }
}
