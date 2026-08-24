import type { ItemType, Person, Portfolio, Project, StatusCategory, WorkItem } from './model.js'

export const CSV_REQUIRED_COLUMNS = ['project_key', 'key', 'title', 'type', 'status_category', 'created_at', 'updated_at'] as const
export const CSV_OPTIONAL_COLUMNS = [
  'project_name',
  'status',
  'assignee_id',
  'assignee_name',
  'estimate',
  'estimate_unit',
  'start_date',
  'due_date',
  'parent_key',
  'depends_on',
  'resolved_at',
  'labels',
] as const

export class CsvFormatError extends Error {
  constructor(message: string, public readonly missingColumns: string[] = []) {
    super(message)
    this.name = 'CsvFormatError'
  }
}

export interface ParseCsvOptions {
  name?: string
  scannedAt?: string
}

export interface ParseCsvResult {
  portfolio: Portfolio
  warnings: string[]
  rowsRead: number
  rowsSkipped: number
}

/** Minimal RFC 4180 parser: quoted fields, escaped quotes, CRLF or LF. */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  const src = text.startsWith('﻿') ? text.slice(1) : text
  for (let i = 0; i < src.length; i++) {
    const c = src[i] as string
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
      continue
    }
    if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.some((f) => f.length > 0)) rows.push(row)
      row = []
    } else {
      field += c
    }
  }
  row.push(field)
  if (row.some((f) => f.length > 0)) rows.push(row)
  return rows
}

export function parsePortfolioCsv(text: string, options: ParseCsvOptions = {}): ParseCsvResult {
  const rows = parseCsvRows(text)
  const header = (rows[0] ?? []).map((h) => h.trim().toLowerCase())
  const missing = CSV_REQUIRED_COLUMNS.filter((c) => !header.includes(c))
  if (missing.length) {
    throw new CsvFormatError(`CSV is missing required column(s): ${missing.join(', ')}. Required: ${CSV_REQUIRED_COLUMNS.join(', ')}`, missing)
  }
  const col = (name: string) => header.indexOf(name)
  const get = (r: string[], name: string) => {
    const i = col(name)
    return i < 0 ? '' : (r[i] ?? '').trim()
  }

  const warnings: string[] = []
  const projects = new Map<string, Project & { _keyToId: Map<string, string>; _people: Map<string, Person> }>()
  const pendingParents: Array<{ item: WorkItem; parentKey: string; project: string }> = []
  const pendingDeps: Array<{ item: WorkItem; keys: string[]; project: string }> = []
  let rowsSkipped = 0

  rows.slice(1).forEach((r, idx) => {
    const line = idx + 2
    const projectKey = get(r, 'project_key')
    const key = get(r, 'key')
    if (!projectKey || !key) {
      warnings.push(`line ${line}: missing project_key or key, skipped`)
      rowsSkipped++
      return
    }
    const createdAt = normalizeDate(get(r, 'created_at'))
    const updatedAt = normalizeDate(get(r, 'updated_at'))
    if (!createdAt || !updatedAt) {
      warnings.push(`line ${line}: invalid created_at or updated_at on ${key}, skipped`)
      rowsSkipped++
      return
    }
    const statusCategory = normalizeStatusCategory(get(r, 'status_category'))
    if (!statusCategory) {
      warnings.push(`line ${line}: invalid status_category on ${key} (use todo, in_progress, done), skipped`)
      rowsSkipped++
      return
    }

    let project = projects.get(projectKey)
    if (!project) {
      project = {
        id: projectKey,
        key: projectKey,
        name: get(r, 'project_name') || projectKey,
        source: 'csv',
        estimateUnit: normalizeUnit(get(r, 'estimate_unit')),
        items: [],
        people: [],
        _keyToId: new Map(),
        _people: new Map(),
      }
      projects.set(projectKey, project)
    }

    const assigneeId = get(r, 'assignee_id') || undefined
    if (assigneeId && !project._people.has(assigneeId)) {
      project._people.set(assigneeId, { id: assigneeId, name: get(r, 'assignee_name') || assigneeId })
    }

    const estimateRaw = get(r, 'estimate')
    const estimate = estimateRaw === '' ? undefined : Number(estimateRaw)
    if (estimateRaw !== '' && Number.isNaN(estimate)) warnings.push(`line ${line}: estimate "${estimateRaw}" on ${key} is not a number, ignored`)

    const item: WorkItem = {
      id: key,
      key,
      title: get(r, 'title'),
      type: normalizeType(get(r, 'type')),
      status: get(r, 'status') || statusCategory,
      statusCategory,
      dependsOn: [],
      createdAt,
      updatedAt,
      labels: splitList(get(r, 'labels')),
    }
    if (assigneeId) item.assigneeId = assigneeId
    if (estimate !== undefined && !Number.isNaN(estimate)) item.estimate = estimate
    const startDate = optionalDate(get(r, 'start_date'), `line ${line}: start_date on ${key}`, warnings)
    if (startDate) item.startDate = startDate
    const dueDate = optionalDate(get(r, 'due_date'), `line ${line}: due_date on ${key}`, warnings)
    if (dueDate) item.dueDate = dueDate
    const resolvedAt = optionalDate(get(r, 'resolved_at'), `line ${line}: resolved_at on ${key}`, warnings)
    if (resolvedAt) item.resolvedAt = resolvedAt

    project.items.push(item)
    project._keyToId.set(key, item.id)
    const parentKey = get(r, 'parent_key')
    if (parentKey) pendingParents.push({ item, parentKey, project: projectKey })
    const deps = splitList(get(r, 'depends_on'))
    if (deps.length) pendingDeps.push({ item, keys: deps, project: projectKey })
  })

  for (const p of pendingParents) {
    const project = projects.get(p.project)
    if (!project) continue
    // Parent key resolved to an id when it exists; otherwise kept as given so traceability still counts it as linked.
    p.item.parentId = project._keyToId.get(p.parentKey) ?? p.parentKey
  }
  for (const d of pendingDeps) {
    const project = projects.get(d.project)
    if (!project) continue
    d.item.dependsOn = d.keys.map((k) => project._keyToId.get(k) ?? k)
  }

  const portfolio: Portfolio = {
    name: options.name ?? 'portfolio',
    scannedAt: options.scannedAt ?? new Date().toISOString(),
    projects: [...projects.values()].map(({ _keyToId, _people, ...project }) => ({ ...project, people: [..._people.values()] })),
  }
  return { portfolio, warnings, rowsRead: rows.length - 1, rowsSkipped }
}

function splitList(s: string): string[] {
  return s
    .split(';')
    .map((x) => x.trim())
    .filter(Boolean)
}

function normalizeType(s: string): ItemType {
  const t = s.trim().toLowerCase()
  if (t === 'epic') return 'epic'
  if (t === 'story' || t === 'user story') return 'story'
  if (t === 'task' || t === 'subtask' || t === 'sub-task') return 'task'
  if (t === 'bug' || t === 'defect') return 'bug'
  return 'other'
}

function normalizeStatusCategory(s: string): StatusCategory | null {
  const t = s.trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (t === 'todo' || t === 'to_do' || t === 'new' || t === 'open') return 'todo'
  if (t === 'in_progress' || t === 'indeterminate' || t === 'doing') return 'in_progress'
  if (t === 'done' || t === 'closed' || t === 'complete' || t === 'completed') return 'done'
  return null
}

function normalizeUnit(s: string): Project['estimateUnit'] {
  const t = s.trim().toLowerCase()
  if (t === 'points' || t === 'point' || t === 'sp') return 'points'
  if (t === 'hours' || t === 'hour' || t === 'h') return 'hours'
  return 'unknown'
}

/** Accepts ISO date or datetime. Returns the input if parseable, else null. */
function normalizeDate(s: string): string | null {
  if (!s) return null
  return Number.isNaN(Date.parse(s)) ? null : s
}

function optionalDate(s: string, label: string, warnings: string[]): string | undefined {
  if (!s) return undefined
  const d = normalizeDate(s)
  if (!d) {
    warnings.push(`${label} is not a valid date ("${s}"), ignored`)
    return undefined
  }
  return d
}
