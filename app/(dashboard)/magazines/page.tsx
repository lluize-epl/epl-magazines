import type { Metadata } from 'next'
import type { MagazineWithStatus } from '@/types'
import { verifySession } from '@/lib/dal'
import db from '@/lib/db'
import { resolveActiveBranchId, getActiveBranches } from '@/lib/branch'
import { resolveActivePeriod } from '@/lib/period'
import { computeNextExpectedDate, getSubscriptionAwareStatus, CADENCE_LABELS } from '@/lib/cadence'
import { format } from 'date-fns'
import Link from 'next/link'
import MagazineStatusBadge from '@/components/MagazineStatusBadge'
import MagazinesClientControls from '@/components/MagazinesClientControls'
import MagazineSearch from '@/components/MagazineSearch'
import { BookOpen } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'

export const metadata: Metadata = { title: 'Magazines — EPL Magazine Tracker' }

const PAGE_SIZE = 10

function fmt(date: Date | string | null): string {
  return date ? format(new Date(date), 'MMM d, yyyy') : '—'
}

type SearchParams = { [key: string]: string | string[] | undefined }

interface PageProps {
  searchParams: Promise<SearchParams>
}

export default async function MagazinesPage({ searchParams }: PageProps) {
  await verifySession()
  const params = await searchParams
  const filter = (typeof params?.status === 'string' ? params.status : undefined) || 'all'
  const search = typeof params?.search === 'string' ? params.search.trim() : ''
  const page = Math.max(1, parseInt(typeof params?.page === 'string' ? params.page : '1', 10) || 1)

  const [activeBranchId, activePeriod] = await Promise.all([
    resolveActiveBranchId(),
    resolveActivePeriod(),
  ])
  const branches = await getActiveBranches()
  const currentBranch = branches.find((b) => b.id === activeBranchId)

  const branchSubscriptionsFull = await db.branchMagazine.findMany({
    where: { branchId: activeBranchId, active: true },
    select: { magazineId: true, quantity: true },
  })
  const subscribedMagazineIds = branchSubscriptionsFull.map(s => s.magazineId)
  const quantityMap = new Map(branchSubscriptionsFull.map(s => [s.magazineId, s.quantity]))

  const magazines = await db.magazine.findMany({
    where: {
      id: { in: subscribedMagazineIds },
      active: true,
      ...(search ? { name: { contains: search } } : {}),
    },
    include: {
      receipts: {
        where: { branchId: activeBranchId },
        orderBy: { receivedDate: 'desc' as const },
        take: 1,
        include: { receivedBy: { select: { name: true } } },
      },
      _count: {
        select: {
          receipts: { where: { branchId: activeBranchId } },
        },
      },
    },
    orderBy: { name: 'asc' },
  })

  type MagazineRow = MagazineWithStatus & { _count: { receipts: number } }

  const periodStart = new Date(activePeriod.startDate)
  const periodEnd = new Date(activePeriod.endDate)

  const processed: MagazineRow[] = []
  for (const mag of magazines) {
    const lastReceipt = mag.receipts[0] ?? null
    const lastReceivedDate = lastReceipt?.receivedDate ?? null

    // Fetch subscription for this magazine in the active period
    const subscription = await db.magazineSubscription.findUnique({
      where: { magazineId_periodId: { magazineId: mag.id, periodId: activePeriod.id } },
      select: { issuesPerYear: true, active: true },
    })
    const issuesPerYear = subscription?.active ? subscription.issuesPerYear : null

    // Count receipts within the period's date range
    const periodReceipts = await db.issueReceipt.count({
      where: {
        magazineId: mag.id,
        branchId: activeBranchId,
        receivedDate: { gte: periodStart, lte: periodEnd },
      },
    })

    const status = getSubscriptionAwareStatus(
      lastReceivedDate,
      mag.cadence,
      periodReceipts,
      issuesPerYear,
      activePeriod.startDate,
    )

    const anchor = lastReceivedDate ?? activePeriod.startDate
    const nextExpectedDate = status === 'completed' || status === 'not_subscribed'
      ? null
      : computeNextExpectedDate(anchor, mag.cadence)

    processed.push({ ...mag, lastReceivedDate, nextExpectedDate, status, lastReceivedBy: lastReceipt?.receivedBy?.name })
  }

  const filtered = filter === 'all' ? processed : processed.filter((m) => m.status === filter)

  // Pagination
  const totalItems = filtered.length
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const startIdx = (currentPage - 1) * PAGE_SIZE
  const paged = filtered.slice(startIdx, startIdx + PAGE_SIZE)

  // All magazine names for search dropdown (lightweight — only id + name)
  const allMagazineNames = await db.magazine.findMany({
    where: { id: { in: subscribedMagazineIds }, active: true },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })

  /** Build URL preserving current params */
  function pageUrl(p: number): string {
    const u = new URLSearchParams()
    if (filter !== 'all') u.set('status', filter)
    if (search) u.set('search', search)
    if (p > 1) u.set('page', String(p))
    const qs = u.toString()
    return `/magazines${qs ? `?${qs}` : ''}`
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1
            className="text-3xl font-bold mb-1"
            style={{ fontFamily: 'var(--font-playfair)', color: 'oklch(0.15 0.028 62)' }}
          >
            <span style={{ color: 'oklch(0.50 0.035 72)' }}>Magazines for </span>
            {currentBranch && (
              <span className="underline" style={{ color: 'oklch(0.15 0.028 62)' }}>{currentBranch.name}</span>
            )}
          </h1>
          <p style={{ color: 'oklch(0.50 0.035 72)' }}>
            {totalItems} of {processed.length} magazine{processed.length !== 1 ? 's' : ''}
          </p>
        </div>

        <MagazinesClientControls currentFilter={filter} />
      </div>

      {/* Search bar */}
      <div className="mb-6">
        <MagazineSearch magazines={allMagazineNames} currentSearch={search} />
      </div>

      {paged.length === 0 ? (
        <div className="text-center py-20" style={{ color: 'oklch(0.60 0.025 72)' }}>
          <BookOpen size={40} className="mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium" style={{ fontFamily: 'var(--font-playfair)' }}>
            {search ? 'No magazines match your search' : 'No magazines match this filter'}
          </p>
          {search && (
            <Link
              href={pageUrl(1).replace(`search=${encodeURIComponent(search)}`, '').replace(/[?&]$/, '')}
              className="text-sm mt-2 inline-block underline"
              style={{ color: 'oklch(0.38 0.082 156)' }}
            >
              Clear search
            </Link>
          )}
        </div>
      ) : (
        <>
          <div
            className="rounded-lg border overflow-hidden"
            style={{ borderColor: 'oklch(0.876 0.016 88)', backgroundColor: 'oklch(0.978 0.009 88)' }}
          >
            <Table>
              <TableHeader>
                <TableRow style={{ borderColor: 'oklch(0.876 0.016 88)', backgroundColor: 'oklch(0.963 0.012 91)' }}>
                  <TableHead className="font-semibold" style={{ color: 'oklch(0.30 0.028 62)' }}>Name</TableHead>
                  <TableHead className="font-semibold" style={{ color: 'oklch(0.30 0.028 62)' }}>Cadence</TableHead>
                  <TableHead className="font-semibold" style={{ color: 'oklch(0.30 0.028 62)' }}>Qty</TableHead>
                  <TableHead className="font-semibold" style={{ color: 'oklch(0.30 0.028 62)' }}>Status</TableHead>
                  <TableHead className="font-semibold" style={{ color: 'oklch(0.30 0.028 62)' }}>Total Deliveries</TableHead>
                  <TableHead className="font-semibold" style={{ color: 'oklch(0.30 0.028 62)' }}>Last Received</TableHead>
                  <TableHead className="font-semibold" style={{ color: 'oklch(0.30 0.028 62)' }}>Next Expected</TableHead>
                  <TableHead className="font-semibold text-right" style={{ color: 'oklch(0.30 0.028 62)' }}>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((mag) => (
                  <TableRow
                    key={mag.id}
                    className="hover:bg-black/[0.02] transition-colors"
                    style={{ borderColor: 'oklch(0.900 0.012 88)' }}
                  >
                    <TableCell>
                      <div>
                        <Link
                          href={`/magazines/${mag.id}`}
                          className="font-medium hover:underline"
                          style={{ fontFamily: 'var(--font-playfair)', color: 'oklch(0.15 0.028 62)' }}
                        >
                          {mag.name}
                        </Link>
                        {mag.notes && (
                          <p className="text-xs mt-0.5 truncate max-w-xs" style={{ color: 'oklch(0.55 0.030 72)' }}>
                            {mag.notes}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className="text-xs"
                        style={{
                          backgroundColor: 'oklch(0.38 0.082 156 / 0.08)',
                          color: 'oklch(0.38 0.082 156)',
                          borderColor: 'oklch(0.38 0.082 156 / 0.20)',
                        }}
                      >
                        {CADENCE_LABELS[mag.cadence]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm" style={{ color: 'oklch(0.40 0.028 62)' }}>
                        {quantityMap.get(mag.id) ?? 0}
                      </span>
                    </TableCell>
                    <TableCell><MagazineStatusBadge status={mag.status} /></TableCell>
                    <TableCell>
                      <span className="text-sm font-semibold" style={{ color: 'oklch(0.20 0.028 62)' }}>
                        {mag._count.receipts}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div>
                        <span className="text-sm" style={{ color: 'oklch(0.25 0.028 62)' }}>
                          {fmt(mag.lastReceivedDate)}
                        </span>
                        {mag.lastReceivedBy && (
                          <p className="text-xs" style={{ color: 'oklch(0.55 0.030 72)' }}>
                            by {mag.lastReceivedBy}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm" style={{ color: 'oklch(0.25 0.028 62)' }}>
                        {fmt(mag.nextExpectedDate)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <MagazinesClientControls magazineId={mag.id} magazine={mag} mode="row-actions" activeBranchId={activeBranchId} branches={branches} senderQuantity={quantityMap.get(mag.id) ?? 0} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-6">
              <p className="text-sm" style={{ color: 'oklch(0.50 0.035 72)' }}>
                Showing {startIdx + 1}–{Math.min(startIdx + PAGE_SIZE, totalItems)} of {totalItems}
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
        </>
      )}
    </div>
  )
}
