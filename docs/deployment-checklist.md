# EPL Magazine Tracker — Deployment Checklist

## Prerequisites

- [ ] DNS record created in Nginx Proxy Manager for the app (port 3000)
- [ ] `sqlite3` installed on **pve host** (used by backup script for `PRAGMA integrity_check` on the pulled DB copy): `apt install -y sqlite3`

---

## Part A: Deploy to CT 100 (docker-server)

Run these commands from the Proxmox host or via SSH into CT 100.

### 1. Copy project files to CT 100

From your dev machine (or wherever the repo is cloned):

```bash
# Option A: git clone on CT 100
pct exec 100 -- bash -c "cd /home/epltech && git clone <repo-url> epl-magazines"

# Option B: scp from dev machine
scp -r ./epl-magazines epltech@10.101.16.67:/home/epltech/
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
curl -s http://10.101.16.86:3000/api/health
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
scp scripts/epl-magazines-backup.sh root@10.101.16.71:/usr/local/bin/
scp scripts/epl-magazines-watcher.sh root@10.101.16.71:/usr/local/bin/
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
| App healthy | `curl -s http://10.101.16.86:3000/api/health` | `{"status":"healthy"}` |
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
