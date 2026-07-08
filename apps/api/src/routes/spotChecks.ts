import type { DB } from "@llm-eval/db";
import { submitSpotCheckInput } from "@llm-eval/shared";
import type { FastifyInstance } from "fastify";

export function spotCheckRoutes(app: FastifyInstance, _db: DB) {
  app.get("/api/spot-checks", async () => {
    // TODO: sample scored responses for manual review (judge score + reasoning).
    return [];
  });

  app.post("/api/spot-checks", async (request, reply) => {
    const parsed = submitSpotCheckInput.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(parsed.error.flatten());
    }
    // TODO: insert the human score against a scores row.
    return reply.status(501).send({ error: "not implemented" });
  });
}
