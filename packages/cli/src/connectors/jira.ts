import {
  detectStoryPointsField,
  JIRA_BASE_FIELDS,
  mapJiraProject,
  type JiraIssue,
  type Portfolio,
  type Project,
} from '@portfolio-lint/core'

export interface JiraConnectOptions {
  url: string
  email: string
  token: string
  projects: string[]
  name?: string
  scannedAt?: string
  fetchImpl?: typeof fetch
  pageSize?: number
}

export interface JiraFetchResult {
  portfolio: Portfolio
  warnings: string[]
  storyPointsField?: string
}

const HINTS: Record<number, string> = {
  401: 'Authentication failed. Check --email and --token (create an API token at https://id.atlassian.com/manage-profile/security/api-tokens).',
  403: 'Forbidden. The user has no Browse Projects permission on this project, or the site blocks API tokens.',
  404: 'Not found. Check the site URL (https://your-site.atlassian.net) and the project key.',
  429: 'Rate limited by Jira. Wait a minute and retry, or scan fewer projects at once.',
}

export class JiraHttpError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    readonly hint: string = HINTS[status] ?? `Jira returned HTTP ${status}.`,
  ) {
    super(`Jira request failed (${status}) on ${path}. ${hint}`)
    this.name = 'JiraHttpError'
  }
}

export function normalizeSiteUrl(url: string): string {
  let u = url.trim().replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`
  return u
}

interface SearchPage {
  issues?: JiraIssue[]
  nextPageToken?: string
  isLast?: boolean
}

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

export async function fetchJiraPortfolio(opts: JiraConnectOptions): Promise<JiraFetchResult> {
  const base = normalizeSiteUrl(opts.url)
  const auth = Buffer.from(`${opts.email}:${opts.token}`).toString('base64')
  const fetchImpl = opts.fetchImpl ?? fetch
  const pageSize = opts.pageSize ?? 100
  const warnings: string[] = []

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetchImpl(`${base}${path}`, {
      ...init,
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    })
    if (!res.ok) throw new JiraHttpError(res.status, path)
    return (await res.json()) as T
  }

  const fields = await request<FieldMeta[]>('/rest/api/3/field')
  const storyPointsField = detectStoryPointsField(fields)
  if (!storyPointsField) warnings.push('No story points field found; estimates fall back to original time estimate (hours).')
  const searchFields = [...JIRA_BASE_FIELDS, ...(storyPointsField ? [storyPointsField] : [])]

  const projects: Project[] = []
  for (const key of opts.projects) {
    const meta = await request<ProjectMeta>(`/rest/api/3/project/${encodeURIComponent(key)}`)
    const issues: JiraIssue[] = []
    let nextPageToken: string | undefined
    do {
      const page = await request<SearchPage>('/rest/api/3/search/jql', {
        method: 'POST',
        body: JSON.stringify({
          jql: `project = "${key}" ORDER BY created ASC`,
          fields: searchFields,
          maxResults: pageSize,
          ...(nextPageToken ? { nextPageToken } : {}),
        }),
      })
      issues.push(...(page.issues ?? []))
      nextPageToken = page.isLast ? undefined : page.nextPageToken
    } while (nextPageToken)
    if (issues.length === 0) warnings.push(`Project ${key} has no issues.`)
    projects.push(mapJiraProject({ id: meta.id, key: meta.key, name: meta.name }, issues, { storyPointsField }))
  }

  return {
    portfolio: {
      name: opts.name ?? base.replace(/^https?:\/\//, ''),
      scannedAt: opts.scannedAt ?? new Date().toISOString(),
      projects,
    },
    warnings,
    ...(storyPointsField ? { storyPointsField } : {}),
  }
}
