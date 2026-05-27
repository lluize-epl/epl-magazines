import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getUser } from '@/lib/dal'
import { getActiveBranchId, getActiveBranches } from '@/lib/branch'

import db from '@/lib/db'
import { computeNextExpectedDate } from '@/lib/cadence'
import AdminMagazinesClient from '@/components/AdminMagazinesClient'
import MagazineSearch from '@/components/MagazineSearch'
import MagazineFilters from '@/components/MagazineFilters'
import type { BranchMagazineWithDetails, SubscriptionPeriod } from '@/types'
import type { CadenceType } from '@/types'

export const metadata: Metadata = { title: 'Manage Magazines — EPL Magazine Tracker' }

const PAGE_SIZE = 10

type SearchParams = { [key: string]: string | string[] | undefined }

interface PageProps {
  searchParams: Promise<SearchParams>
}

export default async function AdminMagazinesPage({ searchParams }: PageProps) {
  const user = await getUser()
  if (user.role !== 'ADMIN') redirect('/dashboard')

  const branchId = await getActiveBranchId()
  if (!branchId) redirect('/login')

  const params = await searchParams
  const search = typeof params?.search === 'string' ? params.search.trim() : ''
  const page = Math.max(1, parseInt((typeof params?.page === 'string' ? params.page : undefined) || '1', 10))
  const cadenceFilter = typeof params?.cadence === 'string' ? params.cadence : ''
  const languageFilter = typeof params?.language === 'string' ? params.language : ''
  const statusFilter = typeof params?.status === 'string' ? params.status : ''

  const branches = await getActiveBranches()
  const currentBranch = branches.find((b) => b.id === branchId)

  // Build combined magazine where clause
  const magazineWhere: Record<string, unknown> = {}
  if (search) magazineWhere.name = { contains: search }
  if (cadenceFilter) magazineWhere.cadence = cadenceFilter
  if (languageFilter) magazineWhere.language = languageFilter

  const where: Record<string, unknown> = {
    branchId,
    ...(Object.keys(magazineWhere).length > 0 ? { magazine: magazineWhere } : {}),
  }

  // Current year boundaries for Total Issues count
  const yearStart = new Date(new Date().getFullYear(), 0, 1)
  const yearEnd = new Date(new Date().getFullYear() + 1, 0, 1)

  /** Enrich a subscription with receipt stats and period info */
  async function enrichSubscription(sub: { id: string; branchId: string; magazineId: string; quantity: number; active: boolean; createdAt: Date; magazine: { id: string; name: string; cadence: CadenceType; language: string; active: boolean; notes: string | null; createdAt: Date; updatedAt: Date } }): Promise<BranchMagazineWithDetails> {
    const [totalIssues, lastReceipt, magazineSubscription] = await Promise.all([
      db.issueReceipt.count({
        where: {
          magazineId: sub.magazineId,
          branchId,
          receivedDate: { gte: yearStart, lt: yearEnd },
        },
      }),
      db.issueReceipt.findFirst({
        where: { magazineId: sub.magazineId, branchId },
        orderBy: { receivedDate: 'desc' },
        select: { receivedDate: true },
      }),
      db.magazineSubscription.findFirst({
        where: { magazineId: sub.magazineId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          periodId: true,
          issuesPerYear: true,
          active: true,
          period: { select: { name: true, active: true } },
        },
      }),
    ])

    const lastReceivedDate = lastReceipt?.receivedDate ?? null
    const nextExpectedDate = lastReceivedDate
      ? computeNextExpectedDate(lastReceivedDate, sub.magazine.cadence)
      : null

    return {
      id: sub.id,
      branchId: sub.branchId,
      magazineId: sub.magazineId,
      quantity: sub.quantity,
      active: sub.active,
      createdAt: sub.createdAt,
      magazine: sub.magazine,
      totalIssues,
      lastReceivedDate,
      nextExpectedDate,
      magazineSubscription: magazineSubscription ?? null,
    }
  }

  let enriched: BranchMagazineWithDetails[]
  let totalCount: number
  let totalPages: number
  let currentPage: number

  // Status filter: active/inactive applies at DB level
  if (statusFilter === 'active') {
    where.active = true
  } else if (statusFilter === 'inactive') {
    where.active = false
  }

  totalCount = await db.branchMagazine.count({ where })
  totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  currentPage = Math.min(page, totalPages)

  const subscriptions = await db.branchMagazine.findMany({
    where,
    orderBy: { magazine: { name: 'asc' } },
    skip: (currentPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    include: { magazine: true },
  })

  enriched = await Promise.all(subscriptions.map(enrichSubscription))

  // All magazine names for search dropdown
  const allSubMagazines = await db.branchMagazine.findMany({
    where: { branchId },
    select: { magazine: { select: { id: true, name: true } } },
    orderBy: { magazine: { name: 'asc' } },
  })
  const allMagazineNames = allSubMagazines.map((s) => s.magazine)

  // Distinct languages and cadences for filter dropdowns
  const [distinctLanguages, distinctCadences] = await Promise.all([
    db.magazine.findMany({
      where: { branches: { some: { branchId } } },
      select: { language: true },
      distinct: ['language'],
      orderBy: { language: 'asc' },
    }),
    db.magazine.findMany({
      where: { branches: { some: { branchId } } },
      select: { cadence: true },
      distinct: ['cadence'],
    }),
  ])
  const languages = distinctLanguages.map((m) => m.language)
  const cadences = distinctCadences.map((m) => m.cadence) as CadenceType[]

  // Total unfiltered count for display
  const hasAnyFilter = !!(search || cadenceFilter || languageFilter || statusFilter)
  const unfilteredCount = hasAnyFilter
    ? await db.branchMagazine.count({ where: { branchId } })
    : totalCount

  // All subscription periods for the period assignment dropdown
  const allPeriods: SubscriptionPeriod[] = await db.subscriptionPeriod.findMany({
    orderBy: { startDate: 'desc' },
    select: { id: true, name: true, startDate: true, endDate: true, active: true, createdAt: true },
  })

  /** Build URL preserving current params (search + filters) */
  function pageUrl(p: number): string {
    const u = new URLSearchParams()
    if (search) u.set('search', search)
    if (cadenceFilter) u.set('cadence', cadenceFilter)
    if (languageFilter) u.set('language', languageFilter)
    if (statusFilter) u.set('status', statusFilter)
    if (p > 1) u.set('page', String(p))
    const qs = u.toString()
    return `/admin/magazines${qs ? `?${qs}` : ''}`
  }

  const startIdx = (currentPage - 1) * PAGE_SIZE

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1
          className="text-3xl font-bold mb-1"
          style={{ fontFamily: 'var(--font-playfair)', color: 'oklch(0.15 0.028 62)' }}
        >
          <span style={{ color: 'oklch(0.50 0.035 72)' }}>Manage Magazines for </span>
          {currentBranch && (
            <span className="underline" style={{ color: 'oklch(0.15 0.028 62)' }}>{currentBranch.name}</span>
          )}
        </h1>
        <p style={{ color: 'oklch(0.50 0.035 72)' }}>
          {totalCount} of {unfilteredCount} subscription{unfilteredCount !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Search bar */}
      <div className="mb-4">
        <MagazineSearch magazines={allMagazineNames} currentSearch={search} />
      </div>

      {/* Filters */}
      <div className="mb-6">
        <MagazineFilters languages={languages} cadences={cadences} />
      </div>

      <AdminMagazinesClient
        magazines={enriched}
        branchId={branchId}
        branches={branches.map((b) => ({ id: b.id, name: b.name, code: b.code }))}
        search={search}
        periods={allPeriods}
      />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6">
          <p className="text-sm" style={{ color: 'oklch(0.50 0.035 72)' }}>
            Showing {startIdx + 1}–{Math.min(startIdx + PAGE_SIZE, totalCount)} of {totalCount}
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
