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
│   │   │   └── users/
│   │   │       └── page.tsx       # Admin: create/delete users
│   │   └── log/
│   │       └── page.tsx           # View audit log (admin only)
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
│       ├── magazines/
│       │   ├── route.ts           # GET list, POST create
│       │   └── [id]/
│       │       ├── route.ts       # GET, PUT, DELETE
│       │       └── receipts/
│       │           └── route.ts   # POST mark-received, GET history
│       └── users/
│           ├── route.ts           # GET list, POST create (admin)
│           └── [id]/route.ts      # DELETE (admin)
├── types/
│   └── index.ts                   # Shared domain types (import from '@/types')
├── lib/
│   ├── session.ts                 # encrypt/decrypt JWT, createSession, deleteSession
│   ├── dal.ts                     # Data Access Layer: verifySession, getUser
│   ├── logger.ts                  # Winston audit logger
│   ├── branch.ts                  # Branch cookie helper: resolveActiveBranchId, getActiveBranches
│   ├── cadence.ts                 # computeNextExpectedDate, isOverdue helpers
│   ├── utils.ts                   # cn() helper for Tailwind class merging
│   └── db.ts                      # Prisma client singleton
├── components/
│   ├── ui/                        # shadcn/ui generated components (.tsx)
│   ├── BranchSelector.tsx          # Branch dropdown (cookie-persisted)
│   ├── MagazineCard.tsx
│   ├── Sidebar.tsx
│   └── ...                        # All components as .tsx with Props interfaces
├── docs/                          # 9 documentation files for non-TS peers
├── proxy.ts                       # Route protection (redirect unauthed → /login)
├── generated/
│   └── prisma/                   # Generated Prisma client (git-ignored, run `npx prisma generate`)
├── prisma/
│   ├── schema.prisma
│   ├── dev.db                    # SQLite file (git-ignored, Docker volume)
│   └── seed.ts                   # Database seed script
├── logs/
│   └── audit.log                 # Winston output (git-ignored, Docker volume)
├── .env.local                    # Secrets (git-ignored)
├── docker-compose.yml
└── Dockerfile
```

---

## Data Model (`prisma/schema.prisma`)

```prisma
model User {
  id           String        @id @default(cuid())
  name         String
  email        String        @unique
  passwordHash String
  role         Role          @default(STAFF)
  active       Boolean       @default(true)
  createdAt    DateTime      @default(now())
  receipts     IssueReceipt[]
}

enum Role {
  ADMIN
  STAFF
}

model Magazine {
  id        String            @id @default(cuid())
  name      String
  cadence   Cadence
  active    Boolean           @default(true)
  notes     String?
  createdAt DateTime          @default(now())
  updatedAt DateTime          @updatedAt
  receipts  IssueReceipt[]
  branches  BranchMagazine[]
}

enum Cadence {
  WEEKLY       // every 7 days
  BI_WEEKLY    // every 14 days
  MONTHLY      // every ~1 month (calendar)
  BI_MONTHLY   // every ~2 months (calendar)
  SEASONAL     // every ~3 months (quarterly)
}

model Branch {
  id        String            @id @default(cuid())
  name      String
  code      String            @unique
  active    Boolean           @default(true)
  createdAt DateTime          @default(now())
  magazines BranchMagazine[]
  receipts  IssueReceipt[]
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

```ts
// lib/cadence.ts
import { addDays, addMonths } from 'date-fns'

const CADENCE_OFFSETS = {
  WEEKLY:     (d) => addDays(d, 7),
  BI_WEEKLY:  (d) => addDays(d, 14),
  MONTHLY:    (d) => addMonths(d, 1),
  BI_MONTHLY: (d) => addMonths(d, 2),
  SEASONAL:   (d) => addMonths(d, 3),
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
| Create / edit / delete magazine | ✗ | ✓ |
| Create / delete users | ✗ | ✓ |
| View audit log | ✗ | ✓ |

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

**Backups**: The SQLite file lives at `prisma/dev.db` and the audit log at `logs/audit.log`.
Both are mounted as Docker volumes. Back them up by copying these two files.

---

## Development Commands

```bash
npm run dev          # Start dev server (localhost:3000)
npm run seed         # Run seed script (tsx prisma/seed.ts)
npx prisma studio    # Visual DB browser
npx prisma migrate dev --name <name>   # Create and run migration
npx prisma generate  # Regenerate Prisma client after schema change
npx prisma migrate reset --force       # Reset DB + reseed (requires user consent, see Gotchas)
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

---

## Gotchas

- `proxy.ts` is Next.js Edge middleware (alternative to `middleware.ts`) — cannot import `server-only` modules or `cookies()` from `next/headers`; use `request.cookies` and inline Edge-compatible code
- Winston: use `logger.info('message', { ...data })` not `logger.info({ ...data })` — the latter nests payload under `message` key
- Base UI Button with `render={<Link>}`: must set `nativeButton={false}` to avoid console warnings
- `tsx prisma/seed.ts` doesn't auto-load `.env.local` — seed script needs `import 'dotenv/config'`
- After editing `proxy.ts`, delete `.next/` cache for changes to take effect in dev
- Prisma v7 AI safety gate: `prisma migrate reset` and other destructive commands fail when invoked by AI agents. Must set `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` env var with the user's exact consent message. Always ask the user first.
