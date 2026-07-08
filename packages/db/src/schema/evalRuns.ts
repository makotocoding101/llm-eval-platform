import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { evalRunStatus } from "./enums";
import { models } from "./models";
import { rubrics } from "./rubrics";

export const evalRuns = pgTable("eval_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  rubricId: uuid("rubric_id")
    .notNull()
    .references(() => rubrics.id),
  // The judge model (Claude). Requires the anthropic provider/model rows to exist even
  // though Claude's own outputs are never evaluated.
  judgeModelId: uuid("judge_model_id")
    .notNull()
    .references(() => models.id),
  status: evalRunStatus("status").notNull().default("pending"),
  notes: text("notes"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
