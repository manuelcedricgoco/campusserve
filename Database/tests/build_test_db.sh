#!/usr/bin/env bash
# Builds a throwaway PostgreSQL database with Supabase stubs, every migration
# and the development seed. Used by run_local_tests.sh and the backend tests.
#
# Usage: PGHOST=... PGPORT=... PGUSER=postgres Database/tests/build_test_db.sh [db_name]
# Requires a local PostgreSQL 15+ server. NEVER point this at a Supabase project.
set -euo pipefail

DB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_NAME="${1:-${CAMPUSSERVE_TEST_DB:-campusserve_test}}"
case "$DB_NAME" in *test*) ;; *) echo "Refusing: database name must contain 'test'" >&2; exit 2;; esac
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -d "$DB_NAME")

echo "Recreating database $DB_NAME"
dropdb --if-exists --force "$DB_NAME"
createdb "$DB_NAME"

"${PSQL[@]}" -f "$DB_DIR/tests/local_supabase_stubs.sql" 2>&1 | grep -v -e wal_level -e 'logical' || true
for f in "$DB_DIR"/migrations/[0-9]*.sql; do
  echo "Applying $(basename "$f")"
  "${PSQL[@]}" -f "$f"
done
echo "Applying development seed"
"${PSQL[@]}" -f "$DB_DIR/seed/001_dev_seed.sql"
