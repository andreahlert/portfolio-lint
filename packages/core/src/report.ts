import {
  DIMENSIONS,
  FORECAST_TYPES,
  type Dimension,
  type ForecastType,
  type Grade,
  type Portfolio,
  type Project,
  type RuleResult,
  type Violation,
} from './model.js'
import { resolveConfig, type LintConfig } from './config.js'
import { ALL_RULES } from './rules/index.js'
import type { Rule, RuleContext } from './rules/rule.js'
import {
  grade,
  mean,
  min,
  round1,
  scoreRule,
  toForecast,
  weightedMean,
  type DimensionScores,
  type ForecastScores,
} from './scorer.js'

export interface RuleScore {
  id: string
  dimension: Dimension
  weight: number
  applicable: number
  violations: number
  score: number | null
}

export interface ProjectReport {
  key: string
  name: string
  itemCount: number
  score: number
  grade: Grade
  dimensions: DimensionScores
  forecasts: ForecastScores
  rules: RuleScore[]
}

export interface RemediationItem {
  ruleId: string
  dimension: Dimension
  /** Higher first. (100 - score) * weight * applicable, summed across projects. */
  priority: number
  violations: number
  remediation: string
  forecastImpact: string
  /** Up to 5 item keys (or messages for item-less violations). */
  examples: string[]
}

export interface Report {
  name: string
  scannedAt: string
  score: number
  grade: Grade
  dimensions: DimensionScores
  forecasts: ForecastScores
  projects: ProjectReport[]
  violations: Violation[]
  remediation: RemediationItem[]
  config: LintConfig
  rulesEvaluated: string[]
}

export interface LintOptions {
  rules?: Rule[]
}

export function lintPortfolio(portfolio: Portfolio, partialConfig: Partial<LintConfig> = {}, options: LintOptions = {}): Report {
  const config = resolveConfig(partialConfig)
  const now = config.now ? new Date(config.now) : new Date()
  const ctx: RuleContext = { config, now }
  const disabled = new Set(config.disabledRules)
  const rules = (options.rules ?? ALL_RULES).filter((r) => !disabled.has(r.id))

  const perProject: Array<{ project: Project; results: RuleResult[] }> = portfolio.projects.map((project) => ({
    project,
    results: rules.map((r) => r.evaluate(project, ctx)),
  }))

  const projects: ProjectReport[] = perProject.map(({ project, results }) => buildProjectReport(project, results, rules))
  const violations = perProject.flatMap((p) => p.results.flatMap((r) => r.violations))

  const totalItems = projects.reduce((n, p) => n + p.itemCount, 0)
  const score =
    totalItems === 0
      ? (mean(projects.map((p) => p.score)) ?? 100)
      : round1(projects.reduce((acc, p) => acc + p.score * p.itemCount, 0) / totalItems)

  const dimensions = aggregateAcross(projects.map((p) => p.dimensions), DIMENSIONS)
  const forecastScores = aggregateAcross(
    projects.map((p) => Object.fromEntries(FORECAST_TYPES.map((f) => [f, p.forecasts[f].score])) as Record<ForecastType, number | null>),
    FORECAST_TYPES,
  )
  const forecasts = Object.fromEntries(FORECAST_TYPES.map((f) => [f, toForecast(forecastScores[f])])) as ForecastScores

  return {
    name: portfolio.name,
    scannedAt: portfolio.scannedAt,
    score,
    grade: grade(score),
    dimensions,
    forecasts,
    projects,
    violations,
    remediation: buildRemediation(rules, perProject),
    config,
    rulesEvaluated: rules.map((r) => r.id),
  }
}

function buildProjectReport(project: Project, results: RuleResult[], rules: Rule[]): ProjectReport {
  const ruleScores: RuleScore[] = results.map((res, i) => {
    const rule = rules[i] as Rule
    return {
      id: rule.id,
      dimension: rule.dimension,
      weight: rule.weight,
      applicable: res.applicable,
      violations: res.violations.length,
      score: scoreRule(res),
    }
  })

  const dimensions = Object.fromEntries(
    DIMENSIONS.map((d) => [d, weightedMean(ruleScores.filter((r) => r.dimension === d).map((r) => ({ score: r.score, weight: r.weight })))]),
  ) as DimensionScores

  const projectScore = mean(DIMENSIONS.map((d) => dimensions[d])) ?? 100

  const forecasts = Object.fromEntries(
    FORECAST_TYPES.map((f) => {
      const ids = new Set(rules.filter((r) => r.forecasts.includes(f)).map((r) => r.id))
      const s = min(ruleScores.filter((r) => ids.has(r.id)).map((r) => r.score))
      return [f, toForecast(s)]
    }),
  ) as ForecastScores

  return {
    key: project.key,
    name: project.name,
    itemCount: project.items.length,
    score: projectScore,
    grade: grade(projectScore),
    dimensions,
    forecasts,
    rules: ruleScores,
  }
}

function aggregateAcross<K extends string>(rows: Array<Record<K, number | null>>, keys: readonly K[]): Record<K, number | null> {
  return Object.fromEntries(keys.map((k) => [k, mean(rows.map((r) => r[k]))])) as Record<K, number | null>
}

function buildRemediation(rules: Rule[], perProject: Array<{ project: Project; results: RuleResult[] }>): RemediationItem[] {
  const items: RemediationItem[] = []
  rules.forEach((rule, i) => {
    let priority = 0
    let violations = 0
    const examples: string[] = []
    for (const { results } of perProject) {
      const res = results[i] as RuleResult
      const s = scoreRule(res)
      if (s === null) continue
      priority += (100 - s) * rule.weight * res.applicable
      violations += res.violations.length
      for (const v of res.violations) {
        if (examples.length < 5) examples.push(v.itemKey ?? v.message)
      }
    }
    if (violations === 0) return
    items.push({
      ruleId: rule.id,
      dimension: rule.dimension,
      priority: round1(priority),
      violations,
      remediation: rule.remediation,
      forecastImpact: rule.forecastImpact,
      examples,
    })
  })
  return items.sort((a, b) => b.priority - a.priority)
}
