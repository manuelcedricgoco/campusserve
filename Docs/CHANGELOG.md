# Changelog

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
