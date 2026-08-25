import type { Dimension, ForecastType, Project, RuleResult, WorkItem } from '../model.js'
import type { LintConfig } from '../config.js'

export interface RuleContext {
  /** Config already resolved for the project being evaluated (per-project overrides applied). */
  config: LintConfig
  now: Date
  /**
   * Every item in the scanned portfolio, keyed by id, across all projects.
   * Lets rules resolve links that cross project boundaries.
   */
  portfolioItems: ReadonlyMap<string, WorkItem>
}

export interface Rule {
  id: string
  dimension: Dimension
  /** 1 (minor) to 3 (critical). Weights the rule inside its dimension. */
  weight: 1 | 2 | 3
  /** One sentence: what the rule checks. */
  description: string
  /** Which forecasts break when this rule fails, and why. */
  forecastImpact: string
  /** Concrete action to fix it. */
  remediation: string
  /** Forecast types that depend on this rule. */
  forecasts: ForecastType[]
  evaluate(project: Project, ctx: RuleContext): RuleResult
}
