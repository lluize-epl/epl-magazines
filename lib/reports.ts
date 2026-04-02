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
  SubscriptionPeriod,
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
// Private helpers (continued)
// ---------------------------------------------------------------------------

/**
 * Fetches the SubscriptionPeriod record for the given `periodId`.
 * Returns `null` if the period does not exist.
 * @param periodId - The period's cuid
 */
async function fetchPeriod(periodId: string): Promise<SubscriptionPeriod | null> {
  const row = await db.subscriptionPeriod.findUnique({
    where: { id: periodId },
    select: { id: true, name: true, startDate: true, endDate: true, active: true, createdAt: true },
  })
  return row as SubscriptionPeriod | null
}

/**
 * Returns the effective `{ from, to }` date range for a query.
 * When a period is provided, it is used as the outer bound; `filters.from`/`filters.to`
 * can only narrow further within that period. Without a period, the preset range is used.
 * @param filters - Parsed report filters
 * @param period - The resolved period record, or null if not applicable
 */
function effectiveDateRange(
  filters: ReportFilters,
  period: SubscriptionPeriod | null
): { from: Date; to: Date } {
  if (!period) return { from: filters.from, to: filters.to }

  const periodStart = new Date(period.startDate)
  const periodEnd = new Date(period.endDate)

  // Intersect the period range with any narrower preset/custom filter
  const from = filters.from > periodStart ? filters.from : periodStart
  const to = filters.to < periodEnd ? filters.to : periodEnd

  return { from, to }
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
    ? new Date((params['from'] as string).split('T')[0] + 'T12:00:00Z')
    : startOfMonth(now)
  const customTo = params['to']
    ? new Date((params['to'] as string).split('T')[0] + 'T12:00:00Z')
    : endOfMonth(now)

  const { from, to } = resolveDateRange(period, customFrom, customTo)

  const periodId = typeof params['periodId'] === 'string' ? params['periodId'] : undefined

  return { tab, period, from, to, branch, language, periodId }
}

// ---------------------------------------------------------------------------
// 2. getReceiptSummary
// ---------------------------------------------------------------------------

/**
 * Queries IssueReceipt records within the filter date range and returns
 * per-magazine-per-branch receipt counts sorted by count descending.
 * When `filters.periodId` is set, the period date boundaries are used as the
 * outer date range; the existing preset filter can narrow further within that range.
 * @param filters - Parsed report filters (date range, branch, language)
 */
export async function getReceiptSummary(
  filters: ReportFilters
): Promise<ReceiptSummaryRow[]> {
  const period = filters.periodId ? await fetchPeriod(filters.periodId) : null
  const { from, to } = effectiveDateRange(filters, period)

  // TODO: improve typing
  const where: Record<string, unknown> = {
    receivedDate: {
      gte: from,
      lte: to,
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
 * When `filters.periodId` is set, evaluates overdue status against magazines
 * subscribed in that period (via MagazineSubscription); otherwise falls back to
 * BranchMagazine subscriptions.
 * Uses a single `findMany` + Map lookup to avoid N+1 queries when fetching
 * the latest receipt per subscription.
 * @param filters - Branch and language filters are applied; date range is ignored
 */
export async function getOverdueReport(filters: ReportFilters): Promise<{
  rows: OverdueReportRow[]
  totalOverdue: number
  onTimeRate: number
}> {
  if (filters.periodId) {
    return getOverdueReportForPeriod(filters, filters.periodId)
  }

  // ---------------------------------------------------------------------------
  // Default path: BranchMagazine-based
  // ---------------------------------------------------------------------------

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

/**
 * Period-scoped overdue report: checks overdue status for magazines in the given period's
 * MagazineSubscription list. Since MagazineSubscription has no per-branch data, we check
 * overdue status against all branches subscribed via BranchMagazine, filtered to those
 * magazines in the period.
 * @param filters - Report filters for branch/language
 * @param periodId - The subscription period cuid
 */
async function getOverdueReportForPeriod(
  filters: ReportFilters,
  periodId: string
): Promise<{ rows: OverdueReportRow[]; totalOverdue: number; onTimeRate: number }> {
  // Fetch all active MagazineSubscriptions in the period
  // TODO: improve typing
  const periodSubWhere: Record<string, unknown> = {
    periodId,
    active: true,
    magazine: { active: true },
  }
  if (filters.language !== 'all') {
    periodSubWhere['magazine'] = { active: true, language: filters.language }
  }

  const periodSubs = await db.magazineSubscription.findMany({
    where: periodSubWhere as Prisma.MagazineSubscriptionWhereInput,
    select: { magazineId: true },
  })

  if (periodSubs.length === 0) {
    return { rows: [], totalOverdue: 0, onTimeRate: 100 }
  }

  const periodMagazineIds = periodSubs.map((s) => s.magazineId)

  // Now find BranchMagazine records for those magazines
  // TODO: improve typing
  const bmWhere: Record<string, unknown> = {
    active: true,
    magazineId: { in: periodMagazineIds },
    branch: { active: true },
    magazine: { active: true },
  }
  if (filters.branch !== 'all') {
    bmWhere['branchId'] = filters.branch
  }
  if (filters.language !== 'all') {
    bmWhere['magazine'] = { active: true, language: filters.language }
  }

  const subscriptions = await db.branchMagazine.findMany({
    where: bmWhere as Prisma.BranchMagazineWhereInput,
    include: {
      branch: { select: { id: true, name: true } },
      magazine: { select: { id: true, name: true, cadence: true, language: true } },
    },
  })

  if (subscriptions.length === 0) {
    return { rows: [], totalOverdue: 0, onTimeRate: 100 }
  }

  const magazineIds = [...new Set(subscriptions.map((s) => s.magazineId))]
  const branchIds = [...new Set(subscriptions.map((s) => s.branchId))]

  const latestReceipts = await db.issueReceipt.findMany({
    where: {
      magazineId: { in: magazineIds },
      branchId: { in: branchIds },
    },
    orderBy: { receivedDate: 'desc' },
    select: { magazineId: true, branchId: true, receivedDate: true },
  })

  const latestMap = new Map<string, Date>()
  for (const r of latestReceipts) {
    const key = `${r.magazineId}__${r.branchId ?? '_none'}`
    if (!latestMap.has(key)) latestMap.set(key, r.receivedDate)
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
    const overdue = nextExpectedDate !== null && new Date(nextExpectedDate) < now
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
 * When `filters.periodId` is set, the period date boundaries are used as the
 * outer date range; the existing preset filter can narrow further.
 * @param filters - Parsed report filters
 */
export async function getTransferReport(filters: ReportFilters): Promise<{
  rows: TransferReportRow[]
  totalCount: number
  completedCount: number
  cancelledCount: number
}> {
  const period = filters.periodId ? await fetchPeriod(filters.periodId) : null
  const { from, to } = effectiveDateRange(filters, period)

  // TODO: improve typing
  const where: Record<string, unknown> = {
    createdAt: {
      gte: from,
      lte: to,
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
 * Returns subscription overview rows, optionally filtered by branch and language.
 *
 * - When `filters.periodId` is set: queries MagazineSubscription for that period and
 *   includes receipt counts within the period's date range plus `issuesPerYear`.
 *   Branch filter is still applied via BranchMagazine records for quantity/active.
 * - Without `filters.periodId`: returns all BranchMagazine subscription rows as before.
 *
 * Ordered by magazine name.
 * @param filters - Branch and language filters are applied; date range is ignored except in period mode
 */
export async function getSubscriptionOverview(
  filters: ReportFilters
): Promise<SubscriptionReportRow[]> {
  if (filters.periodId) {
    return getSubscriptionOverviewForPeriod(filters, filters.periodId)
  }

  // ---------------------------------------------------------------------------
  // Default path: BranchMagazine-based
  // ---------------------------------------------------------------------------

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

/**
 * Period-scoped subscription overview: queries MagazineSubscription for the given period,
 * joins with BranchMagazine for quantity/branch data, and counts receipts within the period.
 * @param filters - Branch and language filters are applied
 * @param periodId - The subscription period cuid
 */
async function getSubscriptionOverviewForPeriod(
  filters: ReportFilters,
  periodId: string
): Promise<SubscriptionReportRow[]> {
  const period = await fetchPeriod(periodId)
  if (!period) return []

  const periodStart = new Date(period.startDate)
  const periodEnd = new Date(period.endDate)

  // Fetch all active MagazineSubscriptions in this period
  // TODO: improve typing
  const msWhere: Record<string, unknown> = {
    periodId,
    active: true,
    magazine: { active: true },
  }
  if (filters.language !== 'all') {
    msWhere['magazine'] = { active: true, language: filters.language }
  }

  const magazineSubs = await db.magazineSubscription.findMany({
    where: msWhere as Prisma.MagazineSubscriptionWhereInput,
    include: {
      magazine: { select: { id: true, name: true, language: true, cadence: true } },
    },
    orderBy: { magazine: { name: 'asc' } },
  })

  if (magazineSubs.length === 0) return []

  const magazineIds = magazineSubs.map((s) => s.magazineId)

  // Fetch BranchMagazine records for quantity/branch info
  // TODO: improve typing
  const bmWhere: Record<string, unknown> = {
    magazineId: { in: magazineIds },
    active: true,
  }
  if (filters.branch !== 'all') {
    bmWhere['branchId'] = filters.branch
  }

  const branchMags = await db.branchMagazine.findMany({
    where: bmWhere as Prisma.BranchMagazineWhereInput,
    include: { branch: { select: { name: true } } },
  })

  // Build a Map: magazineId → first matching BranchMagazine (for qty/branch/active)
  const bmMap = new Map<string, { branchName: string; quantity: number; active: boolean }>()
  for (const bm of branchMags) {
    if (!bmMap.has(bm.magazineId)) {
      bmMap.set(bm.magazineId, {
        branchName: bm.branch.name,
        quantity: bm.quantity,
        active: bm.active,
      })
    }
  }

  // Batch-count receipts within the period date range per magazine
  const receiptCounts = await db.issueReceipt.groupBy({
    by: ['magazineId'],
    where: {
      magazineId: { in: magazineIds },
      receivedDate: { gte: periodStart, lte: periodEnd },
      ...(filters.branch !== 'all' ? { branchId: filters.branch } : {}),
    },
    _count: { id: true },
  })

  const receiptCountMap = new Map<string, number>()
  for (const r of receiptCounts) {
    receiptCountMap.set(r.magazineId, r._count.id)
  }

  return magazineSubs.map((ms) => {
    const bm = bmMap.get(ms.magazineId)
    return {
      magazineId: ms.magazineId,
      branchName: bm?.branchName ?? '(No branch)',
      magazineName: ms.magazine.name,
      language: ms.magazine.language,
      cadence: ms.magazine.cadence as CadenceType,
      quantity: bm?.quantity ?? 0,
      active: bm?.active ?? false,
      issuesPerYear: ms.issuesPerYear,
      receivedCount: receiptCountMap.get(ms.magazineId) ?? 0,
      periodName: period.name,
    }
  })
}

// ---------------------------------------------------------------------------
// 6. getReceiptTimeline
// ---------------------------------------------------------------------------

/**
 * Aggregates receipt counts into weekly or monthly buckets grouped by branch.
 * Auto-selects bucket type: ≤62 days → weekly, >62 days → monthly.
 * Weekly bucket key format: `yyyy-'W'II` (ISO week). Monthly: `yyyy-MM`.
 * When `filters.periodId` is set, the period date boundaries are used as the
 * outer date range; the existing preset filter can narrow further.
 * @param filters - Parsed report filters
 */
export async function getReceiptTimeline(filters: ReportFilters): Promise<{
  data: TimelineDataPoint[]
  bucketType: 'weekly' | 'monthly'
}> {
  const period = filters.periodId ? await fetchPeriod(filters.periodId) : null
  const { from, to } = effectiveDateRange(filters, period)

  const spanDays = differenceInDays(to, from)
  const bucketType: 'weekly' | 'monthly' = spanDays <= 62 ? 'weekly' : 'monthly'

  // TODO: improve typing
  const where: Record<string, unknown> = {
    receivedDate: {
      gte: from,
      lte: to,
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
