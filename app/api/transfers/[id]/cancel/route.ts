import type { NextRequest } from 'next/server'
import db from '@/lib/db'
import { withRetry } from '@/lib/db-retry'
import { verifySessionForApi } from '@/lib/dal'
import { auditLog } from '@/lib/logger'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * PUT /api/transfers/[id]/cancel
 * Cancels a pending transfer. ADMIN only.
 * Atomically restores sender's BranchMagazine quantity and marks transfer CANCELLED.
 */
export async function PUT(_request: NextRequest, { params }: RouteContext): Promise<Response> {
  const session = await verifySessionForApi()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'ADMIN') return Response.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const { id } = await params

    const transfer = await db.transfer.findUnique({
      where: { id },
      include: {
        magazine: { select: { name: true } },
        fromBranch: { select: { name: true } },
        toBranch: { select: { name: true } },
      },
    })

    if (!transfer) return Response.json({ error: 'Transfer not found' }, { status: 404 })
    if (transfer.status !== 'PENDING') {
      return Response.json({ error: 'Transfer is not pending' }, { status: 400 })
    }

    await withRetry(() => db.$transaction(async (tx) => {
      // Restore sender's quantity
      const senderSub = await tx.branchMagazine.findUnique({
        where: {
          branchId_magazineId: {
            branchId: transfer.fromBranchId,
            magazineId: transfer.magazineId,
          },
        },
      })

      if (senderSub) {
        await tx.branchMagazine.update({
          where: { id: senderSub.id },
          data: { quantity: { increment: transfer.quantity } },
        })
      } else {
        // BranchMagazine was deleted since initiation — re-create as inactive
        await tx.branchMagazine.create({
          data: {
            branchId: transfer.fromBranchId,
            magazineId: transfer.magazineId,
            quantity: transfer.quantity,
            active: false,
          },
        })
      }

      // Update transfer status
      await tx.transfer.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          cancelledById: session.userId,
          cancelledAt: new Date(),
        },
      })
    }))

    auditLog(session.userId, 'TRANSFER_CANCELLED', {
      magazineName: transfer.magazine.name,
      fromBranchName: transfer.fromBranch.name,
      toBranchName: transfer.toBranch.name,
      quantity: transfer.quantity,
    })

    return Response.json({ success: true })
  } catch (err) {
    const e = err as { code?: string; message?: string }
    if (e?.code === 'SQLITE_BUSY' || e?.code === 'SQLITE_LOCKED' || (e?.message ?? '').includes('database is locked')) {
      return Response.json({ error: 'Database is busy, please try again' }, { status: 503 })
    }
    console.error('Cancel transfer error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
