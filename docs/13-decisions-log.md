# HomeHunt — Architecture Decision Log

## ADR-001 — Repository structure
Status: Accepted
Decision: Use one Git repository containing separate `client/` and `server/` applications.
Reason: Simple for a solo developer, clear separation of frontend/backend, easy deployment, and compatible with AI coding agents.

## ADR-002 — Image storage
Status: Accepted
Decision: Cloudinary.
Reason: Image optimization, transformations, CDN delivery, responsive image support and manageable media workflows.

## ADR-003 — Authentication
Status: Accepted
Decision: JWT authentication using HTTP-only secure cookies.
Reason: Better security posture than storing authentication tokens in localStorage.

## ADR-004 — Maps
Status: Accepted
Decision: Leaflet.js with OpenStreetMap initially.
Reason: Suitable for the portfolio project, flexible and avoids unnecessary dependence on a paid maps API.

## ADR-005 — State management
Status: Accepted
Decision: Redux Toolkit for genuinely shared application state; local state for component UI; React Hook Form for form state.
Reason: Prevent global-state sprawl while retaining predictable shared state.

## ADR-006 — Realtime messaging
Status: Accepted
Decision: Socket.io with conversation-based rooms.
Reason: A property may have multiple independent buyer-agent conversations.

## ADR-007 — Direct Leaflet integration without react-leaflet
Status: Accepted
Decision: Use the core `leaflet` npm package directly in React `useEffect` instead of `react-leaflet`.
Reason: `react-leaflet` has known compatibility and lifecycle hurdles with React 19 and React StrictMode (double-mounting triggering "Map container is already initialized"), and Vite bundling issues. Direct integration allows explicit teardown (`map.remove()`), custom SVG marker injection without asset URL resolution failures, and minimal dependency overhead.
Date: Sprint 3
Affected areas: `client/src/components/ui/PropertyMap.jsx`, `client/package.json`

## ADR-008 — In-house PropertyGallery component
Status: Accepted
Decision: Build a focused, lightweight in-house gallery component rather than pulling in external slider/lightbox libraries (e.g. Swiper, Embla, Yet Another React Lightbox).
Reason: Reduces bundle weight, avoids third-party CSS collisions with Tailwind v4, provides exact control over keyboard accessibility (`ArrowLeft`, `ArrowRight`, `Home`, `End`), provides defensive image error handling, and fulfills all S3 requirements without library bloat.
Date: Sprint 3
Affected areas: `client/src/components/ui/PropertyGallery.jsx`, `client/src/pages/ListingDetail.jsx`

## ADR-009 — Design system styling with Tailwind CSS v4 & Lucide React
Status: Accepted
Decision: Use Tailwind CSS v4 CSS-first configuration and Lucide React icons for all UI components, keeping `components.json` clean without legacy `tailwind.config.js` references.
Reason: Tailwind CSS v4 eliminates the legacy JavaScript configuration file in favor of CSS theme variables. All components are built with accessible, cohesive utility classes and standard Lucide icons.
Date: Sprint 3
Affected areas: `client/src/components/ui/*`, `client/components.json`, `client/src/index.css`

## ADR-010 — Remote seeded images and defensive frontend fallback handling
Status: Accepted
Decision: Seed verified, reliable HTTPS image URLs (Unsplash CDN) and implement defensive image fallback handling (`onError` state) in `PropertyCard` and `PropertyGallery`.
Reason: Cloudinary pipeline is planned for S13 user uploads. In early development sprints (S1–S3), remote URLs provide realistic property visuals. Handling load errors gracefully prevents broken image layout glitches and ensures seamless user experience even if external CDNs experience downtime.
Date: Sprint 3
Affected areas: `server/scripts/seed/properties.js`, `client/src/components/ui/PropertyGallery.jsx`, `client/src/components/ui/PropertyCard.jsx`

## ADR-011 — Single-property map scope for S3
Status: Accepted
Decision: Restrict S3 map implementation to the individual property detail view (`PropertyMap`), with `scrollWheelZoom: false`, custom pin, and external OSM link.
Reason: Multi-property map views, bounding box queries, clustering, and radius filtering belong strictly to S11 (Advanced Geo Search). S3 focuses on grounding individual property locations accurately and safely.
Date: Sprint 3
Affected areas: `client/src/components/ui/PropertyMap.jsx`, `client/src/pages/ListingDetail.jsx`

## Change policy
New architectural decisions must be appended here with:
- ADR number
- status
- decision
- reason
- date
- affected areas where useful
