import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./client";

function response(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

const unavailable = response(503, { error: "service unavailable" });
const badGateway = response(502, { error: "bad gateway" });
const gatewayTimeout = response(504, { error: "gateway timeout" });
const tasks = response(200, [{ id: "t1", slug: "s", prompt: "p" }]);

/**
 * Runs the retry loop to completion without waiting out the real backoff. The
 * no-op catch keeps a rejection handled while the timers advance; the original
 * promise is returned so callers still observe it.
 */
async function settle<T>(promise: Promise<T>): Promise<T> {
  promise.catch(() => {});
  await vi.advanceTimersByTimeAsync(90_000);
  return promise;
}

describe("cold-start retry", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("retries a booting service and resolves once it comes up", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(unavailable)
      .mockResolvedValueOnce(badGateway)
      .mockResolvedValueOnce(tasks);
    vi.stubGlobal("fetch", fetchMock);

    await expect(settle(api.tasks())).resolves.toEqual([{ id: "t1", slug: "s", prompt: "p" }]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("retries a network failure on a read", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(tasks);
    vi.stubGlobal("fetch", fetchMock);

    await expect(settle(api.tasks())).resolves.toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after the retry window and surfaces the status", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(unavailable);
    vi.stubGlobal("fetch", fetchMock);

    await expect(settle(api.tasks())).rejects.toThrow(/GET \/tasks failed: 503/);
    // Retried, but the backoff keeps it to a handful of attempts — a service that is
    // still booting should not be hammered by the page waiting on it.
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
    expect(fetchMock.mock.calls.length).toBeLessThan(30);
  });

  it("stays within the retry window", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(unavailable);
    vi.stubGlobal("fetch", fetchMock);

    // Read the clock when the client gives up, not after advancing timers past it.
    const started = Date.now();
    let gaveUpAt = 0;
    const promise = api.tasks().catch((err: unknown) => {
      gaveUpAt = Date.now();
      throw err;
    });

    await expect(settle(promise)).rejects.toThrow();
    // 60s budget; the last sleep is clamped to what remains rather than overshooting.
    expect(gaveUpAt - started).toBeLessThanOrEqual(60_000);
  });

  it("does not retry a genuine server error", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response(500, { error: "boom" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(settle(api.tasks())).rejects.toThrow(/GET \/tasks failed: 500/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a write only while the service is provably down", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(unavailable)
      .mockResolvedValueOnce(response(200, { evalRun: { id: "r1" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(settle(api.rerun("r1"))).resolves.toEqual({ evalRun: { id: "r1" } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("never repeats a write whose outcome is ambiguous", async () => {
    // A 504 may mean the run already started; repeating it would spend provider
    // credit twice, so the write surfaces the error instead.
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(gatewayTimeout);
    vi.stubGlobal("fetch", fetchMock);

    await expect(settle(api.rerun("r1"))).rejects.toThrow(/POST .* failed: 504/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a gateway timeout on a read, where repeating is harmless", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(gatewayTimeout)
      .mockResolvedValueOnce(tasks);
    vi.stubGlobal("fetch", fetchMock);

    await expect(settle(api.tasks())).resolves.toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not repeat a write after a network failure", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(settle(api.rerun("r1"))).rejects.toThrow(/Failed to fetch/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
