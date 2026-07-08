import { evalRuns, responseQuality, type DB } from "@llm-eval/db";
import { createEvalRunInput } from "@llm-eval/shared";
import { desc, eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { runEvalRun } from "../eval/runner";

export function evalRunRoutes(app: FastifyInstance, db: DB) {
  app.get("/api/eval-runs", async () => {
    return db.select().from(evalRuns).orderBy(desc(evalRuns.createdAt));
  });

  app.get("/api/eval-runs/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const run = await db.query.evalRuns.findFirst({
      where: eq(evalRuns.id, id),
      with: {
        executions: {
          with: {
            model: true,
            task: true,
            response: {
              with: { scores: { with: { criterion: true } } },
            },
          },
        },
      },
    });
    if (!run) return reply.status(404).send({ error: "not found" });

    // Attach overall quality (Σ score×weight / Σ weight) from the response_quality view.
    const responseIds = run.executions
      .map((e) => e.response?.id)
      .filter((v): v is string => v != null);
    const quality = responseIds.length
      ? await db
          .select()
          .from(responseQuality)
          .where(inArray(responseQuality.responseId, responseIds))
      : [];
    const qualityByResponse = new Map(quality.map((q) => [q.responseId, q]));

    return {
      ...run,
      executions: run.executions.map((e) => ({
        ...e,
        response: e.response
          ? { ...e.response, quality: qualityByResponse.get(e.response.id) ?? null }
          : e.response,
      })),
    };
  });

  app.post("/api/eval-runs", async (request, reply) => {
    const parsed = createEvalRunInput.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(parsed.error.flatten());
    }
    const { name, rubricId, judgeModelId, taskIds, modelIds, notes } = parsed.data;

    const [run] = await db
      .insert(evalRuns)
      .values({ name, rubricId, judgeModelId, notes })
      .returning();

    // Fire-and-forget: the run executes in the background; clients poll GET /eval-runs/:id
    // and watch `status` (running → completed/failed). runEvalRun records all failures in
    // the DB itself, so a dropped promise here loses logging only, never data.
    void runEvalRun(db, run!.id, { taskIds, modelIds })
      .then((summary) => app.log.info({ summary }, "eval run finished"))
      .catch((err) => app.log.error({ err, evalRunId: run!.id }, "eval run crashed"));

    return reply.status(202).send({ evalRun: run });
  });

  // Re-run an existing run: retries errored executions and judges any response that is
  // missing scores (fully or partially). Idempotent — completed work is never redone.
  app.post("/api/eval-runs/:id/rerun", async (request, reply) => {
    const { id } = request.params as { id: string };
    const run = await db.query.evalRuns.findFirst({ where: eq(evalRuns.id, id) });
    if (!run) return reply.status(404).send({ error: "not found" });

    void runEvalRun(db, id)
      .then((summary) => app.log.info({ summary }, "eval rerun finished"))
      .catch((err) => app.log.error({ err, evalRunId: id }, "eval rerun crashed"));

    return reply.status(202).send({ evalRun: run });
  });
}
