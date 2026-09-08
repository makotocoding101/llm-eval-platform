import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import { beforeEach, describe, expect, it } from "vitest";
import { rateLimitOptions, runRateLimit } from "./rateLimit";

/**
 * Exercises the wiring rather than the library: that only the routes which opt in are
 * metered, that the bucket is per caller, and that the caller is identified the way
 * the deployed server identifies them (X-Forwarded-For, one trusted hop).
 */
async function buildApp(max = 3): Promise<FastifyInstance> {
  // trustProxy mirrors server.ts — without it every request shares one bucket.
  const app = Fastify({ trustProxy: 1 });
  await app.register(rateLimit, rateLimitOptions);

  app.post("/api/eval-runs", { config: { rateLimit: { ...runRateLimit.rateLimit, max } } }, async () => ({
    started: true,
  }));
  app.get("/api/eval-runs", async () => [{ id: "r1" }]);
  await app.ready();
  return app;
}

/** A request that looks like it arrived through the proxy from `ip`. */
const from = (app: FastifyInstance, ip: string, method: "POST" | "GET" = "POST") =>
  app.inject({ method, url: "/api/eval-runs", headers: { "x-forwarded-for": ip }, payload: {} });

let app: FastifyInstance;
beforeEach(async () => {
  app = await buildApp();
});

describe("eval-run rate limit", () => {
  it("allows the configured number of runs, then refuses", async () => {
    for (let i = 1; i <= 3; i++) {
      expect((await from(app, "203.0.113.1")).statusCode, `request ${i}`).toBe(200);
    }
    expect((await from(app, "203.0.113.1")).statusCode).toBe(429);
  });

  it("explains why rather than returning a bare 429", async () => {
    for (let i = 0; i < 3; i++) await from(app, "203.0.113.2");
    const res = await from(app, "203.0.113.2");

    expect(res.statusCode).toBe(429);
    const body = res.json();
    expect(body.error).toBe("Too Many Requests");
    // The dashboard prints the response body on a failed POST, so it has to read.
    expect(body.message).toMatch(/provider credit/);
    expect(body.message).toMatch(/3 per hour/);
    // Lets a client know when to come back instead of guessing.
    expect(res.headers["retry-after"]).toBeDefined();
  });

  it("counts each address separately", async () => {
    for (let i = 0; i < 3; i++) expect((await from(app, "203.0.113.3")).statusCode).toBe(200);
    expect((await from(app, "203.0.113.3")).statusCode).toBe(429);

    // A different visitor is unaffected by the first one exhausting their quota.
    expect((await from(app, "198.51.100.7")).statusCode).toBe(200);
  });

  it("identifies the caller by the hop the proxy appended, not one they can forge", async () => {
    // A caller prepending a fake address cannot mint a fresh quota: with one trusted
    // hop the rightmost entry wins, and that is the one the proxy adds.
    const forged = (ip: string) =>
      app.inject({
        method: "POST",
        url: "/api/eval-runs",
        headers: { "x-forwarded-for": `${ip}, 203.0.113.9` },
        payload: {},
      });

    for (let i = 0; i < 3; i++) expect((await forged("1.1.1.1")).statusCode).toBe(200);
    // Same real caller, different forged prefix — still counted, still refused.
    expect((await forged("2.2.2.2")).statusCode).toBe(429);
  });

  it("leaves reads unmetered", async () => {
    // Well past the write limit; polling a running eval must never be throttled.
    for (let i = 0; i < 20; i++) {
      expect((await from(app, "203.0.113.4", "GET")).statusCode).toBe(200);
    }
    // …and burning through reads has not consumed the write quota.
    expect((await from(app, "203.0.113.4")).statusCode).toBe(200);
  });

  it("does not limit loopback, so local development is unaffected", async () => {
    for (let i = 0; i < 10; i++) {
      const res = await app.inject({ method: "POST", url: "/api/eval-runs", payload: {} });
      expect(res.statusCode).toBe(200);
    }
  });
});
