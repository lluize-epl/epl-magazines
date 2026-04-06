import type { Metadata } from 'next'
import type { LucideIcon } from 'lucide-react'
import type { CadenceType, DashboardStatus, MagazineWithStatus, TransferWithDetails } from '@/types'
import { verifySession } from '@/lib/dal'
import db from '@/lib/db'
import { resolveActiveBranchId } from '@/lib/branch'
import { computeNextExpectedDate, getSubscriptionAwareStatus, CADENCE_LABELS } from '@/lib/cadence'
import { getActivePeriods } from '@/lib/period'
import MagazineCard from '@/components/MagazineCard'
import TransferCard from '@/components/TransferCard'
import CollapsibleSection from '@/components/CollapsibleSection'
import { AlertTriangle, Clock, BookOpen } from 'lucide-react'

export const metadata: Metadata = { title: 'Dashboard — EPL Magazine Tracker' }

interface SectionConfig {
  label: string
  description: string
  icon: LucideIcon
  iconName: 'clock' | 'alert-triangle'
  color: string
  bg: string
  border: string
}

const SECTION_CONFIG: Record<DashboardStatus, SectionConfig> = {
  this_week: {
    label: 'Expected This Week',
    description: 'Due within the current week (Sun–Sat)',
    icon: Clock,
    iconName: 'clock',
    color: 'oklch(0.55 0.15 78)',
    bg: 'oklch(0.97 0.022 85)',
    border: 'oklch(0.88 0.08 78)',
  },
  overdue: {
    label: 'Overdue',
    description: 'Past their expected delivery date',
    icon: AlertTriangle,
    iconName: 'alert-triangle',
    color: 'oklch(0.56 0.225 27)',
    bg: 'oklch(0.97 0.020 27)',
    border: 'oklch(0.88 0.08 27)',
  },
}

const BUCKET_ORDER: DashboardStatus[] = ['this_week', 'overdue']

/** A dashboard card with associated period info */
interface DashboardCard {
  magazine: MagazineWithStatus
  periodName: string
}

export default async function DashboardPage() {
  await verifySession()

  const [activeBranchId, activePeriods] = await Promise.all([
    resolveActiveBranchId(),
    getActivePeriods(),
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

  // For each active period, fetch subscribed magazines and compute status
  const periodData = await Promise.all(activePeriods.map(async (period) => {
    const subscriptions = await db.magazineSubscription.findMany({
      where: {
        periodId: period.id,
        active: true,
        magazine: {
          active: true,
          branches: { some: { branchId: activeBranchId, active: true } },
        },
      },
      include: {
        magazine: {
          include: {
            receipts: {
              where: { branchId: activeBranchId },
              orderBy: { receivedDate: 'desc' as const },
              take: 1,
              include: { receivedBy: { select: { name: true } } },
            },
          },
        },
      },
    })

    let totalIssues = 0
    let totalReceived = 0
    const cards: DashboardCard[] = []

    for (const sub of subscriptions) {
      if (suppressedMagazineIds.has(sub.magazineId)) continue

      const periodStart = new Date(period.startDate)
      const periodEnd = new Date(period.endDate)

      const receiptCount = await db.issueReceipt.count({
        where: {
          magazineId: sub.magazineId,
          branchId: activeBranchId,
          receivedDate: { gte: periodStart, lte: periodEnd },
        },
      })

      totalIssues += sub.issuesPerYear
      totalReceived += receiptCount

      const lastReceipt = sub.magazine.receipts[0] ?? null
      const lastReceivedDate = lastReceipt?.receivedDate ?? null

      const status = getSubscriptionAwareStatus(
        lastReceivedDate,
        sub.magazine.cadence as CadenceType,
        receiptCount,
        sub.issuesPerYear,
        period.startDate,
      )

      if (status === 'completed') continue // Don't show completed on dashboard

      if (status === 'overdue' || status === 'this_week') {
        const anchor = lastReceivedDate ?? period.startDate
        const nextExpectedDate = computeNextExpectedDate(anchor, sub.magazine.cadence as CadenceType)
        const { receipts: _receipts, ...magRest } = sub.magazine

        cards.push({
          magazine: {
            ...magRest,
            cadence: magRest.cadence as CadenceType,
            lastReceivedDate,
            nextExpectedDate,
            status,
          },
          periodName: period.name,
        })
      }
    }

    return { period, totalIssues, totalReceived, cards }
  }))

  // Combine cards across all periods
  const allThisWeek = periodData.flatMap((d) =>
    d.cards.filter((c) => c.magazine.status === 'this_week')
  )
  const allOverdue = periodData.flatMap((d) =>
    d.cards.filter((c) => c.magazine.status === 'overdue')
  )

  // Sort by nextExpectedDate ascending (most overdue / earliest first)
  const sortByExpected = (a: DashboardCard, b: DashboardCard) => {
    const aDate = a.magazine.nextExpectedDate?.getTime() ?? 0
    const bDate = b.magazine.nextExpectedDate?.getTime() ?? 0
    return aDate - bDate
  }
  allOverdue.sort(sortByExpected)
  allThisWeek.sort(sortByExpected)

  const buckets: Record<DashboardStatus, DashboardCard[]> = {
    this_week: allThisWeek,
    overdue: allOverdue,
  }

  const totalOverdue = allOverdue.length
  const totalThisWeek = allThisWeek.length + pendingTransfers.length
  const totalCards = allOverdue.length + allThisWeek.length

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

      {/* Progress bars — one per active period */}
      {periodData.length > 0 && (
        <div className="space-y-3 mb-6">
          {periodData.map(({ period, totalIssues, totalReceived }) => {
            const pct = totalIssues > 0 ? Math.min((totalReceived / totalIssues) * 100, 100) : 0
            return (
              <div
                key={period.id}
                className="rounded-xl border p-4"
                style={{ borderColor: 'oklch(0.876 0.016 88)', backgroundColor: 'oklch(0.978 0.009 88)' }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium" style={{ color: 'oklch(0.30 0.028 62)' }}>
                    Subscription Progress — {period.name}
                  </span>
                  <span className="text-sm font-bold" style={{ color: 'oklch(0.38 0.082 156)' }}>
                    {totalReceived}/{totalIssues}
                  </span>
                </div>
                <div className="w-full h-2 rounded-full" style={{ backgroundColor: 'oklch(0.90 0.012 88)' }}>
                  <div
                    className="h-2 rounded-full transition-all"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: 'oklch(0.38 0.082 156)',
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}

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
          const totalCount = items.length + transfers.length
          return (
            <CollapsibleSection
              key={status}
              label={cfg.label}
              count={totalCount}
              iconName={cfg.iconName}
              color={cfg.color}
              bg={cfg.bg}
              border={cfg.border}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {transfers.map((t) => (
                  <TransferCard key={t.id} transfer={t} />
                ))}
                {items.map((card) => (
                  <MagazineCard
                    key={`${card.magazine.id}-${card.periodName}`}
                    magazine={card.magazine}
                    activeBranchId={activeBranchId}
                    periodName={activePeriods.length > 1 ? card.periodName : undefined}
                  />
                ))}
              </div>
            </CollapsibleSection>
          )
        })}

        {totalCards === 0 && pendingTransfers.length === 0 && (
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
