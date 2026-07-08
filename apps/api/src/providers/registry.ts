import type { ProviderSlug } from "@llm-eval/shared";
import { AnthropicProvider } from "./anthropic";
import { GeminiProvider } from "./gemini";
import { OpenAIProvider } from "./openai";
import type { CompletionProvider } from "./types";

// slug → adapter. Whether a provider/model is actually usable is gated in the data layer
// via providers.enabled / models.enabled — not here.
const registry: Record<ProviderSlug, CompletionProvider> = {
  google: new GeminiProvider(),
  openai: new OpenAIProvider(),
  anthropic: new AnthropicProvider(),
};

export function getProvider(slug: ProviderSlug): CompletionProvider {
  return registry[slug];
}
