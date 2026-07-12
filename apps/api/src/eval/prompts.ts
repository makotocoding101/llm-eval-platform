export interface JudgeCriterion {
  name: string;
  description: string | null;
  scaleMin: number;
  scaleMax: number;
}

export interface JudgePromptInput {
  taskPrompt: string;
  candidateResponse: string;
  criteria: JudgeCriterion[];
}

/**
 * Build the judge prompt and its JSON schema from a rubric's criteria and the candidate
 * response. The schema constrains the judge to one {criterion, score, reasoning} per criterion,
 * so per-criterion scores parse reliably.
 *
 * The schema is standard JSON Schema (lowercase types, additionalProperties: false) — the
 * dialect Anthropic's output_config.format and OpenAI's response_format expect. The Gemini
 * adapter translates it to its own responseSchema dialect.
 */
export function buildJudgePrompt(input: JudgePromptInput): {
  system: string;
  prompt: string;
  jsonSchema: Record<string, unknown>;
} {
  const { taskPrompt, candidateResponse, criteria } = input;

  const system =
    "You are an impartial, third-party evaluation judge. You did not write the response you " +
    "are grading. Score the candidate response against each rubric criterion strictly and " +
    "independently, using the full scale where warranted. Judge only the response's merit for " +
    "each specific criterion — not its length or style beyond what the criterion asks. Return JSON only.";

  const criteriaBlock = criteria
    .map(
      (c, i) =>
        `${i + 1}. "${c.name}" (integer score ${c.scaleMin}-${c.scaleMax}): ${
          c.description ?? "no description"
        }`,
    )
    .join("\n");

  const prompt = [
    "Evaluate the following candidate response against the rubric.",
    "",
    "== TASK (the prompt the candidate was given) ==",
    taskPrompt,
    "",
    "== CANDIDATE RESPONSE ==",
    candidateResponse,
    "",
    "== RUBRIC CRITERIA ==",
    criteriaBlock,
    "",
    "Return a score for every criterion. Use the exact criterion name as given. Write the " +
      "one-sentence justification first, then the integer score within that criterion's stated range.",
  ].join("\n");

  // Bound the score in the schema itself so out-of-range numbers can't decode at all.
  // Anthropic's structured output rejects minimum/maximum on integers, so the range is
  // an enum of the allowed values. Criteria may differ in scale, so this is the loosest
  // envelope across them; parseJudgeOutput still enforces each criterion's exact range
  // (and clamps). Pathologically wide scales skip the enum and rely on the clamp alone.
  const scaleMin = Math.min(...criteria.map((c) => c.scaleMin));
  const scaleMax = Math.max(...criteria.map((c) => c.scaleMax));
  const span = scaleMax - scaleMin + 1;
  const scoreSchema: Record<string, unknown> =
    span >= 1 && span <= 20
      ? { type: "integer", enum: Array.from({ length: span }, (_, i) => scaleMin + i) }
      : { type: "integer" };

  const jsonSchema = {
    type: "object",
    properties: {
      scores: {
        type: "array",
        items: {
          type: "object",
          // reasoning precedes score deliberately: models fill properties in schema order,
          // so this forces the judge to write its justification before committing to a
          // number. Score-first produced snap verdicts contradicted by their own reasoning.
          properties: {
            criterion: { type: "string" },
            reasoning: { type: "string" },
            score: scoreSchema,
          },
          required: ["criterion", "reasoning", "score"],
          additionalProperties: false,
        },
      },
    },
    required: ["scores"],
    additionalProperties: false,
  };

  return { system, prompt, jsonSchema };
}
