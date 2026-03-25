import type { NextRequest } from 'next/server'
import { Prisma } from '@/generated/prisma/client'
import db from '@/lib/db'
import { withRetry } from '@/lib/db-retry'
import { verifySession } from '@/lib/dal'
import { auditLog } from '@/lib/logger'
import type { CadenceType } from '@/types'

type RouteContext = { params: Promise<{ id: string }> }

interface UpdateMagazineBody {
  name?: string
  cadence?: CadenceType
  language?: string
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

    const validFields: { name?: string; cadence?: CadenceType; language?: string; notes?: string | null; active?: boolean } = {}
    if (body.name !== undefined) validFields.name = body.name.trim()
    if (body.cadence !== undefined) validFields.cadence = body.cadence
    if (body.language !== undefined) {
      const lang = body.language.trim()
      validFields.language = lang.charAt(0).toUpperCase() + lang.slice(1).toLowerCase()
    }
    if (body.notes !== undefined) validFields.notes = body.notes?.trim() || null
    if (body.active !== undefined) validFields.active = body.active

    const before = await db.magazine.findUnique({ where: { id } })
    if (!before) return Response.json({ error: 'Not found' }, { status: 404 })

    const magazine = await withRetry(() => db.magazine.update({ where: { id }, data: validFields }))

    // Build "field: old → new" for only the fields that actually changed
    const changes = Object.entries(validFields)
      .filter(([k]) => String(before[k as keyof typeof before]) !== String(validFields[k as keyof typeof validFields]))
      .map(([k, v]) => `${k}: ${before[k as keyof typeof before]} → ${v}`)
      .join(', ')

    auditLog(session.userId, 'MAGAZINE_UPDATED', { magazineName: before.name, changes: changes || 'no changes' })
    return Response.json(magazine)
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return Response.json({ error: 'Not found' }, { status: 404 })
    }
    const e = err as { code?: string; message?: string }
    if (e?.code === 'SQLITE_BUSY' || e?.code === 'SQLITE_LOCKED' || (e?.message ?? '').includes('database is locked')) {
      return Response.json({ error: 'Database is busy, please try again' }, { status: 503 })
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

    // Delete related records first (manual cascade)
    const magazine = await withRetry(async () => {
      await db.branchMagazine.deleteMany({ where: { magazineId: id } })
      await db.issueReceipt.deleteMany({ where: { magazineId: id } })
      return db.magazine.delete({ where: { id } })
    })

    auditLog(session.userId, 'MAGAZINE_DELETED', { name: magazine.name })
    return Response.json({ success: true })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return Response.json({ error: 'Not found' }, { status: 404 })
    }
    const e = err as { code?: string; message?: string }
    if (e?.code === 'SQLITE_BUSY' || e?.code === 'SQLITE_LOCKED' || (e?.message ?? '').includes('database is locked')) {
      return Response.json({ error: 'Database is busy, please try again' }, { status: 503 })
    }
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
