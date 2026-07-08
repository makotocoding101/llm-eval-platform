import type { DB } from "@llm-eval/db";
import type { FastifyInstance } from "fastify";

export function rubricRoutes(app: FastifyInstance, db: DB) {
  app.get("/api/rubrics", async () => {
    return db.query.rubrics.findMany({ with: { criteria: true } });
  });
}
