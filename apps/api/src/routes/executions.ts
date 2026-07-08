import type { DB } from "@llm-eval/db";
import type { FastifyInstance } from "fastify";

export function executionRoutes(app: FastifyInstance, _db: DB) {
  app.get("/api/executions", async () => {
    // TODO: list executions; support ?evalRunId= and ?status= filters.
    return [];
  });

  app.post("/api/executions/:id/retry", async (_request, reply) => {
    // TODO: reset a failed execution to pending and re-run it.
    return reply.status(501).send({ error: "not implemented" });
  });
}
