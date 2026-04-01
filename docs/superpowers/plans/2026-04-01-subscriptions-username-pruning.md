# Subscription Periods, Username Login & Receipt Pruning — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add subscription period tracking with "Completed" status, replace email login with username, and prune pre-subscription receipt data.

**Architecture:** New `SubscriptionPeriod` and `MagazineSubscription` models track yearly EBSCO subscriptions. A global PeriodSelector (cookie-persisted, like BranchSelector) scopes the entire app. Status logic gains `completed` and `not_subscribed` states. User model swaps `email` for `username`.

**Tech Stack:** Next.js App Router, Prisma v7 + SQLite, TypeScript strict, Tailwind + shadcn/ui, Zod, date-fns, Winston audit logging

**Spec:** `docs/superpowers/specs/2026-04-01-subscriptions-username-pruning-design.md`

**No test framework exists.** Verify each task via `npx tsc --noEmit` (type-check) and manual testing on dev server (`npm run dev`).

**IMPORTANT conventions (from CLAUDE.md):**
- TypeScript strict, zero `any`
- TSDoc on every export in `lib/` and `types/`
- `verifySessionForApi()` in API routes (never `verifySession()`)
- Zod `.safeParse()` for all API input
- `withRetry()` from `lib/db-retry.ts` for all DB writes
- Audit log with human-readable names (never cuids)
- Store dates at noon UTC to prevent timezone day-shift
- No Co-Authored-By in commits; keep messages short

---

## File Map

### New Files
| File | Responsibility |
|------|---------------|
| `lib/period.ts` | Period cookie helper: `resolveActivePeriodId()`, `getSubscriptionPeriods()` |
| `components/PeriodSelector.tsx` | Client component: period dropdown with cookie persistence |
| `app/(dashboard)/admin/subscriptions/page.tsx` | Admin page: list/create subscription periods |
| `app/(dashboard)/admin/subscriptions/[id]/page.tsx` | Admin page: manage magazine subscriptions within a period |
| `app/api/subscription-periods/route.ts` | GET list, POST create period |
| `app/api/subscription-periods/[id]/route.ts` | GET detail, PUT update period |
| `app/api/subscription-periods/[id]/subscriptions/route.ts` | GET/POST magazine subscriptions for a period |
| `app/api/subscription-periods/[id]/subscriptions/[subId]/route.ts` | PUT update subscription (issuesPerYear, active) |

### Modified Files
| File | Changes |
|------|---------|
| `prisma/schema.prisma` | Add SubscriptionPeriod, MagazineSubscription models; User: email→username |
| `types/index.ts` | Add new types, update MagazineStatus, AuthUser.email→username |
| `lib/validations.ts` | Add username, subscription period, magazine subscription schemas |
| `lib/cadence.ts` | Add subscription-aware status resolution |
| `lib/dal.ts` | Update getUser() to return username instead of email |
| `lib/reports.ts` | Add periodId filtering to report queries |
| `lib/logger.ts` | Add new audit action types (no code change needed if using string literals) |
| `components/Sidebar.tsx` | Add PeriodSelector above BranchSelector, add Subscriptions admin nav item |
| `components/MagazineStatusBadge.tsx` | Add completed + not_subscribed badge styles |
| `components/MagazineDetailActions.tsx` | Add completion warning on mark-received |
| `components/LoginForm.tsx` | Email→username input |
| `app/(dashboard)/layout.tsx` | Resolve period + pass to Sidebar |
| `app/(dashboard)/dashboard/page.tsx` | Period-scoped queries, progress bar, exclude completed/never_received |
| `app/(dashboard)/magazines/page.tsx` | Add completed/not_subscribed to status filter |
| `app/(dashboard)/magazines/[id]/page.tsx` | received/expected display, paginated receipts |
| `app/(dashboard)/admin/users/page.tsx` | Email→username column |
| `app/(dashboard)/admin/magazines/page.tsx` | Period-scoped view |
| `app/(dashboard)/admin/reports/page.tsx` | Period-aware report filtering |
| `app/api/auth/login/route.ts` | Find user by username |
| `app/api/users/route.ts` | Create user with username |
| `app/api/users/[id]/route.ts` | Update user audit logging |
| `prisma/seed.ts` | Username admin, subscription period, MagazineSubscriptions, pruned receipts |
| `prisma/extract-receipts.py` | Add date filter >= 2025-06-01 |

---

## Task 1: Schema Migration

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add SubscriptionPeriod and MagazineSubscription models**

Add to `prisma/schema.prisma` after the Transfer model:

```prisma
model SubscriptionPeriod {
  id            String                 @id @default(cuid())
  name          String                 @unique
  startDate     DateTime
  endDate       DateTime
  active        Boolean                @default(true)
  createdAt     DateTime               @default(now())
  subscriptions MagazineSubscription[]
}

model MagazineSubscription {
  id            String             @id @default(cuid())
  magazine      Magazine           @relation(fields: [magazineId], references: [id])
  magazineId    String
  period        SubscriptionPeriod @relation(fields: [periodId], references: [id])
  periodId      String
  issuesPerYear Int
  active        Boolean            @default(true)
  createdAt     DateTime           @default(now())

  @@unique([magazineId, periodId])
}
```

Add `subscriptions MagazineSubscription[]` relation to the existing `Magazine` model.

- [ ] **Step 2: Replace email with username on User model**

In the `User` model, change:
```prisma
// FROM:
email        String         @unique
// TO:
username     String         @unique
```

- [ ] **Step 3: Generate migration**

Run: `npx prisma migrate dev --name add-subscriptions-and-username`

This will fail on existing data if dev.db exists. For dev, delete and recreate:
```bash
rm -f prisma/dev.db prisma/dev.db-journal prisma/dev.db-wal
npx prisma migrate dev --name add-subscriptions-and-username
```

- [ ] **Step 4: Regenerate Prisma client**

Run: `npx prisma generate`

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "schema: add SubscriptionPeriod, MagazineSubscription; replace email with username"
```

---

## Task 2: Types & Validation Schemas

**Files:**
- Modify: `types/index.ts`
- Modify: `lib/validations.ts`

- [ ] **Step 1: Update types/index.ts**

Add new types and update existing ones:

1. Update `MagazineStatus`:
```ts
export type MagazineStatus = 'completed' | 'overdue' | 'this_week' | 'upcoming' | 'never_received' | 'not_subscribed'
```

2. Update `DashboardStatus` (stays the same — dashboard only shows overdue + this_week).

3. Update `AuthUser` — change `email` to `username`:
```ts
export interface AuthUser {
  id: string
  name: string
  username: string  // was: email
  role: UserRole
  active: boolean
}
```

Also update `AdminUser` interface — change `email: string` to `username: string`.

4. Add new interfaces:
```ts
/** A subscription period representing an EBSCO billing cycle */
export interface SubscriptionPeriod {
  id: string
  name: string
  startDate: Date | string
  endDate: Date | string
  active: boolean
  createdAt: Date | string
}

/** A magazine's subscription within a period */
export interface MagazineSubscription {
  id: string
  magazineId: string
  periodId: string
  issuesPerYear: number
  active: boolean
  createdAt: Date | string
}

/** MagazineSubscription with related magazine data for admin views */
export interface MagazineSubscriptionWithDetails extends MagazineSubscription {
  magazine: { id: string; name: string; cadence: CadenceType; language: string; active: boolean }
}

/** Extended magazine status info including subscription data */
export interface MagazineWithSubscriptionStatus extends MagazineWithStatus {
  receivedCount: number
  issuesPerYear: number | null
}
```

5. Add new audit action strings to `AuditAction` union (existing pattern is plain string union — detail fields are passed as the third arg to `auditLog()`):
```ts
| 'PERIOD_CREATED'
| 'PERIOD_UPDATED'
| 'SUBSCRIPTION_CREATED'
| 'SUBSCRIPTION_UPDATED'
| 'SUBSCRIPTION_DEACTIVATED'
| 'SUBSCRIPTIONS_BULK_COPIED'
```

6. Add `periodId` to `ReportFilters`:
```ts
export interface ReportFilters {
  // ... existing fields
  periodId?: string  // optional, sets default from/to from period dates
}
```

- [ ] **Step 2: Update lib/validations.ts**

Add new schemas:

```ts
/** Username: 1-20 English letters only */
export const usernameSchema = z.string().regex(/^[A-Za-z]+$/, 'Only letters A-Z allowed').min(1, 'Username required').max(20, 'Max 20 characters')

/** Schema for creating a subscription period */
export const createSubscriptionPeriodSchema = z.object({
  name: z.string().min(1, 'Name required').max(50),
  startDate: dateStringSchema,
  endDate: dateStringSchema,
})

/** Schema for creating a magazine subscription within a period */
export const createMagazineSubscriptionSchema = z.object({
  magazineId: z.string().min(1),
  issuesPerYear: z.coerce.number().int().min(1).max(365),
})

/** Schema for updating a magazine subscription */
export const updateMagazineSubscriptionSchema = z.object({
  issuesPerYear: z.coerce.number().int().min(1).max(365).optional(),
  active: z.boolean().optional(),
})

/** Schema for updating a subscription period */
export const updateSubscriptionPeriodSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  startDate: dateStringSchema.optional(),
  endDate: dateStringSchema.optional(),
  active: z.boolean().optional(),
})
```

Note: There is no `createUserSchema` in the codebase — `app/api/users/route.ts` does inline validation. Update the inline checks in that route to use `usernameSchema` (Task 3 Step 4).

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`

This WILL fail because many files still reference `email`. That's expected — we'll fix them in subsequent tasks. The goal here is to get the types defined correctly.

- [ ] **Step 4: Commit**

```bash
git add types/index.ts lib/validations.ts
git commit -m "feat: add subscription types, username schema, update MagazineStatus"
```

---

## Task 3: Username Login

**Files:**
- Modify: `components/LoginForm.tsx`
- Modify: `app/api/auth/login/route.ts`
- Modify: `app/api/users/route.ts` (both GET select and POST body)
- Modify: `app/api/users/[id]/route.ts` (GET/DELETE select `email` → `username`)
- Modify: `app/api/users/profile/route.ts` (select `email` → `username`)
- Modify: `lib/dal.ts`
- Modify: `app/(dashboard)/admin/users/page.tsx`
- Modify: `app/(dashboard)/profile/page.tsx`
- Modify: `components/AdminUsersClient.tsx`
- Modify: `components/ProfileClient.tsx`

- [ ] **Step 1: Update lib/dal.ts — getUser() returns username**

In `getUser()`, change the Prisma select from `email: true` to `username: true`. Update the return type to match the new `AuthUser` interface.

- [ ] **Step 2: Update login route — find by username**

In `app/api/auth/login/route.ts`:
- Extract `username` (not `email`) from request body
- Validate with Zod: `z.object({ username: usernameSchema, password: z.string().min(1) }).safeParse(body)`
- Normalize: `username.trim().toLowerCase()`
- `db.user.findUnique({ where: { username } })`
- Audit log: `auditLog(user.id, 'LOGIN', { username: user.username })`

- [ ] **Step 3: Update LoginForm.tsx — email input to username**

- Change input type from `email` to `text`
- Change label from "Email" to "Username"
- Change placeholder to "Enter username"
- Change state variable from `email` to `username`
- Change POST body from `{ email, password }` to `{ username, password }`

- [ ] **Step 4: Update user creation — app/api/users/route.ts**

- Accept `username` instead of `email` in POST body (both GET select and POST creation)
- Validate username with `usernameSchema` in the POST handler
- `db.user.create({ data: { name, username: username.toLowerCase(), passwordHash, role } })`
- Check for duplicate: 409 if username exists
- Audit log: `{ username: username }` instead of `{ email }`

- [ ] **Step 5: Update admin users page**

In `app/(dashboard)/admin/users/page.tsx`:
- Table header: "Email" → "Username"
- Table cell: `user.email` → `user.username`
- Search: search by name or username

Update `AdminUsersClient.tsx` if it references email.

- [ ] **Step 6: Update profile page**

In `app/(dashboard)/profile/page.tsx`: display `user.username` where `user.email` was shown.

- [ ] **Step 7: Search for remaining email references**

Run: `grep -r "\.email" --include="*.ts" --include="*.tsx" app/ lib/ components/ types/`

Fix any remaining references to `user.email` or `email` fields on the User model.

- [ ] **Step 8: Type-check and verify**

Run: `npx tsc --noEmit`
Fix any type errors. Then start dev server and test login flow manually.

- [ ] **Step 9: Commit**

```bash
git add components/LoginForm.tsx app/api/auth/login/route.ts app/api/users/route.ts app/api/users/[id]/route.ts app/api/users/profile/route.ts lib/dal.ts app/\(dashboard\)/admin/users/page.tsx app/\(dashboard\)/profile/page.tsx components/AdminUsersClient.tsx components/ProfileClient.tsx
git commit -m "feat: replace email login with username"
```

---

## Task 4: Period Helper & Selector

**Files:**
- Create: `lib/period.ts`
- Create: `components/PeriodSelector.tsx`
- Modify: `app/(dashboard)/layout.tsx`
- Modify: `components/Sidebar.tsx`

- [ ] **Step 1: Create lib/period.ts**

Mirror the pattern from `lib/branch.ts`:

```ts
import { cookies } from 'next/headers'
import db from './db'
import type { SubscriptionPeriod } from '@/types'

const PERIOD_COOKIE = 'epl-active-period'

/** Reads the active period ID from the cookie. Returns null if not set. */
export async function getActivePeriodId(): Promise<string | null> {
  const cookieStore = await cookies()
  return cookieStore.get(PERIOD_COOKIE)?.value ?? null
}

/** Returns all subscription periods ordered by startDate descending. */
export async function getSubscriptionPeriods(): Promise<SubscriptionPeriod[]> {
  const periods = await db.subscriptionPeriod.findMany({
    orderBy: { startDate: 'desc' },
    select: { id: true, name: true, startDate: true, endDate: true, active: true, createdAt: true },
  })
  return periods as SubscriptionPeriod[]
}

/**
 * Resolves the active period. If cookie is set and valid, returns that period ID.
 * Falls back to the period with active=true, then the most recent period.
 */
export async function resolveActivePeriodId(): Promise<string> {
  const cookiePeriodId = await getActivePeriodId()

  if (cookiePeriodId) {
    const period = await db.subscriptionPeriod.findUnique({
      where: { id: cookiePeriodId },
      select: { id: true },
    })
    if (period) return period.id
  }

  const fallback = await db.subscriptionPeriod.findFirst({
    where: { active: true },
    select: { id: true },
  }) ?? await db.subscriptionPeriod.findFirst({
    orderBy: { startDate: 'desc' },
    select: { id: true },
  })

  if (!fallback) throw new Error('No subscription periods in database')
  return fallback.id
}

/**
 * Resolves the full active period record (needed for date range filtering).
 */
export async function resolveActivePeriod(): Promise<SubscriptionPeriod> {
  const periodId = await resolveActivePeriodId()
  const period = await db.subscriptionPeriod.findUniqueOrThrow({
    where: { id: periodId },
    select: { id: true, name: true, startDate: true, endDate: true, active: true, createdAt: true },
  })
  return period as SubscriptionPeriod
}

export { PERIOD_COOKIE }
```

- [ ] **Step 2: Create components/PeriodSelector.tsx**

Mirror BranchSelector pattern:

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { CalendarRange } from 'lucide-react'
import type { SubscriptionPeriod } from '@/types'

export interface PeriodSelectorProps {
  periods: SubscriptionPeriod[]
  activePeriodId: string
}

/** Dropdown for selecting the active subscription period. Sets a cookie and refreshes. */
export default function PeriodSelector({ periods, activePeriodId }: PeriodSelectorProps) {
  const router = useRouter()

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const periodId = e.target.value
    document.cookie = `epl-active-period=${periodId};path=/;max-age=${365 * 24 * 60 * 60};SameSite=Lax`
    router.refresh()
  }

  const activePeriod = periods.find(p => p.id === activePeriodId)

  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-2 mb-1.5">
        <CalendarRange size={12} style={{ color: 'oklch(0.65 0.06 156)' }} />
        <span
          className="text-[10px] font-semibold uppercase tracking-widest"
          style={{ color: 'oklch(0.55 0.04 158)' }}
        >
          Subscription
        </span>
      </div>
      <select
        value={activePeriodId}
        onChange={handleChange}
        className="w-full rounded-md border-0 text-sm font-medium py-1.5 px-2 cursor-pointer focus:outline-none focus:ring-2"
        style={{
          backgroundColor: 'oklch(0.28 0.05 158)',
          color: 'oklch(0.90 0.02 158)',
        }}
        title={`Current period: ${activePeriod?.name ?? 'Unknown'}`}
      >
        {periods.map(period => (
          <option key={period.id} value={period.id}>
            {period.name}
          </option>
        ))}
      </select>
    </div>
  )
}
```

- [ ] **Step 3: Update Sidebar.tsx — add PeriodSelector above BranchSelector**

Import PeriodSelector and add new props to SidebarProps:

```ts
import PeriodSelector from './PeriodSelector'
import type { AuthUser, Branch, SubscriptionPeriod } from '@/types'

export interface SidebarProps {
  user: AuthUser
  branches: Branch[]
  activeBranchId: string
  periods: SubscriptionPeriod[]       // NEW
  activePeriodId: string              // NEW
  defaultCollapsed?: boolean
}
```

Add admin nav item for Subscriptions:

```ts
const adminItems: NavItem[] = [
  { href: '/admin/subscriptions', label: 'Subscriptions', icon: CalendarRange },  // NEW — add import
  { href: '/admin/magazines', label: 'Manage Magazines', icon: BookMarked },
  // ... rest unchanged
]
```

In the bottom section, add PeriodSelector above BranchSelector:

```tsx
{!collapsed && (
  <div className="border-t mt-auto" style={{ borderColor: 'oklch(0.30 0.04 158)' }}>
    <PeriodSelector periods={periods} activePeriodId={activePeriodId} />
    <BranchSelector branches={branches} activeBranchId={activeBranchId} />
  </div>
)}
```

- [ ] **Step 4: Update dashboard layout — resolve period**

In `app/(dashboard)/layout.tsx`, import and resolve the period:

```ts
import { getSubscriptionPeriods, resolveActivePeriodId } from '@/lib/period'

export default async function DashboardLayout({ children }: LayoutProps) {
  const [user, branches, activeBranchId, periods, activePeriodId, cookieStore] = await Promise.all([
    getUser(),
    getActiveBranches(),
    resolveActiveBranchId(),
    getSubscriptionPeriods(),
    resolveActivePeriodId(),
    cookies(),
  ])

  // ... pass periods and activePeriodId to Sidebar
  <Sidebar
    user={user}
    branches={branches}
    activeBranchId={activeBranchId}
    periods={periods}
    activePeriodId={activePeriodId}
    defaultCollapsed={sidebarCollapsed}
  />
```

- [ ] **Step 5: Type-check and verify**

Run: `npx tsc --noEmit`
Start dev server, verify PeriodSelector renders in sidebar (will need seed data — Task 10 adds it, but for now just verify no crashes).

- [ ] **Step 6: Commit**

```bash
git add lib/period.ts components/PeriodSelector.tsx components/Sidebar.tsx app/\(dashboard\)/layout.tsx
git commit -m "feat: add PeriodSelector with cookie persistence"
```

---

## Task 5: Seed Updates (needed before UI tasks for testing)

**Files:**
- Modify: `prisma/seed.ts`
- Modify: `prisma/extract-receipts.py`
- Modify: `prisma/seed-receipts.json` (regenerated)

- [ ] **Step 1: Update extract-receipts.py — filter dates**

Add a date filter near the output step to exclude receipts before 2025-06-01:

```python
# After building the receipts list, filter:
from datetime import date as date_type
SUBSCRIPTION_START = date_type(2025, 6, 1)
receipts = [r for r in receipts if r['date'] >= SUBSCRIPTION_START.isoformat()]
```

- [ ] **Step 2: Regenerate seed-receipts.json**

Run: `cd prisma && python3 extract-receipts.py`

Verify the output only contains dates >= 2025-06-01.

- [ ] **Step 3: Update seed.ts — admin user with username**

Change admin user creation:
```ts
// FROM:
const admin = await prisma.user.create({
  data: {
    name: 'Magazine Admin',
    email: 'magapp@edisonpubliclibrary.org',
    passwordHash: await hash('magTech', 10),
    role: 'ADMIN',
  },
})

// TO:
const admin = await prisma.user.create({
  data: {
    name: 'Magazine Admin',
    username: 'magadmin',
    passwordHash: await hash('magTech', 10),
    role: 'ADMIN',
  },
})
```

- [ ] **Step 4: Add subscription period to seed**

After creating magazines, create the subscription period and MagazineSubscriptions:

```ts
// Create 2025-2026 subscription period
const period = await prisma.subscriptionPeriod.create({
  data: {
    name: '2025-2026',
    startDate: new Date('2025-06-01T12:00:00Z'),
    endDate: new Date('2026-05-31T12:00:00Z'),
    active: true,
  },
})
```

- [ ] **Step 5: Add EBSCO issuesPerYear data to seed**

Create a lookup map of magazine name → issuesPerYear from the EBSCO invoice data (see spec section 9 for the full table). For each magazine created in the seed, create a MagazineSubscription:

```ts
// EBSCO invoice data — issues per year
const EBSCO_ISSUES: Record<string, number> = {
  'AARP Bulletin': 10,
  'AARP the Magazine': 6,
  // ... full list from spec section 9
}

// Cadence-based fallback
const CADENCE_FALLBACK: Record<string, number> = {
  WEEKLY: 52, BI_WEEKLY: 26, MONTHLY: 12,
  BI_MONTHLY: 6, SEASONAL: 4, YEARLY: 1,
}

// For each magazine, create subscription
for (const mag of createdMagazines) {
  const issuesPerYear = EBSCO_ISSUES[mag.name] ?? CADENCE_FALLBACK[mag.cadence]
  await prisma.magazineSubscription.create({
    data: {
      magazineId: mag.id,
      periodId: period.id,
      issuesPerYear,
    },
  })
}
```

**IMPORTANT**: The magazine names in `EBSCO_ISSUES` must exactly match the names in the seed's `MAGAZINES` array. Cross-reference with the spec's table. For any mismatches, use the seed name (it's canonical).

- [ ] **Step 6: Re-seed the database**

```bash
rm -f prisma/dev.db prisma/dev.db-journal prisma/dev.db-wal
npx prisma migrate dev
npm run seed
```

Verify via `npx prisma studio` that:
- Admin user has `username: 'magadmin'`, no email field
- SubscriptionPeriod "2025-2026" exists with active=true
- MagazineSubscriptions exist for all magazines with correct issuesPerYear
- Receipts only contain dates >= 2025-06-01

- [ ] **Step 7: Commit**

```bash
git add prisma/seed.ts prisma/extract-receipts.py prisma/seed-receipts.json
git commit -m "feat: update seed with username, subscription periods, and pruned receipts"
```

---

## Task 6: Subscription-Aware Status Logic

**Files:**
- Modify: `lib/cadence.ts`
- Modify: `components/MagazineStatusBadge.tsx`

- [ ] **Step 1: Add subscription-aware status function to lib/cadence.ts**

Keep existing functions intact (they're still used as building blocks). Add a new function:

```ts
import type { MagazineStatus, CadenceType } from '@/types'

/**
 * Resolves magazine status considering subscription data.
 * Priority: not_subscribed > completed > never_received > cadence-based status.
 *
 * @param lastReceivedDate - Most recent receipt date at the branch within the period
 * @param cadence - Magazine's publication cadence
 * @param receivedCount - Total receipts at the branch within the period's date range
 * @param issuesPerYear - Expected issues from MagazineSubscription (null if not subscribed)
 * @param periodStartDate - The subscription period's start date (used as initial anchor)
 */
export function getSubscriptionAwareStatus(
  lastReceivedDate: Date | string | null,
  cadence: CadenceType,
  receivedCount: number,
  issuesPerYear: number | null,
  periodStartDate: Date | string,
): MagazineStatus {
  // No subscription for this period
  if (issuesPerYear === null) return 'not_subscribed'

  // All expected issues received
  if (receivedCount >= issuesPerYear) return 'completed'

  // Zero receipts — check if any expected date has passed
  if (receivedCount === 0) {
    const firstExpected = computeNextExpectedDate(periodStartDate, cadence)
    if (firstExpected && isOverdue(firstExpected)) return 'never_received'
    if (firstExpected && isExpectedThisWeek(firstExpected)) return 'this_week'
    return 'upcoming'
  }

  // Has some receipts — use cadence from last receipt
  return getMagazineStatus(lastReceivedDate, cadence)
}
```

- [ ] **Step 2: Update MagazineStatusBadge.tsx — add new status styles**

Add entries for `completed` and `not_subscribed`:

```ts
// completed: green with checkmark
completed: {
  label: 'Completed',
  bg: 'oklch(0.92 0.05 155)',
  text: 'oklch(0.30 0.08 155)',
}

// not_subscribed: light gray, muted
not_subscribed: {
  label: 'Not Subscribed',
  bg: 'oklch(0.93 0.005 88)',
  text: 'oklch(0.50 0.015 88)',
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add lib/cadence.ts components/MagazineStatusBadge.tsx
git commit -m "feat: add subscription-aware status logic and badge styles"
```

---

## Task 6: Dashboard — Period-Scoped with Progress Bar

**Files:**
- Modify: `app/(dashboard)/dashboard/page.tsx`

- [ ] **Step 1: Update dashboard queries to be period-scoped**

Import period resolution:
```ts
import { resolveActivePeriod } from '@/lib/period'
import { getSubscriptionAwareStatus } from '@/lib/cadence'  // new import
```

At the top of the component, resolve the period alongside the branch:
```ts
const [activeBranchId, activePeriod] = await Promise.all([
  resolveActiveBranchId(),
  resolveActivePeriod(),
])
```

For each magazine, query receipts scoped to the period's date range:
```ts
where: {
  branchId: activeBranchId,
  receivedDate: {
    gte: new Date(activePeriod.startDate),
    lte: new Date(activePeriod.endDate),
  },
}
```

Also query the MagazineSubscription for each magazine:
```ts
const subscription = await db.magazineSubscription.findUnique({
  where: { magazineId_periodId: { magazineId: mag.id, periodId: activePeriod.id } },
  select: { issuesPerYear: true, active: true },
})
```

Use `getSubscriptionAwareStatus()` instead of `getMagazineStatus()`.

- [ ] **Step 2: Filter dashboard to overdue + this_week only**

Keep the existing filter logic: only show magazines with status `overdue` or `this_week`. The new statuses (`completed`, `never_received`, `not_subscribed`) are excluded from the dashboard.

- [ ] **Step 3: Add progress bar**

At the top of the dashboard, before the magazine sections, add:

```tsx
{/* Progress bar */}
<div className="mb-6 rounded-xl border p-4" style={{ borderColor: 'oklch(0.876 0.016 88)', backgroundColor: 'oklch(0.978 0.009 88)' }}>
  <div className="flex items-center justify-between mb-2">
    <span className="text-sm font-medium" style={{ color: 'oklch(0.30 0.028 62)' }}>
      Subscription Progress — {activePeriod.name}
    </span>
    <span className="text-sm font-bold" style={{ color: 'oklch(0.38 0.082 156)' }}>
      {completedCount}/{totalSubscribed}
    </span>
  </div>
  <div className="w-full h-2 rounded-full" style={{ backgroundColor: 'oklch(0.90 0.012 88)' }}>
    <div
      className="h-2 rounded-full transition-all"
      style={{
        width: `${totalSubscribed > 0 ? (completedCount / totalSubscribed) * 100 : 0}%`,
        backgroundColor: 'oklch(0.38 0.082 156)',
      }}
    />
  </div>
</div>
```

Compute `completedCount` and `totalSubscribed` from the magazine status results (count of `completed` and total active subscriptions at this branch).

- [ ] **Step 4: Type-check and verify**

Run: `npx tsc --noEmit`
Verify on dev server (needs seed data from Task 10).

- [ ] **Step 5: Commit**

```bash
git add app/\(dashboard\)/dashboard/page.tsx
git commit -m "feat: period-scoped dashboard with progress bar"
```

---

## Task 7: Magazine Detail — Received/Expected & Paginated Receipts

**Files:**
- Modify: `app/(dashboard)/magazines/[id]/page.tsx`
- Modify: `components/MagazineDetailActions.tsx`

- [ ] **Step 1: Update magazine detail queries — period-scoped**

Import period resolution. Query receipts scoped to the period date range for the `received/expected` count. Also query the total (unpaginated) count and the MagazineSubscription.

```ts
const activePeriod = await resolveActivePeriod()

// Count receipts in this period at this branch
const periodReceiptCount = await db.issueReceipt.count({
  where: {
    magazineId: id,
    branchId: activeBranchId,
    receivedDate: {
      gte: new Date(activePeriod.startDate),
      lte: new Date(activePeriod.endDate),
    },
  },
})

// Get subscription for this period
const subscription = await db.magazineSubscription.findUnique({
  where: { magazineId_periodId: { magazineId: id, periodId: activePeriod.id } },
  select: { issuesPerYear: true, active: true },
})
```

- [ ] **Step 2: Update "Issues at Branch" display**

Change the stat from showing `magazine.receipts.length` to `received/expected`:

```tsx
<p className="text-2xl font-bold" style={{ fontFamily: 'var(--font-playfair)', color: 'oklch(0.15 0.028 62)' }}>
  {periodReceiptCount}
  {subscription?.active && (
    <span className="text-base font-normal" style={{ color: 'oklch(0.55 0.030 72)' }}>
      /{subscription.issuesPerYear}
    </span>
  )}
</p>
```

- [ ] **Step 3: Use subscription-aware status**

Replace `getMagazineStatus()` with `getSubscriptionAwareStatus()` for the status badge.

- [ ] **Step 4: Paginate receipt history**

Add pagination with `PAGE_SIZE = 10`. Accept `page` search param:

```ts
interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ page?: string }>
}
```

Query receipts with pagination, scoped to the period:

```ts
const page = Math.max(1, parseInt(searchParamsResolved.page ?? '1', 10) || 1)
const PAGE_SIZE = 10

const [receipts, totalReceipts] = await Promise.all([
  db.issueReceipt.findMany({
    where: {
      magazineId: id,
      branchId: activeBranchId,
      receivedDate: {
        gte: new Date(activePeriod.startDate),
        lte: new Date(activePeriod.endDate),
      },
    },
    orderBy: { receivedDate: 'desc' },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    include: {
      receivedBy: { select: { id: true, name: true } },
      branch: { select: { name: true, code: true } },
    },
  }),
  db.issueReceipt.count({
    where: {
      magazineId: id,
      branchId: activeBranchId,
      receivedDate: {
        gte: new Date(activePeriod.startDate),
        lte: new Date(activePeriod.endDate),
      },
    },
  }),
])
```

Add pagination controls below the table (match the pattern from `/magazines` list page).

- [ ] **Step 5: Add completion warning to MagazineDetailActions**

In `MagazineDetailActions.tsx`, add props for `receivedCount` and `issuesPerYear`. When `receivedCount >= issuesPerYear`, show a warning message before the confirm dialog:

```tsx
{isCompleted && (
  <div className="rounded-md p-3 mb-4 text-sm" style={{ backgroundColor: 'oklch(0.95 0.06 85 / 0.3)', color: 'oklch(0.35 0.06 85)' }}>
    All expected issues for this period have been received. Is this an extra or replacement copy?
  </div>
)}
```

- [ ] **Step 6: Type-check and verify**

Run: `npx tsc --noEmit`

- [ ] **Step 7: Commit**

```bash
git add app/\(dashboard\)/magazines/\[id\]/page.tsx components/MagazineDetailActions.tsx
git commit -m "feat: period-scoped magazine detail with received/expected and paginated receipts"
```

---

## Task 8: Magazine List — Updated Status Filters

**Files:**
- Modify: `app/(dashboard)/magazines/page.tsx`
- Modify: `components/MagazinesClientControls.tsx` (if the status filter lives here)

- [ ] **Step 1: Update status computation to be subscription-aware**

Import `resolveActivePeriod` and `getSubscriptionAwareStatus`. For each magazine in the list, query:
- Receipt count within the period date range for the active branch
- MagazineSubscription for the period

Use `getSubscriptionAwareStatus()` to compute status.

- [ ] **Step 2: Add completed and not_subscribed to status filter options**

Update the status filter dropdown to include:
- All, Overdue, Expected This Week, Upcoming, Completed, Never Received, Not Subscribed

- [ ] **Step 3: Type-check and verify**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add app/\(dashboard\)/magazines/page.tsx components/MagazinesClientControls.tsx
git commit -m "feat: subscription-aware status filters on magazine list"
```

---

## Task 9: Subscription Period API Routes

**Files:**
- Create: `app/api/subscription-periods/route.ts`
- Create: `app/api/subscription-periods/[id]/route.ts`
- Create: `app/api/subscription-periods/[id]/subscriptions/route.ts`
- Create: `app/api/subscription-periods/[id]/subscriptions/[subId]/route.ts`

- [ ] **Step 1: GET/POST subscription periods — app/api/subscription-periods/route.ts**

```ts
// GET: list all periods (any authenticated user)
// POST: create new period (ADMIN only)
//   - Validate with createSubscriptionPeriodSchema
//   - Normalize dates to noon UTC (e.g., new Date('2025-06-01T12:00:00Z')) to prevent timezone day-shift
//   - Check date ranges don't overlap with existing periods (query for any period where startDate < newEnd AND endDate > newStart)
//   - Set active=false on previously active period
//   - Create new period with active=true
//   - Bulk-copy all active MagazineSubscriptions from previous period
//   - Audit log: PERIOD_CREATED + SUBSCRIPTIONS_BULK_COPIED
//   - Use withRetry() for all writes
```

Key logic for the bulk-copy:
```ts
const previousPeriod = await db.subscriptionPeriod.findFirst({
  where: { active: true },
  include: { subscriptions: { where: { active: true } } },
})

// In a transaction:
await withRetry(() => db.$transaction(async (tx) => {
  if (previousPeriod) {
    await tx.subscriptionPeriod.update({
      where: { id: previousPeriod.id },
      data: { active: false },
    })
  }

  const newPeriod = await tx.subscriptionPeriod.create({ data: { name, startDate, endDate } })

  if (previousPeriod?.subscriptions.length) {
    await tx.magazineSubscription.createMany({
      data: previousPeriod.subscriptions.map(sub => ({
        magazineId: sub.magazineId,
        periodId: newPeriod.id,
        issuesPerYear: sub.issuesPerYear,
      })),
    })
  }

  return newPeriod
}))
```

- [ ] **Step 2: GET/PUT single period — app/api/subscription-periods/[id]/route.ts**

- GET: return period with subscription count
- PUT: update period fields (ADMIN only), validate with `updateSubscriptionPeriodSchema`
- Audit log: PERIOD_UPDATED

- [ ] **Step 3: GET/POST magazine subscriptions — app/api/subscription-periods/[id]/subscriptions/route.ts**

- GET: list all MagazineSubscriptions for this period (with magazine details)
- POST: add a magazine subscription (ADMIN only), validate with `createMagazineSubscriptionSchema`
- Audit log: SUBSCRIPTION_CREATED

- [ ] **Step 4: PUT single subscription — app/api/subscription-periods/[id]/subscriptions/[subId]/route.ts**

- PUT: update issuesPerYear or active flag (ADMIN only)
- Validate with `updateMagazineSubscriptionSchema`
- Audit log: SUBSCRIPTION_UPDATED or SUBSCRIPTION_DEACTIVATED

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add app/api/subscription-periods/
git commit -m "feat: add subscription period and magazine subscription API routes"
```

---

## Task 10: Admin Subscriptions Page

**Files:**
- Create: `app/(dashboard)/admin/subscriptions/page.tsx`
- Create: `app/(dashboard)/admin/subscriptions/[id]/page.tsx`

- [ ] **Step 1: Create subscription periods list page**

`app/(dashboard)/admin/subscriptions/page.tsx`:

- Server component, ADMIN only (check `verifySession()`)
- Query all subscription periods with `_count.subscriptions` (where active=true)
- Display as a table: Name, Start Date, End Date, Active badge, Magazine Count
- "Create New Period" button that opens a form/dialog
- Client component for the create form (POST to `/api/subscription-periods`)
- Include confirmation dialog: "This will start a new subscription period. All active magazine subscriptions from the previous period will be copied."

Match the styling patterns from existing admin pages (admin/users, admin/magazines).

- [ ] **Step 2: Create subscription period detail page**

`app/(dashboard)/admin/subscriptions/[id]/page.tsx`:

- Server component, ADMIN only
- Shows period info at the top (name, dates, active status)
- Table of MagazineSubscriptions: Magazine Name, Issues/Year, Active toggle, Edit button
- Search/filter by magazine name
- Pagination (PAGE_SIZE = 10)
- "Add Subscription" button for adding a new magazine to this period
- Edit issuesPerYear inline or via dialog
- Toggle active/inactive for deactivating dropped titles

- [ ] **Step 3: Type-check and verify**

Run: `npx tsc --noEmit`
Test on dev server: navigate to `/admin/subscriptions`, create period, manage subscriptions.

- [ ] **Step 4: Commit**

```bash
git add app/\(dashboard\)/admin/subscriptions/
git commit -m "feat: add admin subscription periods management pages"
```

---

## Task 11: Reports — Period-Scoped

**Files:**
- Modify: `lib/reports.ts`
- Modify: `app/(dashboard)/admin/reports/page.tsx` (or its client component)

- [ ] **Step 1: Update lib/reports.ts — accept periodId**

For each report function that uses date ranges (`getReceiptSummary`, `getReceiptTimeline`, `getTransferReport`), when a `periodId` is provided in `ReportFilters`, resolve the period's start/end dates and use them as the default `from`/`to`.

Update `getSubscriptionOverview()` to be period-aware: query MagazineSubscriptions for the given period, include receipt counts within the period date range, show `received/expected` per magazine.

- [ ] **Step 2: Update reports page — use global period**

Read the active period in the reports page server component and pass `periodId` to the report filters. The existing date preset filters continue to work as sub-filters within the period.

- [ ] **Step 3: Type-check and verify**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add lib/reports.ts app/\(dashboard\)/admin/reports/
git commit -m "feat: period-scoped reports with subscription overview"
```

---

## Task 12: Admin Magazines — Period-Scoped View

**Files:**
- Modify: `app/(dashboard)/admin/magazines/page.tsx`

- [ ] **Step 1: Add period context to admin magazines**

Import `resolveActivePeriod`. When the global PeriodSelector is active, show which magazines have active subscriptions for that period. This is informational — the page already manages BranchMagazine (branch subscriptions), now it also shows subscription status.

Consider adding a badge or column showing "Subscribed" / "Not Subscribed" for the selected period next to each magazine.

- [ ] **Step 2: Type-check and verify**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add app/\(dashboard\)/admin/magazines/
git commit -m "feat: period-scoped view on admin magazines page"
```

---

## Task 13: Final Verification & Cleanup

- [ ] **Step 1: Full type-check**

Run: `npx tsc --noEmit` — must pass with zero errors.

- [ ] **Step 2: Search for stale references**

```bash
grep -r "\.email" --include="*.ts" --include="*.tsx" app/ lib/ components/ types/ | grep -v node_modules | grep -v ".next"
grep -r "never_received" --include="*.ts" --include="*.tsx" app/ lib/ components/ types/
```

Ensure `email` references on User are gone. Ensure `never_received` is handled everywhere status is checked.

- [ ] **Step 3: Verify proxy.ts**

Ensure `proxy.ts` (Edge middleware) doesn't reference email. It shouldn't — it only checks session cookies.

- [ ] **Step 4: Delete .next cache and test**

```bash
rm -rf .next
npm run dev
```

Manual test checklist:
1. Login with `magadmin` / `magTech` — works
2. PeriodSelector visible in sidebar, shows "2025-2026"
3. BranchSelector still works
4. Dashboard shows progress bar with correct counts
5. Dashboard excludes completed and never_received magazines
6. Magazine detail shows `received/expected` format
7. Magazine detail receipt history is paginated
8. Status badges show correctly for all states
9. `/admin/subscriptions` — can view the period and its subscriptions
10. `/admin/users` — shows username column
11. Reports load without errors

- [ ] **Step 5: Commit any remaining fixes**

Stage only the specific files that were changed, then commit:
```bash
git commit -m "fix: cleanup stale references and final adjustments"
```
