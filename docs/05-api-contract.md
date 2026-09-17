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

### Ownership convention (future S5+ resources)
Protected resource endpoints must define their required authentication and role/ownership rules. The repository-wide convention is `requireOwnership(resource, ownerField)`: `req.user.id` must equal `resource[ownerField]`, otherwise `403 FORBIDDEN`. No S4 endpoint implements ownership checks because S4 introduces no agent-owned resource.

## Authorization
Every protected endpoint must explicitly define required authentication and role/ownership rules.

Frontend route protection is not a security boundary.
