import type { Report } from '@portfolio-lint/core'
import { DIMENSIONS, FORECAST_TYPES } from '@portfolio-lint/core'
import { commitmentCell, finishCell, leverageSummary, num, programmeLine, statusNote } from './forecast.js'

export function mdTable(headers: string[], rows: string[][]): string {
  const esc = (s: string) => s.replace(/\|/g, '\\|')
  return [
    `| ${headers.map(esc).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((r) => `| ${r.map(esc).join(' | ')} |`),
  ].join('\n')
}

const fmt = (n: number | null | undefined): string => (n === null || n === undefined ? 'n/a' : n.toFixed(1))

export function renderMarkdown(report: Report, opts: { maxViolations?: number } = {}): string {
  const max = opts.maxViolations ?? 200
  const out: string[] = []
  out.push(`# Portfolio AI-Readiness Report: ${report.name}`)
  out.push('')
  out.push(`Scanned ${report.scannedAt}. Score **${fmt(report.score)} / 100**, grade **${report.grade}**.`)
  out.push('')
  out.push('## Forecast reliability')
  out.push('')
  out.push(mdTable(['Forecast', 'Score', 'Label'], FORECAST_TYPES.map((f) => [f, fmt(report.forecasts[f].score), report.forecasts[f].label])))
  out.push('')
  out.push('## Dimensions')
  out.push('')
  out.push(mdTable(['Dimension', 'Score'], DIMENSIONS.map((d) => [d, fmt(report.dimensions[d])])))
  out.push('')
  out.push('## Projects')
  out.push('')
  out.push(
    mdTable(
      ['Project', 'Items', 'Score', 'Grade', 'Schedule', 'Capacity', 'Scope'],
      report.projects.map((p) => [
        `${p.key} (${p.name})`,
        String(p.itemCount),
        fmt(p.score),
        p.grade,
        p.forecasts.schedule.label,
        p.forecasts.capacity.label,
        p.forecasts.scope.label,
      ]),
    ),
  )
  out.push('')
  if (report.forecast) {
    const f = report.forecast
    out.push('## Delivery forecast')
    out.push('')
    out.push(`Monte Carlo on ${f.historyWeeks} weeks of throughput, ${f.simulations} runs per project, seed ${f.seed}. ${programmeLine(f)}.`)
    out.push('')
    out.push(
      mdTable(
        ['Project', 'Unit', 'Open', 'Unestimated', 'Throughput/wk', 'p50', 'p85', 'p95', 'Commitment', 'Confidence'],
        f.projects.map((p) => [
          p.key,
          p.remaining.unit,
          String(p.remaining.openItems),
          String(p.remaining.unestimatedItems),
          p.throughput ? num(p.throughput.mean) : 'n/a',
          finishCell(p, 'p50'),
          finishCell(p, 'p85'),
          finishCell(p, 'p95'),
          commitmentCell(p),
          p.confidence.level,
        ]),
      ),
    )
    out.push('')
    for (const p of f.projects) {
      out.push(`### ${p.key} forecast`)
      out.push('')
      const note = statusNote(p)
      const lines = note ? [note] : [...p.confidence.reasons, ...leverageSummary(p)]
      if (lines.length === 0) lines.push('nothing in the data limits this forecast')
      for (const l of lines) out.push(`- ${l}`)
      if (p.leverage.length > 0) {
        out.push('')
        out.push(mdTable(['Fix first', 'Project', 'Problems', 'Title'], p.leverage.map((i) => [i.key, i.projectKey, i.issues.join(', '), i.title])))
      }
      out.push('')
    }
  }
  out.push('## Remediation, highest impact first')
  out.push('')
  if (report.remediation.length === 0) out.push('Nothing to fix.')
  report.remediation.forEach((r, i) => {
    out.push(`${i + 1}. **${r.ruleId}** (${r.violations} violations, ${r.dimension}): ${r.remediation}`)
    out.push(`   Impact: ${r.forecastImpact}`)
    if (r.examples.length > 0) out.push(`   Examples: ${r.examples.join(', ')}`)
  })
  out.push('')
  out.push(`## Violations (${report.violations.length})`)
  out.push('')
  const shown = report.violations.slice(0, max)
  if (shown.length > 0) out.push(mdTable(['Project', 'Item', 'Rule', 'Message'], shown.map((v) => [v.projectKey, v.itemKey ?? '', v.ruleId, v.message])))
  if (report.violations.length > max) {
    out.push('')
    out.push(`${report.violations.length - max} more not shown. Use \`--format json\` for the full list.`)
  }
  out.push('')
  out.push('## Rule scores per project')
  out.push('')
  for (const p of report.projects) {
    out.push(`### ${p.key}`)
    out.push('')
    out.push(
      mdTable(
        ['Rule', 'Dimension', 'Weight', 'Applicable', 'Violations', 'Score'],
        p.rules.map((r) => [r.id, r.dimension, String(r.weight), String(r.applicable), String(r.violations), fmt(r.score)]),
      ),
    )
    out.push('')
  }
  out.push(`Config: ${JSON.stringify(report.config)}`)
  out.push('')
  return out.join('\n')
}
