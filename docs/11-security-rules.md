# HomeHunt — Security Rules

## Authentication
- HTTP-only secure cookies.
- Strong password hashing.
- Short-lived access tokens.
- Refresh token rotation.
- Rate limiting on authentication-sensitive endpoints.

## Authentication tokens (S4)
- JWT (HS256) only; verification whitelists HS256 and validates the issuer. Secrets `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` are distinct, have no defaults or fallbacks, and the server fails fast when either is missing.
- Access token: 15 minutes; claims `sub`, `role`, `iat`, `exp`, `iss: "homehunt"`. Refresh token: 7 days; claims `sub`, `jti`, `sid`, `iat`, `exp`, `iss: "homehunt"`; `jti` maps to the session `_id`.
- Session state is server-side (`sessions` collection) with SHA-256 token hashes and a TTL on `expiresAt`.
- Cookies: `hh_access` / `hh_refresh` — HttpOnly, `Path=/`, `SameSite=Lax`, `Secure` in production only, Max-Age 900 / 604800. JWTs are never stored in localStorage or sessionStorage.
- Rotation is strict (no grace window). Reuse of a rotated refresh token revokes the entire family, clears both cookies, returns `401 REFRESH_TOKEN_REUSED`, and logs only userId / familyId / timestamp. Logout revokes the acting session and is idempotent.
- Passwords: bcrypt cost 10; length 8–72; no complexity classes. Login returns a single `401 INVALID_CREDENTIALS` for both unknown email and wrong password and performs a dummy bcrypt comparison for unknown emails.
- Auth endpoints are rate limited (10 requests / 15 minutes / IP → `429 RATE_LIMITED`). No account lockout and no failed-login persistence in S4.
- CSRF: SameSite=Lax plus exact-origin CORS (`CLIENT_URL`, `credentials: true`, never `*`) is the S4 posture. HttpOnly blocks JavaScript access to cookies but is **not** the CSRF defense. Revisit if production ever uses distinct registrable domains.
- Logging: never log tokens, cookies, passwords, or `passwordHash`.

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
