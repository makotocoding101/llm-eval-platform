import { useEffect, useState } from "react";
import { api, type EvalRun } from "../api/client";
import { StatusBadge, runStatus } from "../components/StatusBadge";
import { RunDetail } from "./RunDetail";

export function EvalRuns() {
  const [runs, setRuns] = useState<EvalRun[] | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [naming, setNaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
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

  // The button opens a naming form pre-filled with a timestamp default, so pressing
  // Enter immediately reproduces the old one-click behavior.
  function toggleNaming() {
    if (naming) {
      setNaming(false);
      return;
    }
    setNameDraft(`Comparison ${new Date().toLocaleString()}`);
    setNaming(true);
  }

  async function newComparisonRun(name: string) {
    setCreating(true);
    setError(null);
    try {
      const [tasks, models, rubrics] = await Promise.all([
        api.tasks(),
        api.models(),
        api.rubrics(),
      ]);
      const candidates = models.filter((m) => m.kind === "candidate" && m.enabled);
      // The active judge is an explicit, DB-enforced flag (at most one model holds it) —
      // never an accident of row order. Fall back to any enabled judge, then Gemini.
      const judge =
        models.find((m) => m.isActiveJudge && m.enabled) ??
        models.find((m) => m.enabled && m.kind === "judge") ??
        models.find((m) => m.enabled && m.apiName.startsWith("gemini"));
      const rubric = rubrics[0];
      if (candidates.length === 0 || !judge || !rubric || tasks.length === 0) {
        throw new Error("Need ≥1 enabled candidate model, an enabled judge, a rubric, and ≥1 task.");
      }
      const { evalRun } = await api.createRun({
        name,
        rubricId: rubric.id,
        judgeModelId: judge.id,
        taskIds: tasks.map((t) => t.id),
        modelIds: candidates.map((m) => m.id),
      });
      setNaming(false);
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
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-zinc-50">Eval Runs</h2>
          <p className="mt-2 text-sm text-zinc-500">
            Every task, sent to every candidate model, scored by the independent judge.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={load}
            disabled={creating}
            className="rounded-full border border-white/10 px-5 py-2 text-sm text-zinc-400 transition-colors hover:border-white/20 hover:text-zinc-100 disabled:opacity-40"
          >
            Refresh
          </button>
          <button
            onClick={toggleNaming}
            disabled={creating}
            className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-black transition hover:brightness-110 disabled:opacity-40"
          >
            {creating ? "Starting…" : "＋ New comparison run"}
          </button>
        </div>
      </div>

      {naming && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const name = nameDraft.trim();
            if (name) void newComparisonRun(name);
          }}
          className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-white/[0.06] bg-card px-5 py-4 shadow-lg shadow-black/20"
        >
          <label htmlFor="run-name" className="text-sm text-zinc-400">
            Run name
          </label>
          <input
            id="run-name"
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setNaming(false)}
            disabled={creating}
            className="min-w-64 flex-1 rounded-full border border-white/10 bg-transparent px-4 py-2 text-sm text-zinc-100 focus:border-accent/60 focus:outline-none disabled:opacity-40"
          />
          <button
            type="submit"
            disabled={creating || nameDraft.trim().length === 0}
            className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-black transition hover:brightness-110 disabled:opacity-40"
          >
            {creating ? "Starting…" : "Start run"}
          </button>
          <button
            type="button"
            onClick={() => setNaming(false)}
            disabled={creating}
            className="rounded-full border border-white/10 px-5 py-2 text-sm text-zinc-400 transition-colors hover:border-white/20 hover:text-zinc-100 disabled:opacity-40"
          >
            Cancel
          </button>
        </form>
      )}

      {error && <p className="mt-6 text-sm text-red-400">{error}</p>}
      {!runs && !error && <p className="mt-8 text-sm text-zinc-500">Loading…</p>}

      {runs && runs.length === 0 && (
        <div className="mt-8 rounded-2xl border border-dashed border-white/10 p-12 text-center text-sm text-zinc-500">
          No runs yet — start one with ＋ New comparison run.
        </div>
      )}

      {runs && runs.length > 0 && (
        <div className="mt-8 overflow-hidden rounded-2xl border border-white/[0.06] bg-card shadow-lg shadow-black/20">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/5 text-[11px] tracking-[0.14em] text-zinc-500 uppercase">
                <th className="px-6 py-3.5 font-medium">Name</th>
                <th className="px-6 py-3.5 font-medium">Status</th>
                <th className="px-6 py-3.5 font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {runs.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => setSelectedRunId(r.id)}
                  className="cursor-pointer transition-colors hover:bg-white/[0.03]"
                >
                  <td className="px-6 py-4 font-medium text-zinc-100">{r.name}</td>
                  <td className="px-6 py-4">
                    <StatusBadge label={r.status} meta={runStatus[r.status]} />
                  </td>
                  <td className="px-6 py-4 text-zinc-500 tabular-nums">
                    {new Date(r.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
