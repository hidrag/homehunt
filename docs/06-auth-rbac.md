# HomeHunt — Authentication & RBAC

## Roles
- buyer
- agent
- admin

## Authentication
- Passwords hashed with bcrypt.
- JWT-based authentication.
- Tokens delivered through HTTP-only secure cookies.
- Access token should be short-lived.
- Refresh token supports session renewal and rotation.
- Logout invalidates the appropriate session/token state.

## Authorization principle
Authentication answers: "Who are you?"
Authorization answers: "What may you do?"

Both must be enforced server-side.

## Permission baseline

| Action | Buyer | Agent | Admin |
|---|---:|---:|---:|
| Browse properties | Yes | Yes | Yes |
| Search/filter | Yes | Yes | Yes |
| Bookmark | Yes | Yes | Yes |
| Contact agent | Yes | Yes | Yes |
| Schedule visit | Yes | Yes | Yes |
| Create property | No | Yes | Yes |
| Edit own property | No | Yes | Yes |
| Edit any property | No | No | Yes |
| Manage own inquiries | No | Yes | Yes |
| Manage users | No | No | Yes |
| Moderate listings | No | No | Yes |
| Verify properties | No | No | Yes |
| View platform analytics | No | Limited | Yes |

Ownership checks are required for agent-owned resources.

## S4.0 approved implementation decisions
Source: ADR-012…ADR-016 in `docs/13-decisions-log.md` (approved S4.0 architecture).

- **Registration / role policy**: Public registration creates `role = "buyer"` only. A client-submitted `role` or `passwordHash` is never read; an escalation attempt silently yields a buyer account. Public self-registration as agent or admin is impossible. Agent/admin provisioning is outside S4 (dev: fixed-id seed; production: the future controlled admin mechanism, S7).
- **JWT**: HS256 only. Access token (15 min) claims `sub`, `role`, `iat`, `exp`, `iss: "homehunt"`; refresh token (7 days) claims `sub`, `jti`, `sid`, `iat`, `exp`, `iss: "homehunt"` with `jti` = session `_id`. Secrets `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` are distinct, have no defaults, and fail the server fast when missing. Verification whitelists HS256 and validates the issuer.
- **Role authorization**: roles are enforced server-side by `requireRole(...)` (403 `FORBIDDEN`); the role claim in the access token keeps the gate DB-free, with staleness bounded by the 15-minute access lifetime. Frontend role checks remain UX only.
- **Refresh rotation**: one family per login; strict one-generation rotation (no grace window); reuse of a rotated token revokes the whole family and returns `401 REFRESH_TOKEN_REUSED`; both cookies are cleared. Concurrent legitimate refresh collisions are resolved client-side with single-flight refresh coordination — server rules are not weakened for them.
- **Session invalidation**: sessions are server-side records (SHA-256 `tokenHash`, `familyId`, `expiresAt` TTL, `revokedAt`); logout revokes the acting session and is idempotent.
- **Cookie strategy**: `hh_access` / `hh_refresh`; HttpOnly, `Path=/`, `SameSite=Lax`, `Secure` in production only, Max-Age 900 / 604800; cleared on logout; never stored in the browser's local/session storage.
