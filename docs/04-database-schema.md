# HomeHunt — Database Schema Contract

## Database
MongoDB Atlas with Mongoose.

## Collections
- users
- sessions
- properties
- bookmarks
- inquiries
- visits
- savedSearches
- conversations
- messages
- notifications
- analyticsEvents
- propertyDocuments

## Property location contract
Use GeoJSON Point:

```js
location: {
  type: "Point",
  coordinates: [longitude, latitude]
}
```

A `2dsphere` index is required for geospatial queries. **(S11 reality: `propertySchema.index({ location: '2dsphere' })` has shipped since S1 and is consumed since S11 by `$geoWithin $centerSphere` / `$geometry` Polygon — no `$nearSphere`, no legacy `$box`, no new index; see ADR-031.)**

*Important Coordinate Ordering Note (S3)*:
- MongoDB and GeoJSON specification strictly enforce `[longitude, latitude]`.
- Map display engines (Leaflet, OpenStreetMap) and typical geographic coordinates expect `[latitude, longitude]`.
- Frontend integration layers must explicitly invert coordinates before passing them to Leaflet (e.g., via `client/src/lib/propertyLocation.js`). Never alter the database storage ordering.

## Property relationship expectations
A property should reference its responsible agent/owner using an explicit identifier. Do not infer ownership from arbitrary frontend data.

## Naming
Use consistent camelCase field names in application code.

## Schema change rule
Before adding, removing, or renaming a field:
1. Search the repository for all usages.
2. Check API contracts.
3. Check seed/test data.
4. Update this document.
5. Update affected code and tests together.

## Indexing
Indexes must be documented when they are introduced, especially for:
- location
- search/sort fields
- ownership
- unique user identity fields
- timestamps used in analytics

## Sensitive data
Passwords are never stored in plaintext.
Private documents must not be made publicly accessible by default.

## Property Schema Fields (S1)
The `Property` model enforces the following core domain fields:

**Required Fields:**
- `title` (String)
- `description` (String)
- `price` (Number, representing INR)
- `propertyType` (String, enum: `['apartment', 'house', 'villa', 'condo', 'land']`)
- `listingType` (String, enum: `['sale', 'rent']`)
- `status` (String, enum: `['available', 'under_offer', 'sold', 'rented']`, default: `'available'`)
- `location` (GeoJSON Point per location contract)
- `address` (Object: `street`, `city`, `state`, `zipCode`, `country`)
- `agent` (ObjectId, ref: `'User'`)

**Optional Fields:**
- `bedrooms` (Number)
- `bathrooms` (Number)
- `area` (Number, square feet)
- `amenities` (Array of Strings)
- `images` (Array of Strings: remote URLs; `images[0]` serves as primary thumbnail across cards and previews; all elements are rendered sequentially in `PropertyGallery`)

**Timestamps:**
- `createdAt`, `updatedAt` (Mongoose timestamps)

**Indexes:**
- `location` (`2dsphere`)
- `address.city` (1)
- `propertyType` (1)
- `listingType` (1)
- `title`, `description`, `address.city` (`text`)
- `{ agent: 1, createdAt: -1 }` — agent dashboard listing (S6), newest first

### Text Index Limitations & Behavior (S2)
The text index on `{ title: "text", description: "text", "address.city": "text" }` provides keyword search using MongoDB's `$text` operator.
- Limitations: It is word/token-based and does not support true arbitrary substring, infix, or autocomplete matching.
- Sorting: Results are ordered strictly by the user's selected `sort` parameter (or default `createdAt DESC`), never forced by `$meta` text relevance score.

*Note on S1 agent reference:* During Sprint 1, before the `User` domain is implemented, the `agent` reference contains a deterministic, synthetically generated ObjectId inserted by the seed script. S1/S2 APIs must not attempt to populate the `User` document for this field.

## User Schema (S4)

Collection: `users`

**Fields:**
- `_id` (ObjectId)
- `name` (String, required, trimmed, max 120)
- `email` (String, required, lowercase, trimmed, unique) — the unique login identity
- `passwordHash` (String, required, `select: false`; bcrypt hash; never returned through API responses)
- `role` (String, enum `['buyer', 'agent', 'admin']`, default `'buyer'`)
- `createdAt`, `updatedAt` (Mongoose timestamps)

**Indexes:**
- `email` (unique)
- `role` (1)

**Explicitly not in S4:** phone, avatar, bio, email verification, login-failure counters, session fields, profile fields.

## Session Schema (S4)

Collection: `sessions`

**Fields:**
- `_id` (ObjectId) — equals the refresh token's `jti`
- `userId` (ObjectId, ref `'User'`, required)
- `tokenHash` (String, required, unique) — SHA-256 hash of the refresh JWT; raw refresh tokens are never stored
- `familyId` (String, required) — rotation family; one family per login
- `expiresAt` (Date, required) — refresh-token expiry (issued + 7 days)
- `revokedAt` (Date, nullable) — set on rotation, logout, or family revocation
- `createdAt` (Mongoose timestamp)

**Indexes:**
- `userId` (1)
- `tokenHash` (unique)
- `familyId` (1)
- `expiresAt` (TTL, `expireAfterSeconds: 0`) — MongoDB removes expired sessions automatically

**Rotation semantics:** refresh revokes the presented session and creates its successor in the same family; presenting an already-revoked refresh token triggers reuse detection and revokes the entire family. Only safe metadata (userId, familyId, timestamp) is ever logged.

**Property relationship invariant:** `Property.agent` references `User._id`. All seeded properties reference the fixed agent id `64b000000000000000000001`; S4.1 seeds that exact user id so existing references remain valid. S1/S2 property APIs must not populate `agent` (unchanged from the S1 note above).

## Bookmark Schema (S5)

Collection: `bookmarks`

**Fields:**
- `_id` (ObjectId)
- `user` (ObjectId, ref `'User'`, required)
- `property` (ObjectId, ref `'Property'`, required)
- `createdAt`, `updatedAt` (Mongoose timestamps)

**Indexes:**
- `{ user: 1, property: 1 }` (unique) — prevents duplicate bookmarks
- `{ user: 1, createdAt: -1 }` — list ordering, newest first

## Inquiry Schema (S5)

Collection: `inquiries`

**Fields:**
- `_id` (ObjectId)
- `property` (ObjectId, ref `'Property'`, required)
- `buyer` (ObjectId, ref `'User'`, required)
- `agent` (ObjectId, ref `'User'`, required) — derived server-side from `Property.agent`
- `name` (String, required, trimmed, max 120)
- `email` (String, required, trimmed, lowercase, max 254)
- `phone` (String, optional, trimmed, max 20)
- `message` (String, required, trimmed, min 10, max 2000)
- `status` (String, enum `['pending', 'responded', 'closed']`, default `'pending'`)
- `createdAt`, `updatedAt` (Mongoose timestamps)

**Indexes:**
- `{ buyer: 1, createdAt: -1 }` — buyer inquiry listing, newest first
- `{ agent: 1, createdAt: -1 }` — agent inquiry inbox (S6), newest first
- `{ property: 1 }` — property-scoped lookups

## Visit Schema (S8)

Collection: `visits`

**Fields:**
- `_id` (ObjectId)
- `property` (ObjectId, ref `'Property'`, required) — never cascade-deleted (ADR-025); population resolves to `null` after property deletion
- `buyer` (ObjectId, ref `'User'`, required) — always server-derived from `req.user.id`
- `agent` (ObjectId, ref `'User'`, required) — always server-derived from `Property.agent`
- `startAt` (Date, required) — UTC instant; must be in the future at creation
- `endAt` (Date, required) — UTC instant; duration (`endAt - startAt`) must be 30–120 minutes inclusive and is **derived, never stored**
- `timezone` (String, required, default `'Asia/Kolkata'`) — IANA name; legacy alias `Asia/Calcutta` normalized on write; invalid names rejected
- `status` (String, enum `['pending', 'confirmed', 'declined', 'cancelled', 'completed']`, default `'pending'`)
- `note` (String, optional, trimmed, max 2000)
- `cancelledAt` (Date, nullable) — set when status becomes `cancelled`
- `cancelledBy` (ObjectId, ref `'User'`, nullable) — actor who cancelled
- `createdAt`, `updatedAt` (Mongoose timestamps)

**Indexes:**
- `{ buyer: 1, startAt: -1 }` — buyer visit listing, soonest first
- `{ agent: 1, startAt: -1 }` — agent inbox, soonest first
- `{ agent: 1, status: 1, startAt: 1 }` — agent calendar conflict checks
- `{ buyer: 1, property: 1, startAt: 1, endAt: 1 }` (unique, partial filter `status ∈ {pending, confirmed}`) — identical active-duplicate protection (ADR-023)

**State machine (ADR-022):** `pending → confirmed | declined | cancelled`; `confirmed → completed | cancelled`; `declined`/`cancelled`/`completed` terminal. Buyers may only cancel their own visits; the owning agent may confirm/decline (from `pending`) and complete/cancel (from `confirmed`); admins drive the same machine on any visit via the explicit admin route — no admin bypass.

## Conversation Schema (S9)

Collection: `conversations`

**Fields:**
- `_id` (ObjectId)
- `property` (ObjectId, ref `'Property'`, required) — thread context anchor (ADR-006); never cascade-deleted, populates to `null` after property deletion
- `buyer` (ObjectId, ref `'User'`, required) — always server-derived from `req.user.id`
- `agent` (ObjectId, ref `'User'`, required) — always server-derived from `Property.agent`
- `lastMessage` (Object) — denormalized inbox preview: `{ body: String, sender: ObjectId ref 'User', sentAt: Date }`
- `buyerUnread` (Number, default 0) — atomic `$inc` on agent sends; zeroed when the buyer reads
- `agentUnread` (Number, default 0) — atomic `$inc` on buyer sends; zeroed when the agent reads
- `createdAt`, `updatedAt` (Mongoose timestamps)

**Indexes:**
- `{ buyer: 1, updatedAt: -1 }` — buyer inbox, newest activity first
- `{ agent: 1, updatedAt: -1 }` — agent inbox, newest activity first
- `{ property: 1, buyer: 1 }` (unique) — one thread per (property, buyer); the only thread-identity guarantee, and what makes `POST /api/conversations` idempotent (ADR-027)

**Identity rule:** a conversation is identified by `(property, buyer)`. Opening it twice returns the same thread and appends the message.

## Message Schema (S9)

Collection: `messages`

**Fields:**
- `_id` (ObjectId)
- `conversation` (ObjectId, ref `'Conversation'`, required)
- `sender` (ObjectId, ref `'User'`, required) — always server-derived from the caller; never client-supplied
- `body` (String, required, trimmed, min 1, max 2000) — plain text; never rendered as HTML
- `readAt` (Date, nullable) — stamped when the *other* participant marks the thread read
- `createdAt` (Mongoose timestamp)

**Index:**
- `{ conversation: 1, createdAt: 1, _id: 1 }` — paginated history (history is returned newest-first via `createdAt DESC, _id DESC`)

**Lifecycle (ADR-027):** strictly append-only — no message edit or delete surface exists in S9. Property deletion does not cascade; threads and their messages survive.

## SavedSearch Schema (S10)

Collection: `savedSearches`

**Fields:**
- `_id` (ObjectId)
- `user` (ObjectId, ref `'User'`, required) — always server-derived from `req.user.id`; buyer-only authority (ADR-029)
- `name` (String, required, trimmed, max 80)
- `criteria` (Object) — **typed sub-fields only, never Mongo query fragments** (ADR-029): `search` (String ≤100), `city` (String ≤100), `propertyType` (enum: apartment|house|villa|condo|land), `listingType` (enum: sale|rent), `minPrice` (Number ≥0), `maxPrice` (Number ≥0, ≥ minPrice), `bedrooms` (integer ≥0), `sort` (enum: newest|price_asc|price_desc), **S11 (ADR-031):** `lat` (Number, −90…90), `lng` (Number, −180…180), `radiusKm` (Number, (0,100]) — the geo trio is **all-or-none** — all individually optional; the Mongo filter is rebuilt from these fields at every execution EITHER directly or via `buildGeoFilter` in the shared `lib/propertyFilters.js` builder. `bounds` is deliberately NOT a criteria field (transient viewport state only).
- `frequency` (String, enum `['instant']`, default `'instant'`) — `daily` is **rejected** with `400 VALIDATION_ERROR` in this version (locked decision 2)
- `active` (Boolean, default true) — pausing alerts is `active: false` (locked decision 4: no other preference surface in S10)
- `lastNotifiedAt` (Date, nullable)
- `createdAt`, `updatedAt` (Mongoose timestamps)

**Indexes:**
- `{ user: 1, updatedAt: -1 }` — buyer management list, newest first
- `{ active: 1 }` — matching sweep over active searches

**Cap:** 20 active saved searches per user (`429 SEARCH_LIMIT` beyond that).

## Notification Schema (S10)

Collection: `notifications`

**Fields:**
- `_id` (ObjectId)
- `recipient` (ObjectId, ref `'User'`, required) — always server-derived from persisted event participants (ADR-030); never request input
- `type` (String, enum `['listing_match','visit_update','message_alert','inquiry_update']`)
- `title` (String, required, max 140) — server-authored template text
- `body` (String, required, max 500) — server-authored template text (escaped values interpolated)
- `resourceRef` (Object) — `{ kind: String enum ['property','visit','conversation','inquiry'], id: ObjectId }`; referenced entities are **never cascade-deleted** — a deleted target renders "no longer available" (ADR-025 pattern)
- `read` (Boolean, default false)
- `readAt` (Date, nullable)
- `createdAt` (Mongoose timestamp)

**Indexes:**
- `{ recipient: 1, createdAt: -1 }` — inbox, newest first (`createdAt DESC, _id DESC` tiebreak)
- `{ recipient: 1, read: 1, createdAt: -1 }` — unread count/filter

**Lifecycle (ADR-030):** retained indefinitely (locked decision 5); the recipient may delete individual notifications (own-only, 404 on miss). Mark-read is the only other mutation.
