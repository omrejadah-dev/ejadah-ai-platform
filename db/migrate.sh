#!/usr/bin/env bash
# db/migrate.sh — apply database schema changes (see db/README.md).
#
#   db/migrate.sh                    apply every db/migrations/*.sql not yet applied (in name order, one transaction
#                                    each), then re-apply every db/functions/*.sql (repeatable definitions)
#   db/migrate.sh --dev              same, then db/seed/dev.sql (test accounts; never in production)
#   db/migrate.sh --status           list migrations and whether each is applied
#   db/migrate.sh --baseline [NNN]   ONE TIME, on a database built before this runner existed: record every migration
#                                    file (or those numbered <= NNN) as applied without running it
#
# Target: the Docker container $PG_CONTAINER (default ejadah-ai-postgres), user $PGUSER (ejadah), database
# $PGDATABASE (ejadah_ai); or, when DATABASE_URL is set, plain `psql "$DATABASE_URL"` on this machine.
# A fresh database = db/migrate.sh, then db/reload/run.sh (the data).
#
# Applied migrations are recorded in ops.schema_migrations with a checksum. Never edit an applied migration: the run
# refuses if one changed. Put the change in a new numbered file (or, for functions, edit db/functions/).
set -euo pipefail
export MSYS_NO_PATHCONV=1                       # Git Bash: keep /dev/stdin etc. as they are
cd "$(dirname "$0")"                            # db/

PG_CONTAINER=${PG_CONTAINER:-ejadah-ai-postgres}
PGUSER=${PGUSER:-ejadah}
PGDATABASE=${PGDATABASE:-ejadah_ai}
if [[ -n "${DATABASE_URL:-}" ]]; then
  PSQL=(psql "$DATABASE_URL")
else
  PSQL=(docker exec -i "$PG_CONTAINER" psql -U "$PGUSER" -d "$PGDATABASE")
fi
PSQL+=(-X -q -v ON_ERROR_STOP=1)

MODE=apply; DEV=0; UPTO=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dev) DEV=1 ;;
    --status) MODE=status ;;
    --baseline) MODE=baseline; if [[ "${2:-}" =~ ^[0-9]+$ ]]; then UPTO=$2; shift; fi ;;
    -h|--help) sed -n '2,17p' "$0"; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done

# sha256 of the file with CR removed, so a CRLF checkout (git autocrlf) does not count as a change
checksum() { tr -d '\r' < "$1" | sha256sum | cut -d' ' -f1; }
sql() { "${PSQL[@]}" -tA -c "$1"; }

"${PSQL[@]}" <<'SQL'
SET client_min_messages = warning;
CREATE SCHEMA IF NOT EXISTS ops;
CREATE TABLE IF NOT EXISTS ops.schema_migrations (
  filename   text PRIMARY KEY,
  checksum   text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);
SQL

mapfile -t FILES < <(cd migrations && ls -1 -- *.sql | LC_ALL=C sort)
declare -A APPLIED=()
while IFS='|' read -r f c; do [[ -n "$f" ]] && APPLIED[$f]=$c; done < <(sql "SELECT filename, checksum FROM ops.schema_migrations")

case $MODE in
  status)
    for f in "${FILES[@]}"; do
      if [[ -z "${APPLIED[$f]:-}" ]]; then echo "pending   $f"
      elif [[ "${APPLIED[$f]}" != "$(checksum "migrations/$f")" ]]; then echo "CHANGED   $f"
      else echo "applied   $f"; fi
    done
    for f in "${!APPLIED[@]}"; do [[ -f "migrations/$f" ]] || echo "MISSING   $f (recorded as applied, file is gone)"; done
    exit 0 ;;
  baseline)
    if [[ ${#APPLIED[@]} -gt 0 ]]; then
      echo "refusing --baseline: ops.schema_migrations already has ${#APPLIED[@]} rows (baseline is a one-time step)" >&2; exit 1
    fi
    n=0
    for f in "${FILES[@]}"; do
      if [[ -n "$UPTO" && $((10#${f%%_*})) -gt $((10#$UPTO)) ]]; then continue; fi
      sql "INSERT INTO ops.schema_migrations (filename, checksum) VALUES ('$f', '$(checksum "migrations/$f")')" >/dev/null
      echo "baseline  $f"; n=$((n + 1))
    done
    echo "recorded $n migrations as applied (nothing was run). Next: db/migrate.sh"
    exit 0 ;;
esac

# refuse to continue when an applied migration was edited
bad=0
for f in "${FILES[@]}"; do
  if [[ -n "${APPLIED[$f]:-}" && "${APPLIED[$f]}" != "$(checksum "migrations/$f")" ]]; then
    echo "ERROR: db/migrations/$f was changed after it was applied to this database." >&2
    echo "       recorded sha256 ${APPLIED[$f]}" >&2
    echo "       file     sha256 $(checksum "migrations/$f")" >&2
    bad=1
  fi
done
if [[ $bad -eq 1 ]]; then
  echo "Applied migrations must never be edited. Restore the file (git diff db/migrations) and put the change in a new" >&2
  echo "migration db/migrations/NNN_name.sql (functions: edit db/functions/ instead, those are re-applied every run)." >&2
  exit 1
fi

n=0
for f in "${FILES[@]}"; do
  [[ -n "${APPLIED[$f]:-}" ]] && continue
  echo "applying  $f"
  # the file and its bookkeeping row commit together or not at all
  { cat "migrations/$f"; printf '\n;\nINSERT INTO ops.schema_migrations (filename, checksum) VALUES (%s, %s);\n' \
      "'$f'" "'$(checksum "migrations/$f")'"; } | "${PSQL[@]}" --single-transaction -f - >/dev/null
  n=$((n + 1))
done
echo "migrations: $n applied, $(( ${#FILES[@]} - n )) already up to date"

if compgen -G "functions/*.sql" > /dev/null; then
  mapfile -t FUNCS < <(cd functions && ls -1 -- *.sql | LC_ALL=C sort)
  for f in "${FUNCS[@]}"; do cat "functions/$f"; echo; done | "${PSQL[@]}" --single-transaction -f - >/dev/null
  echo "functions: re-applied ${FUNCS[*]}"
fi

if [[ $DEV -eq 1 ]]; then
  "${PSQL[@]}" --single-transaction -f - < seed/dev.sql >/dev/null
  echo "seed: db/seed/dev.sql applied (test accounts)"
fi
