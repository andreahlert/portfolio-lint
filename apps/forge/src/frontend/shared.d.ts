import React from 'react';
export type ForecastLabel = 'reliable' | 'degraded' | 'unreliable' | 'n/a';
export interface ForecastCell {
    score: number | null;
    label: ForecastLabel;
}
export interface ForecastSet {
    schedule: ForecastCell;
    capacity: ForecastCell;
    scope: ForecastCell;
}
export interface RemediationRow {
    ruleId: string;
    violations: number;
    remediation: string;
    forecastImpact: string;
    examples: string[];
}
export interface ViolationRow {
    ruleId: string;
    projectKey: string;
    itemKey?: string;
    message: string;
}
export declare const fmt: (n: number | null | undefined) => string;
export declare function labelAppearance(label: ForecastLabel): 'success' | 'moved' | 'removed' | 'default';
export declare function gradeAppearance(grade: string): 'success' | 'inprogress' | 'moved' | 'removed' | 'default';
export declare function ForecastLozenges({ forecasts }: {
    forecasts: ForecastSet;
}): React.JSX.Element;
export declare function ScoreHeadline({ score, grade, forecasts }: {
    score: number;
    grade: string;
    forecasts: ForecastSet;
}): React.JSX.Element;
export declare function RemediationTable({ rows }: {
    rows: RemediationRow[];
}): React.JSX.Element;
export declare function ViolationsTable({ rows, max }: {
    rows: ViolationRow[];
    max?: number;
}): React.JSX.Element;
