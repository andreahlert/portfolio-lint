import { type LintConfig, type ProjectReport, type Report } from '@portfolio-lint/core';
export declare const KEY_LATEST = "report:latest";
export declare const KEY_CONFIG = "config";
export declare const KEY_HISTORY = "history";
export interface HistoryPoint {
    scannedAt: string;
    score: number;
    grade: string;
}
/** Stored report is trimmed: violations list can exceed Forge storage value limits on big sites. */
export interface StoredReport extends Omit<Report, 'violations'> {
    violationCount: number;
    violations: Report['violations'];
}
export declare function loadConfig(): Promise<Partial<LintConfig>>;
export declare function saveConfig(config: Partial<LintConfig>): Promise<void>;
export declare function loadLatest(): Promise<StoredReport | undefined>;
export declare function loadHistory(): Promise<HistoryPoint[]>;
export declare function runScan(projectKeys?: string[]): Promise<StoredReport>;
export declare function projectFromReport(report: StoredReport, projectKey: string): ProjectReport | undefined;
