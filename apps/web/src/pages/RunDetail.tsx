import { useEffect, useState } from "react";
import { api, type EvalRunDetail, type Execution } from "../api/client";

const statusColor: Record<Execution["status"], string> = {
  pending: "#888",
  running: "#0a7",
  success: "#0a0",
  error: "#c00",
};

function fmt(n: string | null): string {
  if (n == null) return "—";
  const v = Number(n);
  return Number.isFinite(v) ? v.toFixed(2) : "—";
}

function ModelCard({ ex }: { ex: Execution }) {
  const q = ex.response?.quality;
  return (
    <div
      style={{
        flex: "1 1 320px",
        minWidth: 300,
        border: "1px solid #ddd",
        borderRadius: 8,
        padding: 16,
        background: "#fafafa",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <strong>{ex.model.displayName}</strong>
        <span style={{ color: statusColor[ex.status], fontWeight: 600, fontSize: 13 }}>
          {ex.status}
        </span>
      </div>
      <div style={{ color: "#999", fontSize: 12, marginBottom: 8 }}>{ex.model.apiName}</div>

      {ex.status === "error" && (
        <p style={{ color: "#c00", fontSize: 13 }}>{ex.errorMessage ?? "failed"}</p>
      )}

      {ex.response && (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 28, fontWeight: 700, color: "#0a0" }}>
              {fmt(q?.weightedScore ?? null)}
            </span>
            <span style={{ color: "#888", fontSize: 12 }}>
              weighted quality{q?.criteriaScored ? ` · ${q.criteriaScored} criteria` : ""}
            </span>
          </div>

          <p
            style={{
              fontSize: 14,
              lineHeight: 1.5,
              background: "#fff",
              border: "1px solid #eee",
              borderRadius: 6,
              padding: "8px 10px",
              whiteSpace: "pre-wrap",
            }}
          >
            {ex.response.content}
          </p>

          <div style={{ marginTop: 10 }}>
            {ex.response.scores
              .slice()
              .sort((a, b) => a.criterion.name.localeCompare(b.criterion.name))
              .map((s) => (
                <div key={s.id} style={{ marginBottom: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                    <span>
                      {s.criterion.name}{" "}
                      <span style={{ color: "#aaa" }}>(w{s.criterion.weight})</span>
                    </span>
                    <strong>
                      {s.score}
                      <span style={{ color: "#bbb", fontWeight: 400 }}>
                        /{s.criterion.scaleMax}
                      </span>
                    </strong>
                  </div>
                  {s.reasoning && (
                    <div style={{ fontSize: 12, color: "#777", marginTop: 2 }}>{s.reasoning}</div>
                  )}
                </div>
              ))}
          </div>

          <div style={{ marginTop: 8, fontSize: 11, color: "#aaa" }}>
            {ex.response.latencyMs ?? "—"} ms · {ex.response.promptTokens ?? "—"}→
            {ex.response.completionTokens ?? "—"} tok
          </div>
        </>
      )}
    </div>
  );
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

  if (error) return <p style={{ color: "#c00" }}>{error}</p>;
  if (!run) return <p>Loading…</p>;

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
      <button onClick={onBack} style={{ marginBottom: 16 }}>
        ← Back to runs
      </button>
      <h2 style={{ marginBottom: 4 }}>{run.name}</h2>
      <p style={{ color: "#666", marginTop: 0 }}>
        status <strong style={{ color: inFlight ? "#0a7" : undefined }}>{run.status}</strong> ·{" "}
        {run.executions.length} executions
        {inFlight && <span style={{ color: "#0a7" }}> · generating &amp; judging… (auto-refreshing)</span>}
      </p>

      {run.executions.length === 0 && inFlight && <p style={{ color: "#888" }}>Planning executions…</p>}

      {[...byTask.values()].map((execs) => {
        const task = execs[0]!.task;
        return (
          <section key={task.id} style={{ marginBottom: 28 }}>
            <div style={{ marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: "#999", textTransform: "uppercase" }}>
                {task.slug}
              </span>
              <div style={{ fontStyle: "italic", color: "#444" }}>{task.prompt}</div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
              {execs
                .slice()
                .sort((a, b) => a.model.displayName.localeCompare(b.model.displayName))
                .map((ex) => (
                  <ModelCard key={ex.id} ex={ex} />
                ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
