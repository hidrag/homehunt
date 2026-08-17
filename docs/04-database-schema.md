# HomeHunt — Database Schema Contract

## Database
MongoDB Atlas with Mongoose.

## Collections
- users
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
- `images` (Array of Strings)

**Timestamps:**
- `createdAt`, `updatedAt` (Mongoose timestamps)

**Indexes:**
- `location` (`2dsphere`)
- `city` (1)
- `propertyType` (1)
- `listingType` (1)

*Note on S1 agent reference:* During Sprint 1, before the `User` domain is implemented, the `agent` reference will contain a deterministic, synthetically generated ObjectId inserted by the seed script. S1 APIs must not attempt to populate the `User` document for this field.
