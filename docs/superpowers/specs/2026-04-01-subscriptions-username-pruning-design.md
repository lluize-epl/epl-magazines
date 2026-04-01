# Subscription Periods, Username Login & Receipt Pruning

**Date**: 2026-04-01
**Status**: Draft
**Scope**: Schema migration (SubscriptionPeriod + MagazineSubscription models, email→username), subscription-aware status logic, admin workflow, receipt pruning, UI changes

---

## 1. Problem Statement

Three gaps in the current system:

1. **No way to track "Completed" magazines.** The cadence-based overdue logic flags magazines like Magnolia Journal (4 issues/year, all received) as overdue because it only looks at the last receipt date + cadence interval. There's no concept of "we received everything we're owed."

2. **Email login is tedious.** Staff must type `@edisonpubliclibrary.org` every time. A short username is faster.

3. **Pre-subscription receipt clutter.** The seed contains 11,743 receipts going back to December 2024. The EBSCO subscription coverage is June 2025–May 2026; earlier data confuses staff and pollutes reports.

---

## 2. Schema Changes

### 2.1 New Models

```prisma
model SubscriptionPeriod {
  id            String                 @id @default(cuid())
  name          String                 @unique  // "2025-2026"
  startDate     DateTime               // 2025-06-01
  endDate       DateTime               // 2026-05-31
  active        Boolean                @default(true)  // UI default period
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
  active        Boolean            @default(true)  // false = dropped from this period (treated as not_subscribed)
  createdAt     DateTime           @default(now())

  @@unique([magazineId, periodId])
}
```

**Magazine** gets a new relation field:
```prisma
model Magazine {
  // ... existing fields unchanged
  subscriptions MagazineSubscription[]
}
```

### 2.2 User Model — Email to Username

```prisma
model User {
  // REMOVE: email String @unique
  // ADD:
  username     String  @unique  // [A-Za-z]{1,20}
  // all other fields unchanged
}
```

### 2.3 Key Constraints

- `@@unique([magazineId, periodId])` — one subscription per magazine per period
- `SubscriptionPeriod.name` is unique — prevents duplicate period names
- `User.username` is unique — enforced at DB level
- `active` on SubscriptionPeriod is a **UI default flag**, not a lifecycle gate. Multiple periods can coexist; the active one is what the app defaults to on login.
- `active` on MagazineSubscription indicates whether the magazine is part of this period. Setting `active: false` means the title was dropped (treated as `not_subscribed` in status resolution). This preserves the record for audit/history rather than deleting it.

### 2.4 Coverage Dates

Coverage dates are derived from the parent `SubscriptionPeriod.startDate` / `endDate` — not stored per magazine. All titles in a period share the same coverage window (e.g., June 1 2025 – May 31 2026). This simplifies every query: receipt counting uses `period.startDate <= receivedDate <= period.endDate`.

### 2.5 Relationship: MagazineSubscription vs BranchMagazine

These are orthogonal:
- **MagazineSubscription** answers: "Is this magazine part of this subscription period, and how many issues should we expect?" It is global — not branch-specific.
- **BranchMagazine** answers: "Does this branch carry this magazine, and how many copies?" It is branch-specific.

Both must be true for a magazine to appear on the dashboard for a given branch + period. A magazine with an active `MagazineSubscription` for the period but no `BranchMagazine` entry for the branch does not appear at that branch. A magazine with a `BranchMagazine` entry but no subscription for the selected period shows as `not_subscribed`.

---

## 3. Subscription-Aware Status Logic

### 3.1 Status Types

```ts
type MagazineStatus = 'completed' | 'overdue' | 'this_week' | 'upcoming' | 'never_received' | 'not_subscribed'
```

### 3.2 Status Resolution (lib/cadence.ts)

For a given magazine + branch + subscription period:

1. Look up `MagazineSubscription` for this magazine and the selected period
2. If no subscription exists, or subscription `active = false` → **`not_subscribed`**
3. Count receipts at the active branch within `period.startDate–period.endDate`
4. If `receivedCount >= issuesPerYear` → **`completed`**
5. If `receivedCount === 0` and any expected date has passed → **`never_received`**
6. Otherwise, use existing cadence logic from last receipt date:
   - Next expected date has passed → **`overdue`**
   - Next expected date falls within this week → **`this_week`**
   - Next expected date is future → **`upcoming`**

**Initial anchor**: When `receivedCount === 0` and no expected dates have passed yet, the first expected date is derived from `period.startDate` + cadence interval. This ensures new-period magazines start with a meaningful `nextExpectedDate` from day one.

### 3.3 Dashboard Bucketing

| Status | Dashboard | Magazine List | Magazine Detail |
|--------|-----------|---------------|-----------------|
| `overdue` | Shows in "Overdue" section | Visible | Visible |
| `this_week` | Shows in "Expected This Week" | Visible | Visible |
| `upcoming` | Hidden | Visible | Visible |
| `completed` | Hidden | Visible | Visible (with badge) |
| `never_received` | Hidden | Visible | Visible |
| `not_subscribed` | Hidden | Hidden (unless filtered) | Visible |

**Dashboard progress bar** at top: *"87/124 complete for 2025-2026"* — count of completed vs total active subscriptions at the selected branch for the selected period.

---

## 4. Admin Workflow: Subscription Periods

### 4.1 New Admin Page: `/admin/subscriptions`

- **List view**: All periods with name, date range, active badge, count of active magazine subscriptions
- **Create New Period**: Form with name, startDate, endDate
  - On creation: set `active: false` on the previously active period, create new period with `active: true`
  - Bulk-copy all active MagazineSubscriptions from the previous period (same `issuesPerYear` values)
  - Admin then adjusts: deactivate dropped titles, add new ones, edit `issuesPerYear` where changed
- **Period detail view**: Manage MagazineSubscriptions within a period (edit `issuesPerYear`, toggle `active`, add new subscriptions)

### 4.2 Yearly Admin Flow

1. New EBSCO invoice arrives (April/May typically)
2. Admin creates new SubscriptionPeriod (e.g., "2026-2027", June 1 2026 – May 31 2027)
3. System auto-copies all active subscriptions from the previous period
4. Admin reviews: deactivates dropped titles, adds new ones, updates `issuesPerYear` where changed
5. Old period remains fully viewable — receipts, completion data, reports all preserved

### 4.3 Concurrent Periods

Creating a new period before the current one ends is expected. Both periods are fully functional — their date ranges must not overlap (validated on creation).
- Receipts are attributed by date: `receivedDate` is checked against each period's `startDate–endDate`. Since date ranges are sequential, a receipt maps to exactly one period.
- The global PeriodSelector lets staff switch between viewing either period
- New-period magazines start arriving while old-period stragglers are still being received

---

## 5. Global Period Selector

### 5.1 Placement

Above the BranchSelector in the sidebar/nav — same pattern as branch selection.

### 5.2 Behavior

- Dropdown listing all SubscriptionPeriods, ordered by startDate descending
- Defaults to the period with `active: true`
- Selection persisted in a cookie (`epl-active-period`)
- Scopes the entire app view: dashboard, magazine list, magazine detail, reports

### 5.3 Implementation

- `lib/period.ts` — `resolveActivePeriodId()`, `getActivePeriods()` (mirrors `lib/branch.ts` pattern)
- `components/PeriodSelector.tsx` — client component with cookie persistence
- All data queries updated to accept and filter by `periodId`

---

## 6. UI Changes

### 6.1 Dashboard (`/dashboard`)

- Progress bar at top: *"87/124 complete for 2025-2026"*
- "Overdue" and "Expected This Week" sections unchanged in structure
- Exclude `completed` and `never_received` magazines from both sections
- Magazine cards show `received/expected` count inline (e.g., "3/12")

### 6.2 Magazine Detail (`/magazines/[id]`)

- **"Issues at Branch"** stat changes from `7` → `7/12` (received count / issuesPerYear from selected period)
- **Status badge** reflects subscription-aware status, including new "Completed" badge
- **Receipt history table**: paginated (PAGE_SIZE = 10), filtered to selected period's coverage window by default
- **Completion warning**: When `received >= issuesPerYear` and staff clicks "Mark Received", show informational message: *"All expected issues for this period have been received. Is this an extra or replacement copy?"* — not blocking, just advisory.

### 6.3 Magazine List (`/magazines`)

- No `received/expected` display — keeps showing total deliveries as today
- Status filter updated: add `completed` and `not_subscribed` options

### 6.4 Admin Magazines (`/admin/magazines`)

- Period-scoped view (uses global PeriodSelector) so admin can see "what's subscribed in this period"

### 6.5 Reports (`/admin/reports`)

- The global PeriodSelector sets the default date range for reports (`period.startDate` to `period.endDate`)
- Existing report date presets (this_month, last_month, etc.) continue to work as further filters **within** the selected period
- `ReportFilters` type gains an optional `periodId` field; when present, `from`/`to` default to the period's date range
- The "Subscription Overview" report (already in `lib/reports.ts` as `getSubscriptionOverview`) should be updated to show `MagazineSubscription` data with `received/expected` counts per magazine for the selected period

### 6.6 Login Page

- Email input → username text input
- Label: "Username", placeholder: "Enter username"
- Validation: `[A-Za-z]{1,20}`

### 6.7 Admin Users (`/admin/users`)

- User table: "Email" column → "Username" column
- Create user form: email field → username field

---

## 7. Username Login

### 7.1 Auth Flow

Same two-step pattern, identifier changes:
1. **Step 1**: username + password (POST to `/api/auth/login`)
2. **Step 2**: Branch selection (unchanged)

### 7.2 Affected Code

| File | Change |
|------|--------|
| `components/LoginForm.tsx` | Email input → username text input |
| `app/api/auth/login/route.ts` | Find user by `username` (lowercase) instead of `email` |
| `lib/validations.ts` | Add `usernameSchema: z.string().regex(/^[A-Za-z]+$/).min(1).max(20)` |
| `app/api/users/route.ts` | User creation: `email` → `username` |
| `app/(dashboard)/admin/users/page.tsx` | Table column: email → username |
| `types/index.ts` | `AuthUser.email` → `AuthUser.username`; add `completed` + `not_subscribed` to `MagazineStatus` type |
| `lib/dal.ts` | `getUser()` returns `username` instead of `email` |
| Audit logging | Log `username` instead of `email` in login events |

### 7.3 Session

No change — JWT carries `userId` + `role` only. Username fetched from DB when needed via `getUser()`.

---

## 8. Receipt Pruning

### 8.1 Seed Data

- Remove all receipts from `seed-receipts.json` with dates before 2025-06-01
- Only current subscription cycle (2025-2026) data remains in the seed

### 8.2 Extract Script

- Update `prisma/extract-receipts.py` to filter out `date < 2025-06-01` so re-running the script produces clean output

### 8.3 Seed Script Updates (`prisma/seed.ts`)

1. Admin user: `username: 'magadmin'`, remove `email` field, password: `magTech`
2. Create SubscriptionPeriod: "2025-2026", startDate: 2025-06-01, endDate: 2026-05-31, active: true
3. Create MagazineSubscriptions: For each magazine, link to the 2025-2026 period with `issuesPerYear` from EBSCO invoices (fallback: derive from cadence for non-EBSCO titles)
4. Import only receipts >= 2025-06-01

---

## 9. EBSCO Invoice Data (issuesPerYear)

Extracted from `docs/0000.jpg` through `docs/0015.jpg`. Coverage: 06/01/2025–05/31/2026.

| Magazine | Issues/Year |
|----------|-------------|
| AARP Bulletin | 10 |
| AARP the Magazine | 6 |
| All Recipes Magazine | 5 |
| American Association of Retired Persons Membership | 6 |
| Ananda Vikatan | 52 |
| Architectural Digest | 11 |
| Artista Magazine | 6 |
| Ask | 9 |
| Astronomy | 12 |
| Atlantic | 12 |
| Babybug | 9 |
| Better Homes and Gardens | 10 |
| Bon Appetit | 10 |
| Car and Driver | 6 |
| China Today (Chinese ed) | 12 |
| Chirp | 10 |
| Consumer Reports | 13 |
| Consumer Reports Buying Guide | 1 |
| Cooks Illustrated | 6 |
| Cosmopolitan | 4 |
| Country Living | 6 |
| Crossword Puzzles Only | 13 |
| Discover | 6 |
| Economist | 50 |
| Elle (American ed) | 10 |
| Entrepreneur | 6 |
| Esquire | 6 |
| Essence | 6 |
| Family Handyman | 7 |
| Family Tree Magazine | 6 |
| Fine Gardening | 4 |
| First | 26 |
| Food Network Magazine | 6 |
| Food & Wine | 11 |
| Forbes | 8 |
| Fortune (Domestic Ed) | 6 |
| Fun for Kidz | 6 |
| Golf Digest | 11 |
| Good Housekeeping | 6 |
| GQ (US Ed) | 8 |
| Harpers Bazaar | 10 |
| Harvard Business Review | 12 |
| Harvard Health Letter | 12 |
| HGTV Magazine | 6 |
| Highlights for Children | 12 |
| Highlights High Five | 12 |
| Hockey News (Canada) | 14 |
| Home & Design Magazine | 6 |
| House Beautiful | 6 |
| Humpty Dumpty Magazine | 6 |
| Inc | 5 |
| Inc 500 | 1 |
| Kiplingers Personal Finance | 12 |
| Ladybug | 9 |
| Library Journal | 12 |
| Magnolia Journal | 4 |
| Make: Technology on Your Time | 4 |
| Mens Health | 6 |
| Mother Earth News | 6 |
| Muse | 9 |
| National Geographic | 12 |
| National Geographic History | 6 |
| National Geographic Kids | 10 |
| National Geographic Little Kids | 6 |
| New Jersey Monthly | 12 |
| New York | 26 |
| New Yorker | 47 |
| Out | 6 |
| Pastel Journal | 4 |
| People | 48 |
| Pioneer Woman | 4 |
| Poetry | 10 |
| Poets & Writers Magazine | 6 |
| Popular Mechanics (English ed) | 6 |
| Prevention | 12 |
| Psychology Today | 6 |
| Publishers Weekly | 46 |
| Ranger Rick (American ed) | 10 |
| Ranger Rick Jr | 10 |
| Readers Digest (US ed) | 8 |
| Readers Digest (Large Print) | 8 |
| Real Simple | 6 |
| Runners World (US) | 4 |
| School Library Journal | 12 |
| Science News | 12 |
| Scientific American | 12 |
| Scout Life | 10 |
| Series Made Simple | 1 |
| Smithsonian | 12 |
| Spider | 9 |
| Sports Illustrated | 12 |
| Sports Illustrated for Kids | 6 |
| Taste of Home | 4 |
| Threads | 4 |
| TIME Magazine (Domestic ed) | 44 |
| Town & Country | 9 |
| Travel & Leisure | 11 |
| Us Weekly | 52 |
| Vanity Fair (American ed) | 12 |
| VegNews Magazine | 4 |
| Veranda | 6 |
| Vogue | 10 |
| Week (Us Edition) | 52 |
| The Week Junior | 48 |
| Wired | 12 |
| Womens Health | 4 |
| Zoobooks | 9 |

**Fallback for non-EBSCO titles**: Derive `issuesPerYear` from cadence (WEEKLY=52, BI_WEEKLY=26, MONTHLY=12, BI_MONTHLY=6, SEASONAL=4, YEARLY=1).

---

## 10. Audit Logging

New admin actions that must be audit-logged (added to `AuditAction` type):

| Action | Details |
|--------|---------|
| `PERIOD_CREATED` | Period name, startDate, endDate |
| `PERIOD_UPDATED` | Period name, changed fields |
| `SUBSCRIPTION_CREATED` | Magazine name, period name, issuesPerYear |
| `SUBSCRIPTION_UPDATED` | Magazine name, period name, changed fields (e.g., issuesPerYear: 12 → 10) |
| `SUBSCRIPTION_DEACTIVATED` | Magazine name, period name |
| `SUBSCRIPTIONS_BULK_COPIED` | From period → to period, count of subscriptions copied |

---

## 11. Migration Strategy

### 11.1 Fresh Installs (Development / New Deployments)

Full reset and re-seed:
1. Delete DB, run `prisma migrate dev` (creates all tables including new ones)
2. Run updated `prisma/seed.ts` which creates the admin user with `username`, the 2025-2026 period, all MagazineSubscriptions, and pruned receipts

### 11.2 Production (CT 100)

Since the production database has real receipt data beyond what's in the seed:
1. Run `npm run migrate:safe` (backs up DB first)
2. Migration adds `SubscriptionPeriod` and `MagazineSubscription` tables
3. Migration adds `username` column to User, populates from name or manually set
4. Migration drops `email` column from User
5. Post-migration script: create the 2025-2026 `SubscriptionPeriod` and `MagazineSubscription` records for all active magazines
6. Production receipts before June 2025 are **not** deleted — they remain in the DB but are invisible when the 2025-2026 period is selected (date-range filter excludes them naturally)

**Note**: Receipt pruning (section 8) only affects the seed data for fresh installs. Production receipt history is preserved — the PeriodSelector simply scopes visibility.
