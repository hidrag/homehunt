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
