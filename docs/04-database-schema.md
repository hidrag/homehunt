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

A `2dsphere` index is required for geospatial queries.

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
