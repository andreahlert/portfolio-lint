export declare const handler: (payload: {
    call: {
        functionKey: string;
        payload?: unknown;
        jobId?: string;
    };
    context: import("@forge/resolver/shared").Context;
}, backendRuntimePayload?: Record<string, any>) => Promise<unknown>;
/** Daily scheduled scan of every project the app can see. */
export declare function scheduled(): Promise<void>;
interface ActionPayload {
    projectKey?: string;
    ruleId?: string;
}
/** Rovo action: latest score and remediation. */
export declare function getPortfolioScore(payload: ActionPayload): Promise<unknown>;
/** Rovo action: rule explanation. */
export declare function explainRule(payload: ActionPayload): Promise<unknown>;
export {};
