import type { CompletionProvider, CompletionRequest, CompletionResult } from "./types";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

interface OpenAIResponse {
  choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
}

/** OpenAI candidate provider. Calls the Chat Completions REST API directly (no SDK). */
export class OpenAIProvider implements CompletionProvider {
  readonly slug = "openai" as const;

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

    const messages: Array<{ role: string; content: string }> = [];
    if (req.system) messages.push({ role: "system", content: req.system });
    messages.push({ role: "user", content: req.prompt });

    const body: Record<string, unknown> = { model: req.model, messages };
    if (req.maxTokens != null) body.max_tokens = req.maxTokens;
    if (req.jsonSchema) {
      // Structured output for judge calls. Note: expects standard JSON Schema (lowercase
      // types) — buildJudgePrompt currently emits Gemini's dialect, so OpenAI-as-judge would
      // need a schema translation. Fine today: OpenAI is candidate-only.
      body.response_format = {
        type: "json_schema",
        json_schema: { name: "evaluation", schema: req.jsonSchema },
      };
    }

    const timeoutMs = req.timeoutMs ?? 120_000;
    const startedAt = Date.now();
    let res: Response;
    try {
      res = await fetch(OPENAI_URL, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      if (err instanceof Error && err.name === "TimeoutError") {
        throw new Error(`OpenAI request timed out after ${timeoutMs}ms`);
      }
      throw err;
    }
    const latencyMs = Date.now() - startedAt;

    const json = (await res.json()) as OpenAIResponse;
    if (!res.ok) {
      throw new Error(`OpenAI ${res.status}: ${json.error?.message ?? res.statusText}`);
    }

    const choice = json.choices?.[0];
    if (!choice) throw new Error("OpenAI returned no choices");
    const text = choice.message?.content ?? "";

    return {
      text,
      raw: json,
      promptTokens: json.usage?.prompt_tokens ?? null,
      completionTokens: json.usage?.completion_tokens ?? null,
      latencyMs,
    };
  }
}
