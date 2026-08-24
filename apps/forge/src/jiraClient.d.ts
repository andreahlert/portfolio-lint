import { type Portfolio, type Project } from '@portfolio-lint/core';
/** Upper bound so a scheduled scan on a big site stays inside Forge invocation limits. */
export declare const MAX_PROJECTS_PER_SCAN = 20;
export declare const MAX_ISSUES_PER_PROJECT = 2000;
export declare function listProjectKeys(): Promise<string[]>;
export declare function fetchStoryPointsField(): Promise<string | undefined>;
export declare function fetchProject(key: string, storyPointsField: string | undefined): Promise<Project>;
export declare function fetchPortfolio(projectKeys: string[], name: string): Promise<Portfolio>;
