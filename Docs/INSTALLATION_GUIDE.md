# Installation guide — Supabase database

Phase 1 covers the database only. The backend and frontend are not built yet.

## Existing project

| | |
|---|---|
| Project name | CampusServe |
| Project ref | `iafcgxwckoelhmfaddzp` |
| Region | `ap-southeast-1` (Singapore) |
| API URL | `https://iafcgxwckoelhmfaddzp.supabase.co` |
| Plan | Free |
| Applied | migrations 001–010 and the development seed |

Keys are in the Supabase dashboard → Project Settings → API. Never commit them.

## Setting up a new project from scratch

1. Create a Supabase project (PostgreSQL 15 or later).
2. Apply the migrations **in order** — they depend on each other:

   ```bash
   for f in Database/migrations/0*.sql; do psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f "$f"; done
   ```

   `SUPABASE_DB_URL` is the connection string from Project Settings → Database (use the session pooler or
   direct connection; it contains the database password, so keep it out of the repository). You can also
   paste each file into the SQL editor in order, or apply them with the Supabase MCP `apply_migration` tool
   (that is how the existing project was set up).
3. Development only — load sample data:

   ```bash
   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f Database/seed/001_dev_seed.sql
   ```

   Sample accounts end in `@campusserve.test` and have **no password**, so nobody can sign in with them.
   Before production, review and run `Database/seed/900_remove_dev_seed.sql`.
4. Configure Auth (dashboard → Authentication):
   - enable **leaked password protection** (the security advisor flags it as disabled);
   - keep email confirmation on;
   - set the site URL and redirect URLs once the frontend exists.
5. Create the first administrator: the person signs up normally (they get the `student` role), then in
   the SQL editor:

   ```sql
   insert into public.user_roles (user_id, role)
   select id, 'administrator' from auth.users where email = '<their email>';
   delete from public.user_roles
    where role = 'student' and user_id = (select id from auth.users where email = '<their email>');
   ```

6. Production configuration that must be confirmed by the school before use (see
   [VIOLATION_POLICIES.md](VIOLATION_POLICIES.md) and [CLEARANCE_WORKFLOW.md](CLEARANCE_WORKFLOW.md)):
   real receipt obligation amounts and applicability, the CBAM mapping, PADC's penalty, JOES / JFMS / YMO
   policies, full program names, `library.slip_prerequisites`, the real academic year dates.
7. Run the advisors (dashboard → Advisors) after every schema change.

## Environment variables (names only)

| Variable | Used by | Secret |
|---|---|---|
| `SUPABASE_URL` | backend | no |
| `SUPABASE_ANON_KEY` | backend (user-scoped client) | publishable |
| `SUPABASE_SERVICE_ROLE_KEY` | backend only | **yes** — never in the frontend |
| `SUPABASE_DB_URL` | applying migrations from a terminal | **yes** (contains the DB password) |
| `VITE_SUPABASE_URL` | frontend | no |
| `VITE_SUPABASE_ANON_KEY` | frontend | publishable |

Payment provider credentials will be added (backend only) when a provider is actually onboarded.

## Running the database tests locally

See [TESTING_GUIDE.md](TESTING_GUIDE.md). The tests need a local PostgreSQL 15+ server; they never touch a
Supabase project.
