import type { NextRequest } from 'next/server'
import db from '@/lib/db'
import { verifySession } from '@/lib/dal'
import { auditLog } from '@/lib/logger'

type RouteContext = { params: Promise<{ id: string }> }

interface CreateReceiptBody {
  receivedDate: string
  notes?: string
}

/**
 * GET /api/magazines/[id]/receipts
 * Returns all receipts for a magazine, newest first. Requires any authenticated session.
 */
export async function GET(_request: NextRequest, { params }: RouteContext): Promise<Response> {
  try {
    await verifySession()
    const { id } = await params
    const receipts = await db.issueReceipt.findMany({
      where: { magazineId: id },
      orderBy: { receivedDate: 'desc' },
      include: { receivedBy: { select: { name: true } } },
    })
    return Response.json(receipts)
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

/**
 * POST /api/magazines/[id]/receipts
 * Records a new receipt for a magazine. Requires any authenticated session.
 * Body: { receivedDate: ISO string, notes?: string }.
 * Returns 201 with the created receipt (including the receiver's name).
 */
export async function POST(request: NextRequest, { params }: RouteContext): Promise<Response> {
  try {
    const session = await verifySession()
    const { id } = await params
    const { receivedDate, notes } = (await request.json()) as CreateReceiptBody

    if (!receivedDate) {
      return Response.json({ error: 'receivedDate is required' }, { status: 400 })
    }

    const magazine = await db.magazine.findUnique({ where: { id } })
    if (!magazine) return Response.json({ error: 'Magazine not found' }, { status: 404 })

    const receipt = await db.issueReceipt.create({
      data: {
        magazineId: id,
        receivedById: session.userId,
        receivedDate: new Date(receivedDate),
        notes: notes?.trim() || null,
      },
      include: { receivedBy: { select: { name: true } } },
    })

    auditLog(session.userId, 'RECEIPT_CREATED', {
      magazineId: id,
      magazineName: magazine.name,
      receiptId: receipt.id,
      receivedDate,
    })

    return Response.json(receipt, { status: 201 })
  } catch (err) {
    console.error('Create receipt error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
