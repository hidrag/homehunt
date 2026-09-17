# HomeHunt — Current Sprint

## Sprint
S3 — Maps, Gallery & Property Experience

## Status
[x] Complete (Ready for human review)

## Goal
Elevate the property detail and browsing experience with a responsive, accessible image gallery, interactive Leaflet + OpenStreetMap location map, defensive broken-image fallbacks, and an upgraded layout hierarchy.

## Completed Objectives
- **Property Image Gallery (`PropertyGallery.jsx`)**:
  - In-house responsive gallery handling 0, 1, or multiple images.
  - Active image display with aspect ratio container, previous/next controls, and image counter badge (`1 / N`).
  - Thumbnail filmstrip with active state indicator (`aria-current="true"`), scroll support, and visible focus rings.
  - Full keyboard accessibility: ArrowLeft, ArrowRight, Home, and End keys.
  - Defensive broken-image handling via error state mapping without crashing navigation or displaying raw browser broken glyphs.
- **Geospatial Utilities (`propertyLocation.js`)**:
  - `isValidGeoPoint(location)`: Strict validation of GeoJSON structure, coordinate array types, and valid latitude/longitude bounds.
  - `toLeafletLatLng(location)`: Explicit transformation of GeoJSON `[longitude, latitude]` to Leaflet `[latitude, longitude]`.
  - `toOsmLink(lat, lng)`: Safe external link generation to OpenStreetMap view.
- **Interactive Location Map (`PropertyMap.jsx`)**:
  - Direct Leaflet.js integration with OpenStreetMap tile layer and proper OSM attribution.
  - Custom SVG map pin (eliminating Vite asset path resolution issues).
  - XSS-safe popup binding with property title using safe DOM textContent.
  - Zoom configuration: default zoom 14, `scrollWheelZoom: false` to avoid trapping page scroll, interactive touch/click drag enabled.
  - Robust React StrictMode lifecycle handling: ensures map instance is cleaned up (`map.remove()`) and instance ref cleared without private API manipulation.
  - Accessible fallback card when coordinates are missing or invalid, showing MapPinOff icon and helpful fallback notice.
  - External text link (`<a>`) opening location on OpenStreetMap in a new tab with `rel="noopener noreferrer"`.
- **Defensive Card Fallback (`PropertyCard.jsx`)**:
  - Graceful fallback placeholder when property cover image fails to load.
- **Property Detail Layout Refactoring (`ListingDetail.jsx`)**:
  - Refactored two-column layout:
    - Left column: Back navigation, Header (title, address, badges), PropertyGallery, Key Highlights grid, About description, Amenities list, Location map section.
    - Right column: Sticky sidebar with price display and listing metadata (status, listing type, property type, listed date).
  - Enforced single `h1` per page (property title), section `h2` headings, and styled `<p>` for price to maintain clean accessibility heading hierarchy.
- **Seed Data Quality**:
  - Replaced dead Unsplash image URL (`photo-1502672260266-1c1c2b4418f1`) across all 3 affected properties in `server/scripts/seed/properties.js` with verified live asset (`photo-1560448204-e02f11c3d0e2`).
  - Successfully re-seeded MongoDB database with 25 clean properties.
- **Backend Test Coverage**:
  - Added unit/mocked integration tests in `server/tests/integration/property.test.js` verifying image array preservation and GeoJSON coordinate handling on `GET /api/properties/:id`.
  - Added real MongoDB integration tests in `server/tests/integration/property.mongo.test.js` verifying multiple images and GeoJSON coordinate ordering in database queries.

## Explicitly Out of Scope
- Authentication, Users, Sessions, and RBAC (S4).
- Bookmarks, saved searches, inquiries, and visit scheduling (S5, S6, S8).
- Multi-listing cluster map or radius search (S11).
- Virtual tours, documents, and Cloudinary upload pipelines (S13).
- React-leaflet wrapper or third-party slider/lightbox libraries.
- Redux store for property detail or gallery state.

## Acceptance Criteria
- [x] In-house image gallery supports 0, 1, and N images with counter badge and previous/next controls.
- [x] Thumbnail filmstrip allows direct selection and reflects active image state.
- [x] Keyboard navigation (ArrowLeft, ArrowRight, Home, End) is supported on gallery controls.
- [x] Broken images degrade gracefully with fallback placeholder without breaking navigation.
- [x] Leaflet map renders property location with OpenStreetMap tiles, attribution, and custom pin.
- [x] GeoJSON `[lng, lat]` coordinates are correctly mapped to Leaflet `[lat, lng]`.
- [x] Leaflet handles React StrictMode remounting without `Map container is already initialized` error.
- [x] Invalid or missing coordinates render a polite fallback card instead of crashing.
- [x] Scroll-wheel zoom is disabled to prevent scroll trapping; external OSM link provided.
- [x] Semantic heading hierarchy (single `h1`, section `h2`s) and ARIA attributes pass accessibility standards.
- [x] Seed data contains verified live image URLs; database reseeded cleanly.
- [x] Automated backend tests pass (34/34), frontend builds cleanly with zero linter errors.
