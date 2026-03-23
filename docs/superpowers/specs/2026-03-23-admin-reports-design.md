# Admin Reports — Design Spec

**Date:** 2026-03-23
**Status:** Draft
**Priority order:** Oversight > Accountability > Operational

---

## Overview

Admin-only reporting page that lets library administrators generate data reports about branch magazine activity. Reports are viewed in-app with charts and tables, and can be exported as .xlsx files for offline use by non-technical staff.

---

## Route & Access

- **Path:** `/admin/reports`
- **Access:** ADMIN role only (`user.role !== 'ADMIN'` redirects to `/dashboard`)
- **Sidebar:** Add `{ href: '/admin/reports', label: 'Reports', icon: BarChart3 }` to `adminItems` in `Sidebar.tsx`, after "Transfers" and before "Manage Users"

---

## URL State (searchParams)

All filter state lives in the URL for shareability and back-button support.

```
/admin/reports?tab=receipts&period=this_month&branch=all&language=all
/admin/reports?tab=overdue&period=custom&from=2026-01-01&to=2026-03-31&branch=cuid123&language=Hindi
```

| Param | Values | Default |
|---|---|---|
| `tab` | `receipts`, `overdue`, `transfers`, `subscriptions`, `timeline` | `receipts` |
| `period` | `this_month`, `last_month`, `this_quarter`, `this_year`, `custom` | `this_month` |
| `from` | ISO date (only when `period=custom`) | — |
| `to` | ISO date (only when `period=custom`) | — |
| `branch` | branch ID or `all` | `all` |
| `language` | language string or `all` | `all` |

**Language options** are populated dynamically: `db.magazine.findMany({ select: { language: true }, distinct: ['language'] })`

---

## Page Layout

```
┌──────────────────────────────────────────────────────────┐
│  Reports                                    [Export .xlsx]│
│                                                          │
│  [This Month] [Last Month] [This Quarter] [This Year]    │
│  [Custom: from ___ to ___]                               │
│                                                          │
│  Branch: [All Branches ▾]    Language: [All ▾]           │
├──────────────────────────────────────────────────────────┤
│  [Receipts] [Overdue] [Transfers] [Subscriptions] [Timeline] │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Chart area (Recharts)                                   │
│                                                          │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Data table (shadcn/ui Table)                            │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

- Filter bar at top with period presets as buttons, custom date inputs, branch select, language select
- Export button in top-right corner
- Tabs below filters
- Chart + table in the content area

---

## Report Tabs

### Tab 1 — Receipt Summary (default)

**Purpose:** How many magazines were received per branch over the selected period.

- **Chart:** Bar chart — receipts per branch (all-branches view) or per magazine (single-branch view)
- **Table columns:** Magazine name, language, cadence, total receipts in period, last received date
- **Grouping:** By branch when viewing "all branches"
- **Sorting:** By total receipts descending

### Tab 2 — Overdue / Compliance

**Purpose:** Which magazines are overdue or were overdue during the period.

- **Summary cards:** Total overdue count, on-time rate (%)
- **Table columns:** Magazine name, language, branch, cadence, days overdue, last received date, next expected date
- **Sorting:** Most overdue first (worst offenders at top)

### Tab 3 — Transfer Activity

**Purpose:** Track magazine transfers between branches for accountability.

- **Table columns:** Date, magazine, from branch, to branch, quantity, status (completed/pending/cancelled), initiated by, resolved by (shows `completedBy` or `cancelledBy` depending on status)
- **Summary row:** Total transfers, completed count, cancelled count
- **Chart:** None (table-only — transfer data is better consumed as a list)

### Tab 4 — Subscription Overview

**Purpose:** Current snapshot of what each branch is subscribed to.

- **Table columns:** Branch, magazine name, language, cadence, quantity, active status
- **Note:** Date filter does NOT apply to this tab — it shows current state
- **All-branches view:** Cross-branch matrix showing which branches carry which magazines

### Tab 5 — Receipt Timeline

**Purpose:** Spot trends and seasonal patterns in receipt volume.

- **Chart:** Line chart — receipt volume over time in weekly or monthly buckets (auto-selected based on date range length: ≤2 months → weekly, >2 months → monthly)
- **Lines:** One per branch when "all branches" selected, single line for specific branch
- **Table below:** Raw data points (period, branch, count)

---

## Export (.xlsx)

- **Trigger:** "Export" button in the filter bar top-right
- **Scope:** Exports the currently active tab's data with the current filters applied
- **Format:** .xlsx via ExcelJS
- **Auth:** Export route must independently verify ADMIN role via `getUser()` — API routes do not inherit layout-level auth checks
- **Flow:** GET request to `/admin/reports/export?tab=...&period=...&branch=...&language=...` returns a downloadable file
- **Implementation:** ExcelJS writes to an in-memory buffer (`workbook.xlsx.writeBuffer()`) and returns it with `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` and `Content-Disposition: attachment; filename=...` headers
- **Filename:** `report-{tab}-{period}-{date}.xlsx` (e.g., `report-receipts-this_month-2026-03-23.xlsx`)
- **Sheet structure:** One sheet with headers matching the table columns, data rows below
- **Audit:** Log `REPORT_EXPORTED` with tab, filters, and row count

---

## Dependencies

| Package | Purpose | Install |
|---|---|---|
| **recharts** | React charting (bar, line charts) | `npm install recharts` |
| **exceljs** | .xlsx file generation (server-side) | `npm install exceljs` |

No other new dependencies required. Recharts adds ~200-300KB to the client bundle — acceptable for an internal LAN app with 2-3 concurrent users.

---

## New Files

| File | Type | Purpose |
|---|---|---|
| `app/(dashboard)/admin/reports/page.tsx` | Server Component | Data fetching, filter parsing, passes data to client |
| `components/ReportsClient.tsx` | Client Component | Tabs, charts (Recharts), filter UI, export button |
| `lib/reports.ts` | Shared module | Query builders for each report type, reused by page + export |
| `app/(dashboard)/admin/reports/export/route.ts` | API Route | GET handler that generates and streams .xlsx |
| `prisma/seed_test.ts` | Script | Demo seed with realistic data for all report scenarios |

---

## TypeScript Interfaces (`types/index.ts`)

New interfaces for report data passed from Server Component to `ReportsClient`:

- `ReceiptSummaryRow` — magazine name, language, cadence, receipt count, last received date, branch name
- `OverdueReportRow` — magazine name, language, branch, cadence, days overdue, last received date, next expected date
- `TransferReportRow` — date, magazine, from/to branch, quantity, status, initiated by, resolved by
- `SubscriptionReportRow` — branch, magazine name, language, cadence, quantity, active status
- `TimelineDataPoint` — period label, branch name, count
- `ReportFilters` — tab, period, from, to, branch, language (parsed from searchParams)

---

## Test Seed (`prisma/seed_test.ts`)

Separate from production seed (`prisma/seed.ts`). Generates realistic demo data to exercise every report tab:

- **Receipts:** 3-6 months of receipt history across all branches, with realistic gaps (on-time, late, never received)
- **Transfers:** Mix of completed, pending, and cancelled transfers between branches
- **Overdue scenarios:** Magazines deliberately left without recent receipts
- **Multi-language coverage:** Receipts for non-English magazines so language filtering is demonstrable
- **Multiple users:** Receipts and transfers attributed to both admin and staff users

**Run with:** `npx tsx prisma/seed_test.ts` (not included in `npm run seed`)

---

## UI/UX Consistency

- oklch color palette matching existing pages
- Playfair Display for headings
- shadcn/ui components (Table, Select, Button, Badge, Tabs)
- Same border/background styling as admin magazines page
- Period preset buttons styled like filter chips (active state highlighted)
- Responsive: filter bar wraps on smaller screens

---

## Data Flow

1. User navigates to `/admin/reports` (or changes a filter/tab)
2. Server Component reads `searchParams`
3. `lib/reports.ts` builds Prisma queries based on filters
4. Server Component fetches data, passes serialized results to `ReportsClient`
5. `ReportsClient` renders tabs, charts, and tables
6. On "Export" click, client navigates to `/admin/reports/export?...` with current filters
7. Export route runs the same query, builds ExcelJS workbook, returns `.xlsx` download

---

## Out of Scope

- Scheduled/automated report generation
- Email delivery of reports
- PDF export (only .xlsx)
- Real-time updates / live dashboards
- Language filter on non-report pages (dashboard, magazine list)
