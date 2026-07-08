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

try {
  await app.register(cors, { origin: true });

  app.get("/health", async () => ({ ok: true }));
  registerRoutes(app, db);

  const address = await app.listen({ port: env.PORT, host: "0.0.0.0" });
  app.log.info(`API listening on ${address}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
