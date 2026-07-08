import type { CompletionProvider, CompletionRequest, CompletionResult } from "./types";

/**
 * Anthropic (Claude) — the independent judge. Deferred (seeded disabled) until API access
 * is turned on. Judge calls pass `jsonSchema` for structured per-criterion scores.
 * Default judge model: claude-opus-4-8 (claude-sonnet-5 for a cheaper judge at volume).
 */
export class AnthropicProvider implements CompletionProvider {
  readonly slug = "anthropic" as const;

  async complete(_req: CompletionRequest): Promise<CompletionResult> {
    // TODO: call the Anthropic Messages API using ANTHROPIC_API_KEY.
    // Use output_config.format (json_schema) when req.jsonSchema is set; adaptive thinking.
    throw new Error("AnthropicProvider.complete not implemented");
  }
}
