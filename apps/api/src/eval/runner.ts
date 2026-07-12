import { evalRuns, executions, models, responses, scores, type DB } from "@llm-eval/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import pLimit from "p-limit";
import { executeOne } from "./execute";
import { judgeResponse } from "./judge";
import type { RunnerOptions, RunSummary } from "./types";

/** Insert one execution per (task × enabled candidate model). Idempotent via the unique index. */
async function planExecutions(
  db: DB,
  evalRunId: string,
  taskIds: string[],
  modelIds: string[],
): Promise<void> {
  const candidateModels = await db
    .select({ id: models.id })
    .from(models)
    .where(and(inArray(models.id, modelIds), eq(models.kind, "candidate"), eq(models.enabled, true)));

  const values = taskIds.flatMap((taskId) =>
    candidateModels.map((m) => ({ evalRunId, taskId, modelId: m.id })),
  );
  if (values.length > 0) {
    await db.insert(executions).values(values).onConflictDoNothing();
  }
}

/**
 * Plan (optional) then run all pending/error executions for a run through a p-limit
 * concurrency cap. In-process — no queue. Judging is a separate step (not yet wired).
 */
export async function runEvalRun(
  db: DB,
  evalRunId: string,
  options: RunnerOptions = {},
): Promise<RunSummary> {
  const { concurrency = 4, taskIds, modelIds } = options;

  if (taskIds && modelIds) {
    await planExecutions(db, evalRunId, taskIds, modelIds);
  }

  await db
    .update(evalRuns)
    .set({ status: "running", startedAt: new Date() })
    .where(eq(evalRuns.id, evalRunId));

  const pending = await db
    .select({ id: executions.id })
    .from(executions)
    .where(and(eq(executions.evalRunId, evalRunId), inArray(executions.status, ["pending", "error"])));

  const limit = pLimit(concurrency);
  await Promise.all(pending.map((row) => limit(() => executeOne(db, row.id))));

  // Judge phase: score every successful response in this run that has fewer scores
  // than the rubric has criteria. That covers both never-judged responses and partially
  // judged ones (judgeResponse only fills gaps thanks to onConflictDoNothing).
  const run = await db.query.evalRuns.findFirst({
    where: eq(evalRuns.id, evalRunId),
    with: { rubric: { with: { criteria: true } } },
  });
  const criteriaCount = run?.rubric.criteria.length ?? 0;

  const scoredCounts = await db
    .select({ responseId: responses.id, scored: sql<number>`count(${scores.id})::int` })
    .from(responses)
    .innerJoin(executions, eq(responses.executionId, executions.id))
    .leftJoin(scores, eq(scores.responseId, responses.id))
    .where(and(eq(executions.evalRunId, evalRunId), eq(executions.status, "success")))
    .groupBy(responses.id);
  const toJudge = criteriaCount === 0 ? [] : scoredCounts.filter((r) => r.scored < criteriaCount);

  let responsesJudged = 0;
  let judgePartial = 0;
  let judgeFailed = 0;
  await Promise.all(
    toJudge.map((row) =>
      limit(async () => {
        try {
          const outcome = await judgeResponse(db, row.responseId);
          responsesJudged += 1;
          if (outcome.scored < outcome.expected) judgePartial += 1;
          // Log issues even when every criterion got a score — a fully scored response
          // can still hide clamped (out_of_range) or discarded (invalid_score) values.
          if (outcome.issues.length > 0) {
            console.warn(
              `[judge] issues: response ${row.responseId} scored ${outcome.scored}/${outcome.expected}`,
              outcome.issues,
            );
          }
        } catch (err) {
          judgeFailed += 1;
          console.warn(`[judge] failed: response ${row.responseId}:`, err);
        }
      }),
    ),
  );

  const counts = await db
    .select({ status: executions.status, n: sql<number>`count(*)::int` })
    .from(executions)
    .where(eq(executions.evalRunId, evalRunId))
    .groupBy(executions.status);

  const byStatus = new Map(counts.map((c) => [c.status, c.n]));
  const succeeded = byStatus.get("success") ?? 0;
  const failed = byStatus.get("error") ?? 0;
  const executionsPlanned = [...byStatus.values()].reduce((a, b) => a + b, 0);

  await db
    .update(evalRuns)
    .set({
      status: failed > 0 && succeeded === 0 ? "failed" : "completed",
      completedAt: new Date(),
    })
    .where(eq(evalRuns.id, evalRunId));

  return { evalRunId, executionsPlanned, succeeded, failed, responsesJudged, judgePartial, judgeFailed };
}
