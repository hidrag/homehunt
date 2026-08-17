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

## /api/properties Contract (S1)

**GET /api/properties**
- **Purpose**: Fetch a paginated list of properties.
- **Query Parameters**:
  - `page` (Number, default: 1, invalid fallback: 1)
  - `limit` (Number, default: 10, max: 50, invalid fallback: 10)
- **Ordering**:
  - Default: `createdAt DESC`
- **Response**:
  ```json
  {
    "success": true,
    "data": {
      "properties": [ { /* Property object without heavy populated fields */ } ],
      "pagination": {
        "total": 100,
        "page": 1,
        "pages": 10,
        "limit": 10
      }
    }
  }
  ```

**GET /api/properties/:id**
- **Purpose**: Fetch a single property detail.
- **Parameters**: `id` (MongoDB ObjectId).
- **Validation**: Mongoose `isValidObjectId()`.
- **Response**:
  ```json
  {
    "success": true,
    "data": { "property": { /* Complete Property object */ } }
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: `INVALID_ID` if ObjectId is malformed.
  - `404 Not Found`: `NOT_FOUND` if property does not exist.
## Authorization
Every protected endpoint must explicitly define required authentication and role/ownership rules.

Frontend route protection is not a security boundary.
