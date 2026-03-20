import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getUser } from '@/lib/dal'
import { getActiveBranchId, getActiveBranches } from '@/lib/branch'
import db from '@/lib/db'
import { computeNextExpectedDate } from '@/lib/cadence'
import AdminMagazinesClient from '@/components/AdminMagazinesClient'
import type { BranchMagazineWithDetails } from '@/types'

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
  const page = Math.max(1, parseInt((typeof params?.page === 'string' ? params.page : undefined) || '1', 10))

  const branches = await getActiveBranches()
  const currentBranch = branches.find((b) => b.id === branchId)

  // Count total subscriptions for pagination (include inactive so admin can toggle them)
  const totalCount = await db.branchMagazine.count({
    where: { branchId },
  })
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  // Fetch paginated subscriptions with magazine data
  const subscriptions = await db.branchMagazine.findMany({
    where: { branchId },
    orderBy: [{ active: 'desc' }, { magazine: { name: 'asc' } }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    include: {
      magazine: true,
    },
  })

  // Current year boundaries for Total Issues count
  const yearStart = new Date(new Date().getFullYear(), 0, 1)
  const yearEnd = new Date(new Date().getFullYear() + 1, 0, 1)

  // Enrich each subscription with receipt stats
  const enriched: BranchMagazineWithDetails[] = await Promise.all(
    subscriptions.map(async (sub) => {
      const [totalIssues, lastReceipt] = await Promise.all([
        db.issueReceipt.count({
          where: {
            magazineId: sub.magazineId,
            branchId,
            receivedDate: { gte: yearStart, lt: yearEnd },
          },
        }),
        db.issueReceipt.findFirst({
          where: { magazineId: sub.magazineId, branchId },
          orderBy: { createdAt: 'desc' },
          select: { receivedDate: true },
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
      }
    })
  )

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1
          className="text-3xl font-bold mb-1"
          style={{ fontFamily: 'var(--font-playfair)', color: 'oklch(0.15 0.028 62)' }}
        >
          Manage Magazines
        </h1>
        <p style={{ color: 'oklch(0.50 0.035 72)' }}>
          {totalCount} subscription{totalCount !== 1 ? 's' : ''} at {currentBranch?.name ?? 'this branch'}
        </p>
      </div>

      <AdminMagazinesClient
        magazines={enriched}
        branchId={branchId}
        page={page}
        totalPages={totalPages}
      />
    </div>
  )
}
