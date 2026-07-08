import { boolean, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { scores } from "./scores";

// Manual validation of the LLM judge against human judgment on a small sample.
// Per-score granularity lets judge<->human agreement be measured per criterion.
export const spotChecks = pgTable("spot_checks", {
  id: uuid("id").primaryKey().defaultRandom(),
  scoreId: uuid("score_id")
    .notNull()
    .references(() => scores.id),
  reviewer: text("reviewer").notNull(),
  humanScore: numeric("human_score", { precision: 6, scale: 3 }).notNull(),
  agrees: boolean("agrees"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
