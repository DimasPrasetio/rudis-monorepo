#!/usr/bin/env bash
# rudis-backup — nightly dump of every app database on this server, rotated.
#
# Installed ONCE PER SERVER, not per app (references/docker-deployment.md › Backups):
#   /opt/rudis/backup.sh               this file
#   /etc/systemd/system/rudis-backup.{service,timer}
#   /etc/rudis/backup.env              settings, chmod 600 (backup.env.example; override: BACKUP_ENV)
# Every database whose name ends in _db (one per app: <slug>_db) is included, so a new app is
# backed up from its first night without touching this script. So is each app's data folder
# (APPS_ROOT/<slug>/data — uploads and other files), as rsync snapshots: unchanged files are
# hard links to the previous snapshot, so a day costs only what changed.
#
# Per database it keeps 5 daily, 2 weekly (Sunday), and 1 monthly (the 1st) dump — 8 files at
# most. Weekly and monthly ones are hard links to a daily file: they take no extra space.
# It refuses to write when the disk is low, checks every dump, test-restores the newest one on
# the 1st of each month, and reports failures (and a weekly "all fine") to Telegram.
set -uo pipefail
umask 077

BACKUP_ENV="${BACKUP_ENV:-/etc/rudis/backup.env}"
[ -f "$BACKUP_ENV" ] && . "$BACKUP_ENV"
ROOT="${BACKUP_ROOT:-/var/backups/rudis}"
KEEP_DAILY="${KEEP_DAILY:-5}"
KEEP_WEEKLY="${KEEP_WEEKLY:-2}"
KEEP_MONTHLY="${KEEP_MONTHLY:-1}"
MIN_FREE_PCT="${MIN_FREE_PCT:-15}"
DB_PATTERN="${DB_PATTERN:-_db$}"
# Where the apps live (the deploy user's home: ~/<slug>/data). Unset: data folders are skipped.
APPS_ROOT="${APPS_ROOT:-}"
# MySQL's root through auth_socket: the unit runs as root.
MYSQL="${MYSQL:-mysql}"
MYSQLDUMP="${MYSQLDUMP:-mysqldump}"

notify() {
  echo "$1"
  if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ]; then
    curl -s -m 15 -o /dev/null "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      -d chat_id="${TELEGRAM_CHAT_ID}" --data-urlencode text="[$(hostname)] $1" || echo "  (Telegram unreachable)"
  fi
}

# Newest first by name, which carries the date: modification times are not reliable here —
# rsync gives every snapshot folder the source folder's time, and hard links share theirs.

# prune <dir> <keep>: drop all but the newest <keep> dumps in dir.
prune() {
  ls -1 "$1"/*.sql.gz 2>/dev/null | sort -r | tail -n +$(( $2 + 1 )) | xargs -r rm -f
}

# prune_dirs <dir> <keep>: drop all but the newest <keep> snapshot folders in dir.
prune_dirs() {
  ls -1d "$1"/*/ 2>/dev/null | sort -r | tail -n +$(( $2 + 1 )) | xargs -r rm -rf
}

# snapshot_files <slug> <dir>: today's snapshot of APPS_ROOT/<slug>/data under dir/files.
snapshot_files() {
  local src="$APPS_ROOT/$1/data" dest="$2/files" prev today_dir
  [ -d "$src" ] || return 0
  mkdir -p "$dest/daily" "$dest/weekly" "$dest/monthly"
  today_dir="$dest/daily/$today"
  prev="$(ls -1d "$dest/daily"/*/ 2>/dev/null | sort -r | head -1)"
  rm -rf "$today_dir.tmp"
  if ! rsync -a --delete ${prev:+--link-dest="$prev"} "$src/" "$today_dir.tmp/"; then
    rm -rf "$today_dir.tmp"
    return 1
  fi
  rm -rf "$today_dir"
  mv "$today_dir.tmp" "$today_dir"
  [ "$dow" = 7 ] && rm -rf "$dest/weekly/$today" && cp -al "$today_dir" "$dest/weekly/$today"
  [ "$dom" = 01 ] && rm -rf "$dest/monthly/$today" && cp -al "$today_dir" "$dest/monthly/$today"
  prune_dirs "$dest/daily" "$KEEP_DAILY"
  prune_dirs "$dest/weekly" "$KEEP_WEEKLY"
  prune_dirs "$dest/monthly" "$KEEP_MONTHLY"
}

# restore_test <db> <dump>: load the dump into a scratch database and compare table counts.
restore_test() {
  local db="$1" dump="$2" scratch="${1}_restoretest" want got
  $MYSQL -e "DROP DATABASE IF EXISTS \`$scratch\`; CREATE DATABASE \`$scratch\`" || return 1
  if ! gunzip -c "$dump" | $MYSQL "$scratch"; then
    $MYSQL -e "DROP DATABASE IF EXISTS \`$scratch\`"
    return 1
  fi
  want="$($MYSQL -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$db'")"
  got="$($MYSQL -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$scratch'")"
  $MYSQL -e "DROP DATABASE IF EXISTS \`$scratch\`"
  [ "$want" = "$got" ]
}

mkdir -p "$ROOT"
if [ -n "$APPS_ROOT" ] && ! command -v rsync >/dev/null; then
  notify "Backup berkas dilewati: rsync tidak terpasang (sudo apt install rsync)."
  APPS_ROOT=""
fi
free=$(( 100 - $(df -P "$ROOT" | awk 'NR==2 { sub("%", "", $5); print $5 }') ))
if [ "$free" -lt "$MIN_FREE_PCT" ]; then
  notify "Backup DIBATALKAN: disk tinggal ${free}% (batas ${MIN_FREE_PCT}%). Kosongkan disk — MySQL berhenti jika disk penuh."
  exit 1
fi

today="$(date +%F)"
dow="$(date +%u)"
dom="$(date +%d)"
failed=()
count=0
for db in $($MYSQL -N -e 'SHOW DATABASES' | grep -E "$DB_PATTERN"); do
  dir="$ROOT/$db"
  mkdir -p "$dir/daily" "$dir/weekly" "$dir/monthly"
  f="$dir/daily/$db-$today.sql.gz"
  if $MYSQLDUMP --single-transaction --routines --triggers --events --hex-blob \
      --default-character-set=utf8mb4 --set-gtid-purged=OFF --no-tablespaces "$db" | gzip -9 > "$f.tmp" \
    && gzip -t "$f.tmp" && [ "$(stat -c %s "$f.tmp")" -gt 100 ]; then
    mv -f "$f.tmp" "$f"
  else
    rm -f "$f.tmp"
    failed+=("$db")
    continue
  fi
  [ "$dow" = 7 ] && ln -f "$f" "$dir/weekly/"
  [ "$dom" = 01 ] && ln -f "$f" "$dir/monthly/"
  prune "$dir/daily" "$KEEP_DAILY"
  prune "$dir/weekly" "$KEEP_WEEKLY"
  prune "$dir/monthly" "$KEEP_MONTHLY"
  if [ "$dom" = 01 ] && ! restore_test "$db" "$f"; then
    failed+=("$db (uji restore)")
  fi
  if [ -n "$APPS_ROOT" ] && ! snapshot_files "${db%_db}" "$dir"; then
    failed+=("$db (berkas)")
  fi
  count=$(( count + 1 ))
done

if [ "${#failed[@]}" -gt 0 ]; then
  notify "Backup GAGAL untuk: ${failed[*]}. Periksa: journalctl -u rudis-backup"
  exit 1
fi
if [ "$dow" = 7 ]; then
  notify "Backup mingguan OK: ${count} database, disk ${free}% kosong."
fi
echo "ok: ${count} database(s), ${free}% disk free"
