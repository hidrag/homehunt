# HomeHunt — Current Sprint

## Sprint
S4 — Authentication & RBAC

## Status
[x] Complete (Ready for human review) — S4.0 (Architecture & Decision Lock) and S4.1 (Implementation) complete.

## Goal
Introduce server-authoritative authentication and role-based access control: a `User` identity, session-backed JWT access/refresh authentication delivered via HTTP-only cookies, and reusable authorization middleware — without changing public property browsing or any S1–S3 behavior.

## S4.0 — Approved architecture (completed)
- Decision source: `.kilo/plans/S4-architecture-decision-lock.md` (owner-approved); recorded as ADR-012…ADR-016 in `docs/13-decisions-log.md`.
- User: `users` collection — `name`, `email` (unique login identity), `passwordHash` (`select: false`), `role` (`buyer | agent | admin`, default `buyer`), timestamps. No profile/verification fields in S4.
- Sessions: separate `sessions` collection — `userId`, SHA-256 `tokenHash` (unique), `familyId`, `expiresAt` (TTL), `revokedAt`, `createdAt`.
- Tokens: HS256 JWTs in HTTP-only cookies `hh_access` (15 minutes) and `hh_refresh` (7 days); distinct secrets; strict refresh rotation, reuse detection, family revocation; logout invalidates the acting session.
- Middleware: `requireAuth` (access cookie → `req.user = { id, role }`) and `requireRole(...)` between routes and controllers; ownership convention `requireOwnership(resource, ownerField)` documented for future resources.

## S4.1 — Implementation objectives (completed)
- [x] Add `bcrypt` and `jsonwebtoken` (approved; native bcrypt compiled cleanly).
- [x] `User` and `Session` models with the approved fields and indexes.
- [x] Auth service: register (buyer only), login (no enumeration), refresh (strict rotation), logout (idempotent), me.
- [x] `requireAuth` / `requireRole` middleware and session cookie helpers.
- [x] Auth routes/controller per the `docs/05-api-contract.md` contract; dedicated auth rate limiter.
- [x] Production-guarded dev user seed with fixed ids (agent `64b000000000000000000001`). Development/QA login credentials are documented in `docs/12-environment-config.md`.
- [x] Client: login/register forms (React Hook Form + Yup), auth state in Redux (user object only — tokens never leave cookies), single-flight refresh coordination in the Axios interceptor, UX-only route guard.
- [x] Backend auth test suites; all 34 existing S1/S2/S3 tests remain unmodified and green (53 total tests passing).

## Explicitly out of scope (S5+)
- Bookmarks, saved searches, inquiries/contact-agent, chat, notifications.
- Agent dashboards/profiles, listing CRUD, image uploads/Cloudinary.
- Admin moderation and user management (S7), visit scheduling and email (S8), advanced geo search (S11), neighborhood explorer (S12), documents/verification/virtual tours (S13), mortgage/comparison/analytics (S14), PWA (S15), E2E framework (S16), recommendations (S17).
- No auth retrofit on `GET /api/properties` or `GET /api/properties/:id`; no `Property.agent` population; no client test framework.

## Acceptance criteria (met by S4.1)
- [x] Public registration always creates `buyer`; a supplied `role` is ignored.
- [x] Login returns identical `401 INVALID_CREDENTIALS` for unknown email and wrong password.
- [x] Access token 15 minutes, refresh token 7 days; both delivered as HttpOnly cookies per `docs/05-api-contract.md`.
- [x] Refresh rotates strictly; reuse revokes the family and returns `401 REFRESH_TOKEN_REUSED`; logout is idempotent and clears both cookies.
- [x] `requireAuth` returns `401 UNAUTHORIZED` for missing/invalid/expired access tokens; `requireRole` returns `403 FORBIDDEN`.
- [x] Auth endpoints are rate limited (10 requests / 15 minutes / IP) with `429 RATE_LIMITED`.
- [x] No password, token, or hash material appears in API responses or logs.
- [x] Server `npm test` + `npm run lint` and client `npm run lint` + `npm run build` pass; the 34 existing tests are unmodified and green.

## Testing expectations
- Jest + Supertest + `mongodb-memory-server`; planned suites `auth.test.js` and `auth.mongo.test.js` (coverage list in `docs/10-testing-strategy.md`).
- Client: manual QA only (no client test framework), plus `oxlint` and a production build check.

## Security expectations
- All rules in `docs/11-security-rules.md`.
- CSRF posture: SameSite=Lax + exact-origin CORS; HttpOnly is not credited as the CSRF defense.
- Frontend guards are UX only; server-side authorization is authoritative.
