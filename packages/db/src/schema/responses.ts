import { integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { executions } from "./executions";

export const responses = pgTable(
  "responses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    executionId: uuid("execution_id")
      .notNull()
      .references(() => executions.id),
    content: text("content").notNull(),
    raw: jsonb("raw"), // full provider payload for debugging
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
    latencyMs: integer("latency_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // 1:1 with executions for now; the unique constraint makes multi-sample an explicit future change.
  (t) => [uniqueIndex("responses_execution_unique").on(t.executionId)],
);
