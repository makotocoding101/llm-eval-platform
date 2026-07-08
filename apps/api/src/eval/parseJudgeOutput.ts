/**
 * Pure parsing + validation of raw judge output against a rubric.
 *
 * Every way a judge call can go sideways is represented explicitly here so the
 * caller (judge.ts) and tests can reason about each mode by name instead of
 * relying on silent drops or generic exceptions.
 */

export interface ParseCriterion {
  id: string;
  name: string;
  scaleMin: number;
  scaleMax: number;
}

/** Fatal: nothing in the output is usable. The response gets no scores. */
export type JudgeFatal =
  | "malformed_json" // output is not parseable JSON
  | "refusal" // output is prose that looks like the judge declining to grade
  | "no_scores"; // valid JSON, but no scores array / empty array / nothing matched

/** Non-fatal: a single criterion went wrong; the rest still count. */
export type JudgeIssue =
  | { kind: "unknown_criterion"; name: string } // judge invented a criterion name
  | { kind: "invalid_score"; criterion: string; raw: unknown } // score not a finite number
  | { kind: "out_of_range"; criterion: string; raw: number; clamped: number }
  | { kind: "missing_criterion"; criterion: string }; // judge never scored it

export interface ParsedScoreRow {
  criterionId: string;
  criterionName: string;
  score: number; // integer, guaranteed within [scaleMin, scaleMax]
  reasoning: string | null;
}

export interface ParsedJudgeOutput {
  /** Set when the output as a whole is unusable; `rows` will be empty. */
  fatal: JudgeFatal | null;
  /** Short human-readable detail for logs / error messages. */
  fatalDetail: string | null;
  /** Validated rows ready to insert — possibly a subset of the rubric (partial success). */
  rows: ParsedScoreRow[];
  /** Per-criterion problems that did not sink the whole response. */
  issues: JudgeIssue[];
}

interface RawJudgeScore {
  criterion?: unknown;
  score?: unknown;
  reasoning?: unknown;
}

const REFUSAL_PATTERN =
  /\b(i can(?:no|')t|i cannot|i'm unable|i am unable|i won't|i will not|as an ai|i must decline|refuse)\b/i;

export function parseJudgeOutput(text: string, criteria: ParseCriterion[]): ParsedJudgeOutput {
  const snippet = text.slice(0, 160);

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Not JSON at all. Distinguish a refusal (judge answered in prose declining the
    // task) from garbage, since the fix differs: refusals need a prompt/model change,
    // garbage usually means a transport or schema problem.
    const fatal: JudgeFatal = REFUSAL_PATTERN.test(text) ? "refusal" : "malformed_json";
    return { fatal, fatalDetail: snippet, rows: [], issues: [] };
  }

  const rawScores =
    typeof parsed === "object" && parsed !== null && Array.isArray((parsed as { scores?: unknown }).scores)
      ? ((parsed as { scores: RawJudgeScore[] }).scores)
      : null;
  if (!rawScores || rawScores.length === 0) {
    return { fatal: "no_scores", fatalDetail: snippet, rows: [], issues: [] };
  }

  const byName = new Map(criteria.map((c) => [c.name.toLowerCase(), c]));
  const rows: ParsedScoreRow[] = [];
  const issues: JudgeIssue[] = [];
  const seen = new Set<string>(); // criterion ids already scored (first occurrence wins)

  for (const raw of rawScores) {
    const name = typeof raw.criterion === "string" ? raw.criterion : "";
    const criterion = byName.get(name.toLowerCase());
    if (!criterion) {
      issues.push({ kind: "unknown_criterion", name: name || String(raw.criterion) });
      continue;
    }
    if (seen.has(criterion.id)) continue; // duplicate entry for the same criterion

    if (typeof raw.score !== "number" || !Number.isFinite(raw.score)) {
      issues.push({ kind: "invalid_score", criterion: criterion.name, raw: raw.score });
      continue;
    }

    const rounded = Math.round(raw.score);
    const clamped = Math.min(criterion.scaleMax, Math.max(criterion.scaleMin, rounded));
    if (clamped !== rounded) {
      issues.push({ kind: "out_of_range", criterion: criterion.name, raw: raw.score, clamped });
    }

    seen.add(criterion.id);
    rows.push({
      criterionId: criterion.id,
      criterionName: criterion.name,
      score: clamped,
      reasoning: typeof raw.reasoning === "string" && raw.reasoning.length > 0 ? raw.reasoning : null,
    });
  }

  // Anything in the rubric the judge never (validly) scored is reported, not ignored.
  for (const c of criteria) {
    if (!seen.has(c.id)) issues.push({ kind: "missing_criterion", criterion: c.name });
  }

  // JSON was well-formed but not one usable score came out of it.
  if (rows.length === 0) {
    return { fatal: "no_scores", fatalDetail: snippet, rows: [], issues };
  }

  return { fatal: null, fatalDetail: null, rows, issues };
}
