import { executions, responses, type DB } from "@llm-eval/db";
import type { ProviderSlug } from "@llm-eval/shared";
import { eq } from "drizzle-orm";
import { getProvider } from "../providers/registry";

/**
 * Run one execution: pending → running, call the candidate model via its provider adapter,
 * persist the response, then set success. Provider failures are recorded as error status
 * (not thrown) so one failure doesn't abort the rest of the batch.
 */
export async function executeOne(db: DB, executionId: string): Promise<void> {
  const execution = await db.query.executions.findFirst({
    where: eq(executions.id, executionId),
    with: {
      task: true,
      model: { with: { provider: true } },
    },
  });
  if (!execution) throw new Error(`execution ${executionId} not found`);

  await db
    .update(executions)
    .set({ status: "running", startedAt: new Date() })
    .where(eq(executions.id, executionId));

  try {
    const provider = getProvider(execution.model.provider.slug as ProviderSlug);
    const result = await provider.complete({
      model: execution.model.apiName,
      prompt: execution.task.prompt,
    });

    await db.insert(responses).values({
      executionId,
      content: result.text,
      raw: result.raw,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      latencyMs: result.latencyMs,
    });

    await db
      .update(executions)
      .set({ status: "success", completedAt: new Date() })
      .where(eq(executions.id, executionId));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(executions)
      .set({ status: "error", errorMessage: message, completedAt: new Date() })
      .where(eq(executions.id, executionId));
  }
}
