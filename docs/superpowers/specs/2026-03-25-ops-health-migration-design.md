# Operational Improvements: Health Check & Migration Safety

**Date:** 2026-03-25
**Status:** Approved
**Scope:** Health check endpoint + Docker healthcheck, migration safety script

---

## 1. Health Check Endpoint

### Problem

The app has no health endpoint. Docker only knows the process is running, not whether the app is functional. A crashed or degraded app sits silently until someone notices.

### Design

**New file:** `app/api/health/route.ts`

- `GET /api/health` — unauthenticated (Docker healthcheck cannot authenticate). No middleware change needed: `/api/*` routes are already excluded from the auth matcher in `proxy.ts`.
- Performs two checks, each wrapped in try/catch so all failures are reported:
  1. **Database reachability:** `SELECT 1` via Prisma tagged template `` $queryRaw`SELECT 1` `` (no dynamic parts, so prefer the safe variant over `$queryRawUnsafe`)
  2. **Audit log directory writable:** `fs.access(logsDir, fs.constants.W_OK)`
- Response:
  - `200 { status: "healthy" }` — both checks pass
  - `503 { status: "unhealthy", errors: string[] }` — one or both checks fail

### Dockerfile Change

```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1
```

Uses `wget` because `node:20-alpine` includes it by default (no `curl`).

### Docker Compose

No changes needed. `restart: unless-stopped` already handles restarts when Docker marks the container as unhealthy.

---

## 2. Migration Safety Script

### Problem

Running `prisma migrate deploy` directly on the production database risks data loss if a migration fails partway through. There is no automated backup step.

### Design

**New file:** `scripts/migrate-safe.ts`

TypeScript script executed via `tsx scripts/migrate-safe.ts`.

**Steps:**

1. **Backup:** Copy `prisma/dev.db` (plus `-wal` and `-shm` files if present) to `prisma/backups/dev-<ISO-timestamp>.db`
2. **Test:** Copy the backup to a temp file. Run `prisma migrate deploy` against the temp copy by passing `DATABASE_URL=file:./path/to/temp.db` in the `execSync` env option.
3. **On test success:** Run `prisma migrate deploy` against the real `dev.db`.
4. **On test failure:** Print the error message, leave the backup in place, abort without touching the real DB.

**New npm script:**

```json
"migrate:safe": "tsx scripts/migrate-safe.ts"
```

**Implementation notes:**

- The script creates `prisma/backups/` via `mkdirSync({ recursive: true })` if it doesn't exist.
- Backups accumulate in `prisma/backups/`. No auto-cleanup — the SQLite files are small for this app.
- `prisma/backups/` is added to `.gitignore`.

---

## 3. Decisions & Trade-offs

| Decision | Rationale |
|---|---|
| `fs.access` over write-test for health check | Lighter; catches mount/permission failures which are the real risk. Full disk surfaces through other symptoms. |
| `wget` over `curl` in Dockerfile | Alpine ships with `wget`, not `curl`. Avoids adding a package. |
| No auth on `/api/health` | Docker healthcheck runs inside the container and cannot authenticate. Endpoint is not internet-facing (internal LAN only). |
| Test migrations on copy, then apply to real DB | Avoids touching the real DB on failure. The backup is there for manual recovery in the unlikely case of a real-DB failure. |
| No auto-restore on real-DB failure | SQLite migrations are transactional. Adds complexity for an extremely unlikely scenario. Backup file is available for manual recovery. |
| Log rotation deferred | Expected volume is a few log lines per week. 10MB would take years to reach. Not a current concern. |

---

## 4. Files Changed

| File | Change |
|---|---|
| `app/api/health/route.ts` | New — health check endpoint |
| `Dockerfile` | Add `HEALTHCHECK` instruction |
| `scripts/migrate-safe.ts` | New — backup + test + migrate script |
| `package.json` | Add `migrate:safe` npm script |
| `.gitignore` | Add `prisma/backups/` |

---

## 5. Out of Scope

- Log rotation (deferred — insufficient volume to justify)
- Health check authentication (not needed for internal LAN deployment)
- Automatic backup cleanup (files are small, manual pruning is sufficient)
