import type { NextRequest } from 'next/server'
import { Prisma } from '@/generated/prisma/client'
import db from '@/lib/db'
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

    const subscription = await db.branchMagazine.update({
      where: { branchId_magazineId: { branchId: id, magazineId } },
      data: validFields,
    })

    auditLog(session.userId, 'BRANCH_MAGAZINE_UPDATED', {
      branchId: id,
      magazineId,
      changes: Object.keys(validFields).join(','),
    })

    return Response.json(subscription)
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return Response.json({ error: 'Subscription not found' }, { status: 404 })
    }
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/branches/[id]/magazines/[magazineId]
 * Removes a magazine subscription from a branch (soft delete: sets active=false). ADMIN only.
 */
export async function DELETE(_request: NextRequest, { params }: RouteContext): Promise<Response> {
  try {
    const session = await verifySession()
    if (session.role !== 'ADMIN') {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id, magazineId } = await params

    await db.branchMagazine.update({
      where: { branchId_magazineId: { branchId: id, magazineId } },
      data: { active: false },
    })

    auditLog(session.userId, 'BRANCH_MAGAZINE_REMOVED', {
      branchId: id,
      magazineId,
    })

    return Response.json({ success: true })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return Response.json({ error: 'Subscription not found' }, { status: 404 })
    }
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
