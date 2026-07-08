import { tasks, type DB } from "@llm-eval/db";
import type { FastifyInstance } from "fastify";

export function taskRoutes(app: FastifyInstance, db: DB) {
  app.get("/api/tasks", async () => {
    return db.select().from(tasks);
  });
}
