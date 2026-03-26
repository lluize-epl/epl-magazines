# Ops Deployment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Test the Docker image locally, write a daily SQLite backup script and a health/disk watcher script for the Proxmox host, and produce a deployment checklist for CT 100.

**Architecture:** Three independent work streams: (1) verify the Docker build and health check locally, (2) write `epl-magazines-backup.sh` — a shell script that uses `pct exec` + SQLite `.backup` to snapshot the database daily to QNAP NAS, (3) write `epl-magazines-watcher.sh` — a shell script that polls the app health endpoint and CT 100 disk usage every 5 minutes with email alerting via Postfix. Both scripts live in `scripts/` in this repo and will be manually copied to the Proxmox host.

**Tech Stack:** Bash (shell scripts), Docker Compose, SQLite3 CLI, Postfix (sendmail), cron

**Spec:** `docs/superpowers/specs/2026-03-26-ops-deployment-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `docker-compose.yml` | Modify | Add `migrate` service using builder stage for migrations/seeding |
| `Dockerfile` | Modify | Add named `migrate` target stage with Prisma CLI + tsx |
| `scripts/epl-magazines-backup.sh` | Create | Daily SQLite + audit log backup to QNAP NAS |
| `scripts/epl-magazines-watcher.sh` | Create | Health endpoint + disk usage monitor with email alerts |
| `docs/deployment-checklist.md` | Create | Step-by-step deployment instructions for CT 100 and Proxmox host |

---

## Task 1: Add Migrate Service & Local Docker Build/Test

**Files:**
- Modify: `Dockerfile` — add a `migrate` target stage
- Modify: `docker-compose.yml` — add `migrate` service
- Existing: `app/api/health/route.ts`

**Context:** The Dockerfile uses multi-stage build with `output: 'standalone'` (set in `next.config.mjs`). The standalone runner image is lean — no `node_modules`, no `prisma` CLI, no `tsx`. To run migrations and seeding without installing Node.js on CT 100, we add a `migrate` stage in the Dockerfile that reuses the builder (which has all deps) and a `migrate` service in docker-compose.yml that runs once against the bind-mounted `./prisma` volume.

- [ ] **Step 1: Add `migrate` stage to Dockerfile**

Add after the `builder` stage, before the `runner` stage:

```dockerfile
# Migration / seed runner (has full node_modules + prisma CLI + tsx)
FROM base AS migrate
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
ENTRYPOINT ["npx"]
CMD ["prisma", "migrate", "deploy"]
```

This stage has the full `node_modules` (including `prisma`, `tsx`, `better-sqlite3`), the source code, and the generated Prisma client. The entrypoint defaults to `prisma migrate deploy` but can be overridden for seeding.

- [ ] **Step 2: Add `migrate` service to docker-compose.yml**

```yaml
services:
  app:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./prisma:/app/prisma
      - ./logs:/app/logs
    env_file:
      - .env.local
    restart: unless-stopped

  migrate:
    build:
      context: .
      target: migrate
    volumes:
      - ./prisma:/app/prisma
    env_file:
      - .env.local
    profiles:
      - tools
```

The `profiles: [tools]` means `migrate` does NOT start with `docker compose up` — it only runs when explicitly invoked:

```bash
# Run migrations
docker compose run --rm migrate

# Run seed (override CMD)
docker compose run --rm migrate tsx prisma/seed.ts
```

- [ ] **Step 3: Build the Docker images**

```bash
docker compose build
```

Watch for errors in:
- `npx prisma generate` (builder stage) — Prisma client generation
- `npm run build` (builder stage) — Next.js standalone build
- COPY instructions in runner stage — `app/generated`, `prisma/`, `node_modules/.prisma`

- [ ] **Step 4: Run migrations locally**

```bash
docker compose run --rm migrate
```

Expected: `prisma migrate deploy` output showing applied migrations.

- [ ] **Step 5: Run seed locally**

```bash
docker compose run --rm migrate tsx prisma/seed.ts
```

Expected: Seed script output showing created records.

- [ ] **Step 6: Start the app container**

```bash
docker compose up -d
```

Wait ~15 seconds for the health check start period.

- [ ] **Step 7: Verify health endpoint**

```bash
curl -s http://localhost:3000/api/health | jq .
```

Expected: `{"status":"healthy"}`

If 503: check the error array — "Database unreachable" means the SQLite file isn't accessible (volume mount issue), "Audit log directory not writable" means the `logs/` mount has permission issues.

- [ ] **Step 8: Verify Docker health status**

```bash
docker inspect --format='{{.State.Health.Status}}' $(docker compose ps -q app)
```

Expected: `healthy`

If `unhealthy`: check logs with `docker compose logs app` for startup errors.

- [ ] **Step 9: Smoke test the UI**

Open `http://localhost:3000/login` in a browser. Confirm the login page renders correctly.

- [ ] **Step 10: Clean up**

```bash
docker compose down
```

- [ ] **Step 11: Commit**

```bash
git add Dockerfile docker-compose.yml
git commit -m "feat: add migrate service for containerized migrations and seeding"
```

---

## Task 2: Write `epl-magazines-backup.sh`

**Files:**
- Create: `scripts/epl-magazines-backup.sh`

**Context:** This script will run on the Proxmox host (`pve`, `10.101.16.220`) via cron at 3AM daily. It uses `pct exec 100` to run commands inside CT 100, and `pct pull 100` to copy files out. The QNAP NAS is mounted at `/mnt/pve/nas-backup` on the host. Email is sent via `sendmail` (Postfix is already configured on the host). The SQLite database is at `/home/epltech/epl-magazines/prisma/dev.db` on CT 100's filesystem (bind-mounted into the Docker container). The `.backup` SQLite command produces a consistent snapshot that handles WAL coordination automatically.

- [ ] **Step 1: Create the backup script**

Create `scripts/epl-magazines-backup.sh`:

```bash
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
```

- [ ] **Step 2: Make it executable**

```bash
chmod +x scripts/epl-magazines-backup.sh
```

- [ ] **Step 3: Commit**

```bash
git add scripts/epl-magazines-backup.sh
git commit -m "feat: add daily SQLite backup script for Proxmox host"
```

---

## Task 3: Write `epl-magazines-watcher.sh`

**Files:**
- Create: `scripts/epl-magazines-watcher.sh`

**Context:** This script will run on the Proxmox host via cron every 5 minutes. It polls the app's health endpoint at `http://10.101.16.231:3000/api/health` and checks disk usage on CT 100 via `pct exec 100 -- df`. It uses separate flag files for health and disk conditions to independently track state transitions (alert/recovery). It respects the existing maintenance flag at `/tmp/pve-maintenance.flag` used by other `pve-*.sh` watchers. Email via `sendmail` (Postfix).

- [ ] **Step 1: Create the watcher script**

Create `scripts/epl-magazines-watcher.sh`:

```bash
#!/bin/bash
set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────
CTID=100
HEALTH_URL="http://10.101.16.231:3000/api/health"
HEALTH_TIMEOUT=10
DISK_THRESHOLD=80

LOGFILE="/var/log/epl-magazines-watcher.log"
HEALTH_FLAG="/tmp/epl-magazines-health-alert.flag"
DISK_FLAG="/tmp/epl-magazines-disk-alert.flag"
MAINTENANCE_FLAG="/tmp/pve-maintenance.flag"

MAIL_TO="itdepartment@edisonpubliclibrary.org"
MAIL_FROM="proxmox-alerts@edisonpubliclibrary.org"

# ── Helpers ───────────────────────────────────────────────────────────
log() { echo "$(date -Iseconds) $1" >> "$LOGFILE"; }

send_email() {
  local subject="$1"
  local body="$2"
  sendmail -t <<EOF
From: ${MAIL_FROM}
To: ${MAIL_TO}
Subject: ${subject}

${body}
EOF
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
          "EPL Magazine Tracker — ${name}
Time: $(date -Iseconds)
Detail: ${detail}

Check log: ${LOGFILE}"
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
          "EPL Magazine Tracker — ${name} recovered
Time: $(date -Iseconds)
Detail: ${detail}"
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

# ── Disk Check ────────────────────────────────────────────────────────
DISK_PASS="true"
DISK_DETAIL="ok"

DISK_USAGE=$(pct exec "$CTID" -- df --output=pcent / 2>/dev/null | tail -1 | tr -d ' %') || {
  DISK_PASS="false"
  DISK_DETAIL="Could not read disk usage from CT ${CTID}"
}

if [ "$DISK_PASS" = "true" ] && [ "$DISK_USAGE" -ge "$DISK_THRESHOLD" ]; then
  DISK_PASS="false"
  DISK_DETAIL="Disk usage at ${DISK_USAGE}% (threshold: ${DISK_THRESHOLD}%)"
fi

if [ "$DISK_PASS" = "true" ]; then
  DISK_DETAIL="Disk usage at ${DISK_USAGE}%"
fi

check_condition "Disk usage high on CT ${CTID}" "$DISK_PASS" "$DISK_FLAG" "$DISK_DETAIL"

log "Check complete — health:${HEALTH_PASS} disk:${DISK_PASS}"
```

- [ ] **Step 2: Make it executable**

```bash
chmod +x scripts/epl-magazines-watcher.sh
```

- [ ] **Step 3: Commit**

```bash
git add scripts/epl-magazines-watcher.sh
git commit -m "feat: add health/disk watcher script for Proxmox host"
```

---

## Task 4: Write Deployment Checklist

**Files:**
- Create: `docs/deployment-checklist.md`

**Context:** This is a step-by-step guide for deploying the app to CT 100 and installing the ops scripts on the Proxmox host. The user will follow this manually. CT 100 runs Docker at `/home/epltech/`. Nginx Proxy Manager runs on CT 100 at port 81 and handles reverse proxy. The app uses port 3000:3000.

- [ ] **Step 1: Create the deployment checklist**

Create `docs/deployment-checklist.md`:

```markdown
# EPL Magazine Tracker — Deployment Checklist

## Prerequisites

- [ ] DNS record created in Nginx Proxy Manager for the app (port 3000)
- [ ] `sqlite3` installed on CT 100: `pct exec 100 -- apt install -y sqlite3`

---

## Part A: Deploy to CT 100 (docker-server)

Run these commands from the Proxmox host or via SSH into CT 100.

### 1. Copy project files to CT 100

From your dev machine (or wherever the repo is cloned):

```bash
# Option A: git clone on CT 100
pct exec 100 -- bash -c "cd /home/epltech && git clone <repo-url> epl-magazines"

# Option B: scp from dev machine
scp -r ./epl-magazines epltech@10.101.16.231:/home/epltech/
```

### 2. Create `.env.local` on CT 100

```bash
# Generate secret first, then write the file
SECRET=$(openssl rand -base64 32)
pct exec 100 -- bash -c "cat > /home/epltech/epl-magazines/.env.local << EOF
SESSION_SECRET=${SECRET}
DATABASE_URL=file:./prisma/dev.db
EOF"
```

### 3. Create required directories and set permissions

The Docker container runs as UID 1001 (`nextjs`). The bind-mounted volumes need to be writable by this user.

```bash
pct exec 100 -- bash -c "mkdir -p /home/epltech/epl-magazines/logs /home/epltech/epl-magazines/prisma"
pct exec 100 -- bash -c "chown -R 1001:1001 /home/epltech/epl-magazines/logs /home/epltech/epl-magazines/prisma"
```

### 4. Build and start the container

```bash
pct exec 100 -- bash -c "cd /home/epltech/epl-magazines && docker compose build && docker compose up -d"
```

### 5. Run database migrations and seed

Uses the `migrate` service (built from the `migrate` Dockerfile stage) which has the full `node_modules`, `prisma` CLI, and `tsx`. No need to install Node.js on CT 100.

```bash
# Run migrations
pct exec 100 -- bash -c "cd /home/epltech/epl-magazines && docker compose run --rm migrate"

# Run seed
pct exec 100 -- bash -c "cd /home/epltech/epl-magazines && docker compose run --rm migrate tsx prisma/seed.ts"
```

### 6. Verify health

```bash
curl -s http://10.101.16.231:3000/api/health
# Expected: {"status":"healthy"}
```

### 7. Verify via Nginx Proxy Manager

Open the configured DNS name in a browser. Confirm the login page loads.

---

## Part B: Install ops scripts on Proxmox host

### 1. Copy scripts

From the repo's `scripts/` directory:

```bash
# From dev machine to Proxmox host
scp scripts/epl-magazines-backup.sh root@10.101.16.220:/usr/local/bin/
scp scripts/epl-magazines-watcher.sh root@10.101.16.220:/usr/local/bin/
```

### 2. Set permissions

```bash
chmod 755 /usr/local/bin/epl-magazines-backup.sh
chmod 755 /usr/local/bin/epl-magazines-watcher.sh
```

### 3. Create backup directory on QNAP

```bash
mkdir -p /mnt/pve/nas-backup/epl-magazines/daily
```

### 4. Add cron entries

```bash
crontab -e
```

Add these lines:

```
# EPL Magazine Tracker — daily app data backup (3AM)
0 3 * * * /usr/local/bin/epl-magazines-backup.sh >> /var/log/epl-magazines-backup.log 2>&1

# EPL Magazine Tracker — health + disk watcher (every 5 min)
*/5 * * * * /usr/local/bin/epl-magazines-watcher.sh >> /var/log/epl-magazines-watcher.log 2>&1
```

### 5. Test the backup script manually

```bash
/usr/local/bin/epl-magazines-backup.sh
```

Verify:
- [ ] No errors in output
- [ ] Backup exists at `/mnt/pve/nas-backup/epl-magazines/daily/YYYY-MM-DD/dev.db`
- [ ] Audit log exists at `/mnt/pve/nas-backup/epl-magazines/daily/YYYY-MM-DD/audit.log`
- [ ] Log entry in `/var/log/epl-magazines-backup.log`

### 6. Test the watcher script manually

```bash
/usr/local/bin/epl-magazines-watcher.sh
```

Verify:
- [ ] No errors in output
- [ ] Log entry in `/var/log/epl-magazines-watcher.log` showing `health:true disk:true`

### 7. Test email alerting

Temporarily stop the app to trigger a health alert:

```bash
pct exec 100 -- bash -c "cd /home/epltech/epl-magazines && docker compose stop"
```

Wait 5 minutes for the watcher to fire, then check:
- [ ] Alert email received at itdepartment@edisonpubliclibrary.org
- [ ] Flag file created: `/tmp/epl-magazines-health-alert.flag`

Restart the app:

```bash
pct exec 100 -- bash -c "cd /home/epltech/epl-magazines && docker compose up -d"
```

Wait 5 minutes, then check:
- [ ] Recovery email received
- [ ] Flag file removed

---

## Verification Summary

After full deployment, confirm:

| Check | Command | Expected |
|---|---|---|
| App healthy | `curl -s http://10.101.16.231:3000/api/health` | `{"status":"healthy"}` |
| Docker health | `pct exec 100 -- bash -c "docker inspect --format='{{.State.Health.Status}}' \$(cd /home/epltech/epl-magazines && docker compose ps -q app)"` | `healthy` |
| Backup cron | `crontab -l \| grep epl-magazines` | Two entries (3AM backup, */5 watcher) |
| QNAP backup dir | `ls /mnt/pve/nas-backup/epl-magazines/daily/` | Today's date directory |
| Watcher log | `tail -1 /var/log/epl-magazines-watcher.log` | Recent entry with `health:true disk:true` |

---

## Updated Proxmox Host Crontab (after adding EPL entries)

For reference, the full crontab should now include:

```
# Existing PVE entries
0 4 * * 0 /usr/local/bin/pve-host-backup-wrapper.sh && /usr/local/bin/pve-sync-docker-standby.sh
* * * * * /usr/local/bin/pve-ha-watcher.sh > /dev/null 2>&1
*/5 * * * * /usr/local/bin/pve-mount-watcher.sh
*/2 * * * * /usr/local/bin/pve-vip-watcher.sh
*/15 * * * * /usr/local/bin/pve-resource-monitor.sh
0 8 * * 1 /usr/local/bin/pve-weekly-report.sh
*/5 * * * * echo "$(date -Iseconds) $(hostname)" > /mnt/pve/nas-backup/heartbeat/pve-heartbeat.txt

# EPL Magazine Tracker
0 3 * * * /usr/local/bin/epl-magazines-backup.sh >> /var/log/epl-magazines-backup.log 2>&1
*/5 * * * * /usr/local/bin/epl-magazines-watcher.sh >> /var/log/epl-magazines-watcher.log 2>&1
```

- [ ] **Step 2: Commit**

```bash
git add docs/deployment-checklist.md
git commit -m "docs: add deployment checklist for CT 100 and Proxmox host"
```
