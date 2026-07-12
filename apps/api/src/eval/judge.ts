import { judgeCalls, responses, scores, type DB } from "@llm-eval/db";
import type { ProviderSlug } from "@llm-eval/shared";
import { eq } from "drizzle-orm";
import { getProvider } from "../providers/registry";
import type { CompletionResult } from "../providers/types";
import { parseJudgeOutput, type JudgeIssue } from "./parseJudgeOutput";
import { buildJudgePrompt } from "./prompts";

const JUDGE_TIMEOUT_MS = Number(process.env.JUDGE_TIMEOUT_MS) || 60_000;

/** Thrown when a judge call produced nothing storable. Carries the failure mode by name. */
export class JudgeError extends Error {
  constructor(
    readonly reason: "timeout" | "provider_error" | "malformed_json" | "refusal" | "no_scores",
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
    throw new JudgeError(reason, `judge call failed for response ${responseId}: ${message}`);
  }

  // Persist the verbatim judge output (with real token/latency numbers) before parsing,
  // so malformed or contradictory judge calls stay auditable without re-running the
  // judge. Best-effort: an audit-trail failure must not sink a good judge call.
  try {
    await db.insert(judgeCalls).values({
      responseId,
      judgeModelId: evalRun.judgeModel.id,
      rawOutput: result.text,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      latencyMs: result.latencyMs,
    });
  } catch (err) {
    console.warn(`[judge] could not persist raw output for response ${responseId}:`, err);
  }

  const parsed = parseJudgeOutput(
    result.text,
    criteria.map((c) => ({ id: c.id, name: c.name, scaleMin: c.scaleMin, scaleMax: c.scaleMax })),
  );
  if (parsed.fatal) {
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
