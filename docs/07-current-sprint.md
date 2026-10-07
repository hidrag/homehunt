# HomeHunt — Current Sprint

## Sprint
S13 — Documents, Verification & Virtual Tours

## Status
[~] In progress — implementation complete; automated verification green (519 tests, 30 suites); not declared complete pending human QA.

## S13 Locked Decisions (user-approved 2026-10-07)
1. Storage: dedicated `propertydocuments` collection (metadata only; bytes with the provider). Property gains `verificationStatus`/`verifiedAt`/`verifiedBy`/`rejectionReason`/`virtualTourUrl`; verification fields server-managed only (mass-assignment rejected). Dual-shape `images` normalization (legacy URL strings accepted; stored `{ imageId, url, publicId, alt }`; public payloads keep the ordered URL-string array).
2. Uploads: `UploadService` adapter → `FakeUploadProvider` (default/test) | `CloudinaryProvider` (native fetch, no SDK). multer memoryStorage; magic-byte validation (JPEG/PNG/WebP/PDF; SVG/executables rejected; declared MIME must agree with sniff). Limits: images 5 MB/file, 5/req, 20/property; documents 10 MB/file, 10 active/property. Oversize 413 FILE_TOO_LARGE; bad type 400 INVALID_FILE_TYPE.
3. Workflow: agent uploads docs → `POST /api/properties/:id/request-verification` (requires ≥1 active doc; from unverified/rejected/verified; pending → 409). Admin decides: `PATCH /api/admin/properties/:id/verification` { decision: approve|reject, reason? } from pending only; reject requires reason. Verified re-submit resets to pending (audit fields cleared). In-app `verification_update` notification on every decision.
4. Access: media routes auth-required; non-owner/non-admin → 404 NOT_FOUND (never 403). Document content via authenticated route only (302 signed URL or in-band stream; `Cache-Control: no-store`). No public document URLs.
5. Virtual tours: server-normalized to canonical embed URLs (youtube-nocookie / vimeo player / matterport player / kuula static player); client re-checks whitelist before iframe render (sandboxed).
6. Governance: S12 flipped to [x] Complete in roadmap + sprint doc.

## Planned deliverables
- PropertyDocument model + Property schema additions + dual-shape images + presentation flattening lib
- Upload provider adapters (fake/cloudinary) + magic-byte + virtualTour libs + multer wiring
- Media service/controller/routes (property + admin) + requireMediaAccess middleware + verification_update notification
- ADR-035/036 + docs (04/05/06/07/11/12/02)
- Tests: uploadSafety.unit (11) + uploads.mongo (25) + uploads.api (12); baseline preserved

## S13 Explicitly out of scope
- Cloudinary credentials in CI/tests (fake provider only; real-mode verification is human QA scope)
- Video hosting/transcoding, document format conversion, OCR, virus scanning (S16 infra), image CDN transforms, drag-and-drop galleries, bulk ZIP import.

## S13 status
Verification green: 519 tests / 30 suites (`--runInBand`, Node v24.20.0), server lint clean, client lint clean, client build clean, `git diff --check` clean. Not declared complete pending human QA.

## S13 manual QA checklist (human)
- Dev DB reseed → new listings show no verification badge (unverified default).
- Agent dashboard → My Listings → expand a listing → Verification documents panel: upload a PDF deed (and an image), list shows it; "Request verification" enabled only after ≥1 doc; status pill flips to "Verification pending".
- Upload an .svg or rename an .exe to .jpg → upload rejected with the type error; upload a >10 MB PDF → size error. 11th document rejected.
- Listing edit (agent): upload photos in "Verified photo uploads" — thumbnails appear; remove one — disappears from public gallery after reload. Enter a YouTube watch URL as virtual tour → after save, ListingDetail renders the embedded 360/tour card (canonical nocookie embed) below the neighborhood section. Enter `https://evil.example/x` → rejected with the whitelist message.
- Admin → Verifications tab: the pending listing appears with document count; View documents opens the private list (content opens in new tab, attachment); Approve → listing shows the emerald "Verified" pill on the listing page, listing cards, and agent list; the agent's notification bell shows "Listing verified".
- Reject with an empty reason → blocked by the modal; with a reason → agent notification carries the reason; agent can re-submit documents and re-request.
- IDOR (curl/browser): buyer or a second agent hitting the first listing's `.../documents` or content route → 404. Unauthenticated → 401.
- Regression: listing create/edit via URL textarea still works (legacy string images); public listings/detail/buyers see no document surfaces; notifications page shows the new type with its label.

## S12 delivery record (complete)
S12 — Neighborhood Explorer is complete: POI collection + deterministic seed, `$geoWithin $centerSphere` sweep, deterministic walk score, `GET /api/properties/:id/neighborhood`, NeighborhoodSection + PropertyMap POI layers, committed (d5a48f9). Verification at sign-off: 470 tests / 27 suites green.

## Sprint
S12 — Neighborhood Explorer & Local Context

## Status
[x] Complete — committed and pushed (d5a48f9). Verification at sign-off: 470 tests, 27 suites; server lint clean, client lint clean, client build clean.

## S12 Locked Decisions (user-approved 2026-10-07)
1. Data: internal `pois` collection (2dsphere), deterministically seeded via `server/scripts/seed/pois.js` (~190 POIs across the 13 seeded cities; seeded Goa listings intentionally POI-free). Zero runtime external POI/network dependency (ADR-033).
2. Endpoint: `GET /api/properties/:id/neighborhood`, public. `radiusKm` default 3, strict (0,10], malformed → `400 GEO_INVALID`; `category` whitelist filter, unknown values silently ignored. `400 INVALID_ID` / `404 NOT_FOUND`.
3. Computation: single `$geoWithin $centerSphere` sweep (IXSCAN); Haversine metres in memory; walk minutes `ceil(m/80)`; categories sorted by distance, top-10 each; walk score 0–100 (weights transit .30 / school .20 / grocery .20 / healthcare .15 / park .15, utility 1 ≤400 m → 0 at 1600 m, saturation 5). Zero POIs → `dataAvailable:false`, `walkScore:null` (never 0).
4. Out of scope: crime data, driving times, saved-search neighborhood criteria, any paid/external POI or routing API.
5. UI: `NeighborhoodSection.jsx` on ListingDetail (category tabs, walk badges, score gauge + method transparency, first-class empty state); `PropertyMap.jsx` POI layer groups without map re-init (ADR-007).

## Planned deliverables
- Poi model + deterministic seed chain wiring (properties → POIs)
- geoDistance lib (Haversine, utility decay, score) + neighborhood service/controller/route
- ADR-033/034 + docs (04/05/07/10/11/08/01/02)
- Tests: geoDistance.unit (16) + neighborhood.mongo (12) + neighborhood.api (7); 435 baseline preserved

## S12 Explicitly out of scope
- Crime/mock safety data (descoped permanently — locked decision 4), driving-time estimates, Street View, geocoding, POI admin CRUD, saved-search neighborhood criteria, server-side caching (S16 evidence-based escalation only).

## S12 status
Verification green: 470 tests / 27 suites, server lint clean, client lint clean (--zero-warnings incl. new files), client build clean. Not declared complete pending human QA.

## S12 manual QA checklist (human)
- Reseed dev DB (`npm run seed` in server/) → properties + ~190 POIs seeded; console shows POI count and the Goa-POI-free note.
- Open a Mumbai/Bengaluru listing → "Neighborhood & Nearby Amenities" section shows a Walk Score badge, category tabs (All/Transit/Schools/Grocery/Healthcare/Parks), POI cards with distance + walk minutes, and "How is this calculated?" expands to the formula with weights.
- Switch tabs → list filters AND the Location map below re-tints to only that category's markers; map shows the property pin + coloured POI dots; clicking a POI marker opens a name · distance popup; the map fits all visible points. No "Map container is already initialized" console errors after tab toggling / back-nav / StrictMode double-mount (dev mode).
- Open the Goa listing → section shows the friendly "Local amenity data isn't available yet" empty state; map shows only the property pin; no score badge; nothing crashes.
- Direct URL `/api/properties/<id>/neighborhood` (no cookie) returns 200 envelope; `?radiusKm=11` and `?radiusKm=abc` return 400 GEO_INVALID; unknown id → 404; malformed id → 400 INVALID_ID.
- Regression: property detail page (gallery, highlights, amenities, inquiry/visit/message), listings/map page, and all other flows behave exactly as before.

## S11 delivery record (complete)
S11 — Advanced Geo Search is complete: radius/bounds geo search, saved-search geo criteria, MapResults viewport map, all committed (2b45ea2).

## Sprint
S11 — Advanced Geo Search

## Status
[x] Complete — committed and pushed (2b45ea2). Verification at sign-off: 435 tests / 24 suites, server lint clean, client lint clean, client build clean.

## S11 Locked Decisions (user-approved 2026-10-07)
1. Spatial querying: `$geoWithin` `$centerSphere` (radius) and `$geoWithin` `$geometry` closed Polygon (bounds — amended from `$box` for 2dsphere index acceleration). No `$nearSphere` (sort/pagination contracts preserved).
2. Radius + bounding box only; free-hand polygon drawing DEFERRED.
3. SavedSearch criteria gains optional `lat`/`lng`/`radiusKm` (all-or-none); shared builder handles criteria + sweep unchanged.
4. Validation: lat [-90,90], lng [-180,180] finite; radiusKm (0,100] required with coordinates; bounds = exactly 4 numbers, minLat ≤ maxLat, minLng ≤ maxLng; antimeridian crossing / out-of-range → `400 GEO_INVALID`.
5. In-house grid clustering (~60px cells, zero new deps); direct Leaflet (ADR-007); debounced viewport→URL bounds sync with programmatic-move suppression; mobile List/Map segmented toggle.
6. Public property status behavior unchanged (no silent status filtering).

## Planned deliverables
- Shared-builder geo keys (lat/lng/radiusKm/bounds) + 400 GEO_INVALID envelope
- SavedSearch geo criteria + validation
- geoFilter unit + geo.mongo (accuracy, 2dsphere explain, conjunctions) + geo.api suites
- MapResults component (markers, price badges, clustering, card↔marker sync, viewport sync)
- Listings page integration + mobile view toggle; SaveSearchModal geo capture
- 395-test baseline preserved

## S11 Explicitly out of scope
- Polygon/free-hand drawing (deferred), geocoding (paid-API policy), POI/neighborhood data (S12), markercluster/react-leaflet packages, `$nearSphere`/distance sorting, antimeridian wrap support, saved `bounds` (transient viewport only).

## S11 status
Verification green: 435 tests / 24 suites, server lint clean, client lint clean, client build clean. Not declared complete pending human QA.

## S11 manual QA checklist (human)
- Radius: on /listings, drag/zoom the map → after ~0.35s the URL gains `bounds=...` and results reload to the visible area; a shared/reloaded URL reproduces the same viewport (programmatic fit must NOT immediately bounce the URL — watch the first load).
- Exact URL `?lat=12.9716&lng=77.5946&radiusKm=5` shows a teal radius circle + only in-radius listings; map badge pills show ₹ prices, clusters show counts, clicking a cluster zooms in.
- Click a card → map pans + ring highlight; click a marker → grid scrolls that card into view.
- Mobile (<768px): List/Map segmented toggle switches views; map renders correctly after toggling (invalidateSize).
- Save search from a geo URL → on /saved-searches the criteria shows geo; "run" returns the same in-radius results; non-matching new listings never trigger alerts for it.
- Bad URL `?lat=91&lng=0&radiusKm=5` → inline error with the GEO_INVALID message, no crash; `?radiusKm=5` alone likewise.
- Regression: existing filters/sort/pagination/share links behave exactly as before; agent/admin unaffected.

## S10 delivery record (complete)
S10 — Saved Searches & Notification Engine is complete: saved searches, matching sweep, notification inbox, email alerts, socket user-rooms.

## S10 delivery record — original section (retained for the record)

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
