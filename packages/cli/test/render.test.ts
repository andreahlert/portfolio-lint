import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { lintPortfolio, parsePortfolioCsv } from '@portfolio-lint/core'
import { renderTable } from '../src/render/table.js'
import { renderMarkdown } from '../src/render/markdown.js'
import { renderJson } from '../src/render/json.js'
import { renderRulesMarkdown, renderRulesTable } from '../src/commands/rules.js'
import { NOW, SAMPLE } from './helpers.js'

const { portfolio } = parsePortfolioCsv(readFileSync(SAMPLE, 'utf8'), { name: 'sample', scannedAt: NOW })
const report = lintPortfolio(portfolio, { now: NOW })
const DASHES = /[\u2013\u2014]/

describe('renderers', () => {
  it('table has all sections and no em/en dashes', () => {
    const t = renderTable(report)
    for (const s of ['Dimensions', 'Forecasts', 'Projects', 'Delivery forecast', 'What limits each forecast', 'Remediation', 'Violations (16)']) expect(t).toContain(s)
    expect(t).not.toMatch(DASHES)
  })
  it('table truncates violations', () => {
    const t = renderTable(report, { maxViolations: 5 })
    expect(t).toContain('and 11 more')
  })
  it('markdown has tables and no em/en dashes', () => {
    const m = renderMarkdown(report)
    expect(m).toContain('| Forecast | Score | Label |')
    expect(m).toContain('### ALPHA')
    expect(m).toContain('## Delivery forecast')
    expect(m).toContain('### ALPHA forecast')
    expect(m).toContain('1. **')
    expect(m).not.toMatch(DASHES)
  })
  it('json round-trips', () => {
    const j = JSON.parse(renderJson(report))
    expect(j.score).toBe(report.score)
    expect(j.remediation[0].ruleId).toBe(report.remediation[0]?.ruleId)
  })
  it('rules docs list all 13 rules', () => {
    const md = renderRulesMarkdown()
    expect(md.match(/^## /gm)).toHaveLength(13)
    expect(md).not.toMatch(DASHES)
    expect(renderRulesTable().split('\n').filter(Boolean)).toHaveLength(15)
  })
})
