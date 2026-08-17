# HomeHunt — Current Sprint

## Sprint
S1 — Property Core

## Status
[~] In progress

## Goal
Establish the Property domain end-to-end, enabling properties to be persisted in MongoDB, fetched via REST API, and displayed on frontend listing and detail pages.

## Current objectives
- Document Property schema and API contract explicitly.
- Create the Property Mongoose model with GeoJSON location support and validation.
- Implement GET `/api/properties` with pagination.
- Implement GET `/api/properties/:id` with proper validation.
- Implement backend integration tests.
- Create development seed data (Indian geography/currency) using synthetic agent ObjectIds.
- Build frontend API integration using local React state and Axios.
- Build UI components: `PropertyCard`.
- Build UI pages: `Listings.jsx` and `ListingDetail.jsx`.
- Implement robust loading, empty, and error fallback states.

## Explicitly out of scope
- Authentication, Users, and RBAC.
- Property Creation/Update APIs (seed script handles data creation).
- Redux Toolkit usage (local state sufficient for S1 fetching).
- Advanced search, filtering, and sorting.
- Complex maps (Leaflet/Google Maps).
- Image uploads (Cloudinary).

## Acceptance criteria
- [x] Backend: `Property` schema enforces data integrity and GeoJSON formats.
- [x] Backend: `/api/properties` and `/api/properties/:id` operate successfully with documented pagination and error handling.
- [x] Backend: Integration tests pass for property endpoints.
- [x] Frontend: `/listings` displays a responsive grid of property cards fetched from the API.
- [x] Frontend: `/listings/:id` displays details for a specific property fetched from the API.
- [x] Frontend: UI gracefully handles loading states and "not found" errors.
- [x] Integration: The application successfully displays the ~25 seeded database records.

## Completion checklist
- [x] Documentation updated
- [x] Property model created
- [x] Backend service, controller, and routes implemented
- [x] Backend integration tests passed
- [x] MongoDB seed script created (25 properties)
- [x] Frontend API integration complete
- [x] UI Components and Pages built
- [x] End-to-end manual verification completed
