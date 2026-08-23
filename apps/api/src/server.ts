import { config } from "dotenv";

// Load root .env (cwd is apps/api when run via `pnpm --filter @llm-eval/api dev`).
config({ path: "../../.env" });

import cors from "@fastify/cors";
import { createDb } from "@llm-eval/db";
import Fastify from "fastify";
import { loadEnv } from "./env";
import { registerRoutes } from "./routes";

const env = loadEnv();
const db = createDb(env.DATABASE_URL);

const app = Fastify({ logger: true });

// Deployed: only the dashboard's own origin may call the API, so a stray page
// can't POST /api/eval-runs and spend the configured provider keys. Unset
// locally, where the Vite proxy makes requests same-origin anyway.
const allowedOrigins = env.WEB_ORIGIN?.split(",")
  .map((o) => o.trim())
  .filter(Boolean);

try {
  await app.register(cors, {
    origin: allowedOrigins?.length ? allowedOrigins : true,
  });

  app.get("/health", async () => ({ ok: true }));
  registerRoutes(app, db);

  const address = await app.listen({ port: env.PORT, host: "0.0.0.0" });
  app.log.info(`API listening on ${address}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
