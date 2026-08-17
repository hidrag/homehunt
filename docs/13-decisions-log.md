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

## Change policy
New architectural decisions must be appended here with:
- ADR number
- status
- decision
- reason
- date
- affected areas where useful
