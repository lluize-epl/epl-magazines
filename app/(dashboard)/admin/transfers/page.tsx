import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getUser } from '@/lib/dal'
import db from '@/lib/db'
import type { TransferStatus, TransferWithDetails } from '@/types'
import AdminTransfersClient from '@/components/AdminTransfersClient'

export const metadata: Metadata = { title: 'Transfers — EPL Magazine Tracker' }

type SearchParams = { [key: string]: string | string[] | undefined }

interface PageProps {
  searchParams: Promise<SearchParams>
}

/**
 * Admin-only page that lists all transfers across branches.
 * Supports filtering by status via ?status= query parameter.
 * Admins can cancel pending transfers from this view.
 */
export default async function AdminTransfersPage({ searchParams }: PageProps) {
  const user = await getUser()
  if (user.role !== 'ADMIN') redirect('/dashboard')

  const params = await searchParams
  const statusFilter = (typeof params?.status === 'string' ? params.status : undefined) as TransferStatus | undefined

  const where: Record<string, unknown> = {}
  if (statusFilter) where.status = statusFilter

  const transfers = await db.transfer.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      magazine: { select: { name: true } },
      fromBranch: { select: { name: true, code: true } },
      toBranch: { select: { name: true, code: true } },
      initiatedBy: { select: { name: true } },
      completedBy: { select: { name: true } },
      cancelledBy: { select: { name: true } },
    },
  }) as TransferWithDetails[]

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1
          className="text-3xl font-bold mb-1"
          style={{ fontFamily: 'var(--font-playfair)', color: 'oklch(0.15 0.028 62)' }}
        >
          Transfers
        </h1>
        <p style={{ color: 'oklch(0.50 0.035 72)' }}>
          {transfers.length} transfer{transfers.length !== 1 ? 's' : ''}
          {statusFilter && ` (${statusFilter.toLowerCase()})`}
        </p>
      </div>

      <AdminTransfersClient
        transfers={transfers}
        currentFilter={statusFilter || 'ALL'}
      />
    </div>
  )
}
