import { config } from "dotenv";
import { fileURLToPath } from "node:url";

// Root .env regardless of cwd (script lives at apps/api/src/spotcheck/).
config({ path: fileURLToPath(new URL("../../../../.env", import.meta.url)) });

import readline from "node:readline/promises";
import { parseArgs } from "node:util";
import {
  createDb,
  evalRuns,
  executions,
  models,
  responses,
  rubricCriteria,
  scores,
  spotChecks,
  tasks,
} from "@llm-eval/db";
import { and, eq, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { computeAgreement, type AgreementEntry, type AgreementStats } from "./agreement";

/**
 * Manual judge-validation CLI: sample scored responses, collect human scores per
 * criterion (blind to the judge's score by default), persist them to spot_checks,
 * and report human<->judge agreement.
 *
 *   pnpm --filter @llm-eval/api spotcheck [-- --n 5 --judge claude-opus-4-8]
 *
 * Flags:
 *   --n <count>          responses to sample (default 10)
 *   --reviewer <name>    stored in spot_checks.reviewer (default: OS username)
 *   --run <evalRunId>    only sample from one eval run
 *   --judge <apiName>    only sample scores produced by this judge model
 *   --include-checked    re-offer already-checked responses and duplicate answer texts
 *   --show-judge         reveal the judge's score before you enter yours (not blind)
 *   --report             no interaction: recompute agreement over all stored spot checks
 */

interface ScoreRow {
  scoreId: string;
  responseId: string;
  responseContent: string;
  judgeScore: string;
  judgeReasoning: string | null;
  judgeModel: string;
  criterionName: string;
  criterionDescription: string | null;
  scaleMin: number;
  scaleMax: number;
  position: number;
  taskSlug: string;
  taskPrompt: string;
  taskDescription: string | null;
  taskCategory: string | null;
  candidateModel: string;
  runName: string;
}

const judgeModels = alias(models, "judge_models");

function parseCliArgs() {
  const { values } = parseArgs({
    // pnpm forwards a literal "--" when invoked npm-style (pnpm spotcheck -- --n 5);
    // drop it, or parseArgs demotes every flag after it to a positional.
    args: process.argv.slice(2).filter((a) => a !== "--"),
    options: {
      n: { type: "string", default: "10" },
      reviewer: { type: "string", default: process.env.USERNAME || process.env.USER || "human" },
      run: { type: "string" },
      judge: { type: "string" },
      "include-checked": { type: "boolean", default: false },
      "show-judge": { type: "boolean", default: false },
      report: { type: "boolean", default: false },
    },
  });
  const n = Number.parseInt(values.n!, 10);
  if (!Number.isFinite(n) || n < 1) throw new Error(`--n must be a positive integer, got "${values.n}"`);
  return {
    n,
    reviewer: values.reviewer!,
    run: values.run,
    judge: values.judge,
    includeChecked: values["include-checked"]!,
    showJudge: values["show-judge"]!,
    reportOnly: values.report!,
  };
}

async function fetchScoreRows(db: ReturnType<typeof createDb>, filters: { run?: string; judge?: string }) {
  const conditions: SQL[] = [];
  if (filters.run) conditions.push(eq(executions.evalRunId, filters.run));
  if (filters.judge) conditions.push(eq(judgeModels.apiName, filters.judge));

  return db
    .select({
      scoreId: scores.id,
      responseId: responses.id,
      responseContent: responses.content,
      judgeScore: scores.score,
      judgeReasoning: scores.reasoning,
      judgeModel: judgeModels.apiName,
      criterionName: rubricCriteria.name,
      criterionDescription: rubricCriteria.description,
      scaleMin: rubricCriteria.scaleMin,
      scaleMax: rubricCriteria.scaleMax,
      position: rubricCriteria.position,
      taskSlug: tasks.slug,
      taskPrompt: tasks.prompt,
      taskDescription: tasks.description,
      taskCategory: tasks.category,
      candidateModel: models.displayName,
      runName: evalRuns.name,
    })
    .from(scores)
    .innerJoin(responses, eq(scores.responseId, responses.id))
    .innerJoin(rubricCriteria, eq(scores.rubricCriterionId, rubricCriteria.id))
    .innerJoin(judgeModels, eq(scores.judgeModelId, judgeModels.id))
    .innerJoin(executions, eq(responses.executionId, executions.id))
    .innerJoin(evalRuns, eq(executions.evalRunId, evalRuns.id))
    .innerJoin(tasks, eq(executions.taskId, tasks.id))
    .innerJoin(models, eq(executions.modelId, models.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined);
}

function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

const pct = (rate: number) => `${(rate * 100).toFixed(0)}%`;
const num = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2));

function statsLine(label: string, s: AgreementStats): string {
  return (
    `  ${label.padEnd(28)} n=${String(s.n).padEnd(4)} exact ${pct(s.exactRate).padEnd(5)} ` +
    `within-1 ${pct(s.within1Rate).padEnd(5)} mean|diff| ${num(s.meanAbsDiff).padEnd(5)} ` +
    `bias ${s.meanSignedDiff > 0 ? "+" : ""}${num(s.meanSignedDiff)}`
  );
}

function printReport(entries: AgreementEntry[], heading: string) {
  const report = computeAgreement(entries);
  console.log(`\n${"═".repeat(72)}\n${heading}\n${"═".repeat(72)}`);
  if (!report.overall) {
    console.log("  No scored entries to report on.");
    return;
  }
  console.log("Per criterion:");
  for (const [name, stats] of Object.entries(report.byCriterion)) console.log(statsLine(name, stats));
  const judges = Object.entries(report.byJudgeModel);
  if (judges.length > 1) {
    console.log("Per judge model:");
    for (const [name, stats] of judges) console.log(statsLine(name, stats));
  }
  console.log("Overall:");
  console.log(statsLine("all criteria", report.overall));
  console.log("  (bias = mean of judge − human: positive means the judge is more lenient than you)");
}

/** Prompt until we get an in-scale integer, "s" (skip), or "q" (quit). */
async function askScore(
  rl: readline.Interface,
  scaleMin: number,
  scaleMax: number,
): Promise<number | "skip" | "quit"> {
  for (;;) {
    const raw = (await rl.question(`  Your score (${scaleMin}-${scaleMax}, s=skip, q=quit): `)).trim();
    if (raw.toLowerCase() === "s") return "skip";
    if (raw.toLowerCase() === "q") return "quit";
    const value = Number.parseInt(raw, 10);
    if (Number.isInteger(value) && value >= scaleMin && value <= scaleMax) return value;
    console.log(`  Please enter an integer from ${scaleMin} to ${scaleMax}.`);
  }
}

async function main() {
  const args = parseCliArgs();
  const db = createDb();

  const rows = await fetchScoreRows(db, { run: args.run, judge: args.judge });
  if (rows.length === 0) {
    console.log("No judge scores match the given filters — nothing to spot-check.");
    return;
  }

  if (args.reportOnly) {
    // Join stored human scores back onto the fetched judge scores.
    const checks = await db
      .select({ scoreId: spotChecks.scoreId, humanScore: spotChecks.humanScore })
      .from(spotChecks);
    const byScoreId = new Map(rows.map((r) => [r.scoreId, r]));
    const entries: AgreementEntry[] = [];
    for (const check of checks) {
      const row = byScoreId.get(check.scoreId);
      if (!row) continue; // outside --run/--judge filters
      entries.push({
        criterion: row.criterionName,
        judgeModel: row.judgeModel,
        judgeScore: Number(row.judgeScore),
        humanScore: Number(check.humanScore),
      });
    }
    printReport(entries, `Agreement across all stored spot checks (${entries.length} entries)`);
    return;
  }

  const checkedScoreIds = new Set(
    (
      await db
        .select({ scoreId: spotChecks.scoreId })
        .from(spotChecks)
        .where(eq(spotChecks.reviewer, args.reviewer))
    ).map((r) => r.scoreId),
  );

  // Answer texts this reviewer has already graded (across all runs/models).
  // Different candidate models often emit byte-identical answers on easy tasks;
  // grading the same text twice adds no information and inflates agreement.
  const checkedContents = new Set(
    (
      await db
        .selectDistinct({ content: responses.content })
        .from(spotChecks)
        .innerJoin(scores, eq(spotChecks.scoreId, scores.id))
        .innerJoin(responses, eq(scores.responseId, responses.id))
        .where(eq(spotChecks.reviewer, args.reviewer))
    ).map((r) => r.content.trim()),
  );

  // Group score rows into responses; a response is exhausted for this reviewer
  // once every one of its criterion scores has a spot check.
  const byResponse = new Map<string, ScoreRow[]>();
  for (const row of rows) {
    const group = byResponse.get(row.responseId);
    if (group) group.push(row);
    else byResponse.set(row.responseId, [row]);
  }
  let candidates = [...byResponse.values()];
  if (!args.includeChecked) {
    candidates = candidates.filter((group) => group.some((r) => !checkedScoreIds.has(r.scoreId)));
    const beforeContentDedup = candidates.length;
    candidates = candidates.filter((group) => !checkedContents.has(group[0]!.responseContent.trim()));
    const dupes = beforeContentDedup - candidates.length;
    if (dupes > 0) console.log(`Skipping ${dupes} response(s) identical to answers you already scored.`);
  }
  if (candidates.length === 0) {
    console.log(
      `Every matching response already has spot checks by "${args.reviewer}"` +
        ` or repeats an answer you already scored (use --include-checked to redo).`,
    );
    return;
  }

  // Never offer the same answer text twice within one session either.
  const sample: ScoreRow[][] = [];
  const sampledContents = new Set<string>();
  for (const group of shuffle(candidates)) {
    if (sample.length >= args.n) break;
    const content = group[0]!.responseContent.trim();
    if (!args.includeChecked && sampledContents.has(content)) continue;
    sampledContents.add(content);
    sample.push(group);
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const sessionEntries: AgreementEntry[] = [];
  let quit = false;

  console.log(
    `Spot-checking ${sample.length} response(s) as "${args.reviewer}"` +
      (args.showJudge ? " (judge scores visible)" : " (blind: judge scores revealed after yours)"),
  );

  for (const [responseIndex, group] of sample.entries()) {
    const head = group[0]!;
    const criteria = [...group].sort((a, b) => a.position - b.position);
    console.log(`\n${"═".repeat(72)}`);
    console.log(
      `Response ${responseIndex + 1}/${sample.length} — ${head.taskSlug}` +
        `${head.taskCategory ? ` [${head.taskCategory}]` : ""} · candidate: ${head.candidateModel}` +
        ` · judge: ${head.judgeModel} · run: ${head.runName}`,
    );
    console.log(`\nPROMPT:\n${head.taskPrompt}`);
    if (head.taskDescription) console.log(`\nREFERENCE (expected answer / failure mode):\n${head.taskDescription}`);
    console.log(`\nRESPONSE:\n${head.responseContent}`);

    for (const [criterionIndex, row] of criteria.entries()) {
      if (!args.includeChecked && checkedScoreIds.has(row.scoreId)) continue;
      console.log(
        `\n--- Criterion ${criterionIndex + 1}/${criteria.length}: ${row.criterionName}` +
          ` (scale ${row.scaleMin}-${row.scaleMax})`,
      );
      if (row.criterionDescription) console.log(`  ${row.criterionDescription}`);
      const judgeScore = Number(row.judgeScore);
      if (args.showJudge) {
        console.log(`  Judge (${row.judgeModel}): ${num(judgeScore)} — ${row.judgeReasoning ?? "(no reasoning)"}`);
      }

      const answer = await askScore(rl, row.scaleMin, row.scaleMax);
      if (answer === "quit") {
        quit = true;
        break;
      }
      if (answer === "skip") continue;
      const note = (await rl.question("  Note (enter to skip): ")).trim();

      if (!args.showJudge) {
        console.log(`  Judge (${row.judgeModel}): ${num(judgeScore)} — ${row.judgeReasoning ?? "(no reasoning)"}`);
      }
      const diff = judgeScore - answer;
      console.log(diff === 0 ? "  = agree" : `  ≠ disagree (judge ${diff > 0 ? "+" : ""}${num(diff)} vs you)`);

      // Persist immediately so quitting mid-session loses nothing.
      await db.insert(spotChecks).values({
        scoreId: row.scoreId,
        reviewer: args.reviewer,
        humanScore: String(answer),
        agrees: diff === 0,
        note: note || null,
      });
      sessionEntries.push({
        criterion: row.criterionName,
        judgeModel: row.judgeModel,
        judgeScore,
        humanScore: answer,
      });
    }
    if (quit) break;
  }
  rl.close();

  printReport(sessionEntries, `Session agreement (${sessionEntries.length} entries)`);
  console.log("\nTip: `pnpm --filter @llm-eval/api spotcheck -- --report` aggregates every stored spot check.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
