import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fetchJiraPortfolio, JiraHttpError, normalizeSiteUrl } from '../src/connectors/jira.js'
import { lintPortfolio } from '@portfolio-lint/core'
import { ROOT } from './helpers.js'

const fixture = JSON.parse(readFileSync(resolve(ROOT, 'packages/core/test/fixtures/jira-search.json'), 'utf8')) as { issues: unknown[] }

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    calls.push({ url, init })
    return handler(url, init)
  }) as typeof fetch
  return { fn, calls }
}

describe('normalizeSiteUrl', () => {
  it('adds https and strips trailing slash', () => {
    expect(normalizeSiteUrl('acme.atlassian.net/')).toBe('https://acme.atlassian.net')
    expect(normalizeSiteUrl('http://localhost:8080')).toBe('http://localhost:8080')
  })
})

describe('fetchJiraPortfolio', () => {
  it('paginates search, detects story points, maps projects', async () => {
    const [a, b, c, d, e] = fixture.issues
    const { fn, calls } = mockFetch((url, init) => {
      if (url.endsWith('/rest/api/3/field')) return jsonResponse([{ id: 'customfield_10016', name: 'Story Points', schema: { type: 'number' } }])
      if (url.endsWith('/rest/api/3/project/DEMO')) return jsonResponse({ id: '100', key: 'DEMO', name: 'Demo' })
      if (url.endsWith('/rest/api/3/search/jql')) {
        const body = JSON.parse(String(init?.body)) as { nextPageToken?: string; fields: string[] }
        expect(body.fields).toContain('customfield_10016')
        if (!body.nextPageToken) return jsonResponse({ issues: [a, b, c], nextPageToken: 'p2', isLast: false })
        return jsonResponse({ issues: [d, e], isLast: true })
      }
      return jsonResponse({}, 404)
    })
    const res = await fetchJiraPortfolio({ url: 'acme.atlassian.net', email: 'x@y.z', token: 't', projects: ['DEMO'], fetchImpl: fn, scannedAt: '2026-08-24T00:00:00Z' })
    expect(res.storyPointsField).toBe('customfield_10016')
    expect(res.portfolio.projects).toHaveLength(1)
    expect(res.portfolio.projects[0]!.items).toHaveLength(5)
    expect(res.portfolio.name).toBe('acme.atlassian.net')
    expect(calls.filter((c) => c.url.endsWith('/search/jql'))).toHaveLength(2)
    const auth = (calls[0]!.init!.headers as Record<string, string>)['Authorization']
    expect(auth).toBe(`Basic ${Buffer.from('x@y.z:t').toString('base64')}`)
    const report = lintPortfolio(res.portfolio, { now: '2026-08-24T00:00:00Z' })
    expect(report.projects[0]!.itemCount).toBe(5)
  })

  it('throws JiraHttpError with a hint on 401', async () => {
    const { fn } = mockFetch(() => jsonResponse({}, 401))
    await expect(fetchJiraPortfolio({ url: 'https://acme.atlassian.net', email: 'x', token: 't', projects: ['DEMO'], fetchImpl: fn })).rejects.toThrow(JiraHttpError)
    try {
      await fetchJiraPortfolio({ url: 'https://acme.atlassian.net', email: 'x', token: 't', projects: ['DEMO'], fetchImpl: fn })
    } catch (e) {
      expect((e as JiraHttpError).status).toBe(401)
      expect((e as JiraHttpError).hint).toContain('API token')
    }
  })

  it('warns when no story points field exists', async () => {
    const { fn } = mockFetch((url) => {
      if (url.endsWith('/field')) return jsonResponse([{ id: 'summary', name: 'Summary' }])
      if (url.includes('/project/')) return jsonResponse({ id: '1', key: 'X', name: 'X' })
      return jsonResponse({ issues: [], isLast: true })
    })
    const res = await fetchJiraPortfolio({ url: 'https://a.b', email: 'x', token: 't', projects: ['X'], fetchImpl: fn })
    expect(res.warnings.some((w) => w.includes('story points'))).toBe(true)
    expect(res.warnings.some((w) => w.includes('no issues'))).toBe(true)
  })
})
