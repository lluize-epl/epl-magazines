#!/bin/bash
set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────
CTID=100
APP_DIR="/home/epltech/epl-magazines"
DB_PATH="${APP_DIR}/prisma/dev.db"
LOG_PATH="${APP_DIR}/logs/audit.log"
TMP_BACKUP="/tmp/epl-dev.db"

NAS_MOUNT="/mnt/pve/nas-backup"
BACKUP_BASE="${NAS_MOUNT}/epl-magazines/daily"
TODAY=$(date +%Y-%m-%d)
BACKUP_DIR="${BACKUP_BASE}/${TODAY}"

LOGFILE="/var/log/epl-magazines-backup.log"
RETENTION_DAYS=14

MAIL_TO="itdepartment@edisonpubliclibrary.org"
MAIL_FROM="proxmox-alerts@edisonpubliclibrary.org"
MIN_DB_SIZE=8192  # At least one SQLite page

# ── Helpers ───────────────────────────────────────────────────────────
log() { echo "$(date -Iseconds) $1" >> "$LOGFILE"; }

cleanup() {
  pct exec "$CTID" -- rm -f "$TMP_BACKUP" 2>/dev/null || true
}
trap cleanup EXIT

send_failure_email() {
  local subject="[EPL-MAGAZINES] BACKUP FAILED: ${1}"
  sendmail -t <<EOF
From: ${MAIL_FROM}
To: ${MAIL_TO}
Subject: ${subject}

EPL Magazine Tracker — Backup Failure
Time: $(date -Iseconds)
Error: ${1}

Check log: ${LOGFILE}
EOF
}

fail() {
  log "FAIL: $1"
  send_failure_email "$1"
  exit 1
}

# ── Preflight ─────────────────────────────────────────────────────────
mountpoint -q "$NAS_MOUNT" || fail "QNAP NAS not mounted at ${NAS_MOUNT}"
pct exec "$CTID" -- which sqlite3 >/dev/null 2>&1 || fail "sqlite3 not installed on CT ${CTID}"

# ── Backup ────────────────────────────────────────────────────────────
log "Starting daily backup"

mkdir -p "$BACKUP_DIR"

# 1. SQLite safe online backup inside CT 100
pct exec "$CTID" -- sqlite3 "$DB_PATH" ".backup ${TMP_BACKUP}" \
  || fail "sqlite3 .backup failed inside CT ${CTID}"

# 2. Pull backup to QNAP
pct pull "$CTID" "$TMP_BACKUP" "${BACKUP_DIR}/dev.db" \
  || fail "pct pull dev.db failed"

# 3. Integrity check
INTEGRITY=$(sqlite3 "${BACKUP_DIR}/dev.db" "PRAGMA integrity_check;" 2>&1)
if [ "$INTEGRITY" != "ok" ]; then
  fail "Integrity check failed: ${INTEGRITY}"
fi

# 4. File size check
FILE_SIZE=$(stat -c%s "${BACKUP_DIR}/dev.db")
if [ "$FILE_SIZE" -lt "$MIN_DB_SIZE" ]; then
  fail "Backup file suspiciously small: ${FILE_SIZE} bytes (minimum: ${MIN_DB_SIZE})"
fi

# 5. Pull audit log
pct pull "$CTID" "$LOG_PATH" "${BACKUP_DIR}/audit.log" \
  || fail "pct pull audit.log failed"

# 6. Cleanup temp file (also handled by trap)
cleanup

# ── Retention ─────────────────────────────────────────────────────────
find "$BACKUP_BASE" -maxdepth 1 -type d -name '20*' -mtime +${RETENTION_DAYS} -exec rm -rf {} + 2>/dev/null || true

log "Backup complete: ${BACKUP_DIR} (db: ${FILE_SIZE} bytes)"
