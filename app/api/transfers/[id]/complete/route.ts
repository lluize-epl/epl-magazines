import type { NextRequest } from 'next/server'
import db from '@/lib/db'
import { withRetry } from '@/lib/db-retry'
import { verifySessionForApi } from '@/lib/dal'
import { resolveActiveBranchId } from '@/lib/branch'
import { auditLog } from '@/lib/logger'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * PUT /api/transfers/[id]/complete
 * Marks a pending transfer as completed. Must be called from the receiving branch.
 * Atomically: creates IssueReceipt, upserts BranchMagazine quantity, updates Transfer status.
 */
export async function PUT(request: NextRequest, { params }: RouteContext): Promise<Response> {
  const session = await verifySessionForApi()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const { id } = await params
    const activeBranchId = await resolveActiveBranchId()

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
    if (transfer.toBranchId !== activeBranchId) {
      return Response.json({ error: 'Only the receiving branch can complete this transfer' }, { status: 403 })
    }

    await withRetry(() => db.$transaction(async (tx) => {
      // 1. Create IssueReceipt
      await tx.issueReceipt.create({
        data: {
          magazineId: transfer.magazineId,
          branchId: transfer.toBranchId,
          receivedById: session.userId,
          receivedDate: new Date(),
        },
      })

      // 2. Upsert BranchMagazine for receiver
      const existingSub = await tx.branchMagazine.findUnique({
        where: {
          branchId_magazineId: {
            branchId: transfer.toBranchId,
            magazineId: transfer.magazineId,
          },
        },
      })

      if (existingSub) {
        await tx.branchMagazine.update({
          where: { id: existingSub.id },
          data: { quantity: { increment: transfer.quantity } },
        })
      } else {
        await tx.branchMagazine.create({
          data: {
            branchId: transfer.toBranchId,
            magazineId: transfer.magazineId,
            quantity: transfer.quantity,
            active: false,
          },
        })
      }

      // 3. Update transfer status
      await tx.transfer.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          completedById: session.userId,
          completedAt: new Date(),
        },
      })
    }))

    auditLog(session.userId, 'TRANSFER_COMPLETED', {
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
    console.error('Complete transfer error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
