import { useEffect, useState } from "react";
import { api, type AgreementReport, type AgreementStats } from "../api/client";

const flags: Array<[string, string]> = [
  ["--n 10", "sample size (default 10)"],
  ["--judge <apiName>", "only scores from one judge model"],
  ["--run <evalRunId>", "restrict to a single eval run"],
  ["--include-checked", "re-offer answers you already graded"],
  ["--report", "reprint the agreement report from saved checks"],
];

const pct = (rate: number) => `${Math.round(rate * 100)}%`;
const num = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2));
const signed = (v: number) => (v > 0 ? `+${num(v)}` : num(v));

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-card px-5 py-4 shadow-lg shadow-black/20">
      <div className="text-[11px] font-medium tracking-[0.14em] text-zinc-500 uppercase">{label}</div>
      <div className="mt-2 text-3xl font-semibold text-zinc-50">{value}</div>
      {hint && <div className="mt-1 text-xs text-zinc-600">{hint}</div>}
    </div>
  );
}

function AgreementTable({ title, rows }: { title: string; rows: Record<string, AgreementStats> }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-card shadow-lg shadow-black/20">
      <div className="border-b border-white/5 px-6 py-3.5 text-[11px] font-medium tracking-[0.14em] text-zinc-500 uppercase">
        {title}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/5 text-[11px] tracking-[0.14em] text-zinc-500 uppercase">
              <th className="px-6 py-3 font-medium">&nbsp;</th>
              <th className="px-4 py-3 text-right font-medium">n</th>
              <th className="px-4 py-3 text-right font-medium">Exact</th>
              <th className="px-4 py-3 text-right font-medium">Within 1</th>
              <th className="px-4 py-3 text-right font-medium">Mean |diff|</th>
              <th className="px-6 py-3 text-right font-medium">Bias</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {Object.entries(rows).map(([name, s]) => (
              <tr key={name}>
                <td className="px-6 py-3.5 font-medium text-zinc-100">{name}</td>
                <td className="px-4 py-3.5 text-right text-zinc-400 tabular-nums">{s.n}</td>
                <td className="px-4 py-3.5 text-right text-zinc-100 tabular-nums">{pct(s.exactRate)}</td>
                <td className="px-4 py-3.5 text-right text-zinc-100 tabular-nums">{pct(s.within1Rate)}</td>
                <td className="px-4 py-3.5 text-right text-zinc-400 tabular-nums">{num(s.meanAbsDiff)}</td>
                <td className="px-6 py-3.5 text-right text-zinc-400 tabular-nums">{signed(s.meanSignedDiff)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CliCard({ prominent }: { prominent: boolean }) {
  return (
    <div className="max-w-2xl rounded-2xl border border-white/[0.06] bg-card p-6 shadow-lg shadow-black/20">
      <div className="text-[11px] font-medium tracking-[0.14em] text-zinc-500 uppercase">
        {prominent ? "Runs in the terminal" : "Add checks from the terminal"}
      </div>
      <p className="mt-3 text-sm leading-relaxed text-zinc-400">
        The tool samples random scored responses, shows the task and the candidate&apos;s answer,
        and asks for your score on each criterion — before revealing the judge&apos;s. Blind
        scoring is deliberately a terminal flow: you commit your number first.
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
        Your scores persist to the spot_checks table as you go, so a session can be stopped and
        resumed at any time. This page updates as checks accumulate.
      </p>
    </div>
  );
}

export function SpotCheck() {
  const [report, setReport] = useState<AgreementReport | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  async function load(run?: string) {
    setError(null);
    try {
      const r = await api.spotCheckAgreement(run);
      setReport(r);
      setSelected(r.selectedRunId ?? "all");
    } catch (e) {
      setError(String(e));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const overall = report?.overall ?? null;
  const judges = report ? Object.keys(report.byJudgeModel) : [];
  const totalChecks = report ? report.runs.reduce((sum, r) => sum + r.checks, 0) : 0;
  // Anything beyond the newest checked run includes checks recorded against the
  // pre-fix judge, which drags agreement below what the current judge earns.
  const includesPreFix =
    report !== null && report.runs.length > 0 && selected !== report.runs[0]!.id;

  return (
    <div>
      <h2 className="text-3xl font-bold tracking-tight text-zinc-50">Spot Check</h2>
      <p className="mt-2 max-w-2xl text-sm text-zinc-500">
        Manual validation of the AI judge: blind-score a sample of judged responses, then see
        where you and the judge agree.
      </p>

      {error && <p className="mt-6 text-sm text-red-400">{error}</p>}
      {!report && !error && <p className="mt-8 text-sm text-zinc-500">Loading…</p>}

      {report && !overall && (
        <div className="mt-8 space-y-8">
          <div className="rounded-2xl border border-dashed border-white/10 p-12 text-center text-sm text-zinc-500">
            No spot checks stored yet — run your first blind session below.
          </div>
          <CliCard prominent />
        </div>
      )}

      {report && overall && (
        <div className="mt-8 space-y-8">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <label htmlFor="run-filter" className="text-sm text-zinc-400">
                Run
              </label>
              <select
                id="run-filter"
                value={selected}
                onChange={(e) => void load(e.target.value)}
                className="rounded-full border border-white/10 bg-card px-4 py-2 text-sm text-zinc-200 focus:border-accent/60 focus:outline-none"
              >
                {report.runs.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.checks})
                  </option>
                ))}
                <option value="all">All checks ({totalChecks})</option>
              </select>
            </div>
            {includesPreFix && (
              <p className="mt-3 max-w-3xl text-xs leading-relaxed text-zinc-500">
                Includes checks recorded against the pre-fix judge, which scored with zero
                thinking tokens and committed its score before writing any reasoning (see the
                README&apos;s Debugging section) — so agreement here reads lower than the
                current judge&apos;s. The default view is the latest run for a clean read.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatTile label="Exact agreement" value={pct(overall.exactRate)} hint="human == judge" />
            <StatTile label="Within 1 point" value={pct(overall.within1Rate)} hint="|judge − human| ≤ 1" />
            <StatTile
              label="Judge bias"
              value={signed(overall.meanSignedDiff)}
              hint="judge − human · positive = judge more lenient"
            />
            <StatTile
              label="Blind checks"
              value={String(overall.n)}
              hint={
                report.lastCheckedAt
                  ? `last: ${new Date(report.lastCheckedAt).toLocaleDateString()}`
                  : undefined
              }
            />
          </div>

          <AgreementTable title="Per criterion" rows={report.byCriterion} />
          <AgreementTable
            title={judges.length > 1 ? "Per judge model" : "Judge model"}
            rows={report.byJudgeModel}
          />

          <CliCard prominent={false} />
        </div>
      )}
    </div>
  );
}
