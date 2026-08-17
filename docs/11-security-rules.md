# HomeHunt — Security Rules

## Authentication
- HTTP-only secure cookies.
- Strong password hashing.
- Short-lived access tokens.
- Refresh token rotation.
- Rate limiting on authentication-sensitive endpoints.

## Authorization
- Enforce roles on the backend.
- Enforce resource ownership for agent-owned resources.
- Never trust frontend role checks.

## Input
- Validate all client input.
- Sanitize where appropriate.
- Never build unsafe database queries from raw user input.

## Secrets
Never commit:
- JWT secrets
- database credentials
- Cloudinary secrets
- email credentials
- API keys that must remain private

Use environment variables.

## Uploads
Validate:
- file type
- file size
- upload purpose
- ownership/authorization

## Documents
Legal/property documents are sensitive. Do not expose unrestricted public URLs.

## Web security
Use appropriate:
- CORS configuration
- Helmet/security headers
- rate limiting
- secure cookie configuration
- error handling that does not leak secrets or stack traces in production
