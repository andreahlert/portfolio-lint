import api, { route } from '@forge/api'

interface PermissionsResponse {
  permissions?: Record<string, { havePermission?: boolean }>
}

/**
 * Permissions of the current user. Each interpolated value is URL-encoded by `route`, so the query
 * must be spelled out literally: interpolating a whole "a=b&c=d" string encodes the separators too.
 */
async function myPermissions(permissions: string[], projectKey?: string): Promise<PermissionsResponse> {
  const keys = permissions.join(',')
  const path = projectKey
    ? route`/rest/api/3/mypermissions?permissions=${keys}&projectKey=${projectKey}`
    : route`/rest/api/3/mypermissions?permissions=${keys}`
  const res = await api.asUser().requestJira(path, { headers: { Accept: 'application/json' } })
  if (!res.ok) return {}
  return (await res.json()) as PermissionsResponse
}

/** Jira administrator (global ADMINISTER permission). */
export async function isJiraAdmin(): Promise<boolean> {
  const p = await myPermissions(['ADMINISTER'])
  return p.permissions?.['ADMINISTER']?.havePermission === true
}

/** Project administrator for one project, or a Jira administrator. */
export async function isProjectAdmin(projectKey: string): Promise<boolean> {
  const p = await myPermissions(['ADMINISTER', 'ADMINISTER_PROJECTS'], projectKey)
  return p.permissions?.['ADMINISTER']?.havePermission === true || p.permissions?.['ADMINISTER_PROJECTS']?.havePermission === true
}
