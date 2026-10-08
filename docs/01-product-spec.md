# HomeHunt — Product Specification

## Product
HomeHunt — Real Estate Listing & Finder Platform.

## Product objective
Provide a modern real-estate discovery platform where buyers can discover, search, compare, save, communicate about, and schedule visits for properties, while agents and admins manage listings and marketplace operations.

## Primary roles
- Buyer
- Agent
- Admin

## Core buyer journey
Home → Search → Filter → Property Details → Save → Contact Agent → Schedule Visit

## Core agent journey
Login → Dashboard → Create Listing → Submit/Publish → Receive Inquiry → Chat → Schedule Visit → Manage Listing

## Core admin journey
Login → Dashboard → Review Listings → Approve/Reject → Manage Users/Agents → Moderate → Analyze

## Required product areas

### Discovery
- Home page
- Featured listings
- Search with autocomplete
- Price, bedroom, property type, city and feature filters
- Sorting and pagination
- Map/list view
- Geo-based search
- Property gallery
- Property details
- Neighborhood explorer

### User features
- Registration/login
- Profile
- Bookmarks
- Recently viewed
- Saved searches
- Alerts
- Property comparison
- Contact/inquiries
- Chat (S9: property-bound buyer↔agent threads, real-time delivery via Socket.io, unread counts, REST history; admins audit read-only)
- Saved searches (S10: buyer-owned named searches with whitelisted criteria, instant alerts, pause via active:false)
- Alerts (S10: in-app notification inbox + email for listing matches and new inquiries; visit/message alerts in-app only)
- Schedule visits (S8: buyer requests, agent confirms/declines/completes, admin moderates; email notifications via ADR-024)
- Notifications

### Agent features
- Agent profile
- Agent dashboard
- Listing CRUD
- Image management
- Inquiry management
- Visit management
- Messaging
- Listing analytics

### Admin features
- Secure dashboard
- Property moderation
- User/agent management
- Verification workflow
- Inquiry management
- Visit management
- Analytics
- Reporting/export

### Advanced features
- Cloud image handling
- Leaflet maps
- Radius search
- Polygon search
- Heatmaps
- Nearby schools/hospitals/transport (S12: internal seeded POIs — transit/schools/grocery/healthcare/parks with Haversine distance and walking minutes; crime data formally descoped; driving times descoped — walking only, offline-first)
- Crime/mock neighborhood data — DESCOPED (mock crime data anchored to real coordinates is indefensible; ADR-034)
- Walkability/livability (S12: deterministic 0–100 walk score, published formula, ADR-034)
- Street View integration — descoped (Google-proprietary; offline-first policy)
- Virtual tour support
- Mortgage/EMI calculator
- PDF calculator report — descoped (S14 ruling: no print/export infrastructure; revisit only with real demand)
- Legal/property documents
- Verified-property badge
- Saved-search alerts (S10: instant in-app + email on new matching listings; no daily digest, no price-drop alerts — S14+)
- Price-drop alerts
- Email and push notifications
- PWA/offline support
- Real-time chat
- Moderation
- Recommendation engine as post-v1 enhancement

## Product rule
The complete requirement is intentionally larger than the initial MVP. Features are delivered incrementally through the master roadmap.
