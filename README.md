# LLM Eval Platform

Pick an LLM provider with data instead of intuition: head-to-head evals on your own tasks, scored per rubric criterion by an independent AI judge — and the judge itself is validated against blind human scoring.

<!-- TODO: capture the Run Detail page and save it to docs/dashboard.png -->
![Dashboard — run detail](docs/dashboard.png)

## The problem

"Which model should we use?" usually gets answered by anecdote: someone pastes a prompt into two chat UIs and eyeballs the output. That doesn't scale, doesn't persist, and quietly biases toward whichever answer *sounds* better. This platform turns the question into a pipeline: fixed tasks, weighted rubric, every candidate model answers everything, an independent judge scores every answer per criterion, and the aggregate quality score is computed in the database where it can't drift from the data.

It also confronts the obvious objection — *why trust an LLM judge?* — head-on, with a blind human validation loop and published agreement numbers (see [Validation](#validation-does-the-judge-agree-with-a-human)).

## How the pipeline works

```
tasks ──► eval run ──► one execution per (task × candidate model)
                            │  explicit status: pending → running → success / error
                            ▼
                        responses
                            │  independent judge (Anthropic), structured JSON output
                            ▼
              scores: one row per rubric criterion,
              stamped with the judge model that produced it
                            │
                            ▼
        weighted quality score = SQL view (Σ score·weight / Σ weight)
```

1. **Tasks** are versioned prompts — trivia, reasoning traps, timezone arithmetic, code bug hunts, instruction-following.
2. **Rubrics** hold weighted criteria (accuracy w2, helpfulness w1, coherence w1, instruction compliance w2 — each scored 1–5).
3. **A comparison run** sends every task to every enabled candidate model (currently Gemini 2.5 Flash and GPT-4o mini), tracked as explicit execution rows with concurrency limits.
4. **The judge** — a Claude model that is *not* a candidate — scores each response against every criterion in one structured-output call, with a one-sentence justification per score.
5. **Quality scores** are a Postgres view over the scores table: change a rubric weight and every historical run re-ranks instantly, no recompute job.

## Architecture

TypeScript monorepo (pnpm workspaces):

```
apps/web        React 19 + Vite 6 + Tailwind v4 dashboard (dark, data-dense)
apps/api        Fastify 5 API + in-process eval orchestrator + spot-check CLI
packages/db     Drizzle ORM: 11-table schema, quality-score view, seeds
packages/shared Enums + zod DTOs shared by api and web
```

- **Postgres** via Neon (or local Docker Compose) through Drizzle ORM.
- **Three provider integrations**, each a small adapter over the raw HTTP API (no SDKs): Google Gemini, OpenAI, Anthropic. The Anthropic adapter handles thinking with a self-healing step-down (adaptive → budget-style → none, learned per model at runtime from the API's 400s, not hand-listed), structured JSON-schema output, 429/529 retry with `retry-after`, refusal detection, and per-call token/latency logging. Every judge call's verbatim output is persisted to a `judge_calls` audit table.
- **Judge prompts emit standard JSON Schema**; the Gemini adapter translates to Gemini's schema dialect, so one prompt builder serves all providers.

## Design decisions worth defending

**Explicit execution status, not nullability.** Each execution carries `pending | running | success | error` as a real enum instead of inferring state from "response is null but error isn't". Derived-from-null state machines grow undebuggable third states; explicit status made retry logic and the live dashboard trivial.

**`judge_model_id` on every score row.** Scores are attributed to the judge that produced them, not to a global setting. That's what makes cross-judge comparison possible at all — the validation table below splitting agreement by judge model is just a `GROUP BY`.

**The judge is a third party.** Candidates are Gemini and GPT; the judge is Claude. A model grading its own family's answers is a conflict of interest — self-preference bias is well documented. Independence was a requirement, not an optimization.

**Single active judge, enforced by Postgres.** Which judge scores new runs is a `models.is_active_judge` flag guarded by a partial unique index (`ON models (is_active_judge) WHERE is_active_judge`) — the database rejects a second active judge outright. Selection used to fall out of row order; now it's intent, and it survives any application bug that forgets the convention.

## Validation: does the judge agree with a human?

The platform ships a spot-check CLI that samples judged responses and asks a human to score them **blind** — you commit your score before the judge's is revealed — then persists every check and prints an agreement report. Real output over all stored checks to date:

```
Per criterion:
  accuracy                     n=30   exact 77%   within-1 80%   mean|diff| 0.77  bias +0.30
  helpfulness                  n=30   exact 80%   within-1 90%   mean|diff| 0.37  bias +0.03
  coherence                    n=30   exact 87%   within-1 90%   mean|diff| 0.37  bias +0.30
  instruction compliance       n=25   exact 80%   within-1 88%   mean|diff| 0.44  bias -0.04
Per judge model:
  gemini-2.5-flash             n=35   exact 94%   within-1 94%   mean|diff| 0.17  bias +0.06
  claude-haiku-4-5-20251001    n=76   exact 79%   within-1 84%   mean|diff| 0.58  bias +0.13
  claude-opus-4-8              n=4    exact 0%    within-1 75%   mean|diff| 1.50  bias +1.50
Overall:
  all criteria                 n=115  exact 81%   within-1 87%   mean|diff| 0.49  bias +0.16
  (bias = judge − human: positive means the judge is more lenient)
```

Findings, honestly read:

- **Claude Haiku 4.5 is the validated judge**: 79% exact / 84% within-1 agreement with blind human scoring over n=76, with near-zero aggregate bias (+0.13). It is the active judge on that evidence.
- **Gemini-as-judge's 94% is not trustworthy.** Its checks landed disproportionately on trivial tasks ("What is the capital of France?") where different candidates return byte-identical answers — agreement is inflated by items nobody could grade differently. In the one clean blind session it appeared in, it managed 50% (n=4). Unvalidated either way.
- **Accuracy is the judge's weak spot.** It's the worst criterion in the pool (77% exact, mean |diff| 0.77). The initial blind session was starker: on hard tasks the judge ran **+1.6 lenient on accuracy, and every single disagreement was 2+ points in the lenient direction** — e.g. a fluent, confident timezone answer with the wrong day scored high. Meanwhile coherence agreement was perfect in that session and is the strongest criterion overall (87% exact).
- **Opus 4.8 is unvalidated** (n=4, 0% exact, +1.5 lenient — a sample, not a verdict). It was initially the active judge by default capability assumption; it now sits disabled because paying ~6–12× per call (adaptive thinking bills as output tokens) for an *unvalidated* judge over a *validated* one is exactly the intuition-over-data habit this project exists to kill.

### What that means

The judge is reliable for **style-level criteria** — coherence, helpfulness, instruction compliance — and systematically unreliable at **verifying facts it cannot check**. An LLM judge rewards fluent-but-wrong answers on accuracy, because confidence reads as correctness. Practical consequence: accuracy scoring needs grounding (a reference-answer comparison in the judge prompt), not free judgment. Tasks here already store an expected-answer description; wiring it into the accuracy criterion is the highest-value next change.

## Limitations & future work

- **Small validation sample.** n=115 criterion-level checks from one reviewer. Directionally useful, not a benchmark.
- **Easy tasks produce duplicate responses.** Trivial prompts make candidates converge on identical text, which both inflates agreement stats and shrinks the useful validation pool (the spot-check sampler now dedupes by response content, so repeats are never offered twice). Harder, more discriminating tasks are the fix.
- **Opus as judge is an open question, not a closed one.** Haiku won on evidence available today. The plan is to re-enable Opus, accumulate blind checks against it, and let the agreement report decide whether the higher price buys better judgment — it may well be the better judge; nobody has shown it yet.
- **Accuracy should be reference-grounded.** Pass the task's expected answer to the judge for the accuracy criterion instead of asking it to know the truth.
- **One attempt per (task, model).** No variance analysis yet — a model that flips between brilliant and wrong looks identical to a consistently mediocre one. Repeat executions and dispersion metrics are future work.

## Setup

Requires Node ≥ 20, pnpm 9, and a Postgres database (Neon or local Docker).

```bash
pnpm install
cp .env.example .env        # set provider keys (Gemini is enough to start)

# Database — either local:
pnpm db:up                  # docker compose Postgres matching the default DATABASE_URL
# ...or hosted: point DATABASE_URL at a Neon connection string

pnpm db:generate            # generate SQL migration from the Drizzle schema
pnpm db:migrate             # apply it
pnpm db:seed                # providers, models, rubric, sample tasks
pnpm --filter @llm-eval/db seed:hard   # optional: 6 harder tasks

pnpm dev                    # API on :3001, dashboard on http://localhost:5173
```

Environment variables (`.env`): `DATABASE_URL`, `PORT` (default 3001), `GEMINI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, optional `JUDGE_TIMEOUT_MS`. Providers roll out in phases — models are seeded disabled except Gemini; flip `models.enabled` (and set one judge's `is_active_judge`) as you add keys.

Run a comparison from the dashboard (**Eval Runs → ＋ New comparison run**), then validate the judge yourself:

```bash
pnpm --filter @llm-eval/api spotcheck --n 10   # blind-score a sample in your terminal
pnpm --filter @llm-eval/api spotcheck --report # aggregate agreement over all stored checks
```
