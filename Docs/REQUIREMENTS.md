# Requirements and status

Status as of Phase 2. "Built" means implemented and covered by automated tests (database SQL suites,
backend integration tests against a local database, frontend unit tests, browser checks). "Configurable"
means the behaviour exists and waits for the school's confirmed values.

## Functional requirements

| # | Requirement | Status |
|---|---|---|
| F1 | Sign in with a university account; roles and positions decide access | Built (Supabase Auth; backend verifies tokens; RLS enforces) |
| F2 | Account creation by the university | **Partial:** accounts are created in Supabase Auth and start inactive until activated in CampusServe (migration 018); roles/positions are managed in CampusServe. In-app invitations and student-record import are not built |
| F3 | Online queue: slots from schedules, capacity, per-student limits, cancellation cut-off, rescheduling, office queue board | Built |
| F4 | Service requests with private documents and a status history | Built |
| F5 | Organization receipts, recorded then verified | Built |
| F6 | Class remittance batches; only individually verified students get receipts | Built; batches are scoped to the class officer's section (Phase 3) |
| F7 | Guidance: teacher evaluations before the guidance slip | Built |
| F8 | Library: ID validation for the academic year, library receipt, library slip | Built. Whether the receipt must come before the slip is **configurable, unconfirmed** |
| F9 | Clearance: SAS initiates; SSG Governor checks receipts and slips; SAS Head; department organization Mayor; Program Head; ordered and configurable | Built (template in the database; versioned) |
| F10 | Violations reported and reviewed by the organization; disputes | Built |
| F11 | SSG penalty: 1 hour or ₱60 per verified violation, student chooses | Built |
| F12 | PADC: floor(bottles ÷ 10) per event, no carry-over | Counting built; **penalty unconfirmed**, so PADC penalties cannot be assessed yet |
| F13 | JOES, JFMS, YMO violation policies | **Not configured:** waiting for the organizations |
| F14 | CBAM department organization mapping | **Unconfirmed:** CBAM students have no department organization yet |
| F15 | Online payment by GCash, Maya, LANDBANK | Provider-independent adapter and signed-webhook flow built; **no real provider integrated** (development sandbox only) |
| F16 | Payment verification and reconciliation by the organization | Built |
| F17 | Notifications in the app | Built. Email and SMS **not connected** |
| F18 | Reports with CSV export, scoped to what each person may see | Built |
| F19 | Administration: users, roles, positions, settings, services, schedules, fees, policy versions, clearance templates, audit log | Built |
| F20 | AI assistant answering from permitted campus documents, with citations; public assistant | Built with the **mock provider**; no real AI model connected; knowledge base is empty until documents are added |
| F21 | AI request classification as a suggestion only | Built |
| F22 | Workflow automation (reminders, notifications, escalation) | Built; rules start disabled |
| F23 | Campus map, search, wayfinding over verified paths | Built; **no campus geometry entered yet** |

## Non-functional requirements

| Requirement | How it is met |
|---|---|
| Security: never trust the frontend | Backend verifies JWTs; every query runs under RLS as the caller; workflow functions re-check permissions |
| Secrets never in the browser or repository | Service-role key, provider keys and DB URL are backend env vars only; frontend gets the anon key only |
| Auditability | Append-only audit log on important tables; actor recorded for admin writes |
| Integrity | Idempotent payments and webhooks; immutable policy versions and active templates; concurrency-safe queue (tested) |
| Responsive 320–1440 px | Checked on 45 pages at 320, 768 and 1440 px: no horizontal overflow |
| Accessibility | axe-core WCAG 2 A/AA: 0 violations on 45 pages; labelled fields, keyboard focus, reduced motion |
| Performance | 835 req/s, p95 83 ms for 50 concurrent users on one local process; exactly-once queue numbering under a 300-request burst (Phase 3) |
| Low bandwidth | Signed-in areas load as separate chunks; system fonts fallback; no external font CDN |
| Time zone | Campus dates are Asia/Manila calendar dates; API returns dates as `YYYY-MM-DD` (tested under `TZ=Asia/Manila`) |

## Waiting for the school

See the "Open items" list in the [README](../README.md).
