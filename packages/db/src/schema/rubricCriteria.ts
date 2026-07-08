import { integer, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { rubrics } from "./rubrics";

export const rubricCriteria = pgTable(
  "rubric_criteria",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rubricId: uuid("rubric_id")
      .notNull()
      .references(() => rubrics.id),
    name: text("name").notNull(),
    description: text("description"),
    weight: numeric("weight", { precision: 6, scale: 3 }).notNull().default("1"),
    scaleMin: integer("scale_min").notNull().default(1),
    scaleMax: integer("scale_max").notNull().default(5),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("rubric_criteria_rubric_name_unique").on(t.rubricId, t.name)],
);
