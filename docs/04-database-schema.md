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
