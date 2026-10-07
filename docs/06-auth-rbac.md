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
| Chat with counterpart (S9) | Yes (own threads) | Yes (own threads) | No — read-only audit |
| Saved searches (S10) | Yes (own, max 20 active) | No | No |
| Own notification inbox (S10) | Yes | Yes | Yes (own only — no cross-user view) |
| Manage users | No | No | Yes |
| Moderate listings | No | No | Yes |
| Verify properties | No | No | Yes |
| View platform analytics | No | Limited | Yes |

Ownership checks are required for agent-owned resources. Implemented in S6 via `requireOwnership(Model, ownerField, { allowAdmin })`: agents manage only their own listings; admins bypass the ownership comparison for properties ("Edit any property"). Inquiry status management remains strictly agent-scoped on the S6 agent route; S7 adds a separate explicit admin route (`PATCH /api/admin/inquiries/:id/status`) for cross-agent administration.

## S7 admin platform (approved decisions)
- **Provisioning**: agent/admin accounts are created only via `POST /api/admin/users` (admin-only, role whitelist `agent`/`admin`). Public registration remains buyer-only (unchanged). See ADR-021.
- **Role management**: `PATCH /api/admin/users/:id/role` (admin-only, whitelist `buyer`/`agent`/`admin`). Server-side guards: self-role-change rejected; last-admin demotion rejected. Role changes take effect in the database immediately; an already-issued access token keeps its old `role` claim for at most its 15-minute lifetime, and refresh reissues the current role (sessions are not force-revoked — ADR-021).
- **Moderation**: admins view all listings (`GET /api/admin/properties`) and all inquiries (`GET /api/admin/inquiries`). Listing edits/deletes reuse the S6 ownership-override routes; listing `status` transitions, approve/reject, and verification remain out of scope (S13). User deactivate/delete and audit logging are out of scope.

## S4.0 approved implementation decisions
Source: ADR-012…ADR-016 in `docs/13-decisions-log.md` (approved S4.0 architecture).

- **Registration / role policy**: Public registration creates `role = "buyer"` only. A client-submitted `role` or `passwordHash` is never read; an escalation attempt silently yields a buyer account. Public self-registration as agent or admin is impossible. Agent/admin provisioning is outside S4 (dev: fixed-id seed; production: the future controlled admin mechanism, S7).
- **JWT**: HS256 only. Access token (15 min) claims `sub`, `role`, `iat`, `exp`, `iss: "homehunt"`; refresh token (7 days) claims `sub`, `jti`, `sid`, `iat`, `exp`, `iss: "homehunt"` with `jti` = session `_id`. Secrets `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` are distinct, have no defaults, and fail the server fast when missing. Verification whitelists HS256 and validates the issuer.
- **Role authorization**: roles are enforced server-side by `requireRole(...)` (403 `FORBIDDEN`); the role claim in the access token keeps the gate DB-free, with staleness bounded by the 15-minute access lifetime. Frontend role checks remain UX only.
- **Refresh rotation**: one family per login; strict one-generation rotation (no grace window); reuse of a rotated token revokes the whole family and returns `401 REFRESH_TOKEN_REUSED`; both cookies are cleared. Concurrent legitimate refresh collisions are resolved client-side with single-flight refresh coordination — server rules are not weakened for them.
- **Session invalidation**: sessions are server-side records (SHA-256 `tokenHash`, `familyId`, `expiresAt` TTL, `revokedAt`); logout revokes the acting session and is idempotent.
- **Cookie strategy**: `hh_access` / `hh_refresh`; HttpOnly, `Path=/`, `SameSite=Lax`, `Secure` in production only, Max-Age 900 / 604800; cleared on logout; never stored in the browser's local/session storage.

## S8 visit scheduling (approved decisions)
Source: ADR-022…ADR-025 in `docs/13-decisions-log.md`.

- **Domain**: visits persist `property`/`buyer`/`agent` references, UTC `startAt`/`endAt`, IANA `timezone` (default `Asia/Kolkata`, alias `Asia/Calcutta` normalized), `status` (`pending|confirmed|declined|cancelled|completed`), optional `note` (≤2000), and `cancelledAt`/`cancelledBy` audit fields. Duration is derived, never stored. Creation window: future start, 30–120 minutes, within 30 days, explicit zone designator required.
- **Role ceilings**: buyers create and cancel their own visits only; the owning agent confirms/declines (from `pending`) and completes/cancels (from `confirmed`); admins drive the **same** state machine on any visit via `PATCH /api/admin/visits/:id/status` — no admin transition bypass. Cross-owner access returns `404` (no enumeration).
- **Conflict protection (ADR-023)**: unique partial index on `{buyer, property, startAt, endAt}` filtered to active statuses blocks identical duplicates (`409 DUPLICATE_VISIT`); confirmation checks overlapping confirmed visits per agent under an in-process per-agent mutex (`409 SCHEDULE_CONFLICT`, strict inequality — boundary-touching allowed). Pending overlaps may queue.
- **Email (ADR-024)**: `EMAIL_PROVIDER` selects `fake` (default, in-memory log) or `resend` (native fetch, no SDK). Sending is best-effort: provider errors are logged (`[VISIT_EMAIL_ERROR]`), never fail the DB mutation, and are never returned to clients. Recipients are always derived from persisted user documents; all user-controlled template values are HTML-escaped.
- **Deletion (ADR-025)**: property deletion never cascade-deletes visits; `property` populates to `null`, pending visits against deleted properties cannot be confirmed (`409 PROPERTY_UNAVAILABLE`), historical confirmed visits stay manageable.

## S9 real-time chat (approved decisions)
Source: ADR-026…ADR-028 in `docs/13-decisions-log.md`.

- **Threads (ADR-027)**: property-bound, identified by `(property, buyer)` with a unique index; `POST /api/conversations` is idempotent and persists the opening message. `buyer` is forced to `req.user.id` and `agent` is derived from `Property.agent`. Messages are **append-only** (no edit/delete).
- **Transport (ADR-026)**: Socket.io attached to an `http.createServer(app)` with CORS matching `CLIENT_URL`; handshake auth reuses the `hh_access` cookie and `verifyAccessToken` (unauthenticated sockets are rejected). **Sending is REST-only** — `POST /api/conversations/:id/messages` persists then emits `message:new`; clients emit only `conversation:join`/`conversation:leave`.
- **Rooms & receipts (ADR-028)**: rooms are `conversation:${id}`; `conversation:join` re-checks participation against the database and disconnects non-participants (`NOT_FOUND`, never enumerable). `POST /api/conversations/:id/read` zeroes the caller's unread counter and stamps `readAt` on the other side, then emits `conversation:updated`.
- **Admins**: read-only REST audit (`GET /api/admin/conversations`, `GET /api/admin/conversations/:id/messages`). Admins are not participants, never join rooms, and cannot post.
- **Notifications**: none on chat messages — email/push is strictly deferred to S10 (ADR-024 scope note).

## S13 media, documents & verification (approved decisions)
Source: ADR-035, ADR-036 in `docs/13-decisions-log.md`.

- **Media access gate**: every `/api/properties/:id/images|documents|request-verification` route requires authentication plus a media access check (requireMediaAccess): the owning agent or an admin passes; **every other authenticated caller receives 404 NOT_FOUND, never 403** — document existence is itself access-controlled (ADR-030 enumeration-guard principle applied to media). Buyers therefore never see the documents surface of any listing.
- **Upload authority (ADR-035)**: content type is decided by server-side magic-byte sniffing, never by the client-declared MIME (which must merely agree). Bounds are enforced by multer memoryStorage before any provider call. The `fake` provider is the default (tests/dev never require Cloudinary credentials — ADR-024 pattern).
- **Verification lifecycle (ADR-036)**: `unverified → pending → verified|rejected`. Only the owning agent (or an admin acting on their listing) may `POST /api/properties/:id/request-verification` (requires ≥ 1 active document); only admins decide via `PATCH /api/admin/properties/:id/verification` (approve/reject from `pending` only; reject requires a reason). `verifiedAt`/`verifiedBy` are always server-derived. Re-submission from `verified` resets to `pending` and clears the verification audit fields; `rejected` listings may resubmit with the same action.
- **Mass assignment**: `verificationStatus`, `verifiedAt`, `verifiedBy`, `rejectionReason` are not present on the create/update pick-lists — payloads attempting to set them are silently dropped, and the defaults/enums on the schema enforce the values.
- **Document privacy**: document metadata and bytes are owner/admin-only; delivery flows through the authenticated content route (no public provider URLs; Cloudinary assets are uploaded private). Deleting a document is a soft delete (`status: 'removed'`) so the audit trail survives.
- **Admin verification queue**: `GET /api/admin/verifications` (pending listings with document counts and agent summary). The decision route reuses the standard ownership middleware with `allowAdmin` — consistent with S7's "no parallel admin mutation API" convention.
