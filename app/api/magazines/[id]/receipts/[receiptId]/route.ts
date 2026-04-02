import type { NextRequest } from 'next/server'
import db from '@/lib/db'
import { withRetry } from '@/lib/db-retry'
import { verifySessionForApi } from '@/lib/dal'
import { auditLog } from '@/lib/logger'
import { editReceiptSchema } from '@/lib/validations'

type RouteContext = { params: Promise<{ id: string; receiptId: string }> }

/**
 * PUT /api/magazines/[id]/receipts/[receiptId]
 * Edit a specific receipt's date, branch, or notes. Admin only.
 */
export async function PUT(request: NextRequest, { params }: RouteContext): Promise<Response> {
  const session = await verifySessionForApi()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'ADMIN') return Response.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { id, receiptId } = await params
    const body = await request.json()
    const parsed = editReceiptSchema.safeParse(body)
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message }, { status: 400 })

    const receipt = await db.issueReceipt.findUnique({
      where: { id: receiptId },
      include: { branch: { select: { name: true } }, magazine: { select: { name: true } } },
    })
    if (!receipt || receipt.magazineId !== id) {
      return Response.json({ error: 'Receipt not found' }, { status: 404 })
    }

    const data: Record<string, unknown> = {}
    const changes: string[] = []

    if (parsed.data.receivedDate !== undefined) {
      const dateStr = parsed.data.receivedDate
      const newDate = dateStr.includes('T') ? new Date(dateStr) : new Date(dateStr + 'T12:00:00Z')
      const oldDate = receipt.receivedDate.toISOString().split('T')[0]
      const newDateStr = newDate.toISOString().split('T')[0]
      if (oldDate !== newDateStr) {
        data.receivedDate = newDate
        changes.push(`receivedDate: ${oldDate} → ${newDateStr}`)
      }
    }

    if (parsed.data.branchId !== undefined && parsed.data.branchId !== receipt.branchId) {
      const branch = await db.branch.findUnique({ where: { id: parsed.data.branchId }, select: { name: true } })
      if (!branch) return Response.json({ error: 'Branch not found' }, { status: 404 })
      data.branchId = parsed.data.branchId
      changes.push(`branch: ${receipt.branch?.name ?? '—'} → ${branch.name}`)
    }

    if (parsed.data.notes !== undefined) {
      const newNotes = parsed.data.notes?.trim() || null
      if (newNotes !== receipt.notes) {
        data.notes = newNotes
        changes.push(`notes: ${receipt.notes ?? '—'} → ${newNotes ?? '—'}`)
      }
    }

    if (Object.keys(data).length === 0) {
      return Response.json({ message: 'No changes' })
    }

    const updated = await withRetry(() => db.issueReceipt.update({
      where: { id: receiptId },
      data,
      include: {
        receivedBy: { select: { name: true } },
        branch: { select: { name: true, code: true } },
      },
    }))

    auditLog(session.userId, 'RECEIPT_EDITED', {
      magazineName: receipt.magazine.name,
      changes: changes.join(', '),
    })

    return Response.json(updated)
  } catch (err) {
    console.error('Edit receipt error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/magazines/[id]/receipts/[receiptId]
 * Delete a specific receipt. Admin only.
 */
export async function DELETE(_request: NextRequest, { params }: RouteContext): Promise<Response> {
  const session = await verifySessionForApi()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'ADMIN') return Response.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { id, receiptId } = await params

    const receipt = await db.issueReceipt.findUnique({
      where: { id: receiptId },
      include: {
        magazine: { select: { name: true } },
        branch: { select: { name: true } },
      },
    })
    if (!receipt || receipt.magazineId !== id) {
      return Response.json({ error: 'Receipt not found' }, { status: 404 })
    }

    await withRetry(() => db.issueReceipt.delete({ where: { id: receiptId } }))

    auditLog(session.userId, 'RECEIPT_DELETED', {
      magazineName: receipt.magazine.name,
      receivedDate: receipt.receivedDate.toISOString().split('T')[0],
      branchName: receipt.branch?.name ?? '—',
    })

    return new Response(null, { status: 204 })
  } catch (err) {
    console.error('Delete receipt error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
