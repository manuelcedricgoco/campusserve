import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * Rebuilds the local throwaway test database (Supabase stubs + all migrations + dev seed) once per run.
 * Requires a local PostgreSQL with postgis, pgvector, pgrouting and pg_cron. Never a Supabase project.
 * Set CAMPUSSERVE_SKIP_DB_BUILD=1 to reuse an existing test database.
 */
export default function setup() {
  if (process.env.CAMPUSSERVE_SKIP_DB_BUILD === '1') return;
  const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../Database/tests/build_test_db.sh');
  execFileSync(script, [process.env.CAMPUSSERVE_TEST_DB ?? 'campusserve_test'], {
    stdio: ['ignore', 'ignore', 'inherit'],
    env: {
      ...process.env,
      PGHOST: process.env.PGHOST ?? '/var/tmp/cspg',
      PGPORT: process.env.PGPORT ?? '54329',
      PGUSER: process.env.PGUSER ?? 'postgres',
    },
  });
}
