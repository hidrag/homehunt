# HomeHunt — Testing Strategy

## Testing layers

### Unit & Utility
- Backend utility functions and helpers.
- Frontend pure transformation utilities (e.g., `propertyLocation.js`).

### Integration/API
- Routes, controllers, services, database queries, and error handling.
- Implemented with Jest + Supertest + mongodb-memory-server.
- Test suites:
  - `health.test.js`: System health endpoint.
  - `property.test.js`: Mocked integration tests for search, filtering, pagination, sorting, validation, and detail endpoint guarantees.
  - `property.mongo.test.js`: Real MongoDB in-memory database tests for text search, GeoJSON spatial queries, multi-filter combinations, image array ordering, and NoSQL injection security.
  - `auth.mongo.test.js`: Real MongoDB tests for User/Session schemas, registration, login (timing parity), refresh rotation, reuse detection, family revocation, logout idempotency, `/me`, and `requireRole`.
  - `auth.ratelimit.test.js`: Dedicated rate-limiter test enforcing 10 requests per 15-minute window with 429 status.
  - `bookmark.test.js`: Mocked/API integration tests for bookmark endpoints (auth, validation, idempotent create/delete, pagination, own-user scoping).
  - `bookmark.mongo.test.js`: Real MongoDB database tests for Bookmark schema, unique compound index, duplicate prevention, cross-user isolation, ordering, and hydration ID listing.
  - `inquiry.test.js`: Mocked/API integration tests for inquiry endpoints (auth, validation, server-side agent derivation, status forcing, pagination).
  - `inquiry.mongo.test.js`: Real MongoDB database tests for Inquiry schema, contact snapshot persistence, index verification, and clean error handling without orphan records.
  - `property.crud.mongo.test.js`: Real MongoDB tests for S6 listing management (create/mine/update/delete, role gates, ownership violations, validation, server-derived agent and status, cascade bookmark cleanup, agent compound index).
  - `inquiry.agent.mongo.test.js`: Real MongoDB tests for the S6 agent inbox (agent-scoped listing, property summary population, ordering, status transitions, ownership violations, pagination clamps).
  - `admin.mongo.test.js`: Real MongoDB tests for S7 admin authorization, stats, user management, provisioning, role protections, listing moderation, and cross-agent inquiry administration.
  - `visit.mongo.test.js`: Real MongoDB tests for the S8 visit domain — creation invariants and server-derived ownership, duration/horizon edge rules, timezone normalization and UTC persistence, duplicate and overlap protection, state machine and ownership (404-not-403 enumeration guard), per-agent concurrency serialization, property-deletion historical references, listing/filter/pagination conventions, the email event matrix (recipients, XSS escaping, provider-failure isolation), and the Visit index contract.
  - `visit.api.test.js`: HTTP-level S8 coverage — authentication matrices for every endpoint, buyer/agent/admin authorization, admin list/filter/pagination, lifecycle transitions, and deleted-property handling. Runs against its own app instance so the 100-request rate-limit budget is isolated from the service-level suite.
  - `conversation.mongo.test.js`: Real MongoDB tests for the S9 chat domain — creation invariants and server-derived participants, idempotent thread reuse on `(property, buyer)`, duplicate prevention under concurrency, participant scoping, 404 enumeration resistance, unread counters and read receipts, history ordering/pagination, append-only guarantees, admin audit surface, deleted-property resilience, and the Conversation/Message index contract.
  - `conversation.api.test.js`: HTTP-level S9 coverage — full 401/403 role matrices, buyer/agent participant-only access, admin read-only audit routes, input validation, and pagination conventions. Own app instance for rate-limit isolation.
  - `conversation.socket.test.js`: Real Socket.io integration against an ephemeral `http.createServer(app)` — handshake rejection for missing/invalid cookies, participant-only room joins with non-participant disconnect, malformed-id handling, admin rejection, and real-time `message:new`/`conversation:updated` delivery verified after REST writes (including that non-joined sockets receive nothing and messages are persisted before emit).
  - `savedSearch.mongo.test.js`: Real MongoDB tests for the S10 saved-search domain — typed-criteria validation (enums, ranges, inverted price pairs, over-length), MongoDB-operator injection rejection at save AND on a tampered document (rebuild-at-execute guard, ADR-029), 20-active per-user cap with reactivation re-check, owner-scoped CRUD with 404 enumeration resistance, and run-execution accuracy (boundary prices, city escaping, sort, canonical querystring).
  - `notification.mongo.test.js`: S10 notification triggers through the REAL service paths — listing-match sweep (match/no-match, email via the fake provider, `lastNotifiedAt`), visit-update in-app notifications, inquiry email + in-app to the agent, message alerts to the counterpart only, inbox pagination/unread filter, mark-read idempotence, mark-all, recipient-scoped delete, unread counts, and failure isolation (notification/email errors never fail the primary mutation).
  - `s10.api.test.js`: HTTP-level S10 matrices — buyer-only saved-search gates (agent/admin 403), authentication, malformed ids, standard envelopes, notification personal-inbox scoping, unread-count shape, mark-all, and pagination clamps. Own app instance for rate-limit isolation.
  - `notification.socket.test.js`: Real Socket.io verification of the ADR-030 user-room model — authenticated sockets auto-join `user:${id}` on connect, `notification:new` reaches only the recipient's room (persisted BEFORE the emit, verified by re-reading the document), multiple sockets of one user all receive it, and unauthenticated handshakes are still rejected.
  - `geoDistance.test.js` (unit, S12): Haversine accuracy against exact spherical arcs, deterministic walking-minute rounding, the published utility decay curve (1 at ≤400 m → 0 at ≥1600 m), and walk-score determinism — weight sum, saturation at top-5, full-density 100, decay aggregates, unknown-category tolerance, empty-set null guard.
  - `neighborhood.mongo.test.js`: Real MongoDB S12 coverage — $centerSphere radius inclusion/exclusion, Haversine/walk-minute payload correctness, default radius, per-category distance ordering with top-10 caps, zero-POI rural contract (`dataAvailable:false`, `walkScore:null`), category whitelist filtering (scoring still sees all POIs), malformed radius matrix (all → 400 GEO_INVALID, no query executed), INVALID_ID/NOT_FOUND lookup guards, and IXSCAN explain() proof for the pois 2dsphere sweep.
  - `neighborhood.api.test.js`: HTTP-level S12 envelopes — public unauthenticated 200 with full payload shape, radius/category pass-through, GEO_INVALID/INVALID_ID/NOT_FOUND errors, and proof the neighborhood route does not shadow the property detail route. Own app instance for rate-limit isolation.
  - `uploads.mongo.test.js` / `uploads.api.test.js` / `uploadSafety.test.js` (S13): real-Mongo media + verification lifecycle, HTTP media-access matrices (404-not-403), and magic-byte/limit unit coverage.
  - `mortgageCalculator.test.js` (unit, S14): the published EMI formula against known loan figures (5,000,000 @ 8.5% / 240 -> 43,391), the zero-rate P/n limit case, single-month and max-tenure bounds, whole-rupee amortization rows that sum exactly to principal, and per-field rejection of out-of-range/non-scalar inputs.
  - `property.priceHistory.mongo.test.js` (S14): append-only-on-real-change semantics (silence on identical price and unrelated edits), the 50-entry cap with drop-oldest ordering, mass-assignment rejection on both create and update, the trimmed public `{ price, changedAt }` shape, and the price-drop sweep (matching active saved search -> in-app `price_drop` + email to the owner; silence on rise/inactive/non-matching).
  - `analytics.mongo.test.js` (S14): pure-stats fixtures (median/psf invalid-area exclusion/min-sample floor), real-Mongo case-insensitive exact city bucketing, listingType slicing, literal-treatment of regex-shaped city text, and revision-counter cache invalidation across the real create funnel.
  - `compare.api.test.js` (S14): HTTP comparison matrix — anonymous 200 with derived pricePerSqft and publicized image strings, found+missing partial results, mixed statuses, the 400 VALIDATION_ERROR matrix (empty/malformed/over-limit), dedupe, and route-ordering proof that `/compare` does not shadow `/:id` or `/:id/neighborhood`. Own app instance for rate-limit isolation.
- Current status: 553 tests passing across 34 test suites (S13 baseline 519 + 11 S14 mortgage unit + 7 S14 price-history mongo + 8 S14 analytics mongo + 8 S14 compare HTTP). S15 adds NO server tests — it touches zero server files; the suite is re-run unchanged to prove the baseline holds.
- Regression gate: all prior sprint test suites (34 S1–S3 tests + 19 S4 auth tests) remain unmodified and green throughout S5.

### Component & Frontend
- React UI components, forms, and interaction states.
- **Containerization / deployment verification (S16, ADR-042)**: server hardening (trust-proxy, env limiter, `/api/health` + `/api/ready`, graceful shutdown) is covered by `tests/integration/health.api.test.js`; the client chunk budget (ADR-040) is CI-gated by `client/scripts/check-chunk-budget.mjs`. The Docker image builds, the compose stack, and the Playwright journeys that run against it require Docker and are gated in CI (`docker-build`, `e2e` jobs) — they are not runnable on a host without Docker.
- **PWA / service worker verification (S15, ADR-039)**: the service worker and web-app manifest are BUILD-gated, not unit-tested. The server test runner never sees a service worker (registration is `import.meta.env.PROD`-gated and the plugin injector is disabled), so the 553 server tests are unaffected by construction and the `vite dev` experience is unchanged. Verification is: `npm run build` must emit `dist/sw.js` + `dist/manifest.webmanifest`; a scripted size-check asserts no JS chunk exceeds the ADR-040 300 kB budget; and the SW's cache allow-list is proven by inspecting the generated `sw.js` (only the five public read endpoints appear as rules; auth/conversations/admin/documents have none → NetworkOnly). Installability, offline shell/fallback, cached-copy flag and the notification opt-in are validated through structured manual QA (Application panel, Network-offline, and a hidden-tab notification) until S16 introduces browser E2E.
- *Current implementation status*: The `client` application does not currently have a dedicated test runner (e.g. Vitest/React Testing Library) installed. Code quality and correctness are maintained via:
  - Strict static analysis with `oxlint`.
  - Production bundling checks with `npm run build` (Vite).
  - Manual browser testing across desktop, tablet, and mobile viewports.
- *Roadmap plan*: Install Vitest and React Testing Library in a dedicated testing pass to avoid adding out-of-scope dependencies during feature sprints.

### E2E (S16, ADR-041 — Playwright)
- Implemented as an **isolated top-level `e2e/` workspace** (own `package.json`, Playwright only; installs nothing into `server/` or `client/`). Run against the **containerized production simulation** (`docker-compose.e2e.yml`): nginx serving the built SPA and proxying `/api` + `/socket.io` to the real server on a real MongoDB — so proxying, WebSockets, SPA fallback, cache headers and the service worker are exercised in situ.
- The canonical 12 flows below are covered by 6 journey specs (`e2e/tests/01-…06-…`), mapping documented in `e2e/README.md` and ADR-041. Policy: `workers: 1`, `retries: 0` (seeded data is deterministic per ADR-033); rate limits raised via the ADR-042 env knobs — no test-only code branches.
- Verified in CI (`.github/workflows/ci.yml` `e2e` job) and by the human when Docker is available; the authoring host for S16 had no Docker, so the suite was syntax-verified and test-discovered (`playwright test --list` → 10 tests / 6 files) but not executed there.

## Minimum critical E2E flows
- Registration
- Login/logout
- Search and filtering
- Property detail (Gallery, Highlights, Location Map)
- Bookmark
- Inquiry
- Agent listing creation
- Admin approval
- Visit scheduling
- Chat
- Saved search
- Notification

## Feature rule
New functionality should receive appropriate tests in the same sprint. Do not intentionally defer all testing to the final sprint.

## Definition of done
The requirement for automated verification applies to layers and features where an automated test runner exists (such as backend API and database integration tests). In the frontend, S3 gallery and map acceptance is validated through structured manual QA, static analysis (`oxlint`), and production build verification (`vite build`), because the approved S3 scope deliberately does not introduce a client test framework. A feature is not complete if its acceptance criteria fail manual QA or if automated test coverage is omitted where test infrastructure is established.
