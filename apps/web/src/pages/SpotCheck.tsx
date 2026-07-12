const flags: Array<[string, string]> = [
  ["--n 10", "sample size (default 10)"],
  ["--judge <apiName>", "only scores from one judge model"],
  ["--run <evalRunId>", "restrict to a single eval run"],
  ["--report", "reprint the agreement report from saved checks"],
];

// The spot-check tool is deliberately a CLI: blind scoring works best in a
// terminal flow. This page just points at it until agreement gets a dashboard.
export function SpotCheck() {
  return (
    <div>
      <h2 className="text-3xl font-bold tracking-tight text-zinc-50">Spot Check</h2>
      <p className="mt-2 max-w-2xl text-sm text-zinc-500">
        Manual validation of the AI judge: blind-score a sample of judged responses, then see
        where you and the judge agree.
      </p>

      <div className="mt-8 max-w-2xl rounded-2xl border border-white/[0.06] bg-card p-6 shadow-lg shadow-black/20">
        <div className="text-[11px] font-medium tracking-[0.14em] text-zinc-500 uppercase">
          Runs in the terminal
        </div>
        <p className="mt-3 text-sm leading-relaxed text-zinc-400">
          The tool samples random scored responses, shows the task and the candidate&apos;s
          answer, and asks for your score on each criterion — before revealing the judge&apos;s.
          It ends with an agreement report: exact-match rate, within-1 rate, and whether the
          judge runs lenient or strict.
        </p>

        <div className="mt-5 rounded-xl border border-white/5 bg-inset px-4 py-3 font-mono text-[13px] text-zinc-300">
          pnpm --filter @llm-eval/api spotcheck -- --n 10
        </div>

        <div className="mt-5 space-y-2">
          {flags.map(([flag, desc]) => (
            <div key={flag} className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 text-xs">
              <code className="font-mono text-zinc-300">{flag}</code>
              <span className="text-zinc-500">{desc}</span>
            </div>
          ))}
        </div>

        <p className="mt-5 text-xs leading-relaxed text-zinc-600">
          Your scores persist to the spot_checks table as you go, so a session can be stopped
          and resumed at any time.
        </p>
      </div>
    </div>
  );
}
