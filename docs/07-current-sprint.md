# HomeHunt — Current Sprint

## Sprint
S8 — Visit Scheduling & Email Infrastructure

## Status
[~] In progress — implementation complete; automated verification green (282 tests, 14 suites); not declared complete pending human QA.

## S8 Scope & Deliverables (implemented)
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
