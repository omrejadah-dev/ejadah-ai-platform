#!/usr/bin/env bash
# db/tests/run.sh — the pricing engine's tests, on a throwaway database built from the migrations (never real data).
#   bash db/tests/run.sh            local: (re)creates the database ejadah_test in the Docker container ejadah-ai-postgres
#   DATABASE_URL=... bash db/tests/run.sh   CI: an empty database it may fill (a service container)
# Steps: migrations + functions (db/migrate.sh) -> synthetic deals (pricing_fixtures.sql) -> materialised views
# (db/reload/refresh.sql) -> the checks (pricing_engine.sql). Exits non-zero on the first failed check.
set -euo pipefail
export MSYS_NO_PATHCONV=1
cd "$(dirname "$0")/../.."                       # repo root

if [[ -n "${DATABASE_URL:-}" ]]; then
  PSQL=(psql "$DATABASE_URL")
else
  export PG_CONTAINER=${PG_CONTAINER:-ejadah-ai-postgres} PGUSER=${PGUSER:-ejadah} PGDATABASE=ejadah_test
  docker exec -i "$PG_CONTAINER" psql -U "$PGUSER" -d postgres -X -q -v ON_ERROR_STOP=1 \
    -c "DROP DATABASE IF EXISTS ejadah_test WITH (FORCE)" -c "CREATE DATABASE ejadah_test"
  PSQL=(docker exec -i "$PG_CONTAINER" psql -U "$PGUSER" -d ejadah_test)
fi
PSQL+=(-X -q -v ON_ERROR_STOP=1)

bash db/migrate.sh > /dev/null
"${PSQL[@]}" < db/tests/pricing_fixtures.sql
"${PSQL[@]}" < db/reload/refresh.sql > /dev/null
"${PSQL[@]}" < db/tests/pricing_engine.sql 2>&1 | sed 's/^psql:[^ ]* NOTICE:  //; s/^NOTICE:  //'
echo "pricing engine: all checks passed"
