#!/usr/bin/env bash
# Database backup (docs/system-design.md section 6). Cron on the server, e.g.:
#   15 3 * * *  /opt/ejadah/infra/backup/backup.sh            # daily: identity, app, ops (small, the irreplaceable part)
#   45 3 * * 0  /opt/ejadah/infra/backup/backup.sh --full     # weekly: everything incl. the 4.6M deals (rebuildable, but faster to restore)
# Env: PG_CONTAINER (default ejadah-prod-postgres-1), BACKUP_DIR (default /var/backups/ejadah), KEEP_DAYS (14),
#      BACKUP_REMOTE optional rsync target for the Hetzner Storage Box, e.g. u12345@u12345.your-storagebox.de:ejadah/
set -euo pipefail
export MSYS_NO_PATHCONV=1
PG_CONTAINER=${PG_CONTAINER:-ejadah-prod-postgres-1}
BACKUP_DIR=${BACKUP_DIR:-/var/backups/ejadah}
KEEP_DAYS=${KEEP_DAYS:-14}
MODE=daily; [[ "${1:-}" == "--full" ]] && MODE=full
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
FILE="$BACKUP_DIR/ejadah-$MODE-$STAMP.dump"
mkdir -p "$BACKUP_DIR"

if [[ $MODE == full ]]; then
  SCHEMAS=()
else
  SCHEMAS=(-n identity -n app -n ops)
fi

# custom format: compressed, restorable table by table with pg_restore
docker exec "$PG_CONTAINER" pg_dump -U ejadah -d ejadah_ai -Fc -Z 6 "${SCHEMAS[@]}" > "$FILE.part"
mv "$FILE.part" "$FILE"
docker exec -i "$PG_CONTAINER" pg_restore --list < "$FILE" > /dev/null   # the file must be readable as an archive
echo "$(date -u +%FT%TZ) $MODE backup ok: $FILE ($(du -h "$FILE" | cut -f1))"

find "$BACKUP_DIR" -name "ejadah-*.dump" -mtime +"$KEEP_DAYS" -delete

if [[ -n "${BACKUP_REMOTE:-}" ]]; then
  rsync -a --delete -e "ssh -p 23" "$BACKUP_DIR/" "$BACKUP_REMOTE"
  echo "copied to $BACKUP_REMOTE"
fi
