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
 * Note: the schema uses Gemini's responseSchema dialect (uppercase OpenAPI types). Gemini is
 * the only wired judge today; a Claude adapter will need to translate to standard JSON Schema.
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
    "Return a score for every criterion. Use the exact criterion name as given, an integer " +
      "score within that criterion's stated range, and a one-sentence justification.",
  ].join("\n");

  const jsonSchema = {
    type: "OBJECT",
    properties: {
      scores: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            criterion: { type: "STRING" },
            score: { type: "INTEGER" },
            reasoning: { type: "STRING" },
          },
          required: ["criterion", "score", "reasoning"],
        },
      },
    },
    required: ["scores"],
  };

  return { system, prompt, jsonSchema };
}
