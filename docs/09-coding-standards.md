# HomeHunt — Coding Standards

## General
- Prefer readable, maintainable code.
- Keep functions focused.
- Avoid unnecessary abstraction.
- Avoid duplicated business logic.
- Do not modify unrelated code during a feature task.

## Frontend
- Reuse shared components.
- Keep API access out of presentational components where practical.
- Keep form state in React Hook Form.
- Keep global state limited to genuinely shared application state.

## Backend
- Keep controllers thin.
- Put business rules in services.
- Validate input before business logic.
- Centralize error handling.
- Never trust client-provided authorization claims.

## Naming
Use clear, consistent camelCase for JavaScript application identifiers.

## Logging
Do not leave debug logging in production paths.

## Dependencies
Every new dependency should have a concrete reason. Do not add alternatives to existing libraries without an approved decision.
