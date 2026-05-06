#!/bin/bash
set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────
CTID=100
CT_ROOT="/var/lib/lxc/${CTID}/rootfs"
HEALTH_URL="http://10.101.16.86:3000/api/health"
HEALTH_TIMEOUT=10
DISK_THRESHOLD=80

LOGFILE="/var/log/epl-magazines-watcher.log"
HEALTH_FLAG="/tmp/epl-magazines-health-alert.flag"
DISK_FLAG="/tmp/epl-magazines-disk-alert.flag"
MAINTENANCE_FLAG="/tmp/pve-maintenance.flag"

MAIL_TO="itdepartment@edisonpubliclibrary.org"
MAIL_FROM="proxmox-alerts@edisonpubliclibrary.org"

# ── Helpers ───────────────────────────────────────────────────────────
log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $1" >> "$LOGFILE"; }

send_email() {
  local subject="$1"
  local body="$2"
  echo -e "$body" | mail -s "[Proxmox Alert] $subject" -r "$MAIL_FROM" "$MAIL_TO"
}

# check_condition <name> <pass:true|false> <flag_file> <detail>
check_condition() {
  local name="$1"
  local passed="$2"
  local flag="$3"
  local detail="$4"

  if [ "$passed" = "false" ]; then
    log "FAIL: ${name} — ${detail}"
    if [ ! -f "$flag" ]; then
      touch "$flag"
      if [ ! -f "$MAINTENANCE_FLAG" ]; then
        send_email \
          "[EPL-MAGAZINES] ALERT: ${name}" \
          "EPL Magazine Tracker — ${name}\nTime: $(date '+%Y-%m-%d %H:%M:%S')\nHost: $(hostname)\nDetail: ${detail}\n\nCheck log: ${LOGFILE}"
        log "Alert email sent for ${name}"
      else
        log "Maintenance mode — alert suppressed for ${name}"
      fi
    fi
  else
    if [ -f "$flag" ]; then
      rm -f "$flag"
      if [ ! -f "$MAINTENANCE_FLAG" ]; then
        send_email \
          "[EPL-MAGAZINES] RECOVERED: ${name}" \
          "EPL Magazine Tracker — ${name} recovered\nTime: $(date '+%Y-%m-%d %H:%M:%S')\nHost: $(hostname)\nDetail: ${detail}"
        log "Recovery email sent for ${name}"
      else
        log "Maintenance mode — recovery suppressed for ${name}"
      fi
    fi
  fi
}

# ── Health Check ──────────────────────────────────────────────────────
HEALTH_PASS="true"
HEALTH_DETAIL="healthy"

HTTP_RESPONSE=$(curl -sf --max-time "$HEALTH_TIMEOUT" "$HEALTH_URL" 2>&1) || {
  HEALTH_PASS="false"
  HEALTH_DETAIL="Health endpoint unreachable or returned error"
}

# If curl succeeded, verify the JSON status
if [ "$HEALTH_PASS" = "true" ]; then
  STATUS=$(echo "$HTTP_RESPONSE" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
  if [ "$STATUS" != "healthy" ]; then
    HEALTH_PASS="false"
    HEALTH_DETAIL="Health endpoint returned: ${HTTP_RESPONSE}"
  fi
fi

check_condition "Health check failed" "$HEALTH_PASS" "$HEALTH_FLAG" "$HEALTH_DETAIL"

# ── Disk Check (read from CT rootfs on PVE host) ─────────────────────
DISK_PASS="true"
DISK_DETAIL="ok"

# Check disk usage of the CT's root filesystem via the host mount
if [ -d "$CT_ROOT" ]; then
  DISK_USAGE=$(df --output=pcent "$CT_ROOT" 2>/dev/null | tail -1 | tr -d ' %') || {
    DISK_PASS="false"
    DISK_DETAIL="Could not read disk usage for CT ${CTID} rootfs"
  }

  if [ "$DISK_PASS" = "true" ] && [ "$DISK_USAGE" -ge "$DISK_THRESHOLD" ]; then
    DISK_PASS="false"
    DISK_DETAIL="Disk usage at ${DISK_USAGE}% (threshold: ${DISK_THRESHOLD}%)"
  fi

  if [ "$DISK_PASS" = "true" ]; then
    DISK_DETAIL="Disk usage at ${DISK_USAGE}%"
  fi
else
  DISK_PASS="false"
  DISK_DETAIL="CT ${CTID} rootfs not found at ${CT_ROOT} — container may be stopped"
fi

check_condition "Disk usage high on CT ${CTID}" "$DISK_PASS" "$DISK_FLAG" "$DISK_DETAIL"

log "Check complete — health:${HEALTH_PASS} disk:${DISK_PASS}"
