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
- Current status: 395 tests passing across 21 test suites (S9 baseline 341 + 24 S10 saved-search + 16 S10 notification service + 11 S10 HTTP + 3 S10 socket).
- Regression gate: all prior sprint test suites (34 S1–S3 tests + 19 S4 auth tests) remain unmodified and green throughout S5.

### Component & Frontend
- React UI components, forms, and interaction states.
- *Current implementation status*: The `client` application does not currently have a dedicated test runner (e.g. Vitest/React Testing Library) installed. Code quality and correctness are maintained via:
  - Strict static analysis with `oxlint`.
  - Production bundling checks with `npm run build` (Vite).
  - Manual browser testing across desktop, tablet, and mobile viewports.
- *Roadmap plan*: Install Vitest and React Testing Library in a dedicated testing pass to avoid adding out-of-scope dependencies during feature sprints.

### E2E
- Critical user journeys planned for S16 (Cypress/Playwright).

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
