import { describe, expect, it } from "vitest";
import { buildJudgePrompt } from "../eval/prompts";
import { toGeminiSchema } from "./gemini";

describe("toGeminiSchema", () => {
  it("uppercases types recursively and strips additionalProperties", () => {
    const standard = {
      type: "object",
      properties: {
        scores: {
          type: "array",
          items: {
            type: "object",
            properties: {
              criterion: { type: "string" },
              score: { type: "integer" },
            },
            required: ["criterion", "score"],
            additionalProperties: false,
          },
        },
      },
      required: ["scores"],
      additionalProperties: false,
    };

    expect(toGeminiSchema(standard)).toEqual({
      type: "OBJECT",
      properties: {
        scores: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              criterion: { type: "STRING" },
              score: { type: "INTEGER" },
            },
            required: ["criterion", "score"],
          },
        },
      },
      required: ["scores"],
    });
  });

  it("round-trips the actual judge schema from buildJudgePrompt", () => {
    const { jsonSchema } = buildJudgePrompt({
      taskPrompt: "t",
      candidateResponse: "r",
      criteria: [{ name: "accuracy", description: null, scaleMin: 1, scaleMax: 5 }],
    });

    // Standard dialect for Anthropic/OpenAI: lowercase + additionalProperties: false
    expect(jsonSchema.type).toBe("object");
    expect(jsonSchema.additionalProperties).toBe(false);

    // Gemini dialect: uppercase, no additionalProperties anywhere, and the integer
    // score enum becomes minimum/maximum (Gemini only allows string enums).
    const gemini = toGeminiSchema(jsonSchema);
    expect(gemini.type).toBe("OBJECT");
    expect(JSON.stringify(gemini)).not.toContain("additionalProperties");

    type Node = Record<string, unknown>;
    const scores = (gemini.properties as Record<string, Node>).scores as Node;
    const itemProps = (scores.items as Node).properties as Record<string, Node>;

    expect(itemProps.score).toEqual({ type: "INTEGER", minimum: 1, maximum: 5 });

    // The criterion enum is strings, which Gemini accepts, so it survives untouched —
    // that is what keeps the judge from restyling a rubric name in the first place.
    expect(itemProps.criterion).toEqual({ type: "STRING", enum: ["accuracy"] });
  });
});
