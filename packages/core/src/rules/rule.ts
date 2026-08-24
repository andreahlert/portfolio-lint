import type { Dimension, ForecastType, Project, RuleResult } from '../model.js'
import type { LintConfig } from '../config.js'

export interface RuleContext {
  config: LintConfig
  now: Date
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
