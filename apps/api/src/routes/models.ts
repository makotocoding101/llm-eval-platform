import { models, type DB } from "@llm-eval/db";
import type { FastifyInstance } from "fastify";

export function modelRoutes(app: FastifyInstance, db: DB) {
  app.get("/api/models", async () => {
    return db.select().from(models);
  });
}
