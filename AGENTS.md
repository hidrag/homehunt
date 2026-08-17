# HomeHunt — AI Agent Operating Rules

## Purpose
HomeHunt is a production-style MERN real-estate listing and discovery platform. AI agents are contributors to an existing codebase, not independent architects.

## Before modifying code
1. Read this file.
2. Read `docs/00-ai-rules.md`.
3. Read `docs/03-architecture.md`.
4. Read `docs/07-current-sprint.md`.
5. Read the relevant database/API/auth documentation before changing those areas.
6. Inspect the existing implementation before proposing or creating files.

## Non-negotiable rules
- Do not invent APIs, routes, database fields, roles, environment variables, credentials, packages, or business rules.
- Do not change an accepted architectural decision silently.
- Do not introduce a new library when an existing project dependency already solves the problem.
- Do not refactor unrelated code while implementing a sprint task.
- Do not rewrite working code without a concrete reason.
- Backend authorization is mandatory; frontend role checks are UX only.
- Never expose secrets, tokens, database credentials, or private document URLs.
- Follow the API and database contracts.
- Prefer small, reviewable changes.
- Preserve existing behavior unless the sprint explicitly changes it.

## When information is missing
Stop and identify the missing information. If a safe default is obvious, state the assumption before implementation. For consequential architectural decisions, propose the option and wait for approval.

## After changes
- Run relevant linting, tests, and builds.
- Verify the affected user flow.
- Report files changed, tests run, assumptions made, and any unresolved issues.
- Do not claim a task is complete if acceptance criteria are not met.

## Documentation hierarchy
When sources conflict, use this order:
1. Current implemented code and tests
2. API/database contracts
3. Architecture decisions
4. Current sprint specification
5. Product specification
6. Master roadmap
7. General framework/tool knowledge

If a conflict is discovered, report it instead of silently reconciling it.
