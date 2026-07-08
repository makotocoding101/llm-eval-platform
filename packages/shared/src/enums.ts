// Single source of truth for enum values.
// packages/db turns these arrays into pgEnums; the frontend imports the union types.

export const PROVIDER_SLUGS = ["openai", "google", "anthropic"] as const;
export type ProviderSlug = (typeof PROVIDER_SLUGS)[number];

export const MODEL_KIND = ["candidate", "judge"] as const;
export type ModelKind = (typeof MODEL_KIND)[number];

export const EXECUTION_STATUS = ["pending", "running", "success", "error"] as const;
export type ExecutionStatus = (typeof EXECUTION_STATUS)[number];

export const EVAL_RUN_STATUS = ["pending", "running", "completed", "failed"] as const;
export type EvalRunStatus = (typeof EVAL_RUN_STATUS)[number];
