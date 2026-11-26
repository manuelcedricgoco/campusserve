# Changelog

## Phase 2 — Backend and frontend (2026-11-26)

- **Backend** (`Backend/`): Express 5 + TypeScript REST API, 161 endpoints across 16 modules; Supabase JWT
  verification; per-request transactions as `authenticated` with the caller's claims (RLS applies); provider
  adapters for payments (not configured / development sandbox), AI (mock + OpenAI-compatible adapter) and
  storage (Supabase private buckets / memory); signed payment webhooks; knowledge ingestion; automation worker.
- **Frontend** (`Frontend/`): React 18 + Vite 7 + TypeScript + Tailwind; public site and student, organization,
  office, department, cashier and administration workspaces.
- **Migration 017** `017_service_role_error_helper` (applied to `iafcgxwckoelhmfaddzp`, verified):
  `grant execute on private.fail(text,text,text) to service_role`. Protective triggers called by service-role
  writes raised "permission denied for function fail" instead of their business error. Rollback:
  `Database/rollback/017_down.sql`. `anon`/`authenticated` privileges unchanged (verified).
- `Database/tests/build_test_db.sh` factored out of `run_local_tests.sh` (used by the backend tests).
- Fixed during Phase 2: Postgres `date` values were serialized as timestamps (wrong day outside UTC); now
  `YYYY-MM-DD`. Clearance signer names are shown to the student. Started queue slots are hidden.
- Advisors after 017: unchanged (64 accepted SECURITY DEFINER warnings; leaked-password protection is a
  dashboard setting still to enable).

## Phase 1 extension — AI, automation and advanced GIS foundation (2026-11-26)

Authorized decisions D1–D8 of [PHASE1_EXTENSION_IMPACT_ASSESSMENT.md](PHASE1_EXTENSION_IMPACT_ASSESSMENT.md).
Repository moved to `manuelcedricgoco/campusserve` (branch `development`).

| # | File | Applied to Supabase as | Contents |
|---|---|---|---|
| 011 | `011_extensions.sql` | `011_extensions` | vector 0.8.2, postgis 3.3.7, pgrouting 3.4.1, pg_trgm 1.6 in `extensions`; pg_cron 1.6.4 |
| 012 | `012_ai_foundation.sql` | `012_ai_foundation` | 11 AI tables, permission-filtered hybrid retrieval, knowledge management, mock providers, guard-rail prompts |
| 013 | `013_gis_foundation.sql` | `013_gis_foundation` | 13 GIS tables, geometry validation, verification with four-eyes rule, routing over verified paths, GeoJSON, search, analytics; campus row without geometry |
| 014 | `014_automation_foundation.sql` | `014_automation_foundation` | 10 automation tables, idempotent event outbox, matcher, executor with retries/dead-letter, scheduler, templates; all rules/jobs disabled |
| 015 | `015_extension_integration.sql` | `015_extension_integration` | additive nullable columns, event-capture triggers on 10 existing tables, 9 permissions, 2 private buckets |
| 016 | `016_extension_rls_and_grants.sql` | `016_extension_rls_and_grants` | RLS and 34 policies for new tables, grants, audit and `updated_at` triggers, pg_cron executor job |

Validation:
- Existing schema preserved: all 1 444 pre-existing objects (functions, columns, constraints, policies, indexes,
  grants) byte-identical after 011–016; no anon grants added; existing data unchanged.
- Live schema identical to the tested local schema (9 fingerprints match with Supabase's `search_path`).
- Tests: 274 SQL checks + concurrency test locally; the three new suites (113 checks) also on the live project.
- Rollback `Database/rollback/016_to_011_down.sql` tested locally: restores the 001–010 schema exactly
  (1 550 objects, 0 differences).
- Fixes found by the new tests before release: full-text ranking returned non-matching chunks with a tiny
  positive rank; route distance omitted the last segment.

Advisors after the extension: security — 64 × `authenticated_security_definer_function_executable` (accepted:
workflow functions that check the caller) and leaked-password protection disabled (dashboard action);
performance — no warnings (163 unindexed FKs and 51 unused indexes, informational).

## Phase 1 — Supabase database (2026-11-25/26)

Supabase project **CampusServe** (ref `iafcgxwckoelhmfaddzp`, `ap-southeast-1`) created and built.

### Migration history

| # | File | Applied to Supabase as | Contents |
|---|---|---|---|
| 001 | `001_initial_schema.sql` | `20261125153838_001_initial_schema` | `private` schema and helpers, academic years, departments, organizations, clubs, programs (with mapping status), offices, profiles, students, system settings, notifications, append-only audit log |
| 002 | `002_user_roles_and_assignments.sql` | `20261125153948_002_user_roles_and_assignments` | user roles, positions, permissions, position/role permissions, office / organization / academic assignments, organization members, new-user trigger, authorization helpers, permission catalog |
| 003 | `003_receipts_and_remittances.sql` | `20261125154110_003_receipts_and_remittances` | receipt obligations, receipt records and verifications, remittance batches and items, receipt and batch workflow functions |
| 004 | `004_guidance_and_library.sql` | `20261125154159_004_guidance_and_library` | guidance and library records, slip prerequisite rules and functions |
| 005 | `005_violation_management.sql` | `20261125154308_005_violation_management` | events, policies and immutable versions, violation records, evidence, reviews, disputes, count calculation, report / review / dispute functions |
| 006 | `006_penalty_and_payment_system.sql` | `20261125154448_006_penalty_and_payment_system` | assessments (snapshot, immutable), resolutions, community service, penalty payments, webhook events, reconciliation, assessment / resolution / payment functions |
| 007 | `007_queue_management.sql` | `20261125154608_007_queue_management` | services, requests, documents, status history, schedules, slots, tickets, events, atomic reservation and queue functions |
| 008 | `008_clearance_workflow.sql` | `20261125154727_008_clearance_workflow` | templates, steps, requirements, student clearances, approvals, requirement status, history, evaluation and secure approval functions |
| 009 | `009_rls_and_security.sql` | `20261125154821_009_rls_and_security` | RLS on all tables, grants, 56 policies, `updated_at` and audit triggers, private storage buckets, Realtime publication, default settings |
| 010 | `010_rls_performance.sql` | `20261125155616_010_rls_performance` | policies rewritten to evaluate `auth.uid()` and global permission checks once per query (advisor `auth_rls_initplan`); access rules unchanged |

The migration order differs slightly from the suggested example: queue management (007) comes after
penalties because nothing depends on it, and clearance (008) comes after receipts, guidance, library and
violations because its requirement checks read all of them. RLS (009) is last so it covers every table.

Development seed (`Database/seed/001_dev_seed.sql`) loaded with `execute_sql` (data, not a migration).

### Advisor findings after Phase 1

| Advisor | Finding | Status |
|---|---|---|
| Security | 40 × `authenticated_security_definer_function_executable` | **Accepted by design**: these are the workflow functions; each identifies the caller with `auth.uid()` and checks the assignment. Covered by the test suites. |
| Security | `auth_leaked_password_protection` disabled | **Action needed** in the dashboard (Authentication settings). |
| Performance | 19 × `auth_rls_initplan` | **Fixed** by migration 010. |
| Performance | 94 × `unindexed_foreign_keys` (INFO) | Reviewed: mostly actor columns (`verified_by`, `assigned_by`, ...) that are not queried by. Add indexes when real query patterns show the need. |
| Performance | 32 × `unused_index` (INFO) | Expected on a new database with no traffic. |

### Not invented (left configurable and documented)

CBAM organization mapping; PADC penalty amount and options; JOES, JFMS and YMO policies; real fee amounts;
club receipt applicability; full program names; whether the library receipt is a library-slip prerequisite.
