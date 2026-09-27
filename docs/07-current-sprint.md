# HomeHunt — Current Sprint

## Sprint
S6 — Agent System

## Status
[x] Complete (Ready for human review) — S6 listing CRUD, agent dashboard, and agent inquiry inbox complete.

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
- [x] All 160 server tests passing across 11 suites; server eslint clean; client oxlint clean; client production build succeeds.
