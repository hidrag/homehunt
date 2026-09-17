# HomeHunt

A production-style MERN real-estate listing and discovery platform.

## Stack

- **Frontend**: React 19, Vite, Tailwind CSS v4, Lucide React, Redux Toolkit, React Hook Form
- **Backend**: Node.js (24 LTS), Express, MongoDB, Mongoose
- **Authentication**: JWT with HTTP-only cookies (S4)
- **Maps**: Leaflet.js with OpenStreetMap
- **Images**: Remote CDN assets with defensive fallbacks (Cloudinary user uploads planned for S13)
- **Status**: Sprint 3 Complete (Gallery, Maps & Property Experience)

## Repository structure

- `client/` — React frontend application
- `server/` — Node.js/Express backend application
- `docs/` — Project documentation and architecture decisions

## Local development

### Prerequisites
- Node.js (v24+)
- MongoDB (Local or Atlas)

### Client
```bash
cd client
npm install
npm run dev
```

### Server
```bash
cd server
npm install
npm run dev
```

## Documentation
Please refer to `AGENTS.md` and the `docs/` directory for detailed documentation, coding standards, and architectural decisions.
