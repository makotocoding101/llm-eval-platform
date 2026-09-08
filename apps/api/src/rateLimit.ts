import type { FastifyRequest } from "fastify";

/**
 * Optional ceiling on how often one address may start an eval run.
 *
 * Off by default. A run costs about $0.14 in judge tokens — 22 Haiku calls over the
 * seeded rubric — and organic traffic does not sit there clicking it, so capping the
 * demo mostly risks turning a visitor away at the one moment they wanted to try it.
 * Reads are never metered either way.
 *
 * Set RUN_RATE_LIMIT to a number to turn it on. It is an env var rather than a code
 * change so a live service under abuse can be capped without a deploy.
 */
export const RUN_LIMIT_MAX = Number(process.env.RUN_RATE_LIMIT) || 0;
export const RUN_LIMIT_WINDOW = process.env.RUN_RATE_WINDOW ?? "1 hour";

/** Whether a cap is configured at all. */
export const runLimitEnabled = RUN_LIMIT_MAX > 0;

export const rateLimitOptions = {
  // Nothing is metered unless a route opts in, which only happens when a cap is set.
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

/**
 * Route options for the endpoints that start a run. Empty — and therefore unmetered —
 * unless RUN_RATE_LIMIT is set, so the routes read the same either way.
 */
export const runRouteOptions = runLimitEnabled
  ? { config: { rateLimit: { max: RUN_LIMIT_MAX, timeWindow: RUN_LIMIT_WINDOW } } }
  : {};
