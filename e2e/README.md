# HomeHunt E2E (S16, ADR-041)

Playwright end-to-end journeys that run against the **containerized production
simulation** (`docker-compose.e2e.yml`) — nginx serving the built SPA, proxying
`/api` and `/socket.io` to the real server, backed by a real MongoDB. This
exercises proxying, websockets, SPA fallback, cache headers and the service
worker in situ (a `vite preview` target would skip exactly what S16 ships).

This is an **isolated workspace**: it has its own `package.json` and installs
nothing into `server/` or `client/`. The 553 Jest tests are unaffected.

## Prerequisites
- Docker + Docker Compose
- Node 24 (for the Playwright runner)

## Run locally
```bash
# 1. From the repo root: bring up the e2e stack (raises rate limits, ADR-042)
docker compose -f docker-compose.e2e.yml up -d --build

# 2. Seed the e2e database ONCE (never auto-seeds on boot — ADR-042).
#    NODE_ENV is overridden so the production seed guard is satisfied for this
#    disposable e2e volume only.
docker compose -f docker-compose.e2e.yml run --rm -e NODE_ENV=development server npm run seed

# 3. Wait for readiness (the /api/ready probe is limiter-exempt, ADR-042)
until curl -sf http://localhost:4173/api/ready >/dev/null; do sleep 1; done

# 4. Run the journeys
cd e2e && npm ci && npx playwright install --with-deps chromium && npm test

# 5. Tear down (removes the disposable volume)
docker compose -f docker-compose.e2e.yml down -v
```

## Journeys (docs/10 12-flow mapping)
| # | Spec | docs/10 flows covered |
|---|------|-----------------------|
| 1 | `01-buyer-discovery.spec.js` | registration, login, search & filtering, property detail, mortgage calculator, bookmark, saved search |
| 2 | `02-inquiry-chat.spec.js` | inquiry, chat, notification |
| 3 | `03-visit-scheduling.spec.js` | visit scheduling |
| 4 | `04-agent-listing.spec.js` | agent listing creation (+ verification surface) |
| 5 | `05-admin-moderation.spec.js` | admin approval, user management |
| 6 | `06-pwa-offline.spec.js` | PWA install/SW registration, offline fallback, manifest (retires the S15 docs/10 note) |

Seeded identities (`server/scripts/seed/users.js`): `agent@homehunt.test`,
`admin@homehunt.test`, `buyer@homehunt.test` — password `DevPassword123!`.
Buyers that must not collide with seed data register through the real UI with a
per-run unique `.test` email.

## Notes
- `workers: 1`, `retries: 0` — the seeded data is deterministic (ADR-033); the
  flake budget goes to isolation bugs, not retry masks.
- Rate limits are raised through env knobs (`RATE_LIMIT_MAX`) in the e2e
  compose — there are **no test-only code branches** in the app.
