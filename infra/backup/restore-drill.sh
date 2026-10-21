#!/usr/bin/env bash
# Restore drill: restores a backup into a scratch database next to the live one and compares row counts.
# Run monthly and before launch. Never touches the live database.
#   infra/backup/restore-drill.sh /var/backups/ejadah/ejadah-daily-....dump
set -euo pipefail
export MSYS_NO_PATHCONV=1
PG_CONTAINER=${PG_CONTAINER:-ejadah-prod-postgres-1}
FILE=${1:?usage: restore-drill.sh <backup.dump>}
SCRATCH=ejadah_restore_drill
PSQL=(docker exec "$PG_CONTAINER" psql -U ejadah -v ON_ERROR_STOP=1 -tA)

"${PSQL[@]}" -d postgres -c "drop database if exists $SCRATCH" -c "create database $SCRATCH"
"${PSQL[@]}" -d "$SCRATCH" -c "create extension if not exists vector" -c "create extension if not exists pg_trgm" >/dev/null
start=$(date +%s)
docker exec -i "$PG_CONTAINER" pg_restore -U ejadah -d "$SCRATCH" --no-owner --jobs 1 < "$FILE"
echo "restored in $(( $(date +%s) - start )) s"

# compare every table that is in the backup
TABLES=$(docker exec -i "$PG_CONTAINER" pg_restore --list < "$FILE" | awk '$4=="TABLE" && $5!="DATA" {print $5"."$6}' | sort -u)
fail=0
for t in $TABLES; do
  live=$("${PSQL[@]}" -d ejadah_ai -c "select count(*) from $t")
  back=$("${PSQL[@]}" -d "$SCRATCH" -c "select count(*) from $t")
  mark=ok; [[ "$live" == "$back" ]] || { mark="DIFFERS"; fail=1; }
  printf "%-34s live=%-9s restored=%-9s %s\n" "$t" "$live" "$back" "$mark"
done
"${PSQL[@]}" -d postgres -c "drop database $SCRATCH" >/dev/null
[[ $fail == 0 ]] && echo "restore drill passed" || { echo "restore drill: counts differ (rows written after the backup are expected to differ)"; exit 1; }
