# HomeHunt — Testing Strategy

## Testing layers

### Unit & Utility
- Backend utility functions and helpers.
- Frontend pure transformation utilities (e.g., `propertyLocation.js`).

### Integration/API
- Routes, controllers, services, database queries, and error handling.
- Implemented with Jest + Supertest + mongodb-memory-server.
- Test suites:
  - `health.test.js`: System health endpoint.
  - `property.test.js`: Mocked integration tests for search, filtering, pagination, sorting, validation, and detail endpoint guarantees.
  - `property.mongo.test.js`: Real MongoDB in-memory database tests for text search, GeoJSON spatial queries, multi-filter combinations, image array ordering, and NoSQL injection security.
- Current status: 34 tests passing.

### Component & Frontend
- React UI components, forms, and interaction states.
- *Current implementation status*: The `client` application does not currently have a dedicated test runner (e.g. Vitest/React Testing Library) installed. Code quality and correctness are maintained via:
  - Strict static analysis with `oxlint`.
  - Production bundling checks with `npm run build` (Vite).
  - Manual browser testing across desktop, tablet, and mobile viewports.
- *Roadmap plan*: Install Vitest and React Testing Library in a dedicated testing pass to avoid adding out-of-scope dependencies during feature sprints.

### E2E
- Critical user journeys planned for S16 (Cypress/Playwright).

## Minimum critical E2E flows
- Registration
- Login/logout
- Search and filtering
- Property detail (Gallery, Highlights, Location Map)
- Bookmark
- Inquiry
- Agent listing creation
- Admin approval
- Visit scheduling
- Chat
- Saved search
- Notification

## Feature rule
New functionality should receive appropriate tests in the same sprint. Do not intentionally defer all testing to the final sprint.

## Definition of done
The requirement for automated verification applies to layers and features where an automated test runner exists (such as backend API and database integration tests). In the frontend, S3 gallery and map acceptance is validated through structured manual QA, static analysis (`oxlint`), and production build verification (`vite build`), because the approved S3 scope deliberately does not introduce a client test framework. A feature is not complete if its acceptance criteria fail manual QA or if automated test coverage is omitted where test infrastructure is established.
