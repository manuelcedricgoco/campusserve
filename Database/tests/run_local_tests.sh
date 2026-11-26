#!/usr/bin/env bash
# Builds the throwaway test database (build_test_db.sh), then runs the SQL
# test suites.
#
# Usage: PGHOST=... PGPORT=... PGUSER=postgres Database/tests/run_local_tests.sh
# Requires a local PostgreSQL 15+ server. NEVER point this at a Supabase project.
set -euo pipefail

DB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_NAME="${CAMPUSSERVE_TEST_DB:-campusserve_test}"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -d "$DB_NAME")

"$DB_DIR/tests/build_test_db.sh" "$DB_NAME"

status=0
for t in "$DB_DIR"/tests/[0-9]*_*.sql; do
  echo "Running $(basename "$t")"
  if ! "${PSQL[@]}" -t -f "$t" > /dev/null; then
    status=1
  fi
done

if [[ -x "$DB_DIR/tests/queue_concurrency_test.sh" ]]; then
  echo "Running queue_concurrency_test.sh"
  CAMPUSSERVE_TEST_DB="$DB_NAME" "$DB_DIR/tests/queue_concurrency_test.sh" || status=1
fi

exit $status
