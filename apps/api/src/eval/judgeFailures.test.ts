import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * These cover the audit trail rather than the scoring: which judge_calls row gets
 * written when an attempt fails, and with what reason. The provider-failure path is
 * the one that previously wrote nothing at all, leaving a timeout indistinguishable
 * from a rate limit once the process had exited.
 */

const complete = vi.fn();
vi.mock("../providers/registry", () => ({ getProvider: () => ({ complete }) }));

const inserted: Array<Record<string, unknown>> = [];
const updated: Array<Record<string, unknown>> = [];

const criteria = [{ id: "c-acc", name: "accuracy", description: null, scaleMin: 1, scaleMax: 5 }];

const response = {
  id: "resp-1",
  content: "answer",
  execution: {
    task: { prompt: "task" },
    evalRun: {
      judgeModel: { id: "judge-1", apiName: "claude", provider: { slug: "anthropic" } },
      rubric: { criteria },
    },
  },
};

/** Minimal stand-in for the drizzle calls judgeResponse makes. */
const db = {
  query: { responses: { findFirst: async () => response } },
  insert: (table: { name?: string }) => ({
    values: (v: Record<string, unknown>) => {
      const isJudgeCall = "failureReason" in v || "rawOutput" in v;
      if (isJudgeCall) inserted.push(v);
      return {
        returning: async () => [{ id: "call-1" }],
        onConflictDoNothing: async () => undefined,
        then: (r: (x: undefined) => unknown) => r(undefined),
      };
    },
  }),
  update: () => ({
    set: (v: Record<string, unknown>) => ({
      where: async () => {
        updated.push(v);
      },
    }),
  }),
} as never;

const { judgeResponse, JudgeError } = await import("./judge");

beforeEach(() => {
  inserted.length = 0;
  updated.length = 0;
  complete.mockReset();
});

describe("judge failure tracing", () => {
  it("records a timeout as its own row, with no output to store", async () => {
    complete.mockRejectedValue(new Error("Anthropic request timed out after 60000ms"));

    await expect(judgeResponse(db, "resp-1")).rejects.toBeInstanceOf(JudgeError);

    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      responseId: "resp-1",
      judgeModelId: "judge-1",
      rawOutput: null,
      failureReason: "timeout",
    });
    expect(String(inserted[0]!.failureDetail)).toMatch(/timed out/);
  });

  it("distinguishes a rate limit from a timeout", async () => {
    complete.mockRejectedValue(new Error("Anthropic 429: rate limit exceeded"));

    await expect(judgeResponse(db, "resp-1")).rejects.toBeInstanceOf(JudgeError);

    expect(inserted[0]).toMatchObject({ failureReason: "provider_error", rawOutput: null });
    expect(String(inserted[0]!.failureDetail)).toMatch(/429/);
  });

  it("keeps the raw output and stamps the reason when parsing fails", async () => {
    complete.mockResolvedValue({
      text: "not json at all",
      promptTokens: 10,
      completionTokens: 20,
      latencyMs: 30,
    });

    await expect(judgeResponse(db, "resp-1")).rejects.toBeInstanceOf(JudgeError);

    // Output is written before parsing, so the row exists and keeps what arrived …
    expect(inserted[0]).toMatchObject({ rawOutput: "not json at all", latencyMs: 30 });
    // … and is then marked with why it yielded nothing.
    expect(updated).toEqual([{ failureReason: "malformed_json", failureDetail: "not json at all" }]);
  });

  it("records a refusal distinctly from malformed output", async () => {
    complete.mockResolvedValue({
      text: "I cannot grade this response.",
      promptTokens: 1,
      completionTokens: 1,
      latencyMs: 1,
    });

    await expect(judgeResponse(db, "resp-1")).rejects.toBeInstanceOf(JudgeError);
    expect(updated[0]).toMatchObject({ failureReason: "refusal" });
  });

  it("leaves failure_reason null on a successful call", async () => {
    complete.mockResolvedValue({
      text: JSON.stringify({ scores: [{ criterion: "accuracy", score: 4, reasoning: "ok" }] }),
      promptTokens: 5,
      completionTokens: 6,
      latencyMs: 7,
    });

    const outcome = await judgeResponse(db, "resp-1");

    expect(outcome.scored).toBe(1);
    expect(inserted[0]).toMatchObject({ rawOutput: expect.stringContaining("accuracy") });
    expect(inserted[0]).not.toHaveProperty("failureReason");
    expect(updated).toEqual([]);
  });
});
