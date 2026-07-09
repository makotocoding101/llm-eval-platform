import { describe, expect, it } from "vitest";
import { computeAgreement, type AgreementEntry } from "./agreement";

function entry(partial: Partial<AgreementEntry> & { judgeScore: number; humanScore: number }): AgreementEntry {
  return { criterion: "accuracy", judgeModel: "claude-opus-4-8", ...partial };
}

describe("computeAgreement", () => {
  it("returns a null overall and empty groups for no entries", () => {
    const report = computeAgreement([]);
    expect(report.overall).toBeNull();
    expect(report.byCriterion).toEqual({});
    expect(report.byJudgeModel).toEqual({});
  });

  it("reports perfect agreement for a single matching entry", () => {
    const report = computeAgreement([entry({ judgeScore: 4, humanScore: 4 })]);
    expect(report.overall).toEqual({
      n: 1,
      exactRate: 1,
      within1Rate: 1,
      meanAbsDiff: 0,
      meanSignedDiff: 0,
    });
  });

  it("counts a 1-point gap as within-1 but not exact, and a 2-point gap as neither", () => {
    const report = computeAgreement([
      entry({ judgeScore: 4, humanScore: 3 }), // off by exactly 1
      entry({ judgeScore: 5, humanScore: 3 }), // off by 2
    ]);
    expect(report.overall!.exactRate).toBe(0);
    expect(report.overall!.within1Rate).toBe(0.5);
    expect(report.overall!.meanAbsDiff).toBe(1.5);
  });

  it("signs the bias as judge minus human (positive = judge more lenient)", () => {
    const lenientJudge = computeAgreement([entry({ judgeScore: 5, humanScore: 3 })]);
    expect(lenientJudge.overall!.meanSignedDiff).toBe(2);

    const strictJudge = computeAgreement([entry({ judgeScore: 2, humanScore: 4 })]);
    expect(strictJudge.overall!.meanSignedDiff).toBe(-2);
  });

  it("groups per criterion independently of the overall rate", () => {
    const report = computeAgreement([
      entry({ criterion: "accuracy", judgeScore: 5, humanScore: 5 }),
      entry({ criterion: "accuracy", judgeScore: 5, humanScore: 5 }),
      entry({ criterion: "coherence", judgeScore: 5, humanScore: 2 }),
    ]);
    expect(report.byCriterion["accuracy"]).toMatchObject({ n: 2, exactRate: 1, meanAbsDiff: 0 });
    expect(report.byCriterion["coherence"]).toMatchObject({ n: 1, exactRate: 0, meanAbsDiff: 3 });
    expect(report.overall!.exactRate).toBeCloseTo(2 / 3);
  });

  it("breaks down by judge model, exposing a strictness gap on the same human baseline", () => {
    // Mirrors the observed case: identical output judged 2 by Opus and 4 by Haiku,
    // with the human agreeing with Opus.
    const report = computeAgreement([
      entry({ judgeModel: "claude-opus-4-8", judgeScore: 2, humanScore: 2 }),
      entry({ judgeModel: "claude-haiku-4-5-20251001", judgeScore: 4, humanScore: 2 }),
    ]);
    expect(report.byJudgeModel["claude-opus-4-8"]).toMatchObject({
      n: 1,
      exactRate: 1,
      meanSignedDiff: 0,
    });
    expect(report.byJudgeModel["claude-haiku-4-5-20251001"]).toMatchObject({
      n: 1,
      exactRate: 0,
      within1Rate: 0,
      meanSignedDiff: 2,
    });
  });

  it("treats fractional scores tolerantly (float-safe exact and within-1 boundaries)", () => {
    const report = computeAgreement([
      entry({ judgeScore: 2.33, humanScore: 2.33 }), // exact despite float representation
      entry({ judgeScore: 3.5, humanScore: 2.5 }), // exactly 1 apart -> within-1
    ]);
    expect(report.overall!.exactRate).toBe(0.5);
    expect(report.overall!.within1Rate).toBe(1);
  });
});
