import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { CsvFormatError, parseCsvRows, parsePortfolioCsv } from '../src/csv.js'
import { lintPortfolio } from '../src/report.js'

const here = dirname(fileURLToPath(import.meta.url))
const SAMPLE = readFileSync(resolve(here, '../../../examples/sample-portfolio.csv'), 'utf8')
const NOW = '2026-08-24T00:00:00Z'

describe('parseCsvRows', () => {
  it('handles quotes, escaped quotes and CRLF', () => {
    const rows = parseCsvRows('a,b\r\n"x, y","say ""hi"""\n')
    expect(rows).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"'],
    ])
  })
})

describe('parsePortfolioCsv', () => {
  it('parses the sample into two projects', () => {
    const { portfolio, warnings } = parsePortfolioCsv(SAMPLE, { name: 'sample', scannedAt: NOW })
    expect(warnings).toEqual([])
    expect(portfolio.projects.map((p) => p.key)).toEqual(['ALPHA', 'BETA'])
    const alpha = portfolio.projects[0]!
    expect(alpha.name).toBe('Customer Platform')
    expect(alpha.items).toHaveLength(21)
    expect(alpha.estimateUnit).toBe('points')
    expect(alpha.people.map((p) => p.name)).toEqual(['Ana Souza', 'Bruno Lima'])
    expect(portfolio.projects[1]!.items).toHaveLength(12)
    expect(portfolio.projects[1]!.estimateUnit).toBe('hours')
  })

  it('resolves parent and dependency keys', () => {
    const { portfolio } = parsePortfolioCsv(SAMPLE, { scannedAt: NOW })
    const alpha = portfolio.projects[0]!
    const a10 = alpha.items.find((i) => i.key === 'ALPHA-10')!
    expect(a10.parentId).toBe('ALPHA-1')
    const a23 = alpha.items.find((i) => i.key === 'ALPHA-23')!
    expect(a23.dependsOn).toEqual(['ALPHA-19'])
    const a19 = alpha.items.find((i) => i.key === 'ALPHA-19')!
    expect(a19.dependsOn).toEqual(['ALPHA-99'])
  })

  it('produces the planted violation counts', () => {
    const { portfolio } = parsePortfolioCsv(SAMPLE, { scannedAt: NOW })
    const report = lintPortfolio(portfolio, { now: NOW })
    const counts = (key: string) =>
      Object.fromEntries(report.projects.find((p) => p.key === key)!.rules.map((r) => [r.id, r.violations]))
    expect(counts('ALPHA')).toEqual({
      'missing-estimate': 1,
      'missing-assignee': 1,
      'missing-due-date': 1,
      'missing-parent': 1,
      'epic-without-children': 1,
      'broken-dependency': 1,
      'stale-in-progress': 1,
      'stale-open': 2,
      'overdue-open': 1,
      'overallocated-assignee': 1,
      'estimate-outlier': 1,
      'status-resolution-mismatch': 2,
    })
    expect(counts('BETA')).toEqual({
      'missing-estimate': 1,
      'missing-assignee': 0,
      'missing-due-date': 0,
      'missing-parent': 1,
      'epic-without-children': 0,
      'broken-dependency': 0,
      'stale-in-progress': 0,
      'stale-open': 0,
      'overdue-open': 0,
      'overallocated-assignee': 0,
      'estimate-outlier': 0,
      'status-resolution-mismatch': 0,
    })
    expect(report.violations).toHaveLength(16)
  })

  it('throws listing missing required columns', () => {
    expect(() => parsePortfolioCsv('key,title\nA-1,x\n')).toThrow(CsvFormatError)
    try {
      parsePortfolioCsv('key,title\nA-1,x\n')
    } catch (e) {
      expect((e as CsvFormatError).missingColumns).toEqual(['project_key', 'type', 'status_category', 'created_at', 'updated_at'])
    }
  })

  it('skips rows with bad dates and warns', () => {
    const csv = [
      'project_key,key,title,type,status_category,created_at,updated_at,due_date',
      'P,P-1,ok,task,todo,2026-08-01,2026-08-02,',
      'P,P-2,bad,task,todo,not-a-date,2026-08-02,',
      'P,P-3,bad due,task,todo,2026-08-01,2026-08-02,soon',
    ].join('\n')
    const { portfolio, warnings, rowsSkipped } = parsePortfolioCsv(csv)
    expect(portfolio.projects[0]!.items.map((i) => i.key)).toEqual(['P-1', 'P-3'])
    expect(rowsSkipped).toBe(1)
    expect(warnings).toHaveLength(2)
    expect(warnings[0]).toContain('P-2')
    expect(warnings[1]).toContain('due_date')
  })
})
