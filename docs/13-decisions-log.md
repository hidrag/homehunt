# HomeHunt — Architecture Decision Log

## ADR-001 — Repository structure
Status: Accepted
Decision: Use one Git repository containing separate `client/` and `server/` applications.
Reason: Simple for a solo developer, clear separation of frontend/backend, easy deployment, and compatible with AI coding agents.

## ADR-002 — Image storage
Status: Accepted
Decision: Cloudinary.
Reason: Image optimization, transformations, CDN delivery, responsive image support and manageable media workflows.

## ADR-003 — Authentication
Status: Accepted
Decision: JWT authentication using HTTP-only secure cookies.
Reason: Better security posture than storing authentication tokens in localStorage.

## ADR-004 — Maps
Status: Accepted
Decision: Leaflet.js with OpenStreetMap initially.
Reason: Suitable for the portfolio project, flexible and avoids unnecessary dependence on a paid maps API.

## ADR-005 — State management
Status: Accepted
Decision: Redux Toolkit for genuinely shared application state; local state for component UI; React Hook Form for form state.
Reason: Prevent global-state sprawl while retaining predictable shared state.

## ADR-006 — Realtime messaging
Status: Accepted
Decision: Socket.io with conversation-based rooms.
Reason: A property may have multiple independent buyer-agent conversations.

## ADR-007 — Direct Leaflet integration without react-leaflet
Status: Accepted
Decision: Use the core `leaflet` npm package directly in React `useEffect` instead of `react-leaflet`.
Reason: `react-leaflet` has known compatibility and lifecycle hurdles with React 19 and React StrictMode (double-mounting triggering "Map container is already initialized"), and Vite bundling issues. Direct integration allows explicit teardown (`map.remove()`), custom SVG marker injection without asset URL resolution failures, and minimal dependency overhead.
Date: Sprint 3
Affected areas: `client/src/components/ui/PropertyMap.jsx`, `client/package.json`

## ADR-008 — In-house PropertyGallery component
Status: Accepted
Decision: Build a focused, lightweight in-house gallery component rather than pulling in external slider/lightbox libraries (e.g. Swiper, Embla, Yet Another React Lightbox).
Reason: Reduces bundle weight, avoids third-party CSS collisions with Tailwind v4, provides exact control over keyboard accessibility (`ArrowLeft`, `ArrowRight`, `Home`, `End`), provides defensive image error handling, and fulfills all S3 requirements without library bloat.
Date: Sprint 3
Affected areas: `client/src/components/ui/PropertyGallery.jsx`, `client/src/pages/ListingDetail.jsx`

## ADR-009 — Design system styling with Tailwind CSS v4 & Lucide React
Status: Accepted
Decision: Use Tailwind CSS v4 CSS-first configuration and Lucide React icons for all UI components, keeping `components.json` clean without legacy `tailwind.config.js` references.
Reason: Tailwind CSS v4 eliminates the legacy JavaScript configuration file in favor of CSS theme variables. All components are built with accessible, cohesive utility classes and standard Lucide icons.
Date: Sprint 3
Affected areas: `client/src/components/ui/*`, `client/components.json`, `client/src/index.css`

## ADR-010 — Remote seeded images and defensive frontend fallback handling
Status: Accepted
Decision: Seed verified, reliable HTTPS image URLs (Unsplash CDN) and implement defensive image fallback handling (`onError` state) in `PropertyCard` and `PropertyGallery`.
Reason: Cloudinary pipeline is planned for S13 user uploads. In early development sprints (S1–S3), remote URLs provide realistic property visuals. Handling load errors gracefully prevents broken image layout glitches and ensures seamless user experience even if external CDNs experience downtime.
Date: Sprint 3
Affected areas: `server/scripts/seed/properties.js`, `client/src/components/ui/PropertyGallery.jsx`, `client/src/components/ui/PropertyCard.jsx`

## ADR-011 — Single-property map scope for S3
Status: Accepted
Decision: Restrict S3 map implementation to the individual property detail view (`PropertyMap`), with `scrollWheelZoom: false`, custom pin, and external OSM link.
Reason: Multi-property map views, bounding box queries, clustering, and radius filtering belong strictly to S11 (Advanced Geo Search). S3 focuses on grounding individual property locations accurately and safely.
Date: Sprint 3
Affected areas: `client/src/components/ui/PropertyMap.jsx`, `client/src/pages/ListingDetail.jsx`

## ADR-012 — User & RBAC data model
Status: Accepted
Context: The `users` collection is declared in the schema contract, but S1–S3 deliberately shipped without a User model; `Property.agent` holds deterministic synthetic ObjectIds (`64b000000000000000000001`).
Decision: Introduce a `users` collection with `_id`, `name` (String, required, trimmed, max 120), `email` (String, required, lowercase, trimmed, unique — the unique login identity), `passwordHash` (String, required, `select: false`), `role` (enum `buyer | agent | admin`, default `buyer`), and Mongoose timestamps. Indexes: unique `email`, single `role`. No phone/avatar/bio/email-verification/session/profile fields in S4.
Alternatives considered: username-based login (rejected — no username concept in the product); profile fields now (rejected — S5/S6 scope); embedding session state in User (rejected — see ADR-013).
Consequences: New model + production-guarded dev seed with the fixed agent id, preserving every `Property.agent` reference. `passwordHash` is excluded from queries by default and stripped from serialization.
Security implications: Unique email prevents duplicate identities; `select: false` prevents accidental hash exposure; privileged roles are never self-assigned (see registration policy in `docs/06-auth-rbac.md`).
Scope: S4.1 model and seed only.
Date: Sprint 4 (S4.0)

## ADR-013 — Session / refresh-token architecture
Status: Accepted
Context: `docs/06-auth-rbac.md` mandates JWT auth, short-lived access tokens, refresh-token rotation, reuse-aware sessions, and logout invalidation of server-side state.
Decision: One login creates one refresh-token family. Sessions live in a separate `sessions` collection with `_id` (the refresh JWT `jti`), `userId`, `tokenHash` (SHA-256 of the raw refresh JWT, unique), `familyId`, `expiresAt` (issued + 7 days), `revokedAt`, and `createdAt`; indexes on `userId`, unique `tokenHash`, `familyId`, and a TTL on `expiresAt` (`expireAfterSeconds: 0`). Rotation is strict: refresh atomically claims (`revokedAt: null` → now) the presented session and creates its successor in the same family. Presenting an already-revoked token is treated as reuse: the entire family is revoked, both cookies are cleared, and `401 REFRESH_TOKEN_REUSED` is returned. Logout revokes the acting session and is idempotent. No grace window; concurrent legitimate refreshes may force re-login and are mitigated client-side with single-flight refresh coordination.
Alternatives considered: refresh state embedded in `User` (rejected — multi-device write conflicts, unbounded growth, no family semantics); stateless refresh JWTs (rejected — cannot satisfy logout invalidation or reuse detection); grace windows (rejected — weaken replay detection); `replacedBy`/`lastUsedAt` fields (rejected — unused by any security decision).
Consequences: `sessions` joins the collections list in `docs/04-database-schema.md`; strict rotation behavior is documented for users of the API; MongoDB TTL provides cleanup without application jobs.
Security implications: Server-side invalidation is authoritative; database compromise yields only hashes; reuse of a stolen rotated token kills the whole family; only userId/familyId/timestamp may be logged.
Scope: S4.1 session model, refresh/logout endpoints, and auth middleware integration.
Date: Sprint 4 (S4.0)

## ADR-014 — Cookie & CSRF posture
Status: Accepted
Context: ADR-003 mandates HTTP-only cookies. Development is cross-origin but same-site (`localhost:5173` → `localhost:5000`); production is assumed same-site. Axios already sends credentials and CORS is configured with an exact `CLIENT_URL` origin plus `credentials: true`.
Decision: Two cookies — `hh_access` (Max-Age 900) and `hh_refresh` (Max-Age 604800) — both HttpOnly, `Path=/`, `SameSite=Lax`; `Secure` only when `NODE_ENV=production`. Logout clears both. JWTs are never placed in localStorage, sessionStorage, or the Redux store. CSRF posture is SameSite=Lax plus exact-origin CORS; no CSRF library and no double-submit token in S4.
Alternatives considered: `SameSite=Strict` (rejected — unnecessary friction for this app); `SameSite=None; Secure` (rejected — requires a genuinely cross-site deployment and is the weaker CSRF posture); double-submit CSRF tokens (rejected — redundant while Lax and exact-origin CORS hold).
Consequences: Cookie names, flags, and max-ages become part of the API contract; any change of production topology must revisit this ADR.
Security implications: HttpOnly prevents JavaScript token theft but is explicitly **not** the CSRF defense; Lax blocks cross-site credential attachment; CORS must never be loosened to `*` (which would also break `credentials: true`).
Scope: S4.1 cookie helpers and all auth endpoints; documented in `docs/11-security-rules.md`.
Date: Sprint 4 (S4.0)

## ADR-015 — Authentication dependencies
Status: Accepted
Context: `docs/06-auth-rbac.md` mandates bcrypt password hashing; ADR-003 mandates JWT authentication. The server currently has no authentication dependencies, and `docs/00-ai-rules.md` requires justification for every new package.
Decision: Add `bcrypt` (bcrypt hashing) and `jsonwebtoken` (HS256 JWT signing/verification). Do not add `cookie-parser` — Express's built-in `res.cookie()`/`clearCookie()` plus a small `req.headers.cookie` parse cover both cookies. Do not add uuid, CSRF, or lockout libraries.
Alternatives considered: `cookie-parser` (rejected — unnecessary for two named cookies, avoids an extra dependency); `bcryptjs` (not chosen as primary; acceptable only as an explicitly reported fallback if native `bcrypt` fails to build on Node 24 — substitution requires stopping and reporting first, never a silent switch); RS256 (rejected — no key-distribution need; symmetric secrets already defined by `docs/12-environment-config.md`).
Consequences: Two new production dependencies; CI must build native `bcrypt` on Node 24 before auth code lands.
Security implications: bcrypt cost 10 for hashing; JWT signing uses the two distinct secrets; no other crypto surface is introduced.
Scope: S4.1 installation and usage only.
Date: Sprint 4 (S4.0)

## ADR-016 — Authentication rate-limit posture
Status: Accepted
Context: The application has a global limiter (100 requests / 15 minutes / IP) and `docs/11-security-rules.md` requires tighter rate limiting on authentication-sensitive endpoints.
Decision: Add a dedicated limiter for `POST /api/auth/register`, `POST /api/auth/login`, and `POST /api/auth/refresh` at 10 requests / 15 minutes / IP, returning `429` with the standard `RATE_LIMITED` error envelope. `logout` and `/me` remain under the global limiter. No account lockout and no failed-login persistence in S4.
Alternatives considered: account lockout (rejected for S4 — persisted failure state, admin-unlock flows, and UX burden not required by any governance document); per-email limiting (rejected for S4 — adds storage and complexity; IP limiting plus bcrypt cost is the deliberate posture); extending the global limiter (rejected — it is too loose for auth endpoints).
Consequences: Login/register/refresh share one limiter instance; values are centralized in S4.1 auth configuration.
Security implications: Bounded brute-force attempts per IP; no user-enumeration advantage; revisit at S16 with evidence if stronger protection is warranted.
Scope: S4.1 `app.js` limiter wiring and auth routes.
Date: Sprint 4 (S4.0)

## Change policy
New architectural decisions must be appended here with:
- ADR number
- status
- decision
- reason
- date
- affected areas where useful
