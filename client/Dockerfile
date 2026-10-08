# S16 (ADR-042) — production client image: build the SPA, serve it with nginx.
#
# VITE_API_URL=/api is baked at build time so the client talks to the SAME
# origin it is served from. This kills the CORS surface, lets secure cookies
# work without cross-site gymnastics, and — critically — activates the S15
# service-worker runtime API caching, whose rules are `sameOrigin` and were
# therefore inert in dev (ADR-039/042).
FROM node:24-bookworm-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:alpine AS runtime
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
CMD ["nginx", "-g", "daemon off;"]
