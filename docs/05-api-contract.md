# HomeHunt — API Contract

## General rules
Base prefix:

`/api`

All APIs must use consistent JSON response structures.

Recommended success shape:

```json
{
  "success": true,
  "data": {}
}
```

Recommended error shape:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message"
  }
}
```

## Contract rule
Do not invent endpoints or change request/response shapes casually.

Before implementing an API:
1. Check this document.
2. Check existing routes/controllers.
3. Add or update the contract.
4. Implement backend.
5. Update frontend consumers.
6. Add tests.

## Planned API areas
- `/api/health`
- `/api/auth/*`
- `/api/properties/*`
- `/api/bookmarks/*`
- `/api/inquiries/*`
- `/api/visits/*`
- `/api/agents/*`
- `/api/saved-searches/*`
- `/api/conversations/*`
- `/api/messages/*`
- `/api/notifications/*`
- `/api/admin/*`
- `/api/analytics/*`

Exact endpoints and payloads should be documented as each domain is implemented.

## /api/properties Contract (S1 & S2)

**GET /api/properties**
- **Purpose**: Fetch a paginated list of properties with search, filtering, and sorting.
- **Backend Query Parameters**:
  - `search` (String): Keyword search across `title`, `description`, `address.city` using MongoDB `$text`.
  - `city` (String): Exact match, case-insensitive city name (safely regex-escaped).
  - `propertyType` (String): Enum `['apartment', 'house', 'villa', 'condo', 'land']`.
  - `listingType` (String): Enum `['sale', 'rent']`.
  - `minPrice` (Number >= 0): Minimum price ($gte). Ignored if non-numeric/negative or if `minPrice > maxPrice`.
  - `maxPrice` (Number >= 0): Maximum price ($lte). Ignored if non-numeric/negative or if `minPrice > maxPrice`.
  - `bedrooms` (Number integer >= 0): Minimum bedrooms ($gte).
  - `sort` (String): Sort order whitelist:
    - `newest` (default) → `{ createdAt: -1 }`
    - `price_asc` → `{ price: 1 }`
    - `price_desc` → `{ price: -1 }`
  - `sort` (String): Sort order whitelist (with deterministic `_id` secondary sort):
    - `newest` (default) → `{ createdAt: -1, _id: -1 }`
    - `price_asc` → `{ price: 1, _id: 1 }`
    - `price_desc` → `{ price: -1, _id: -1 }`
    - Any unknown value falls back to `newest`.
  - `page` (Number >= 1, default: 1).
  - `limit` (Number >= 1, default: 10, max: 50).
- **Security & Validation Rules**:
  - Raw `req.query` is never passed to MongoDB.
  - NoSQL operator injection (`$gt`, `$where`, `$ne`, etc.) is strictly blocked; unknown fields are ignored.
  - Out-of-range pages return `{ properties: [], pagination: { ... } }` with HTTP 200, not 404.

### Frontend URL Contract & Parameter Mapping
Frontend URL parameters (canonical names):
- `q` → Backend `search`
- `city` → Backend `city`
- `type` → Backend `propertyType`
- `listing` → Backend `listingType`
- `minPrice` → Backend `minPrice`
- `maxPrice` → Backend `maxPrice`
- `beds` → Backend `bedrooms`
- `sort` → Backend `sort`
- `page` → Backend `page`

URL Rules:
- Canonical default URL is `/listings` (omit default `page=1` and `sort=newest`).
- Empty parameters are removed (no `?q=&city=`).
- Changing any filter or sort resets `page=1`.
- Changing pagination preserves all existing filters.

**GET /api/properties/:id**
- **Purpose**: Fetch a single property detail.
- **Parameters**: `id` (MongoDB ObjectId).
- **Validation**: Mongoose `isValidObjectId()`.
- **Response**:
  ```json
  {
    "success": true,
    "data": { "property": { /* Complete Property object */ } }
  }
  ```
- **Guarantees (S3)**:
  - `images`: Array of URL strings is preserved in exact database order.
  - `location`: Always returned in GeoJSON format `{ type: "Point", coordinates: [longitude, latitude] }`. Consumers needing `[latitude, longitude]` (e.g. Leaflet) must invert coordinates explicitly.
- **Error Responses**:
  - `400 Bad Request`: `INVALID_ID` if ObjectId is malformed.
  - `404 Not Found`: `NOT_FOUND` if property does not exist.

## /api/auth Contract (S4)

All endpoints use the standard success/error envelopes defined above. "Set-Cookie" means the two authentication cookies specified in `docs/11-security-rules.md` (`hh_access`, `hh_refresh`).

**POST /api/auth/register**
- Auth: none. Rate limited (10/15 min/IP → `429 RATE_LIMITED`).
- Body: `{ "name": string, "email": string, "password": string }`.
- Validation: name required; email format + uniqueness (case-insensitive); password 8–72 characters. A client-supplied `role` or `passwordHash` is ignored and never honored.
- Success `200`: `{ "success": true, "data": { "user": { "id", "name", "email", "role" } } }` + Set-Cookie (auto-login; session created).
- Errors: `400 VALIDATION_ERROR`, `409 EMAIL_TAKEN`, `429 RATE_LIMITED`.
- The account is always created with `role: "buyer"`.

**POST /api/auth/login**
- Auth: none. Rate limited.
- Body: `{ "email": string, "password": string }`.
- Success `200`: `{ "success": true, "data": { "user": { "id", "name", "email", "role" } } }` + Set-Cookie (new refresh-token family).
- Errors: `400 VALIDATION_ERROR`; `401 INVALID_CREDENTIALS` for **both** unknown email and wrong password (no user enumeration; unknown emails still perform a dummy bcrypt comparison); `429 RATE_LIMITED`.

**POST /api/auth/refresh**
- Auth: refresh cookie only (no body).
- Behaviour: verifies the refresh JWT, atomically revokes the presented session and creates its successor in the same family, then reissues both cookies. The new access token carries the user's current role.
- Success `200`: `{ "success": true, "data": { "user": { "id", "name", "email", "role" } } }` + Set-Cookie (rotated pair).
- Errors: `401 INVALID_REFRESH`, `401 REFRESH_EXPIRED`, `401 REFRESH_TOKEN_REUSED` (reuse detected → entire family revoked, both cookies cleared), `429 RATE_LIMITED`.
- Rotation is strict: no grace window; a replayed rotated token revokes the family and the user must log in again.

**POST /api/auth/logout**
- Auth: none required (safe and idempotent without cookies).
- Behaviour: revokes the acting session when present; always clears both cookies; always returns success.
- Success `200`: `{ "success": true, "data": {} }` + cookie clearing.

**GET /api/auth/me**
- Auth: access cookie required (`requireAuth` middleware).
- Success `200`: `{ "success": true, "data": { "user": { "id", "name", "email", "role" } } }`.
- Errors: `401 UNAUTHORIZED` (missing/invalid/expired access token).

### Auth error vocabulary (S4)
`VALIDATION_ERROR`, `EMAIL_TAKEN`, `INVALID_CREDENTIALS`, `UNAUTHORIZED`, `INVALID_REFRESH`, `REFRESH_EXPIRED`, `REFRESH_TOKEN_REUSED`, `FORBIDDEN`, `RATE_LIMITED`.
Existing codes (`NOT_FOUND`, `INVALID_ID`, `INTERNAL_SERVER_ERROR`) remain unchanged.

## Bookmark API (S5)

All bookmark endpoints require authentication (`requireAuth` middleware). User identity is always extracted from `req.user.id`.

### GET /api/bookmarks
- Auth: Required (`requireAuth`).
- Query: `page` (default 1, min 1), `limit` (default 10, min 1, max 50).
- Success `200`:
```json
{
  "success": true,
  "data": {
    "bookmarks": [
      {
        "_id": "...",
        "user": "...",
        "property": {
          "_id": "...",
          "title": "...",
          "price": 5000000,
          "propertyType": "apartment",
          "listingType": "sale",
          "status": "available",
          "images": ["..."],
          "address": { "city": "...", "state": "..." },
          "bedrooms": 3,
          "bathrooms": 2,
          "area": 1500,
          "createdAt": "..."
        },
        "createdAt": "...",
        "updatedAt": "..."
      }
    ],
    "pagination": { "total": 1, "page": 1, "pages": 1, "limit": 10 }
  }
}
```
- Populates property summary only; never exposes agent user documents.

### POST /api/bookmarks
- Auth: Required (`requireAuth`).
- Body: `{ "propertyId": "<valid ObjectId>" }`.
- Success `201` (new bookmark) or `200` (already existed, idempotent):
```json
{
  "success": true,
  "data": {
    "bookmark": { "_id": "...", "user": "...", "property": "...", "createdAt": "...", "updatedAt": "..." },
    "alreadyExists": false
  }
}
```
- Errors: `400 VALIDATION_ERROR` (missing propertyId), `400 INVALID_ID` (malformed ObjectId), `404 NOT_FOUND` (unknown property).

### DELETE /api/bookmarks/:propertyId
- Auth: Required (`requireAuth`).
- Param: `propertyId`.
- Success `200`: `{ "success": true, "data": { "removed": true } }` (or `false` if non-existent). Idempotent.
- Errors: `400 INVALID_ID` (malformed ObjectId).

### GET /api/bookmarks/ids
- Auth: Required (`requireAuth`).
- Success `200`: `{ "success": true, "data": { "ids": ["<propertyId>", ...] } }`.
- Lightweight array of bookmarked property ID strings for frontend hydration.

## Inquiry API (S5)

All inquiry endpoints require authentication (`requireAuth` middleware).

### POST /api/inquiries
- Auth: Required (`requireAuth`).
- Body: `{ "propertyId": "...", "name": "...", "email": "...", "phone": "...", "message": "..." }`.
- Validation:
  - `propertyId`: required valid ObjectId, must reference an existing property with an assigned agent.
  - `name`: required, 1–120 characters, trimmed.
  - `email`: required, valid email format, max 254 characters, trimmed, lowercase.
  - `phone`: optional, max 20 characters, trimmed.
  - `message`: required, 10–2000 characters, trimmed.
- Security Invariants:
  - `buyer` is forced to `req.user.id`.
  - `agent` is derived server-side from `property.agent` (never client-specified).
  - `status` is forced to `pending`.
- Success `201`:
```json
{
  "success": true,
  "data": {
    "inquiry": {
      "_id": "...",
      "property": "...",
      "buyer": "...",
      "agent": "...",
      "name": "...",
      "email": "...",
      "phone": "...",
      "message": "...",
      "status": "pending",
      "createdAt": "...",
      "updatedAt": "..."
    }
  }
}
```
- Errors: `400 VALIDATION_ERROR`, `400 INVALID_ID`, `404 NOT_FOUND`.

### GET /api/inquiries
- Auth: Required (`requireAuth`).
- Returns only inquiries where `buyer == req.user.id`.
- Query: `page` (default 1), `limit` (default 10, max 50).
- Ordering: `createdAt DESC`, then `_id DESC`.
- Success `200`: Paginated inquiries with populated property summary (`title`, `price`, `images`, `address.city`, `address.state`, `listingType`).

## Property Management API (S6)

Agent/Admin listing management. All mutating endpoints require authentication (`requireAuth`) and role `agent` or `admin` (`requireRole('agent','admin')` → `403 FORBIDDEN` for buyers). Ownership is enforced by the `requireOwnership(Model, ownerField)` middleware (`server/src/middlewares/ownership.middleware.js`): agents may only manage their own listings; admins may manage any property ("Edit any property" per `docs/06-auth-rbac.md`).

**POST /api/properties**
- Auth: `requireAuth` + `requireRole('agent','admin')`.
- Body: full property payload — `title`, `description`, `price`, `propertyType`, `listingType`, `location` (`{ "type": "Point", "coordinates": [lng, lat] }`), `address` (`street`, `city`, `state`, `zipCode`, optional `country` default `"India"`), optional `bedrooms`, `bathrooms`, `area`, `amenities` (array of strings), `images` (array of remote `http(s)` URLs).
- Server invariants:
  - `agent` is forced to `req.user.id`; client-supplied `agent`, `_id`, `status`, and unknown fields are ignored.
  - `status` always starts as `available`.
- Validation limits: `title` ≤ 200, `description` ≤ 5000, `street` ≤ 200, `city`/`state` ≤ 100, `zipCode` ≤ 20, `country` ≤ 100; `price`/`bedrooms`/`bathrooms`/`area` ≥ 0 finite numbers; `amenities` ≤ 30 entries (≤ 100 chars each); `images` ≤ 20 entries (≤ 500 chars each, must match `http(s)://`); `location` must be a valid GeoJSON Point with in-range coordinates (lng ∈ [-180,180], lat ∈ [-90,90]).
- Success `201`:
```json
{ "success": true, "data": { "property": { "...": "complete Property object" } } }
```
- Errors: `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`.

**GET /api/properties/mine**
- Auth: `requireAuth` + `requireRole('agent','admin')`.
- Returns only properties where `agent == req.user.id` (all statuses).
- Query: `page` (default 1, min 1), `limit` (default 10, min 1, max 50).
- Ordering: `createdAt DESC`, then `_id DESC`.
- Success `200`: `{ "properties": [...], "pagination": { "total", "page", "pages", "limit" } }`.

**PATCH /api/properties/:id**
- Auth: `requireAuth` + `requireRole('agent','admin')` + ownership (owning agent or admin).
- Partial update: only supplied fields are validated and updated; at least one updatable field is required, otherwise `400 VALIDATION_ERROR`. Updatable: `title`, `description`, `price`, `propertyType`, `listingType`, `location` (full GeoJSON Point), `address` (full address object), `bedrooms`, `bathrooms`, `area`, `amenities`, `images`. `agent` is immutable through this API. `status` is server-managed: it is ignored on update (a payload supplying only `status` returns `400 VALIDATION_ERROR`); listing-status transitions belong to a future transactional workflow, not direct client PATCH.
- Success `200`: `{ "success": true, "data": { "property": { "...": "complete Property object" } } }`.
- Errors: `400 INVALID_ID` (malformed id), `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN` (non-owner agent), `404 NOT_FOUND`.

**DELETE /api/properties/:id**
- Auth: same as PATCH.
- Behavior: deletes the property and removes any bookmarks referencing it (bookmarks are pure references). Inquiries are retained as business records; their `property` population resolves to `null`.
- Success `200`: `{ "success": true, "data": { "deleted": true } }`.
- Errors: `400 INVALID_ID`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 NOT_FOUND`.

## Agent Inquiry API (S6)

**GET /api/inquiries/agent**
- Auth: `requireAuth` + `requireRole('agent','admin')`.
- Returns only inquiries where `agent == req.user.id` (the agent's inbox).
- Query: `page` (default 1, min 1), `limit` (default 10, min 1, max 50). Ordering: `createdAt DESC`, then `_id DESC`.
- Success `200`: paginated inquiries with populated property summary (`title`, `price`, `images`, `address.city`, `address.state`, `listingType`).

**PATCH /api/inquiries/:id/status**
- Auth: `requireAuth` + `requireRole('agent','admin')` + ownership (`agent == req.user.id`; admins manage exactly the inquiries addressed to them — cross-agent inquiry administration is reserved for the S7 admin platform).
- Body: `{ "status": "responded" | "closed" }`. `pending` is not accepted as a management transition (inquiries are created `pending`).
- Success `200`: `{ "success": true, "data": { "inquiry": { "...": "updated Inquiry object" } } }`.
- Errors: `400 INVALID_ID`, `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 NOT_FOUND`.

## Admin API (S7)

All `/api/admin/*` endpoints independently enforce `requireAuth` followed by `requireRole('admin')` — anonymous `401 UNAUTHORIZED`, buyer/agent `403 FORBIDDEN`. Frontend protection is never a security boundary. Pagination follows the project convention (`page` default 1 min 1, `limit` default 10 min 1 max 50; deterministic ordering `createdAt DESC`, then `_id DESC`; out-of-range pages return empty arrays with HTTP 200).

**GET /api/admin/stats**
- Auth: `requireAuth` + `requireRole('admin')`.
- Purpose: lightweight platform overview for the admin dashboard. No historical analytics, trends, or aggregation infrastructure (S14 concern).
- Success `200`:
```json
{
  "success": true,
  "data": {
    "users": { "total": 5, "byRole": { "buyer": 2, "agent": 2, "admin": 1 } },
    "properties": {
      "total": 12,
      "byStatus": { "available": 9, "under_offer": 1, "sold": 1, "rented": 1 },
      "byListingType": { "sale": 8, "rent": 4 }
    },
    "inquiries": { "total": 7, "byStatus": { "pending": 3, "responded": 2, "closed": 2 } },
    "recentProperties": [
      { "_id": "...", "title": "...", "price": 8500000, "propertyType": "apartment", "listingType": "sale", "status": "available", "createdAt": "..." }
    ],
    "recentInquiries": [
      { "_id": "...", "name": "...", "email": "...", "status": "pending", "createdAt": "...", "property": { "_id": "...", "title": "..." } }
    ]
  }
}
```
- `recentProperties` / `recentInquiries` are the 5 newest documents (`createdAt DESC`, `_id DESC`). Deleted properties in `recentInquiries` resolve `property: null`.

**GET /api/admin/users**
- Auth: `requireAuth` + `requireRole('admin')`.
- Query: `page`, `limit`, `role` (whitelist `buyer|agent|admin`; invalid values ignored), `search` (case-insensitive regex-escaped partial match on `name` or `email`; unknown fields ignored; raw query never reaches MongoDB).
- Ordering: `createdAt DESC`, then `_id DESC`.
- Success `200`: `{ "users": [ { "id", "name", "email", "role", "createdAt", "updatedAt" } ], "pagination": { "total", "page", "pages", "limit" } }`.
- Serialization guarantee: `passwordHash` (and any other internal field) is never returned.

**POST /api/admin/users** (controlled provisioning — ADR-021)
- Auth: `requireAuth` + `requireRole('admin')`.
- Body: `{ "name": string, "email": string, "password": string, "role": "agent" | "admin" }`.
- Validation: `name` required ≤ 120; `email` format + uniqueness (case-insensitive); `password` 8–72 characters (bcrypt cost 10 via the existing password utility); `role` strictly whitelisted to `agent` or `admin`.
- Never client-controlled: `_id`, `passwordHash`, `createdAt`, `updatedAt`, `role` values outside the whitelist, and any other model field — extra payload keys are ignored (whitelist sanitization in the service).
- The created account receives no session/cookies (provisioning is not a login). Public `POST /api/auth/register` remains unchanged and buyer-only.
- Success `201`: `{ "success": true, "data": { "user": { "id", "name", "email", "role" } } }`.
- Errors: `400 VALIDATION_ERROR`, `409 EMAIL_TAKEN`, `401 UNAUTHORIZED`, `403 FORBIDDEN`.

**PATCH /api/admin/users/:id/role** (role management — ADR-021)
- Auth: `requireAuth` + `requireRole('admin')`.
- Body: `{ "role": "buyer" | "agent" | "admin" }` — strictly whitelisted; any other payload field is ignored; `passwordHash` and other protected fields can never be written through this endpoint.
- Server-side protections:
  1. `400 INVALID_ID` for malformed target id.
  2. `404 NOT_FOUND` for unknown target user.
  3. `400 VALIDATION_ERROR` for missing/invalid role.
  4. `403 FORBIDDEN` self-role-change: an admin cannot change their own role (prevents self-demotion lockout and any self-escalation path).
  5. `403 FORBIDDEN` last-admin protection: the role change that would demote the only remaining admin is rejected (enforced server-side by counting admins before the write).
- Success `200`: `{ "success": true, "data": { "user": { "id", "name", "email", "role" } } }`.
- Token/session semantics: role changes are effective in the database immediately, but an already-issued access token carries its old `role` claim until it expires (15 minutes); the next refresh reissues the current role. Clients must not pretend the change is instant for live sessions.

**GET /api/admin/properties**
- Auth: `requireAuth` + `requireRole('admin')`.
- Purpose: cross-listing moderation view (all agents' listings, all statuses).
- Query: `page`, `limit`, `search` (`$text` on title/description/address.city), `city`, `status` (whitelist `available|under_offer|sold|rented`), `listingType` (`sale|rent`), `propertyType` (existing enum), `agent` (valid ObjectId filter). Invalid filter values are ignored.
- Ordering: `createdAt DESC`, then `_id DESC`.
- Success `200`: `{ "properties": [ { ...property, "agent": { "id", "name", "email", "role" } } ], "pagination": { ... } }`. `agent` populates only safe identity fields.
- This endpoint is read-only. Admin listing edits/deletes reuse the existing S6 `PATCH/DELETE /api/properties/:id` with the `requireOwnership` admin override — there is no parallel admin mutation API. Property `status` remains protected exactly as in S6 (client-supplied `status` is ignored on update). No approve/reject/verify operations exist in S7.

**GET /api/admin/inquiries**
- Auth: `requireAuth` + `requireRole('admin')`.
- Purpose: cross-agent inquiry administration.
- Query: `page`, `limit`, `status` (whitelist `pending|responded|closed`).
- Ordering: `createdAt DESC`, then `_id DESC`.
- Success `200`: `{ "inquiries": [ { ...inquiry, "property": { "_id", "title", "price", "images", "address.city", "address.state", "listingType" } | null, "buyer": { "id", "name", "email" } | null, "agent": { "id", "name", "email" } | null } ], "pagination": { ... } }`.
- Deleted properties/users resolve to `null`; consumers must handle it ("Listing no longer available").

**PATCH /api/admin/inquiries/:id/status**
- Auth: `requireAuth` + `requireRole('admin')` + `requireOwnership(Inquiry, 'agent', { allowAdmin: true })` (explicit admin route; the S6 agent route remains strictly agent-scoped and unchanged).
- Body: `{ "status": "responded" | "closed" }` — same transition semantics as the S6 agent endpoint; `pending` is not accepted.
- Success `200`: `{ "success": true, "data": { "inquiry": { ...updated } } }`.
- Errors: `400 INVALID_ID`, `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 NOT_FOUND`.

Admin error vocabulary reuses existing codes only: `UNAUTHORIZED`, `FORBIDDEN`, `VALIDATION_ERROR`, `EMAIL_TAKEN`, `INVALID_ID`, `NOT_FOUND`, `INTERNAL_SERVER_ERROR`.

## Authorization
Every protected endpoint must explicitly define required authentication and role/ownership rules.

Frontend route protection is not a security boundary.
