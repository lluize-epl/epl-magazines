import type { NextRequest } from 'next/server'
import { Prisma } from '@/generated/prisma/client'
import db from '@/lib/db'
import { withRetry } from '@/lib/db-retry'
import { verifySession } from '@/lib/dal'
import { auditLog } from '@/lib/logger'

type RouteContext = { params: Promise<{ id: string; magazineId: string }> }

interface UpdateSubscriptionBody {
  quantity?: number
  active?: boolean
}

/**
 * PUT /api/branches/[id]/magazines/[magazineId]
 * Updates quantity or active status of a branch magazine subscription. ADMIN only.
 */
export async function PUT(request: NextRequest, { params }: RouteContext): Promise<Response> {
  try {
    const session = await verifySession()
    if (session.role !== 'ADMIN') {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id, magazineId } = await params
    const body = (await request.json()) as UpdateSubscriptionBody

    const validFields: { quantity?: number; active?: boolean } = {}
    if (body.quantity !== undefined) validFields.quantity = body.quantity
    if (body.active !== undefined) validFields.active = body.active

    const before = await db.branchMagazine.findUnique({
      where: { branchId_magazineId: { branchId: id, magazineId } },
      include: { magazine: { select: { name: true } }, branch: { select: { name: true } } },
    })
    if (!before) return Response.json({ error: 'Subscription not found' }, { status: 404 })

    const subscription = await withRetry(() => db.branchMagazine.update({
      where: { branchId_magazineId: { branchId: id, magazineId } },
      data: validFields,
    }))

    const changes = Object.entries(validFields)
      .filter(([k]) => String(before[k as keyof typeof before]) !== String(validFields[k as keyof typeof validFields]))
      .map(([k, v]) => `${k}: ${before[k as keyof typeof before]} → ${v}`)
      .join(', ')

    auditLog(session.userId, 'BRANCH_MAGAZINE_UPDATED', {
      magazineName: before.magazine.name,
      branchName: before.branch.name,
      changes: changes || 'no changes',
    })

    return Response.json(subscription)
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return Response.json({ error: 'Subscription not found' }, { status: 404 })
    }
    const e = err as { code?: string; message?: string }
    if (e?.code === 'SQLITE_BUSY' || e?.code === 'SQLITE_LOCKED' || (e?.message ?? '').includes('database is locked')) {
      return Response.json({ error: 'Database is busy, please try again' }, { status: 503 })
    }
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/branches/[id]/magazines/[magazineId]
 * Removes a magazine subscription from a branch (hard delete). ADMIN only.
 */
export async function DELETE(_request: NextRequest, { params }: RouteContext): Promise<Response> {
  try {
    const session = await verifySession()
    if (session.role !== 'ADMIN') {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id, magazineId } = await params

    // Fetch names before deletion for audit log
    const branch = await db.branch.findUnique({ where: { id }, select: { name: true } })
    const magazine = await db.magazine.findUnique({ where: { id: magazineId }, select: { name: true } })

    await withRetry(() => db.branchMagazine.delete({
      where: { branchId_magazineId: { branchId: id, magazineId } },
    }))

    auditLog(session.userId, 'BRANCH_MAGAZINE_REMOVED', {
      branchName: branch?.name,
      magazineName: magazine?.name,
    })

    return Response.json({ success: true })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return Response.json({ error: 'Subscription not found' }, { status: 404 })
    }
    const e = err as { code?: string; message?: string }
    if (e?.code === 'SQLITE_BUSY' || e?.code === 'SQLITE_LOCKED' || (e?.message ?? '').includes('database is locked')) {
      return Response.json({ error: 'Database is busy, please try again' }, { status: 503 })
    }
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
