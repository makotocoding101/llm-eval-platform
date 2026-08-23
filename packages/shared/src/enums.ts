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

// Why a judge call produced no usable scores. Provider-level reasons (timeout,
// provider_error) mean nothing came back at all; the rest mean output arrived but
// could not be turned into scores.
export const JUDGE_FAILURE_REASON = [
  "timeout",
  "provider_error",
  "malformed_json",
  "refusal",
  "no_scores",
] as const;
export type JudgeFailureReason = (typeof JUDGE_FAILURE_REASON)[number];
