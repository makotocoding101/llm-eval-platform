import type { FastifyRequest } from "fastify";

/**
 * Ceiling on how often one address may start an eval run.
 *
 * The API has no authentication, and starting a run spends real provider credit —
 * on the seeded rubric that is 11 tasks x 2 candidates, plus a judge call for every
 * response. The public demo should stay clickable, so this is a ceiling rather than
 * a gate: a visitor gets to try it, nobody gets to hammer it.
 *
 * Reads are deliberately unmetered. The dashboard polls a run every 2s while it
 * executes, so throttling GETs would break the page this is meant to protect.
 */
export const RUN_LIMIT_MAX = Number(process.env.RUN_RATE_LIMIT) || 3;
export const RUN_LIMIT_WINDOW = process.env.RUN_RATE_WINDOW ?? "1 hour";

export const rateLimitOptions = {
  // Opt in per route instead of limiting everything: with `global: false` only the
  // routes that carry a rateLimit config are counted.
  global: false,

  // Loopback is local development and the container health check, never a visitor.
  // On Render the caller's address arrives through X-Forwarded-For and is never
  // 127.0.0.1 — but that is only true because the server sets trustProxy; without
  // it every request would look like it came from the proxy and share one bucket.
  // See the trustProxy note in server.ts, the two settings only work as a pair.
  allowList: ["127.0.0.1", "::1"],

  // Say why, not just no. This text reaches the dashboard, which surfaces the
  // response body on a failed POST.
  errorResponseBuilder: (_req: FastifyRequest, context: { after: string; max: number }) => ({
    statusCode: 429,
    error: "Too Many Requests",
    message:
      `This is a public demo and each run spends real provider credit, so it is ` +
      `capped at ${context.max} per hour from one address. Try again in ${context.after}.`,
  }),
};

/** Attach to a route to meter it: `app.post(path, { config: runRateLimit }, handler)`. */
export const runRateLimit = {
  rateLimit: { max: RUN_LIMIT_MAX, timeWindow: RUN_LIMIT_WINDOW },
};
