import type { DB } from "@llm-eval/db";
import type { FastifyInstance } from "fastify";

export function providerRoutes(app: FastifyInstance, db: DB) {
  app.get("/api/providers", async () => {
    return db.query.providers.findMany({ with: { models: true } });
  });
}
