# LLM Evaluation Platform

Sends the same prompt to two LLM providers (OpenAI, Gemini), scores the responses
against a rubric using Claude as an independent judge, and stores everything in
Postgres with a React dashboard.

## Layout

```
apps/
  api/        Fastify backend + eval orchestration
  web/        React dashboard (Vite)
packages/
  db/         Drizzle schema, migrations, seed, weighted-score view
  shared/     enums + zod DTOs shared by api and web
```

## Quickstart

```bash
pnpm install
cp .env.example .env        # set GEMINI_API_KEY

pnpm db:up                  # start Postgres 16 (docker)
pnpm db:generate            # generate SQL migration from the Drizzle schema
pnpm db:migrate             # apply it
pnpm db:seed                # providers/models (gemini enabled, others deferred) + sample rubric

pnpm dev                    # api (:3001) + web (:5173)
```

## Core model

`eval_run → execution → response → score`. Execution status is explicit
(pending/running/success/error). Overall quality is the `response_quality` view
— `Σ(score × weight) / Σ(weight)` — never a stored column. See
`packages/db/src/schema/`.

> Scaffold: schema + interfaces are in place; provider adapters and eval
> orchestration are stubs (throw `not implemented`).
