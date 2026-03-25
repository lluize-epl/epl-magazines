# Health Check & Migration Safety — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a health check endpoint so Docker can detect and restart an unhealthy app, and a migration safety script that backs up the database before applying schema changes.

**Architecture:** Two independent features. The health check is a Next.js API route (`GET /api/health`) that verifies DB reachability and audit log directory writability, paired with a `HEALTHCHECK` instruction in the Dockerfile. The migration script is a standalone TypeScript file that copies the SQLite DB, tests migrations on the copy, then applies to the real DB.

**Tech Stack:** Next.js App Router API routes, Prisma `$queryRaw`, Node.js `fs/promises`, `child_process.execSync`, Docker `HEALTHCHECK`

**Spec:** `docs/superpowers/specs/2026-03-25-ops-health-migration-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `app/api/health/route.ts` | Create | Health check endpoint — DB ping + log dir writable |
| `Dockerfile` | Modify (line 39, before CMD) | Add `HEALTHCHECK` instruction |
| `scripts/migrate-safe.ts` | Create | Backup DB, test migration on copy, apply to real DB |
| `package.json` | Modify (scripts block) | Add `"migrate:safe"` npm script |
| `.gitignore` | Modify | Add `prisma/backups/` |

---

## Task 1: Health Check Endpoint

**Files:**
- Create: `app/api/health/route.ts`

**Context:** Existing API routes live in `app/api/`. They import `db` from `@/lib/db` and use `Response.json()` to return data. The auth middleware in `proxy.ts` (line 59) already excludes `/api/*` from the auth matcher, so this route needs no authentication handling. The logs directory path is defined in `lib/logger.ts` line 7 as `path.join(process.cwd(), 'logs')`.

- [ ] **Step 1: Create the health check route**

Create `app/api/health/route.ts`:

```ts
import { NextResponse } from 'next/server'
import db from '@/lib/db'
import fs from 'fs/promises'
import path from 'path'

const logsDir = path.join(process.cwd(), 'logs')

/**
 * GET /api/health
 * Returns 200 if the database is reachable and the audit log directory is writable.
 * Returns 503 with error details if either check fails.
 * Unauthenticated — used by Docker HEALTHCHECK.
 */
export async function GET(): Promise<NextResponse> {
  const errors: string[] = []

  // Check 1: Database reachability
  try {
    await db.$queryRaw`SELECT 1`
  } catch {
    errors.push('Database unreachable')
  }

  // Check 2: Audit log directory writable
  try {
    await fs.access(logsDir, fs.constants.W_OK)
  } catch {
    errors.push('Audit log directory not writable')
  }

  if (errors.length > 0) {
    return NextResponse.json({ status: 'unhealthy', errors }, { status: 503 })
  }

  return NextResponse.json({ status: 'healthy' })
}
```

- [ ] **Step 2: Verify the endpoint works**

Start the dev server (`npm run dev` if not already running). Then test:

```bash
curl -s http://localhost:3000/api/health | jq .
```

Expected: `{ "status": "healthy" }`

- [ ] **Step 3: Verify type-checking passes**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/health/route.ts
git commit -m "feat: add GET /api/health endpoint for Docker healthcheck"
```

---

## Task 2: Dockerfile HEALTHCHECK

**Files:**
- Modify: `Dockerfile` (line 39, before `CMD`)

**Context:** The Dockerfile is a multi-stage build. The `HEALTHCHECK` instruction must go in the final `runner` stage, after `EXPOSE`/`ENV` and before `CMD`. Alpine includes `wget` via BusyBox but does not include `curl`.

- [ ] **Step 1: Add HEALTHCHECK instruction**

In `Dockerfile`, add these two lines immediately before the existing `CMD ["node", "server.js"]` line (line 40):

```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1
```

The file should end with:

```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
```

- [ ] **Step 2: Commit**

```bash
git add Dockerfile
git commit -m "feat: add Docker HEALTHCHECK for /api/health"
```

---

## Task 3: Migration Safety Script

**Files:**
- Create: `scripts/migrate-safe.ts`
- Modify: `package.json` (scripts block)
- Modify: `.gitignore`

**Context:** Standalone TypeScript scripts in this project (see `prisma/seed.ts`) use `import 'dotenv/config'` to load env vars, and direct imports from `'../generated/prisma/client'` (no `@/` aliases — tsx doesn't resolve them by default). The script uses `child_process.execSync` to run `prisma migrate deploy`. The `DATABASE_URL` env var is `file:./prisma/dev.db` (relative to project root).

- [ ] **Step 1: Add `prisma/backups/` to `.gitignore`**

In `.gitignore`, add the following line after the existing `# Audit logs` / `/logs/` block:

```
# Database backups
/prisma/backups/
```

- [ ] **Step 2: Create the migration safety script**

Create `scripts/migrate-safe.ts`:

```ts
import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..')
const DB_PATH = path.join(PROJECT_ROOT, 'prisma', 'dev.db')
const BACKUPS_DIR = path.join(PROJECT_ROOT, 'prisma', 'backups')

/**
 * Copies a file if it exists. Silently skips if the source doesn't exist.
 * @param src - Source file path
 * @param dest - Destination file path
 */
function copyIfExists(src: string, dest: string): void {
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest)
  }
}

/**
 * Creates a timestamped backup of the SQLite database (including WAL/SHM files).
 * @returns The path to the backup file
 */
function backupDatabase(): string {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true })

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = path.join(BACKUPS_DIR, `dev-${timestamp}.db`)

  if (!fs.existsSync(DB_PATH)) {
    console.error(`❌ Database not found at ${DB_PATH}`)
    process.exit(1)
  }

  fs.copyFileSync(DB_PATH, backupPath)
  copyIfExists(`${DB_PATH}-wal`, `${backupPath}-wal`)
  copyIfExists(`${DB_PATH}-shm`, `${backupPath}-shm`)

  console.log(`✅ Backup created: ${backupPath}`)
  return backupPath
}

/**
 * Runs `prisma migrate deploy` against the given database file.
 * @param dbPath - Absolute path to the SQLite database file
 * @param label - Label for log messages (e.g. "test copy" or "production")
 */
function runMigrate(dbPath: string, label: string): void {
  console.log(`\n🔄 Running migrations on ${label}...`)
  execSync('npx prisma migrate deploy', {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: `file:${dbPath}`,
    },
  })
  console.log(`✅ Migrations succeeded on ${label}.`)
}

/**
 * Cleans up temporary test database files.
 * @param testPath - Path to the temporary test database
 */
function cleanupTestDb(testPath: string): void {
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    const filePath = `${testPath}${suffix}`
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
  }
}

// --- Main ---

console.log('🛡️  Safe Migration — backup → test → apply\n')

// Step 1: Backup
const backupPath = backupDatabase()

// Step 2: Test on a copy
const testPath = path.join(BACKUPS_DIR, 'migrate-test-temp.db')
fs.copyFileSync(backupPath, testPath)
copyIfExists(`${backupPath}-wal`, `${testPath}-wal`)
copyIfExists(`${backupPath}-shm`, `${testPath}-shm`)

try {
  runMigrate(testPath, 'test copy')
} catch {
  console.error('\n❌ Migrations FAILED on the test copy. Real database was NOT touched.')
  console.error(`   Backup is at: ${backupPath}`)
  cleanupTestDb(testPath)
  process.exit(1)
}

cleanupTestDb(testPath)

// Step 3: Apply to real DB
try {
  runMigrate(DB_PATH, 'production database')
} catch {
  console.error('\n❌ Migrations FAILED on the production database.')
  console.error(`   Backup is at: ${backupPath}`)
  console.error('   Restore manually: cp <backup> prisma/dev.db')
  process.exit(1)
}

console.log('\n🎉 Safe migration complete.')
```

- [ ] **Step 3: Add `migrate:safe` npm script**

In `package.json`, add to the `"scripts"` block (after the `"seed-test"` entry):

```json
"migrate:safe": "tsx scripts/migrate-safe.ts"
```

- [ ] **Step 4: Verify type-checking passes**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 5: Test the script (dry run)**

Run the script. It should create a backup, test migrations on a copy (which should succeed since the DB is already up-to-date), and apply to the real DB.

```bash
npm run migrate:safe
```

Expected output includes:
- `✅ Backup created: prisma/backups/dev-<timestamp>.db`
- `✅ Migrations succeeded on test copy.`
- `✅ Migrations succeeded on production database.`
- `🎉 Safe migration complete.`

Verify the backup exists:

```bash
ls prisma/backups/
```

Expected: `dev-<timestamp>.db` file present.

- [ ] **Step 6: Commit**

```bash
git add scripts/migrate-safe.ts package.json .gitignore
git commit -m "feat: add safe migration script with backup and test-on-copy"
```
