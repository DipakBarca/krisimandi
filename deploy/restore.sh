#!/bin/sh
# Restores a backup made by backup.sh. Run from the repository root on the server, naming files in
# deploy/backups:
#   sh deploy/restore.sh db-2026-11-01_0300.dump [uploads-2026-11-01_0300.tar.gz]
# It replaces the current data, so the API is stopped while it runs.
set -eu
DB_DUMP="$(basename "$1")"
UPLOADS="$(basename "${2:-}")"
COMPOSE="${COMPOSE:-docker compose -f deploy/compose.yml --env-file deploy/.env}"

$COMPOSE stop api
# The backup container sees deploy/backups as /backups. PostGIS and its schemas are left in place; everything else is replaced.
$COMPOSE exec -T backup sh -c "
  pg_restore -l '/backups/$DB_DUMP' | grep -vE ' EXTENSION | SCHEMA - (tiger|tiger_data|topology) ' > /tmp/restore.list &&
  pg_restore --clean --if-exists --no-owner -L /tmp/restore.list -d krisimandi '/backups/$DB_DUMP'"
if [ -n "$UPLOADS" ]; then
  $COMPOSE run --rm --no-deps -v "$(pwd)/deploy/backups/$UPLOADS:/restore.tar.gz:ro" --entrypoint sh api \
    -c 'rm -rf /data/uploads/* && tar -xzf /restore.tar.gz -C /data/uploads'
fi
$COMPOSE start api
echo "Restored $DB_DUMP${UPLOADS:+ and $UPLOADS}"
