/**
 * Report query builders for the EPL Magazine Tracker admin reports page.
 * Each function corresponds to one of the five report tabs.
 */

import {
  startOfMonth,
  endOfMonth,
  subMonths,
  startOfQuarter,
  endOfQuarter,
  startOfYear,
  endOfYear,
  differenceInDays,
  startOfWeek,
  format,
} from 'date-fns'
import db from '@/lib/db'
import { Prisma } from '../generated/prisma/client'
import { computeNextExpectedDate } from '@/lib/cadence'
import type {
  ReportFilters,
  ReportPeriod,
  ReportTab,
  ReceiptSummaryRow,
  OverdueReportRow,
  TransferReportRow,
  SubscriptionReportRow,
  TimelineDataPoint,
  CadenceType,
  TransferStatus,
} from '@/types'

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Resolves a `ReportPeriod` preset into a concrete `{ from, to }` date range.
 * For `'custom'`, the provided `from` / `to` values are passed through unchanged.
 * @param period - The period preset identifier
 * @param customFrom - Used only when period === 'custom'
 * @param customTo - Used only when period === 'custom'
 */
function resolveDateRange(
  period: ReportPeriod,
  customFrom: Date,
  customTo: Date
): { from: Date; to: Date } {
  const now = new Date()
  switch (period) {
    case 'this_month':
      return { from: startOfMonth(now), to: endOfMonth(now) }
    case 'last_month': {
      const last = subMonths(now, 1)
      return { from: startOfMonth(last), to: endOfMonth(last) }
    }
    case 'this_quarter':
      return { from: startOfQuarter(now), to: endOfQuarter(now) }
    case 'this_year':
      return { from: startOfYear(now), to: endOfYear(now) }
    case 'custom':
      return { from: customFrom, to: customTo }
    default:
      return { from: startOfMonth(now), to: endOfMonth(now) }
  }
}

// ---------------------------------------------------------------------------
// 1. parseReportFilters
// ---------------------------------------------------------------------------

/**
 * Parses URL `searchParams` (from the reports page) into a typed `ReportFilters` object.
 * Applies defaults: tab='receipts', period='this_month', branch='all', language='all'.
 * @param params - Record of raw string values from `searchParams`
 */
export function parseReportFilters(
  params: Record<string, string | string[] | undefined>
): ReportFilters {
  const tab = (params['tab'] as ReportTab | undefined) ?? 'receipts'
  const period = (params['period'] as ReportPeriod | undefined) ?? 'this_month'
  const branch = typeof params['branch'] === 'string' ? params['branch'] : 'all'
  const language = typeof params['language'] === 'string' ? params['language'] : 'all'

  // Parse custom date range if provided; fall back to current month boundaries
  const now = new Date()
  const customFrom = params['from']
    ? new Date(params['from'] as string)
    : startOfMonth(now)
  const customTo = params['to']
    ? new Date(params['to'] as string)
    : endOfMonth(now)

  const { from, to } = resolveDateRange(period, customFrom, customTo)

  return { tab, period, from, to, branch, language }
}

// ---------------------------------------------------------------------------
// 2. getReceiptSummary
// ---------------------------------------------------------------------------

/**
 * Queries IssueReceipt records within the filter date range and returns
 * per-magazine-per-branch receipt counts sorted by count descending.
 * @param filters - Parsed report filters (date range, branch, language)
 */
export async function getReceiptSummary(
  filters: ReportFilters
): Promise<ReceiptSummaryRow[]> {
  // TODO: improve typing
  const where: Record<string, unknown> = {
    receivedDate: {
      gte: filters.from,
      lte: filters.to,
    },
  }

  if (filters.branch !== 'all') {
    where['branchId'] = filters.branch
  }

  if (filters.language !== 'all') {
    where['magazine'] = { language: filters.language }
  }

  const receipts = await db.issueReceipt.findMany({
    where: where as Prisma.IssueReceiptWhereInput,
    include: {
      magazine: { select: { name: true, cadence: true, language: true } },
      branch: { select: { name: true } },
    },
    orderBy: { receivedDate: 'desc' },
  })

  // Group by magazineId + branchId
  const grouped = new Map<
    string,
    {
      magazineId: string
      magazineName: string
      language: string
      cadence: CadenceType
      branchName: string
      receiptCount: number
      lastReceivedDate: Date | null
    }
  >()

  for (const receipt of receipts) {
    const key = `${receipt.magazineId}__${receipt.branchId ?? '_none'}`
    const existing = grouped.get(key)
    if (existing) {
      existing.receiptCount += 1
      // receipts are ordered desc, so first encountered is the latest
    } else {
      grouped.set(key, {
        magazineId: receipt.magazineId,
        magazineName: receipt.magazine.name,
        language: receipt.magazine.language,
        cadence: receipt.magazine.cadence as CadenceType,
        branchName: receipt.branch?.name ?? '(No branch)',
        receiptCount: 1,
        lastReceivedDate: receipt.receivedDate,
      })
    }
  }

  const rows: ReceiptSummaryRow[] = Array.from(grouped.values()).map((g) => ({
    magazineId: g.magazineId,
    magazineName: g.magazineName,
    language: g.language,
    cadence: g.cadence,
    receiptCount: g.receiptCount,
    lastReceivedDate: g.lastReceivedDate,
    branchName: g.branchName,
  }))

  // Sort by receiptCount descending
  rows.sort((a, b) => b.receiptCount - a.receiptCount)

  return rows
}

// ---------------------------------------------------------------------------
// 3. getOverdueReport
// ---------------------------------------------------------------------------

/**
 * Snapshot report of currently overdue subscriptions (date filter does NOT apply).
 * Uses a single `findMany` + Map lookup to avoid N+1 queries when fetching
 * the latest receipt per subscription.
 * @param filters - Branch and language filters are applied; date range is ignored
 */
export async function getOverdueReport(filters: ReportFilters): Promise<{
  rows: OverdueReportRow[]
  totalOverdue: number
  onTimeRate: number
}> {
  // TODO: improve typing
  const subWhere: Record<string, unknown> = {
    active: true,
    branch: { active: true },
    magazine: { active: true },
  }

  if (filters.branch !== 'all') {
    subWhere['branchId'] = filters.branch
  }

  if (filters.language !== 'all') {
    subWhere['magazine'] = { active: true, language: filters.language }
  }

  const subscriptions = await db.branchMagazine.findMany({
    where: subWhere as Prisma.BranchMagazineWhereInput,
    include: {
      branch: { select: { id: true, name: true } },
      magazine: { select: { id: true, name: true, cadence: true, language: true } },
    },
  })

  if (subscriptions.length === 0) {
    return { rows: [], totalOverdue: 0, onTimeRate: 100 }
  }

  // Batch-fetch the latest receipt for every (magazineId, branchId) pair — single query
  const magazineIds = [...new Set(subscriptions.map((s) => s.magazineId))]
  const branchIds = [...new Set(subscriptions.map((s) => s.branchId))]

  const latestReceipts = await db.issueReceipt.findMany({
    where: {
      magazineId: { in: magazineIds },
      branchId: { in: branchIds },
    },
    orderBy: { receivedDate: 'desc' },
    select: {
      magazineId: true,
      branchId: true,
      receivedDate: true,
    },
  })

  // Build a Map keyed by "magazineId__branchId" → latest receivedDate
  const latestMap = new Map<string, Date>()
  for (const r of latestReceipts) {
    const key = `${r.magazineId}__${r.branchId ?? '_none'}`
    if (!latestMap.has(key)) {
      // findMany is ordered desc, first occurrence is the latest
      latestMap.set(key, r.receivedDate)
    }
  }

  const now = new Date()
  const rows: OverdueReportRow[] = []

  for (const sub of subscriptions) {
    const key = `${sub.magazineId}__${sub.branchId}`
    const lastReceivedDate = latestMap.get(key) ?? null
    const nextExpectedDate = computeNextExpectedDate(
      lastReceivedDate,
      sub.magazine.cadence as CadenceType
    )

    const overdue =
      nextExpectedDate !== null && new Date(nextExpectedDate) < now

    if (overdue) {
      rows.push({
        magazineId: sub.magazineId,
        magazineName: sub.magazine.name,
        language: sub.magazine.language,
        branchName: sub.branch.name,
        cadence: sub.magazine.cadence as CadenceType,
        daysOverdue: differenceInDays(now, new Date(nextExpectedDate!)),
        lastReceivedDate,
        nextExpectedDate,
      })
    }
  }

  // Sort by daysOverdue descending
  rows.sort((a, b) => b.daysOverdue - a.daysOverdue)

  const totalOverdue = rows.length
  const total = subscriptions.length
  const onTimeRate = total > 0 ? Math.round(((total - totalOverdue) / total) * 100) : 100

  return { rows, totalOverdue, onTimeRate }
}

// ---------------------------------------------------------------------------
// 4. getTransferReport
// ---------------------------------------------------------------------------

/**
 * Queries Transfer records within the filter date range and maps them to
 * display rows with resolved party names.
 * Branch filter applies via OR (fromBranchId OR toBranchId).
 * @param filters - Parsed report filters
 */
export async function getTransferReport(filters: ReportFilters): Promise<{
  rows: TransferReportRow[]
  totalCount: number
  completedCount: number
  cancelledCount: number
}> {
  // TODO: improve typing
  const where: Record<string, unknown> = {
    createdAt: {
      gte: filters.from,
      lte: filters.to,
    },
  }

  if (filters.branch !== 'all') {
    where['OR'] = [
      { fromBranchId: filters.branch },
      { toBranchId: filters.branch },
    ]
  }

  if (filters.language !== 'all') {
    where['magazine'] = { language: filters.language }
  }

  const transfers = await db.transfer.findMany({
    where: where as Prisma.TransferWhereInput,
    include: {
      magazine: { select: { name: true } },
      fromBranch: { select: { name: true } },
      toBranch: { select: { name: true } },
      initiatedBy: { select: { name: true } },
      completedBy: { select: { name: true } },
      cancelledBy: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  const rows: TransferReportRow[] = transfers.map((t) => {
    let resolvedBy: string | null = null
    if (t.status === 'COMPLETED' && t.completedBy) {
      resolvedBy = t.completedBy.name
    } else if (t.status === 'CANCELLED' && t.cancelledBy) {
      resolvedBy = t.cancelledBy.name
    }

    return {
      magazineId: t.magazineId,
      date: t.createdAt,
      magazineName: t.magazine.name,
      fromBranch: t.fromBranch.name,
      toBranch: t.toBranch.name,
      quantity: t.quantity,
      status: t.status as TransferStatus,
      initiatedBy: t.initiatedBy.name,
      resolvedBy,
    }
  })

  const totalCount = rows.length
  const completedCount = transfers.filter((t) => t.status === 'COMPLETED').length
  const cancelledCount = transfers.filter((t) => t.status === 'CANCELLED').length

  return { rows, totalCount, completedCount, cancelledCount }
}

// ---------------------------------------------------------------------------
// 5. getSubscriptionOverview
// ---------------------------------------------------------------------------

/**
 * Returns all BranchMagazine subscription rows, optionally filtered by branch
 * and language. Date filter does NOT apply. Ordered by branch name then magazine name.
 * @param filters - Branch and language filters are applied; date range is ignored
 */
export async function getSubscriptionOverview(
  filters: ReportFilters
): Promise<SubscriptionReportRow[]> {
  // TODO: improve typing
  const where: Record<string, unknown> = {}

  if (filters.branch !== 'all') {
    where['branchId'] = filters.branch
  }

  if (filters.language !== 'all') {
    where['magazine'] = { language: filters.language }
  }

  const subscriptions = await db.branchMagazine.findMany({
    where: where as Prisma.BranchMagazineWhereInput,
    include: {
      branch: { select: { name: true } },
      magazine: { select: { name: true, language: true, cadence: true } },
    },
    orderBy: [
      { branch: { name: 'asc' } },
      { magazine: { name: 'asc' } },
    ],
  })

  return subscriptions.map((s) => ({
    magazineId: s.magazineId,
    branchName: s.branch.name,
    magazineName: s.magazine.name,
    language: s.magazine.language,
    cadence: s.magazine.cadence as CadenceType,
    quantity: s.quantity,
    active: s.active,
  }))
}

// ---------------------------------------------------------------------------
// 6. getReceiptTimeline
// ---------------------------------------------------------------------------

/**
 * Aggregates receipt counts into weekly or monthly buckets grouped by branch.
 * Auto-selects bucket type: ≤62 days → weekly, >62 days → monthly.
 * Weekly bucket key format: `yyyy-'W'II` (ISO week). Monthly: `yyyy-MM`.
 * @param filters - Parsed report filters
 */
export async function getReceiptTimeline(filters: ReportFilters): Promise<{
  data: TimelineDataPoint[]
  bucketType: 'weekly' | 'monthly'
}> {
  const spanDays = differenceInDays(filters.to, filters.from)
  const bucketType: 'weekly' | 'monthly' = spanDays <= 62 ? 'weekly' : 'monthly'

  // TODO: improve typing
  const where: Record<string, unknown> = {
    receivedDate: {
      gte: filters.from,
      lte: filters.to,
    },
  }

  if (filters.branch !== 'all') {
    where['branchId'] = filters.branch
  }

  if (filters.language !== 'all') {
    where['magazine'] = { language: filters.language }
  }

  const receipts = await db.issueReceipt.findMany({
    where: where as Prisma.IssueReceiptWhereInput,
    include: {
      branch: { select: { name: true } },
    },
    orderBy: { receivedDate: 'asc' },
  })

  // Group by period + branchName
  const grouped = new Map<string, number>()

  for (const receipt of receipts) {
    const branchName = receipt.branch?.name ?? '(No branch)'
    let period: string

    if (bucketType === 'weekly') {
      const weekStart = startOfWeek(receipt.receivedDate, { weekStartsOn: 1 })
      period = format(weekStart, "yyyy-'W'II")
    } else {
      period = format(receipt.receivedDate, 'yyyy-MM')
    }

    const key = `${period}__${branchName}`
    grouped.set(key, (grouped.get(key) ?? 0) + 1)
  }

  const data: TimelineDataPoint[] = Array.from(grouped.entries()).map(
    ([key, count]) => {
      const separatorIndex = key.indexOf('__')
      const period = key.slice(0, separatorIndex)
      const branchName = key.slice(separatorIndex + 2)
      return { period, branchName, count }
    }
  )

  // Sort by period then branch
  data.sort((a, b) => {
    if (a.period !== b.period) return a.period.localeCompare(b.period)
    return a.branchName.localeCompare(b.branchName)
  })

  return { data, bucketType }
}

// ---------------------------------------------------------------------------
// 7. getAvailableLanguages
// ---------------------------------------------------------------------------

/**
 * Returns a sorted list of all distinct magazine languages in the database.
 * Used to populate the language filter dropdown on the reports page.
 */
export async function getAvailableLanguages(): Promise<string[]> {
  const results = await db.magazine.findMany({
    select: { language: true },
    distinct: ['language'],
    orderBy: { language: 'asc' },
  })
  return results.map((r) => r.language)
}
