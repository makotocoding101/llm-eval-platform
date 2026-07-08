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
    <div style={{ fontFamily: "system-ui, sans-serif", padding: 24 }}>
      <h1>LLM Eval Platform</h1>
      <nav style={{ display: "flex", gap: 12, marginBottom: 24 }}>
        {(Object.keys(pages) as PageName[]).map((name) => (
          <button key={name} onClick={() => setPage(name)} disabled={name === page}>
            {name}
          </button>
        ))}
      </nav>
      {pages[page]}
    </div>
  );
}
