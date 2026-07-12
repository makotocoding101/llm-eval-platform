import { config } from "dotenv";

// Load root .env (cwd is packages/db when run via `pnpm --filter @llm-eval/db seed`).
config({ path: "../../.env" });

import { createDb } from "./index";
import { models, providers, rubricCriteria, rubrics, tasks } from "./schema";

async function seed() {
  const db = createDb();

  // Idempotent: bail if anything is already seeded.
  const existing = await db.select().from(providers).limit(1);
  if (existing.length > 0) {
    console.log("Already seeded — nothing to do.");
    return;
  }

  // Providers — phased rollout: Gemini enabled first, OpenAI/Anthropic deferred on cost.
  const [google, openai, anthropic] = await db
    .insert(providers)
    .values([
      { slug: "google", displayName: "Google (Gemini)", enabled: true },
      { slug: "openai", displayName: "OpenAI", enabled: false },
      { slug: "anthropic", displayName: "Anthropic (judge)", enabled: false },
    ])
    .returning();

  // Models. Insert order is preserved in the returned rows.
  // api_names for candidates are illustrative — confirm the exact strings.
  // The active judge is chosen explicitly via models.is_active_judge (DB-enforced to at
  // most one row) — seeded judges start inactive; flip the flag to pick one.
  const [geminiModel, , judgeModel] = await db
    .insert(models)
    .values([
      {
        providerId: google!.id,
        apiName: "gemini-2.5-flash",
        displayName: "Gemini 2.5 Flash",
        kind: "candidate",
        enabled: true,
      },
      {
        providerId: openai!.id,
        apiName: "gpt-4o-mini",
        displayName: "GPT-4o mini",
        kind: "candidate",
        enabled: false,
      },
      {
        providerId: anthropic!.id,
        apiName: "claude-opus-4-8",
        displayName: "Claude Opus 4.8 (judge)",
        kind: "judge",
        enabled: false,
      },
    ])
    .returning();

  // A couple of sample tasks so a run can be executed immediately.
  const insertedTasks = await db
    .insert(tasks)
    .values([
      { slug: "capital-france", prompt: "What is the capital of France? Answer in one sentence." },
      { slug: "explain-recursion", prompt: "Explain recursion to a beginner in exactly three sentences." },
    ])
    .returning();

  // A baseline rubric with weighted criteria (1–5 scale).
  const [rubric] = await db
    .insert(rubrics)
    .values({ name: "default", description: "Baseline response-quality rubric", version: 1 })
    .returning();

  await db.insert(rubricCriteria).values([
    { rubricId: rubric!.id, name: "accuracy", description: "Factually correct and on-topic", weight: "2", position: 0 },
    { rubricId: rubric!.id, name: "helpfulness", description: "Addresses the user's actual need", weight: "1", position: 1 },
    { rubricId: rubric!.id, name: "coherence", description: "Clear, well-structured, easy to follow", weight: "1", position: 2 },
  ]);

  console.log("Seed complete: 3 providers, 3 models, 2 tasks, 1 rubric (3 criteria).");
  console.log("IDs for a test run (POST /api/eval-runs):");
  console.log("  modelIds:      [", geminiModel!.id, "]");
  console.log("  judgeModelId:  ", judgeModel!.id);
  console.log("  rubricId:      ", rubric!.id);
  console.log("  taskIds:       [", insertedTasks.map((t) => t.id).join(", "), "]");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
