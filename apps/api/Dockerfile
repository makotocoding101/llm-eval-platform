# Build context is the REPO ROOT, not apps/api:
#   docker build -f apps/api/Dockerfile .
#
# The API depends on @llm-eval/db and @llm-eval/shared as workspace packages, and
# those export TypeScript source rather than compiled JS ("main": "./src/index.ts").
# So there is no compile step to run and no dist/ to copy — the image ships the
# source and runs it under tsx, exactly as `pnpm start` does locally.

# ── base ─────────────────────────────────────────────────────────────────────
# Debian slim rather than Alpine. tsx pulls in esbuild, and Alpine's musl libc is
# where prebuilt binaries most often need a different variant than the lockfile
# resolved. Slim costs ~40MB over Alpine and removes that class of surprise.
FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm PATH=$PNPM_HOME:$PATH
# corepack reads "packageManager": "pnpm@9.15.0" from the root package.json, so the
# image builds with the same pnpm the lockfile was written by.
RUN corepack enable
WORKDIR /app

# ── manifests ────────────────────────────────────────────────────────────────
# Copy only the files that describe dependencies, before any source. Docker caches
# layers by input, so editing a route does not invalidate the install below — that
# only happens when a package.json or the lockfile actually changes.
#
# Every workspace manifest is copied, including apps/web's, even though the API does
# not need it: --frozen-lockfile verifies the lockfile against the whole workspace,
# and a project present in the lockfile but missing on disk makes that check fail.
FROM base AS manifests
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json      apps/api/
COPY apps/web/package.json      apps/web/
COPY packages/db/package.json   packages/db/
COPY packages/shared/package.json packages/shared/

# ── deps-prod ────────────────────────────────────────────────────────────────
# Runtime dependencies only. `@llm-eval/api...` selects the API *and the workspace
# packages it depends on* (that is what the trailing ... means), so apps/web and its
# toolchain are never installed. --prod drops typescript and vitest; tsx survives
# because it is a real runtime dependency of `start`.
FROM manifests AS deps-prod
RUN pnpm install --frozen-lockfile --prod --filter @llm-eval/api...

# ── deps-full ────────────────────────────────────────────────────────────────
# The same selection with devDependencies, which is where drizzle-kit lives. Used
# only by the `tools` stage below.
FROM manifests AS deps-full
RUN pnpm install --frozen-lockfile --filter @llm-eval/api...

# ── tools ────────────────────────────────────────────────────────────────────
# Migrations and seeding. Deliberately a separate image from the server: running
# migrations from the server's own entrypoint means every replica races to migrate
# on deploy, and a container that cannot reach the database fails to start rather
# than starting degraded. Compose runs this once, to completion, before the API.
FROM deps-full AS tools
COPY packages/ packages/
COPY apps/api/ apps/api/
WORKDIR /app/packages/db
CMD ["pnpm", "migrate"]

# ── runtime ──────────────────────────────────────────────────────────────────
FROM base AS runtime
ENV NODE_ENV=production

# node:22-slim ships a non-root `node` user (uid 1000). A process that does not need
# root should not have it; if the container is compromised, the blast radius is a
# user that owns nothing but the app directory.
COPY --from=deps-prod --chown=node:node /app /app
COPY --chown=node:node packages/ /app/packages/
COPY --chown=node:node apps/api/  /app/apps/api/

USER node
WORKDIR /app/apps/api
EXPOSE 3001

# /health is answered by Fastify without touching Postgres (the pg Pool connects
# lazily), so this is a true liveness probe: it reports whether the process is up,
# not whether the database is. Node 22 has global fetch, so no curl in the image.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

# `node --import tsx` runs the server in a single process. The `tsx` CLI would spawn
# a child, leaving PID 1 as a supervisor that does not forward SIGTERM — so the
# container would be killed after the 10s timeout on every restart instead of
# shutting down cleanly.
CMD ["node", "--import", "tsx", "src/server.ts"]
