# HomeHunt — Technical Architecture

## Architecture
HomeHunt uses a two-application structure inside one Git repository:

- `client/` — React frontend
- `server/` — Node.js/Express backend

This is intentionally a simple monorepo-style repository without a workspace/build system initially.

## Frontend
- React 19
- Vite
- React Router
- Tailwind CSS v4
- Lucide React (icon system)
- Leaflet.js (direct map rendering)
- Redux Toolkit (global session/shared state)
- React Hook Form & Yup (forms and validation)
- Axios (HTTP client)

## Backend
- Node.js (24 LTS)
- Express
- Mongoose
- MongoDB Atlas / Local

## Authentication
- JWT
- HTTP-only secure cookies
- Short-lived access token
- Refresh token
- Refresh-token rotation
- Server-side authorization

## Images and files
- S1–S3: Curated remote HTTPS image URLs (Unsplash CDN) stored in MongoDB, with defensive frontend fallback components to prevent broken images or layout collapse.
- S13+: Cloudinary planned for authenticated user image uploads, transformations, and asset pipeline.
- Sensitive legal/property documents must use controlled/private access; never expose secrets or unrestricted private document URLs.

## Maps
- Leaflet.js (v1.9+) integrated directly (without `react-leaflet` wrapper) to give precise lifecycle control, prevent React 19 / StrictMode re-initialization crashes, and eliminate bundler asset issues.
- OpenStreetMap tile layer with required attribution.
- MongoDB GeoJSON Point `[longitude, latitude]` with `2dsphere` index; translated to Leaflet's `[latitude, longitude]` at the presentation layer via `propertyLocation.js`.
- Custom SVG marker icon avoiding static PNG resolution pitfalls.

## Realtime
- Socket.io
- Conversation-based rooms, keyed by conversation ID

## Email
- Backend-controlled email service.
- Email provider may be selected later and recorded as an architecture decision.

## State management
Redux Toolkit:
- authentication/session state
- shared listing/search state
- bookmarks where globally useful
- notifications
- other genuinely shared application state

Local React state:
- modal state
- dropdown state
- gallery index
- temporary UI interactions

React Hook Form:
- login
- registration
- property forms
- inquiry forms
- visit forms
- profile forms

Do not introduce another global state library without an accepted architecture decision.

## Backend layering
Routes → Middleware → Validation → Controller → Service → Model/Repository → MongoDB

Controllers should remain thin. Business logic belongs in services.

## Core domain entities
- User
- Property
- Agent/profile
- Bookmark
- Inquiry
- Visit
- SavedSearch
- Conversation
- Message
- Notification
- AnalyticsEvent
- PropertyDocument

## Architectural rule
Prefer explicit, boring, maintainable architecture over clever abstractions.
