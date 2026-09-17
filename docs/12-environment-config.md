# HomeHunt — Environment Configuration

This document defines expected configuration names. Actual secrets must never be committed.

## Server
- `NODE_ENV`
- `PORT`
- `CLIENT_URL`
- `MONGODB_URI`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`

## Cloudinary
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

## Email
Provider-specific variables will be added after the email provider is selected and recorded in the decisions log.

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
- S4.1 provides a production-guarded dev user seed with fixed ids: agent `64b000000000000000000001` (matches every seeded `Property.agent` reference), admin `64b000000000000000000002`, optional buyer `64b000000000000000000003`.
- Dev-only identities use the reserved `.test` email TLD and must never be provisioned in production.
- Production agent/admin accounts are provisioned by the future controlled admin mechanism — never through public registration or the dev seed.
