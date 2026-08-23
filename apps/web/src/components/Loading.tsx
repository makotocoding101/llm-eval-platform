import { useColdStart } from "../hooks/useColdStart";

/**
 * Loading state that grows an explanation when the wait runs long.
 *
 * Render it only while a request is in flight — it reads its own mount lifetime as
 * the pending window, so no page needs to track elapsed time itself.
 */
export function Loading({ className = "mt-8" }: { className?: string }) {
  const cold = useColdStart();

  // One stable live region across the swap, so the explanation is announced rather
  // than silently replacing the element a screen reader was already tracking.
  return (
    <div className={className} aria-live="polite" aria-busy="true">
      {cold ? (
        <div className="max-w-xl rounded-2xl border border-white/[0.06] bg-card p-6 shadow-lg shadow-black/20">
          {/* Same dot + label vocabulary as an in-flight run: informational, not an error. */}
          <div className="flex items-center gap-1.5">
            <span className="size-1.5 animate-pulse rounded-full bg-accent" />
            <span className="text-xs font-medium text-accent">Waking the server up</span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-zinc-400">
            The API sleeps after a few minutes of inactivity on free-tier hosting, so the first
            request has to start it back up. This takes up to a minute — the page will fill in on
            its own, no need to refresh.
          </p>
        </div>
      ) : (
        <p className="text-sm text-zinc-500">Loading…</p>
      )}
    </div>
  );
}
