import type { CompletionProvider, CompletionRequest, CompletionResult } from "./types";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_ATTEMPTS = 3;

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>;
  stop_reason?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { type?: string; message?: string };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Models that rejected adaptive thinking (pre-4.6 models like Haiku 4.5 only support
// the older budget_tokens style). Learned at runtime from the API's 400 rather than a
// hand-maintained capability table; judge calls work fine without thinking there.
export const modelsWithoutAdaptiveThinking = new Set<string>();

/**
 * Anthropic (Claude) — the independent judge. Calls the Messages API directly (no SDK).
 * Judge calls pass `jsonSchema` for structured per-criterion scores via output_config.format.
 * The active judge is the models row with is_active_judge = true (currently Haiku 4.5,
 * validated by spot checks; Opus/Sonnet are the pricier options if quality demands it).
 */
export class AnthropicProvider implements CompletionProvider {
  readonly slug = "anthropic" as const;

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

    const body: Record<string, unknown> = {
      model: req.model,
      max_tokens: req.maxTokens ?? 16000,
      messages: [{ role: "user", content: req.prompt }],
    };
    // Adaptive thinking: Claude decides when/how much to reason — helps judge quality.
    if (!modelsWithoutAdaptiveThinking.has(req.model)) {
      body.thinking = { type: "adaptive" };
    }
    if (req.system) body.system = req.system;
    if (req.jsonSchema) {
      // Structured output — standard JSON Schema, exactly as buildJudgePrompt emits it.
      body.output_config = { format: { type: "json_schema", schema: req.jsonSchema } };
    }

    const timeoutMs = req.timeoutMs ?? 120_000;
    const startedAt = Date.now();
    let res!: Response;
    let json!: AnthropicResponse;
    for (let attempt = 1; ; attempt++) {
      try {
        res = await fetch(ANTHROPIC_URL, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": ANTHROPIC_VERSION,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        if (err instanceof Error && err.name === "TimeoutError") {
          throw new Error(`Anthropic request timed out after ${timeoutMs}ms`);
        }
        throw err;
      }
      json = (await res.json()) as AnthropicResponse;
      if (res.ok) break;
      // Pre-4.6 models (e.g. Haiku 4.5) reject adaptive thinking with a 400 — drop the
      // field, remember the model, and retry immediately (doesn't consume an attempt).
      if (
        res.status === 400 &&
        "thinking" in body &&
        /thinking is not supported/i.test(json.error?.message ?? "")
      ) {
        modelsWithoutAdaptiveThinking.add(req.model);
        delete body.thinking;
        attempt--;
        continue;
      }
      // 429 rate limit / 529 overloaded are retryable; honor retry-after when present.
      if ((res.status === 429 || res.status === 529) && attempt < MAX_ATTEMPTS) {
        const retryAfter = Number(res.headers.get("retry-after"));
        const delayMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : attempt * 2000;
        await sleep(Math.min(delayMs, 60_000));
        continue;
      }
      throw new Error(`Anthropic ${res.status}: ${json.error?.message ?? res.statusText}`);
    }
    const latencyMs = Date.now() - startedAt;

    // Real token spend per call — the basis for judge cost accounting, instead of
    // estimating from prompt sizes. output_tokens includes any (billed) thinking.
    console.log(
      `[anthropic] model=${req.model} usage=${JSON.stringify(json.usage ?? {})} latency_ms=${latencyMs}`,
    );

    // Safety classifiers can decline with HTTP 200 + stop_reason "refusal" — never
    // treat that as a scoreable (empty/partial) response.
    if (json.stop_reason === "refusal") {
      throw new Error("Anthropic refused the request (stop_reason: refusal)");
    }

    const text = (json.content ?? [])
      .filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("");
    if (!text) throw new Error(`Anthropic returned no text (stop_reason: ${json.stop_reason})`);

    return {
      text,
      raw: json,
      promptTokens: json.usage?.input_tokens ?? null,
      completionTokens: json.usage?.output_tokens ?? null,
      latencyMs,
    };
  }
}
