import { config } from "dotenv";

// Load root .env (cwd is packages/db when run via `pnpm --filter @llm-eval/db seed:hard`).
config({ path: "../../.env" });

import { createDb } from "./index";
import { tasks } from "./schema";

/**
 * Harder tasks designed to separate models — each targets a distinct failure mode.
 * The judge only sees `prompt`; `description` holds the expected answer for human
 * spot-checking (spot_checks table / dashboard review).
 */
const HARD_TASKS = [
  {
    slug: "bayes-base-rate",
    category: "reasoning",
    prompt:
      "A disease affects 1 in 1,000 people. A screening test detects the disease 99% of the " +
      "time when it is present, and has a 5% false-positive rate. A randomly screened person " +
      "tests positive. What is the probability they actually have the disease? Show your " +
      "reasoning, then give the final answer as a percentage rounded to one decimal place.",
    description:
      "Base-rate neglect probe. Correct: (0.99*0.001)/(0.99*0.001 + 0.05*0.999) ≈ 1.9%. " +
      "Common failure: answering ~99% or ~95% by ignoring the prior.",
  },
  {
    slug: "river-crossing-easy",
    category: "trap",
    prompt:
      "A farmer needs to cross a river with a wolf, a goat, and a cabbage. His boat is large " +
      "enough to carry him and all of his items at the same time. What is the minimum number " +
      "of river crossings needed to get everything across? Explain briefly.",
    description:
      "Overfitting trap: the classic puzzle's boat-capacity constraint is removed. " +
      "Correct: 1 crossing. Common failure: regurgitating the memorized 7-crossing solution.",
  },
  {
    slug: "false-premise-nobel",
    category: "factuality",
    prompt:
      "In what year did Albert Einstein receive the Nobel Prize in Physics for his theory of " +
      "general relativity? Answer in one or two sentences.",
    description:
      "False-premise probe. The 1921 prize was for the photoelectric effect, not relativity. " +
      "A good answer corrects the premise; a bad one confidently answers 1921 (or 1915/1916) " +
      "without correction.",
  },
  {
    slug: "timezone-arithmetic",
    category: "multi-step",
    prompt:
      "A video call starts at 11:45 PM on Tuesday in New York and lasts exactly 150 minutes. " +
      "For a participant in Los Angeles, what is the local time and day of the week when the " +
      "call ends? Assume both cities are on standard time. Answer in one sentence.",
    description:
      "Two-step arithmetic across a day boundary and a timezone. Ends 2:15 AM Wednesday in " +
      "New York = 11:15 PM Tuesday in Los Angeles. Common failures: wrong day, or applying " +
      "the -3h offset before the duration and dropping the day change.",
  },
  {
    slug: "code-bug-hunt",
    category: "code",
    prompt:
      "This JavaScript function is intended to return the sum of all integers from a to b " +
      "inclusive (assume a <= b):\n\n" +
      "function sumBetween(a, b) {\n" +
      "  let total = 0;\n" +
      "  for (let i = a; i < b; i++) {\n" +
      "    total += i;\n" +
      "  }\n" +
      "  return total;\n" +
      "}\n\n" +
      "Identify the bug in one sentence, then provide the corrected function.",
    description:
      "Off-by-one: `i < b` excludes b; fix is `i <= b`. Judge for both the correct " +
      "identification and a working corrected version.",
  },
  {
    slug: "reverse-alpha-numbers",
    category: "instruction-following",
    prompt:
      "Write the numbers one through five as English words, sorted in reverse alphabetical " +
      "order, as a comma-separated list on a single line: all lowercase, no spaces after the " +
      "commas, and no trailing punctuation. Output only the list.",
    description:
      "Multi-constraint compliance probe. Expected exact output: two,three,one,four,five " +
      "(alphabetical is five,four,one,three,two). Score against every constraint: order, " +
      "case, spacing, trailing punctuation, no extra text.",
  },
];

async function main() {
  const db = createDb();
  const inserted = await db
    .insert(tasks)
    .values(HARD_TASKS)
    .onConflictDoNothing({ target: tasks.slug })
    .returning({ slug: tasks.slug });

  const insertedSlugs = new Set(inserted.map((t) => t.slug));
  for (const t of HARD_TASKS) {
    console.log(`${insertedSlugs.has(t.slug) ? "added " : "exists"}  ${t.slug}  [${t.category}]`);
  }
  console.log(`Done: ${inserted.length} added, ${HARD_TASKS.length - inserted.length} already present.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
