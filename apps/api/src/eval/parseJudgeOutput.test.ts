import { describe, expect, it } from "vitest";
import { parseJudgeOutput, type ParseCriterion } from "./parseJudgeOutput";

const criteria: ParseCriterion[] = [
  { id: "c-acc", name: "accuracy", scaleMin: 1, scaleMax: 5 },
  { id: "c-help", name: "helpfulness", scaleMin: 1, scaleMax: 5 },
  { id: "c-coh", name: "coherence", scaleMin: 1, scaleMax: 5 },
];

function judgeJson(scores: unknown): string {
  return JSON.stringify({ scores });
}

describe("parseJudgeOutput — happy path", () => {
  it("parses one validated row per criterion with reasoning", () => {
    const out = parseJudgeOutput(
      judgeJson([
        { criterion: "accuracy", score: 5, reasoning: "Fully correct." },
        { criterion: "helpfulness", score: 4, reasoning: "Addresses the need." },
        { criterion: "coherence", score: 3, reasoning: "A bit rambling." },
      ]),
      criteria,
    );

    expect(out.fatal).toBeNull();
    expect(out.issues).toEqual([]);
    expect(out.rows).toEqual([
      { criterionId: "c-acc", criterionName: "accuracy", score: 5, reasoning: "Fully correct." },
      { criterionId: "c-help", criterionName: "helpfulness", score: 4, reasoning: "Addresses the need." },
      { criterionId: "c-coh", criterionName: "coherence", score: 3, reasoning: "A bit rambling." },
    ]);
  });

  it("matches criterion names case-insensitively and rounds fractional scores", () => {
    const out = parseJudgeOutput(
      judgeJson([
        { criterion: "Accuracy", score: 4.4, reasoning: "ok" },
        { criterion: "HELPFULNESS", score: 3.6, reasoning: "ok" },
        { criterion: "coherence", score: 2, reasoning: "ok" },
      ]),
      criteria,
    );

    expect(out.fatal).toBeNull();
    expect(out.rows.map((r) => [r.criterionId, r.score])).toEqual([
      ["c-acc", 4],
      ["c-help", 4],
      ["c-coh", 2],
    ]);
  });

  it("keeps the first entry when the judge scores the same criterion twice", () => {
    const out = parseJudgeOutput(
      judgeJson([
        { criterion: "accuracy", score: 5, reasoning: "first" },
        { criterion: "accuracy", score: 1, reasoning: "second" },
        { criterion: "helpfulness", score: 3, reasoning: "ok" },
        { criterion: "coherence", score: 3, reasoning: "ok" },
      ]),
      criteria,
    );

    expect(out.rows.find((r) => r.criterionId === "c-acc")?.score).toBe(5);
    expect(out.rows).toHaveLength(3);
  });
});

describe("parseJudgeOutput — malformed output", () => {
  it("flags non-JSON output as malformed_json with a detail snippet", () => {
    const out = parseJudgeOutput("Sure! Here are the scores:\naccuracy: 5/5", criteria);
    expect(out.fatal).toBe("malformed_json");
    expect(out.fatalDetail).toContain("Sure!");
    expect(out.rows).toEqual([]);
  });

  it("flags prose refusals as refusal, not malformed_json", () => {
    const out = parseJudgeOutput(
      "I cannot evaluate this response as it contains content I'm unable to assess.",
      criteria,
    );
    expect(out.fatal).toBe("refusal");
    expect(out.rows).toEqual([]);
  });

  it("flags valid JSON without a scores array as no_scores", () => {
    expect(parseJudgeOutput('{"result": "great"}', criteria).fatal).toBe("no_scores");
    expect(parseJudgeOutput('{"scores": []}', criteria).fatal).toBe("no_scores");
    expect(parseJudgeOutput('"just a string"', criteria).fatal).toBe("no_scores");
  });

  it("flags JSON whose entries are all unusable as no_scores, with per-entry issues", () => {
    const out = parseJudgeOutput(
      judgeJson([
        { criterion: "originality", score: 5 }, // not in rubric
        { criterion: "accuracy", score: "five" }, // not a number
      ]),
      criteria,
    );
    expect(out.fatal).toBe("no_scores");
    expect(out.rows).toEqual([]);
    expect(out.issues).toContainEqual({ kind: "unknown_criterion", name: "originality" });
    expect(out.issues).toContainEqual({ kind: "invalid_score", criterion: "accuracy", raw: "five" });
  });
});

describe("parseJudgeOutput — out-of-range scores", () => {
  it("clamps to the criterion scale and records the clamp as an issue", () => {
    const out = parseJudgeOutput(
      judgeJson([
        { criterion: "accuracy", score: 9, reasoning: "ok" },
        { criterion: "helpfulness", score: 0, reasoning: "ok" },
        { criterion: "coherence", score: -3, reasoning: "ok" },
      ]),
      criteria,
    );

    expect(out.fatal).toBeNull();
    expect(out.rows.map((r) => r.score)).toEqual([5, 1, 1]);
    expect(out.issues).toEqual([
      { kind: "out_of_range", criterion: "accuracy", raw: 9, clamped: 5 },
      { kind: "out_of_range", criterion: "helpfulness", raw: 0, clamped: 1 },
      { kind: "out_of_range", criterion: "coherence", raw: -3, clamped: 1 },
    ]);
  });

  it("rejects non-finite scores rather than clamping them", () => {
    const out = parseJudgeOutput(
      judgeJson([
        { criterion: "accuracy", score: Number.NaN, reasoning: "ok" },
        { criterion: "helpfulness", score: 4, reasoning: "ok" },
        { criterion: "coherence", score: 4, reasoning: "ok" },
      ]),
      criteria,
    );
    // NaN serializes to null in JSON, so it arrives as an invalid (non-number) score.
    expect(out.rows.map((r) => r.criterionId)).toEqual(["c-help", "c-coh"]);
    expect(out.issues).toContainEqual({ kind: "invalid_score", criterion: "accuracy", raw: null });
  });
});

describe("parseJudgeOutput — partial failure (some criteria, not others)", () => {
  it("stores valid criteria and reports the broken/missing ones", () => {
    const out = parseJudgeOutput(
      judgeJson([
        { criterion: "accuracy", score: 5, reasoning: "correct" },
        { criterion: "helpfullness", score: 4, reasoning: "typo'd name" }, // misspelled → unknown
        // coherence never scored at all
      ]),
      criteria,
    );

    expect(out.fatal).toBeNull();
    expect(out.rows).toEqual([
      { criterionId: "c-acc", criterionName: "accuracy", score: 5, reasoning: "correct" },
    ]);
    expect(out.issues).toContainEqual({ kind: "unknown_criterion", name: "helpfullness" });
    expect(out.issues).toContainEqual({ kind: "missing_criterion", criterion: "helpfulness" });
    expect(out.issues).toContainEqual({ kind: "missing_criterion", criterion: "coherence" });
  });

  it("mixed bag: valid + invalid-score + out-of-range in one payload", () => {
    const out = parseJudgeOutput(
      judgeJson([
        { criterion: "accuracy", score: 3, reasoning: "ok" },
        { criterion: "helpfulness", score: null, reasoning: "judge glitched" },
        { criterion: "coherence", score: 12, reasoning: "over-enthusiastic" },
      ]),
      criteria,
    );

    expect(out.fatal).toBeNull();
    expect(out.rows.map((r) => [r.criterionId, r.score])).toEqual([
      ["c-acc", 3],
      ["c-coh", 5], // clamped from 12
    ]);
    expect(out.issues).toContainEqual({ kind: "invalid_score", criterion: "helpfulness", raw: null });
    expect(out.issues).toContainEqual({ kind: "out_of_range", criterion: "coherence", raw: 12, clamped: 5 });
    expect(out.issues).toContainEqual({ kind: "missing_criterion", criterion: "helpfulness" });
  });

  it("empty reasoning is stored as null, not empty string", () => {
    const out = parseJudgeOutput(
      judgeJson([
        { criterion: "accuracy", score: 4, reasoning: "" },
        { criterion: "helpfulness", score: 4 },
        { criterion: "coherence", score: 4, reasoning: "fine" },
      ]),
      criteria,
    );
    expect(out.rows.map((r) => r.reasoning)).toEqual([null, null, "fine"]);
  });
});

describe("parseJudgeOutput — criterion name normalization", () => {
  // A multi-word criterion is the case that actually bit us in production: the judge
  // returned "instruction_compliance" for "instruction compliance" and the score was
  // dropped, quietly shrinking the weighted-quality denominator for that response.
  const multiWord: ParseCriterion[] = [
    { id: "c-acc", name: "accuracy", scaleMin: 1, scaleMax: 5 },
    { id: "c-ic", name: "instruction compliance", scaleMin: 1, scaleMax: 5 },
  ];

  it("matches a judge that returns the JSON-identifier form of the name", () => {
    const out = parseJudgeOutput(
      judgeJson([
        { criterion: "accuracy", score: 4, reasoning: "Mostly right." },
        { criterion: "instruction_compliance", score: 5, reasoning: "One sentence, as asked." },
      ]),
      multiWord,
    );

    expect(out.fatal).toBeNull();
    expect(out.issues).toEqual([]);
    expect(out.rows).toEqual([
      { criterionId: "c-acc", criterionName: "accuracy", score: 4, reasoning: "Mostly right." },
      {
        criterionId: "c-ic",
        // Stored under the rubric's own spelling, not the judge's.
        criterionName: "instruction compliance",
        score: 5,
        reasoning: "One sentence, as asked.",
      },
    ]);
  });

  it.each([
    ["instruction_compliance", "underscores"],
    ["instruction-compliance", "hyphens"],
    ["Instruction_Compliance", "mixed case with underscores"],
    ["  instruction   compliance  ", "padded and doubled whitespace"],
    ["INSTRUCTION COMPLIANCE", "upper case"],
  ])("accepts %s (%s)", (name) => {
    const out = parseJudgeOutput(judgeJson([{ criterion: name, score: 5, reasoning: "ok" }]), multiWord);

    expect(out.rows).toHaveLength(1);
    expect(out.rows[0]!.criterionId).toBe("c-ic");
    expect(out.issues).toEqual([{ kind: "missing_criterion", criterion: "accuracy" }]);
  });

  it("still reports a genuinely invented criterion as unknown", () => {
    const out = parseJudgeOutput(
      judgeJson([{ criterion: "conciseness", score: 5, reasoning: "Short." }]),
      multiWord,
    );

    expect(out.fatal).toBe("no_scores");
    expect(out.issues).toContainEqual({ kind: "unknown_criterion", name: "conciseness" });
  });

  it("prefers an exact match over a normalized one", () => {
    // A rubric that deliberately distinguishes the two spellings keeps its behavior.
    const both: ParseCriterion[] = [
      { id: "c-space", name: "instruction compliance", scaleMin: 1, scaleMax: 5 },
      { id: "c-under", name: "instruction_compliance", scaleMin: 1, scaleMax: 5 },
    ];
    const out = parseJudgeOutput(
      judgeJson([
        { criterion: "instruction_compliance", score: 2, reasoning: "under" },
        { criterion: "instruction compliance", score: 4, reasoning: "space" },
      ]),
      both,
    );

    expect(out.rows).toEqual([
      { criterionId: "c-under", criterionName: "instruction_compliance", score: 2, reasoning: "under" },
      { criterionId: "c-space", criterionName: "instruction compliance", score: 4, reasoning: "space" },
    ]);
  });

  it("treats an ambiguous normalization as unknown rather than guessing", () => {
    // Both rubric names fold to the same key, so a judge using a third spelling could
    // be credited to either — report it instead of picking one.
    const ambiguous: ParseCriterion[] = [
      { id: "c-a", name: "instruction compliance", scaleMin: 1, scaleMax: 5 },
      { id: "c-b", name: "instruction_compliance", scaleMin: 1, scaleMax: 5 },
    ];
    const out = parseJudgeOutput(
      judgeJson([{ criterion: "Instruction-Compliance", score: 5, reasoning: "third spelling" }]),
      ambiguous,
    );

    expect(out.fatal).toBe("no_scores");
    expect(out.issues).toContainEqual({ kind: "unknown_criterion", name: "Instruction-Compliance" });
  });
});
