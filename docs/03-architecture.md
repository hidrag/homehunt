# HomeHunt — Technical Architecture

## Architecture
HomeHunt uses a two-application structure inside one Git repository:

- `client/` — React frontend
- `server/` — Node.js/Express backend

This is intentionally a simple monorepo-style repository without a workspace/build system initially.

## Frontend
- React
- Vite
- React Router
- Tailwind CSS
- shadcn/ui
- Redux Toolkit
- React Hook Form
- Yup
- Axios

## Backend
- Node.js (24 LTS)
- Express
- Mongoose
- MongoDB Atlas

## Authentication
- JWT
- HTTP-only secure cookies
- Short-lived access token
- Refresh token
- Refresh-token rotation
- Server-side authorization

## Images and files
- Cloudinary for property images and suitable media.
- Sensitive legal/property documents must use controlled/private access; never expose secrets or unrestricted private document URLs.

## Maps
- Leaflet.js
- OpenStreetMap
- MongoDB GeoJSON Point + `2dsphere` index for property coordinates

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
