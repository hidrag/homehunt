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

## ADR-017 — Bookmark data architecture and hydration pattern
Status: Accepted
Decision: Model bookmarks as an explicit `(user, property)` collection with a unique compound index `{ user: 1, property: 1 }` and ordering index `{ user: 1, createdAt: -1 }`. Hydrate client-side saved state using a dedicated, lightweight endpoint (`GET /api/bookmarks/ids`) returning only property ID strings, stored in Redux with optimistic UI toggles and per-property in-flight guards.
Reason: Prevents duplicate bookmarks at the database constraint level. Using a lightweight IDs endpoint avoids fetching full property documents across pages, preventing unnecessary payload overhead while providing cross-component bookmark state (cards, detail view, header count).
Date: Sprint 5
Affected areas: `server/src/models/Bookmark.js`, `server/src/services/bookmark.service.js`, `client/src/features/bookmarks/bookmarksSlice.js`, `client/src/components/ui/BookmarkButton.jsx`

## ADR-018 — Buyer inquiries and server-authoritative agent derivation
Status: Accepted
Decision: Persist buyer inquiries in an `inquiries` collection referencing property, buyer, and agent. In `POST /api/inquiries`, the `buyer` is strictly bound to `req.user.id`, and `agent` is derived server-side from `Property.findById(propertyId).agent`. The client cannot specify `buyer`, `agent`, or `status` (which is forced to `'pending'`).
Reason: Critical authorization and integrity rule: buyers must never be allowed to route an inquiry to arbitrary agents or impersonate other users. Deriving the agent server-side ensures authoritative routing and prevents data tampering.
Date: Sprint 5
Affected areas: `server/src/models/Inquiry.js`, `server/src/services/inquiry.service.js`, `server/src/controllers/inquiry.controller.js`, `client/src/pages/MyInquiries.jsx`

## ADR-019 — requireOwnership middleware and S6 ownership enforcement
Status: Accepted
Decision: Implement the documented `requireOwnership(resource, ownerField)` convention as `server/src/middlewares/ownership.middleware.js`. It loads the target document by `req.params.id`, validates the ObjectId (`400 INVALID_ID`), returns `404 NOT_FOUND` for unknown documents, and compares `resource[ownerField]` with `req.user.id` (`403 FORBIDDEN` otherwise). `allowAdmin: true` lets admins bypass the comparison. The loaded document is forwarded as `req.resource` so controllers and services never re-query.
Reason: docs/03-architecture.md mandated the convention; docs/06-auth-rbac.md grants agents "Create/Edit own property" and admins "Edit any property". Centralizing the check prevents per-route authorization drift.
Date: Sprint 6
Affected areas: `server/src/middlewares/ownership.middleware.js`, `server/src/routes/property.routes.js`, `server/src/routes/inquiry.routes.js`

## ADR-020 — Property delete semantics
Status: Accepted
Decision: `DELETE /api/properties/:id` deletes the property and removes bookmarks referencing it; inquiries are retained as business records (their property population resolves to null).
Reason: Bookmarks are pure references with no standalone value once the listing is gone; inquiries are communication history that must survive listing removal.
Date: Sprint 6
Affected areas: `server/src/services/property.service.js`

## ADR-021 — Admin provisioning and role management
Status: Accepted
Decision: Agent/admin accounts are created exclusively through `POST /api/admin/users` (admin-only, role whitelisted to `agent`/`admin`, whitelist-sanitized payload, bcrypt via the existing password utility, no session issued to the provisioned account). Role changes go through `PATCH /api/admin/users/:id/role` (admin-only, role whitelisted to `buyer`/`agent`/`admin`, target id validated, self-role-change rejected `403`, last-admin demotion rejected `403` server-side by counting admins before the write). Public `POST /api/auth/register` remains buyer-only and is not modified. Existing JWT semantics are preserved: the access token's `role` claim is honored until it expires (15 min) and refresh reissues the current role; sessions are not force-revoked on role change.
Reason: docs/06-auth-rbac.md reserved "the future controlled admin mechanism (S7)" for provisioning. Centralizing provisioning/role mutation in one admin-only route pair keeps privilege changes auditable at one authorization gate, prevents registration role injection, and the self-demotion/last-admin guards prevent lockout of the platform's admin capability. Bounded-staleness role claims are the already-accepted S4 model (ADR-012/015); force-revocation would require session-store coupling deliberately deferred.
Date: Sprint 7
Affected areas: `server/src/services/admin.service.js`, `server/src/controllers/admin.controller.js`, `server/src/routes/admin.routes.js`, `client/src/pages/Admin.jsx`

## ADR-022 — Visit scheduling domain and state machine
Status: Accepted
Context: The product spec requires buyers to request property viewing appointments and agents to manage them (`Schedule Visit` journeys). Related S8 decisions: ADR-023 (conflict protection), ADR-024 (email), ADR-025 (deletion semantics).
Decision: Visits are persisted in a `visits` collection with `property`, `buyer`, `agent` (ObjectIds), `startAt`/`endAt` (UTC `Date`), `timezone` (IANA name; default `Asia/Kolkata`; legacy alias `Asia/Calcutta` normalized on write), `status`, optional trimmed `note` (≤2000), and `cancelledAt`/`cancelledBy` audit fields. Appointment duration is **derived** from `endAt - startAt`, never stored. Accepted creation window: future start, duration 30–120 minutes inclusive, start within 30 days; timestamps must carry an explicit zone designator (`Z` or `±HH:MM`). Lifecycle: `pending → confirmed | declined | cancelled`; `confirmed → completed | cancelled`; `declined`/`cancelled`/`completed` are terminal. Role ceilings: buyers may only cancel their own visits (anything else is `409`); the owning agent may confirm/decline (from `pending`) and complete/cancel (from `confirmed`); admins drive the **same** state machine on any visit via explicit `PATCH /api/admin/visits/:id/status` — there is deliberately no admin transition bypass. Creation derives `agent` from `Property.agent` and forces `status: pending`; client-supplied `buyer`, `agent`, `status`, `cancelledAt`, `cancelledBy` are ignored (ADR-018 pattern extended). Routes: `POST /api/visits` and `GET /api/visits` are buyer-role only; `GET /api/visits/agent` is agent-role only; `PATCH /api/visits/:id/status` is buyer|agent (admins get `403` on this shared route and must use the admin route); admin routes live under `/api/admin/visits`.
Alternatives considered: storing local wall-clock time (rejected — DST and re-interpretation ambiguity; UTC instant + IANA zone preserves display intent); persisting `duration` (rejected — redundant derivable state that can desynchronize); letting buyers confirm (rejected — the appointment is the agent's decision); an admin state-machine bypass (rejected — moderation must not create impossible lifecycle states; considered harmful because it lets arbitrary status graphs through the API).
Consequences: status vocabulary and the transition table become part of the API contract; the frontend action matrix must mirror the server table exactly; `duration` exists only as a presentation computation.
Security implications: server-derived ownership prevents visit hijacking; cross-owner access returns `404` (not `403`) so visit existence is not enumerable.
Scope: S8 visit domain, routes, and dashboard tabs.
Date: Sprint 8
Affected areas: `server/src/models/Visit.js`, `server/src/services/visit.service.js`, `server/src/controllers/visit.controller.js`, `server/src/routes/visit.routes.js`, `server/src/routes/admin.routes.js`

## ADR-023 — Visit duplicate and conflict protection
Status: Accepted
Decision: Two layers. (1) **Identical-slot duplicate**: a unique partial index on `{ buyer, property, startAt, endAt }` filtered to `status ∈ {pending, confirmed}` plus a pre-insert existence check; both paths return `409 DUPLICATE_VISIT` (duplicate-key error 11000 is mapped to the same code). Terminal states (declined/cancelled/completed) fall out of the partial filter, so a buyer may re-request the same slot after the previous request is dead. (2) **Agent calendar conflict**: confirming a visit (agent **or** admin) checks for any `confirmed` visit of the same agent with `startAt < newEnd && endAt > newStart` (strict inequality — back-to-back appointments that merely touch at the boundary are allowed) and returns `409 SCHEDULE_CONFLICT`. Confirmation runs under an in-process per-agent async mutex: a promise "tail" map keyed by agent id serializes the entire check-then-confirm critical section, and the visit is re-fetched **after** lock acquisition with an unchanged-status check (TOCTOU guard). The conflict check applies only to confirmation, never to creation: pending overlaps are allowed to queue.
Reason: A buyer must never accumulate two live requests for the exact same slot, and an agent must never hold two overlapping confirmed appointments. The unique partial index is the only duplicate guarantee that survives concurrent requests; interval overlap is not expressible as a MongoDB index, so the check needs serialization. MongoDB standalone (dev + CI memory servers) provides no multi-document transactions, so an app-level serialized critical section is the honest guarantee in single-process deployments.
Alternatives considered: multi-document transactions (rejected — unavailable on standalone, and `mongodb-memory-server` default is standalone; revisit when production topology is replica-set); interval-extension or materialized slot table (rejected — operational complexity far beyond S8 scale); letting the last concurrent writer win (rejected — double-booking is the one scheduling failure that must be impossible).
Consequences: both confirmation paths (shared and admin routes) share literally the same service function and therefore the same lock; the release runs in `finally`, and the tail map entry is removed when the queue drains (verified by tests).
Security implications: prevents both double-booking races and duplicate-request spamming without leaking other users' calendar contents (the conflict error names only the caller's own failure).
Known limitation: the mutex is per-process. A multi-instance deployment requires either a replica set (transactional check-and-set) or a shared lock service before horizontal scaling; recorded for S16.
Scope: S8 create/confirm paths.
Date: Sprint 8
Affected areas: `server/src/models/Visit.js` (index), `server/src/services/visit.service.js`

## ADR-024 — Resend email adapter and failure semantics
Status: Accepted
Context: S8 notifications are transactional visit emails. The architecture doc reserved provider selection for an ADR; dependency discipline (docs/00) forbids unnecessary packages.
Decision: `server/src/services/email.service.js` exposes `sendEmail({ to, event, visit })`. `EMAIL_PROVIDER` switches adapters: `fake` (default; an in-memory `sentEmails` log used by development and every test) and `resend` (Resend HTTP API `POST https://api.resend.com/emails` via Node's native `fetch` — no SDK added). The Resend path requires `RESEND_API_KEY` and `EMAIL_FROM` and throws on missing configuration; responses ≥400 throw. **Failure semantics**: sending is best-effort — `notify()` catches per-recipient errors, logs only `[VISIT_EMAIL_ERROR] <message>`, and the DB mutation already committed stands; provider errors are never mapped to HTTP responses. **Recipient derivation**: every recipient address comes from populated persisted `User` documents (`buyer.email`, `agent.email`); request-body fields named `email`/`to` are never read for routing. **Templates**: a single shared `escapeHtml` escaper is applied to every user-controlled value (property title, note) before interpolation; subject lines are fixed per event. Event matrix (ADR-022 lifecycle): requested → buyer + agent; confirmed → buyer; declined → buyer; buyer_cancelled → agent; agent_cancelled → buyer; completed → none; admin cancellation → none (operational action, no notification contract).
Alternatives considered: nodemailer/SMTP (rejected — provider lock-in and credential surface without a provider decision); Resend SDK package (rejected — native fetch covers one POST, avoids a dependency per docs/00); aborting the visit mutation when email fails (rejected — the schedule change is authoritative; notifications are secondary); an outbox/queue (deferred to S10's notification engine where delivery guarantees actually become a product requirement).
Consequences: email behavior is fully observable in tests via `fakeEmailProvider` (recipients, event, content); production misconfiguration fails loudly at send time, not at boot, so visit CRUD stays available even with a broken provider.
Security implications: no client control over recipient/sender/provider/key; secrets exist only in server-environment variables; template output is HTML-escaped against `<script>` and attribute-breakout payloads (regression-tested).
Scope: S8 email for the visit lifecycle only; transactional email beyond visits reuses this adapter.
Date: Sprint 8
Affected areas: `server/src/services/email.service.js`, `server/src/services/email/visit.templates.js`, `server/.env.example`, `server/src/services/visit.service.js`

## ADR-025 — Historical visit references after property deletion
Status: Accepted
Context: ADR-020 established that property deletion removes bookmark references but retains inquiries as business records. Visits sit between the two: an appointment is a real-world commitment involving people, not a pointer.
Decision: `DELETE /api/properties/:id` does **not** cascade to visits. Retained visits populate `property` to `null`; UI renders "Listing no longer available" for the null case. A `pending` visit whose property was deleted can never be confirmed (`409 PROPERTY_UNAVAILABLE` at confirm time re-reads the property) but remains cancellable. A historical `confirmed` visit stays manageable (complete/cancel) even after deletion — the agent's calendar stays correctable.
Reason: completed and cancelled appointments are historical facts used for records and disputes; silently deleting them would destroy the audit trail, and confirming against a vanished listing would be nonsensical, hence the confirm-time property re-check.
Alternatives considered: cascade delete (rejected — history loss); hard-block all transitions on missing property (rejected — agents could not close out stale confirmed appointments).
Consequences: all visit consumers must tolerate `property: null`; the admin and agent lists surface the null case; list responses keep working with zero property joins.
Scope: S8; same pattern extends to future domains referencing Property.
Date: Sprint 8
Affected areas: `server/src/services/visit.service.js`, `server/src/services/property.service.js` (unchanged deletion, verified), `client/src/pages/Visits.jsx`, `client/src/pages/AgentDashboard.jsx`, `client/src/pages/Admin.jsx`

## ADR-026 — Socket.io handshake & REST-only send architecture
Status: Accepted
Context: ADR-006 mandated Socket.io with conversation-based rooms; `docs/03-architecture.md` reserved the realtime transport. The Express app was previously bound with `app.listen()`, which yields no HTTP server handle for Socket.io attachment. Every prior sprint established REST as the authoritative mutation path with server-derived metadata.
Decision: `server/src/server.js` builds `http.createServer(app)` and attaches a Socket.io server with CORS matching `CLIENT_URL` and `credentials: true`; the HTTP server (not the Express app) is what listens. Handshake authentication runs in `server/src/sockets/auth.middleware.js`: the `hh_access` cookie is parsed from the handshake headers and verified with the existing `verifyAccessToken` (HS256 + issuer whitelist, same as `requireAuth`), populating `socket.user = { id, role }`; failures reject the connection with an `AUTH_UNAUTHORIZED` connect error, so **no unauthenticated socket ever attaches**. Message **sending is REST-only**: `POST /api/conversations/:id/messages` validates, persists, then emits `message:new` through `server/src/sockets/registry.js` (`emitToConversation`). Clients emit only `conversation:join` / `conversation:leave`. The registry keeps the live `io` instance module-level and its emit helpers are no-ops when no socket server exists, so `app`-only contexts (supertest suites, unit tests) run the identical REST code path without a socket server.
Alternatives considered: client-to-server `message:send` socket events (rejected — duplicates validation and rate limiting on a second path, and enlarges the spoofed-sender/timestamp attack surface for no product gain at this scale); importing `server.js` from services (rejected — couples the service layer to the bootstrap and breaks `app`-only test contexts); `app.set('io', io)` (rejected in favour of an explicit registry module — a string-keyed container is not an import surface).
Consequences: `server.js` becomes the only place that constructs the HTTP server; `socket.io` is a server production dependency and `socket.io-client` a server dev dependency (socket tests only); the client adds `socket.io-client`.
Security implications: socket identity derives from the same signed access cookie as REST; room membership is never trusted from client input (see ADR-027/028); emit helpers cannot leak to unjoined sockets.
Date: Sprint 9
Affected areas: `server/src/server.js`, `server/src/sockets/auth.middleware.js`, `server/src/sockets/registry.js`, `server/src/services/conversation.service.js`, `server/package.json`, `client/package.json`

## ADR-027 — Conversation & Message data model (property-bound, append-only)
Status: Accepted
Context: `docs/04-database-schema.md` declared `conversations` and `messages` collections without field definitions; ADR-006's rationale ("a property may have multiple independent buyer-agent conversations") fixes property context; ADR-018 established server-derived participants for inquiry routing.
Decision: `conversations` holds `property`/`buyer`/`agent` (ObjectIds), a denormalized `lastMessage` (`{ body, sender, sentAt }`), `buyerUnread`/`agentUnread` counters, and timestamps, with indexes `{ buyer: 1, updatedAt: -1 }`, `{ agent: 1, updatedAt: -1 }` and a **unique** `{ property: 1, buyer: 1 }`. A thread is identified by `(property, buyer)`; `POST /api/conversations` is therefore idempotent — it reuses the existing thread and appends the opening message (ADR-018 pattern: `buyer` forced to `req.user.id`, `agent` derived from `Property.agent`; a concurrent open is resolved by the unique index and a duplicate-key retry). `messages` holds `conversation`, `sender` (server-derived), `body` (String, required, trimmed, 1–2000), `readAt` (nullable) and a timestamp, with index `{ conversation: 1, createdAt: 1, _id: 1 }`. The lifecycle is **strictly append-only**: no edit and no delete service surface exists, and history is ordered `createdAt DESC, _id DESC` for pagination. Property deletion never cascades: threads survive and `property` populates to `null` (ADR-020/025 extension), and messaging continues on a thread whose listing is gone.
Alternatives considered: generic (non-property) threads (rejected — ADR-006 and the product journey anchor chat to a listing); participant-pair uniqueness (`{ buyer, agent }`) (rejected — the same buyer legitimately discusses multiple listings with one agent); message edit/delete (rejected for S9 — append-only keeps ordering, receipts and the moderation surface simple); storing an explicit sequence number (rejected — `createdAt` + `_id` already give deterministic ordering everywhere in the codebase).
Consequences: the `(property, buyer)` uniqueness is the only thread-identity guarantee and survives concurrency; `lastMessage` and the unread counters are derived state maintained by the service on every write.
Security implications: participants are always server-derived; the client can never specify `buyer`, `agent`, `sender`, `readAt` or counter values.
Date: Sprint 9
Affected areas: `server/src/models/Conversation.js`, `server/src/models/Message.js`, `server/src/services/conversation.service.js`, `docs/04-database-schema.md`

## ADR-028 — Read receipts, room authorization & single-process scope
Status: Accepted
Context: Socket.io's default adapter is in-memory, matching the per-process boundary already accepted for the S8 scheduling mutex (ADR-023). Chat needs participant-only delivery and unread semantics.
Decision: Rooms are keyed `conversation:${id}` (ADR-006). `conversation:join` re-reads the conversation from MongoDB and admits the socket only when `socket.user.id` equals `buyer` or `agent`; any other socket receives `{ error: 'NOT_FOUND' }` and is **disconnected** — room existence is never enumerable, mirroring the S8 404-not-403 guard. Admins are participants of no conversation, so the same check rejects them (they audit over REST only). Read state is server-authoritative: `POST /api/conversations/:id/read` zeroes the caller's counter and stamps `readAt` on the other participant's previously-unread messages, then emits `conversation:updated`; sends emit `message:new` only after the DB write resolves (persistence-first). Unread increments use a single atomic `$inc`. The default in-memory adapter is accepted: the guarantee is single-process, and multi-instance deployment requires the Redis adapter — recorded for S16.
Alternatives considered: trusting the role claim for room membership (rejected — a token claim is not proof of participation in a specific thread); not disconnecting rejected joiners (rejected — leaves an authenticated socket attempting room enumeration); an admin observer room (rejected by the S9 locked decision — admins are read-only auditors over REST).
Consequences: both the shared and admin read paths share one service function; emit helpers are no-ops without a socket server so REST-only test contexts stay valid; socket tests boot a real server on an ephemeral port.
Security implications: delivery is participant-scoped at the database; no client-supplied room name is trusted; message bodies are never logged.
Known limitation: per-process adapter (single-instance only) — S16.
Date: Sprint 9
Affected areas: `server/src/sockets/chat.handler.js`, `server/src/services/conversation.service.js`, `docs/11-security-rules.md`

## Change policy
New architectural decisions must be appended here with:
- ADR number
- status
- decision
- reason
- date
- affected areas where useful
