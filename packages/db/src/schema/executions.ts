import { pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { executionStatus } from "./enums";
import { evalRuns } from "./evalRuns";
import { models } from "./models";
import { tasks } from "./tasks";

export const executions = pgTable(
  "executions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    evalRunId: uuid("eval_run_id")
      .notNull()
      .references(() => evalRuns.id),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id),
    modelId: uuid("model_id")
      .notNull()
      .references(() => models.id),
    // Explicit status — not derived from nullability — so dashboard queries stay simple.
    status: executionStatus("status").notNull().default("pending"),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // One execution per (task, model, run). For multi-sample later: drop this and add sample_index.
  (t) => [uniqueIndex("executions_run_task_model_unique").on(t.evalRunId, t.taskId, t.modelId)],
);
