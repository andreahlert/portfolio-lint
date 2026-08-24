import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { detectStoryPointsField, mapJiraIssue, mapJiraProject, type JiraIssue } from '../src/jira.js'

const here = dirname(fileURLToPath(import.meta.url))
const fixture = JSON.parse(readFileSync(resolve(here, 'fixtures/jira-search.json'), 'utf8')) as { issues: JiraIssue[] }
const byKey = (k: string) => fixture.issues.find((i) => i.key === k)!
const OPTS = { storyPointsField: 'customfield_10016' }

describe('mapJiraIssue', () => {
  it('maps an epic', () => {
    const e = mapJiraIssue(byKey('DEMO-1'), OPTS)
    expect(e).toMatchObject({ id: '10001', key: 'DEMO-1', type: 'epic', statusCategory: 'in_progress', assigneeId: 'acc-1', dueDate: '2026-10-01', labels: ['checkout'] })
    expect(e.parentId).toBeUndefined()
    expect(e.estimate).toBeUndefined()
    expect(e.resolvedAt).toBeUndefined()
  })
  it('prefers story points over time estimate and keeps only blocked-by links', () => {
    const s = mapJiraIssue(byKey('DEMO-2'), OPTS)
    expect(s.type).toBe('story')
    expect(s.statusCategory).toBe('todo')
    expect(s.estimate).toBe(5)
    expect(s.parentId).toBe('10001')
    expect(s.dependsOn).toEqual(['10003'])
    expect(s.assigneeId).toBeUndefined()
  })
  it('falls back to timeoriginalestimate in hours and maps done + resolution', () => {
    const t = mapJiraIssue(byKey('DEMO-3'), OPTS)
    expect(t.type).toBe('task')
    expect(t.estimate).toBe(2)
    expect(t.statusCategory).toBe('done')
    expect(t.resolvedAt).toBe('2026-08-10T10:00:00.000+0000')
    expect(t.dependsOn).toEqual([])
  })
  it('maps bugs and subtasks, ignores non-numeric points', () => {
    expect(mapJiraIssue(byKey('DEMO-4'), OPTS).type).toBe('bug')
    const sub = mapJiraIssue(byKey('DEMO-5'), OPTS)
    expect(sub.type).toBe('task')
    expect(sub.estimate).toBeUndefined()
    expect(sub.labels).toEqual([])
    expect(sub.parentId).toBe('10004')
  })
  it('ignores story points when no field is configured', () => {
    expect(mapJiraIssue(byKey('DEMO-2')).estimate).toBe(8)
  })
})

describe('mapJiraProject', () => {
  it('collects people and estimate unit', () => {
    const p = mapJiraProject({ id: '1', key: 'DEMO', name: 'Demo' }, fixture.issues, OPTS)
    expect(p.items).toHaveLength(5)
    expect(p.people.map((x) => x.name)).toEqual(['Ana', 'Bruno'])
    expect(p.estimateUnit).toBe('points')
    expect(p.source).toBe('jira')
  })
  it('reports hours when only time estimates exist', () => {
    const p = mapJiraProject({ id: '1', key: 'DEMO', name: 'Demo' }, fixture.issues)
    expect(p.estimateUnit).toBe('hours')
  })
})

describe('detectStoryPointsField', () => {
  it('prefers the numeric story points field', () => {
    const fields = [
      { id: 'customfield_10020', name: 'Story point estimate', schema: { type: 'number' } },
      { id: 'customfield_10016', name: 'Story Points', schema: { type: 'number' } },
      { id: 'summary', name: 'Summary' },
    ]
    expect(detectStoryPointsField(fields)).toBe('customfield_10020')
    expect(detectStoryPointsField([{ id: 'summary', name: 'Summary' }])).toBeUndefined()
  })
})
