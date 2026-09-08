import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { rateLimitOptions, runRouteOptions } from "./rateLimit";

/**
 * Two things to hold: the demo is uncapped by default, and the cap still works when
 * someone turns it on. The second half matters because the env var is the response to
 * abuse on a live service — it has to work without a code change to lean on.
 */
async function buildApp(routeOptions: object): Promise<FastifyInstance> {
  // trustProxy mirrors server.ts — without it every request shares one bucket.
  const app = Fastify({ trustProxy: 1 });
  await app.register(rateLimit, rateLimitOptions);
  app.post("/api/eval-runs", routeOptions, async () => ({ started: true }));
  app.get("/api/eval-runs", async () => [{ id: "r1" }]);
  await app.ready();
  return app;
}

/** A request that looks like it arrived through the proxy from `ip`. */
const from = (app: FastifyInstance, ip: string, method: "POST" | "GET" = "POST") =>
  app.inject({ method, url: "/api/eval-runs", headers: { "x-forwarded-for": ip }, payload: {} });

const capped = { config: { rateLimit: { max: 3, timeWindow: "1 hour" } } };

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("uncapped by default", () => {
  it("carries no route config when RUN_RATE_LIMIT is unset", () => {
    expect(runRouteOptions).toEqual({});
  });

  it("lets one address start as many runs as it likes", async () => {
    const app = await buildApp(runRouteOptions);
    for (let i = 0; i < 25; i++) {
      expect((await from(app, "203.0.113.1")).statusCode, `request ${i + 1}`).toBe(200);
    }
  });
});

describe("cap turned on via RUN_RATE_LIMIT", () => {
  it("is picked up from the environment without a code change", async () => {
    vi.stubEnv("RUN_RATE_LIMIT", "10");
    vi.resetModules();
    const fresh = await import("./rateLimit");

    expect(fresh.runLimitEnabled).toBe(true);
    expect(fresh.runRouteOptions).toEqual({
      config: { rateLimit: { max: 10, timeWindow: "1 hour" } },
    });
  });

  it("allows the configured number of runs, then refuses", async () => {
    const app = await buildApp(capped);
    for (let i = 1; i <= 3; i++) {
      expect((await from(app, "203.0.113.2")).statusCode, `request ${i}`).toBe(200);
    }
    expect((await from(app, "203.0.113.2")).statusCode).toBe(429);
  });

  it("explains why rather than returning a bare 429", async () => {
    const app = await buildApp(capped);
    for (let i = 0; i < 3; i++) await from(app, "203.0.113.3");
    const res = await from(app, "203.0.113.3");

    expect(res.statusCode).toBe(429);
    // The dashboard prints the response body on a failed POST, so it has to read.
    expect(res.json().message).toMatch(/provider credit/);
    expect(res.headers["retry-after"]).toBeDefined();
  });

  it("counts each address separately", async () => {
    const app = await buildApp(capped);
    for (let i = 0; i < 3; i++) expect((await from(app, "203.0.113.4")).statusCode).toBe(200);
    expect((await from(app, "203.0.113.4")).statusCode).toBe(429);

    // A different visitor is unaffected by the first one exhausting their quota.
    expect((await from(app, "198.51.100.7")).statusCode).toBe(200);
  });

  it("identifies the caller by the hop the proxy appended, not one they can forge", async () => {
    const app = await buildApp(capped);
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
    const app = await buildApp(capped);
    // Well past the write limit; polling a running eval must never be throttled.
    for (let i = 0; i < 20; i++) {
      expect((await from(app, "203.0.113.5", "GET")).statusCode).toBe(200);
    }
    expect((await from(app, "203.0.113.5")).statusCode).toBe(200);
  });

  it("does not limit loopback, so local development is unaffected", async () => {
    const app = await buildApp(capped);
    for (let i = 0; i < 10; i++) {
      const res = await app.inject({ method: "POST", url: "/api/eval-runs", payload: {} });
      expect(res.statusCode).toBe(200);
    }
  });
});
