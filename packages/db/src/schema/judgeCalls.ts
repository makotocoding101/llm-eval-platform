import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { models } from "./models";
import { responses } from "./responses";

/**
 * One row per judge model call: the verbatim output plus real token/latency numbers.
 * Written before parsing, so malformed or contradictory judge output stays auditable
 * later without re-running the judge (scores keep only the parsed per-criterion rows).
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
    rawOutput: text("raw_output").notNull(),
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
    latencyMs: integer("latency_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("judge_calls_response_id_idx").on(t.responseId)],
);
