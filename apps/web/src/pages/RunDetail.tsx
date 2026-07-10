import { useEffect, useState } from "react";
import { api, type EvalRunDetail, type Execution } from "../api/client";

// Status is dot + label, never color alone. Success stays quiet (zinc); red is
// reserved for errors and the accent for active/in-flight states.
const executionStatus: Record<Execution["status"], { dot: string; text: string; pulse?: boolean }> = {
  pending: { dot: "bg-zinc-600", text: "text-zinc-500" },
  running: { dot: "bg-accent", text: "text-accent", pulse: true },
  success: { dot: "bg-zinc-400", text: "text-zinc-400" },
  error: { dot: "bg-red-400", text: "text-red-400" },
};

const runStatus: Record<EvalRunDetail["status"], { dot: string; text: string; pulse?: boolean }> = {
  pending: { dot: "bg-zinc-600", text: "text-zinc-500" },
  running: { dot: "bg-accent", text: "text-accent", pulse: true },
  completed: { dot: "bg-zinc-400", text: "text-zinc-400" },
  failed: { dot: "bg-red-400", text: "text-red-400" },
};

function StatusBadge({ label, meta }: { label: string; meta: { dot: string; text: string; pulse?: boolean } }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${meta.text}`}>
      <span className={`size-1.5 rounded-full ${meta.dot} ${meta.pulse ? "animate-pulse" : ""}`} />
      {label}
    </span>
  );
}

function fmt(n: string | null): string {
  if (n == null) return "—";
  const v = Number(n);
  return Number.isFinite(v) ? v.toFixed(2) : "—";
}

function ModelCard({ ex, isTop }: { ex: Execution; isTop: boolean }) {
  const q = ex.response?.quality;
  return (
    <div className="flex min-w-[300px] flex-1 basis-80 flex-col rounded-2xl border border-white/[0.06] bg-card p-6 shadow-lg shadow-black/20">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold text-zinc-100">{ex.model.displayName}</span>
        <StatusBadge label={ex.status} meta={executionStatus[ex.status]} />
      </div>
      <div className="mt-0.5 font-mono text-[11px] text-zinc-600">{ex.model.apiName}</div>

      {ex.status === "error" && (
        <p className="mt-4 text-sm leading-relaxed text-red-400">{ex.errorMessage ?? "failed"}</p>
      )}

      {ex.response && (
        <>
          <div className="mt-5 flex items-baseline gap-2.5">
            <span
              className={`text-3xl font-bold tracking-tight tabular-nums ${isTop ? "text-accent" : "text-zinc-50"}`}
            >
              {fmt(q?.weightedScore ?? null)}
            </span>
            <span className="text-xs text-zinc-500">
              weighted quality{q?.criteriaScored ? ` · ${q.criteriaScored} criteria` : ""}
            </span>
          </div>

          <div className="mt-4 max-h-60 overflow-y-auto rounded-xl border border-white/5 bg-inset px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap text-zinc-300">
            {ex.response.content}
          </div>

          <div className="mt-4 divide-y divide-white/5">
            {ex.response.scores
              .slice()
              .sort((a, b) => a.criterion.name.localeCompare(b.criterion.name))
              .map((s) => (
                <div key={s.id} className="py-2.5 first:pt-0 last:pb-0">
                  <div className="flex items-baseline justify-between gap-4 text-[13px]">
                    <span className="text-zinc-300">
                      {s.criterion.name} <span className="text-zinc-600">· w{s.criterion.weight}</span>
                    </span>
                    <span className="font-semibold text-zinc-100 tabular-nums">
                      {s.score}
                      <span className="font-normal text-zinc-600">/{s.criterion.scaleMax}</span>
                    </span>
                  </div>
                  {s.reasoning && (
                    <p className="mt-1 text-xs leading-relaxed text-zinc-500">{s.reasoning}</p>
                  )}
                </div>
              ))}
          </div>

          <div className="mt-auto pt-5 font-mono text-[11px] text-zinc-600">
            {ex.response.latencyMs ?? "—"} ms · {ex.response.promptTokens ?? "—"} →{" "}
            {ex.response.completionTokens ?? "—"} tok
          </div>
        </>
      )}
    </div>
  );
}

/** The strict winner's execution id for a task group — none on ties or <2 scored models. */
function topExecutionId(execs: Execution[]): string | null {
  const scored = execs
    .map((ex) => ({ id: ex.id, score: Number(ex.response?.quality?.weightedScore) }))
    .filter((s) => Number.isFinite(s.score));
  if (scored.length < 2) return null;
  const max = Math.max(...scored.map((s) => s.score));
  const winners = scored.filter((s) => s.score === max);
  return winners.length === 1 ? winners[0]!.id : null;
}

export function RunDetail({ runId, onBack }: { runId: string; onBack: () => void }) {
  const [run, setRun] = useState<EvalRunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Poll while the run is in flight (creation returns 202 and executes in the background).
  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    async function tick() {
      try {
        const r = await api.evalRun(runId);
        if (cancelled) return;
        setRun(r);
        setError(null);
        if (r.status === "pending" || r.status === "running") {
          timer = window.setTimeout(tick, 2000);
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    }

    setRun(null);
    setError(null);
    void tick();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [runId]);

  if (error) return <p className="text-sm text-red-400">{error}</p>;
  if (!run) return <p className="text-sm text-zinc-500">Loading…</p>;

  const inFlight = run.status === "pending" || run.status === "running";

  // Group executions by task so each task shows its candidates side by side.
  const byTask = new Map<string, Execution[]>();
  for (const ex of run.executions) {
    const list = byTask.get(ex.task.id) ?? [];
    list.push(ex);
    byTask.set(ex.task.id, list);
  }

  return (
    <div>
      <button
        onClick={onBack}
        className="mb-8 inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-1.5 text-sm text-zinc-400 transition-colors hover:border-white/20 hover:text-zinc-100"
      >
        ← Back to runs
      </button>

      <h2 className="text-3xl font-bold tracking-tight text-zinc-50">{run.name}</h2>
      <p className="mt-2 flex items-center gap-3 text-sm text-zinc-500">
        <StatusBadge label={run.status} meta={runStatus[run.status]} />
        <span>{run.executions.length} executions</span>
        {inFlight && <span className="text-accent">generating &amp; judging… auto-refreshing</span>}
      </p>

      {run.executions.length === 0 && inFlight && (
        <p className="mt-10 text-sm text-zinc-500">Planning executions…</p>
      )}

      <div className="mt-12 space-y-14">
        {[...byTask.values()].map((execs) => {
          const task = execs[0]!.task;
          const topId = topExecutionId(execs);
          return (
            <section key={task.id}>
              <div className="text-[11px] font-medium tracking-[0.14em] text-zinc-500 uppercase">
                {task.slug}
              </div>
              <p className="mt-1.5 max-w-3xl text-[15px] leading-relaxed text-zinc-300">
                {task.prompt}
              </p>
              <div className="mt-5 flex flex-wrap gap-5">
                {execs
                  .slice()
                  .sort((a, b) => a.model.displayName.localeCompare(b.model.displayName))
                  .map((ex) => (
                    <ModelCard key={ex.id} ex={ex} isTop={ex.id === topId} />
                  ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
