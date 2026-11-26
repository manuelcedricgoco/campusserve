# Testing guide

## Local test run

Requirements: PostgreSQL 15+ server and `psql`, `createdb`, `dropdb` on the PATH.

```bash
PGHOST=localhost PGUSER=postgres Database/tests/run_local_tests.sh
```

The script:

1. recreates a throwaway database (`campusserve_test`, override with `CAMPUSSERVE_TEST_DB`);
2. loads `tests/local_supabase_stubs.sql` — stand-ins for Supabase's `anon`, `authenticated` and
   `service_role` roles, `auth.users`, `auth.uid()`, `storage.buckets` and the Realtime publication
   (**local only, never run against Supabase**);
3. applies every migration and the development seed;
4. runs each `tests/0NN_*.sql` suite inside `BEGIN … ROLLBACK`;
5. runs `tests/queue_concurrency_test.sh`.

Each check prints `PASS  <description>`; the first failure stops its suite with `FAIL  <description>`.
Tests switch users the way Supabase does: they set `request.jwt.claims` and `SET ROLE authenticated`, so RLS
and grants are exercised for real.

## Suites

| Suite | Checks | Covers |
|---|---|---|
| `010_rls_access.sql` | 35 | anon blocked; students see only their own data and cannot write directly; officer, office, program-head, cashier and admin scopes; inactive accounts; append-only audit log; RLS on every table |
| `020_queue.sql` | 28 | queue numbers, duplicates, per-service limit, past slots, full slots, capacity constraint, cancellation, rescheduling (including into a full slot), cutoff, staff transitions, call next, slot generation, service requests |
| `030_receipts_remittance.sql` | 20 | obligation applicability (including unconfirmed CBAM), batch scope, a batch total paying nobody, per-allocation verification, rejection, individual receipts, amount mismatch, self-verification |
| `040_guidance_library.sql` | 10 | evaluations before guidance slip (function and constraint), office separation, configurable library prerequisites |
| `050_violations_penalties_payments.sql` | 45 | PADC floor division (9/10/15/20/25/30), SSG 1h/PHP 60 rates, unconfirmed PADC penalty, reporting and review authority, disputes, supersession, community service, policy immutability and history, payments: provider gating, idempotency, signed webhooks, replay detection, amount mismatch, organization verification, reconciliation |
| `060_clearance.sql` | 23 | template lock, initiation authority, CBAM block, snapshot, every gate refusal, full BSIT clearance to completion, unverified/disputed violations not blocking, verified PADC violation blocking the Mayor, visibility |
| `070_ai.sql` | 36 | secret_ref rejects keys; knowledge permission filtering (incl. a restricted chunk containing an injection attempt); public-only mode; vector ranking; versions; official approval four-eyes; conversation privacy; AI suggestion changes nothing official |
| `080_gis.sql` | 40 | nothing seeded; validation (bbox, GeoJSON, type); verification four-eyes and method; routing only over verified data (unavailable states, distance, geometry, accessible-only); visibility; office-scoped editing; search; nearest; campus boundary; import dry run; analytics permissions — synthetic coordinates only |
| `090_automation.sql` | 37 | inert defaults; whitelist (no decision actions); conditions; event → execution → re-evaluation without approval; idempotency; notifications and delivery log; retry/backoff/dead-letter; backend claiming; scheduled jobs and pg_cron sync; scoped monitoring |
| `queue_concurrency_test.sh` | 2 | 10 parallel sessions for 3 places → exactly 3; 8 parallel requests from one student → exactly 1 |

**Total: 274 SQL checks + 2 concurrency checks.**

The local server needs PostGIS, pgvector, pgRouting and pg_cron (Ubuntu: `postgresql-16-postgis-3`,
`postgresql-16-pgvector`, `postgresql-16-pgrouting`, `postgresql-16-cron`) and in `postgresql.conf`:
`shared_preload_libraries = 'pg_cron'` and `cron.database_name = 'campusserve_test'`.

## Results recorded for Phase 1 (2026-11-25/26)

| Where | Result |
|---|---|
| Local PostgreSQL 16, fresh database | all 161 checks pass; concurrency test passed on every run after one test-design fix (round 2 originally reused a student who could already hold a ticket for that service; it now uses a different service) |
| Supabase project `iafcgxwckoelhmfaddzp` (PostgreSQL 17) | all 161 checks pass (each suite run in a transaction that ends with a deliberate error, so nothing was committed; verified afterwards that no test data remained) |
| Schema parity | fingerprints of functions, columns, constraints, indexes, policies, triggers, RLS flags, table and function grants are identical between the tested local database and the live project |
| Phase 1 extension (2026-11-26), local | all 274 checks pass; concurrency test passes; rollback restores the 001–010 schema with 0 differences |
| Phase 1 extension, live project | `070_ai` 36/36, `080_gis` 40/40, `090_automation` 37/37 (rolled back); suites 010–060 were not re-run live after the extension — they pass locally against the identical schema |

The concurrency test was run locally only; it needs several simultaneous sessions, which the Supabase MCP
SQL tool cannot open. The locking it tests is identical on the live project (same function definitions).

## Running a suite against a Supabase project

Only on a development project. Concatenate `tests/_helpers.sql` with a suite, drop the `\ir` line, and
replace the final `rollback;` with

```sql
do $$ begin raise exception 'SUITE passed: % checks (rolled back)', current_setting('cs.passed'); end $$;
```

so the transaction always aborts. The suites rely on the development seed's sample accounts.

## Advisors

After every migration, run the Supabase security and performance advisors. Current accepted findings are
listed in [CHANGELOG.md](CHANGELOG.md).

## Backend integration tests (Phase 2)

```bash
cd Backend && npm test
```

`test/global-setup.ts` rebuilds the local throwaway database (`Database/tests/build_test_db.sh`: Supabase stubs,
all migrations, development seed) once per run, then each test drives the real Express app through HTTP with
HS256 test tokens for the seeded accounts. It uses `PGHOST`/`PGPORT`/`PGUSER` (default `/var/tmp/cspg`, `54329`,
`postgres`). Set `CAMPUSSERVE_SKIP_DB_BUILD=1` to reuse the current database. The build script refuses any
database whose name does not contain `test`.

Covered: token verification (wrong secret, expired, wrong issuer, wrong role, `alg: none`), error mapping,
validation, the full clearance workflow end to end (remittance, receipts, Guidance, Library, ordered signing),
violations, disputes, penalties, community service, sandbox payments (idempotency, bad signatures, amount
mismatch, duplicates, organization verification), queue, requests and file uploads (magic-byte checks, access
isolation), admin (self-lockout, audit, policy and template versioning), reports and CSV escaping, AI (permission
filtering, no leakage of staff-only sources, public mode, daily limit, suggestion-only classification), GIS
(nothing invented, validation, routing only over verified data), automation (closed action list, worker).

Result recorded 2026-11-26 (Phase 3): **108 passed** in 8 files, including `security.test.ts` and `ai-safety.test.ts`.

## Frontend tests

```bash
cd Frontend && npm test          # unit tests (access model, formatting, components): 8 passed
```

```bash
npm run typecheck && npm run build
```

Browser checks need the local stack running (API on :4000 with the test JWT secret, `VITE_DEV_AUTH=true npx vite`):

```bash
node tests/e2e/page-sweep.mjs 320,768,1440     # 45 pages: console errors, failed API calls, overflow, h1
```

```bash
AXE=1 AXE_PATH=/path/to/axe-core/axe.min.js node tests/e2e/page-sweep.mjs 390,1440   # WCAG 2 A/AA
```

```bash
node tests/e2e/flows.mjs     # click-through: book a slot, send a request, sandbox payment end to end
```

Results recorded 2026-11-26: page sweep **no problems** on 45 pages at 320, 768 and 1440 px; axe **0 violations**;
flows: request, provider setting, report/verify/assess, sandbox payment, organization verification and access
denial passed; slot booking passed on a fresh database (a rerun is refused by the one-active-reservation rule, as designed).

## Phase 3 additions

- `Database/tests/100_visibility_equivalence.sql`: every account's visible profiles and students equal the visibility
  rule (guards RLS rewrites for speed).
- `Frontend/tests/e2e/roles.mjs`: role-by-role QA through the UI (run on a freshly built and populated database:
  run `cd Backend && npm test` first).
- `Backend/tests-load/load.mjs <slot-id>`: burst reservations and sustained mixed reads (local only; needs synthetic
  `LOAD-*` students, see the script header and QA report).

Results: [QA_AND_SECURITY_REPORT.md](QA_AND_SECURITY_REPORT.md).
