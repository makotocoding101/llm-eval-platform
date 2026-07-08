import { pgEnum } from "drizzle-orm/pg-core";
import { EVAL_RUN_STATUS, EXECUTION_STATUS, MODEL_KIND } from "@llm-eval/shared";

// Enum values are single-sourced in @llm-eval/shared so the DB and the frontend agree.
// (provider slug is intentionally plain text, not an enum, so new providers need no migration.)
export const modelKind = pgEnum("model_kind", MODEL_KIND);
export const executionStatus = pgEnum("execution_status", EXECUTION_STATUS);
export const evalRunStatus = pgEnum("eval_run_status", EVAL_RUN_STATUS);
