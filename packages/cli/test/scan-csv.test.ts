import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { runScan } from '../src/commands/scan.js'
import { captureIO, NOW, ROOT, SAMPLE } from './helpers.js'

describe('runScan (csv)', () => {
  it('scans the sample and prints a table', async () => {
    const c = captureIO()
    const { code, report } = await runScan({ source: 'csv', file: SAMPLE, now: NOW }, c.io)
    expect(code).toBe(0)
    expect(report?.violations).toHaveLength(16)
    expect(c.stdout()).toContain('Portfolio readiness:')
    expect(c.stdout()).toContain('ALPHA')
    expect(c.stdout()).toContain('BETA')
    expect(c.stderr()).toBe('')
  })

  it('infers csv from --file and renders json', async () => {
    const c = captureIO()
    const { code } = await runScan({ file: SAMPLE, now: NOW, format: 'json' }, c.io)
    expect(code).toBe(0)
    const parsed = JSON.parse(c.stdout())
    expect(parsed.name).toBe('sample-portfolio')
    expect(parsed.scannedAt).toBe(NOW)
    expect(parsed.projects).toHaveLength(2)
  })

  it('exits 1 when below --fail-under', async () => {
    const c = captureIO()
    const { code, report } = await runScan({ file: SAMPLE, now: NOW, failUnder: 100 }, c.io)
    expect(code).toBe(1)
    expect(report?.score).toBeLessThan(100)
    expect(c.stderr()).toContain('below --fail-under')
  })

  it('exits 2 on a missing file with a clear message', async () => {
    const c = captureIO()
    const { code } = await runScan({ file: 'nope.csv' }, c.io)
    expect(code).toBe(2)
    expect(c.stderr()).toContain('Cannot read CSV file')
  })

  it('exits 2 on a CSV missing required columns', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'plint-'))
    const f = join(dir, 'bad.csv')
    writeFileSync(f, 'key,title\nA-1,x\n')
    const c = captureIO()
    const { code } = await runScan({ file: f }, c.io)
    expect(code).toBe(2)
    expect(c.stderr()).toContain('project_key')
    expect(c.stderr()).toContain('docs/csv-format.md')
  })

  it('exits 2 when jira credentials are missing', async () => {
    const c = captureIO()
    const { code } = await runScan({ source: 'jira' }, c.io)
    expect(code).toBe(2)
    expect(c.stderr()).toContain('JIRA_URL')
    expect(c.stderr()).toContain('JIRA_TOKEN')
  })

  it('applies config file and --out', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'plint-'))
    writeFileSync(join(dir, '.portfoliolintrc.json'), JSON.stringify({ disabledRules: ['stale-open'], staleInProgressDays: 60 }))
    const c = captureIO({ cwd: dir })
    const { code, report } = await runScan({ file: SAMPLE, now: NOW, format: 'md', out: 'report.md' }, c.io)
    expect(code).toBe(0)
    expect(report?.rulesEvaluated).not.toContain('stale-open')
    expect(report?.config.staleInProgressDays).toBe(60)
    expect(report?.violations.some((v) => v.ruleId === 'stale-in-progress')).toBe(false)
    const md = readFileSync(join(dir, 'report.md'), 'utf8')
    expect(md).toContain('# Portfolio AI-Readiness Report')
    expect(c.stdout()).toBe('')
  })

  it('rejects an invalid config file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'plint-'))
    writeFileSync(join(dir, 'cfg.json'), JSON.stringify({ maxWipPerPerson: 'three' }))
    const c = captureIO({ cwd: dir })
    const { code } = await runScan({ file: SAMPLE, config: 'cfg.json' }, c.io)
    expect(code).toBe(2)
    expect(c.stderr()).toContain('maxWipPerPerson')
  })
})

describe('bin', () => {
  const bin = resolve(ROOT, 'packages/cli/dist/bin.js')
  it.skipIf(!existsSync(bin))('runs scan and rules from the built binary', () => {
    const scan = execFileSync('node', [bin, 'scan', '--file', SAMPLE, '--now', NOW, '--format', 'json'], { encoding: 'utf8' })
    expect(JSON.parse(scan).violations).toHaveLength(16)
    const rules = execFileSync('node', [bin, 'rules'], { encoding: 'utf8' })
    expect(rules).toContain('missing-estimate')
    let status = 0
    try {
      execFileSync('node', [bin, 'scan', '--file', SAMPLE, '--now', NOW, '--fail-under', '99'], { encoding: 'utf8', stdio: 'pipe' })
    } catch (e) {
      status = (e as { status: number }).status
    }
    expect(status).toBe(1)
  })
})
