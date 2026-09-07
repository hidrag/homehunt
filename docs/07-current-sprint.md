# HomeHunt — Current Sprint
 
## Sprint
S2 — Search, Filters & Sorting

## Status
[~] In progress

## Goal
Implement keyword search, multi-faceted filtering (city, property type, listing type, price range, bedrooms), sorting, and pagination for properties, keeping URL query parameters as the single source of truth.

## Current objectives
- Document S2 database index, API contracts, and parameter mappings.
- Add MongoDB `$text` index on `title`, `description`, and `address.city`.
- Implement backend query sanitization, whitelisting, regex escaping, and validation in `property.controller.js`.
- Update `property.service.js` to execute sanitized filter and sort queries.
- Add integration tests for search, individual/combined filters, sort orders, invalid numbers, and NoSQL injection attempts.
- Centralize frontend URL-to-API parameter mapping in `propertyApi.js`.
- Create frontend filter components (`PropertyFilters`, `SearchInput` with 500ms debounce, `SelectFilter`).
- Refactor `Listings.jsx` to synchronize state with `useSearchParams` and handle request cancellation.

## Explicitly out of scope
- Authentication, Users, Agents, RBAC.
- Bookmarks, saved searches, notifications.
- Maps, geolocation, heatmaps.
- Cloudinary, virtual tours, scheduling.
- Atlas Search, Elasticsearch.
- Redux state for properties or filters.

## Acceptance criteria
- [ ] Backend: MongoDB `$text` index added for `title`, `description`, `address.city`.
- [ ] Backend: Strict validation and NoSQL operator protection for all query parameters.
- [ ] Backend: Search and filters can be combined arbitrarily.
- [ ] Backend: Integration tests pass for all S2 scenarios and all S1 regression tests pass.
- [ ] Frontend: Filter controls (search, city, property type, listing type, price range, bedrooms, sort).
- [ ] Frontend: URL query string is the single source of truth; reloads and browser back/forward work seamlessly.
- [ ] Frontend: Debounced search input (~500ms) with stale request race-condition protection.
- [ ] Frontend: Clear filters restores canonical default `/listings`.
