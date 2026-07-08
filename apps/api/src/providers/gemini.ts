import type { CompletionProvider, CompletionRequest, CompletionResult } from "./types";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
}

const MAX_ATTEMPTS = 3;

/** Free tier is 5 req/min — parse Gemini's own "retry in Xs" hint, fall back to 20s. */
function retryDelayMs(message: string): number {
  const hinted = /retry in (\d+(?:\.\d+)?)s/i.exec(message);
  const seconds = hinted ? Number(hinted[1]) + 1 : 20;
  return Math.min(seconds, 60) * 1000;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Google Gemini — the first provider enabled (free tier). Calls the REST API directly. */
export class GeminiProvider implements CompletionProvider {
  readonly slug = "google" as const;

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

    const body: Record<string, unknown> = {
      contents: [{ parts: [{ text: req.prompt }] }],
    };
    if (req.system) {
      body.systemInstruction = { parts: [{ text: req.system }] };
    }
    const generationConfig: Record<string, unknown> = {};
    if (req.maxTokens != null) generationConfig.maxOutputTokens = req.maxTokens;
    if (req.jsonSchema) {
      // Structured output — used by judge calls so per-criterion scores parse reliably.
      generationConfig.responseMimeType = "application/json";
      generationConfig.responseSchema = req.jsonSchema;
    }
    if (Object.keys(generationConfig).length > 0) body.generationConfig = generationConfig;

    const url = `${GEMINI_BASE}/${encodeURIComponent(req.model)}:generateContent`;
    const timeoutMs = req.timeoutMs ?? 120_000;
    const startedAt = Date.now();
    let res!: Response;
    let json!: GeminiResponse;
    for (let attempt = 1; ; attempt++) {
      try {
        res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        if (err instanceof Error && err.name === "TimeoutError") {
          throw new Error(`Gemini request timed out after ${timeoutMs}ms`);
        }
        throw err;
      }
      json = (await res.json()) as GeminiResponse;
      if (res.ok) break;
      // Free-tier rate limit: wait out Gemini's suggested delay and retry in place.
      if (res.status === 429 && attempt < MAX_ATTEMPTS) {
        await sleep(retryDelayMs(json.error?.message ?? ""));
        continue;
      }
      throw new Error(`Gemini ${res.status}: ${json.error?.message ?? res.statusText}`);
    }
    const latencyMs = Date.now() - startedAt;

    const candidate = json.candidates?.[0];
    if (!candidate) {
      throw new Error(
        `Gemini returned no output (${json.promptFeedback?.blockReason ?? "no candidates"})`,
      );
    }
    const text = (candidate.content?.parts ?? []).map((p) => p.text ?? "").join("");

    return {
      text,
      raw: json,
      promptTokens: json.usageMetadata?.promptTokenCount ?? null,
      completionTokens: json.usageMetadata?.candidatesTokenCount ?? null,
      latencyMs,
    };
  }
}
