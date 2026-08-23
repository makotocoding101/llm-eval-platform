import { useEffect, useState } from "react";
import { api, type Rubric } from "../api/client";
import { Loading } from "../components/Loading";

// Read-only for now: rubrics are seeded via the API; an editing UI can come later.
export function Rubrics() {
  const [rubrics, setRubrics] = useState<Rubric[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.rubrics().then(setRubrics, (e) => setError(String(e)));
  }, []);

  return (
    <div>
      <h2 className="text-3xl font-bold tracking-tight text-zinc-50">Rubrics</h2>
      <p className="mt-2 text-sm text-zinc-500">
        Weighted criteria the judge scores each response against
      </p>

      {error && <p className="mt-6 text-sm text-red-400">{error}</p>}
      {!rubrics && !error && <Loading />}

      {rubrics && rubrics.length === 0 && (
        <div className="mt-8 rounded-2xl border border-dashed border-white/10 p-12 text-center text-sm text-zinc-500">
          No rubrics yet — seed one via the API.
        </div>
      )}

      <div className="mt-8 space-y-6">
        {rubrics?.map((r) => (
          <div
            key={r.id}
            className="max-w-3xl rounded-2xl border border-white/[0.06] bg-card p-6 shadow-lg shadow-black/20"
          >
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-lg font-semibold text-zinc-100">{r.name}</h3>
              <span className="text-xs text-zinc-500">{r.criteria.length} criteria</span>
            </div>

            <div className="mt-4 divide-y divide-white/5">
              {r.criteria.map((c) => (
                <div
                  key={c.id}
                  className="flex items-baseline justify-between gap-6 py-3 first:pt-0 last:pb-0"
                >
                  <div>
                    <div className="text-sm font-medium text-zinc-200">{c.name}</div>
                    {c.description && (
                      <p className="mt-1 text-xs leading-relaxed text-zinc-500">{c.description}</p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-sm font-semibold text-zinc-100 tabular-nums">
                      w{Number(c.weight)}
                    </div>
                    <div className="text-xs text-zinc-600 tabular-nums">
                      scale {c.scaleMin}–{c.scaleMax}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
