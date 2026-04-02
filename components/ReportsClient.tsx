'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { toLocalDate } from '@/lib/utils'
import { Download } from 'lucide-react'
import type {
  Branch,
  SubscriptionPeriod,
  ReportFilters,
  ReportTab,
  ReportPeriod,
  ReceiptSummaryRow,
  OverdueReportRow,
  TransferReportRow,
  SubscriptionReportRow,
  TimelineDataPoint,
  TransferStatus,
} from '@/types'
import { CADENCE_LABELS } from '@/lib/cadence'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { ReceiptBarChart, TimelineLineChart } from './ReportsCharts'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Props for the ReportsClient component. */
export interface ReportsClientProps {
  /** Current parsed filter state from URL searchParams. */
  filters: ReportFilters
  /** Active branches for the branch filter dropdown. */
  branches: Branch[]
  /** Subscription periods for the period filter dropdown. */
  periods: SubscriptionPeriod[]
  /** Available magazine languages for the language filter dropdown. */
  languages: string[]
  /** Receipt summary rows (only populated when tab === 'receipts'). */
  receiptSummary: ReceiptSummaryRow[] | null
  /** Overdue report data (only populated when tab === 'overdue'). */
  overdueReport: { rows: OverdueReportRow[]; totalOverdue: number; onTimeRate: number } | null
  /** Transfer report data (only populated when tab === 'transfers'). */
  transferReport: { rows: TransferReportRow[]; totalCount: number; completedCount: number; cancelledCount: number } | null
  /** Subscription overview rows (only populated when tab === 'subscriptions'). */
  subscriptionOverview: SubscriptionReportRow[] | null
  /** Receipt timeline data (only populated when tab === 'timeline'). */
  receiptTimeline: { data: TimelineDataPoint[]; bucketType: 'weekly' | 'monthly' } | null
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Period preset options displayed as filter buttons. */
const PERIOD_OPTIONS: { value: ReportPeriod; label: string }[] = [
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'this_quarter', label: 'This Quarter' },
  { value: 'this_year', label: 'This Year' },
  { value: 'custom', label: 'Custom' },
]

/** Tab options rendered as a secondary button row. */
const TAB_OPTIONS: { value: ReportTab; label: string }[] = [
  { value: 'receipts', label: 'Receipts' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'transfers', label: 'Transfers' },
  { value: 'subscriptions', label: 'Subscriptions' },
  { value: 'timeline', label: 'Timeline' },
]

/** Badge colour tokens keyed by transfer status. */
const STATUS_COLORS: Record<TransferStatus, { bg: string; color: string; border: string }> = {
  PENDING: {
    bg: 'oklch(0.55 0.15 78 / 0.10)',
    color: 'oklch(0.50 0.15 78)',
    border: 'oklch(0.55 0.15 78 / 0.25)',
  },
  COMPLETED: {
    bg: 'oklch(0.45 0.10 155 / 0.10)',
    color: 'oklch(0.40 0.10 155)',
    border: 'oklch(0.45 0.10 155 / 0.25)',
  },
  CANCELLED: {
    bg: 'oklch(0.56 0.225 27 / 0.10)',
    color: 'oklch(0.50 0.20 27)',
    border: 'oklch(0.56 0.225 27 / 0.25)',
  },
}

/** Badge colour tokens for active/inactive subscription status. */
const ACTIVE_COLORS = {
  active: {
    bg: 'oklch(0.45 0.10 155 / 0.10)',
    color: 'oklch(0.40 0.10 155)',
    border: 'oklch(0.45 0.10 155 / 0.25)',
  },
  inactive: {
    bg: 'oklch(0.56 0.225 27 / 0.10)',
    color: 'oklch(0.50 0.20 27)',
    border: 'oklch(0.56 0.225 27 / 0.25)',
  },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Formats a date for display in report tables.
 * @param date - Date, ISO string, or null
 * @returns Formatted string like "Mar 20, 2026" or an em-dash for null
 */
function fmt(date: Date | string | null): string {
  const d = toLocalDate(date)
  return d ? format(d, 'MMM d, yyyy') : '—'
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Client component for the admin reports page.
 * Renders filter controls (period, branch, language), tab navigation,
 * and the active tab's data table.
 */
export default function ReportsClient({
  filters,
  branches,
  periods,
  languages,
  receiptSummary,
  overdueReport,
  transferReport,
  subscriptionOverview,
  receiptTimeline,
}: ReportsClientProps) {
  const router = useRouter()

  /**
   * Builds a URL path for the reports page with merged filter overrides.
   * Omits default values (tab='receipts', period='this_month', branch/language='all')
   * to keep URLs clean.
   */
  function buildUrl(overrides: Record<string, string>): string {
    const params = new URLSearchParams()
    const merged: Record<string, string> = {
      tab: filters.tab,
      period: filters.period,
      branch: filters.branch,
      language: filters.language,
      ...(filters.periodId ? { periodId: filters.periodId } : {}),
      ...(filters.period === 'custom' ? {
        from: filters.from.toISOString().split('T')[0],
        to: filters.to.toISOString().split('T')[0],
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

  /** Builds the export URL by mirroring the current filter params. */
  function buildExportUrl(): string {
    const params = new URLSearchParams()
    params.set('tab', filters.tab)
    params.set('period', filters.period)
    if (filters.branch !== 'all') params.set('branch', filters.branch)
    if (filters.language !== 'all') params.set('language', filters.language)
    if (filters.period === 'custom') {
      params.set('from', format(filters.from, 'yyyy-MM-dd'))
      params.set('to', format(filters.to, 'yyyy-MM-dd'))
    }
    if (filters.periodId) params.set('periodId', filters.periodId)
    return `/admin/reports/export?${params.toString()}`
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <>
      {/* Header row */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1
            className="text-3xl font-bold mb-1"
            style={{ fontFamily: 'var(--font-playfair)', color: 'oklch(0.15 0.028 62)' }}
          >
            Reports
          </h1>
          <p style={{ color: 'oklch(0.50 0.035 72)' }}>
            Analyze receipts, overdue items, transfers, and trends 
          </p>
        </div>
        <a href={buildExportUrl()}>
          <Button
            variant="outline"
            className="gap-2"
            style={{
              borderColor: 'oklch(0.38 0.082 156 / 0.30)',
              color: 'oklch(0.38 0.082 156)',
            }}
          >
            <Download size={16} /> Export CSV
          </Button>
        </a>
      </div>

      {/* Period filter bar */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        {PERIOD_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => router.push(buildUrl({ period: opt.value }))}
            className="px-3 py-1.5 rounded-full text-xs font-medium transition-all border cursor-pointer"
            style={{
              backgroundColor: filters.period === opt.value
                ? 'oklch(0.38 0.082 156)'
                : 'oklch(0.978 0.009 88)',
              color: filters.period === opt.value
                ? 'oklch(0.978 0.009 88)'
                : 'oklch(0.45 0.035 72)',
              borderColor: filters.period === opt.value
                ? 'oklch(0.38 0.082 156)'
                : 'oklch(0.876 0.016 88)',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Custom date range inputs (visible when period === 'custom') */}
      {filters.period === 'custom' && (
        <div className="flex items-center gap-3 mb-4">
          <label className="text-sm" style={{ color: 'oklch(0.45 0.035 72)' }}>From</label>
          <Input
            type="date"
            className="w-40 cursor-pointer"
            value={filters.from.toISOString().split('T')[0]}
            onChange={(e) => {
              if (e.target.value) {
                router.push(buildUrl({ period: 'custom', from: e.target.value }))
              }
            }}
          />
          <label className="text-sm" style={{ color: 'oklch(0.45 0.035 72)' }}>To</label>
          <Input
            type="date"
            className="w-40 cursor-pointer"
            value={filters.to.toISOString().split('T')[0]}
            onChange={(e) => {
              if (e.target.value) {
                router.push(buildUrl({ period: 'custom', to: e.target.value }))
              }
            }}
          />
        </div>
      )}

      {/* Subscription Period + Branch + Language selects */}
      <div className="flex items-center gap-3 mb-6">
        {periods.length > 0 && (
          <Select
            value={filters.periodId ?? ''}
            onValueChange={(v) => router.push(buildUrl({ periodId: v ?? '' }))}
          >
            <SelectTrigger className="cursor-pointer">
              <SelectValue>
                {filters.periodId
                  ? periods.find((p) => p.id === filters.periodId)?.name ?? 'All Periods'
                  : 'All Periods'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {periods.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select
          value={filters.branch}
          onValueChange={(v) => router.push(buildUrl({ branch: v ?? 'all' }))}
        >
          <SelectTrigger className="cursor-pointer">
            <SelectValue>
              {filters.branch === 'all'
                ? 'All Branches'
                : branches.find((b) => b.id === filters.branch)?.name ?? 'All Branches'}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Branches</SelectItem>
            {branches.map((b) => (
              <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.language}
          onValueChange={(v) => router.push(buildUrl({ language: v ?? 'all' }))}
        >
          <SelectTrigger className="cursor-pointer">
            <SelectValue>
              {filters.language === 'all' ? 'All Languages' : filters.language}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Languages</SelectItem>
            {languages.map((lang) => (
              <SelectItem key={lang} value={lang}>{lang}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 mb-6 border-b" style={{ borderColor: 'oklch(0.876 0.016 88)' }}>
        {TAB_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => router.push(buildUrl({ tab: opt.value }))}
            className="px-4 py-2 text-sm font-medium transition-colors relative cursor-pointer"
            style={{
              color: filters.tab === opt.value
                ? 'oklch(0.38 0.082 156)'
                : 'oklch(0.50 0.035 72)',
              borderBottom: filters.tab === opt.value
                ? '2px solid oklch(0.38 0.082 156)'
                : '2px solid transparent',
              marginBottom: '-1px',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Content area — conditional rendering based on active tab */}
      {filters.tab === 'receipts' && (
        <>
          {receiptSummary && receiptSummary.length > 0 && (
            <div className="mb-6">
              <ReceiptBarChart
                data={receiptSummary}
                singleBranch={filters.branch !== 'all'}
              />
            </div>
          )}
          <ReceiptsTable rows={receiptSummary} />
        </>
      )}
      {filters.tab === 'overdue' && (
        <OverdueSection data={overdueReport} />
      )}
      {filters.tab === 'transfers' && (
        <TransfersSection data={transferReport} />
      )}
      {filters.tab === 'subscriptions' && (
        <SubscriptionsTable rows={subscriptionOverview} />
      )}
      {filters.tab === 'timeline' && (
        <>
          {receiptTimeline && receiptTimeline.data.length > 0 && (
            <div className="mb-6">
              <TimelineLineChart
                data={receiptTimeline.data}
                bucketType={receiptTimeline.bucketType}
              />
            </div>
          )}
          <TimelineTable data={receiptTimeline} />
        </>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Tab content sub-components
// ---------------------------------------------------------------------------

/** Renders the receipt summary table. */
function ReceiptsTable({ rows }: { rows: ReceiptSummaryRow[] | null }) {
  if (!rows || rows.length === 0) {
    return <EmptyState message="No receipts found for the selected period" />
  }

  return (
    <div
      className="rounded-lg border overflow-hidden"
      style={{ borderColor: 'oklch(0.876 0.016 88)', backgroundColor: 'oklch(0.978 0.009 88)' }}
    >
      <Table>
        <TableHeader>
          <TableRow style={{ borderColor: 'oklch(0.876 0.016 88)', backgroundColor: 'oklch(0.963 0.012 91)' }}>
            {['Magazine', 'Language', 'Cadence', 'Receipts', 'Last Received', 'Branch'].map((h) => (
              <TableHead key={h} className="font-semibold" style={{ color: 'oklch(0.30 0.028 62)' }}>
                {h}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow
              key={`${row.magazineId}-${row.branchName}-${i}`}
              className="hover:bg-black/[0.02] transition-colors"
              style={{ borderColor: 'oklch(0.900 0.012 88)' }}
            >
              <TableCell>
                <Link
                  href={`/magazines/${row.magazineId}`}
                  className="font-medium hover:underline cursor-pointer"
                  style={{ fontFamily: 'var(--font-playfair)', color: 'oklch(0.15 0.028 62)' }}
                >
                  {row.magazineName}
                </Link>
              </TableCell>
              <TableCell>
                <span className="text-sm" style={{ color: 'oklch(0.35 0.028 62)' }}>
                  {row.language}
                </span>
              </TableCell>
              <TableCell>
                <CadenceBadge cadence={row.cadence} />
              </TableCell>
              <TableCell>
                <span className="text-sm font-semibold" style={{ color: 'oklch(0.20 0.028 62)' }}>
                  {row.receiptCount}
                </span>
              </TableCell>
              <TableCell>
                <span className="text-xs" style={{ color: 'oklch(0.55 0.030 72)' }}>
                  {fmt(row.lastReceivedDate)}
                </span>
              </TableCell>
              <TableCell>
                <span className="text-sm" style={{ color: 'oklch(0.35 0.028 62)' }}>
                  {row.branchName}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

/** Renders the overdue report with summary cards and table. */
function OverdueSection({ data }: { data: { rows: OverdueReportRow[]; totalOverdue: number; onTimeRate: number } | null }) {
  if (!data) {
    return <EmptyState message="No overdue data available" />
  }

  return (
    <>
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <Card>
          <CardContent className="pt-2">
            <p className="text-sm" style={{ color: 'oklch(0.50 0.035 72)' }}>Total Overdue</p>
            <p
              className="text-3xl font-bold"
              style={{ fontFamily: 'var(--font-playfair)', color: 'oklch(0.56 0.225 27)' }}
            >
              {data.totalOverdue}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-2">
            <p className="text-sm" style={{ color: 'oklch(0.50 0.035 72)' }}>On-Time Rate</p>
            <p
              className="text-3xl font-bold"
              style={{ fontFamily: 'var(--font-playfair)', color: 'oklch(0.38 0.082 156)' }}
            >
              {data.onTimeRate}%
            </p>
          </CardContent>
        </Card>
      </div>

      {data.rows.length === 0 ? (
        <EmptyState message="All subscriptions are on time" />
      ) : (
        <div
          className="rounded-lg border overflow-hidden"
          style={{ borderColor: 'oklch(0.876 0.016 88)', backgroundColor: 'oklch(0.978 0.009 88)' }}
        >
          <Table>
            <TableHeader>
              <TableRow style={{ borderColor: 'oklch(0.876 0.016 88)', backgroundColor: 'oklch(0.963 0.012 91)' }}>
                {['Magazine', 'Language', 'Branch', 'Cadence', 'Days Overdue', 'Last Received', 'Next Expected'].map((h) => (
                  <TableHead key={h} className="font-semibold" style={{ color: 'oklch(0.30 0.028 62)' }}>
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((row, i) => (
                <TableRow
                  key={`${row.magazineId}-${row.branchName}-${i}`}
                  className="hover:bg-black/[0.02] transition-colors"
                  style={{ borderColor: 'oklch(0.900 0.012 88)' }}
                >
                  <TableCell>
                    <Link
                      href={`/magazines/${row.magazineId}`}
                      className="font-medium hover:underline cursor-pointer"
                      style={{ fontFamily: 'var(--font-playfair)', color: 'oklch(0.15 0.028 62)' }}
                    >
                      {row.magazineName}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm" style={{ color: 'oklch(0.35 0.028 62)' }}>
                      {row.language}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm" style={{ color: 'oklch(0.35 0.028 62)' }}>
                      {row.branchName}
                    </span>
                  </TableCell>
                  <TableCell>
                    <CadenceBadge cadence={row.cadence} />
                  </TableCell>
                  <TableCell>
                    <span
                      className="text-sm font-semibold"
                      style={{ color: 'oklch(0.56 0.225 27)' }}
                    >
                      {row.daysOverdue}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs" style={{ color: 'oklch(0.55 0.030 72)' }}>
                      {fmt(row.lastReceivedDate)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs" style={{ color: 'oklch(0.55 0.030 72)' }}>
                      {fmt(row.nextExpectedDate)}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  )
}

/** Renders the transfer activity table with summary counts. */
function TransfersSection({ data }: { data: { rows: TransferReportRow[]; totalCount: number; completedCount: number; cancelledCount: number } | null }) {
  if (!data || data.rows.length === 0) {
    return <EmptyState message="No transfers found for the selected period" />
  }

  return (
    <>
      <div
        className="rounded-lg border overflow-hidden"
        style={{ borderColor: 'oklch(0.876 0.016 88)', backgroundColor: 'oklch(0.978 0.009 88)' }}
      >
        <Table>
          <TableHeader>
            <TableRow style={{ borderColor: 'oklch(0.876 0.016 88)', backgroundColor: 'oklch(0.963 0.012 91)' }}>
              {['Date', 'Magazine', 'From', 'To', 'Qty', 'Status', 'Initiated By', 'Resolved By'].map((h) => (
                <TableHead key={h} className="font-semibold" style={{ color: 'oklch(0.30 0.028 62)' }}>
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.rows.map((row, i) => {
              const statusStyle = STATUS_COLORS[row.status]
              return (
                <TableRow
                  key={`${row.magazineId}-${row.fromBranch}-${i}`}
                  className="hover:bg-black/[0.02] transition-colors"
                  style={{ borderColor: 'oklch(0.900 0.012 88)' }}
                >
                  <TableCell>
                    <span className="text-xs" style={{ color: 'oklch(0.55 0.030 72)' }}>
                      {fmt(row.date)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/magazines/${row.magazineId}`}
                      className="font-medium hover:underline cursor-pointer"
                      style={{ fontFamily: 'var(--font-playfair)', color: 'oklch(0.15 0.028 62)' }}
                    >
                      {row.magazineName}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm" style={{ color: 'oklch(0.35 0.028 62)' }}>
                      {row.fromBranch}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm" style={{ color: 'oklch(0.35 0.028 62)' }}>
                      {row.toBranch}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm font-semibold" style={{ color: 'oklch(0.20 0.028 62)' }}>
                      {row.quantity}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className="text-xs"
                      style={{
                        backgroundColor: statusStyle.bg,
                        color: statusStyle.color,
                        borderColor: statusStyle.border,
                      }}
                    >
                      {row.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm" style={{ color: 'oklch(0.45 0.028 62)' }}>
                      {row.initiatedBy}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm" style={{ color: 'oklch(0.45 0.028 62)' }}>
                      {row.resolvedBy ?? '—'}
                    </span>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {/* Summary row */}
      <div className="flex items-center gap-6 mt-4 text-sm" style={{ color: 'oklch(0.45 0.035 72)' }}>
        <span>Total: <strong style={{ color: 'oklch(0.20 0.028 62)' }}>{data.totalCount}</strong></span>
        <span>Completed: <strong style={{ color: 'oklch(0.40 0.10 155)' }}>{data.completedCount}</strong></span>
        <span>Cancelled: <strong style={{ color: 'oklch(0.50 0.20 27)' }}>{data.cancelledCount}</strong></span>
      </div>
    </>
  )
}

/** Renders the subscription overview table. Shows received/expected column in period mode. */
function SubscriptionsTable({ rows }: { rows: SubscriptionReportRow[] | null }) {
  if (!rows || rows.length === 0) {
    return <EmptyState message="No subscriptions found" />
  }

  // Detect period mode: any row has issuesPerYear set
  const isPeriodMode = rows.some((r) => r.issuesPerYear !== undefined)
  const headers = isPeriodMode
    ? ['Branch', 'Magazine', 'Language', 'Cadence', 'Qty', 'Received / Expected', 'Status']
    : ['Branch', 'Magazine', 'Language', 'Cadence', 'Qty', 'Status']

  return (
    <div
      className="rounded-lg border overflow-hidden"
      style={{ borderColor: 'oklch(0.876 0.016 88)', backgroundColor: 'oklch(0.978 0.009 88)' }}
    >
      {isPeriodMode && rows[0]?.periodName && (
        <div
          className="px-4 py-2 text-xs font-medium border-b"
          style={{
            backgroundColor: 'oklch(0.963 0.012 91)',
            borderColor: 'oklch(0.876 0.016 88)',
            color: 'oklch(0.45 0.035 72)',
          }}
        >
          Period: {rows[0].periodName}
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow style={{ borderColor: 'oklch(0.876 0.016 88)', backgroundColor: 'oklch(0.963 0.012 91)' }}>
            {headers.map((h) => (
              <TableHead key={h} className="font-semibold" style={{ color: 'oklch(0.30 0.028 62)' }}>
                {h}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, i) => {
            const activeStyle = row.active ? ACTIVE_COLORS.active : ACTIVE_COLORS.inactive
            return (
              <TableRow
                key={`${row.branchName}-${row.magazineId}-${i}`}
                className="hover:bg-black/[0.02] transition-colors"
                style={{
                  borderColor: 'oklch(0.900 0.012 88)',
                  opacity: row.active ? 1 : 0.55,
                }}
              >
                <TableCell>
                  <span className="text-sm" style={{ color: 'oklch(0.35 0.028 62)' }}>
                    {row.branchName}
                  </span>
                </TableCell>
                <TableCell>
                  <Link
                    href={`/magazines/${row.magazineId}`}
                    className="font-medium hover:underline cursor-pointer"
                    style={{ fontFamily: 'var(--font-playfair)', color: 'oklch(0.15 0.028 62)' }}
                  >
                    {row.magazineName}
                  </Link>
                </TableCell>
                <TableCell>
                  <span className="text-sm" style={{ color: 'oklch(0.35 0.028 62)' }}>
                    {row.language}
                  </span>
                </TableCell>
                <TableCell>
                  <CadenceBadge cadence={row.cadence} />
                </TableCell>
                <TableCell>
                  <span className="text-sm font-semibold" style={{ color: 'oklch(0.20 0.028 62)' }}>
                    {row.quantity}
                  </span>
                </TableCell>
                {isPeriodMode && (
                  <TableCell>
                    <span className="text-sm font-semibold" style={{ color: 'oklch(0.20 0.028 62)' }}>
                      {row.receivedCount ?? 0}
                    </span>
                    <span className="text-xs" style={{ color: 'oklch(0.55 0.030 72)' }}>
                      {' '}/ {row.issuesPerYear ?? '?'}
                    </span>
                  </TableCell>
                )}
                <TableCell>
                  <Badge
                    variant="outline"
                    className="text-xs"
                    style={{
                      backgroundColor: activeStyle.bg,
                      color: activeStyle.color,
                      borderColor: activeStyle.border,
                    }}
                  >
                    {row.active ? 'Active' : 'Inactive'}
                  </Badge>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

/** Renders the receipt timeline as a data table (charts added in Task 7). */
function TimelineTable({ data }: { data: { data: TimelineDataPoint[]; bucketType: 'weekly' | 'monthly' } | null }) {
  if (!data || data.data.length === 0) {
    return <EmptyState message="No timeline data for the selected period" />
  }

  return (
    <div
      className="rounded-lg border overflow-hidden"
      style={{ borderColor: 'oklch(0.876 0.016 88)', backgroundColor: 'oklch(0.978 0.009 88)' }}
    >
      <Table>
        <TableHeader>
          <TableRow style={{ borderColor: 'oklch(0.876 0.016 88)', backgroundColor: 'oklch(0.963 0.012 91)' }}>
            {['Period', 'Branch', 'Count'].map((h) => (
              <TableHead key={h} className="font-semibold" style={{ color: 'oklch(0.30 0.028 62)' }}>
                {h}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.data.map((point, i) => (
            <TableRow
              key={`${point.period}-${point.branchName}-${i}`}
              className="hover:bg-black/[0.02] transition-colors"
              style={{ borderColor: 'oklch(0.900 0.012 88)' }}
            >
              <TableCell>
                <span className="text-sm font-medium" style={{ color: 'oklch(0.20 0.028 62)' }}>
                  {point.period}
                </span>
              </TableCell>
              <TableCell>
                <span className="text-sm" style={{ color: 'oklch(0.35 0.028 62)' }}>
                  {point.branchName}
                </span>
              </TableCell>
              <TableCell>
                <span className="text-sm font-semibold" style={{ color: 'oklch(0.20 0.028 62)' }}>
                  {point.count}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared UI fragments
// ---------------------------------------------------------------------------

/** Renders a cadence badge with the standard green styling. */
function CadenceBadge({ cadence }: { cadence: string }) {
  return (
    <Badge
      variant="outline"
      className="text-xs"
      style={{
        backgroundColor: 'oklch(0.38 0.082 156 / 0.08)',
        color: 'oklch(0.38 0.082 156)',
        borderColor: 'oklch(0.38 0.082 156 / 0.20)',
      }}
    >
      {CADENCE_LABELS[cadence as keyof typeof CADENCE_LABELS] ?? cadence}
    </Badge>
  )
}

/** Centered empty state with muted text. */
function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-20" style={{ color: 'oklch(0.60 0.025 72)' }}>
      <p className="text-lg font-medium" style={{ fontFamily: 'var(--font-playfair)' }}>
        {message}
      </p>
    </div>
  )
}
