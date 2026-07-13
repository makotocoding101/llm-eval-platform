import {
  evalRuns,
  executions,
  models,
  responses,
  rubricCriteria,
  scores,
  spotChecks,
  type DB,
} from "@llm-eval/db";
import { submitSpotCheckInput } from "@llm-eval/shared";
import { desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { computeAgreement, type AgreementEntry } from "../spotcheck/agreement";

const judgeModels = alias(models, "judge_models");

export function spotCheckRoutes(app: FastifyInstance, db: DB) {
  // Live version of the CLI's --report, filterable by eval run (?run=<id> | all).
  // With no param it reports the NEWEST run that has checks, not the blend: older
  // checks were recorded against the pre-fix judge (no thinking, score-before-
  // reasoning), so the all-time aggregate understates the current judge.
  app.get("/api/spot-checks/agreement", async (request) => {
    const { run } = request.query as { run?: string };

    const runsWithChecks = await db
      .select({
        id: evalRuns.id,
        name: evalRuns.name,
        createdAt: evalRuns.createdAt,
        checks: sql<number>`count(*)::int`,
      })
      .from(spotChecks)
      .innerJoin(scores, eq(spotChecks.scoreId, scores.id))
      .innerJoin(responses, eq(scores.responseId, responses.id))
      .innerJoin(executions, eq(responses.executionId, executions.id))
      .innerJoin(evalRuns, eq(executions.evalRunId, evalRuns.id))
      .groupBy(evalRuns.id, evalRuns.name, evalRuns.createdAt)
      .orderBy(desc(evalRuns.createdAt));

    const selectedRunId = run === "all" ? null : (run ?? runsWithChecks[0]?.id ?? null);

    const rows = await db
      .select({
        criterion: rubricCriteria.name,
        judgeModel: judgeModels.apiName,
        judgeScore: scores.score,
        humanScore: spotChecks.humanScore,
        checkedAt: spotChecks.createdAt,
      })
      .from(spotChecks)
      .innerJoin(scores, eq(spotChecks.scoreId, scores.id))
      .innerJoin(rubricCriteria, eq(scores.rubricCriterionId, rubricCriteria.id))
      .innerJoin(judgeModels, eq(scores.judgeModelId, judgeModels.id))
      .innerJoin(responses, eq(scores.responseId, responses.id))
      .innerJoin(executions, eq(responses.executionId, executions.id))
      .where(selectedRunId ? eq(executions.evalRunId, selectedRunId) : undefined)
      .orderBy(rubricCriteria.position);

    const entries: AgreementEntry[] = rows.map((r) => ({
      criterion: r.criterion,
      judgeModel: r.judgeModel,
      judgeScore: Number(r.judgeScore),
      humanScore: Number(r.humanScore),
    }));

    const lastCheckedAt = rows.reduce<Date | null>(
      (latest, r) => (latest === null || r.checkedAt > latest ? r.checkedAt : latest),
      null,
    );

    return { ...computeAgreement(entries), lastCheckedAt, runs: runsWithChecks, selectedRunId };
  });

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
