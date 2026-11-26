# Phase 3: integration, QA and security report

Date: 2026-11-26. Scope: the live Supabase project `iafcgxwckoelhmfaddzp` (Auth, REST, Storage, database),
plus the backend and frontend running locally against a test copy of the database. Nothing is deployed yet
(Phase 4).

## Findings and fixes

| # | Severity | Finding | Fix | Status |
|---|---|---|---|---|
| 1 | Medium | **Public sign-up was enabled** and each new Auth user got an *active* profile. A stranger could not reach any student's records, but could read members-only content (assistant knowledge marked "signed-in users", restricted map layers, organizations, policies, fees, clearance templates) and use the assistant quota. | Migration **018**: new profiles start **inactive** until an administrator activates them. Existing accounts unchanged. The assistant refuses inactive accounts; the app shows "Your account is not active yet". | Fixed, live, verified with a real sign-up. **Also disable public sign-up in the dashboard** (your action). |
| 2 | Medium | **Performance:** the `profiles` and `students` RLS policies ran the full permission check for every row. `/me` took 675 ms with 310 students, and scoped officers' student search took 362 ms. Both grow linearly with enrolment (seconds at campus scale). | Migration **019**: same rules, evaluated once per query. A new test proves every account sees exactly the same rows. | Fixed, live: 0 mismatches over all 18 live accounts. `/me` 9.7 ms; sustained load 31 → 835 req/s. |
| 3 | Medium | **Class officers could not add anyone to a remittance batch.** They have no `students.view`, so the student search was empty. Items they did add were invisible to them, so the batch could not be submitted. | Batches default to the officer's own class. A new endpoint `GET /remittances/:id/candidates`, for the batch's officer or the organization's reviewer only, returns eligible students' names and numbers. Batch item names are resolved after the batch's visibility is confirmed. Migration **020** lets the backend use the existing eligibility rule. | Fixed, live (020), covered by tests and the browser flow. |
| 4 | Medium | **The cashier saw no payments** despite `payments.view_all`. The same effect hit any list where the viewer may see the record but not the student's profile. Cause: inner joins to RLS-protected `profiles` and `students`. | Lists use LEFT JOINs, so RLS on the record itself decides. Student names for visible rows are then filled in by one helper. | Fixed, covered by a cashier test. |
| 5 | Low | An unreachable key server (JWKS) made every valid session look **expired** (401). | It now answers 503 `AUTH_UNAVAILABLE`, with the cause logged server-side only. | Fixed, tested. |
| 6 | Low | Map tiles come from OpenStreetMap's public servers, which are for light use only. | Tile URL and attribution are configurable (`VITE_MAP_TILE_URL`, `VITE_MAP_ATTRIBUTION`). | Choose a production tile provider in Phase 4. |
| 7 | Info | Leaked-password protection is disabled in Supabase Auth. | Dashboard setting. | **Your action.** |
| 8 | Info (accepted) | Advisor: 64 SECURITY DEFINER functions are callable by signed-in users. | By design: each checks the caller and permissions inside (tested live via REST below). | Accepted. |
| 9 | Info | Live tokens are **ES256**, verified through JWKS. Hosts that reach the internet only through a proxy need `NODE_USE_ENV_PROXY=1` for Node's fetch (this sandbox did; Render does not). | Documented. | n/a |

## Live tests (Supabase project, 2026-11-26)

- **Anonymous (publishable key):**
  - all 89 tables are unreadable (42501);
  - all 70 public functions are refused;
  - inserts and updates are refused;
  - Storage lists are empty, with no public object URLs;
  - GraphQL is disabled.
- **Real Auth session:** a temporary QA account was created directly in Auth (only a bcrypt hash was sent) and signed in through `/auth/v1/token`.
  - The real ES256 token was accepted by the backend through the live JWKS.
  - These variants were rejected: role changed to service_role, subject swapped, signature removed, `alg: none`, a corrupted signature byte, an extended expiry, wrong audience, and a different issuer.
  - (Changing only the signature's last base64url character can decode to the same bytes; that is not a forgery.)
- **RLS as that real user over the live REST API:**
  - *Inactive:* sees only their own profile; workflow functions refuse with ACCOUNT_INACTIVE.
  - *Active, no student record or positions:* sees reference data only; direct writes are refused; webhook and checkout functions are refused; automation configuration and clearance initiation are refused with FORBIDDEN; reservation is refused with NOT_A_STUDENT.
- **Clean-up:** the QA account and its identities, sessions, profile and roles were removed. Two append-only audit entries remain by design. Local copies of the password and token were shredded.
- **Storage configuration:**
  - five private buckets, with size and type limits matching the backend's own checks;
  - no `storage.objects` policies, so only the backend can reach files.
  - Live upload through the backend needs the service-role key, which is a deployment secret; that test belongs in Phase 4.

## Automated results (local test copy, after all fixes)

| Suite | Result |
|---|---|
| Database SQL suites (incl. new `100_visibility_equivalence.sql`) | 276 passed, 0 failed, plus both concurrency tests |
| Backend integration and security tests (`npm test`) | 108 passed (8 files) |
| Frontend unit tests | 8 passed; typecheck and production build pass |
| Browser: role-by-role QA (`tests/e2e/roles.mjs`) | 15 of 15 passed. A full clearance went through the UI across nine roles: SAS starts it; class officer remittance and SSG treasurer review; PADC fee; Guidance and Library slips; SSG Governor, SAS Head, PADC Mayor and Program Head sign; the student sees it completed with signer names. Also: Registrar request processing, the Guidance queue board, account activation, and keyboard use (skip link, dialog focus and Escape). |
| Browser: original flows (`tests/e2e/flows.mjs`) | 7 of 7 passed |
| Browser: 45 pages × 320/768/1440 px, with axe WCAG 2 A/AA | No console errors, failed API calls, overflow or accessibility violations. The only console errors were map-tile downloads blocked by this test environment's network policy. |
| Security suite highlights | Stranger accounts; a 32-endpoint authorization matrix as a student (no writes happen); cross-organization refusals; mass assignment; SQL text in search; path and control-character validation; 1 MB body limit; upload traversal, spoofing and size; webhook tampering; the production provider default; HSTS, CSP and frame headers; CORS allowlist; per-user and public rate limits; no internal error details. |
| AI safety | Adapter tested against a local fake OpenAI-compatible server (key from the named env var; error, timeout and dimension handling). An injected "SYSTEM OVERRIDE" document plus a deliberately malicious model answer changed no records. Staff-only text is never sent to the model. |

## Load test (`Backend/tests-load/load.mjs`, local)

| Scenario | Result |
|---|---|
| 300 different students reserve one 5-place slot at the same moment | Exactly 5 reservations, numbered 1 to 5; 295 × 409 `SLOT_FULL`. p50 390 ms, p95 441 ms under the burst. |
| 50 concurrent users × 15 s of mixed reads (`/me`, slots, tickets, notifications, requests, clearances) | 835 req/s, 0 errors, p50 58 ms, p95 83 ms, p99 95 ms (one API process, pool of 10 connections). Before migration 019: 31 req/s, p95 3.4 s. |

These numbers come from one local machine and show relative improvement. Production capacity must be
measured on the deployed services in Phase 4.

## Not tested (and why)

- **Live Storage uploads, live backend against the live database, and real payment or AI providers.** The backend needs the
  database URL and service-role key, which are deployment secrets, and no provider is integrated. These are Phase 4 items.
- **Email delivery** (no provider), and **real AI model behaviour against injection**. Only the structural defences
  were tested; re-test once an AI provider is approved.
