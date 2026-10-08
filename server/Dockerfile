# S16 (ADR-042) — production server image.
#
# Multi-stage: dependencies are installed once in the builder and only the
# production set + source reach the runtime layer. Base is bookworm-slim
# (glibc) because the runtime dependency `bcrypt` ships glibc prebuilds and
# the node:24-alpine spike could not be executed on the authoring host (no
# Docker); ADR-042 records alpine as an optimisation to re-try in CI.
FROM node:24-bookworm-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
# tini as PID 1 so SIGTERM/SIGINT reach Node (interlocks with the
# server/src/server.js graceful-shutdown handler, ADR-042).
RUN apt-get update \
    && apt-get install -y --no-install-recommends tini \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./
COPY src ./src
COPY scripts ./scripts
# Non-root: the base image already provides the unprivileged `node` user.
USER node
EXPOSE 5000
# Liveness probe hits the limiter-exempt endpoint (ADR-042).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "src/server.js"]
