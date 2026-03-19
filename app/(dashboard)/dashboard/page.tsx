import type { Metadata } from 'next'
import type { LucideIcon } from 'lucide-react'
import type { MagazineStatus, MagazineWithStatus } from '@/types'
import { verifySession } from '@/lib/dal'
import db from '@/lib/db'
import { resolveActiveBranchId } from '@/lib/branch'
import { computeNextExpectedDate, getMagazineStatus } from '@/lib/cadence'
import MagazineCard from '@/components/MagazineCard'
import { AlertTriangle, Clock, CalendarCheck, BookOpen } from 'lucide-react'

export const metadata: Metadata = { title: 'Dashboard — EPL Magazine Tracker' }

interface SectionConfig {
  label: string
  description: string
  icon: LucideIcon
  color: string
  bg: string
  border: string
}

const SECTION_CONFIG: Record<MagazineStatus, SectionConfig> = {
  overdue: {
    label: 'Overdue / Missing',
    description: 'These issues are past their expected delivery date',
    icon: AlertTriangle,
    color: 'oklch(0.56 0.225 27)',
    bg: 'oklch(0.97 0.020 27)',
    border: 'oklch(0.88 0.08 27)',
  },
  this_week: {
    label: 'Expected This Week',
    description: 'Due to arrive within the next 7 days',
    icon: Clock,
    color: 'oklch(0.55 0.15 78)',
    bg: 'oklch(0.97 0.022 85)',
    border: 'oklch(0.88 0.08 78)',
  },
  upcoming: {
    label: 'Upcoming',
    description: 'Scheduled for more than a week from now',
    icon: CalendarCheck,
    color: 'oklch(0.45 0.10 155)',
    bg: 'oklch(0.97 0.012 155)',
    border: 'oklch(0.88 0.04 155)',
  },
  never_received: {
    label: 'Never Received',
    description: 'No receipt on record — status unknown',
    icon: BookOpen,
    color: 'oklch(0.50 0.035 72)',
    bg: 'oklch(0.95 0.012 88)',
    border: 'oklch(0.876 0.016 88)',
  },
}

type Buckets = Record<MagazineStatus, MagazineWithStatus[]>

export default async function DashboardPage() {
  await verifySession()

  const activeBranchId = await resolveActiveBranchId()

  // Get magazine IDs subscribed at this branch
  const branchSubscriptions = await db.branchMagazine.findMany({
    where: { branchId: activeBranchId, active: true },
    select: { magazineId: true },
  })
  const subscribedMagazineIds = branchSubscriptions.map(s => s.magazineId)

  // Fetch only those magazines with branch-specific receipts
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

  const processed: MagazineWithStatus[] = magazines.map((mag) => {
    const lastReceipt = mag.receipts[0] ?? null
    const lastReceivedDate = lastReceipt?.receivedDate ?? null
    const nextExpectedDate = computeNextExpectedDate(lastReceivedDate, mag.cadence)
    const status = getMagazineStatus(lastReceivedDate, mag.cadence)
    return {
      ...mag,
      lastReceivedDate,
      nextExpectedDate,
      status,
    }
  })

  const buckets: Buckets = {
    overdue: processed.filter((m) => m.status === 'overdue'),
    this_week: processed.filter((m) => m.status === 'this_week'),
    upcoming: processed.filter((m) => m.status === 'upcoming'),
    never_received: processed.filter((m) => m.status === 'never_received'),
  }

  const totalActive = processed.length
  const totalOverdue = buckets.overdue.length

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Page header */}
      <div className="mb-8">
        <h1
          className="text-3xl font-bold mb-1"
          style={{ fontFamily: 'var(--font-playfair)', color: 'oklch(0.15 0.028 62)' }}
        >
          Magazine Dashboard
        </h1>
        <p style={{ color: 'oklch(0.50 0.035 72)' }}>
          {totalActive} active magazine{totalActive !== 1 ? 's' : ''}
          {totalOverdue > 0 && (
            <span style={{ color: 'oklch(0.56 0.225 27)' }}>
              {' '}· {totalOverdue} overdue
            </span>
          )}
        </p>
      </div>

      {/* Summary pills */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-10">
        {(Object.entries(buckets) as [MagazineStatus, MagazineWithStatus[]][]).map(([status, items]) => {
          const cfg = SECTION_CONFIG[status]
          const Icon = cfg.icon
          return (
            <div
              key={status}
              className="rounded-lg px-4 py-3 border"
              style={{ backgroundColor: cfg.bg, borderColor: cfg.border }}
            >
              <div className="flex items-center gap-2 mb-0.5">
                <Icon size={14} style={{ color: cfg.color }} />
                <span className="text-xs font-medium" style={{ color: cfg.color }}>
                  {items.length}
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
        {(Object.entries(buckets) as [MagazineStatus, MagazineWithStatus[]][]).map(([status, items]) => {
          if (items.length === 0) return null
          const cfg = SECTION_CONFIG[status]
          const Icon = cfg.icon
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
                    <span
                      className="ml-2 text-sm font-normal"
                      style={{ color: cfg.color }}
                    >
                      ({items.length})
                    </span>
                  </h2>
                  <p className="text-xs" style={{ color: 'oklch(0.55 0.030 72)' }}>
                    {cfg.description}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {items.map((magazine) => (
                  <MagazineCard key={magazine.id} magazine={magazine} />
                ))}
              </div>
            </section>
          )
        })}

        {processed.length === 0 && (
          <div className="text-center py-20" style={{ color: 'oklch(0.60 0.025 72)' }}>
            <BookOpen size={40} className="mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium" style={{ fontFamily: 'var(--font-playfair)' }}>
              No magazines yet
            </p>
            <p className="text-sm mt-1">Ask an administrator to add magazines to the collection.</p>
          </div>
        )}
      </div>
    </div>
  )
}
