# Admin Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an admin-only reporting page with 5 report tabs, interactive charts, filterable tables, and .xlsx export for the EPL Magazine Tracker.

**Architecture:** Server Component fetches data via Prisma queries in `lib/reports.ts`, passes serialized results to a thin `ReportsClient` client component that renders tabs (searchParams-driven), Recharts charts, and shadcn/ui tables. Export is a separate API route that reuses the same query builders and returns an ExcelJS-generated .xlsx file.

**Tech Stack:** Next.js App Router, TypeScript strict, Prisma v7 + SQLite (WAL mode), Recharts, ExcelJS, shadcn/ui, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-03-23-admin-reports-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `types/index.ts` | Modify | Add `REPORT_EXPORTED` to AuditAction, 2 type aliases + 6 report interfaces |
| `lib/reports.ts` | Create | Query builders for all 5 report types + date range helpers |
| `app/(dashboard)/admin/reports/page.tsx` | Create | Server Component: parse filters, fetch data, pass to client |
| `components/ReportsClient.tsx` | Create | Client Component: filter bar, tabs, charts, tables, export button |
| `components/ReportsCharts.tsx` | Create | Recharts chart components (bar + line) — isolated for bundle clarity |
| `app/(dashboard)/admin/reports/export/route.ts` | Create | GET route: auth, query, ExcelJS buffer, download response |
| `components/Sidebar.tsx` | Modify | Add Reports link to `adminItems` |
| `prisma/seed_test.ts` | Create | Demo seed with 3-6 months of realistic data |

---

## Task 1: Install Dependencies

**Files:** `package.json`

- [ ] **Step 1: Install recharts and exceljs**

```bash
npm install recharts exceljs
```

- [ ] **Step 2: Verify installation**

```bash
node -e "require('recharts'); console.log('recharts OK')"
node -e "require('exceljs'); console.log('exceljs OK')"
```
Expected: Both print OK without errors.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install recharts and exceljs for admin reports"
```

---

## Task 2: Add TypeScript Interfaces

**Files:**
- Modify: `types/index.ts` (append after existing types, before the closing of the file)

- [ ] **Step 1: Add report type interfaces to `types/index.ts`**

First, add `'REPORT_EXPORTED'` to the `AuditAction` type union (after `'TRANSFER_CANCELLED'` at line 229):

```typescript
  | 'TRANSFER_CANCELLED'
  | 'REPORT_EXPORTED'
```

Then add these interfaces at the end of the file, after the existing `AuditLogEntry` interface. Follow the existing convention: TSDoc comment on every exported interface, grouped under a section header comment.

```typescript
// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

/** Tab identifiers for the reports page */
export type ReportTab = 'receipts' | 'overdue' | 'transfers' | 'subscriptions' | 'timeline'

/** Period preset identifiers for report date filtering */
export type ReportPeriod = 'this_month' | 'last_month' | 'this_quarter' | 'this_year' | 'custom'

/** Parsed filter state from searchParams on the reports page */
export interface ReportFilters {
  tab: ReportTab
  period: ReportPeriod
  from: Date
  to: Date
  branch: string  // branch ID or 'all'
  language: string // language string or 'all'
}

/** Row in the Receipt Summary report table */
export interface ReceiptSummaryRow {
  magazineName: string
  language: string
  cadence: CadenceType
  receiptCount: number
  lastReceivedDate: Date | null
  branchName: string
}

/** Row in the Overdue / Compliance report table */
export interface OverdueReportRow {
  magazineName: string
  language: string
  branchName: string
  cadence: CadenceType
  daysOverdue: number
  lastReceivedDate: Date | null
  nextExpectedDate: Date | null
}

/** Row in the Transfer Activity report table */
export interface TransferReportRow {
  date: Date
  magazineName: string
  fromBranch: string
  toBranch: string
  quantity: number
  status: TransferStatus
  initiatedBy: string
  resolvedBy: string | null
}

/** Row in the Subscription Overview report table */
export interface SubscriptionReportRow {
  branchName: string
  magazineName: string
  language: string
  cadence: CadenceType
  quantity: number
  active: boolean
}

/** Data point for the Receipt Timeline chart */
export interface TimelineDataPoint {
  period: string  // e.g. "2026-W12" or "2026-03"
  branchName: string
  count: number
}
```

- [ ] **Step 2: Verify types compile**

```bash
npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add types/index.ts
git commit -m "feat: add report TypeScript interfaces"
```

---

## Task 3: Build Report Query Builders (`lib/reports.ts`)

**Files:**
- Create: `lib/reports.ts`

This is the core data layer. All 5 report tabs query through functions here. The export route and the server component both call these same functions.

- [ ] **Step 1: Create `lib/reports.ts` with date range helpers and filter parser**

```typescript
import {
  startOfMonth, endOfMonth, subMonths, startOfQuarter, endOfQuarter,
  startOfYear, endOfYear, differenceInDays, startOfWeek, format,
  addWeeks, addMonths as addMonthsFn,
} from 'date-fns'
import db from '@/lib/db'
import { computeNextExpectedDate } from '@/lib/cadence'
import type {
  ReportFilters, ReportTab, ReportPeriod,
  ReceiptSummaryRow, OverdueReportRow, TransferReportRow,
  SubscriptionReportRow, TimelineDataPoint,
} from '@/types'

/** Valid tab values for runtime validation */
const VALID_TABS: ReportTab[] = ['receipts', 'overdue', 'transfers', 'subscriptions', 'timeline']

/** Valid period values for runtime validation */
const VALID_PERIODS: ReportPeriod[] = ['this_month', 'last_month', 'this_quarter', 'this_year', 'custom']

/**
 * Parse searchParams into a validated ReportFilters object.
 * Invalid or missing values fall back to sensible defaults.
 */
export function parseReportFilters(params: Record<string, string | string[] | undefined>): ReportFilters {
  const tab = VALID_TABS.includes(params.tab as ReportTab)
    ? (params.tab as ReportTab)
    : 'receipts'

  const period = VALID_PERIODS.includes(params.period as ReportPeriod)
    ? (params.period as ReportPeriod)
    : 'this_month'

  const { from, to } = resolveDateRange(period, params.from as string | undefined, params.to as string | undefined)

  return {
    tab,
    period,
    from,
    to,
    branch: (typeof params.branch === 'string' && params.branch) || 'all',
    language: (typeof params.language === 'string' && params.language) || 'all',
  }
}

/**
 * Convert a period preset (or custom from/to) into concrete Date boundaries.
 */
function resolveDateRange(
  period: ReportPeriod,
  fromStr?: string,
  toStr?: string,
): { from: Date; to: Date } {
  const now = new Date()
  switch (period) {
    case 'this_month':
      return { from: startOfMonth(now), to: endOfMonth(now) }
    case 'last_month': {
      const prev = subMonths(now, 1)
      return { from: startOfMonth(prev), to: endOfMonth(prev) }
    }
    case 'this_quarter':
      return { from: startOfQuarter(now), to: endOfQuarter(now) }
    case 'this_year':
      return { from: startOfYear(now), to: endOfYear(now) }
    case 'custom':
      return {
        from: fromStr ? new Date(fromStr) : startOfMonth(now),
        to: toStr ? new Date(toStr) : endOfMonth(now),
      }
  }
}
```

- [ ] **Step 2: Add the Receipt Summary query builder**

Append to `lib/reports.ts`:

```typescript
/**
 * Receipt Summary: total receipts per magazine per branch in the date range.
 */
export async function getReceiptSummary(filters: ReportFilters): Promise<ReceiptSummaryRow[]> {
  // TODO: improve typing — using Record<string, unknown> for dynamic where clause
  const where: Record<string, unknown> = {
    receivedDate: { gte: filters.from, lte: filters.to },
  }
  if (filters.branch !== 'all') where.branchId = filters.branch
  if (filters.language !== 'all') where.magazine = { language: filters.language }

  const receipts = await db.issueReceipt.findMany({
    where,
    include: {
      magazine: { select: { name: true, language: true, cadence: true } },
      branch: { select: { name: true } },
    },
  })

  // Group by magazine + branch
  const grouped = new Map<string, ReceiptSummaryRow>()
  for (const r of receipts) {
    const key = `${r.magazineId}::${r.branchId ?? 'none'}`
    const existing = grouped.get(key)
    if (existing) {
      existing.receiptCount++
      if (!existing.lastReceivedDate || r.receivedDate > existing.lastReceivedDate) {
        existing.lastReceivedDate = r.receivedDate
      }
    } else {
      grouped.set(key, {
        magazineName: r.magazine.name,
        language: r.magazine.language,
        cadence: r.magazine.cadence,
        receiptCount: 1,
        lastReceivedDate: r.receivedDate,
        branchName: r.branch?.name ?? 'Unknown',
      })
    }
  }

  return Array.from(grouped.values()).sort((a, b) => b.receiptCount - a.receiptCount)
}
```

- [ ] **Step 3: Add the Overdue / Compliance query builder**

Append to `lib/reports.ts`:

```typescript
/**
 * Overdue / Compliance: magazines whose next expected date is in the past.
 * Shows current overdue state — the date range filter does NOT apply
 * (same rationale as the Subscription Overview tab: overdue is a point-in-time snapshot).
 * Branch and language filters still apply.
 */
export async function getOverdueReport(filters: ReportFilters): Promise<{
  rows: OverdueReportRow[]
  totalOverdue: number
  onTimeRate: number
}> {
  // TODO: improve typing — using Record<string, unknown> for dynamic where clause
  const subWhere: Record<string, unknown> = { active: true }
  if (filters.branch !== 'all') subWhere.branchId = filters.branch
  if (filters.language !== 'all') subWhere.magazine = { language: filters.language }

  const subscriptions = await db.branchMagazine.findMany({
    where: subWhere,
    include: {
      magazine: { select: { id: true, name: true, language: true, cadence: true } },
      branch: { select: { id: true, name: true } },
    },
  })

  // Batch-fetch the latest receipt for each subscription to avoid N+1 queries
  const allReceipts = await db.issueReceipt.findMany({
    where: {
      magazineId: { in: subscriptions.map((s) => s.magazineId) },
      branchId: { in: subscriptions.map((s) => s.branchId) },
    },
    orderBy: { receivedDate: 'desc' },
    select: { magazineId: true, branchId: true, receivedDate: true },
  })

  // Build a lookup: "magazineId::branchId" → latest receivedDate
  const latestReceiptMap = new Map<string, Date>()
  for (const r of allReceipts) {
    const key = `${r.magazineId}::${r.branchId}`
    if (!latestReceiptMap.has(key)) latestReceiptMap.set(key, r.receivedDate)
  }

  const rows: OverdueReportRow[] = []
  const now = new Date()

  for (const sub of subscriptions) {
    const key = `${sub.magazineId}::${sub.branchId}`
    const lastReceivedDate = latestReceiptMap.get(key) ?? null
    const nextExpectedDate = lastReceivedDate
      ? computeNextExpectedDate(lastReceivedDate, sub.magazine.cadence)
      : null

    if (nextExpectedDate && nextExpectedDate < now) {
      rows.push({
        magazineName: sub.magazine.name,
        language: sub.magazine.language,
        branchName: sub.branch.name,
        cadence: sub.magazine.cadence,
        daysOverdue: differenceInDays(now, nextExpectedDate),
        lastReceivedDate,
        nextExpectedDate,
      })
    }
  }

  rows.sort((a, b) => b.daysOverdue - a.daysOverdue)

  const totalOverdue = rows.length
  const totalSubs = subscriptions.length
  const onTimeRate = totalSubs > 0 ? Math.round(((totalSubs - totalOverdue) / totalSubs) * 100) : 100

  return { rows, totalOverdue, onTimeRate }
}
```

- [ ] **Step 4: Add the Transfer Activity query builder**

Append to `lib/reports.ts`:

```typescript
/**
 * Transfer Activity: all transfers in the date range with user and branch details.
 */
export async function getTransferReport(filters: ReportFilters): Promise<{
  rows: TransferReportRow[]
  totalCount: number
  completedCount: number
  cancelledCount: number
}> {
  // TODO: improve typing — using Record<string, unknown> for dynamic where clause
  const where: Record<string, unknown> = {
    createdAt: { gte: filters.from, lte: filters.to },
  }
  if (filters.branch !== 'all') {
    where.OR = [{ fromBranchId: filters.branch }, { toBranchId: filters.branch }]
  }
  if (filters.language !== 'all') {
    where.magazine = { language: filters.language }
  }

  const transfers = await db.transfer.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      magazine: { select: { name: true, language: true } },
      fromBranch: { select: { name: true } },
      toBranch: { select: { name: true } },
      initiatedBy: { select: { name: true } },
      completedBy: { select: { name: true } },
      cancelledBy: { select: { name: true } },
    },
  })

  const rows: TransferReportRow[] = transfers.map((t) => ({
    date: t.createdAt,
    magazineName: t.magazine.name,
    fromBranch: t.fromBranch.name,
    toBranch: t.toBranch.name,
    quantity: t.quantity,
    status: t.status,
    initiatedBy: t.initiatedBy.name,
    resolvedBy: t.status === 'COMPLETED'
      ? (t.completedBy?.name ?? null)
      : t.status === 'CANCELLED'
        ? (t.cancelledBy?.name ?? null)
        : null,
  }))

  return {
    rows,
    totalCount: rows.length,
    completedCount: rows.filter((r) => r.status === 'COMPLETED').length,
    cancelledCount: rows.filter((r) => r.status === 'CANCELLED').length,
  }
}
```

- [ ] **Step 5: Add the Subscription Overview query builder**

Append to `lib/reports.ts`:

```typescript
/**
 * Subscription Overview: current snapshot of all active subscriptions.
 * Date filter is ignored — this shows current state.
 */
export async function getSubscriptionOverview(filters: ReportFilters): Promise<SubscriptionReportRow[]> {
  // TODO: improve typing — using Record<string, unknown> for dynamic where clause
  const where: Record<string, unknown> = {}
  if (filters.branch !== 'all') where.branchId = filters.branch
  if (filters.language !== 'all') where.magazine = { language: filters.language }

  const subs = await db.branchMagazine.findMany({
    where,
    orderBy: [{ branch: { name: 'asc' } }, { magazine: { name: 'asc' } }],
    include: {
      magazine: { select: { name: true, language: true, cadence: true } },
      branch: { select: { name: true } },
    },
  })

  return subs.map((s) => ({
    branchName: s.branch.name,
    magazineName: s.magazine.name,
    language: s.magazine.language,
    cadence: s.magazine.cadence,
    quantity: s.quantity,
    active: s.active,
  }))
}
```

- [ ] **Step 6: Add the Receipt Timeline query builder**

Append to `lib/reports.ts`:

```typescript
/**
 * Receipt Timeline: receipt counts bucketed by week or month.
 * Auto-selects bucket size: ≤2 months → weekly, >2 months → monthly.
 */
export async function getReceiptTimeline(filters: ReportFilters): Promise<{
  data: TimelineDataPoint[]
  bucketType: 'weekly' | 'monthly'
}> {
  // TODO: improve typing — using Record<string, unknown> for dynamic where clause
  const where: Record<string, unknown> = {
    receivedDate: { gte: filters.from, lte: filters.to },
  }
  if (filters.branch !== 'all') where.branchId = filters.branch
  if (filters.language !== 'all') where.magazine = { language: filters.language }

  const receipts = await db.issueReceipt.findMany({
    where,
    select: {
      receivedDate: true,
      branch: { select: { name: true } },
    },
  })

  const rangeDays = differenceInDays(filters.to, filters.from)
  const bucketType: 'weekly' | 'monthly' = rangeDays <= 62 ? 'weekly' : 'monthly'

  const grouped = new Map<string, number>()

  for (const r of receipts) {
    const branchName = r.branch?.name ?? 'Unknown'
    const period = bucketType === 'weekly'
      ? format(startOfWeek(r.receivedDate, { weekStartsOn: 1 }), "yyyy-'W'II")
      : format(r.receivedDate, 'yyyy-MM')
    const key = `${period}::${branchName}`
    grouped.set(key, (grouped.get(key) ?? 0) + 1)
  }

  const data: TimelineDataPoint[] = Array.from(grouped.entries())
    .map(([key, count]) => {
      const [period, branchName] = key.split('::')
      return { period, branchName, count }
    })
    .sort((a, b) => a.period.localeCompare(b.period))

  return { data, bucketType }
}
```

- [ ] **Step 7: Add a helper to fetch available languages for the filter dropdown**

Append to `lib/reports.ts`:

```typescript
/**
 * Returns distinct language values from all magazines, for the filter dropdown.
 */
export async function getAvailableLanguages(): Promise<string[]> {
  const results = await db.magazine.findMany({
    select: { language: true },
    distinct: ['language'],
    orderBy: { language: 'asc' },
  })
  return results.map((r) => r.language)
}
```

- [ ] **Step 8: Verify types compile**

```bash
npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 9: Commit**

```bash
git add lib/reports.ts
git commit -m "feat: add report query builders for all 5 report types"
```

---

## Task 4: Add Sidebar Link

**Files:**
- Modify: `components/Sidebar.tsx` (lines 48-53, `adminItems` array)

- [ ] **Step 1: Add BarChart3 import and Reports item**

Add `BarChart3` to the lucide-react import at the top of `components/Sidebar.tsx`.

Insert into the `adminItems` array after "Transfers" and before "Manage Users":

```typescript
const adminItems: NavItem[] = [
  { href: '/admin/magazines', label: 'Manage Magazines', icon: BookMarked },
  { href: '/admin/transfers', label: 'Transfers', icon: ArrowLeftRight },
  { href: '/admin/reports', label: 'Reports', icon: BarChart3 },
  { href: '/admin/users', label: 'Manage Users', icon: Users },
  { href: '/log', label: 'Audit Log', icon: ScrollText },
]
```

- [ ] **Step 2: Verify types compile**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add components/Sidebar.tsx
git commit -m "feat: add Reports link to admin sidebar"
```

---

## Task 5: Build the Server Component Page

**Files:**
- Create: `app/(dashboard)/admin/reports/page.tsx`

This follows the exact same pattern as `app/(dashboard)/admin/transfers/page.tsx` — Server Component that fetches data and passes to a client component.

- [ ] **Step 1: Create the reports page server component**

Create `app/(dashboard)/admin/reports/page.tsx`:

```typescript
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getUser } from '@/lib/dal'
import { getActiveBranches } from '@/lib/branch'
import {
  parseReportFilters,
  getReceiptSummary,
  getOverdueReport,
  getTransferReport,
  getSubscriptionOverview,
  getReceiptTimeline,
  getAvailableLanguages,
} from '@/lib/reports'
import ReportsClient from '@/components/ReportsClient'

export const metadata: Metadata = { title: 'Reports — EPL Magazine Tracker' }

type SearchParams = { [key: string]: string | string[] | undefined }

interface PageProps {
  searchParams: Promise<SearchParams>
}

export default async function AdminReportsPage({ searchParams }: PageProps) {
  const user = await getUser()
  if (user.role !== 'ADMIN') redirect('/dashboard')

  const params = await searchParams
  const filters = parseReportFilters(params)
  const branches = await getActiveBranches()
  const languages = await getAvailableLanguages()

  // Fetch only the active tab's data to avoid unnecessary queries
  let receiptSummary = null
  let overdueReport = null
  let transferReport = null
  let subscriptionOverview = null
  let receiptTimeline = null

  switch (filters.tab) {
    case 'receipts':
      receiptSummary = await getReceiptSummary(filters)
      break
    case 'overdue':
      overdueReport = await getOverdueReport(filters)
      break
    case 'transfers':
      transferReport = await getTransferReport(filters)
      break
    case 'subscriptions':
      subscriptionOverview = await getSubscriptionOverview(filters)
      break
    case 'timeline':
      receiptTimeline = await getReceiptTimeline(filters)
      break
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <ReportsClient
        filters={filters}
        branches={branches}
        languages={languages}
        receiptSummary={receiptSummary}
        overdueReport={overdueReport}
        transferReport={transferReport}
        subscriptionOverview={subscriptionOverview}
        receiptTimeline={receiptTimeline}
      />
    </div>
  )
}
```

- [ ] **Step 2: Verify types compile**

```bash
npx tsc --noEmit
```
Expected: Will fail because `ReportsClient` doesn't exist yet — that's fine, just confirm the error is about the missing import, not a type issue in this file.

- [ ] **Step 3: Commit**

```bash
git add app/\(dashboard\)/admin/reports/page.tsx
git commit -m "feat: add reports server component page"
```

---

## Task 6: Build the Client Component (`ReportsClient.tsx`)

**Files:**
- Create: `components/ReportsClient.tsx`

This is the largest component. It renders the filter bar, tabs, and delegates to chart/table rendering. Follow the pattern from `AdminTransfersClient.tsx` for filter buttons and `AdminMagazinesClient.tsx` for table structure.

- [ ] **Step 1: Create `components/ReportsClient.tsx`**

The component needs:
- Filter bar with period preset buttons (styled like the transfer status filter buttons in `AdminTransfersClient.tsx` lines 95-117)
- Custom date range inputs (two `<Input type="date">` fields, only visible when period is "custom")
- Branch select dropdown using shadcn `Select`
- Language select dropdown using shadcn `Select`
- Export button (top-right, links to `/admin/reports/export?...`)
- Tab buttons for the 5 report types
- Conditional rendering of the active tab's chart + table

**Important patterns to follow:**
- Use `useRouter()` and `router.push()` to update searchParams (same as `AdminTransfersClient.tsx` line 69-73 `applyFilter` pattern)
- Build URL with `URLSearchParams` preserving all current filter state
- Style with oklch inline styles matching existing pages
- Use `fontFamily: 'var(--font-playfair)'` for headings
- Use shadcn/ui `Table`, `Badge`, `Button`, `Select` components
- Format dates with `format(date, 'MMM d, yyyy')` from date-fns

**Props interface:**
```typescript
import type {
  ReportFilters, Branch,
  ReceiptSummaryRow, OverdueReportRow, TransferReportRow,
  SubscriptionReportRow, TimelineDataPoint,
} from '@/types'

interface ReportsClientProps {
  filters: ReportFilters
  branches: Branch[]
  languages: string[]
  receiptSummary: ReceiptSummaryRow[] | null
  overdueReport: { rows: OverdueReportRow[]; totalOverdue: number; onTimeRate: number } | null
  transferReport: { rows: TransferReportRow[]; totalCount: number; completedCount: number; cancelledCount: number } | null
  subscriptionOverview: SubscriptionReportRow[] | null
  receiptTimeline: { data: TimelineDataPoint[]; bucketType: 'weekly' | 'monthly' } | null
}
```

**URL update helper (used by all filter controls):**
```typescript
function buildUrl(overrides: Record<string, string>): string {
  const params = new URLSearchParams()
  const merged = {
    tab: filters.tab,
    period: filters.period,
    branch: filters.branch,
    language: filters.language,
    ...(filters.period === 'custom' ? {
      from: format(filters.from, 'yyyy-MM-dd'),
      to: format(filters.to, 'yyyy-MM-dd'),
    } : {}),
    ...overrides,
  }
  for (const [k, v] of Object.entries(merged)) {
    if (v && v !== 'all' && !(k === 'tab' && v === 'receipts') && !(k === 'period' && v === 'this_month')) {
      params.set(k, v)
    }
  }
  const qs = params.toString()
  return `/admin/reports${qs ? `?${qs}` : ''}`
}
```

**Tab definitions:**
```typescript
const TABS = [
  { value: 'receipts', label: 'Receipts' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'transfers', label: 'Transfers' },
  { value: 'subscriptions', label: 'Subscriptions' },
  { value: 'timeline', label: 'Timeline' },
] as const

const PERIODS = [
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'this_quarter', label: 'This Quarter' },
  { value: 'this_year', label: 'This Year' },
  { value: 'custom', label: 'Custom' },
] as const
```

**Table rendering:** Each tab renders its own table. Follow the exact Table pattern from `AdminMagazinesClient.tsx` lines 104-241:
- Wrap in a `rounded-lg border overflow-hidden` div with `borderColor: 'oklch(0.876 0.016 88)'`
- `TableHeader` with `backgroundColor: 'oklch(0.963 0.012 91)'`
- Column headers with `color: 'oklch(0.30 0.028 62)'`
- Cadence values displayed using `CADENCE_LABELS[row.cadence]` in a `Badge` with outline variant
- Dates formatted with `format(new Date(date), 'MMM d, yyyy')`

**Overdue tab summary cards:** Use shadcn `Card` component (available in `components/ui/card.tsx`):
- Two cards side by side: "Total Overdue" (count) and "On-Time Rate" (percentage)
- Card styling consistent with oklch palette

**Export button:** An `<a>` tag styled as a Button pointing to `/admin/reports/export?{current params}` with `download` attribute.

- [ ] **Step 2: Verify types compile**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Test in browser**

```bash
# Dev server should already be running
# Navigate to http://localhost:3000/admin/reports
# Verify: page loads, filter bar renders, tabs are clickable, URL updates on filter change
```

- [ ] **Step 4: Commit**

```bash
git add components/ReportsClient.tsx
git commit -m "feat: add ReportsClient with filters, tabs, and tables"
```

---

## Task 7: Build Chart Components (`ReportsCharts.tsx`)

**Files:**
- Create: `components/ReportsCharts.tsx`

Separate file to isolate Recharts imports (heavy library) from the main client component.

- [ ] **Step 1: Create `components/ReportsCharts.tsx`**

```typescript
'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line,
} from 'recharts'
import type { ReceiptSummaryRow, TimelineDataPoint } from '@/types'
```

**Two exported components:**

1. `ReceiptBarChart` — takes `ReceiptSummaryRow[]`, groups by `branchName`, renders a `BarChart`
   - X-axis: branch name (all-branches) or magazine name (single branch)
   - Y-axis: receipt count
   - Bar color: `oklch(0.38 0.082 156)` (the app's primary green)
   - Wrapped in `ResponsiveContainer` with `width="100%" height={300}`

2. `TimelineLineChart` — takes `TimelineDataPoint[]` and `bucketType`, renders a `LineChart`
   - X-axis: period labels
   - Y-axis: count
   - One `Line` per branch (derive unique branch names from data)
   - Use distinct colors per branch from a predefined palette
   - Wrapped in `ResponsiveContainer` with `width="100%" height={300}`

**Color palette for lines:**
```typescript
const CHART_COLORS = [
  'oklch(0.38 0.082 156)',  // green (primary)
  'oklch(0.50 0.150 250)',  // blue
  'oklch(0.55 0.180 30)',   // orange
  'oklch(0.45 0.200 330)',  // purple
  'oklch(0.50 0.160 100)',  // yellow-green
]
```

- [ ] **Step 2: Import charts into ReportsClient**

Add imports in `components/ReportsClient.tsx`:
```typescript
import { ReceiptBarChart, TimelineLineChart } from './ReportsCharts'
```

Render `ReceiptBarChart` above the table in the receipts tab, and `TimelineLineChart` above the table in the timeline tab.

- [ ] **Step 3: Verify in browser**

Navigate to `/admin/reports` — verify charts render with the filter bar. If no data exists yet, charts should show an empty state gracefully.

- [ ] **Step 4: Commit**

```bash
git add components/ReportsCharts.tsx components/ReportsClient.tsx
git commit -m "feat: add Recharts bar and line chart components for reports"
```

---

## Task 8: Build the Export Route

**Files:**
- Create: `app/(dashboard)/admin/reports/export/route.ts`

- [ ] **Step 1: Create the export route**

Follow the pattern from existing API routes (e.g., `app/api/transfers/route.ts`).

> **Note:** This route is inside `(dashboard)` but route handlers in Next.js App Router bypass layouts — they are not wrapped by `layout.tsx`'s Server Component logic. The route responds directly with the binary file. Auth must be enforced independently via `getUser()`.

```typescript
import type { NextRequest } from 'next/server'
import ExcelJS from 'exceljs'
import { getUser } from '@/lib/dal'
import { auditLog } from '@/lib/logger'
import {
  parseReportFilters,
  getReceiptSummary,
  getOverdueReport,
  getTransferReport,
  getSubscriptionOverview,
  getReceiptTimeline,
} from '@/lib/reports'
import { format } from 'date-fns'
import { CADENCE_LABELS } from '@/lib/cadence'
```

**Key implementation details:**

- Auth: `const user = await getUser()` — if role is not ADMIN, return 403
- Parse filters from `request.nextUrl.searchParams`
- Fetch data using the same query builders as the page
- Create an ExcelJS workbook with one sheet
- Column headers match the table columns from each tab
- Format dates as `'MMM d, yyyy'` in the cells
- Cadence values use `CADENCE_LABELS[cadence]` for human-readable labels
- Return response with:
  - `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
  - `Content-Disposition: attachment; filename="report-{tab}-{period}-{date}.xlsx"`
- Audit log: `auditLog(user.id, 'REPORT_EXPORTED', { tab, period, branch, language, rowCount })`
- Error handling: try/catch with 500 response

**Sheet creation pattern (example for receipts tab):**
```typescript
const workbook = new ExcelJS.Workbook()
const sheet = workbook.addWorksheet('Receipt Summary')

sheet.columns = [
  { header: 'Magazine', key: 'magazineName', width: 30 },
  { header: 'Language', key: 'language', width: 15 },
  { header: 'Cadence', key: 'cadence', width: 15 },
  { header: 'Receipts', key: 'receiptCount', width: 12 },
  { header: 'Last Received', key: 'lastReceivedDate', width: 18 },
  { header: 'Branch', key: 'branchName', width: 25 },
]

// Style header row
sheet.getRow(1).font = { bold: true }

for (const row of data) {
  sheet.addRow({
    ...row,
    cadence: CADENCE_LABELS[row.cadence],
    lastReceivedDate: row.lastReceivedDate ? format(new Date(row.lastReceivedDate), 'MMM d, yyyy') : 'Never',
  })
}

const buffer = await workbook.xlsx.writeBuffer()
```

Repeat this pattern for each tab (overdue, transfers, subscriptions, timeline) with their respective columns.

- [ ] **Step 2: Verify types compile**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Test export in browser**

Navigate to `/admin/reports`, click the Export button. Verify:
- A `.xlsx` file downloads
- The filename matches the pattern
- Opening it in a spreadsheet app shows correctly formatted data

- [ ] **Step 4: Commit**

```bash
git add app/\(dashboard\)/admin/reports/export/route.ts
git commit -m "feat: add .xlsx export route for admin reports"
```

---

## Task 9: Build the Test Seed (`prisma/seed_test.ts`)

**Files:**
- Create: `prisma/seed_test.ts`

Follow the pattern from `prisma/seed.ts` — same imports, same DB connection, same upsert pattern for base data.

- [ ] **Step 1: Create `prisma/seed_test.ts`**

**Structure:**
1. Import `dotenv/config`, bcrypt, Prisma client (same as `seed.ts` lines 1-7)
2. Run the production seed logic first (users, branches, magazines) by importing or duplicating
3. Generate demo data:

**Receipt generation (3-6 months):**
```typescript
// For each active BranchMagazine subscription:
// - Pick a random start date 3-6 months ago
// - Generate receipts at the magazine's cadence interval
// - Randomly skip ~15% of expected receipts (creates overdue gaps)
// - Assign to admin or staff user randomly
```

**Transfer generation:**
```typescript
// Create 15-20 transfers:
// - 10 COMPLETED (with completedBy and completedAt)
// - 3 PENDING (no resolution)
// - 3 CANCELLED (with cancelledBy and cancelledAt)
// - Random magazines and branch pairs
// - Spread across the last 3 months
```

**Multi-language receipts:**
Make sure at least 5 receipts exist for each non-English language magazine so the language filter is testable.

**Key details:**
- Use `subDays`, `subMonths`, `addDays` from `date-fns` for date arithmetic
- Use `Math.random()` for realistic variation
- Log progress with `console.log()` similar to `seed.ts`
- End with summary: "Test seed complete: X receipts, Y transfers"

- [ ] **Step 2: Test the seed**

> **WARNING:** This step destroys existing data. Only run in development. Ask the user for confirmation before proceeding.

```bash
# Reset and re-seed with test data
rm prisma/dev.db && npx prisma migrate dev --name fresh && npx tsx prisma/seed_test.ts
```

Expected: Seed runs without errors, logs summary of created records.

- [ ] **Step 3: Verify reports have data**

Navigate to `/admin/reports` in the browser. Check each tab:
- Receipts tab shows receipt counts with bar chart
- Overdue tab shows overdue magazines
- Transfers tab shows transfer history
- Subscriptions tab shows current subscriptions
- Timeline tab shows receipt trend line

- [ ] **Step 4: Commit**

```bash
git add prisma/seed_test.ts
git commit -m "feat: add test seed with realistic demo data for reports"
```

---

## Task 10: Final Integration Testing & Polish

- [ ] **Step 1: Test all filter combinations**

In the browser, test:
- Each period preset (this month, last month, this quarter, this year)
- Custom date range
- Branch filter: "All" vs specific branch
- Language filter: "All" vs specific language (e.g., "Hindi")
- Combinations of the above
- Verify URL updates correctly on each filter change
- Verify back button navigates to previous filter state

- [ ] **Step 2: Test export with filters**

- Export each tab with default filters
- Export with specific branch + language filter
- Open each .xlsx and verify headers, data, formatting

- [ ] **Step 3: Test edge cases**

- Tab with no data (e.g., transfers when none exist) — should show empty state, not crash
- Custom date range with from > to — should handle gracefully
- Invalid searchParams (e.g., `?tab=bogus`) — should fall back to defaults

- [ ] **Step 4: Verify type safety**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete admin reports with charts, tables, export, and test seed"
```
