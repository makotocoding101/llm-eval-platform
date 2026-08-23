import { useEffect, useState } from "react";

// Free-tier hosting spins the API down after a stretch of inactivity, so the first
// request has to boot it again — 30-60s during which a bare "Loading…" reads as a
// broken dashboard. Past this threshold a request is treated as a cold start and
// explained to the user instead.
const COLD_START_MS = 3000;

/**
 * Whether an in-flight request has been pending long enough to be a cold start.
 *
 * Warm requests resolve well inside the threshold, so this stays false for them and
 * the normal loading state is never replaced.
 *
 * `pending` defaults to true for the common case: a component that is only mounted
 * while its request is in flight, where mount-to-unmount is already the exact
 * pending window. Pass it explicitly to track a request from a component that
 * outlives it.
 */
export function useColdStart(pending = true): boolean {
  const [cold, setCold] = useState(false);

  useEffect(() => {
    if (!pending) {
      setCold(false);
      return;
    }
    const timer = window.setTimeout(() => setCold(true), COLD_START_MS);
    return () => window.clearTimeout(timer);
  }, [pending]);

  return cold;
}
