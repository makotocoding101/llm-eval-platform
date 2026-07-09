import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnthropicProvider } from "./anthropic";

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    headers: new Headers(headers),
    json: async () => body,
  } as unknown as Response;
}

const success = jsonResponse(200, {
  content: [
    { type: "thinking", thinking: "" },
    { type: "text", text: '{"scores":[{"criterion":"accuracy","score":5,"reasoning":"ok"}]}' },
  ],
  stop_reason: "end_turn",
  usage: { input_tokens: 120, output_tokens: 40 },
});

describe("AnthropicProvider", () => {
  beforeEach(() => vi.stubEnv("ANTHROPIC_API_KEY", "test-key"));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("returns text from text blocks only, with token usage", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(success);
    vi.stubGlobal("fetch", fetchMock);

    const result = await new AnthropicProvider().complete({
      model: "claude-opus-4-8",
      prompt: "judge this",
      system: "you are a judge",
      jsonSchema: { type: "object" },
    });

    expect(result.text).toContain('"criterion":"accuracy"');
    expect(result.promptTokens).toBe(120);
    expect(result.completionTokens).toBe(40);

    const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string);
    expect(body.model).toBe("claude-opus-4-8");
    expect(body.system).toBe("you are a judge");
    expect(body.thinking).toEqual({ type: "adaptive" });
    expect(body.output_config).toEqual({
      format: { type: "json_schema", schema: { type: "object" } },
    });
    const headers = fetchMock.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    expect(headers["x-api-key"]).toBe("test-key");
  });

  it("retries 429 using the retry-after header and then succeeds", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse(429, { error: { message: "rate limited" } }, { "retry-after": "0.01" }),
      )
      .mockResolvedValueOnce(success);
    vi.stubGlobal("fetch", fetchMock);

    const result = await new AnthropicProvider().complete({ model: "claude-opus-4-8", prompt: "hi" });
    expect(result.text).toContain("scores");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries 529 overloaded and gives up after 3 attempts", async () => {
    const overloaded = jsonResponse(
      529,
      { error: { type: "overloaded_error", message: "Overloaded" } },
      { "retry-after": "0.01" },
    );
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(overloaded);
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      new AnthropicProvider().complete({ model: "claude-opus-4-8", prompt: "hi" }),
    ).rejects.toThrow(/Anthropic 529/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not retry non-retryable errors (400)", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(400, { error: { message: "bad request" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      new AnthropicProvider().complete({ model: "claude-opus-4-8", prompt: "hi" }),
    ).rejects.toThrow(/Anthropic 400: bad request/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws a clear error on stop_reason refusal instead of returning empty text", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(200, {
        content: [],
        stop_reason: "refusal",
        usage: { input_tokens: 10, output_tokens: 0 },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      new AnthropicProvider().complete({ model: "claude-opus-4-8", prompt: "hi" }),
    ).rejects.toThrow(/refusal/);
  });

  it("aborts a hung request and reports the timeout", async () => {
    vi.stubGlobal(
      "fetch",
      ((_url: unknown, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
        })) as typeof fetch,
    );

    await expect(
      new AnthropicProvider().complete({ model: "claude-opus-4-8", prompt: "hi", timeoutMs: 25 }),
    ).rejects.toThrow(/timed out after 25ms/);
  });
});
