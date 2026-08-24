import type { Dimension, ForecastLabel, ForecastType, Grade, RuleResult } from './model.js'

/** 100 * (1 - violations / applicable). null when the rule does not apply. */
export function scoreRule(result: RuleResult): number | null {
  if (result.applicable <= 0) return null
  const ratio = Math.min(result.violations.length / result.applicable, 1)
  return round1(100 * (1 - ratio))
}

export function grade(score: number): Grade {
  if (score >= 90) return 'A'
  if (score >= 75) return 'B'
  if (score >= 60) return 'C'
  if (score >= 40) return 'D'
  return 'F'
}

export function forecastLabel(score: number): ForecastLabel {
  if (score >= 75) return 'reliable'
  if (score >= 50) return 'degraded'
  return 'unreliable'
}

export interface WeightedScore {
  score: number | null
  weight: number
}

/** Weighted mean, ignoring null scores. null when nothing counts. */
export function weightedMean(entries: WeightedScore[]): number | null {
  let num = 0
  let den = 0
  for (const e of entries) {
    if (e.score === null) continue
    num += e.score * e.weight
    den += e.weight
  }
  return den === 0 ? null : round1(num / den)
}

/** Plain mean of non-null values. null when all are null. */
export function mean(values: Array<number | null>): number | null {
  const xs = values.filter((v): v is number => v !== null)
  if (xs.length === 0) return null
  return round1(xs.reduce((a, b) => a + b, 0) / xs.length)
}

/** Minimum of non-null values. null when all are null. */
export function min(values: Array<number | null>): number | null {
  const xs = values.filter((v): v is number => v !== null)
  if (xs.length === 0) return null
  return Math.min(...xs)
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10
}

export type DimensionScores = Record<Dimension, number | null>
export interface ForecastCell {
  score: number | null
  label: ForecastLabel | 'n/a'
  /** Rule with the lowest score among the rules feeding this forecast. Absent when nothing is failing. */
  limitedBy?: string
}

export type ForecastScores = Record<ForecastType, ForecastCell>

export function toForecast(score: number | null, limitedBy?: string): ForecastCell {
  const cell: ForecastCell = { score, label: score === null ? 'n/a' : forecastLabel(score) }
  if (limitedBy && score !== null && score < 100) cell.limitedBy = limitedBy
  return cell
}
