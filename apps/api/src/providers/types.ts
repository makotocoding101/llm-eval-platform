import type { ProviderSlug } from "@llm-eval/shared";

export interface CompletionRequest {
  /** Provider-specific model id, e.g. 'gemini-2.5-flash' or 'claude-opus-4-8'. */
  model: string;
  /** The task prompt (candidate call) or the judge prompt (judge call). */
  prompt: string;
  /** Optional system instruction. */
  system?: string;
  maxTokens?: number;
  /**
   * When set, request output constrained to this JSON Schema. Used for judge calls so
   * per-criterion scores parse reliably. All three providers support structured output.
   */
  jsonSchema?: Record<string, unknown>;
  /** Abort the HTTP call after this many ms (default 120s). Judge calls set this lower. */
  timeoutMs?: number;
}

export interface CompletionResult {
  /** Primary text output. For judge calls this is the JSON string to parse. */
  text: string;
  /** Raw provider payload — persisted to responses.raw for debugging. */
  raw: unknown;
  promptTokens: number | null;
  completionTokens: number | null;
  latencyMs: number;
}

/**
 * One adapter per provider. Both candidate models and the judge go through this same
 * interface, so swapping the judge (e.g. Gemini → Claude) is a data change, not a code change.
 */
export interface CompletionProvider {
  readonly slug: ProviderSlug;
  complete(req: CompletionRequest): Promise<CompletionResult>;
}
