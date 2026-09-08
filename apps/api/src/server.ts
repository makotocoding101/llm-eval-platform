import { config } from "dotenv";

// Load root .env (cwd is apps/api when run via `pnpm --filter @llm-eval/api dev`).
config({ path: "../../.env" });

import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { createDb } from "@llm-eval/db";
import Fastify from "fastify";
import { loadEnv } from "./env";
import { rateLimitOptions } from "./rateLimit";
import { registerRoutes } from "./routes";

const env = loadEnv();
const db = createDb(env.DATABASE_URL);

// trustProxy: 1 = trust exactly one hop. Deployed, that hop is Render's edge (or
// Caddy in the compose stack), which appends the caller's real address to
// X-Forwarded-For — so request.ip becomes the visitor rather than the proxy, and the
// per-IP rate limit below actually partitions by visitor instead of sharing one
// bucket across everyone. Exactly one hop matters: trusting the whole chain would
// let a caller prepend a forged address and mint themselves a fresh quota, since the
// entry the proxy appends is the only one it cannot fake.
const app = Fastify({ logger: true, trustProxy: 1 });

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

  // Registered before the routes so they can opt in via `config: runRateLimit`.
  // global: false means this meters nothing by itself — reads stay unlimited.
  await app.register(rateLimit, rateLimitOptions);

  app.get("/health", async () => ({ ok: true }));
  registerRoutes(app, db);

  const address = await app.listen({ port: env.PORT, host: "0.0.0.0" });
  app.log.info(`API listening on ${address}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
