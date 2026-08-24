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
const PAGE_SIZE = 100

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

export async function fetchPortfolio(projectKeys: string[], name: string): Promise<Portfolio> {
  const storyPointsFields = await fetchStoryPointsFields()
  const projects: Project[] = []
  for (const key of projectKeys.slice(0, MAX_PROJECTS_PER_SCAN)) {
    projects.push(await fetchProject(key, storyPointsFields))
  }
  return { name, scannedAt: new Date().toISOString(), projects }
}
