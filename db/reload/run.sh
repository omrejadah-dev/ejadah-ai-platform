#!/usr/bin/env bash
# db/reload/run.sh — load (or re-load) the data into a migrated database (see db/README.md).
#
#   db/reload/run.sh                 every step: raw transform geo legal refresh
#   db/reload/run.sh geo refresh     only the named steps, in the order given
#
#   raw        data/consolidated/all_deals.csv -> market.deals_raw                         (~20 s)
#   transform  cities, districts (upsert, ids kept), aliases, cleaned market.deals (swap)  (~4-6 min)
#   geo        data/geo/*.csv -> region/district shapes, district neighbours               (seconds)
#   legal      data/legal/*.csv -> laws, articles (upsert, ids kept), vectors               (seconds)
#   refresh    every materialised view, in dependency order (db/reload/refresh.sql)        (~1 min)
#
# Safe on a live database: market.deals and the geo/legal tables are swapped in one transaction each and materialised
# views refresh CONCURRENTLY, so the app never sees empty tables. Production loads the data once; this is not a schedule.
#
# Target: like db/migrate.sh ($PG_CONTAINER / $PGUSER / $PGDATABASE, or $DATABASE_URL). The CSVs are read by the
# database server itself (COPY), from $DATA_DIR as the server sees it: /data, the repo's data/ folder mounted read-only
# by infra/docker-compose*.yml.
set -euo pipefail
export MSYS_NO_PATHCONV=1
cd "$(dirname "$0")"                            # db/reload/

PG_CONTAINER=${PG_CONTAINER:-ejadah-ai-postgres}
PGUSER=${PGUSER:-ejadah}
PGDATABASE=${PGDATABASE:-ejadah_ai}
DATA_DIR=${DATA_DIR:-/data}
if [[ -n "${DATABASE_URL:-}" ]]; then
  PSQL=(psql "$DATABASE_URL")
else
  PSQL=(docker exec -i "$PG_CONTAINER" psql -U "$PGUSER" -d "$PGDATABASE")
fi
PSQL+=(-X -v ON_ERROR_STOP=1 -v datadir="$DATA_DIR")

declare -A FILE=([raw]=01_raw.sql [transform]=02_transform.sql [geo]=03_geo.sql [legal]=04_legal.sql [refresh]=refresh.sql)
STEPS=("$@"); [[ ${#STEPS[@]} -eq 0 ]] && STEPS=(raw transform geo legal refresh)
for s in "${STEPS[@]}"; do [[ -n "${FILE[$s]:-}" ]] || { echo "unknown step: $s (raw transform geo legal refresh)" >&2; exit 2; }; done

for s in "${STEPS[@]}"; do
  echo "== $s (${FILE[$s]})"
  start=$SECONDS
  "${PSQL[@]}" -f - < "${FILE[$s]}"
  echo "== $s done in $((SECONDS - start)) s"
done
