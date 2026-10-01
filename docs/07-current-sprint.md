# HomeHunt — Current Sprint

## Sprint
S7 — Admin Platform & Moderation

## Status
[x] Complete (Ready for human QA) — S7 admin APIs, responsive admin dashboard, user management, cross-agent listing view, and inquiry administration complete.

## S6 delivery record
S6 — Agent System remains complete and committed: listing CRUD, agent dashboard, and agent inquiry inbox.

## Goal
Give agents (and admins) server-side managed listing CRUD and an agent-scoped inquiry inbox, implementing the documented `requireOwnership` convention, without modifying public browsing or S0–S5 behavior.

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
