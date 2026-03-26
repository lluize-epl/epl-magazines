@AGENTS.md

# EPL Magazine Tracker — Project Reference

## Overview

Internal web application for library staff to manage periodical magazine receipts.
Staff log when magazines arrive; the system tracks cadence, flags overdue issues, and shows what's expected each week.

**Deployment**: Internal LAN only, Docker Compose. Never internet-facing.
**Users**: Many users total, max 2–3 concurrent. SQLite is sufficient.

---

## Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Framework | Next.js (latest stable), App Router | Full-stack in one repo; user is familiar with it |
| Language | **TypeScript** (`strict: true`) | Type-safe; peer-readable with TSDoc comments in `docs/` |
| Database | SQLite via **Prisma ORM v7** (`prisma-client` generator + `@prisma/adapter-better-sqlite3`) | No extra server; file-based; easy Docker volume backup |
| Auth | Custom session cookies with **jose** (JWT) + **bcrypt** | Simple, no OAuth needed; HTTP-only cookies |
| Styling | **Tailwind CSS** + **shadcn/ui** | Fast to build clean internal UIs |
| Validation | **Zod** | Runtime input validation for all API routes |
| Audit logging | **Winston** → `logs/audit.log` (JSON lines) | File-based, no external dependency, mountable in Docker |

---

## Project Structure

```
epl-magazines/
├── app/
│   ├── layout.tsx                 # Root layout
│   ├── page.tsx                   # Redirect → /dashboard or /login
│   ├── (auth)/
│   │   └── login/
│   │       └── page.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx             # Sidebar + nav (authenticated shell)
│   │   ├── dashboard/
│   │   │   └── page.tsx           # Dashboard: upcoming + overdue
│   │   ├── magazines/
│   │   │   ├── page.tsx           # Magazine list + mark-received
│   │   │   └── [id]/
│   │   │       └── page.tsx       # Magazine detail + receipt history
│   │   ├── admin/
│   │   │   ├── magazines/
│   │   │   │   └── page.tsx       # Admin: create/edit/delete magazines
│   │   │   ├── users/
│   │   │   │   └── page.tsx       # Admin: create/delete users
│   │   │   ├── transfers/
│   │   │   │   └── page.tsx       # Admin: manage inter-branch transfers
│   │   │   └── reports/
│   │   │       ├── page.tsx       # Admin: reports dashboard (5 tabs, Recharts)
│   │   │       └── export/
│   │   │           └── route.ts   # GET .xlsx export
│   │   ├── profile/
│   │   │   └── page.tsx           # User profile page
│   │   ├── log/
│   │   │   └── page.tsx           # View audit log (admin only)
│   │   └── error.tsx              # Error boundary
│   └── api/
│       ├── auth/
│       │   ├── login/route.ts
│       │   └── logout/route.ts
│       ├── branches/
│       │   ├── route.ts           # GET list of branches
│       │   └── [id]/
│       │       └── magazines/
│       │           ├── route.ts   # GET/POST branch magazine subscriptions
│       │           └── [magazineId]/
│       │               └── route.ts # PUT/DELETE branch subscription
│       ├── health/
│       │   └── route.ts           # GET health check (unauthenticated, Docker)
│       ├── magazines/
│       │   ├── route.ts           # GET list, POST create
│       │   └── [id]/
│       │       ├── route.ts       # GET, PUT (no DELETE — magazines are soft-deleted via active: false)
│       │       └── receipts/
│       │           └── route.ts   # POST mark-received, GET history
│       ├── transfers/
│       │   ├── route.ts           # GET list, POST create transfer
│       │   └── [id]/
│       │       ├── complete/
│       │       │   └── route.ts   # POST complete transfer
│       │       └── cancel/
│       │           └── route.ts   # POST cancel transfer
│       └── users/
│           ├── route.ts           # GET list, POST create (admin)
│           ├── [id]/route.ts      # DELETE (admin)
│           └── profile/
│               └── route.ts       # GET/PUT user profile
├── types/
│   └── index.ts                   # Shared domain types (import from '@/types')
├── lib/
│   ├── session.ts                 # encrypt/decrypt JWT, createSession, deleteSession
│   ├── dal.ts                     # Data Access Layer: verifySession, verifySessionForApi, getUser
│   ├── validations.ts             # Zod schemas for all API input validation
│   ├── logger.ts                  # Winston audit logger
│   ├── branch.ts                  # Branch cookie helper: resolveActiveBranchId, getActiveBranches
│   ├── cadence.ts                 # computeNextExpectedDate, isOverdue helpers
│   ├── reports.ts                 # Report data queries (5 report types)
│   ├── db-retry.ts                # withRetry() for transient SQLite BUSY/LOCKED errors
│   ├── utils.ts                   # cn() helper for Tailwind class merging
│   └── db.ts                      # Prisma client singleton
├── components/
│   ├── ui/                        # shadcn/ui generated components (.tsx)
│   ├── BranchSelector.tsx          # Branch dropdown (cookie-persisted)
│   ├── MagazineCard.tsx
│   ├── Sidebar.tsx
│   └── ...                        # All components as .tsx with Props interfaces
├── docs/                          # Documentation files for non-TS peers
├── proxy.ts                       # Route protection (redirect unauthed → /login)
├── generated/
│   └── prisma/                   # Generated Prisma client (git-ignored, run `npx prisma generate`)
├── prisma/
│   ├── schema.prisma
│   ├── dev.db                    # SQLite file (git-ignored, Docker volume)
│   └── seed.ts                   # Database seed script
├── logs/
│   └── audit.log                 # Winston output (git-ignored, Docker volume)
├── scripts/
│   └── migrate-safe.ts           # Safe migration: backup → test → apply
├── .env.local                    # Secrets (git-ignored)
├── docker-compose.yml
└── Dockerfile
```

---

## Data Model (`prisma/schema.prisma`)

```prisma
model User {
  id           String         @id @default(cuid())
  name         String
  email        String         @unique
  passwordHash String
  role         Role           @default(STAFF)
  active       Boolean        @default(true)
  createdAt    DateTime       @default(now())
  receipts             IssueReceipt[]
  transfersInitiated   Transfer[]     @relation("TransferInitiated")
  transfersCompleted   Transfer[]     @relation("TransferCompleted")
  transfersCancelled   Transfer[]     @relation("TransferCancelled")
}

enum Role {
  ADMIN
  STAFF
}

model Magazine {
  id        String            @id @default(cuid())
  name      String
  cadence   Cadence
  language  String            @default("English")
  active    Boolean           @default(true)
  notes     String?
  createdAt DateTime          @default(now())
  updatedAt DateTime          @updatedAt
  receipts  IssueReceipt[]
  branches  BranchMagazine[]
  transfers Transfer[]
}

enum Cadence {
  WEEKLY       // every 7 days
  BI_WEEKLY    // every 14 days
  MONTHLY      // every ~1 month (calendar)
  BI_MONTHLY   // every ~2 months (calendar)
  SEASONAL     // every ~3 months (quarterly)
  YEARLY       // every 12 months
}

enum TransferStatus {
  PENDING
  COMPLETED
  CANCELLED
}

model Branch {
  id        String            @id @default(cuid())
  name      String
  code      String            @unique
  active    Boolean           @default(true)
  createdAt DateTime          @default(now())
  magazines BranchMagazine[]
  receipts      IssueReceipt[]
  transfersFrom Transfer[]     @relation("TransferFrom")
  transfersTo   Transfer[]     @relation("TransferTo")
}

model BranchMagazine {
  id         String   @id @default(cuid())
  branch     Branch   @relation(fields: [branchId], references: [id])
  branchId   String
  magazine   Magazine @relation(fields: [magazineId], references: [id])
  magazineId String
  quantity   Int      @default(1)
  active     Boolean  @default(true)
  createdAt  DateTime @default(now())

  @@unique([branchId, magazineId])
}

model IssueReceipt {
  id           String   @id @default(cuid())
  magazine     Magazine @relation(fields: [magazineId], references: [id])
  magazineId   String
  receivedBy   User     @relation(fields: [receivedById], references: [id])
  receivedById String
  branch       Branch?  @relation(fields: [branchId], references: [id])
  branchId     String?
  receivedDate DateTime @default(now())
  notes        String?
  createdAt    DateTime @default(now())
}

model Transfer {
  id             String         @id @default(cuid())
  magazine       Magazine       @relation(fields: [magazineId], references: [id])
  magazineId     String
  fromBranch     Branch         @relation("TransferFrom", fields: [fromBranchId], references: [id])
  fromBranchId   String
  toBranch       Branch         @relation("TransferTo", fields: [toBranchId], references: [id])
  toBranchId     String
  quantity       Int
  status         TransferStatus @default(PENDING)
  initiatedBy    User           @relation("TransferInitiated", fields: [initiatedById], references: [id])
  initiatedById  String
  completedBy    User?          @relation("TransferCompleted", fields: [completedById], references: [id])
  completedById  String?
  cancelledBy    User?          @relation("TransferCancelled", fields: [cancelledById], references: [id])
  cancelledById  String?
  createdAt      DateTime       @default(now())
  completedAt    DateTime?
  cancelledAt    DateTime?
}
```

---

## Key Business Logic

### Cadence → Next Expected Date (`lib/cadence.ts`)

No start date is stored. The **last received date** (most recent `IssueReceipt.receivedDate`)
is used as the anchor to compute the next expected date.

| Cadence | Interval |
|---|---|
| WEEKLY | + 7 days |
| BI_WEEKLY | + 14 days |
| MONTHLY | + 1 calendar month |
| BI_MONTHLY | + 2 calendar months |
| SEASONAL | + 3 calendar months |
| YEARLY | + 12 calendar months |

```ts
// lib/cadence.ts
import { addDays, addMonths, addYears } from 'date-fns'

const CADENCE_OFFSETS = {
  WEEKLY:     (d) => addDays(d, 7),
  BI_WEEKLY:  (d) => addDays(d, 14),
  MONTHLY:    (d) => addMonths(d, 1),
  BI_MONTHLY: (d) => addMonths(d, 2),
  SEASONAL:   (d) => addMonths(d, 3),
  YEARLY:     (d) => addYears(d, 1),
}

export function computeNextExpectedDate(lastReceivedDate, cadence) {
  if (!lastReceivedDate) return null
  return CADENCE_OFFSETS[cadence](new Date(lastReceivedDate))
}

export function isOverdue(nextExpectedDate) {
  if (!nextExpectedDate) return false
  return new Date(nextExpectedDate) < new Date()
}
```

If a magazine has **no receipts at all**, it shows in the dashboard as "Never received — status unknown".

### Dashboard Logic

For each active magazine **subscribed at the active branch** (via `BranchMagazine`):
1. Fetch most recent `IssueReceipt` **for that branch** → `lastReceivedDate`
2. Compute `nextExpectedDate = computeNextExpectedDate(lastReceivedDate, cadence)`
3. Bucket into:
   - **Overdue / Missing**: `nextExpectedDate < today`
   - **Expected this week**: `today ≤ nextExpectedDate ≤ today + 7`
   - **Upcoming**: `nextExpectedDate > today + 7`

---

## Auth & Sessions

- Passwords hashed with **bcrypt** (cost factor 10)
- Sessions stored as HTTP-only encrypted JWT cookies (7-day expiry) using **jose**
- `SESSION_SECRET` in `.env.local` — generate with `openssl rand -base64 32`
- `proxy.ts` redirects unauthenticated users to `/login` for all dashboard routes
- `lib/dal.ts` `verifySession()` re-checks auth in every Server Component (defense in depth)

---

## Role Permissions

| Action | STAFF | ADMIN |
|---|---|---|
| View dashboard | ✓ | ✓ |
| Mark magazine received | ✓ | ✓ |
| View receipt history | ✓ | ✓ |
| Create / edit / deactivate magazine | ✗ | ✓ |
| Create / delete users | ✗ | ✓ |
| View audit log | ✗ | ✓ |
| View reports / export .xlsx | ✗ | ✓ |

Enforce in API routes: check `session.role === 'ADMIN'` before admin operations.

---

## Audit Logging (`lib/logger.ts`)

Every meaningful action is logged as a JSON line to `logs/audit.log`.

```ts
// lib/logger.ts
import winston from 'winston'

const logger = winston.createLogger({
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/audit.log' }),
  ],
})

export function auditLog(userId, action, details = {}) {
  logger.info({ userId, action, ...details })
}
```

**Log every**: login, logout, magazine created/updated/deleted, receipt recorded, user created/deleted.

---

## Environment Variables

```bash
# .env.local — never commit
SESSION_SECRET=<openssl rand -base64 32>
DATABASE_URL="file:./prisma/dev.db"
```

---

## Docker Compose

```yaml
services:
  app:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./prisma:/app/prisma      # SQLite file persistence
      - ./logs:/app/logs          # Audit log persistence
    env_file:
      - .env.local
    restart: unless-stopped
```

**Health monitoring**: The Dockerfile includes a `HEALTHCHECK` that polls `GET /api/health` every 30s.
Combined with `restart: unless-stopped`, Docker will restart an unhealthy container automatically.

**Backups**: The SQLite file lives at `prisma/dev.db` and the audit log at `logs/audit.log`.
Both are mounted as Docker volumes. Back them up by copying these two files.
Use `npm run migrate:safe` before applying schema migrations — it backs up the DB first.

---

## Development Commands

```bash
npm run dev          # Start dev server (localhost:3000)
npm run seed         # Run seed script (tsx prisma/seed.ts)
npx tsx prisma/seed_test.ts  # Run test seed with demo data (destroys existing data)
npx prisma studio    # Visual DB browser
npx prisma migrate dev --name <name>   # Create and run migration
npx prisma generate  # Regenerate Prisma client after schema change
npm run migrate:safe  # Safe migration: backup DB → test on copy → apply (stop dev server first)
npx prisma migrate reset --force       # Reset DB + reseed (requires user consent, see Gotchas)
rm prisma/dev.db && npx prisma migrate dev && npm run seed  # Full reset (delete + recreate + seed)
```

---

## Prisma Client (v7 adapter pattern)

Prisma v7 with SQLite requires a driver adapter. Import from `@/generated/prisma/client`:
```ts
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient } from '../generated/prisma/client'
const adapter = new PrismaBetterSqlite3({ url: process.env['DATABASE_URL']! })
const prisma = new PrismaClient({ adapter })
```
The singleton lives in `lib/db.ts`. Config is in `prisma.config.ts` (TypeScript, not .mjs).

---

## Conventions

- **TypeScript for all source files** — use `.ts` / `.tsx` exclusively; no `.js` / `.jsx` source files
- `strict: true` with zero `any`; use `as unknown as T` only where genuinely needed (mark with `// TODO: improve typing`)
- TSDoc (`/** */` with typed params) on every exported function/type in `lib/` and `types/`
- Server Components by default; add `'use client'` only for interactive forms/state
- All data mutations via **Server Actions** or API route handlers — no client-side fetch for mutations
- Use `date-fns` for all date arithmetic (already a Next.js ecosystem staple)
- shadcn/ui components live in `components/ui/` — add with `npx shadcn@latest add <component>`
- Audit log changes with before/after values: fetch record before update, log `field: old → new` (not just field names)
- Magazine `language` field: free-text string (not enum) normalized to title case ("Hindi", not "hindi") in API routes. Default: "English"
- **API route auth**: Use `verifySessionForApi()` from `lib/dal.ts` (returns `null`, no redirect). Reserve `verifySession()` for Server Components only.
- **Zod validation**: All API route input is validated with Zod schemas from `lib/validations.ts`. Use `.safeParse(body)` and return first error message on failure.
- **Magazine deletion**: Magazines are never hard-deleted. Use `PUT { active: false }` for soft-delete. Receipt and transfer history is always preserved for reports.

---

## Gotchas

- `proxy.ts` is Next.js Edge middleware (alternative to `middleware.ts`) — cannot import `server-only` modules or `cookies()` from `next/headers`; use `request.cookies` and inline Edge-compatible code
- Winston: use `logger.info({ ...data })` not `logger.info('string', { ...data })` — the latter adds a redundant `"message"` field to the JSON output
- Base UI Button with `render={<Link>}`: must set `nativeButton={false}` to avoid console warnings
- Base UI Select: `<SelectValue>` renders the raw `value` (e.g. cuid), not the label. Must render children: `<SelectValue>{displayText}</SelectValue>`
- `tsx prisma/seed.ts` doesn't auto-load `.env.local` — seed script needs `import 'dotenv/config'`
- After editing `proxy.ts`, delete `.next/` cache for changes to take effect in dev
- After merging a worktree branch, run `npx prisma generate` — the generated client doesn't carry over from worktrees
- Prisma v7 AI safety gate: `prisma migrate reset` and other destructive commands fail when invoked by AI agents. Must set `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` env var with the user's exact consent message. Always ask the user first.
- SQLite WAL mode is enabled in `lib/db.ts` at startup — allows concurrent reads during writes. Do not change journal mode.
- All DB write operations should use `withRetry()` from `lib/db-retry.ts` to handle transient `SQLITE_BUSY`/`SQLITE_LOCKED` errors
- Recharts does not support oklch color values — use hex approximations (e.g. `#2d7a4f` for primary green `oklch(0.38 0.082 156)`)
- Never use `verifySession()` in API route handlers — it throws `redirect()` which gets caught by catch blocks. Use `verifySessionForApi()` instead, which returns `null` for unauthenticated requests.
- The logout route (`app/api/auth/logout/route.ts`) intentionally does NOT use `verifySessionForApi` — it must handle expired/invalid sessions gracefully
- After changing `lib/` files imported by API routes, `rm -rf .next` before restarting dev — Next.js may serve stale compiled routes otherwise
- **Git commits**: No `Co-Authored-By` signatures. Keep commit messages short — just describe what was added/changed/removed.
