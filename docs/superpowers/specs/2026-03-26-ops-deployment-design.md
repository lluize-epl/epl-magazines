# EPL Magazine Tracker — Ops Deployment Design

**Date:** 2026-03-26
**Status:** Approved

---

## Overview

Ops tooling for the EPL Magazine Tracker: local Docker build/test, daily SQLite backup to QNAP NAS, and a health/disk watcher script on the Proxmox host. All scripts follow the existing `pve-*.sh` patterns on the Proxmox infrastructure.

## Target Environment

- **Proxmox host:** `pve` at `10.101.16.71`
- **CT 100 (docker-server):** `10.101.16.67` — runs Docker Compose with the epl-magazines app
- **QNAP NAS:** `10.101.16.30`, mounted at `/mnt/pve/nas-backup` on the Proxmox host
- **App URL inside LAN:** `http://10.101.16.86:3000`
- **Project directory on CT 100:** `/home/epltech/epl-magazines/`
- **Email:** Postfix on Proxmox host → `smtp-relay.gmail.com:587` → `itdepartment@edisonpubliclibrary.org`

## Prerequisites

- `sqlite3` installed on CT 100: `pct exec 100 -- apt install -y sqlite3`

---

## Part 1: Local Docker Build & Test

Verify the image works locally before deploying to CT 100.

### Steps

1. `docker compose build` — build the multi-stage image
2. `docker compose up -d` — start the container
3. Wait ~10-15s for health check start period (Dockerfile `--start-period=10s`)
4. `curl http://localhost:3000/api/health` — expect `{"status":"healthy"}`
5. `docker inspect --format='{{.State.Health.Status}}' <container>` — expect `healthy`
6. Smoke test: hit `/login` in browser, confirm UI loads
7. `docker compose down` — clean up

### Dockerfile Verification

The standalone output bundles dependencies differently. During the build step, verify that the Prisma generated client at `app/generated` is correctly copied to the runner stage and the app starts without import errors.

---

## Part 2: `epl-magazines-backup.sh`

Daily lightweight backup of SQLite database and audit log to QNAP NAS.

### Location & Schedule

| Item | Value |
|------|-------|
| Script path | `/usr/local/bin/epl-magazines-backup.sh` |
| Cron schedule | `0 3 * * *` (daily at 3AM) |
| Log file | `/var/log/epl-magazines-backup.log` |
| Backup destination | `/mnt/pve/nas-backup/epl-magazines/daily/YYYY-MM-DD/` |
| Retention | 14 days |
| Email | On failure only |

### Script Conventions

All scripts use `set -euo pipefail` for strict error handling and a `trap` for cleanup on failure.
Scripts are owned by root and executable (`chmod 755`).

### Logic

1. Check QNAP mount is available (`/mnt/pve/nas-backup` is mounted)
2. Create today's backup directory on QNAP
3. Use SQLite's safe online backup via `pct exec 100`:
   ```bash
   pct exec 100 -- sqlite3 /home/epltech/epl-magazines/prisma/dev.db ".backup /tmp/epl-dev.db"
   ```
4. Pull the backup to the Proxmox host:
   ```bash
   pct pull 100 /tmp/epl-dev.db /mnt/pve/nas-backup/epl-magazines/daily/YYYY-MM-DD/dev.db
   ```
5. **Integrity check** — verify the backup is valid and not empty:
   ```bash
   sqlite3 /mnt/pve/nas-backup/epl-magazines/daily/YYYY-MM-DD/dev.db "PRAGMA integrity_check;"
   ```
   Also check file size is > 8192 bytes (at least one SQLite page) to catch silent empty-database failures.
6. Pull the audit log:
   ```bash
   pct pull 100 /home/epltech/epl-magazines/logs/audit.log /mnt/pve/nas-backup/epl-magazines/daily/YYYY-MM-DD/audit.log
   ```
7. Clean up temp file on CT 100: `pct exec 100 -- rm -f /tmp/epl-dev.db` (via trap on failure too)
8. Delete backup directories older than 14 days
9. Log result to `/var/log/epl-magazines-backup.log`
10. On failure: email `itdepartment@edisonpubliclibrary.org` with error details

### Design Decisions

- **SQLite `.backup` command** over file copy: uses SQLite's built-in WAL coordination for a consistent snapshot regardless of whether the app container is running or actively writing
- **Access via bind mount path** on CT 100 filesystem, not through Docker CLI: simpler, no dependency on Docker being healthy to perform the backup
- **Integrity check after pull**: catches corrupted or silently empty backups before they overwrite good ones in the retention window
- **14-day retention**: two full weeks of daily snapshots, complementing the weekly vzdump full container backups

---

## Part 3: `epl-magazines-watcher.sh`

Health and disk usage monitor for the epl-magazines app, running on the Proxmox host.

### Script Conventions

Same as backup script: `set -euo pipefail`, owned by root, `chmod 755`.

### Location & Schedule

| Item | Value |
|------|-------|
| Script path | `/usr/local/bin/epl-magazines-watcher.sh` |
| Cron schedule | `*/5 * * * *` (every 5 minutes) |
| Log file | `/var/log/epl-magazines-watcher.log` |
| Health alert flag | `/tmp/epl-magazines-health-alert.flag` |
| Disk alert flag | `/tmp/epl-magazines-disk-alert.flag` |
| Disk threshold | 80% |
| Email | On state transition only (healthy→unhealthy, unhealthy→healthy) |

### Logic

1. **Health check:** `curl -sf --max-time 10 http://10.101.16.86:3000/api/health`
   - Success: HTTP 200 with `{"status":"healthy"}`
   - Failure: non-200, timeout, or connection refused
2. **Disk check:** `pct exec 100 -- df --output=pcent / | tail -1`
   - Alert if usage >= 80%
3. **Debounce with separate flag files** (health and disk are independent conditions):
   - `/tmp/epl-magazines-health-alert.flag` for health check state
   - `/tmp/epl-magazines-disk-alert.flag` for disk usage state
   - For each condition independently:
     - If check fails AND no flag file exists → create flag, send alert email, log
     - If check fails AND flag file exists → log only (already alerted)
     - If check passes AND flag file exists → remove flag, send recovery email, log
     - If check passes AND no flag file exists → log only (all clear)
4. **Maintenance mode:** Skip alerting if `/tmp/pve-maintenance.flag` exists (consistent with `pve-ha-watcher.sh` and `pve-vip-watcher.sh`)

### Email Format

**Alert:**
- Subject: `[EPL-MAGAZINES] ALERT: <health check failed / disk usage 85%>`
- Body: timestamp, what failed, current values

**Recovery:**
- Subject: `[EPL-MAGAZINES] RECOVERED: <health / disk>`
- Body: timestamp, confirmation of recovery

**Sender:** `proxmox-alerts@edisonpubliclibrary.org`
**Recipient:** `itdepartment@edisonpubliclibrary.org`

---

## Crontab Additions (Proxmox host)

```bash
# EPL Magazine Tracker — daily app data backup
0 3 * * * /usr/local/bin/epl-magazines-backup.sh

# EPL Magazine Tracker — health + disk watcher
*/5 * * * * /usr/local/bin/epl-magazines-watcher.sh
```

---

## File Summary

| File | Location | Purpose |
|------|----------|---------|
| `epl-magazines-backup.sh` | Proxmox host `/usr/local/bin/` | Daily SQLite + audit log backup to QNAP |
| `epl-magazines-watcher.sh` | Proxmox host `/usr/local/bin/` | Health endpoint + disk usage monitor |
| `/var/log/epl-magazines-backup.log` | Proxmox host | Backup script log |
| `/var/log/epl-magazines-watcher.log` | Proxmox host | Watcher script log |
| `/mnt/pve/nas-backup/epl-magazines/daily/` | QNAP NAS | Daily backup storage |

---

## What This Does NOT Cover

- Full container DR (handled by existing vzdump weekly backups)
- CT-level failure detection (handled by `pve-ha-watcher.sh`)
- VIP monitoring (handled by `pve-vip-watcher.sh`)
- Log rotation (noted as a known gap — at current volume, watcher and backup logs grow < 20 MB/year; revisit if audit.log grows significantly)
- Deploying to CT 100 (manual: copy files, `docker compose up -d`)
