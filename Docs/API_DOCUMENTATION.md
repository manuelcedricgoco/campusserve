# CampusServe API

Status: **Phase 2: implemented and tested against a local database.** Not yet deployed (Phase 4).

Base path: `/api/v1`. JSON in and out (`Content-Type: application/json`), except file uploads (`multipart/form-data`) and provider webhooks (raw body).

## Authentication

- Sign-in happens in Supabase Auth from the frontend. The frontend sends the access token as `Authorization: Bearer <token>`.
- The backend verifies the token itself (Supabase JWKS, or the legacy HS256 secret): signature, `aud = authenticated`, `iss = <SUPABASE_URL>/auth/v1`, `role = authenticated`, UUID `sub`, expiry. Unsigned or wrong-issuer tokens get 401 `INVALID_TOKEN`.
- Each request runs in one database transaction as the `authenticated` role with the caller's JWT claims, so every Row Level Security policy and workflow-function permission check applies unchanged. The backend never decides access on the frontend's word.
- New accounts start **inactive** (migration 018): `/me` returns `profile.is_active = false` and other data is empty or refused until an administrator activates the account.
- The service role is used only for webhooks, the public endpoints (read-only, filtered), file metadata after the caller's access was checked, admin writes after a permission check, and the worker.

## Responses

Success: `{ "data": ... }`, and for lists `{ "data": [...], "meta": { "page", "pageSize", "total", "totalPages" } }`. Lists take `page` (default 1) and `pageSize` (default 20, at most 100).

Errors: `{ "error": { "code", "message", "details"?, "requestId" } }`. `message` is safe to show to users. Every response carries `X-Request-Id`.

| HTTP | When | Example codes |
|---|---|---|
| 400 | Invalid input (Zod validation, bad JSON, wrong format) | `VALIDATION_FAILED` (with `details[].path`), `INVALID_JSON`, `INVALID_INPUT`, `IDEMPOTENCY_KEY_REQUIRED` |
| 401 | No or invalid session | `NOT_AUTHENTICATED`, `INVALID_TOKEN`, `INVALID_SIGNATURE` (webhooks) |
| 403 | Not allowed | `FORBIDDEN`, `SELF_VERIFICATION` |
| 404 | Not found **or not visible to the caller** (RLS hides other people's records) | `NOT_FOUND`, `REQUEST_NOT_FOUND`, `ROUTE_NOT_FOUND` |
| 409 | Conflicts with current state | `SLOT_FULL`, `DUPLICATE_RESERVATION`, `INVALID_TRANSITION`, `PREVIOUS_STEPS_PENDING`, `CLEARANCE_REQUIREMENTS_NOT_MET`, `TEMPLATE_LOCKED`, `PAYMENT_IN_PROGRESS` |
| 413 / 415 | File too large / wrong real file type | `FILE_TOO_LARGE`, `UNSUPPORTED_FILE_TYPE` |
| 422 | Business rule refused | `REASON_REQUIRED`, `RESERVATION_LIMIT_REACHED`, `PROVIDER_NOT_AVAILABLE`, `QUANTITY_REQUIRED`, `SELF_LOCKOUT` |
| 429 | Rate limit (per user per minute; stricter for public routes) or AI daily limit | `RATE_LIMITED`, `AI_DAILY_LIMIT` |
| 503 / 504 | Database, sign-in key server, provider or AI not available | `DATABASE_UNAVAILABLE`, `AUTH_UNAVAILABLE`, `PROVIDER_NOT_CONFIGURED`, `AI_PROVIDER_UNAVAILABLE` |

Business-rule codes come from the database (`private.fail(code, message)`); the message text is the database's hint.

## Endpoints

161 routes. Auth column: `Bearer` = signed-in Supabase session; `none` = no session needed.

### Health

Liveness and database readiness. No authentication.

| Method | Path | Auth |
|---|---|---|
| GET | `/api/v1/health` | none |
| GET | `/api/v1/health/ready` | none |

### Current user

The caller's profile, roles, student record, positions for the current academic year and the permissions they grant. `PATCH /me` changes only `fullName` and `phone`.

| Method | Path | Auth |
|---|---|---|
| GET | `/api/v1/me` | Bearer |
| PATCH | `/api/v1/me` | Bearer |

### Catalog and student lookup

Reference data read through RLS. `/public/services` and `/public/offices` return active, non-sensitive fields only. `/students` searches only students the caller may see (`can_view_student`).

| Method | Path | Auth |
|---|---|---|
| GET | `/api/v1/public/services` | none (rate limited) |
| GET | `/api/v1/public/offices` | none (rate limited) |
| GET | `/api/v1/catalog/services` | Bearer |
| GET | `/api/v1/catalog/offices` | Bearer |
| GET | `/api/v1/catalog/organizations` | Bearer |
| GET | `/api/v1/catalog/programs` | Bearer |
| GET | `/api/v1/catalog/academic-years` | Bearer |
| GET | `/api/v1/catalog/events` | Bearer |
| GET | `/api/v1/students` | Bearer |

### Queue

Wraps `reserve_queue_slot`, `cancel_queue_ticket`, `reschedule_queue_ticket`, `call_next_queue_ticket`, `update_queue_ticket_status` and `generate_queue_slots`. Capacity, per-student limits, cut-offs and numbering are enforced in the database (tested under concurrency).

| Method | Path | Auth |
|---|---|---|
| GET | `/api/v1/queue/services/:id/slots` | Bearer |
| POST | `/api/v1/queue/tickets` | Bearer |
| GET | `/api/v1/queue/tickets/mine` | Bearer |
| GET | `/api/v1/queue/tickets/:id` | Bearer |
| POST | `/api/v1/queue/tickets/:id/cancel` | Bearer |
| POST | `/api/v1/queue/tickets/:id/reschedule` | Bearer |
| GET | `/api/v1/queue/offices/:id/board` | Bearer |
| POST | `/api/v1/queue/slots/:id/call-next` | Bearer |
| POST | `/api/v1/queue/tickets/:id/status` | Bearer |
| GET | `/api/v1/queue/schedules` | Bearer |
| POST | `/api/v1/queue/schedules/:id/generate-slots` | Bearer |

### Service requests

Service requests and private supporting documents. Uploads are `multipart/form-data` with one `file` field (PDF, JPEG or PNG, at most 10 MB, type checked by magic bytes). Files are reachable only through 5-minute signed URLs.

| Method | Path | Auth |
|---|---|---|
| POST | `/api/v1/requests` | Bearer |
| GET | `/api/v1/requests` | Bearer |
| GET | `/api/v1/requests/:id` | Bearer |
| POST | `/api/v1/requests/:id/status` | Bearer |
| POST | `/api/v1/requests/:id/documents` | Bearer |
| GET | `/api/v1/requests/:id/documents/:docId/url` | Bearer |

### Receipts and remittances

Organization receipts and class remittances. A batch's declared total never marks anyone as paid; only individually verified batch items become receipt records.

| Method | Path | Auth |
|---|---|---|
| GET | `/api/v1/receipts/obligations` | Bearer |
| GET | `/api/v1/receipts` | Bearer |
| POST | `/api/v1/receipts` | Bearer |
| POST | `/api/v1/receipts/:id/verify` | Bearer |
| GET | `/api/v1/remittances` | Bearer |
| GET | `/api/v1/remittances/:id` | Bearer |
| GET | `/api/v1/remittances/:id/candidates` | Bearer (batch's class officer or the organization's reviewer) |
| POST | `/api/v1/remittances` | Bearer |
| PUT | `/api/v1/remittances/:id/items` | Bearer |
| DELETE | `/api/v1/remittances/items/:id` | Bearer |
| POST | `/api/v1/remittances/:id/submit` | Bearer |
| POST | `/api/v1/remittances/:id/begin-review` | Bearer |
| POST | `/api/v1/remittances/items/:id/verify` | Bearer |
| POST | `/api/v1/remittances/:id/finish-review` | Bearer |

### Guidance and Library

Guidance (teacher evaluations, then the guidance slip) and Library (ID validation, receipt check, then the library slip).

| Method | Path | Auth |
|---|---|---|
| GET | `/api/v1/guidance/records` | Bearer |
| POST | `/api/v1/guidance/confirm-evaluations` | Bearer |
| POST | `/api/v1/guidance/issue-slip` | Bearer |
| GET | `/api/v1/library/records` | Bearer |
| POST | `/api/v1/library/validate-id` | Bearer |
| POST | `/api/v1/library/verify-receipt` | Bearer |
| POST | `/api/v1/library/issue-slip` | Bearer |

### Clearance

Steps and requirements come from the active template in the database. `POST /clearances` without `templateId` uses the single active template for the current academic year. Approving re-checks requirements and refuses out-of-order signing (`PREVIOUS_STEPS_PENDING`, `CLEARANCE_REQUIREMENTS_NOT_MET`).

| Method | Path | Auth |
|---|---|---|
| GET | `/api/v1/clearance/templates` | Bearer |
| POST | `/api/v1/clearances` | Bearer |
| GET | `/api/v1/clearances` | Bearer |
| GET | `/api/v1/clearance/approvals/pending` | Bearer |
| GET | `/api/v1/clearances/:id` | Bearer |
| POST | `/api/v1/clearances/:id/evaluate` | Bearer |
| POST | `/api/v1/clearances/:id/cancel` | Bearer |
| POST | `/api/v1/clearance/approvals/:id/approve` | Bearer |
| POST | `/api/v1/clearance/approvals/:id/return` | Bearer |

### Violations, disputes, penalties, community service

Violations, disputes, penalties and community service. Only verified violations count; a policy whose penalty is not confirmed cannot be assessed. Evidence uploads follow the same rules as request documents (5 MB).

| Method | Path | Auth |
|---|---|---|
| GET | `/api/v1/violations/policies` | Bearer |
| POST | `/api/v1/violations` | Bearer |
| GET | `/api/v1/violations` | Bearer |
| GET | `/api/v1/violations/:id` | Bearer |
| POST | `/api/v1/violations/:id/review` | Bearer |
| POST | `/api/v1/violations/:id/evidence` | Bearer |
| GET | `/api/v1/violations/:id/evidence/:evidenceId/url` | Bearer |
| POST | `/api/v1/violations/:id/disputes` | Bearer |
| POST | `/api/v1/disputes/:id/decide` | Bearer |
| POST | `/api/v1/penalties/assess` | Bearer |
| GET | `/api/v1/penalties` | Bearer |
| GET | `/api/v1/penalties/:id` | Bearer |
| POST | `/api/v1/penalties/:id/resolution` | Bearer |
| POST | `/api/v1/penalties/resolutions/:id/community-service` | Bearer |
| POST | `/api/v1/community-service/:id/verify` | Bearer |
| GET | `/api/v1/community-service` | Bearer |

### Payments

`POST /payments` needs an `Idempotency-Key` header (16 to 100 of `A-Z a-z 0-9 _ -`). A payment counts only after a signed provider callback **and** organization verification. `POST /webhooks/payments/:provider` takes the raw body; an invalid signature is recorded, ignored and answered with 401. `POST /payments/sandbox/complete` exists only while the development sandbox is enabled and is refused in production.

| Method | Path | Auth |
|---|---|---|
| GET | `/api/v1/payments/providers` | Bearer |
| POST | `/api/v1/payments` | Bearer |
| GET | `/api/v1/payments` | Bearer |
| GET | `/api/v1/payments/:id` | Bearer |
| POST | `/api/v1/payments/:id/verify` | Bearer |
| POST | `/api/v1/payments/:id/reconcile` | Bearer |
| GET | `/api/v1/payments-webhooks` | Bearer |
| POST | `/api/v1/webhooks/payments/:provider` | provider signature |
| POST | `/api/v1/payments/sandbox/complete` | Bearer |

### Notifications

The caller's own notifications. Only `read_at` can change.

| Method | Path | Auth |
|---|---|---|
| GET | `/api/v1/notifications` | Bearer |
| POST | `/api/v1/notifications/:id/read` | Bearer |
| POST | `/api/v1/notifications/read-all` | Bearer |

### Reports

Every report runs as the caller, so RLS limits it to records they may see. Add `format=csv` for a CSV download (formula characters are neutralised).

| Method | Path | Auth |
|---|---|---|
| GET | `/api/v1/reports/summary` | Bearer |
| GET | `/api/v1/reports/receipts-by-obligation` | Bearer |
| GET | `/api/v1/reports/queue-daily` | Bearer |
| GET | `/api/v1/reports/clearance-steps` | Bearer |
| GET | `/api/v1/reports/violations-by-organization` | Bearer |

### Administration

Each route checks the caller's global permission (`users.manage`, `config.manage` or `audit.view`) in the same transaction, then writes with the service role; audit triggers record the caller. Self-lockout is refused. Active clearance templates and policy versions are immutable; copy to a draft, edit, then activate.

| Method | Path | Auth |
|---|---|---|
| GET | `/api/v1/admin/users` | Bearer |
| GET | `/api/v1/admin/users/:id` | Bearer |
| PATCH | `/api/v1/admin/users/:id` | Bearer |
| POST | `/api/v1/admin/users/:id/roles` | Bearer |
| DELETE | `/api/v1/admin/users/:id/roles/:role` | Bearer |
| GET | `/api/v1/admin/positions` | Bearer |
| POST | `/api/v1/admin/assignments` | Bearer |
| POST | `/api/v1/admin/assignments/:type/:id/revoke` | Bearer |
| GET | `/api/v1/admin/settings` | Bearer |
| PUT | `/api/v1/admin/settings/:key` | Bearer |
| POST | `/api/v1/admin/academic-years` | Bearer |
| POST | `/api/v1/admin/academic-years/:id/set-current` | Bearer |
| POST | `/api/v1/admin/services` | Bearer |
| PATCH | `/api/v1/admin/services/:id` | Bearer |
| POST | `/api/v1/admin/queue-schedules` | Bearer |
| PATCH | `/api/v1/admin/queue-schedules/:id` | Bearer |
| POST | `/api/v1/admin/receipt-obligations` | Bearer |
| PATCH | `/api/v1/admin/receipt-obligations/:id` | Bearer |
| GET | `/api/v1/admin/violation-policies/:id/versions` | Bearer |
| POST | `/api/v1/admin/violation-policies/:id/versions` | Bearer |
| POST | `/api/v1/admin/policy-versions/:id/activate` | Bearer |
| POST | `/api/v1/admin/clearance-templates/:id/new-version` | Bearer |
| PATCH | `/api/v1/admin/clearance-steps/:id` | Bearer |
| POST | `/api/v1/admin/clearance-templates/:id/activate` | Bearer |
| GET | `/api/v1/admin/audit-logs` | Bearer |

### AI assistant and knowledge

The assistant answers only from sources the caller may see (`search_knowledge` permission filter) and cites them. It has no write tools. `/public/ai/chat` uses public sources only and a 2-hour anonymous session token. `POST /ai/requests/:id/suggest-category` records a suggestion only; request status is untouched. Daily per-user limit from `ai_provider_settings.max_requests_per_user_per_day` (429 `AI_DAILY_LIMIT`).

| Method | Path | Auth |
|---|---|---|
| POST | `/api/v1/ai/chat` | Bearer |
| GET | `/api/v1/ai/conversations` | Bearer |
| GET | `/api/v1/ai/conversations/:id` | Bearer |
| DELETE | `/api/v1/ai/conversations/:id` | Bearer |
| POST | `/api/v1/ai/messages/:id/feedback` | Bearer |
| POST | `/api/v1/public/ai/chat` | none (rate limited) |
| GET | `/api/v1/ai/sources` | Bearer |
| POST | `/api/v1/ai/sources` | Bearer |
| POST | `/api/v1/ai/sources/:id/official` | Bearer |
| GET | `/api/v1/ai/sources/:id/documents` | Bearer |
| POST | `/api/v1/ai/sources/:id/documents` | Bearer |
| POST | `/api/v1/ai/sources/:id/documents/manual` | Bearer |
| POST | `/api/v1/ai/requests/:id/suggest-category` | Bearer |
| GET | `/api/v1/ai/usage` | Bearer |

### Campus map (GIS)

Coordinates come only from administrator entry or import; new features are unverified until a second person verifies them. Routing uses verified paths only and answers `{status: "unavailable", reason}` instead of guessing. Public routes return public, verified features only.

| Method | Path | Auth |
|---|---|---|
| GET | `/api/v1/public/gis/map` | none (rate limited) |
| GET | `/api/v1/public/gis/search` | none (rate limited) |
| GET | `/api/v1/public/gis/route` | none (rate limited) |
| GET | `/api/v1/gis/campuses` | Bearer |
| GET | `/api/v1/gis/layers` | Bearer |
| GET | `/api/v1/gis/map` | Bearer |
| GET | `/api/v1/gis/search` | Bearer |
| GET | `/api/v1/gis/route` | Bearer |
| GET | `/api/v1/gis/services/:id/nearest` | Bearer |
| GET | `/api/v1/gis/activity` | Bearer |
| POST | `/api/v1/gis/campuses/:id/geometry` | Bearer |
| POST | `/api/v1/gis/locations` | Bearer |
| POST | `/api/v1/gis/buildings` | Bearer |
| POST | `/api/v1/gis/buildings/:id/boundary` | Bearer |
| POST | `/api/v1/gis/paths` | Bearer |
| POST | `/api/v1/gis/verify` | Bearer |
| POST | `/api/v1/gis/import` | Bearer |
| POST | `/api/v1/gis/services/:id/locations` | Bearer |

### Automation

Rules use a closed action list (no approve, verify, assess or pay). New rules start disabled. The backend worker (`npm run worker`) handles `generate_report` and `send_email`; email fails with `EMAIL_PROVIDER_NOT_CONFIGURED` because no email provider is connected.

| Method | Path | Auth |
|---|---|---|
| GET | `/api/v1/automation/triggers` | Bearer |
| GET | `/api/v1/automation/rules` | Bearer |
| POST | `/api/v1/automation/rules` | Bearer |
| POST | `/api/v1/automation/rules/:id/enabled` | Bearer |
| GET | `/api/v1/automation/executions` | Bearer |
| GET | `/api/v1/automation/executions/:id/logs` | Bearer |
| GET | `/api/v1/automation/errors` | Bearer |
| GET | `/api/v1/automation/scheduled-jobs` | Bearer |
| PUT | `/api/v1/automation/scheduled-jobs/:code` | Bearer |
| POST | `/api/v1/automation/scheduled-jobs/:code/run` | Bearer |
| GET | `/api/v1/automation/templates` | Bearer |
| POST | `/api/v1/automation/templates` | Bearer |

## Payment providers

`GET /payments/providers` reports each provider's real mode: `not_configured` (default: GCash, Maya and LANDBANK merchant integrations do not exist yet; checkout answers 503 `PROVIDER_NOT_CONFIGURED`), or `sandbox` (development only, `PAYMENT_SANDBOX=true`, refused when `NODE_ENV=production`). In addition, the database setting `payments.enabled_providers` must list a provider before any payment can be created. Real adapters must be written against each provider's official merchant API once credentials and webhook validation are available; no endpoint has been invented for them.

## Not yet available

- Account creation and invitations from CampusServe (accounts are created in Supabase Auth for now).
- Real GCash, Maya and LANDBANK adapters; email and SMS delivery; PDF/DOCX text extraction for the knowledge base; community-service proof uploads (no column exists yet).
