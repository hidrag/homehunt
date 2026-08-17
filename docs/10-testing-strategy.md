# HomeHunt — Testing Strategy

## Testing layers

### Unit
Business logic and utilities.

### Integration/API
Routes, controllers, services, database interactions and authorization.

### Component
Important React components and forms.

### E2E
Critical user journeys.

## Minimum critical E2E flows
- Registration
- Login/logout
- Search and filtering
- Property detail
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
A feature is not complete if its acceptance criteria pass only manually and important regression behavior has no appropriate automated coverage.
