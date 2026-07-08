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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("models_provider_api_name_unique").on(t.providerId, t.apiName)],
);
