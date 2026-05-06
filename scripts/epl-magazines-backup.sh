#!/bin/bash
set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────
CTID=100
APP_PATH_IN_CT="/home/epltech/epl-magazines"
DB_PATH_IN_CT="${APP_PATH_IN_CT}/prisma/dev.db"
LOG_DIR_IN_CT="${APP_PATH_IN_CT}/logs"
LOG_PATH_IN_CT="${LOG_DIR_IN_CT}/audit.log"

# Host-side paths (used only when CT is stopped and we mount it)
CT_ROOT="/var/lib/lxc/${CTID}/rootfs"
DB_PATH_HOST="${CT_ROOT}${DB_PATH_IN_CT}"
LOG_PATH_HOST="${CT_ROOT}${LOG_PATH_IN_CT}"

NAS_MOUNT="/mnt/pve/nas-backup"
BACKUP_BASE="${NAS_MOUNT}/epl-magazines/daily"
TODAY=$(date +%Y-%m-%d)
BACKUP_DIR="${BACKUP_BASE}/${TODAY}"

LOGFILE="/var/log/epl-magazines-backup.log"
RETENTION_DAYS=14

MAIL_TO="itdepartment@edisonpubliclibrary.org"
MAIL_FROM="proxmox-alerts@edisonpubliclibrary.org"
MIN_DB_SIZE=8192   # at least one SQLite page

MOUNTED_BY_US=false
CT_STATUS=""

# ── Helpers ───────────────────────────────────────────────────────────
log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $1" | tee -a "$LOGFILE"; }

human_size() { numfmt --to=iec --suffix=B "$1" 2>/dev/null || echo "$1 bytes"; }

# Listing of a path inside CT (works for running or mounted-stopped CT)
diag_ls() {
  local label="$1" path="$2"
  log "  diag: $label  ($path)"
  if [ "$CT_STATUS" = "running" ]; then
    pct exec "$CTID" -- ls -la "$path" 2>&1 | sed 's/^/    /' | tee -a "$LOGFILE" || true
  else
    ls -la "${CT_ROOT}${path}" 2>&1 | sed 's/^/    /' | tee -a "$LOGFILE" || true
  fi
}

cleanup() {
  if [ "$MOUNTED_BY_US" = "true" ]; then
    log "Unmounting CT ${CTID}..."
    /usr/sbin/pct unmount "$CTID" 2>> "$LOGFILE" || log "Notice: CT ${CTID} unmount may have failed."
  fi
}
trap cleanup EXIT

send_failure_email() {
  local subject="[EPL-MAGAZINES] BACKUP FAILED: ${1}"
  echo -e "EPL Magazine Tracker — Backup Failure\nTime: $(date '+%Y-%m-%d %H:%M:%S')\nHost: $(hostname)\nError: ${1}\n\nCheck log: ${LOGFILE}" \
    | mail -s "[Proxmox Alert] $subject" -r "$MAIL_FROM" "$MAIL_TO"
}

fail() {
  log "✗ $1"
  send_failure_email "$1"
  exit 1
}

# ── Preflight ─────────────────────────────────────────────────────────
log "──────────────── Starting daily backup ────────────────"
log "Date:          ${TODAY}"
log "CT ID:         ${CTID}"
log "DB in CT:      ${DB_PATH_IN_CT}"
log "Log in CT:     ${LOG_PATH_IN_CT}"
log "NAS mount:     ${NAS_MOUNT}"
log "Backup dest:   ${BACKUP_DIR}"

mountpoint -q "$NAS_MOUNT" || fail "QNAP NAS not mounted at ${NAS_MOUNT}"
log "✓ NAS mount confirmed at ${NAS_MOUNT}"

CT_STATUS=$(pct status "$CTID" 2>/dev/null | awk '{print $2}' || true)
[ -n "$CT_STATUS" ] || fail "Could not determine CT ${CTID} status"
log "CT ${CTID} status: ${CT_STATUS}"

mkdir -p "$BACKUP_DIR"
log "✓ Backup dir ready: ${BACKUP_DIR}"

# ── Pull files (CT-state aware) ──────────────────────────────────────
if [ "$CT_STATUS" = "running" ]; then
  log "Mode: pct pull (CT is running)"

  # 1. DB
  log "[1/4] Pulling DB:    ${DB_PATH_IN_CT}  →  ${BACKUP_DIR}/dev.db"
  pct pull "$CTID" "$DB_PATH_IN_CT" "${BACKUP_DIR}/dev.db" 2>>"$LOGFILE" \
    || { diag_ls "DB parent dir" "$(dirname "$DB_PATH_IN_CT")"; fail "pct pull dev.db failed"; }
  DB_BYTES=$(stat -c%s "${BACKUP_DIR}/dev.db")
  log "  ✓ dev.db pulled ($(human_size "$DB_BYTES"))"

  for ext in wal shm; do
    if pct exec "$CTID" -- test -f "${DB_PATH_IN_CT}-${ext}" 2>/dev/null; then
      if pct pull "$CTID" "${DB_PATH_IN_CT}-${ext}" "${BACKUP_DIR}/dev.db-${ext}" 2>>"$LOGFILE"; then
        log "  ✓ dev.db-${ext} pulled"
      else
        log "  Notice: dev.db-${ext} present but pull failed"
      fi
    fi
  done

  # 2. Audit log — HARD FAIL if missing
  log "[2/4] Pulling audit: ${LOG_PATH_IN_CT}  →  ${BACKUP_DIR}/audit.log"
  if ! pct exec "$CTID" -- test -f "$LOG_PATH_IN_CT" 2>/dev/null; then
    diag_ls "logs dir" "$LOG_DIR_IN_CT"
    fail "audit.log not found at ${LOG_PATH_IN_CT} inside CT ${CTID}"
  fi
  pct pull "$CTID" "$LOG_PATH_IN_CT" "${BACKUP_DIR}/audit.log" 2>>"$LOGFILE" \
    || { diag_ls "logs dir" "$LOG_DIR_IN_CT"; fail "pct pull audit.log failed"; }
  LOG_BYTES=$(stat -c%s "${BACKUP_DIR}/audit.log")
  log "  ✓ audit.log pulled ($(human_size "$LOG_BYTES"))"

elif [ "$CT_STATUS" = "stopped" ]; then
  log "Mode: pct mount + cp (CT is stopped)"
  log "Mounting CT ${CTID}..."
  /usr/sbin/pct mount "$CTID" 2>> "$LOGFILE" || fail "pct mount ${CTID} failed"
  MOUNTED_BY_US=true

  # 1. DB
  [ -f "$DB_PATH_HOST" ] || { diag_ls "DB parent dir" "$(dirname "$DB_PATH_IN_CT")"; fail "DB not found at ${DB_PATH_HOST}"; }
  log "[1/4] Copy DB:       ${DB_PATH_HOST}  →  ${BACKUP_DIR}/dev.db"
  cp "$DB_PATH_HOST" "${BACKUP_DIR}/dev.db" || fail "cp dev.db failed"
  DB_BYTES=$(stat -c%s "${BACKUP_DIR}/dev.db")
  log "  ✓ dev.db copied ($(human_size "$DB_BYTES"))"

  for ext in wal shm; do
    if [ -f "${DB_PATH_HOST}-${ext}" ]; then
      if cp "${DB_PATH_HOST}-${ext}" "${BACKUP_DIR}/dev.db-${ext}"; then
        log "  ✓ dev.db-${ext} copied"
      else
        log "  Notice: dev.db-${ext} present but copy failed"
      fi
    fi
  done

  # 2. Audit log — HARD FAIL if missing
  log "[2/4] Copy audit:    ${LOG_PATH_HOST}  →  ${BACKUP_DIR}/audit.log"
  if [ ! -f "$LOG_PATH_HOST" ]; then
    diag_ls "logs dir" "$LOG_DIR_IN_CT"
    fail "audit.log missing at ${LOG_PATH_HOST}"
  fi
  cp "$LOG_PATH_HOST" "${BACKUP_DIR}/audit.log" || fail "cp audit.log failed"
  LOG_BYTES=$(stat -c%s "${BACKUP_DIR}/audit.log")
  log "  ✓ audit.log copied ($(human_size "$LOG_BYTES"))"

else
  fail "CT ${CTID} in unexpected state: ${CT_STATUS}"
fi

# ── 3. Validate DB ───────────────────────────────────────────────────
log "[3/4] Validating DB integrity..."
INTEGRITY=$(sqlite3 "${BACKUP_DIR}/dev.db" "PRAGMA integrity_check;" 2>&1)
[ "$INTEGRITY" = "ok" ] || fail "DB integrity check failed: ${INTEGRITY}"
log "  ✓ integrity_check = ok"

[ "$DB_BYTES" -ge "$MIN_DB_SIZE" ] || fail "DB suspiciously small: ${DB_BYTES} bytes (min ${MIN_DB_SIZE})"
log "  ✓ DB size $(human_size "$DB_BYTES") ≥ min $(human_size "$MIN_DB_SIZE")"

# Checkpoint WAL into main DB and drop WAL/SHM from backup
sqlite3 "${BACKUP_DIR}/dev.db" "PRAGMA wal_checkpoint(TRUNCATE);" 2>/dev/null || true
rm -f "${BACKUP_DIR}/dev.db-wal" "${BACKUP_DIR}/dev.db-shm" 2>/dev/null || true

# ── 4. Post-copy verification ────────────────────────────────────────
log "[4/4] Verifying backup directory contents:"
ls -la "$BACKUP_DIR" 2>&1 | sed 's/^/    /' | tee -a "$LOGFILE"

[ -f "${BACKUP_DIR}/dev.db" ] || fail "Post-check: dev.db missing in ${BACKUP_DIR}"
[ -f "${BACKUP_DIR}/audit.log" ] || fail "Post-check: audit.log missing in ${BACKUP_DIR}"
log "  ✓ Required files present (dev.db, audit.log)"

# ── Retention ─────────────────────────────────────────────────────────
log "Pruning backups older than ${RETENTION_DAYS} days..."
PRUNED_LIST=$(find "$BACKUP_BASE" -maxdepth 1 -type d -name '20*' -mtime +"${RETENTION_DAYS}" 2>/dev/null || true)
if [ -n "$PRUNED_LIST" ]; then
  while IFS= read -r d; do
    log "  pruning: $d"
    rm -rf "$d"
  done <<< "$PRUNED_LIST"
else
  log "  no backups older than ${RETENTION_DAYS} days"
fi

# ── Summary ───────────────────────────────────────────────────────────
TOTAL_BYTES=$(du -sb "$BACKUP_DIR" 2>/dev/null | awk '{print $1}')
log "✓ Backup complete: ${BACKUP_DIR}"
log "  dev.db:    $(human_size "$DB_BYTES")"
log "  audit.log: $(human_size "$LOG_BYTES")"
log "  total:     $(human_size "$TOTAL_BYTES")"
log "──────────────── End of backup ────────────────"
