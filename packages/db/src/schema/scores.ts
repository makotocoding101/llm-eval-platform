import { numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { models } from "./models";
import { responses } from "./responses";
import { rubricCriteria } from "./rubricCriteria";

export const scores = pgTable(
  "scores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    responseId: uuid("response_id")
      .notNull()
      .references(() => responses.id),
    rubricCriterionId: uuid("rubric_criterion_id")
      .notNull()
      .references(() => rubricCriteria.id),
    // Which model produced this score. Denormalized from eval_runs.judge_model_id so a
    // score stays attributable even if a run is later re-judged with a different judge.
    judgeModelId: uuid("judge_model_id")
      .notNull()
      .references(() => models.id),
    score: numeric("score", { precision: 6, scale: 3 }).notNull(),
    reasoning: text("reasoning"), // the judge's justification for this criterion
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("scores_response_criterion_unique").on(t.responseId, t.rubricCriterionId)],
);
