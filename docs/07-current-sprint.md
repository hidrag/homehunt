# HomeHunt — Current Sprint

## Sprint
S10 — Saved Searches & Notification Engine

## Status
[~] In progress — implementation complete; automated verification green (395 tests, 21 suites); not declared complete pending human QA.

## S10 Locked Decisions (user-approved 2026-10-06)
1. Event matrix: `listing_match` in-app + email; `visit_update` in-app only (S8 emails preserved); `inquiry_update` in-app + email to agent; `message_alert` in-app only.
2. Frequency: `instant` only; `daily` → `400 VALIDATION_ERROR`.
3. Matching: inline fire-and-forget sweep on Property creation; `[MATCH_ERROR]` swallowed; never delays/fails the HTTP response.
4. No granular preferences; pause via `active:false`.
5. Retention indefinite; recipient may delete individual notifications (own-only, 404 miss).
6. Price-drop alerts deferred to S14+ (documented in roadmap + decisions log).
7. Shared filter builder extracted to `server/src/lib/propertyFilters.js`; S2 suites guard the extraction.

## Planned deliverables
- SavedSearch / Notification models + indexes
- savedSearch + notification services/controllers/routes
- Triggers wired into property creation, visit transitions, inquiry creation, chat messages
- Email events `listing_match` + `inquiry_update` through the ADR-024 adapter
- Socket user-room auto-join + `notification:new`
- Frontend: save-search modal, `/saved-searches`, header bell + flyout, `/notifications`
- Tests: savedSearch.mongo, notification.mongo, notification.socket (+ api matrices); baseline 341 preserved

## S10 Explicitly out of scope
- Radius/polygon criteria (S11), neighborhood criteria (S12), uploads (S13), Web Push/PWA (S15), price-drop alerts (S14+), marketing email, per-category preferences.

## S10 manual QA checklist (human)
- Buyer: on `/listings`, apply filters → "Save this search" → verify the saved search appears on `/saved-searches`; toggle active off/on; delete with confirmation; run → results match the live filtered listing; "Open as search" deep-link carries the canonical querystring.
- Matching: with an active saved search, create a matching property as the agent → buyer receives an in-app notification (bell badge bumps live via socket) AND an email (fake/Resend per env); a non-matching property produces nothing.
- Notifications: visit status change → in-app notification for the affected party (S8 emails unchanged); new inquiry → agent gets in-app + email; new chat message → counterpart gets in-app only (no email).
- Inbox: `/notifications` pagination + unread filter, mark-read on click-through (deep-links: listing → `/listings/:id`, message → `/messages/:id`, visit → `/visits`, inquiry → `/inquiries`), mark-all-read zeroes the badge, dismiss removes a row.
- Header bell: flyout shows recent items, refreshes on open; badge survives reload (hydrated from REST) and bumps live on new events; logout clears it.
- Security spot-check: agent/admin tokens get 403 on `/api/saved-searches`; buyer A gets 404 on buyer B's saved searches and notifications.

## S9 Scope & Deliverables (implemented)
- [x] Transport (ADR-026): `server/src/server.js` refactored from `app.listen()` to `http.createServer(app)` with a Socket.io server attached (CORS matching `CLIENT_URL`, `credentials: true`); `server/src/sockets/auth.middleware.js` authenticates the handshake from the `hh_access` cookie via `verifyAccessToken` and rejects unauthenticated/invalid sockets with `AUTH_UNAUTHORIZED`; `server/src/sockets/registry.js` holds the live `io` instance with no-op emit helpers for `app`-only contexts.
- [x] Data model (ADR-027): `server/src/models/Conversation.js` (`property`/`buyer`/`agent`, denormalized `lastMessage`, `buyerUnread`/`agentUnread`; indexes `{buyer,updatedAt:-1}`, `{agent,updatedAt:-1}`, unique `{property,buyer}`) and `server/src/models/Message.js` (`conversation`, server-derived `sender`, `body` 1–2000 trimmed, `readAt`; index `{conversation,createdAt:1,_id:1}`). Strictly append-only.
- [x] Service/controller/routes (`conversation.service.js`, `conversation.controller.js`, `conversation.routes.js`): idempotent `POST /api/conversations` (reuse-or-create on `(property, buyer)`, persists the opening message, increments `agentUnread`), role-scoped `GET /api/conversations`, `GET /api/conversations/unread-count`, participant-only `GET /api/conversations/:id/messages` (404 for non-participants), `POST /api/conversations/:id/messages` (persist → `$inc` other side → emit `message:new`), `POST /api/conversations/:id/read` (zero caller counter, stamp `readAt`, emit `conversation:updated`).
- [x] Admin audit (read-only): `GET /api/admin/conversations` and `GET /api/admin/conversations/:id/messages` — admins are not participants, never join rooms, and cannot post.
- [x] Socket room dispatch (ADR-028, `chat.handler.js`): `conversation:join` re-verifies participation against MongoDB, joins `conversation:${id}`, and rejects non-participants with `NOT_FOUND` + disconnect; `conversation:leave` supported. No client-to-server message event exists (REST-only send).
- [x] Frontend: `conversationApi.js`, `lib/socket.js` (singleton client, connect on auth / teardown on logout), `chatSlice.js` (unread badge with the ADR-017 revision guard), `Messages.jsx` (responsive two-pane inbox + transcript, live appends, read-on-open), `MessageAgentButton.jsx` on `ListingDetail`, Header Messages link + unread badge, Agent dashboard Conversations tab, Admin Conversations audit tab.
- [x] Tests: `conversation.mongo.test.js` (33), `conversation.api.test.js` (15), `conversation.socket.test.js` (11) — 341 total across 17 suites, S8 baseline (282) fully preserved.
- [x] Documentation: ADR-026…ADR-028, API contract, database schema, auth/RBAC (permission row), architecture, security (WebSocket section), testing strategy, UI design system, product spec, roadmap.

## S9 Explicitly out of scope
- Email/push notifications on messages (S10 notification engine).
- Attachments, image/document uploads (S13).
- Message analytics / AI auto-replies (S14+).
- Message edit/delete — strictly append-only (locked decision).
- Redis/multi-instance Socket.io adapter (recorded for S16).

## Acceptance criteria (met)
- [x] Property-bound threads with unique `(property, buyer)`; `POST /api/conversations` idempotent and persists the opening message.
- [x] Server-derived participants: `buyer` from `req.user.id`, `agent` from `Property.agent`, `sender` from the caller; client-supplied values ignored.
- [x] Participants only: non-participants receive `404` on REST and `NOT_FOUND` + disconnect on socket join (no enumeration).
- [x] Admins are read-only: audit REST endpoints only; rejected from rooms and from posting.
- [x] Unauthenticated sockets rejected at handshake (`AUTH_UNAUTHORIZED`).
- [x] REST is the only send path; `message:new` emitted after the DB write; no client-to-server message emit.
- [x] Unread counters via atomic `$inc`; read receipts zero the caller's counter and stamp `readAt` on the other side.
- [x] Append-only lifecycle; no edit/delete surface.
- [x] Deleted property: thread survives, `property: null`, messaging still works.
- [x] All 341 tests pass; server lint clean; client lint clean; client build succeeds.

## S9 Known limitations
- Socket.io default in-memory adapter is single-process; multi-instance deployment needs the Redis adapter (S16).
- Socket tests boot a real ephemeral-port server; they run sequentially (`--runInBand`) with the rest of the suite.
- No notification on new messages until S10 (deliberate).

## Remaining manual QA
- Browser verification of the buyer "Message the agent" flow, live delivery between two signed-in sessions (buyer ↔ agent), unread badge behaviour, and the admin read-only transcript view.
- Responsive checks on the Messages page (two-pane → single column) and the new dashboard/admin tabs.
- Confirm the socket reconnects cleanly after a logout/login cycle (client tears the socket down on logout).

## S8 delivery record (complete)
S8 — Visit Scheduling & Email Infrastructure is complete and committed: visit domain, agent/admin management, and transactional email.
- [x] Visit domain model (`server/src/models/Visit.js`): `property`/`buyer`/`agent` references, UTC `startAt`/`endAt`, IANA `timezone` (default `Asia/Kolkata`, alias `Asia/Calcutta` normalized), `status` (`pending|confirmed|declined|cancelled|completed`), `note` (≤2000), `cancelledAt`/`cancelledBy` audit fields. Duration derived, never stored.
- [x] Service layer (`server/src/services/visit.service.js`): server-derived `buyer`/`agent`, forced `pending` status, mass-assignment rejection, 30–120 minute duration window, 30-day horizon, explicit zone designator required, timezone validation, duplicate protection (`409 DUPLICATE_VISIT`), per-agent confirmation serialization with TOCTOU re-check, overlap conflict (`409 SCHEDULE_CONFLICT`, strict inequality), property-availability re-check at confirm, 404-not-403 ownership guard.
- [x] Routes: `POST /api/visits` (buyer), `GET /api/visits` (buyer), `GET /api/visits/agent` (agent), `PATCH /api/visits/:id/status` (buyer|agent), `GET /api/admin/visits` + `PATCH /api/admin/visits/:id/status` (admin). Admins obey the same state machine — no bypass.
- [x] Email infrastructure (`server/src/services/email.service.js` + `email/visit.templates.js`): `EMAIL_PROVIDER` = `fake` (default, in-memory log) or `resend` (native fetch, no SDK); best-effort sending (provider errors logged, never fail the mutation, never returned to clients); recipients always derived from persisted users; shared `escapeHtml` for all user-controlled template values.
- [x] Frontend: `VisitForm` (date/time/duration/note, timezone capture, midnight-crossing fix), buyer `Visits` page (pagination, cancel-with-confirm, deleted-property fallback), Agent Dashboard Visits tab (confirm/decline/complete/cancel with confirm), Admin Visits tab (status filter, pagination, lifecycle actions), `visitApi` service, Header link, route registration.
- [x] Tests: `visit.mongo.test.js` (70 service/DB tests) + `visit.api.test.js` (13 HTTP tests) — 282 total across 14 suites, S7 baseline (199) fully preserved.
- [x] Documentation: ADR-022…ADR-025, API contract, database schema, auth/RBAC, architecture, security, environment, testing strategy, UI design system, product spec, roadmap.

## S8 Explicitly out of scope
- Real-time chat (S9), saved searches and notification engine (S10).
- Image uploads/Cloudinary (S13).
- Multi-instance distributed locking (recorded for S16; current mutex is per-process).
- Email outbox/queue with delivery guarantees (deferred to S10).

## Acceptance criteria (met)
- [x] Buyers can request visits; agents confirm/decline/complete/cancel; admins moderate via explicit admin routes.
- [x] Server-derived ownership: `buyer` from `req.user.id`, `agent` from `Property.agent`; client cannot override.
- [x] State machine enforced for all roles including admin (no bypass).
- [x] Duplicate active visits rejected (`409 DUPLICATE_VISIT`); overlapping confirmed visits rejected (`409 SCHEDULE_CONFLICT`); boundary-touching allowed.
- [x] Concurrent confirmation serialized per agent — exactly one succeeds.
- [x] Cross-owner access returns `404` (no enumeration).
- [x] Timezone normalized (`Asia/Calcutta` → `Asia/Kolkata`); invalid rejected; UTC persistence verified.
- [x] Duration 30–120 minutes enforced; 29/121 rejected; past and >30-day rejected.
- [x] Property deletion retains visits (`property: null`); pending against deleted property cannot be confirmed; historical confirmed stays manageable.
- [x] Email events: requested → buyer+agent; confirmed/declined → buyer; buyer_cancelled → agent; agent_cancelled → buyer; completed/admin-cancel → none.
- [x] Email provider failures never fail the DB mutation; no secrets leaked; HTML escaped.
- [x] All 282 tests pass; server lint clean for S8 files; client lint clean; client build succeeds; `git diff --check` clean.

## S8 Known limitations
- Per-agent mutex is per-process; multi-instance deployments need a replica set or shared lock service (S16).
- Email delivery is best-effort without an outbox (S10).
- Resend path not exercised against the live API (configuration-gated; unit-tested for the configuration guard).

## Remaining manual QA
- Browser verification of the buyer visit request flow, agent confirm/decline, admin moderation, and email rendering with `EMAIL_PROVIDER=fake`.
- Responsive checks on the new visit surfaces (buyer page, agent dashboard tab, admin tab).
- Role-change regression: buyer→agent and agent→buyer transitions with existing sessions (token role staleness bounded by 15-minute access lifetime per ADR-021).

## S6 Scope & Deliverables (completed)
- [x] `requireOwnership(Model, ownerField, { allowAdmin })` middleware (ADR-019): 400 `INVALID_ID` / 404 `NOT_FOUND` / 403 `FORBIDDEN` semantics; forwards the loaded document as `req.resource`.
- [x] Property service CRUD with full input sanitization (enums, numeric bounds, GeoJSON coordinate ranges, image URL checks, array/length limits); `agent` always server-derived from `req.user.id`; `status` forced to `available` on create.
- [x] Routes: `POST /api/properties`, `GET /api/properties/mine`, `PATCH /api/properties/:id`, `DELETE /api/properties/:id` behind `requireAuth` + `requireRole('agent','admin')` + ownership (admin override on properties per docs/06 "Edit any property").
- [x] Delete semantics (ADR-020): bookmarks referencing the deleted property are removed; inquiries are retained as business records.
- [x] Agent inquiry inbox: `GET /api/inquiries/agent` and `PATCH /api/inquiries/:id/status` (`responded` / `closed`), strictly agent-scoped (no admin bypass; cross-agent administration belongs to S7).
- [x] Property compound index `{ agent: 1, createdAt: -1 }` for the agent dashboard; documented in docs/04.
- [x] API contract additions in docs/05 (Property Management API, Agent Inquiry API) written before implementation.
- [x] Frontend: `AgentDashboard` (listings + inquiries tabs, URL-synced tab/pagination, confirm-delete), `ListingForm` (create/edit, React Hook Form + Yup, GeoJSON `[lng, lat]` mapping), shared `StatusBadge`, `propertyApi`/`inquiryApi` extensions, role-guarded `/agent` routes, Header Dashboard link; `MyInquiries` refactored to the shared badge.
- [x] Test suites: `property.crud.mongo.test.js` (36 tests), `inquiry.agent.mongo.test.js` (17 tests) covering role gates, ownership violations, validation, server-derived invariants, cascade cleanup, ordering, pagination clamps, and the agent compound index.

## S7 Scope & Deliverables (completed)
- [x] Admin-only platform overview with lightweight user, listing, and inquiry counts.
- [x] Paginated user directory with safe serialization, search, role filtering, provisioning, and guarded role changes.
- [x] Cross-agent listing moderation view with approved filters, admin edit/delete reuse, and deletion confirmation.
- [x] Cross-agent inquiry administration with buyer/agent/property context, deleted-property handling, and allowed status transitions.
- [x] Responsive, URL-synced Admin dashboard with loading, error, empty, pagination, validation, and confirmation states.
- [x] Backend integration coverage for authorization, sanitization, role protections, moderation queries, and inquiry transitions.
- [x] Server lint, complete server test suite, client lint, and production build pass.

## S7 Explicitly out of scope
- Approve/reject or verification workflows (S13).
- Property status transitions, user deactivate/delete, audit logs, analytics history, reports/exports.
- Visits, chat, notifications, saved searches, and image uploads/Cloudinary.

## Explicitly out of scope
- Image uploads/Cloudinary (S13) — listings use remote HTTPS image URLs.
- Agent profiles, visit scheduling, realtime chat (S8/S9).
- Admin moderation, user management, cross-agent inquiry administration (S7).

## Acceptance criteria (met)
- [x] Only agents/admins can create listings; buyers receive `403 FORBIDDEN`.
- [x] Agents can update/delete only their own listings; other agents receive `403 FORBIDDEN`; admins may manage any property.
- [x] `agent` cannot be set or changed by clients; `status` always starts `available`.
- [x] Agent inbox returns only inquiries addressed to the caller; transitions limited to `responded`/`closed`.
- [x] Public property browsing (GET /api/properties, GET /api/properties/:id) unchanged.
- [x] Current validation: all 199 server tests pass across 12 suites; server eslint clean; client oxlint clean; client production build succeeds.
