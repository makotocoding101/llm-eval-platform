import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GeminiProvider } from "./gemini";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    json: async () => body,
  } as unknown as Response;
}

const rateLimited = jsonResponse(429, {
  error: { message: "You exceeded your current quota. Please retry in 0.01s." },
});
const success = jsonResponse(200, {
  candidates: [{ content: { parts: [{ text: "ok" }] } }],
  usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
});

describe("Gemini 429 retry", () => {
  beforeEach(() => vi.stubEnv("GEMINI_API_KEY", "test-key"));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("retries after a 429 using the hinted delay and then succeeds", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(rateLimited)
      .mockResolvedValueOnce(success);
    vi.stubGlobal("fetch", fetchMock);

    const result = await new GeminiProvider().complete({ model: "gemini-2.5-flash", prompt: "hi" });
    expect(result.text).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after 3 attempts and surfaces the 429", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(rateLimited);
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      new GeminiProvider().complete({ model: "gemini-2.5-flash", prompt: "hi" }),
    ).rejects.toThrow(/Gemini 429/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not retry non-429 errors", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(500, { error: { message: "boom" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      new GeminiProvider().complete({ model: "gemini-2.5-flash", prompt: "hi" }),
    ).rejects.toThrow(/Gemini 500: boom/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
