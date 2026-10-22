#!/bin/sh
# Runs inside the backup container: once a day, dumps the database and packs the uploaded photos and
# documents into ./deploy/backups on the server, and deletes copies older than BACKUP_KEEP_DAYS.
# Copy that folder off the server regularly (see docs/LAUNCH.md).
set -u
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"

run() {
  stamp=$(date -u +%Y-%m-%d_%H%M)
  pg_dump -Fc -f "/backups/db-$stamp.dump.part" &&
    mv "/backups/db-$stamp.dump.part" "/backups/db-$stamp.dump" &&
    tar -czf "/backups/uploads-$stamp.tar.gz.part" -C /uploads . &&
    mv "/backups/uploads-$stamp.tar.gz.part" "/backups/uploads-$stamp.tar.gz" &&
    find /backups -name 'db-*.dump' -mtime +"$KEEP_DAYS" -delete &&
    find /backups -name 'uploads-*.tar.gz' -mtime +"$KEEP_DAYS" -delete &&
    date -u +%FT%TZ > /backups/last-success
}

while true; do
  if run; then
    echo "backup ok $(cat /backups/last-success)"
    sleep 86400
  else
    echo "backup FAILED, retrying in 1 hour" >&2
    rm -f /backups/*.part
    sleep 3600
  fi
done
