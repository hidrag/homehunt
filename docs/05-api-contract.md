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
  - `lat` + `lng` + `radiusKm` (S11, ADR-031): radius search — `$geoWithin $centerSphere` with the centre at `[lng, lat]` and radius `radiusKm / 6378.1` radians. **Strict-validate-on-present**: these three are an all-or-none group; `lat ∈ [-90, 90]`, `lng ∈ [-180, 180]`, `radiusKm ∈ (0, 100]`, all finite. Any malformed/partial geo input returns `400 GEO_INVALID` (never ignored, never degraded to an unbounded scan).
  - `bounds` (S11, ADR-031 + amendment): viewport bounding box `minLat,minLng,maxLat,maxLng` — `$geoWithin $geometry` closed GeoJSON Polygon (2dsphere index-accelerated; legacy `$box` rejected after `explain()` showed COLLSCAN). Exactly 4 finite scalars; `minLat ≤ maxLat`, `minLng ≤ maxLng`; out-of-range or antimeridian-crossing values return `400 GEO_INVALID`. Combining `bounds` with a radius ANDs both clauses. No `$nearSphere` anywhere (sort/pagination contracts are preserved).
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
- **Geospatial errors (S11, ADR-031)**: malformed or partial `lat`/`lng`/`radiusKm`/`bounds` return `400` with `error.code = "GEO_INVALID"` (strict-validate-on-present; never silently ignored).

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
  - `images`: Array of URL strings is preserved in exact database order. (S13: storage normalizes images to objects; public payloads keep the URL-string array contract via server-side flattening — ADR-036.)
  - `priceHistory` (S14 addition, ADR-037): ascending array of `{ price, changedAt }` — the previous price at each recorded change (bounded at 50 entries). Maintained only by the server update funnel; never client-writable; no internal actor metadata is exposed.
  - `verificationStatus` / `verifiedAt` / `rejectionReason` / `virtualTourUrl` (S13, ADR-036) are present for every listing; `verificationStatus` defaults to `'unverified'`. These fields are server-managed and are never client-writable (ignored on create/update mass-assignment).
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

## Visit API (S8)

All visit endpoints require authentication (`requireAuth`). Role gates are enforced server-side; frontend route guards are UX only. Pagination follows the project convention (`page` default 1 min 1, `limit` default 10 min 1 max 50; ordering `startAt ASC`, then `_id ASC`; out-of-range pages return empty arrays with HTTP 200). Status filters are whitelist-only — unknown values are ignored, never interpolated into a database query.

### POST /api/visits
- Auth: `requireAuth` + `requireRole('buyer')` (agents and admins receive `403 FORBIDDEN`).
- Body: `{ "propertyId": "<valid ObjectId>", "startAt": "<ISO 8601 with Z or ±HH:MM>", "endAt": "<ISO 8601 with Z or ±HH:MM>", "timezone": "<IANA name, optional>", "note": "<string ≤2000, optional>" }`.
- Server invariants: `buyer` is forced to `req.user.id`; `agent` is derived server-side from `Property.agent`; `status` is forced to `pending`; `timezone` defaults to `Asia/Kolkata` and the legacy alias `Asia/Calcutta` is normalized to it; client-supplied `buyer`, `agent`, `status`, `cancelledAt`, `cancelledBy`, and unknown fields are ignored.
- Validation: property must exist and be `available` (`404 NOT_FOUND` / `409 PROPERTY_UNAVAILABLE`); start must be in the future; duration must be 30–120 minutes inclusive; start must be within 30 days; timestamps must carry an explicit zone designator; an identical active (pending/confirmed) visit for the same buyer/property/slot is rejected `409 DUPLICATE_VISIT`.
- Success `201`: `{ "success": true, "data": { "visit": { ...Visit object } } }`.
- Errors: `400 INVALID_ID`, `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 NOT_FOUND`, `409 DUPLICATE_VISIT`, `409 PROPERTY_UNAVAILABLE`.

### GET /api/visits
- Auth: `requireAuth` + `requireRole('buyer')`.
- Returns only visits where `buyer == req.user.id`, with populated `property` summary (`title`, `price`, `images`, `address.city`, `address.state`, `listingType`), `buyer` (`name`, `email`), and `agent` (`name`, `email`). Deleted properties resolve `property: null`.
- Query: `page`, `limit`, `status` (whitelist `pending|confirmed|declined|cancelled|completed`; invalid values ignored).
- Success `200`: `{ "visits": [...], "pagination": { "total", "page", "pages", "limit" } }`.

### GET /api/visits/agent
- Auth: `requireAuth` + `requireRole('agent')`.
- Returns only visits where `agent == req.user.id` (the agent's inbox), same population and pagination conventions as the buyer list.

### PATCH /api/visits/:id/status
- Auth: `requireAuth` + `requireRole('buyer','agent')` (admins receive `403` — they must use the admin route).
- Body: `{ "status": "confirmed" | "declined" | "cancelled" | "completed" }`.
- Role ceilings: buyers may only submit `cancelled` (any other target is `409 INVALID_STATUS_TRANSITION`); agents may confirm/decline from `pending` and complete/cancel from `confirmed`. Admins obey the exact same state machine — there is deliberately no admin transition bypass.
- Ownership: the visit's `buyer` (buyer role) or `agent` (agent role) must equal `req.id`; otherwise `404 NOT_FOUND` (never `403`, so visit existence is not enumerable).
- Confirmation additionally requires the property to still exist and be `available` (`409 PROPERTY_UNAVAILABLE`) and checks for overlapping confirmed visits of the same agent (`409 SCHEDULE_CONFLICT`; strict inequality, so boundary-touching appointments are allowed).
- Success `200`: `{ "success": true, "data": { "visit": { ...updated Visit } } }`.
- Errors: `400 INVALID_ID`, `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 NOT_FOUND`, `409 INVALID_STATUS_TRANSITION`, `409 PROPERTY_UNAVAILABLE`, `409 SCHEDULE_CONFLICT`.

### GET /api/admin/visits
- Auth: `requireAuth` + `requireRole('admin')`.
- Cross-agent administration view (all visits, any agent). Query: `page`, `limit`, `status` (whitelist as above), `agent` (valid ObjectId filter; malformed values return `400 INVALID_ID`).
- Success `200`: paginated visits with safe `buyer`/`agent` summaries (`name`, `email` only — never `passwordHash`) and `property` summary or `null`.

### PATCH /api/admin/visits/:id/status
- Auth: `requireAuth` + `requireRole('admin')`.
- Same transition semantics and error vocabulary as the shared route; admins drive the same state machine on any visit.
- Success `200`: `{ "success": true, "data": { "visit": { ...updated Visit } } }`.

### Visit email events (S8)
Transactional email is best-effort (ADR-024): `requested` → buyer + agent; `confirmed` → buyer; `declined` → buyer; `buyer_cancelled` → agent; `agent_cancelled` → buyer; `completed` → none; admin cancellation → none. Recipients are always derived from persisted user documents; provider failures never fail the DB mutation and are never returned to the client.

### Socket.io endpoints/outbound
- `notification:new` to room `user:${recipientId}` — delivered after the Notification document persists (ADR-030). Every authenticated socket auto-joins its own user room on connection; clients emit nothing for notifications.

## Saved Search API (S10)

All saved-search endpoints require authentication and are **buyer-only** (`requireAuth` + `requireRole('buyer')`; agents/admins receive `403 FORBIDDEN`). `user` is always `req.user.id`; every `:id` route is owner-scoped and returns `404 NOT_FOUND` for non-owners (enumeration guard). Criteria keys are whitelisted and type-validated at save; the Mongo filter is rebuilt at every execution (ADR-029).

### POST /api/saved-searches
- Body: `{ "name": "<1–80 chars>", "criteria": { "search"?, "city"?, "propertyType"?, "listingType"?, "minPrice"?, "maxPrice"?, "bedrooms"?, "sort"?, "lat"?, "lng"?, "radiusKm"? }, "frequency"?: "instant" }`.
- Validation: `name` required, trimmed, ≤80; criteria values validated against the public-listing whitelist/ranges (unknown keys ignored; inverted price range rejected `400`); S11 geo trio `lat`/`lng`/`radiusKm` is **all-or-none** with lat ∈ [-90,90], lng ∈ [-180,180], radiusKm ∈ (0,100] (`400 VALIDATION_ERROR` on violation); `frequency` only `instant` — `daily` → `400 VALIDATION_ERROR` ("Daily digest is not supported in this version").
- Cap: max **20 active** saved searches per user → `429 SEARCH_LIMIT`.
- Success `201`: `{ "success": true, "data": { "savedSearch": { ...SavedSearch } } }`.

### GET /api/saved-searches
- Owner's searches, newest activity first (`updatedAt DESC`), standard pagination envelope `{ "savedSearches": [...], "pagination": { ... } }`.

### GET /api/saved-searches/:id — owner's document or `404 NOT_FOUND`.

### PATCH /api/saved-searches/:id
- Body (any subset): `{ "name"?, "criteria"?, "frequency"?, "active"? }`, validated identically to POST. Own-only, `404` otherwise. Success `200` with the updated document.

### DELETE /api/saved-searches/:id — owner's document is removed; `404` for non-owners; success `200 { "deleted": true }`.

### POST /api/saved-searches/:id/run
- Executes the stored criteria through the shared filter builder against live listings.
- Success `200`: `{ "success": true, "data": { "properties": [...], "pagination": { ... }, "query": "?listingType=sale&minPrice=..." } }` — `query` is the canonical `/listings` querystring for deep-linking.
- Errors: `400 INVALID_ID`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 NOT_FOUND`.

## Notification API (S10)

Notification endpoints require authentication (`requireAuth`) for **any role** — buyers receive `listing_match`/`visit_update`/`message_alert`, agents receive `visit_update`/`message_alert`/`inquiry_update`. Every notification is strictly personal: `recipient` is always server-derived, list/count operations are scoped to `req.user.id`, and `:id` operations are recipient-scoped with `404 NOT_FOUND` on miss. There is no admin cross-user notification access (per-domain admin audit lists already exist).

### GET /api/notifications
- Query: `page`, `limit` (standard 10/50 clamp), optional `unread=true|false` (whitelisted; other values ignored). Ordering `createdAt DESC, _id DESC`.
- Success `200`: `{ "notifications": [...], "pagination": { ... } }`.

### GET /api/notifications/unread-count
- Success `200`: `{ "success": true, "data": { "unread": 3 } }`.

### PATCH /api/notifications/:id/read
- Sets `read: true` + `readAt` (idempotent). Recipient-only, `404` otherwise. Returns the updated notification.

### PATCH /api/notifications/read-all
- Marks all of the caller's unread notifications read in one atomic update. Success `200`: `{ "success": true, "data": { "updated": N } }`.

### DELETE /api/notifications/:id
- Recipient-scoped dismissal (locked decision 5 — retention is otherwise indefinite). Success `200 { "deleted": true }`; `404` for non-owners.

### Event matrix (ADR-030, locked)
| Event | In-app | Email |
|---|---|---|
| `listing_match` — new listing matches a saved search | ✅ buyer | ✅ |
| `visit_update` — visit confirmed/declined/cancelled | ✅ affected party | — (S8 emails preserved) |
| `inquiry_update` — new inquiry submitted | ✅ agent | ✅ agent |
| `message_alert` — new chat message | ✅ recipient | — |
| `verification_update` — admin approve/reject decision (S13, ADR-036) | ✅ listing owner (agent) | — |
Notification/email failures never fail the primary mutation (`[NOTIFY_ERROR]`/`[MATCH_ERROR]`/`[PRICE_DROP_ERROR]` logged only). Price-drop alerts delivered in S14 (ADR-037):

| `price_drop` — listing price decreased & still matches an active saved search (S14, ADR-037) | ✅ search owner (buyer) | ✅ search owner |

## Authorization
Every protected endpoint must explicitly define required authentication and role/ownership rules.

Frontend route protection is not a security boundary.

## Conversation API (S9)

All conversation endpoints require authentication (`requireAuth`). Pagination follows the project convention (`page` default 1 min 1, `limit` default 10 min 1 max 50 — messages default 20; out-of-range pages return empty arrays with HTTP 200). A conversation is identified by `(property, buyer)`; the `agent` is always derived from `Property.agent` and the `buyer`/`sender` from `req.user.id` (ADR-018 pattern). Message history is returned newest-first (`createdAt DESC, _id DESC`). Message lifecycle is append-only — there is no edit or delete endpoint.

### POST /api/conversations
- Auth: `requireAuth` + `requireRole('buyer')` (agents and admins receive `403 FORBIDDEN`).
- Body: `{ "propertyId": "<valid ObjectId>", "body": "<1–2000 chars>" }`.
- Behaviour: **idempotent on `(property, buyer)`** — reuses the existing thread when one exists, otherwise creates it; persists the opening message, sets `lastMessage`, and increments `agentUnread`. Emits `message:new` to the conversation room (no-op without a socket server).
- Server invariants: `buyer` forced to `req.user.id`; `agent` derived from `Property.agent`; client-supplied `buyer`, `agent`, `sender`, `readAt`, unread counters and unknown fields are ignored.
- Validation: property must exist (`404 NOT_FOUND`); `body` required, trimmed, 1–2000 characters (`400 VALIDATION_ERROR`); malformed `propertyId` → `400 INVALID_ID`.
- Success `201` (new thread) / `200` (existing thread): `{ "success": true, "data": { "conversation": { ...Conversation }, "message": { ...Message } } }`.
- Errors: `400 INVALID_ID`, `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 NOT_FOUND`.

### GET /api/conversations
- Auth: `requireAuth` + `requireRole('buyer','agent')`.
- Role-scoped inbox: buyers see threads where `buyer == req.user.id`, agents see threads where `agent == req.user.id`.
- Populates `property` summary (`title`, `price`, `images`, `address.city`, `address.state`, `listingType` — `null` when deleted) and safe `buyer`/`agent` summaries (`name`, `email`; never `passwordHash`). Ordered by newest activity (`updatedAt DESC`, `_id DESC`).
- Success `200`: `{ "conversations": [...], "pagination": { "total", "page", "pages", "limit" } }`.

### GET /api/conversations/unread-count
- Auth: `requireAuth` + `requireRole('buyer','agent')`.
- Sums the caller's unread counter across all their conversations (the buyer's `buyerUnread` plus the agent's `agentUnread` where the caller is the respective participant).
- Success `200`: `{ "success": true, "data": { "unread": 3 } }`.

### GET /api/conversations/:id/messages
- Auth: `requireAuth` + `requireRole('buyer','agent')`; **participants only** — a non-participant receives `404 NOT_FOUND` (enumeration guard, never `403`).
- Query: `page`, `limit` (default 20, max 50). Ordering: `createdAt DESC`, `_id DESC`.
- Success `200`: `{ "messages": [ { ...Message, "sender": { "name", "email" } } ], "pagination": { ... } }`.
- Errors: `400 INVALID_ID`, `401 UNAUTHORIZED`, `403 FORBIDDEN` (admin at the role gate), `404 NOT_FOUND`.

### POST /api/conversations/:id/messages
- Auth: `requireAuth` + `requireRole('buyer','agent')`; **participants only** (`404` otherwise).
- Body: `{ "body": "<1–2000 chars>" }`. `sender` is always `req.user.id`.
- Behaviour: validates → persists the message → updates `lastMessage` → atomically `$inc`s the **other** participant's unread counter → emits `message:new` to the room. **REST is the only send path** (ADR-026); no client-to-server socket message event exists.
- Success `201`: `{ "success": true, "data": { "conversation": { ...updated }, "message": { ...Message } } }`.
- Errors: `400 INVALID_ID`, `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 NOT_FOUND`.

### POST /api/conversations/:id/read
- Auth: `requireAuth` + `requireRole('buyer','agent')`; **participants only** (`404` otherwise).
- Behaviour: zeroes the caller's unread counter and stamps `readAt` on the other participant's previously-unread messages; emits `conversation:updated` to the room.
- Success `200`: `{ "success": true, "data": { "conversation": { ...updated } } }`.
- Errors: `400 INVALID_ID`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 NOT_FOUND`.

### GET /api/admin/conversations
- Auth: `requireAuth` + `requireRole('admin')`.
- Cross-marketplace audit view (read-only). Query: `page`, `limit`. Newest activity first.
- Success `200`: paginated conversations with safe `buyer`/`agent` summaries and `property` summary or `null`.

### GET /api/admin/conversations/:id/messages
- Auth: `requireAuth` + `requireRole('admin')`.
- Read-only message history for **any** conversation (admins are not participants but may audit). Query: `page`, `limit`.
- Success `200`: `{ "messages": [...], "pagination": { ... } }`. Errors: `400 INVALID_ID`, `404 NOT_FOUND`.

### Socket.io events (S9)
- Handshake: authenticated by the `hh_access` cookie via `verifyAccessToken`; failures reject the connection with `AUTH_UNAUTHORIZED` (no unauthenticated socket ever attaches).
- Client → server: `conversation:join` (participants only; non-participants receive `{ error: 'NOT_FOUND' }` and are disconnected), `conversation:leave`.
- Server → client: `message:new` (sanitized message document, emitted after the DB write), `conversation:updated` (unread/lastMessage refresh after a read).
- Admins never join rooms and cannot post (S9 locked decision).

## Neighborhood API (S12)

### GET /api/properties/:id/neighborhood
- Auth: none (public read, exact parity with `GET /api/properties/:id`).
- Params: `id` (ObjectId). Query:
  - `radiusKm` (optional): search radius in km, default `3`, strict range `(0, 10]`. Malformed/out-of-range values return `400 GEO_INVALID` (ADR-031 strict-validate-on-present reused; the cap is also the spatial-scan DoS bound). Objects/arrays/NaN are rejected before any query is built.
  - `category` (optional, repeatable): whitelist `transit|school|grocery|healthcare|park`. Unknown or malformed values are silently ignored. When provided, only the listed categories appear in the `categories` map — the walk score ALWAYS computes from all in-range POIs.
- Success `200`:
```json
{
  "success": true,
  "data": {
    "neighborhood": {
      "property": "<id>",
      "radiusKm": 3,
      "dataAvailable": true,
      "walkScore": {
        "total": 74,
        "weights": { "transit": 0.3, "school": 0.2, "grocery": 0.2 },
        "categories": { "transit": 0.8, "school": 0.4, "grocery": 1, "healthcare": 0, "park": 0.6 },
        "constants": { "nearM": 400, "maxUsefulM": 1600, "saturation": 5, "walkMetersPerMinute": 80 }
      },
      "categories": {
        "transit": [
          { "id": "<poiId>", "name": "Carter Road Metro Station", "category": "transit",
            "distanceMeter": 850, "walkMinutes": 11,
            "location": { "type": "Point", "coordinates": [72.828, 19.056] } }
        ]
      }
    }
  }
}
```
- Each category array is sorted by `distanceMeter` ASC and capped at the 10 nearest entries. `walkMinutes = ceil(distanceMeter / 80)` (4.8 km/h, deterministic).
- **Zero POIs in range:** `dataAvailable: false`, `walkScore: null`, every category array empty — never a 0 score (locked S12 decision 3; ADR-034).
- Errors: `400 INVALID_ID` (malformed ObjectId), `400 GEO_INVALID` (bad radius), `404 NOT_FOUND` (unknown id).
- Scoring formula published in ADR-034; weights/constants are a breaking-change surface.

## Media & Verification API (S13, ADR-036)

Access model: every media route requires authentication. The owning agent and admins may access; **any other authenticated caller receives `404 NOT_FOUND` — never 403** (existence itself is access-controlled; enumeration guard per ADR-030). Uploads are `multipart/form-data` with field name `files`. Bytes never sit at an unrestricted public URL; provider ids are opaque to clients.

Upload limits (server-enforced; multer memoryStorage + magic-byte sniffing per ADR-035):
- Images: JPEG / PNG / WEBP, ≤ 5 MB per file, ≤ 5 files per request, ≤ 20 per property.
- Documents: PDF / JPEG / PNG / WEBP, ≤ 10 MB per file, ≤ 10 active per property.
- Declared MIME is cross-checked against sniffed content; mismatch, SVG, executables → `400 INVALID_FILE_TYPE`. Oversize → `413 FILE_TOO_LARGE`. A provider failure means the database was never touched; a post-upload DB failure destroys the orphaned asset best-effort and logs `[UPLOAD_ORPHAN_ERROR]`.

### POST /api/properties/:id/images
- Auth: agent owner or admin (media access gate).
- Success `201` → `data.images`: `[{ imageId, url, publicId, alt }]`.
- Errors: `401`, `400 INVALID_FILE_TYPE`, `400 VALIDATION_ERROR` (empty upload / per-property cap), `404`, `413`.

### GET /api/properties/:id/images
- Auth: agent owner or admin. Same object shape as above — the ONLY surface exposing normalized image objects (public property payloads keep the URL-string array contract).

### DELETE /api/properties/:id/images/:imageId
- Auth: agent owner or admin. Removes the entry and best-effort destroys the provider asset. `404` for unknown/mismatched `imageId` or foreign property.

### GET /api/properties/:id/documents
- Auth: agent owner or admin. `data.documents`: `[{ id, fileName, mimeType, byteSize, kind, uploadedAt }]` (active rows only, newest first).

### POST /api/properties/:id/documents
- Auth: agent owner or admin (multipart). Success `201` → same shape as GET.

### GET /api/properties/:id/documents/:documentId/content
- Auth: agent owner or admin. Delivery grant for the bytes: `302` to a short-lived signed provider URL (Cloudinary) or an in-band `200` stream (fake provider) with `Content-Disposition: attachment` and `Cache-Control: no-store`. `404` for removed rows, foreign properties, malformed ids.
- Client note: because delivery is cookie-authenticated and may redirect, links to content URLs are opened by the browser directly (no `fetch` body caching).

### DELETE /api/properties/:id/documents/:documentId
- Auth: agent owner or admin. Soft delete (`status: 'removed'`; audit row retained, provider asset destroyed best-effort). Idempotent for callers; second delete → `404`.

### POST /api/properties/:id/request-verification
- Auth: agent owner or admin. Requires ≥ 1 active document. Allowed from `unverified`, `rejected` or `verified` (a verified listing re-submits → `pending`, clearing `verifiedAt`/`verifiedBy`/`rejectionReason`). From `pending` → `409 INVALID_VERIFICATION_STATE`. Missing documents → `400 VALIDATION_ERROR`.

### GET /api/admin/verifications
- Auth: admin. Pending queue, oldest request first: `data.verifications`: `[{ ...publicized property, agent: {id,name,email}, documentCount }]` + pagination.

### PATCH /api/admin/properties/:id/verification
- Auth: admin. Body: `{ decision: 'approve' | 'reject', reason?: string }`. Valid ONLY from `pending` (`409` otherwise); `reject` requires a non-empty reason (≤ 500 chars). Approve sets server-derived `verifiedAt`/`verifiedBy`; reject records `rejectionReason`. Agent receives the in-app `verification_update` notification. Response `data.property` (publicized).

**Mass-assignment guard:** `verificationStatus`, `verifiedAt`, `verifiedBy`, `rejectionReason` are server-managed. The standard create/update sanitizers never pick them up — payloads attempting to set them are silently dropped, not errors (S3 convention for ignored protected fields). `status` remains protected exactly as in S6.

**Virtual tour (ADR-036):** `virtualTourUrl` on create/update is normalized to a canonical embed URL on the approved host whitelist (youtube-nocookie / vimeo player / matterport player / kuula static player). Unrecognized hosts or malformed ids → `400 VALIDATION_ERROR` with the normalization reason. Clients re-validate the stored canonical form against the same whitelist before rendering any iframe.

## Comparison & Analytics API (S14, ADR-037/038)

### GET /api/properties/compare
- Auth: none (public read, exact parity with `GET /api/properties/:id`). Declared **before** `/:id` in property.routes (route-ordering convention).
- Query: `ids` — comma-separated ObjectIds, deduplicated, 1–4 after dedupe. Empty / >4 / malformed → `400 VALIDATION_ERROR`.
- Success `200` → `data`: `{ properties: [{ …whitelisted publicized projection, pricePerSqft }], missing: ["<unknownId>"] }` — **partial results by design**: unknown/deleted ids appear in `missing`, never a whole-request 404. Request order preserved. `pricePerSqft = round(price / area)` where `area > 0`, else `null`. Mixed listing statuses allowed (badge on the client).
- No walk-score or neighborhood data embedded (would force per-column spatial sweeps); the client fetches `/api/properties/:id/neighborhood` lazily per column if needed.

### GET /api/analytics/market
- Auth: none (public discovery). Aggregates computed from public `status: "available"` listings only; no user data — see the docs/06 reading note (platform analytics remain admin-gated).
- Query: `city` (required, 1–100 chars) — exact, case-insensitive match on `address.city` via an anchored escaped pattern; user text is never a shaped regex. `listingType` optional whitelist `sale|rent` — malformed → `400 VALIDATION_ERROR`.
- Success `200` → `data.analytics`: `{ city, listingType, generatedAt, minSample, dataAvailable, stats | null }`; when available `stats = { count, avgPrice, medianPrice, minPrice, maxPrice, avgPricePerSqft }` (psf averaged per-listing where `area > 0`).
- **Sample-honesty rule:** `count < 3` → `dataAvailable: false`, `stats: null` — a one-listing "average" is never presented (ADR-034 precedent).
- Served from an in-process 10-minute TTL cache with global revision-counter invalidation on property writes (single-process boundary per ADR-026/029).

**Price history & price-drop sweep (ADR-037):** `priceHistory` is server-owned — appended by `property.service.updateProperty` only when the submitted price differs from the stored price (previous price recorded; cap 50 drop-oldest). Absent from both sanitizer pick-lists (mass-assignment silently dropped). A genuine **decrease** fires `sweepPriceDrops` fire-and-forget: active saved searches whose `buildPropertyFilter` criteria still match the listing (ADR-029 single matching implementation) notify their owner (`price_drop`, in-app + email). Errors swallowed with `[PRICE_DROP_ERROR]`; sweeps never delay or fail the mutation.
