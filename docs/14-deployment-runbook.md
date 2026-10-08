# HomeHunt — Deployment Runbook (S16, ADR-042)

Operator guide for running HomeHunt on a single VPS/cloud host with Docker
Compose. It is deliberately **vendor-neutral**: any host with Docker + Compose
works. Nothing here requires a specific cloud provider.

## 1. Topology
```
internet ──▶ client (nginx:80) ──▶ /api, /socket.io ──▶ server (node:5000) ──▶ mongodb:27017
                    │                                          │
              serves the built SPA                      Socket.io (in-memory,
              + reverse proxy                           single process)
```
Single-instance by locked decision (ADR-042): one server, one nginx, one
MongoDB with a named volume. No Redis adapter, no distributed locks.

## 2. Prerequisites
- Docker Engine 24+ and the Compose v2 plugin.
- A `.env` file at the repo root (never committed) supplying at minimum:
  - `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (different values, ≥ 32 chars)
  - `CLIENT_URL` (the public origin, e.g. `https://homehunt.example.com`)
  - optionally `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS`, `TRUST_PROXY`
- TLS termination (see §6).

## 3. First deploy
```bash
git clone <repo> && cd HomeHunt
cp .env.example .env        # then fill in the secrets above
docker compose up -d --build
docker compose ps           # wait until server is healthy (HEALTHCHECK → /api/health)
curl -sf http://localhost:8080/api/ready   # 200 {"status":"ready"}
```

## 4. Seeding — NEVER automatic
The server **never seeds on boot** (ADR-042). Development seed scripts refuse
to run when `NODE_ENV=production`; that guard is intentional and must stay.

- **Staging** (disposable data) — one explicit shot against the staging DB:
  ```bash
  docker compose run --rm -e NODE_ENV=development server npm run seed
  ```
  This creates the deterministic dev identities (`agent@homehunt.test`,
  `admin@homehunt.test`, `buyer@homehunt.test`) plus seeded listings and POIs.
- **Production** — do **not** run the dev seed. Provision the first admin
  through the application's own admin API (S7 `POST /api/admin/users`) with a
  real email, then create real listings through the agent UI.

## 5. Zero-downtime redeploy
```bash
git pull
docker compose build server client
docker compose up -d --no-deps --scale server=1 server   # recreate server only
docker compose up -d --no-deps client
```
- The server's graceful-shutdown handler (SIGTERM → close Socket.io → close
  HTTP → close Mongoose, bounded by `SHUTDOWN_TIMEOUT_MS`, default 8 s) lets
  in-flight requests and socket drains finish before the container stops.
- nginx serves `sw.js` / `index.html` / `manifest.webmanifest` with
  `no-cache`, so clients pick up the new shell and service worker on next load
  (hashed `/assets/*` are immutable and safely cached).
- **Genuine zero downtime needs ≥ 2 server replicas behind the proxy** — which
  requires the scaling work in §8 first. With the single-instance default,
  expect a brief (seconds) socket reconnect window.

## 6. TLS
Terminate TLS at a host-level reverse proxy (nginx/Caddy/Traefik) or a cloud
load balancer in front of the `client` service, forwarding to port 8080.
- The app sets `secure` cookies in production (`NODE_ENV=production`), so it
  must be served over HTTPS.
- Keep `X-Forwarded-Proto` set at the terminating proxy and leave
  `TRUST_PROXY=1` (one hop) unless you add more proxies, in which case set the
  hop count accordingly.
- HSTS is applied at the TLS terminator, not in the container nginx (which
  speaks plain HTTP on the internal network).

## 7. Backup & restore
- **Data**: `mongodb` uses the named volume `mongo-data`.
  ```bash
  # backup
  docker compose exec mongodb mongodump --archive=/tmp/dump.gz --gzip
  docker compose cp mongodb:/tmp/dump.gz ./backup-$(date +%F).gz
  # restore
  docker compose cp ./backup-YYYY-MM-DD.gz mongodb:/tmp/dump.gz
  docker compose exec mongodb mongorestore --archive=/tmp/dump.gz --gzip --drop
  ```
- **Uploads**: with `UPLOAD_PROVIDER=fake` bytes are in-memory and ephemeral
  (dev/staging only). Production uses `UPLOAD_PROVIDER=cloudinary` — back up
  at the provider; the database stores only metadata.
- Schedule the dump via cron on the host; keep at least 7 daily + 4 weekly.

## 8. Horizontal scaling — the evidence-triggered upgrade path
Do **not** scale out until one of these is actually observed:
| Symptom | Fix | Where it is recorded |
|---|---|---|
| Socket messages not delivered across replicas | `@socket.io/redis-adapter` + Redis service | ADR-026 / ADR-028 |
| Double-booked visit confirmations under concurrency | MongoDB replica set (multi-doc transactions) **or** a shared lock service | ADR-023 |
| Rate limiter counts diverge per replica | Redis-backed rate-limit store | ADR-016 / ADR-042 |
Then: add a `redis` service to compose, set the adapter in `server.js`, point
the limiter at the Redis store, and run MongoDB as a replica set. Until then,
single-instance is the honest, documented posture.

## 9. Health & observability
- `GET /api/health` — liveness (no dependencies). Docker `HEALTHCHECK` uses it.
- `GET /api/ready` — readiness (MongoDB `readyState === 1`, else 503). Gate
  traffic/rollout on this.
- Both are exempt from the rate limiter so probes are never throttled.
- Logs: `docker compose logs -f server`.

## 10. Rollback
Images are tagged per build in CI (`homehunt-server:ci`). For a release
pipeline, tag with the git SHA and redeploy the previous tag:
```bash
docker compose up -d --no-deps server   # after pinning the prior image tag
```
Database rollbacks are a restore (§7) — there is no migration framework; the
schema is index-managed by Mongoose on boot.
