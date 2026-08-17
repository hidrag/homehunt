# HomeHunt — AI Rules & Anti-Hallucination Policy

## Core principle
AI must extend the existing HomeHunt system rather than redesign it by assumption.

## Source of truth
Use the repository and documentation hierarchy defined in `AGENTS.md`.

## Never invent
Do not invent:
- API endpoints
- request/response shapes
- database fields
- database relationships
- user roles or permissions
- environment variables
- credentials
- external services
- npm packages
- business rules
- UI behavior not specified by the product requirements

## Change control
Architectural changes require:
1. A clear reason.
2. Identification of affected files/features.
3. An update to `docs/13-decisions-log.md`.
4. Explicit approval from the project owner before implementation when the change is consequential.

## Dependency discipline
Before adding a package:
- Check whether an existing dependency already provides the capability.
- Explain why the new package is necessary.
- Avoid duplicate libraries serving the same purpose.

## API discipline
Frontend and backend must follow `docs/05-api-contract.md`.
If an API contract changes, update the contract and affected implementation together.

## Database discipline
MongoDB schemas, indexes, relationships, and field names must follow `docs/04-database-schema.md`.
Do not casually rename fields because another naming convention seems preferable.

## UI discipline
Follow the existing design system and responsive conventions. Reuse components before creating new variants.

## Testing discipline
Every feature must include appropriate tests. Critical user journeys must have E2E coverage before release.

## Uncertainty protocol
When uncertain:
- inspect existing code,
- inspect documentation,
- search the repository,
- state the uncertainty,
- ask for a decision when the choice has architectural consequences.

Never turn uncertainty into a confident implementation claim.
