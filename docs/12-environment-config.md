# HomeHunt — Environment Configuration

This document defines expected configuration names. Actual secrets must never be committed.

## Server
- `NODE_ENV`
- `PORT`
- `CLIENT_URL`
- `MONGODB_URI`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `TRUST_PROXY` (S16, ADR-042) — number of proxy hops in front of the server. Default `1` (a single nginx). Required for correct client-IP rate limiting behind a reverse proxy; raise it if you add more proxies.
- `RATE_LIMIT_MAX` (S16) — global limiter ceiling per window. Default `300`.
- `RATE_LIMIT_WINDOW_MS` (S16) — global limiter window in ms. Default `900000` (15 min). The auth limiter (10 / 15 min, ADR-016) is separate and not env-tunable.
- `SHUTDOWN_TIMEOUT_MS` (S16) — bounded graceful-shutdown window. Default `8000`.

## Client build (Docker)
- `VITE_API_URL` — baked at build time. Production/container builds use `/api` (same-origin through nginx, ADR-042); local dev uses the dev API URL.

## Cloudinary
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `UPLOAD_PROVIDER` — `fake` (default; in-memory registry for development/tests, ADR-035) or `cloudinary` (signed raw uploads via native `fetch`, no SDK). Configuration errors throw at upload call time, never at boot — the rest of the platform keeps serving with unread media routes.

## Email
- `EMAIL_PROVIDER` — `fake` (default; in-memory log for development/tests) or `resend` (Resend HTTP API via native `fetch`, no SDK).
- `EMAIL_FROM` — sender address required by the Resend path.
- `RESEND_API_KEY` — required by the Resend path; the server throws at send time when it is missing (ADR-024).

## Client
Only variables explicitly required by the frontend build should be exposed to the client, and frontend-exposed values must never contain secrets.

## Rules
- Commit `.env.example`.
- Never commit `.env`.
- Never paste secret values into documentation.

## Authentication secrets (S4)
- `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` are both required and must be different values.
- No defaults and no fallbacks: the server fails fast at startup if either is missing.
- Never commit real values; `.env.example` contains placeholders only.

## Development seed identities (S4)
- Development accounts are seeded by `server/scripts/seed/users.js`, which is the single source of truth for these identities. `server/scripts/seed/properties.js` invokes it, so `npm run seed` in `server/` seeds users and properties together.
- S4.1 provides a production-guarded dev user seed with fixed ids: agent `64b000000000000000000001` (matches every seeded `Property.agent` reference), admin `64b000000000000000000002`, optional buyer `64b000000000000000000003`.
- Dev-only identities use the reserved `.test` email TLD and must never be provisioned in production.
- Production agent/admin accounts are provisioned by the future controlled admin mechanism — never through public registration or the dev seed.

**Development / QA only** — seeded login credentials:

| Role | Development email | Development password |
|---|---|---|
| Admin | `admin@homehunt.test` | `DevPassword123!` |
| Agent | `agent@homehunt.test` | `DevPassword123!` |
| Buyer | `buyer@homehunt.test` | `DevPassword123!` |

These credentials exist only in local development databases seeded by `server/scripts/seed/users.js`. They are not production credentials and must never be provisioned in, or relied upon by, a production environment.
