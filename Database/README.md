# CampusServe — Database

Supabase PostgreSQL schema, security, seed data and tests.

```
Database/
├── migrations/   001–016, applied in order (never edit an applied migration; add a new one)
├── rollback/     016_to_011_down.sql (removes the AI/GIS/automation extension; destructive)
├── seed/         001_dev_seed.sql (development only), 900_remove_dev_seed.sql
├── tests/        SQL test suites, local Supabase stubs, test runner, concurrency test
└── tools/        table-reference generator, schema fingerprint
```

| Migration | Purpose |
|---|---|
| `001_initial_schema.sql` | core reference data, identity, settings, notifications, audit log |
| `002_user_roles_and_assignments.sql` | roles, positions, permissions, assignments, authorization helpers |
| `003_receipts_and_remittances.sql` | obligations, receipts, batch remittance |
| `004_guidance_and_library.sql` | guidance and library requirements |
| `005_violation_management.sql` | policies, versions, violations, disputes, count calculation |
| `006_penalty_and_payment_system.sql` | assessments, resolutions, community service, payments, webhooks, reconciliation |
| `007_queue_management.sql` | services, requests, schedules, slots, tickets |
| `008_clearance_workflow.sql` | configurable clearance templates and the secure approval gate |
| `009_rls_and_security.sql` | RLS, grants, policies, triggers, storage buckets, Realtime, default settings |
| `010_rls_performance.sql` | per-query evaluation of policy checks |
| `011_extensions.sql` | pgvector, PostGIS, pgRouting, pg_trgm, pg_cron |
| `012_ai_foundation.sql` | AI assistant / RAG knowledge base / usage |
| `013_gis_foundation.sql` | campus GIS, verification, routing, analytics |
| `014_automation_foundation.sql` | event-driven and scheduled automation |
| `015_extension_integration.sql` | additive columns, event triggers, permissions, buckets |
| `016_extension_rls_and_grants.sql` | RLS, grants, triggers, pg_cron executor |

All sixteen are applied to the Supabase project `iafcgxwckoelhmfaddzp`.

## Common tasks

```bash
# test everything locally (needs a local PostgreSQL 15+)
Database/tests/run_local_tests.sh

# regenerate Docs/DATABASE_TABLE_REFERENCE.md after a migration
Database/tools/generate_table_reference.sh

# compare a database's schema with another one
psql "$DB" -f Database/tools/schema_fingerprint.sql
```

Adding a migration: create `011_<name>.sql`; if it creates tables, enable RLS, revoke from `anon` and
`authenticated`, grant `SELECT` to `authenticated` with policies, and grant `EXECUTE` explicitly on any new
function (Supabase grants new objects to `anon` / `authenticated` by default). Add tests, run the local
suite, apply to Supabase, compare fingerprints, run the advisors, and record it in `Docs/CHANGELOG.md`.

Documentation: [schema](../Docs/DATABASE_SCHEMA.md) · [table reference](../Docs/DATABASE_TABLE_REFERENCE.md) ·
[roles and RLS](../Docs/USER_ROLES_AND_PERMISSIONS.md) · [setup](../Docs/INSTALLATION_GUIDE.md) ·
[tests](../Docs/TESTING_GUIDE.md) · [history](../Docs/CHANGELOG.md)
