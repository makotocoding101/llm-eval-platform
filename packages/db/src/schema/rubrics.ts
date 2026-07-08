import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const rubrics = pgTable("rubrics", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
