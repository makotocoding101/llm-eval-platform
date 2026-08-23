import type { Criterion, Execution } from "../api/client";

/**
 * How much of the rubric a response was actually judged on.
 *
 * `response_quality` divides by the weight of the criteria that were scored, not the
 * weight of the whole rubric, so a partially-judged response yields a weighted mean of
 * a *subset* — a number on a different denominator that looks exactly like a complete
 * one. Every place the dashboard shows or compares a score has to know which it has.
 */
export type QualityState =
  /** No scores at all: the judge call never produced anything for this response. */
  | { kind: "not_judged"; expected: number; missing: Criterion[] }
  /** Some criteria scored, others not — the weighted score is not comparable. */
  | { kind: "partial"; scored: number; expected: number; missing: Criterion[] }
  /** Every rubric criterion scored. */
  | { kind: "complete"; scored: number; expected: number; missing: never[] };

/** Rubric criteria with no score on this response, in rubric order. */
function missingCriteria(ex: Execution, rubric: Criterion[]): Criterion[] {
  const scored = new Set(ex.response?.scores.map((s) => s.criterion.id) ?? []);
  return rubric.filter((c) => !scored.has(c.id));
}

export function qualityState(ex: Execution, rubric: Criterion[]): QualityState {
  const scored = ex.response?.scores.length ?? 0;
  const expected = rubric.length;
  const missing = missingCriteria(ex, rubric);

  if (scored === 0) return { kind: "not_judged", expected, missing };
  if (missing.length > 0) return { kind: "partial", scored, expected, missing };
  return { kind: "complete", scored, expected, missing: [] };
}

/** A weighted score may only be compared against another when the rubric was fully applied. */
export function isComparable(state: QualityState): boolean {
  return state.kind === "complete";
}

/**
 * The strict winner's execution id for a task group — none on ties, or when fewer than
 * two candidates were scored on the whole rubric.
 *
 * Partially-judged responses are excluded rather than ranked: their score is computed
 * over a smaller denominator, so declaring a winner against one compares two different
 * measurements and would mark a card as better on an artifact of the missing criterion.
 */
export function topExecutionId(execs: Execution[], rubric: Criterion[]): string | null {
  const scored = execs
    .filter((ex) => isComparable(qualityState(ex, rubric)))
    .map((ex) => ({ id: ex.id, score: Number(ex.response?.quality?.weightedScore) }))
    .filter((s) => Number.isFinite(s.score));

  if (scored.length < 2) return null;
  const max = Math.max(...scored.map((s) => s.score));
  const winners = scored.filter((s) => s.score === max);
  return winners.length === 1 ? winners[0]!.id : null;
}
