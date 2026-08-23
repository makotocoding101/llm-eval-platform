import { describe, expect, it } from "vitest";
import type { Criterion, Execution, Score } from "../api/client";
import { isComparable, qualityState, topExecutionId } from "./quality";

const rubric: Criterion[] = [
  { id: "c-acc", name: "accuracy", description: null, weight: "2", scaleMin: 1, scaleMax: 5 },
  { id: "c-help", name: "helpfulness", description: null, weight: "1", scaleMin: 1, scaleMax: 5 },
  { id: "c-coh", name: "coherence", description: null, weight: "1", scaleMin: 1, scaleMax: 5 },
  {
    id: "c-ic",
    name: "instruction compliance",
    description: null,
    weight: "2",
    scaleMin: 1,
    scaleMax: 5,
  },
];

function score(criterion: Criterion, value: number): Score {
  return { id: `s-${criterion.id}`, score: String(value), reasoning: null, criterion };
}

/** An execution whose response carries scores for `scored` and the given weighted value. */
function execution(id: string, scored: Criterion[], weightedScore: string | null): Execution {
  return {
    id,
    status: "success",
    errorMessage: null,
    model: {
      id: "m1",
      providerId: "p1",
      apiName: "x",
      displayName: "X",
      kind: "candidate",
      enabled: true,
      isActiveJudge: false,
    },
    task: { id: "t1", slug: "timezone-arithmetic", prompt: "…" },
    response: {
      id: `r-${id}`,
      content: "…",
      promptTokens: 1,
      completionTokens: 1,
      latencyMs: 1,
      scores: scored.map((c) => score(c, 3)),
      quality: {
        responseId: `r-${id}`,
        weightedScore,
        criteriaScored: scored.length,
      },
    },
  };
}

/** No response at all — the judge never had anything to score. */
function unjudged(id: string): Execution {
  return { ...execution(id, [], null), response: { ...execution(id, [], null).response!, quality: null } };
}

describe("qualityState", () => {
  it("reports a fully scored response as complete", () => {
    const state = qualityState(execution("e1", rubric, "3.00"), rubric);
    expect(state).toEqual({ kind: "complete", scored: 4, expected: 4, missing: [] });
    expect(isComparable(state)).toBe(true);
  });

  it("reports a response with no scores as not judged, listing the whole rubric", () => {
    const state = qualityState(unjudged("e2"), rubric);
    expect(state.kind).toBe("not_judged");
    expect(state.expected).toBe(4);
    expect(state.missing).toHaveLength(4);
    expect(isComparable(state)).toBe(false);
  });

  it("names the criteria a partially judged response is missing", () => {
    // The production case: the judge scored 3 of 4, instruction compliance dropped.
    const ex = execution("e3", [rubric[0]!, rubric[1]!, rubric[2]!], "2.00");
    const state = qualityState(ex, rubric);

    expect(state.kind).toBe("partial");
    expect(state).toMatchObject({ scored: 3, expected: 4 });
    expect(state.missing.map((c) => c.name)).toEqual(["instruction compliance"]);
    expect(isComparable(state)).toBe(false);
  });

  it("keeps missing criteria in rubric order", () => {
    const state = qualityState(execution("e4", [rubric[1]!], "3.00"), rubric);
    expect(state.missing.map((c) => c.id)).toEqual(["c-acc", "c-coh", "c-ic"]);
  });
});

describe("topExecutionId", () => {
  it("picks the strict winner when both were scored on the whole rubric", () => {
    const a = execution("a", rubric, "4.00");
    const b = execution("b", rubric, "2.00");
    expect(topExecutionId([a, b], rubric)).toBe("a");
  });

  it("declares no winner on a tie", () => {
    const a = execution("a", rubric, "3.00");
    const b = execution("b", rubric, "3.00");
    expect(topExecutionId([a, b], rubric)).toBeNull();
  });

  it("never ranks a partially judged response against a complete one", () => {
    // The partial score is higher, but it averages a smaller denominator — ranking it
    // would award the win to an artifact of the criterion that went missing.
    const partial = execution("partial", [rubric[0]!, rubric[1]!, rubric[2]!], "5.00");
    const complete = execution("complete", rubric, "4.00");

    // Only one comparable candidate remains, so there is no comparison to make.
    expect(topExecutionId([partial, complete], rubric)).toBeNull();
  });

  it("compares the complete responses and ignores the partial one", () => {
    const partial = execution("partial", [rubric[0]!], "5.00");
    const high = execution("high", rubric, "4.00");
    const low = execution("low", rubric, "1.00");
    expect(topExecutionId([partial, high, low], rubric)).toBe("high");
  });

  it("declares no winner when a response was never judged", () => {
    expect(topExecutionId([unjudged("a"), execution("b", rubric, "4.00")], rubric)).toBeNull();
  });
});
