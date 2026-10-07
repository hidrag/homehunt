# HomeHunt — Security Rules

## Authentication
- HTTP-only secure cookies.
- Strong password hashing.
- Short-lived access tokens.
- Refresh token rotation.
- Rate limiting on authentication-sensitive endpoints.

## Authentication tokens (S4)
- JWT (HS256) only; verification whitelists HS256 and validates the issuer. Secrets `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` are distinct, have no defaults or fallbacks, and the server fails fast when either is missing.
- Access token: 15 minutes; claims `sub`, `role`, `iat`, `exp`, `iss: "homehunt"`. Refresh token: 7 days; claims `sub`, `jti`, `sid`, `iat`, `exp`, `iss: "homehunt"`; `jti` maps to the session `_id`.
- Session state is server-side (`sessions` collection) with SHA-256 token hashes and a TTL on `expiresAt`.
- Cookies: `hh_access` / `hh_refresh` — HttpOnly, `Path=/`, `SameSite=Lax`, `Secure` in production only, Max-Age 900 / 604800. JWTs are never stored in localStorage or sessionStorage.
- Rotation is strict (no grace window). Reuse of a rotated refresh token revokes the entire family, clears both cookies, returns `401 REFRESH_TOKEN_REUSED`, and logs only userId / familyId / timestamp. Logout revokes the acting session and is idempotent.
- Passwords: bcrypt cost 10; length 8–72; no complexity classes. Login returns a single `401 INVALID_CREDENTIALS` for both unknown email and wrong password and performs a dummy bcrypt comparison for unknown emails.
- Auth endpoints are rate limited (10 requests / 15 minutes / IP → `429 RATE_LIMITED`). No account lockout and no failed-login persistence in S4.
- CSRF: SameSite=Lax plus exact-origin CORS (`CLIENT_URL`, `credentials: true`, never `*`) is the S4 posture. HttpOnly blocks JavaScript access to cookies but is **not** the CSRF defense. Revisit if production ever uses distinct registrable domains.
- Logging: never log tokens, cookies, passwords, or `passwordHash`.

## Authorization
- Enforce roles on the backend.
- Enforce resource ownership for agent-owned resources.
- Never trust frontend role checks.

## Input
- Validate all client input.
- Sanitize where appropriate.
- Never build unsafe database queries from raw user input.

## Secrets
Never commit:
- JWT secrets
- database credentials
- Cloudinary secrets
- email credentials
- API keys that must remain private

Use environment variables.

## Email (S8)
- `EMAIL_PROVIDER` selects the adapter: `fake` (default; in-memory log, used by development and all tests) or `resend` (Resend HTTP API via native `fetch`; no SDK dependency — ADR-024).
- The Resend path requires `RESEND_API_KEY` and `EMAIL_FROM`; missing configuration throws at send time (never at boot), so visit CRUD stays available even with a broken provider.
- Sending is best-effort: provider errors are logged as `[VISIT_EMAIL_ERROR] <message>` and are never mapped to HTTP responses; the committed DB mutation always stands.
- Recipients are always derived from persisted `User` documents; request-body fields named `email`/`to` are never read for routing.
- All user-controlled values interpolated into email HTML are escaped with the shared `escapeHtml` helper (`server/src/services/email/visit.templates.js`) — regression-tested against `<script>` and attribute-breakout payloads.

## Realtime / WebSocket (S9)
- Socket.io handshakes authenticate with the same `hh_access` cookie as REST (`verifyAccessToken`, HS256 + issuer whitelist). Missing/invalid tokens are rejected with an `AUTH_UNAUTHORIZED` connect error — **no unauthenticated socket ever attaches**.
- Room membership is never trusted from client input: `conversation:join` re-reads the conversation from MongoDB and admits only `buyer`/`agent` participants. Non-participants receive `NOT_FOUND` and are disconnected, so room existence is not enumerable (mirrors the REST 404-not-403 guard). Admins are participants of no conversation and are rejected identically — they audit over REST only.
- Message sending is **REST-only** (ADR-026). There is no client-to-server message event, so message validation, authorization and rate limiting live on exactly one path and cannot be bypassed over the socket. `message:new` is emitted only after the DB write resolves (persistence-first).
- Sockets do not bypass the global HTTP rate limiter because they never carry message mutations; connect/join churn is bounded by handshake authentication and the per-socket join handler.
- Message bodies are never logged. No secrets, tokens or cookies are logged on the socket path.
- Single-process boundary: the default in-memory Socket.io adapter (ADR-028). Multi-instance deployment requires the Redis adapter before horizontal scaling — recorded for S16.

## Saved searches & notifications (S10, ADR-029/ADR-030)
- Saved criteria are **typed, whitelisted sub-fields — never Mongo query fragments**. The filter is rebuilt from typed fields at every execution via the shared `lib/propertyFilters.js` builder, so a criteria document tampered with out-of-band still cannot produce operator-shaped queries (`$where`, `$regex` payloads cannot execute). Only the builder emits operators; unknown keys are ignored; city matching goes through `escapeRegex`.
- Saved-search authority: buyer-only, owner-scoped (`404` for non-owners), 20-active cap per user. Notification authority: strictly personal inboxes — every operation is recipient-scoped with `404` on miss; no admin cross-user view.
- Notification recipients are always **server-derived from persisted event participants** (never request input, ADR-024 recipient rule). Notification titles/bodies are server-authored template text; client click-through maps `resourceRef.kind/id` through a fixed switch — no server-stored URLs are rendered (no open-redirect surface).
- Delivery failure isolation: notification/email/sweep failures are logged (`[NOTIFY_ERROR]`/`[MATCH_ERROR]`) and never abort or roll back the primary mutation (property creation, visit transition, inquiry, message send). Provider errors are never returned to the client.
- Socket delivery: authenticated sockets auto-join `user:${socket.user.id}` from the verified handshake token (no client-supplied room names — no join-authorization surface). `notification:new` is emitted only after the Notification document persists.
- Notification bodies are never logged; emails use the shared `escapeHtml` templates.

## Geospatial queries (S11, ADR-031)
- Geo query parameters are **strict-validated, then decomposed**: only individually validated finite scalars ever enter a Mongo operator. Client-supplied documents/objects can never reach `$geoWithin` — operator-shaped payloads through `lat`/`lng`/`radiusKm`/`bounds` fail the scalar type check first.
- **Malformed geo input is rejected `400 GEO_INVALID`, never ignored** (deliberate asymmetry with lenient S2 enum ignores): a partially-malformed viewport must never silently degrade into an unbounded spatial scan (COLLSCAN/memory-exhaustion defense). Radius is capped at 100 km; antimeridian-crossing boxes rejected; ranges [-90,90] / [-180,180].
- Saved geo criteria re-validate and rebuild the filter at every execution (ADR-029 rebuild-at-execute extended to geo), so a tampered SavedSearch document still cannot yield an operator-shaped geo query.
- Maps render OSM tiles with required attribution; popup content uses DOM `textContent` only (never `innerHTML`); no new map dependencies (no markercluster, no react-leaflet — per ADR-007/ADR-032).

## Uploads
Validate:
- file type
- file size
- upload purpose
- ownership/authorization

## Documents
Legal/property documents are sensitive. Do not expose unrestricted public URLs.

## Web security
Use appropriate:
- CORS configuration
- Helmet/security headers
- rate limiting
- secure cookie configuration
- error handling that does not leak secrets or stack traces in production
