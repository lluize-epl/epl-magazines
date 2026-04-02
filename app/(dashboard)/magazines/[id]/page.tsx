import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { verifySession } from '@/lib/dal'
import db from '@/lib/db'
import { computeNextExpectedDate, getMagazineStatus, CADENCE_LABELS } from '@/lib/cadence'
import { format } from 'date-fns'
import Link from 'next/link'
import MagazineStatusBadge from '@/components/MagazineStatusBadge'
import MagazineDetailActions from '@/components/MagazineDetailActions'
import { resolveActiveBranchId, getActiveBranches } from '@/lib/branch'
import { ArrowLeft, BookOpen } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import ReceiptActions from '@/components/ReceiptActions'

interface PageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  const magazine = await db.magazine.findUnique({ where: { id }, select: { name: true } })
  return { title: magazine ? `${magazine.name} — EPL Magazine Tracker` : 'Magazine' }
}

function fmt(date: Date | string | null, includeTime = false): string {
  if (!date) return '—'
  return includeTime
    ? format(new Date(date), 'MMM d, yyyy · h:mm a')
    : format(new Date(date), 'MMM d, yyyy')
}

export default async function MagazineDetailPage({ params }: PageProps) {
  const session = await verifySession()
  const { id } = await params
  const activeBranchId = await resolveActiveBranchId()
  const isAdmin = session.role === 'ADMIN'
  const branches = isAdmin ? await getActiveBranches() : []

  const magazine = await db.magazine.findUnique({
    where: { id },
    include: {
      receipts: {
        where: { branchId: activeBranchId },
        orderBy: { receivedDate: 'desc' },
        include: {
          receivedBy: { select: { id: true, name: true } },
          branch: { select: { name: true, code: true } },
        },
      },
    },
  })

  if (!magazine) notFound()

  // Check for the oldest pending transfer TO this branch for this magazine
  const pendingTransfer = await db.transfer.findFirst({
    where: {
      magazineId: id,
      toBranchId: activeBranchId,
      status: 'PENDING',
    },
    orderBy: { createdAt: 'asc' },
    include: {
      fromBranch: { select: { name: true } },
    },
  })

  const lastReceipt = magazine.receipts[0] ?? null
  const lastReceivedDate = lastReceipt?.receivedDate ?? null
  const nextExpectedDate = computeNextExpectedDate(lastReceivedDate, magazine.cadence)
  const status = getMagazineStatus(lastReceivedDate, magazine.cadence)

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Back link */}
      <Link
        href="/magazines"
        className="inline-flex items-center gap-1.5 text-sm mb-6 hover:underline transition-colors"
        style={{ color: 'oklch(0.45 0.082 156)' }}
      >
        <ArrowLeft size={14} /> Back to Magazines
      </Link>

      {/* Header */}
      <div
        className="rounded-xl border p-6 mb-8"
        style={{ borderColor: 'oklch(0.876 0.016 88)', backgroundColor: 'oklch(0.978 0.009 88)' }}
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 flex-wrap mb-2">
              <h1
                className="text-2xl font-bold"
                style={{ fontFamily: 'var(--font-playfair)', color: 'oklch(0.15 0.028 62)' }}
              >
                {magazine.name}
              </h1>
              {!magazine.active && (
                <Badge
                  variant="outline"
                  className="text-xs"
                  style={{ color: 'oklch(0.55 0.030 72)', borderColor: 'oklch(0.876 0.016 88)' }}
                >
                  Inactive
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <Badge
                variant="outline"
                className="text-xs font-medium"
                style={{
                  backgroundColor: 'oklch(0.38 0.082 156 / 0.08)',
                  color: 'oklch(0.38 0.082 156)',
                  borderColor: 'oklch(0.38 0.082 156 / 0.20)',
                }}
              >
                {CADENCE_LABELS[magazine.cadence]}
              </Badge>
              <MagazineStatusBadge status={status} />
            </div>

            {magazine.notes && (
              <p className="mt-3 text-sm italic" style={{ color: 'oklch(0.50 0.035 72)' }}>
                {magazine.notes}
              </p>
            )}
          </div>

          <MagazineDetailActions
            magazine={{ id: magazine.id, name: magazine.name }}
            activeBranchId={activeBranchId}
            pendingTransfer={pendingTransfer ? {
              id: pendingTransfer.id,
              quantity: pendingTransfer.quantity,
              fromBranchName: pendingTransfer.fromBranch.name,
            } : null}
          />
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-6 pt-6 border-t" style={{ borderColor: 'oklch(0.900 0.012 88)' }}>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide mb-1" style={{ color: 'oklch(0.55 0.030 72)' }}>
              Issues at Branch
            </p>
            <p className="text-2xl font-bold" style={{ fontFamily: 'var(--font-playfair)', color: 'oklch(0.15 0.028 62)' }}>
              {magazine.receipts.length}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide mb-1" style={{ color: 'oklch(0.55 0.030 72)' }}>
              Last Received
            </p>
            <p className="text-sm font-semibold" style={{ color: 'oklch(0.15 0.028 62)' }}>
              {fmt(lastReceivedDate)}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide mb-1" style={{ color: 'oklch(0.55 0.030 72)' }}>
              Next Expected
            </p>
            <p className="text-sm font-semibold" style={{ color: nextExpectedDate ? 'oklch(0.15 0.028 62)' : 'oklch(0.55 0.030 72)' }}>
              {fmt(nextExpectedDate)}
            </p>
          </div>
        </div>
      </div>

      {/* Receipt history */}
      <h2
        className="text-lg font-semibold mb-4"
        style={{ fontFamily: 'var(--font-playfair)', color: 'oklch(0.15 0.028 62)' }}
      >
        Receipt History
      </h2>

      {magazine.receipts.length === 0 ? (
        <div className="text-center py-16" style={{ color: 'oklch(0.60 0.025 72)' }}>
          <BookOpen size={36} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium" style={{ fontFamily: 'var(--font-playfair)' }}>No receipts on record</p>
          <p className="text-sm mt-1">Use &quot;Mark Received&quot; to record the first arrival.</p>
        </div>
      ) : (
        <div
          className="rounded-lg border overflow-hidden"
          style={{ borderColor: 'oklch(0.876 0.016 88)', backgroundColor: 'oklch(0.978 0.009 88)' }}
        >
          <Table>
            <TableHeader>
              <TableRow style={{ borderColor: 'oklch(0.876 0.016 88)', backgroundColor: 'oklch(0.963 0.012 91)' }}>
                <TableHead className="font-semibold" style={{ color: 'oklch(0.30 0.028 62)' }}>#</TableHead>
                <TableHead className="font-semibold" style={{ color: 'oklch(0.30 0.028 62)' }}>Date Received</TableHead>
                <TableHead className="font-semibold" style={{ color: 'oklch(0.30 0.028 62)' }}>Branch</TableHead>
                <TableHead className="font-semibold" style={{ color: 'oklch(0.30 0.028 62)' }}>Received By</TableHead>
                <TableHead className="font-semibold" style={{ color: 'oklch(0.30 0.028 62)' }}>Notes</TableHead>
                <TableHead className="font-semibold" style={{ color: 'oklch(0.30 0.028 62)' }}>Logged At</TableHead>
                {isAdmin && (
                  <TableHead className="font-semibold text-right" style={{ color: 'oklch(0.30 0.028 62)' }}>Actions</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {magazine.receipts.map((receipt, idx) => (
                <TableRow
                  key={receipt.id}
                  className="hover:bg-black/[0.02] transition-colors"
                  style={{ borderColor: 'oklch(0.900 0.012 88)' }}
                >
                  <TableCell className="text-xs" style={{ color: 'oklch(0.60 0.025 72)' }}>
                    {magazine.receipts.length - idx}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm font-medium" style={{ color: 'oklch(0.20 0.028 62)' }}>
                      {fmt(receipt.receivedDate)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm" style={{ color: 'oklch(0.35 0.028 62)' }}>
                      {receipt.branch?.name ?? '—'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm" style={{ color: 'oklch(0.35 0.028 62)' }}>
                      {receipt.receivedBy.name}
                    </span>
                  </TableCell>
                  <TableCell>
                    {receipt.notes ? (
                      <span className="text-sm italic" style={{ color: 'oklch(0.50 0.030 72)' }}>
                        {receipt.notes}
                      </span>
                    ) : (
                      <span style={{ color: 'oklch(0.70 0.015 88)' }}>—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-xs" style={{ color: 'oklch(0.60 0.025 72)' }}>
                      {fmt(receipt.createdAt, true)}
                    </span>
                  </TableCell>
                  {isAdmin && (
                    <TableCell className="text-right">
                      <ReceiptActions
                        receipt={{
                          id: receipt.id,
                          receivedDate: receipt.receivedDate instanceof Date
                            ? receipt.receivedDate.toISOString()
                            : String(receipt.receivedDate),
                          branchId: receipt.branchId ?? null,
                          branchName: receipt.branch?.name ?? null,
                          notes: receipt.notes,
                        }}
                        magazineId={magazine.id}
                        branches={branches.map((b) => ({ id: b.id, name: b.name }))}
                      />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
