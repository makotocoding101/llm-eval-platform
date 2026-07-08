import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Loaded relative to packages/db (the cwd when run via `pnpm --filter @llm-eval/db ...`).
config({ path: "../../.env" });

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://eval:eval@localhost:5432/llm_eval",
  },
});
