import type { NextRequest } from 'next/server'
import db from '@/lib/db'
import { withRetry } from '@/lib/db-retry'
import { verifySessionForApi } from '@/lib/dal'
import { resolveActiveBranchId } from '@/lib/branch'
import { auditLog } from '@/lib/logger'
import { createTransferSchema } from '@/lib/validations'

/**
 * GET /api/transfers
 * Lists transfers. Filterable by status and branchId query params.
 * branchId matches transfers where fromBranchId OR toBranchId equals the value.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const session = await verifySessionForApi()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const { searchParams } = request.nextUrl
    const status = searchParams.get('status')
    const branchId = searchParams.get('branchId')

    const where: Record<string, unknown> = {}
    if (status) where.status = status
    if (branchId) {
      where.OR = [{ fromBranchId: branchId }, { toBranchId: branchId }]
    }

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
    })

    return Response.json(transfers)
  } catch (err) {
    console.error('List transfers error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/transfers
 * Initiates a branch-to-branch magazine transfer.
 * fromBranchId is resolved from the active branch cookie.
 * Atomically decrements sender's BranchMagazine.quantity and creates Transfer record.
 */
export async function POST(request: NextRequest): Promise<Response> {
  const session = await verifySessionForApi()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const fromBranchId = await resolveActiveBranchId()
    const body = await request.json()
    const parsed = createTransferSchema.safeParse(body)
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message }, { status: 400 })
    const { magazineId, toBranchId, quantity } = parsed.data
    if (fromBranchId === toBranchId) {
      return Response.json({ error: 'Cannot transfer to the same branch' }, { status: 400 })
    }

    const [magazine, fromBranch, toBranch] = await Promise.all([
      db.magazine.findUnique({ where: { id: magazineId } }),
      db.branch.findUnique({ where: { id: fromBranchId, active: true } }),
      db.branch.findUnique({ where: { id: toBranchId, active: true } }),
    ])

    if (!magazine) return Response.json({ error: 'Magazine not found' }, { status: 404 })
    if (!fromBranch) return Response.json({ error: 'Source branch not found or inactive' }, { status: 404 })
    if (!toBranch) return Response.json({ error: 'Destination branch not found or inactive' }, { status: 404 })

    // Check sender has enough quantity
    const senderSub = await db.branchMagazine.findUnique({
      where: { branchId_magazineId: { branchId: fromBranchId, magazineId } },
    })
    if (!senderSub || senderSub.quantity < quantity) {
      return Response.json({ error: 'Insufficient quantity to transfer' }, { status: 400 })
    }

    // Atomic transaction: decrement sender quantity + create transfer
    const transfer = await withRetry(() => db.$transaction(async (tx) => {
      // Decrement with race-condition guard
      const updated = await tx.branchMagazine.updateMany({
        where: {
          branchId: fromBranchId,
          magazineId,
          quantity: { gte: quantity },
        },
        data: { quantity: { decrement: quantity } },
      })

      if (updated.count === 0) {
        throw new Error('INSUFFICIENT_QUANTITY')
      }

      return tx.transfer.create({
        data: {
          magazineId,
          fromBranchId,
          toBranchId,
          quantity,
          initiatedById: session.userId,
        },
        include: {
          magazine: { select: { name: true } },
          fromBranch: { select: { name: true, code: true } },
          toBranch: { select: { name: true, code: true } },
          initiatedBy: { select: { name: true } },
        },
      })
    }))

    auditLog(session.userId, 'TRANSFER_INITIATED', {
      magazineName: transfer.magazine.name,
      fromBranchName: transfer.fromBranch.name,
      toBranchName: transfer.toBranch.name,
      quantity,
    })

    return Response.json(transfer, { status: 201 })
  } catch (err) {
    if (err instanceof Error && err.message === 'INSUFFICIENT_QUANTITY') {
      return Response.json({ error: 'Insufficient quantity to transfer' }, { status: 400 })
    }
    const e = err as { code?: string; message?: string }
    if (e?.code === 'SQLITE_BUSY' || e?.code === 'SQLITE_LOCKED' || (e?.message ?? '').includes('database is locked')) {
      return Response.json({ error: 'Database is busy, please try again' }, { status: 503 })
    }
    console.error('Initiate transfer error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
