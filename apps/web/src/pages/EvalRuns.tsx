import { useEffect, useState } from "react";
import { api, type EvalRun } from "../api/client";
import { RunDetail } from "./RunDetail";

const statusColor: Record<EvalRun["status"], string> = {
  pending: "#888",
  running: "#0a7",
  completed: "#0a0",
  failed: "#c00",
};

export function EvalRuns() {
  const [runs, setRuns] = useState<EvalRun[] | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      setRuns(await api.evalRuns());
    } catch (e) {
      setError(String(e));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function newComparisonRun() {
    setCreating(true);
    setError(null);
    try {
      const [tasks, models, rubrics] = await Promise.all([
        api.tasks(),
        api.models(),
        api.rubrics(),
      ]);
      const candidates = models.filter((m) => m.kind === "candidate" && m.enabled);
      // Interim judge: the enabled Gemini model (Claude judge lands once its adapter is wired).
      const judge = models.find((m) => m.enabled && m.apiName.startsWith("gemini"));
      const rubric = rubrics[0];
      if (candidates.length === 0 || !judge || !rubric || tasks.length === 0) {
        throw new Error("Need ≥1 enabled candidate model, a Gemini judge, a rubric, and ≥1 task.");
      }
      const { evalRun } = await api.createRun({
        name: `Comparison ${new Date().toLocaleString()}`,
        rubricId: rubric.id,
        judgeModelId: judge.id,
        taskIds: tasks.map((t) => t.id),
        modelIds: candidates.map((m) => m.id),
      });
      await load();
      setSelectedRunId(evalRun.id);
    } catch (e) {
      setError(String(e));
    } finally {
      setCreating(false);
    }
  }

  if (selectedRunId) {
    return <RunDetail runId={selectedRunId} onBack={() => setSelectedRunId(null)} />;
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <button onClick={newComparisonRun} disabled={creating}>
          {creating ? "Starting…" : "＋ New comparison run"}
        </button>
        <button onClick={load} disabled={creating}>
          Refresh
        </button>
      </div>

      {error && <p style={{ color: "#c00" }}>{error}</p>}
      {!runs && <p>Loading…</p>}
      {runs && runs.length === 0 && <p>No runs yet — start one above.</p>}

      {runs && runs.length > 0 && (
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "2px solid #ddd" }}>
              <th style={{ padding: "8px 12px" }}>Name</th>
              <th style={{ padding: "8px 12px" }}>Status</th>
              <th style={{ padding: "8px 12px" }}>Created</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr
                key={r.id}
                onClick={() => setSelectedRunId(r.id)}
                style={{ cursor: "pointer", borderBottom: "1px solid #eee" }}
              >
                <td style={{ padding: "8px 12px", fontWeight: 500 }}>{r.name}</td>
                <td style={{ padding: "8px 12px" }}>
                  <span style={{ color: statusColor[r.status], fontWeight: 600 }}>{r.status}</span>
                </td>
                <td style={{ padding: "8px 12px", color: "#666" }}>
                  {new Date(r.createdAt).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
