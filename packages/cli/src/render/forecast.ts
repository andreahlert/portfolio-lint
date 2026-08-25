import type { ForecastReport, ProjectForecast } from '@portfolio-lint/core'

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

export const num = (n: number | null | undefined, digits = 1): string => (n === null || n === undefined ? 'n/a' : n.toFixed(digits))

export function finishCell(p: ProjectForecast, which: 'p50' | 'p85' | 'p95'): string {
  if (!p.finish) return 'n/a'
  const f = p.finish[which]
  return `${f.date} (${f.weeks}w)`
}

export function commitmentCell(p: ProjectForecast): string {
  if (!p.commitment) return 'none'
  const slip = p.commitment.p85SlipWeeks
  const sign = slip > 0 ? `+${num(slip)}w` : `${num(slip)}w`
  return `${p.commitment.dueDate} ${p.commitment.verdict} (${sign})`
}

export function statusNote(p: ProjectForecast): string | null {
  if (p.status === 'no-open-work') return 'nothing open, no forecast needed'
  if (p.status === 'no-history') return 'no completed items with a resolution date in the history window, throughput unknown'
  return null
}

/** One line per project: what to fix to tighten the forecast. */
export function leverageSummary(p: ProjectForecast): string[] {
  const lines: string[] = []
  if (p.scopeUncertaintyWeeks !== null && p.scopeUncertaintyWeeks > 0 && p.finish && p.finishIfEstimated) {
    lines.push(
      `estimate the ${p.remaining.unestimatedItems} unestimated items and p85 moves from ${p.finish.p85.date} to ${p.finishIfEstimated.p85.date} (${plural(p.scopeUncertaintyWeeks, 'week')} of uncertainty removed)`,
    )
  }
  if (p.criticalPath.items.length > 0) {
    const keys = p.criticalPath.items.map((i) => i.key).join(' -> ')
    const notes: string[] = []
    if (p.criticalPath.unestimated > 0) notes.push(`${p.criticalPath.unestimated} unestimated`)
    if (p.criticalPath.crossProject) notes.push('crosses projects')
    lines.push(`critical path (${plural(p.criticalPath.items.length, 'item')}, ${p.criticalPath.estimate} ${p.remaining.unit}${notes.length ? ', ' + notes.join(', ') : ''}): ${keys}`)
  }
  for (const c of p.criticalPath.cycles) lines.push(`dependency cycle blocks scheduling: ${[...c, c[0]].join(' -> ')}`)
  return lines
}

export function programmeLine(f: ForecastReport): string {
  if (!f.programme.p85) return 'Programme finish: no project could be forecast'
  return `Programme finish (p85): ${f.programme.p85.date}, ${f.programme.p85.weeks} weeks out, driven by ${f.programme.drivenBy}`
}

export function forecastRows(f: ForecastReport): string[][] {
  return f.projects.map((p) => [
    p.key,
    p.remaining.unit,
    String(p.remaining.openItems),
    String(p.remaining.unestimatedItems),
    p.throughput ? num(p.throughput.mean) : 'n/a',
    finishCell(p, 'p50'),
    finishCell(p, 'p85'),
    commitmentCell(p),
    p.confidence.level,
  ])
}

export const FORECAST_HEADERS = ['project', 'unit', 'open', 'unestimated', 'throughput/wk', 'p50', 'p85', 'commitment', 'confidence']
