import { useState } from "react";
import { EvalRuns } from "./pages/EvalRuns";
import { Rubrics } from "./pages/Rubrics";
import { SpotCheck } from "./pages/SpotCheck";
import { Tasks } from "./pages/Tasks";

const pages = {
  "Eval Runs": <EvalRuns />,
  Tasks: <Tasks />,
  Rubrics: <Rubrics />,
  "Spot Check": <SpotCheck />,
} as const;

type PageName = keyof typeof pages;

export function App() {
  const [page, setPage] = useState<PageName>("Eval Runs");

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="mb-12 flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-lg font-semibold tracking-tight text-zinc-50">
            LLM Eval <span className="text-zinc-500">Platform</span>
          </h1>
          <nav className="flex gap-1 rounded-full border border-white/[0.06] bg-card p-1">
            {(Object.keys(pages) as PageName[]).map((name) => (
              <button
                key={name}
                onClick={() => setPage(name)}
                className={
                  name === page
                    ? "rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-black"
                    : "rounded-full px-4 py-1.5 text-sm text-zinc-400 transition-colors hover:text-zinc-100"
                }
              >
                {name}
              </button>
            ))}
          </nav>
        </header>
        {pages[page]}
      </div>
    </div>
  );
}
