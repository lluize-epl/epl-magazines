import type { Metadata } from 'next'
import type { LucideIcon } from 'lucide-react'
import type { DashboardStatus, MagazineWithStatus, TransferWithDetails } from '@/types'
import { verifySession } from '@/lib/dal'
import db from '@/lib/db'
import { resolveActiveBranchId } from '@/lib/branch'
import { resolveActivePeriod } from '@/lib/period'
import { computeNextExpectedDate, getSubscriptionAwareStatus } from '@/lib/cadence'
import MagazineCard from '@/components/MagazineCard'
import TransferCard from '@/components/TransferCard'
import { AlertTriangle, Clock, BookOpen } from 'lucide-react'

export const metadata: Metadata = { title: 'Dashboard — EPL Magazine Tracker' }

interface SectionConfig {
  label: string
  description: string
  icon: LucideIcon
  color: string
  bg: string
  border: string
}

const SECTION_CONFIG: Record<DashboardStatus, SectionConfig> = {
  this_week: {
    label: 'Expected This Week',
    description: 'Due within the current week (Sun–Sat)',
    icon: Clock,
    color: 'oklch(0.55 0.15 78)',
    bg: 'oklch(0.97 0.022 85)',
    border: 'oklch(0.88 0.08 78)',
  },
  overdue: {
    label: 'Overdue',
    description: 'Past their expected delivery date',
    icon: AlertTriangle,
    color: 'oklch(0.56 0.225 27)',
    bg: 'oklch(0.97 0.020 27)',
    border: 'oklch(0.88 0.08 27)',
  },
}

const BUCKET_ORDER: DashboardStatus[] = ['this_week', 'overdue']

type Buckets = Record<DashboardStatus, MagazineWithStatus[]>

export default async function DashboardPage() {
  await verifySession()

  const [activeBranchId, activePeriod] = await Promise.all([
    resolveActiveBranchId(),
    resolveActivePeriod(),
  ])

  // Fetch branch name for title
  const currentBranch = await db.branch.findUnique({
    where: { id: activeBranchId },
    select: { name: true },
  })

  // Fetch pending incoming transfers for this branch
  const pendingTransfers = await db.transfer.findMany({
    where: { toBranchId: activeBranchId, status: 'PENDING' },
    include: {
      magazine: { select: { name: true } },
      fromBranch: { select: { name: true, code: true } },
      toBranch: { select: { name: true, code: true } },
      initiatedBy: { select: { name: true } },
      completedBy: { select: { name: true } },
      cancelledBy: { select: { name: true } },
    },
  }) as TransferWithDetails[]

  // Magazine IDs that have pending transfers — suppress their subscription cards
  const suppressedMagazineIds = new Set(pendingTransfers.map((t) => t.magazineId))

  // Get magazine IDs subscribed at this branch
  const branchSubscriptions = await db.branchMagazine.findMany({
    where: { branchId: activeBranchId, active: true },
    select: { magazineId: true },
  })
  const subscribedMagazineIds = branchSubscriptions.map((s) => s.magazineId)

  // Fetch only those magazines with branch-specific receipts (most recent)
  const magazines = await db.magazine.findMany({
    where: {
      id: { in: subscribedMagazineIds },
      active: true,
    },
    include: {
      receipts: {
        where: { branchId: activeBranchId },
        orderBy: { receivedDate: 'desc' as const },
        take: 1,
        include: { receivedBy: { select: { name: true } } },
      },
    },
    orderBy: { name: 'asc' },
  })

  // Period date boundaries
  const periodStart = new Date(activePeriod.startDate)
  const periodEnd = new Date(activePeriod.endDate)

  // Build per-magazine status using subscription-aware logic
  const processed: MagazineWithStatus[] = []
  let completedCount = 0
  let totalSubscribed = 0

  for (const mag of magazines) {
    if (suppressedMagazineIds.has(mag.id)) continue

    // Fetch subscription for this magazine in the active period
    const subscription = await db.magazineSubscription.findUnique({
      where: { magazineId_periodId: { magazineId: mag.id, periodId: activePeriod.id } },
      select: { issuesPerYear: true, active: true },
    })

    // Count receipts within the period's date range
    const periodReceipts = await db.issueReceipt.count({
      where: {
        magazineId: mag.id,
        branchId: activeBranchId,
        receivedDate: { gte: periodStart, lte: periodEnd },
      },
    })

    const issuesPerYear = subscription?.active ? subscription.issuesPerYear : null

    // Track totals for progress bar (only magazines with active subscriptions)
    if (issuesPerYear !== null) {
      totalSubscribed++
      const lastReceipt = mag.receipts[0] ?? null
      const lastReceivedDate = lastReceipt?.receivedDate ?? null
      const status = getSubscriptionAwareStatus(
        lastReceivedDate,
        mag.cadence,
        periodReceipts,
        issuesPerYear,
        activePeriod.startDate,
      )

      if (status === 'completed') {
        completedCount++
        continue // Don't show completed on dashboard
      }

      if (status === 'overdue' || status === 'this_week') {
        const anchor = lastReceivedDate ?? activePeriod.startDate
        const nextExpectedDate = computeNextExpectedDate(anchor, mag.cadence)
        const { receipts: _receipts, ...rest } = mag
        processed.push({ ...rest, lastReceivedDate, nextExpectedDate, status })
      }
      // 'upcoming', 'never_received', 'not_subscribed' are excluded from dashboard
    }
  }

  const buckets: Buckets = {
    this_week: processed.filter((m) => m.status === 'this_week'),
    overdue: processed.filter((m) => m.status === 'overdue'),
  }

  const totalOverdue = buckets.overdue.length
  const totalThisWeek = buckets.this_week.length + pendingTransfers.length

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Page header */}
      <div className="mb-8">
        <h1
          className="text-3xl font-bold mb-1"
          style={{ fontFamily: 'var(--font-playfair)', color: 'oklch(0.15 0.028 62)' }}
        >
          <span style={{ color: 'oklch(0.50 0.035 72)' }}>Dashboard for </span>
          {currentBranch && (
            <span className="underline" style={{ color: 'oklch(0.15 0.028 62)' }}>{currentBranch.name}</span>
          )}
        </h1>
        <p style={{ color: 'oklch(0.50 0.035 72)' }}>
          {totalThisWeek} expected this week
          {totalOverdue > 0 && (
            <span style={{ color: 'oklch(0.56 0.225 27)' }}>
              {' '}&middot; {totalOverdue} overdue
            </span>
          )}
          {pendingTransfers.length > 0 && (
            <span style={{ color: 'oklch(0.45 0.15 250)' }}>
              {' '}&middot; {pendingTransfers.length} incoming transfer{pendingTransfers.length !== 1 ? 's' : ''}
            </span>
          )}
        </p>
      </div>

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

      {/* Summary pills */}
      <div className="grid grid-cols-2 gap-3 mb-10">
        {BUCKET_ORDER.map((status) => {
          const cfg = SECTION_CONFIG[status]
          const Icon = cfg.icon
          const count = status === 'this_week'
            ? buckets[status].length + pendingTransfers.length
            : buckets[status].length
          return (
            <div
              key={status}
              className="rounded-lg px-4 py-3 border"
              style={{ backgroundColor: cfg.bg, borderColor: cfg.border }}
            >
              <div className="flex items-center gap-2 mb-0.5">
                <Icon size={14} style={{ color: cfg.color }} />
                <span className="text-xs font-medium" style={{ color: cfg.color }}>
                  {count}
                </span>
              </div>
              <p className="text-xs" style={{ color: 'oklch(0.50 0.035 72)' }}>
                {cfg.label}
              </p>
            </div>
          )
        })}
      </div>

      {/* Status sections */}
      <div className="space-y-10">
        {BUCKET_ORDER.map((status) => {
          const items = buckets[status]
          const transfers = status === 'this_week' ? pendingTransfers : []
          if (items.length === 0 && transfers.length === 0) return null
          const cfg = SECTION_CONFIG[status]
          const Icon = cfg.icon
          const totalCount = items.length + transfers.length
          return (
            <section key={status}>
              <div className="flex items-center gap-2 mb-4">
                <div
                  className="w-7 h-7 rounded-md flex items-center justify-center"
                  style={{ backgroundColor: cfg.bg, border: `1px solid ${cfg.border}` }}
                >
                  <Icon size={15} style={{ color: cfg.color }} />
                </div>
                <div>
                  <h2
                    className="text-base font-semibold leading-tight"
                    style={{ fontFamily: 'var(--font-playfair)', color: 'oklch(0.15 0.028 62)' }}
                  >
                    {cfg.label}
                    <span className="ml-2 text-sm font-normal" style={{ color: cfg.color }}>
                      ({totalCount})
                    </span>
                  </h2>
                  <p className="text-xs" style={{ color: 'oklch(0.55 0.030 72)' }}>
                    {cfg.description}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {transfers.map((t) => (
                  <TransferCard key={t.id} transfer={t} />
                ))}
                {items.map((magazine) => (
                  <MagazineCard key={magazine.id} magazine={magazine} activeBranchId={activeBranchId} />
                ))}
              </div>
            </section>
          )
        })}

        {processed.length === 0 && pendingTransfers.length === 0 && (
          <div className="text-center py-20" style={{ color: 'oklch(0.60 0.025 72)' }}>
            <BookOpen size={40} className="mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium" style={{ fontFamily: 'var(--font-playfair)' }}>
              No magazines expected right now
            </p>
            <p className="text-sm mt-1">Check back when deliveries are due this week.</p>
          </div>
        )}
      </div>
    </div>
  )
}
