import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GeminiProvider } from "./gemini";
import { OpenAIProvider } from "./openai";

/** fetch stub that never resolves until its AbortSignal fires, like a hung upstream. */
function hangingFetch(): typeof fetch {
  return ((_url: unknown, init?: RequestInit) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
    })) as typeof fetch;
}

describe("provider timeouts", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", hangingFetch());
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("OPENAI_API_KEY", "test-key");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("Gemini aborts a hung request and reports the timeout", async () => {
    const provider = new GeminiProvider();
    await expect(
      provider.complete({ model: "gemini-2.5-flash", prompt: "hi", timeoutMs: 25 }),
    ).rejects.toThrow(/timed out after 25ms/);
  });

  it("OpenAI aborts a hung request and reports the timeout", async () => {
    const provider = new OpenAIProvider();
    await expect(
      provider.complete({ model: "gpt-4o-mini", prompt: "hi", timeoutMs: 25 }),
    ).rejects.toThrow(/timed out after 25ms/);
  });

  it("non-timeout fetch failures pass through untouched", async () => {
    vi.stubGlobal(
      "fetch",
      (() => Promise.reject(new TypeError("fetch failed"))) as typeof fetch,
    );
    const provider = new OpenAIProvider();
    await expect(
      provider.complete({ model: "gpt-4o-mini", prompt: "hi", timeoutMs: 25 }),
    ).rejects.toThrow("fetch failed");
  });
});
