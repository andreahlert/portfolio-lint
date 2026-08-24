import type { Report } from '@portfolio-lint/core'
import { DIMENSIONS, FORECAST_TYPES } from '@portfolio-lint/core'

export function textTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)))
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i] ?? 0)).join('  ').trimEnd()
  return [line(headers), widths.map((w) => '-'.repeat(w)).join('  '), ...rows.map(line)].join('\n')
}

const fmt = (n: number | null | undefined): string => (n === null || n === undefined ? 'n/a' : n.toFixed(1))

export function renderTable(report: Report, opts: { maxViolations?: number } = {}): string {
  const max = opts.maxViolations ?? 30
  const out: string[] = []
  out.push(`portfolio-lint  ${report.name}  (scanned ${report.scannedAt})`)
  out.push('')
  out.push(`Portfolio readiness: ${fmt(report.score)} / 100  grade ${report.grade}`)
  out.push('')
  out.push('Dimensions')
  out.push(textTable(['dimension', 'score'], DIMENSIONS.map((d) => [d, fmt(report.dimensions[d])])))
  out.push('')
  out.push('Forecasts')
  out.push(
    textTable(
      ['forecast', 'score', 'label'],
      FORECAST_TYPES.map((f) => [f, fmt(report.forecasts[f].score), report.forecasts[f].label]),
    ),
  )
  out.push('')
  out.push('Projects')
  out.push(
    textTable(
      ['project', 'items', 'score', 'grade', 'schedule', 'capacity', 'scope'],
      report.projects.map((p) => [
        p.key,
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
  out.push('Remediation (highest impact first)')
  if (report.remediation.length === 0) out.push('  nothing to fix')
  else
    out.push(
      textTable(
        ['#', 'rule', 'violations', 'fix', 'examples'],
        report.remediation.map((r, i) => [String(i + 1), r.ruleId, String(r.violations), r.remediation, r.examples.join(', ')]),
      ),
    )
  out.push('')
  out.push(`Violations (${report.violations.length})`)
  const shown = report.violations.slice(0, max)
  if (shown.length > 0) {
    out.push(textTable(['project', 'item', 'rule', 'message'], shown.map((v) => [v.projectKey, v.itemKey ?? '', v.ruleId, v.message])))
  }
  if (report.violations.length > max) out.push(`... and ${report.violations.length - max} more (use --format json for the full list)`)
  return out.join('\n') + '\n'
}
