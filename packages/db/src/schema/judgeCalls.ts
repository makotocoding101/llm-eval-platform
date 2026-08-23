import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { judgeFailureReason } from "./enums";
import { models } from "./models";
import { responses } from "./responses";

/**
 * One row per judge model attempt — successful or not.
 *
 * On success: the verbatim output plus real token/latency numbers, written before
 * parsing, so malformed or contradictory judge output stays auditable later without
 * re-running the judge (scores keep only the parsed per-criterion rows).
 *
 * On failure: the same row records why, by name. A call that never reached the model
 * has no raw_output at all — which is exactly the case that used to leave no trace,
 * making a timeout indistinguishable from a rate limit without live reproduction.
 */
export const judgeCalls = pgTable(
  "judge_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    responseId: uuid("response_id")
      .notNull()
      .references(() => responses.id),
    judgeModelId: uuid("judge_model_id")
      .notNull()
      .references(() => models.id),
    // Null when the call failed before any output existed (timeout, provider error).
    rawOutput: text("raw_output"),
    // Null on success. Set when the attempt produced no usable scores.
    failureReason: judgeFailureReason("failure_reason"),
    // Provider message, or the output snippet the parser rejected.
    failureDetail: text("failure_detail"),
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
    latencyMs: integer("latency_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("judge_calls_response_id_idx").on(t.responseId),
    // Failures are the rare rows and the ones worth sweeping for.
    index("judge_calls_failure_reason_idx").on(t.failureReason),
  ],
);
