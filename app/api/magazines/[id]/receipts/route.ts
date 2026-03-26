import type { NextRequest } from 'next/server'
import db from '@/lib/db'
import { withRetry } from '@/lib/db-retry'
import { verifySessionForApi } from '@/lib/dal'
import { auditLog } from '@/lib/logger'
import { createReceiptSchema, updateReceiptSchema } from '@/lib/validations'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * GET /api/magazines/[id]/receipts
 * Returns all receipts for a magazine, newest first. Requires any authenticated session.
 * Optionally filters by branchId query parameter.
 */
export async function GET(request: NextRequest, { params }: RouteContext): Promise<Response> {
  const session = await verifySessionForApi()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const { id } = await params
    const branchId = request.nextUrl.searchParams.get('branchId')

    const where: { magazineId: string; branchId?: string } = { magazineId: id }
    if (branchId) where.branchId = branchId

    const receipts = await db.issueReceipt.findMany({
      where,
      orderBy: { receivedDate: 'desc' },
      include: {
        receivedBy: { select: { name: true } },
        branch: { select: { name: true, code: true } },
      },
    })
    return Response.json(receipts)
  } catch (err) {
    console.error('List receipts error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/magazines/[id]/receipts
 * Records a new receipt for a magazine. Requires any authenticated session.
 * Body: { receivedDate: ISO string, branchId: string, notes?: string }.
 * Returns 201 with the created receipt (including the receiver's name and branch info).
 */
export async function POST(request: NextRequest, { params }: RouteContext): Promise<Response> {
  const session = await verifySessionForApi()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const { id } = await params
    const body = await request.json()
    const parsed = createReceiptSchema.safeParse(body)
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message }, { status: 400 })
    const { receivedDate, branchId, notes } = parsed.data

    const magazine = await db.magazine.findUnique({ where: { id } })
    if (!magazine) return Response.json({ error: 'Magazine not found' }, { status: 404 })

    const branch = await db.branch.findUnique({ where: { id: branchId } })
    if (!branch) return Response.json({ error: 'Branch not found' }, { status: 404 })

    const receipt = await withRetry(() => db.issueReceipt.create({
      data: {
        magazineId: id,
        receivedById: session.userId,
        receivedDate: new Date(receivedDate),
        branchId,
        notes: notes?.trim() || null,
      },
      include: {
        receivedBy: { select: { name: true } },
        branch: { select: { name: true, code: true } },
      },
    }))

    auditLog(session.userId, 'RECEIPT_CREATED', {
      magazineName: magazine.name,
      receivedDate: receivedDate.split('T')[0],
      branchName: branch.name,
    })

    return Response.json(receipt, { status: 201 })
  } catch (err) {
    const e = err as { code?: string; message?: string }
    if (e?.code === 'SQLITE_BUSY' || e?.code === 'SQLITE_LOCKED' || (e?.message ?? '').includes('database is locked')) {
      return Response.json({ error: 'Database is busy, please try again' }, { status: 503 })
    }
    console.error('Create receipt error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PUT /api/magazines/[id]/receipts
 * Updates the most recent receipt's receivedDate for a magazine at a branch.
 * Admin only. Body: { receivedDate: date string, branchId: string }.
 */
export async function PUT(request: NextRequest, { params }: RouteContext): Promise<Response> {
  const session = await verifySessionForApi()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'ADMIN') return Response.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const { id } = await params
    const body = await request.json()
    const parsed = updateReceiptSchema.safeParse(body)
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message }, { status: 400 })
    const { receivedDate, branchId } = parsed.data

    const lastReceipt = await db.issueReceipt.findFirst({
      where: { magazineId: id, branchId },
      orderBy: { receivedDate: 'desc' },
    })

    if (!lastReceipt) {
      return Response.json({ error: 'No receipt found to update' }, { status: 404 })
    }

    const magazine = await db.magazine.findUnique({ where: { id } })

    const updated = await withRetry(() => db.issueReceipt.update({
      where: { id: lastReceipt.id },
      data: { receivedDate: new Date(receivedDate) },
      include: {
        receivedBy: { select: { name: true } },
        branch: { select: { name: true, code: true } },
      },
    }))

    const oldDate = lastReceipt.receivedDate.toISOString().split('T')[0]
    const newDate = receivedDate.split('T')[0]
    auditLog(session.userId, 'RECEIPT_EDITED', {
      magazineName: magazine?.name,
      changes: `receivedDate: ${oldDate} → ${newDate}`,
    })

    return Response.json(updated)
  } catch (err) {
    const e = err as { code?: string; message?: string }
    if (e?.code === 'SQLITE_BUSY' || e?.code === 'SQLITE_LOCKED' || (e?.message ?? '').includes('database is locked')) {
      return Response.json({ error: 'Database is busy, please try again' }, { status: 503 })
    }
    console.error('Update receipt error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
