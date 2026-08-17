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
