import { judgeCalls, responses, scores, type DB } from "@llm-eval/db";
import type { JudgeFailureReason, ProviderSlug } from "@llm-eval/shared";
import { eq } from "drizzle-orm";
import { getProvider } from "../providers/registry";
import type { CompletionResult } from "../providers/types";
import { parseJudgeOutput, type JudgeIssue } from "./parseJudgeOutput";
import { buildJudgePrompt } from "./prompts";

const JUDGE_TIMEOUT_MS = Number(process.env.JUDGE_TIMEOUT_MS) || 60_000;

/**
 * Record one judge attempt. Best-effort by design: the audit trail must never sink a
 * judge call that otherwise worked, and on the failure paths the caller is already
 * throwing, so a failed insert here must not mask the real error.
 */
async function recordJudgeCall(
  db: DB,
  values: {
    responseId: string;
    judgeModelId: string;
    rawOutput?: string | null;
    failureReason?: JudgeFailureReason | null;
    failureDetail?: string | null;
    promptTokens?: number | null;
    completionTokens?: number | null;
    latencyMs?: number | null;
  },
): Promise<string | null> {
  try {
    const [row] = await db.insert(judgeCalls).values(values).returning({ id: judgeCalls.id });
    return row?.id ?? null;
  } catch (err) {
    console.warn(`[judge] could not persist audit row for response ${values.responseId}:`, err);
    return null;
  }
}

/** Thrown when a judge call produced nothing storable. Carries the failure mode by name. */
export class JudgeError extends Error {
  constructor(
    // Same union the judge_calls.failure_reason enum is built from, so a new mode
    // cannot be thrown without also being storable.
    readonly reason: JudgeFailureReason,
    message: string,
  ) {
    super(message);
    this.name = "JudgeError";
  }
}

export interface JudgeOutcome {
  responseId: string;
  /** Criteria in the rubric. */
  expected: number;
  /** Criteria with a validated score stored. `scored < expected` ⇒ partial. */
  scored: number;
  /** Non-fatal per-criterion problems (unknown names, clamps, missing criteria …). */
  issues: JudgeIssue[];
}

/**
 * Judge one response: send it plus the rubric criteria to the eval_run's judge model
 * (structured JSON output, hard timeout) and write one scores row per criterion, each
 * stamped with the judge's model id.
 *
 * Failure handling:
 * - timeout / provider error / malformed JSON / refusal / zero usable scores → JudgeError
 * - some criteria bad but others fine → store the good ones, report the rest via issues
 *
 * Idempotent via scores' unique(response_id, rubric_criterion_id) + onConflictDoNothing;
 * re-judging a partially scored response fills only the gaps.
 */
export async function judgeResponse(db: DB, responseId: string): Promise<JudgeOutcome> {
  const response = await db.query.responses.findFirst({
    where: eq(responses.id, responseId),
    with: {
      execution: {
        with: {
          task: true,
          evalRun: {
            with: {
              judgeModel: { with: { provider: true } },
              rubric: { with: { criteria: true } },
            },
          },
        },
      },
    },
  });
  if (!response) throw new Error(`response ${responseId} not found`);

  const { task, evalRun } = response.execution;
  const criteria = evalRun.rubric.criteria;
  if (criteria.length === 0) return { responseId, expected: 0, scored: 0, issues: [] };

  const { system, prompt, jsonSchema } = buildJudgePrompt({
    taskPrompt: task.prompt,
    candidateResponse: response.content,
    criteria: criteria.map((c) => ({
      name: c.name,
      description: c.description,
      scaleMin: c.scaleMin,
      scaleMax: c.scaleMax,
    })),
  });

  const provider = getProvider(evalRun.judgeModel.provider.slug as ProviderSlug);
  let result: CompletionResult;
  try {
    result = await provider.complete({
      model: evalRun.judgeModel.apiName,
      prompt,
      system,
      jsonSchema,
      timeoutMs: JUDGE_TIMEOUT_MS,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const reason = /timed out/i.test(message) ? "timeout" : "provider_error";
    // No output exists to store, so the reason is the whole record. Without this row a
    // timeout and a rate limit are indistinguishable after the fact — the gap that made
    // an earlier unjudged response impossible to diagnose without re-running the judge.
    await recordJudgeCall(db, {
      responseId,
      judgeModelId: evalRun.judgeModel.id,
      rawOutput: null,
      failureReason: reason,
      failureDetail: message,
    });
    throw new JudgeError(reason, `judge call failed for response ${responseId}: ${message}`);
  }

  // Persist the verbatim judge output (with real token/latency numbers) before parsing,
  // so malformed or contradictory judge calls stay auditable without re-running the
  // judge. Best-effort: an audit-trail failure must not sink a good judge call.
  const judgeCallId = await recordJudgeCall(db, {
    responseId,
    judgeModelId: evalRun.judgeModel.id,
    rawOutput: result.text,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
    latencyMs: result.latencyMs,
  });

  const parsed = parseJudgeOutput(
    result.text,
    criteria.map((c) => ({ id: c.id, name: c.name, scaleMin: c.scaleMin, scaleMax: c.scaleMax })),
  );
  if (parsed.fatal) {
    // The row already holds the raw output; mark why it yielded nothing, so a sweep for
    // failures finds parse failures alongside provider ones.
    if (judgeCallId) {
      try {
        await db
          .update(judgeCalls)
          .set({ failureReason: parsed.fatal, failureDetail: parsed.fatalDetail })
          .where(eq(judgeCalls.id, judgeCallId));
      } catch (err) {
        console.warn(`[judge] could not record failure for response ${responseId}:`, err);
      }
    }
    throw new JudgeError(
      parsed.fatal,
      `judge output unusable (${parsed.fatal}) for response ${responseId}: ${parsed.fatalDetail}`,
    );
  }

  await db
    .insert(scores)
    .values(
      parsed.rows.map((row) => ({
        responseId,
        rubricCriterionId: row.criterionId,
        judgeModelId: evalRun.judgeModel.id,
        score: String(row.score), // numeric column → drizzle expects a string
        reasoning: row.reasoning,
      })),
    )
    .onConflictDoNothing();

  return {
    responseId,
    expected: criteria.length,
    scored: parsed.rows.length,
    issues: parsed.issues,
  };
}
