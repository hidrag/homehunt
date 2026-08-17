# HomeHunt — API Contract

## General rules
Base prefix:

`/api`

All APIs must use consistent JSON response structures.

Recommended success shape:

```json
{
  "success": true,
  "data": {}
}
```

Recommended error shape:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message"
  }
}
```

## Contract rule
Do not invent endpoints or change request/response shapes casually.

Before implementing an API:
1. Check this document.
2. Check existing routes/controllers.
3. Add or update the contract.
4. Implement backend.
5. Update frontend consumers.
6. Add tests.

## Planned API areas
- `/api/health`
- `/api/auth/*`
- `/api/properties/*`
- `/api/bookmarks/*`
- `/api/inquiries/*`
- `/api/visits/*`
- `/api/agents/*`
- `/api/saved-searches/*`
- `/api/conversations/*`
- `/api/messages/*`
- `/api/notifications/*`
- `/api/admin/*`
- `/api/analytics/*`

Exact endpoints and payloads should be documented as each domain is implemented.

## Authorization
Every protected endpoint must explicitly define required authentication and role/ownership rules.

Frontend route protection is not a security boundary.
