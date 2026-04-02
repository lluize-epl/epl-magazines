# Multi-Vendor Subscription Periods & Seed Data Refresh

**Date**: 2026-04-02
**Status**: Design approved

---

## Problem

The system currently assumes a single active subscription period (EBSCO Jun-May). Non-EBSCO titles like Ananda Vikatan run calendar year (Jan-Dec), and their pre-June receipts were pruned during seeding. The Clara Barton branch also lacks receipt seed data. The system needs to support N parallel subscription periods with independent lifecycles.

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Number of concurrent periods | N (unlimited) | Future-proof for additional vendors |
| Period naming | Free-text string | Simple; admin types "Ebsco-25/26", "Wtcox-25", etc. |
| Global period selector | Removed | No single active period; filtering is per-page |
| One active period per magazine | Application-level enforcement | Cannot be a DB constraint since it depends on period `active` status |
| Period creation workflow | "Same as" dropdown, no checklist | Copy from existing period, edit after on detail page |
| New periods default state | Inactive | Admin manually activates when cycle starts |
| Auto-deactivation | On page load when `endDate < today` | No cron needed; app is used daily |
| Receipt seed data | Full replacement from Jan 2025+ | Clean slate; repairs previously incorrect data |

---

## 1. Data Model

No schema migration required. Existing models are sufficient:

- `SubscriptionPeriod` — `id`, `name` (unique), `startDate`, `endDate`, `active`, `createdAt`
- `MagazineSubscription` — `id`, `magazineId`, `periodId`, `issuesPerYear`, `active`, `createdAt` with `@@unique([magazineId, periodId])`

### Application-Level Constraints

**One active period per magazine**: Before assigning a magazine to a period, check whether that magazine has an active `MagazineSubscription` linked to any other active `SubscriptionPeriod`. Enforced in:
- Period activation (bulk check — all-or-nothing; if any magazine conflicts, activation is blocked until admin resolves all conflicts)
- Adding a magazine to an already-active period
- Activating an individual `MagazineSubscription`

**Note**: Copying magazines during period creation always succeeds — copied subscriptions are inactive. Conflict checks only happen at activation time.

### API Route Rewrites Required

The existing subscription period API routes enforce a "single active period globally" model and must be rewritten:

- **`POST /api/subscription-periods`** (`app/api/subscription-periods/route.ts`): Currently auto-activates the new period and deactivates all others. Must change to: create as inactive, implement "Same as" bulk-copy, remove auto-activation logic.
- **`PUT /api/subscription-periods/[id]`** (`app/api/subscription-periods/[id]/route.ts`): Currently deactivates all other periods when setting `active: true`. Must change to: per-magazine conflict check instead of global deactivation.
- **Both routes**: Remove the overlapping date range validation — overlapping periods are now expected (e.g., Ebsco-25/26 Jun-May overlaps Wtcox-25 Jan-Dec).

### New Audit Actions

Add to `AuditAction` type in `types/index.ts`:
- `subscription_period_auto_deactivated`
- `subscription_period_activated`
- `subscription_period_deactivated`

---

## 2. Subscription Period Lifecycle

### Auto-Deactivation

New server utility in `lib/period.ts`:

```ts
async function deactivateExpiredPeriods(): Promise<void>
```

- Called in `app/(dashboard)/layout.tsx` (wraps all authenticated pages) before fetching data
- Query: all periods where `endDate < today` AND `active === true`
- For each: set `SubscriptionPeriod.active = false` and bulk-set all related `MagazineSubscription.active = false`
- Must use `withRetry()` wrapper per project conventions (transient SQLite BUSY/LOCKED)
- Audit-logged as `subscription_period_auto_deactivated`

### Activation (Manual by Admin)

When admin activates a period:

1. Server scans all `MagazineSubscription` records for this period
2. For each magazine, check if it has an active subscription in another active period
3. If conflicts found: return error with list of conflicting magazines and their current periods. Admin must resolve before activation proceeds.
4. If no conflicts: set `SubscriptionPeriod.active = true` and bulk-set all `MagazineSubscription.active = true`
5. Audit-logged as `subscription_period_activated`

### Deactivation (Manual or Auto)

- Set `SubscriptionPeriod.active = false`
- Bulk-set all `MagazineSubscription.active = false` for that period
- Audit-logged as `subscription_period_deactivated`

### Individual Magazine Overrides

Within an active period, admin can:
- Deactivate a single `MagazineSubscription` (e.g., cancelled mid-cycle)
- Reactivate a single `MagazineSubscription` (with conflict check)
- Add a new magazine to an active period (created as `active = true`, with conflict check)

---

## 3. Sidebar Changes

### Remove
- `PeriodSelector` component
- `epl-active-period` cookie logic (`getActivePeriodId`, `resolveActivePeriodId`, `resolveActivePeriod`)
- Period-related props from dashboard layout -> Sidebar

### Keep
- `getSubscriptionPeriods()` — still needed by pages that display period data

### Add: No Active Periods Warning Banner
- Rendered server-side in `app/(dashboard)/layout.tsx`, above page content (not replacing it)
- Red/amber alert: "No active subscription periods. Contact an admin to create or activate one."
- Shown when zero active periods exist after auto-deactivation runs
- Dashboard still renders below the banner (empty Expected/Overdue sections)

---

## 4. Dashboard Changes

### Subscription Progress Bars (Top)

For each active period, render a progress card:

```
Subscription Progress — Ebsco-25/26    [==========>        ] 347/520
Subscription Progress — Wtcox-25       [===============>   ] 42/52
```

- Server component fetches all active periods
- For each period: count receipts received within period date range for magazines subscribed at the active branch
- Denominator: `SUM(issuesPerYear)` across all active `MagazineSubscription` records for that period at the active branch. This is per-delivery count (not per-copy — a magazine with quantity 2 still expects `issuesPerYear` deliveries, each receipt logs one delivery regardless of copies)
- Horizontal cards, one per active period

### Expected This Week & Overdue Sections

- Query: all magazines with an active `MagazineSubscription` linked to any active period, filtered by active branch (via `BranchMagazine`)
- Each magazine appears at most once (guaranteed by the one-active-period-per-magazine constraint)
- The existing `getSubscriptionAwareStatus()` in `lib/cadence.ts` takes a single `periodStartDate` — each magazine's status is computed using its own period's `startDate`
- Cards show: magazine name, cadence, last received date, expected date
- **Period badge**: small chip/tag on each card showing the period `name`
- Sort: most overdue first, then by expected date

### Never Received
- Still shown as "Never received — status unknown" with period badge

---

## 5. Period Creation & Management

### Create Period Dialog (`/admin/subscriptions`)

Replaces the existing `CreatePeriodDialog` component, which currently auto-copies from a single active period and uses EBSCO-specific language. The new dialog is vendor-neutral.

Fields:
- `name` — free-text, placeholder: `e.g., Ebsco-25/26, Wtcox-25`
- `startDate` — date picker (noon UTC)
- `endDate` — date picker (noon UTC)
- **"Same as" dropdown**: `[None] / [Ebsco-25/26] / [Wtcox-25] / ...`
  - Lists all existing periods (requires server-fetched prop passed to the client component)
  - Selecting a period bulk-copies all its `MagazineSubscription` records (with `issuesPerYear`) into the new period
  - All copied subscriptions are created as `active = false`
  - Selecting "None" creates an empty period
- New periods created as **inactive** by default
- No magazine checklist — additions/removals happen after creation on `/admin/subscriptions/[id]` or `/admin/magazines`

### Period Detail Page (`/admin/subscriptions/[id]`)

- Existing subscription management table (add/remove magazines, edit `issuesPerYear`)
- Adding a magazine to an active period: conflict check applies
- Shows period status (Active/Inactive) with activate/deactivate button

### Period Activation Flow

1. Admin clicks "Activate"
2. Server checks all magazines in period for conflicts
3. If conflicts: show warning dialog listing conflicting magazines and their current periods
4. If clean: activate period + bulk-activate all subscriptions

---

## 6. Admin Magazines Page (`/admin/magazines`)

- Magazine list table: new **Period** column showing the magazine's most recent subscription period name badge (or "—" if unsubscribed). If the magazine has subscriptions in multiple (inactive) periods, show the most recent one.
- Magazine create/edit form in `AdminMagazinesClient` component: **Subscription Period** dropdown showing all periods (+ "None")
  - This is a convenience shortcut that creates/removes a `MagazineSubscription` record
  - Conflict check: if magazine is already active in another active period, show error

---

## 7. Magazine Detail Page (`/magazines/[id]`)

- Read-only period badge near the magazine title
- If unsubscribed: "Not currently subscribed"
- Receipt history scoped to the magazine's current subscription period date range
- If no active subscription (magazine in inactive period or unsubscribed): show "No active subscription" message with no receipt history (use Reports page with period filter for historical data)

---

## 8. Reports Enhancements

### Period Filter (replaces removed sidebar selector)
- Dropdown on the reports page: "All Periods" (default) / list of all periods (active first, then inactive)
- Selecting a period scopes date range to that period's `startDate`–`endDate`
- Works with existing date presets (This Month, Last 3 Months, Custom) — period bounds act as outer limits

### Magazine Name Filter (New)
- Search/autocomplete input alongside existing branch and period dropdowns
- Filters all report tabs to a specific magazine
- Server-side filtering via query param, applied in `lib/reports.ts`

### Combined Drill-Down
- Period + Branch + Magazine filters together enable: "show receipt history for Ananda Vikatan at Main Library during Wtcox-25"
- All from the reports page — single place for all data exploration

### No changes to
- The 5 existing report tabs, Recharts charts, or .xlsx export logic — they receive additional filter params

---

## 9. Seed Data Refresh

### Data Sources (Order of Authority)

1. **EBSCO invoices (16 images in `docs/`)** — Authoritative for:
   - Complete EBSCO magazine list (exclude "Membership" entries)
   - `issuesPerYear` -> cadence (52=WEEKLY, 26=BI_WEEKLY, 12=MONTHLY, 6=BI_MONTHLY, 4=SEASONAL, etc.)
   - Branch distribution by quantity (1=ML, 2=ML+NE, 3=ML+NE+CB, 5=2ML+2NE+1CB)
   - Coverage dates (EBSCO = Jun-May)
   - Standing orders (e.g., Ananda Vikatan)

2. **EBSCO spreadsheets (5 xlsx files)** — Receipt data from Jan 1, 2025+:
   - `Ebsco Magazines for Main 2025.xlsx` + `Main 2026.xlsx` -> MAIN
   - `Ebsco NE 2025-2026 Magazine List.xlsx` -> NORTH (Jan 25+ tabs)
   - `Ebsco CB 2025-2026 Magazine List.xlsx` + `CB Childrens.xlsx` -> CB

3. **CB spreadsheets** — May introduce magazines not on invoices (children's titles)

### Two Subscription Periods

| Period | Name | Start | End | Magazines |
|---|---|---|---|---|
| EBSCO standard | Ebsco-25/26 | 2025-06-01 | 2026-05-31 | All standard EBSCO subscriptions |
| Calendar year | Wtcox-25 | 2025-01-01 | 2025-12-31 | Standing orders + magazines with Jan 1 2025 start date |

### Process

1. Extract magazine master list from invoice images — validate against existing seed data
2. Update `prisma/extract-receipts.py`: parse all 5 spreadsheets from Jan 2025+, add CB name mappings, change start cutoff from June to January
3. Replace `seed-receipts.json` entirely
4. Update `seed.ts`: create both periods, assign magazines to correct periods based on invoice coverage dates, use invoice-derived `issuesPerYear` and branch quantities, exclude memberships

---

## Out of Scope

- Vendor field on `SubscriptionPeriod` (free-text name is sufficient)
- Automated period creation (manual only)
- MOBILE/Bookmobile branch seed data
- Pricing/cost tracking from invoices
