import { useEffect, useState } from "react";
import { api, type Task } from "../api/client";
import { Loading } from "../components/Loading";

// Read-only for now: tasks are seeded via the API; an editing UI can come later.
export function Tasks() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.tasks().then(setTasks, (e) => setError(String(e)));
  }, []);

  return (
    <div>
      <h2 className="text-3xl font-bold tracking-tight text-zinc-50">Tasks</h2>
      <p className="mt-2 text-sm text-zinc-500">
        The prompts every candidate model answers{tasks ? ` · ${tasks.length}` : ""}
      </p>

      {error && <p className="mt-6 text-sm text-red-400">{error}</p>}
      {!tasks && !error && <Loading />}

      {tasks && tasks.length === 0 && (
        <div className="mt-8 rounded-2xl border border-dashed border-white/10 p-12 text-center text-sm text-zinc-500">
          No tasks yet — seed some via the API.
        </div>
      )}

      <div className="mt-8 space-y-4">
        {tasks?.map((t) => (
          <div
            key={t.id}
            className="rounded-2xl border border-white/[0.06] bg-card p-6 shadow-lg shadow-black/20"
          >
            <div className="text-[11px] font-medium tracking-[0.14em] text-zinc-500 uppercase">
              {t.slug}
            </div>
            <p className="mt-2 max-w-3xl text-[15px] leading-relaxed whitespace-pre-wrap text-zinc-300">
              {t.prompt}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
