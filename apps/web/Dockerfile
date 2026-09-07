# Build context is the REPO ROOT, not apps/web:
#   docker build -f apps/web/Dockerfile .
#
# The dashboard imports @llm-eval/shared, so the build needs the workspace.

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

# ── build ────────────────────────────────────────────────────────────────────
# Manifests first, so a CSS tweak reuses the cached install layer.
FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json      apps/api/
COPY apps/web/package.json      apps/web/
COPY packages/db/package.json   packages/db/
COPY packages/shared/package.json packages/shared/

# Not --prod here: vite, tailwind and typescript are devDependencies, and this stage
# is a build. None of it reaches the final image — that is the point of the split.
RUN pnpm install --frozen-lockfile --filter @llm-eval/web...

COPY packages/ packages/
COPY apps/web/ apps/web/

# Vite inlines env vars at BUILD time, not run time, so the API URL is baked into
# the bundle here and cannot be changed by an env var on the running container.
#
# Left empty on purpose for the compose stack: the client then falls back to the
# relative "/api", which Caddy below proxies to the api service — the same shape as
# the Vite dev proxy, so local Docker and local dev behave identically. Set it only
# when the dashboard is served from somewhere that is not in front of the API:
#   docker build --build-arg VITE_API_URL=https://api.example.com/api ...
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL
RUN pnpm --filter @llm-eval/web build

# ── runtime ──────────────────────────────────────────────────────────────────
# The built dashboard is static files. Serving them from Node would ship a runtime
# and a dependency tree to hand out four files; Caddy is ~50MB total, runs as its
# own user, and terminates the /api proxy in the same hop.
FROM caddy:2-alpine
COPY apps/web/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv
EXPOSE 80
