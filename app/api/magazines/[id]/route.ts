import type { NextRequest } from 'next/server'
import { Prisma } from '@/generated/prisma/client'
import db from '@/lib/db'
import { verifySession } from '@/lib/dal'
import { auditLog } from '@/lib/logger'
import type { CadenceType } from '@/types'

type RouteContext = { params: Promise<{ id: string }> }

interface UpdateMagazineBody {
  name?: string
  cadence?: CadenceType
  notes?: string
  active?: boolean
}

/**
 * GET /api/magazines/[id]
 * Returns a single magazine by ID. Requires any authenticated session.
 */
export async function GET(_request: NextRequest, { params }: RouteContext): Promise<Response> {
  try {
    await verifySession()
    const { id } = await params
    const magazine = await db.magazine.findUnique({ where: { id } })
    if (!magazine) return Response.json({ error: 'Not found' }, { status: 404 })
    return Response.json(magazine)
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

/**
 * PUT /api/magazines/[id]
 * Updates name, cadence, notes, and/or active status. ADMIN only.
 * Only fields present in the body are updated (partial update).
 */
export async function PUT(request: NextRequest, { params }: RouteContext): Promise<Response> {
  try {
    const session = await verifySession()
    if (session.role !== 'ADMIN') {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const body = (await request.json()) as UpdateMagazineBody

    const validFields: { name?: string; cadence?: CadenceType; notes?: string | null; active?: boolean } = {}
    if (body.name !== undefined) validFields.name = body.name.trim()
    if (body.cadence !== undefined) validFields.cadence = body.cadence
    if (body.notes !== undefined) validFields.notes = body.notes?.trim() || null
    if (body.active !== undefined) validFields.active = body.active

    const magazine = await db.magazine.update({ where: { id }, data: validFields })

    auditLog(session.userId, 'MAGAZINE_UPDATED', { magazineId: id, changes: Object.keys(validFields).join(',') })
    return Response.json(magazine)
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return Response.json({ error: 'Not found' }, { status: 404 })
    }
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/magazines/[id]
 * Deletes a magazine and all its receipts (manual cascade). ADMIN only.
 * Returns 404 if the magazine does not exist.
 */
export async function DELETE(_request: NextRequest, { params }: RouteContext): Promise<Response> {
  try {
    const session = await verifySession()
    if (session.role !== 'ADMIN') {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params

    // Delete receipts first (cascading)
    await db.issueReceipt.deleteMany({ where: { magazineId: id } })
    const magazine = await db.magazine.delete({ where: { id } })

    auditLog(session.userId, 'MAGAZINE_DELETED', { magazineId: id, name: magazine.name })
    return Response.json({ success: true })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return Response.json({ error: 'Not found' }, { status: 404 })
    }
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
