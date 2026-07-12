import { sql } from "drizzle-orm";
import { boolean, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { modelKind } from "./enums";
import { providers } from "./providers";

export const models = pgTable(
  "models",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => providers.id),
    apiName: text("api_name").notNull(), // e.g. 'gemini-2.5-flash', 'claude-opus-4-8'
    displayName: text("display_name").notNull(),
    // 'candidate' models are evaluated; 'judge' models (Claude) are referenced only by
    // eval_runs.judge_model_id, never by executions.model_id.
    kind: modelKind("kind").notNull().default("candidate"),
    enabled: boolean("enabled").notNull().default(false),
    // The judge new runs are sent to. Explicit so judge selection never depends on row
    // order; the partial unique index below lets at most one row hold the flag.
    // Historical scores keep their own judge_model_id attribution regardless.
    isActiveJudge: boolean("is_active_judge").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("models_provider_api_name_unique").on(t.providerId, t.apiName),
    uniqueIndex("models_one_active_judge").on(t.isActiveJudge).where(sql`${t.isActiveJudge}`),
  ],
);
