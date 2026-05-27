import type { Metadata } from 'next'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { getUser } from '@/lib/dal'
import db from '@/lib/db'
import { ArrowLeft } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import MagazineSearch from '@/components/MagazineSearch'
import SubscriptionManagement from '@/components/SubscriptionManagement'
import PeriodActivationControl from '@/components/PeriodActivationControl'
import type { MagazineSubscriptionWithDetails } from '@/types'

const PAGE_SIZE = 10

type SearchParams = { [key: string]: string | string[] | undefined }

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<SearchParams>
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const period = await db.subscriptionPeriod.findUnique({ where: { id }, select: { name: true } })
  return { title: period ? `${period.name} — EPL Magazine Tracker` : 'Subscription Period — EPL Magazine Tracker' }
}

export default async function SubscriptionPeriodDetailPage({ params, searchParams }: PageProps) {
  const user = await getUser()
  if (user.role !== 'ADMIN') redirect('/dashboard')

  const { id } = await params
  const period = await db.subscriptionPeriod.findUnique({
    where: { id },
    include: {
      _count: { select: { subscriptions: { where: { active: true } } } },
    },
  })
  if (!period) notFound()

  const sp = await searchParams
  const search = typeof sp?.search === 'string' ? sp.search.trim() : ''
  const page = Math.max(1, parseInt((typeof sp?.page === 'string' ? sp.page : undefined) || '1', 10))

  const where = {
    periodId: id,
    ...(search ? { magazine: { name: { contains: search } } } : {}),
  }

  const totalCount = await db.magazineSubscription.count({ where })
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const startIdx = (currentPage - 1) * PAGE_SIZE

  const subscriptions = await db.magazineSubscription.findMany({
    where,
    include: {
      magazine: { select: { id: true, name: true, cadence: true, language: true, active: true } },
    },
    orderBy: { magazine: { name: 'asc' } },
    skip: startIdx,
    take: PAGE_SIZE,
  }) as MagazineSubscriptionWithDetails[]

  // All magazine names for search dropdown (only those in this period)
  const allSubMagazines = await db.magazineSubscription.findMany({
    where: { periodId: id },
    select: { magazine: { select: { id: true, name: true } } },
    orderBy: { magazine: { name: 'asc' } },
  })
  const allMagazineNames = allSubMagazines.map((s) => s.magazine)

  // Build branch map for each subscribed magazine: magazineId → ["ML", "NE", ...]
  const branchMagazines = await db.branchMagazine.findMany({
    where: {
      magazineId: { in: subscriptions.map((s) => s.magazineId) },
      active: true,
    },
    select: { magazineId: true, branch: { select: { code: true } } },
  })
  const branchesPerMagazine: Record<string, string[]> = {}
  for (const bm of branchMagazines) {
    if (!branchesPerMagazine[bm.magazineId]) branchesPerMagazine[bm.magazineId] = []
    branchesPerMagazine[bm.magazineId].push(bm.branch.code)
  }

  // Magazines available to add (active, not yet in this period)
  const subscribedMagazineIds = await db.magazineSubscription.findMany({
    where: { periodId: id },
    select: { magazineId: true },
  })
  const subscribedIds = new Set(subscribedMagazineIds.map((s) => s.magazineId))

  const allActiveMagazines = await db.magazine.findMany({
    where: { active: true },
    select: { id: true, name: true, language: true },
    orderBy: { name: 'asc' },
  })
  const availableMagazines = allActiveMagazines.filter((m) => !subscribedIds.has(m.id))

  const unfilteredCount = search ? await db.magazineSubscription.count({ where: { periodId: id } }) : totalCount

  function pageUrl(p: number): string {
    const u = new URLSearchParams()
    if (search) u.set('search', search)
    if (p > 1) u.set('page', String(p))
    const qs = u.toString()
    return `/admin/subscriptions/${id}${qs ? `?${qs}` : ''}`
  }

  function formatDate(d: Date | string): string {
    return format(typeof d === 'string' ? parseISO(d) : d, 'MMM d, yyyy')
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Back link */}
      <Link
        href="/admin/subscriptions"
        className="inline-flex items-center gap-1.5 text-sm mb-6 hover:underline"
        style={{ color: 'oklch(0.50 0.035 72)' }}
      >
        <ArrowLeft size={14} /> All Periods
      </Link>

      {/* Period header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <h1
            className="text-3xl font-bold"
            style={{ fontFamily: 'var(--font-playfair)', color: 'oklch(0.15 0.028 62)' }}
          >
            {period.name}
          </h1>
          <Badge
            variant="outline"
            className="text-xs font-medium"
            style={
              period.active
                ? { backgroundColor: 'oklch(0.92 0.050 155)', color: 'oklch(0.38 0.082 156)', border: 'none' }
                : { backgroundColor: 'oklch(0.93 0.010 88)', color: 'oklch(0.50 0.020 62)', border: 'none' }
            }
          >
            {period.active ? 'Active' : 'Inactive'}
          </Badge>
          <PeriodActivationControl
            periodId={period.id}
            active={period.active}
            periodName={period.name}
          />
        </div>
        <p style={{ color: 'oklch(0.50 0.035 72)' }}>
          {formatDate(period.startDate)} &mdash; {formatDate(period.endDate)}
          <span className="mx-2">&middot;</span>
          {totalCount} of {unfilteredCount} subscription{unfilteredCount !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Search */}
      <div className="mb-6">
        <MagazineSearch
          magazines={allMagazineNames}
          currentSearch={search}
          placeholder="Search subscriptions..."
        />
      </div>

      <SubscriptionManagement
        periodId={id}
        subscriptions={subscriptions}
        availableMagazines={availableMagazines}
        search={search}
        branchesPerMagazine={branchesPerMagazine}
      />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6">
          <p className="text-sm" style={{ color: 'oklch(0.50 0.035 72)' }}>
            Showing {startIdx + 1}&ndash;{Math.min(startIdx + PAGE_SIZE, totalCount)} of {totalCount}
          </p>
          <div className="flex items-center gap-1">
            {currentPage > 1 && (
              <Link
                href={pageUrl(currentPage - 1)}
                className="inline-flex items-center justify-center h-8 px-3 rounded-md border text-sm font-medium transition-colors hover:bg-black/[0.04]"
                style={{ borderColor: 'oklch(0.876 0.016 88)', color: 'oklch(0.30 0.028 62)' }}
              >
                Previous
              </Link>
            )}
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              p === currentPage ? (
                <span
                  key={p}
                  className="inline-flex items-center justify-center w-8 h-8 rounded-md text-sm font-medium text-white"
                  style={{ backgroundColor: 'oklch(0.38 0.082 156)' }}
                >
                  {p}
                </span>
              ) : (
                <Link
                  key={p}
                  href={pageUrl(p)}
                  className="inline-flex items-center justify-center w-8 h-8 rounded-md border text-sm font-medium transition-colors hover:bg-black/[0.04]"
                  style={{ borderColor: 'oklch(0.876 0.016 88)', color: 'oklch(0.30 0.028 62)' }}
                >
                  {p}
                </Link>
              )
            ))}
            {currentPage < totalPages && (
              <Link
                href={pageUrl(currentPage + 1)}
                className="inline-flex items-center justify-center h-8 px-3 rounded-md border text-sm font-medium transition-colors hover:bg-black/[0.04]"
                style={{ borderColor: 'oklch(0.876 0.016 88)', color: 'oklch(0.30 0.028 62)' }}
              >
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
