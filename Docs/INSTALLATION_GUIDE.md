# Installation guide

Phase 1 covers the database only (including the AI, GIS and automation foundation). The backend and frontend are not built yet.

## Existing project

| | |
|---|---|
| Project name | CampusServe |
| Project ref | `iafcgxwckoelhmfaddzp` |
| Region | `ap-southeast-1` (Singapore) |
| API URL | `https://iafcgxwckoelhmfaddzp.supabase.co` |
| Plan | Free |
| Applied | migrations 001–016 and the development seed |

Keys are in the Supabase dashboard → Project Settings → API. Never commit them.

## Setting up a new project from scratch

1. Create a Supabase project (PostgreSQL 15 or later). Migration 011 enables `vector`, `postgis`, `pgrouting`,
   `pg_trgm` and `pg_cron`; check they are available (Database → Extensions) before applying.
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

## Environment variables

Full lists with comments: [`Backend/.env.example`](../Backend/.env.example) and
[`Frontend/.env.example`](../Frontend/.env.example). Secrets (**backend only**): `DATABASE_URL`,
`SUPABASE_JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `PAYMENT_SANDBOX_SECRET`, and any AI provider key named
by `ai_provider_settings.secret_ref`. The frontend receives only `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
(publishable) and `VITE_API_URL`.

Payment provider credentials will be added (backend only) when a provider is actually onboarded.

## Running the backend and frontend locally

Requirements: Node.js 22, a PostgreSQL 15+ server with PostGIS, pgvector, pgRouting and pg_cron for the local
test database (see [TESTING_GUIDE.md](TESTING_GUIDE.md)), or a Supabase project.

```bash
cd Backend && npm ci && cp .env.example .env    # then fill in .env
```

```bash
npm run dev          # API on http://localhost:4000 (npm run build && npm start for the compiled server)
```

```bash
npm run worker       # optional: automation worker (after npm run build)
```

```bash
cd Frontend && npm ci && cp .env.example .env   # set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
```

```bash
npm run dev          # http://localhost:5173, proxies /api to :4000
```

Signing in needs a Supabase Auth user linked to a CampusServe profile. The development seed's sample accounts
have no passwords; set one in the Supabase dashboard for a test project, never for production.

**Developer tokens (local only).** With `VITE_DEV_AUTH=true`, `vite dev` (never a production build) accepts a
token stored in `localStorage['campusserve.devToken']`. The browser checks in `Frontend/tests/e2e` mint such
tokens with the local test JWT secret for the seeded accounts. Never use this against a real project.

## Running the database tests locally

See [TESTING_GUIDE.md](TESTING_GUIDE.md). The tests need a local PostgreSQL 15+ server; they never touch a
Supabase project.
