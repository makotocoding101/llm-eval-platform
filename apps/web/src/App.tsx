import { useState } from "react";
import { EvalRuns } from "./pages/EvalRuns";
import { Home } from "./pages/Home";
import { Rubrics } from "./pages/Rubrics";
import { SpotCheck } from "./pages/SpotCheck";
import { Tasks } from "./pages/Tasks";

const pageNames = ["Home", "Eval Runs", "Tasks", "Rubrics", "Spot Check"] as const;
type PageName = (typeof pageNames)[number];

export function App() {
  const [page, setPage] = useState<PageName>("Home");

  const pages: Record<PageName, React.ReactNode> = {
    Home: <Home onViewDashboard={() => setPage("Eval Runs")} />,
    "Eval Runs": <EvalRuns />,
    Tasks: <Tasks />,
    Rubrics: <Rubrics />,
    "Spot Check": <SpotCheck />,
  };

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="mb-12 flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-lg font-semibold tracking-tight text-zinc-500">
            LLM Eval Platform
          </h1>
          <nav className="flex gap-1 rounded-full border border-white/[0.06] bg-card p-1">
            {pageNames.map((name) => (
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
