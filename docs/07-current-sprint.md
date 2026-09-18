# HomeHunt — Current Sprint

## Sprint
S5 — Buyer Features

## Status
[x] Complete (Ready for human review) — S5 Bookmarks and Buyer-side Inquiries complete.

## Goal
Implement persistent property bookmarks and buyer-side agent inquiries without modifying public property browsing or existing S0–S4 capabilities.

## S5 Scope & Deliverables (completed)
- [x] Bookmark model (`server/src/models/Bookmark.js`) with unique compound index `{ user: 1, property: 1 }` and ordering index `{ user: 1, createdAt: -1 }`.
- [x] Inquiry model (`server/src/models/Inquiry.js`) with buyer, property, agent refs, contact snapshot, status enum (`pending`, `responded`, `closed`), and ordering indexes.
- [x] Bookmark service (`bookmark.service.js`) and Inquiry service (`inquiry.service.js`) enforcing all business logic and security invariants.
- [x] Bookmark controller & routes (`/api/bookmarks`, `/api/bookmarks/ids`, `/:propertyId`) mounted under `requireAuth`.
- [x] Inquiry controller & routes (`POST /api/inquiries`, `GET /api/inquiries`) mounted under `requireAuth`.
- [x] Frontend Bookmark API (`bookmarkApi.js`) and Redux slice (`bookmarksSlice.js`) with optimistic UI and in-flight guards.
- [x] `BookmarkButton` integrated into `PropertyCard` (as sibling of Link) and `ListingDetail` (sidebar).
- [x] Saved Properties page (`/bookmarks`) with URL-synced pagination, loading, empty, and retry states.
- [x] Frontend Inquiry API (`inquiryApi.js`), `InquiryForm` (RHF + Yup, prefilled), and integration into `ListingDetail`.
- [x] My Inquiries page (`/inquiries`) with status badge, thumbnails, and pagination.
- [x] App routing and Header navigation with Saved (count badge) and Inquiries links; bookmark hydration after auth.
- [x] Comprehensive backend test suites: `bookmark.test.js`, `bookmark.mongo.test.js`, `inquiry.test.js`, `inquiry.mongo.test.js`.
- [x] All 105 tests passing; server and client linters clean; client builds with 0 errors.

## Explicitly out of scope (S6+)
- Agent-side inquiry inbox/management (S6).
- Agent dashboards/profiles, listing CRUD, image uploads/Cloudinary (S6/S13).
- Admin moderation and user management (S7).

## Acceptance criteria (met by S5)
- [x] Duplicate bookmarks prevented at database and service level.
- [x] Bookmark endpoints require authentication and scope exclusively to `req.user.id`.
- [x] Inquiry agent derived strictly server-side from `property.agent`.
- [x] Inquiry status forced to `pending`.
- [x] Public property browsing remains fully public without regressions.
- [x] All 105 tests passing; clean lint and build.
