import type { NextRequest } from 'next/server'
import db from '@/lib/db'
import { withRetry } from '@/lib/db-retry'
import { verifySessionForApi } from '@/lib/dal'
import { auditLog } from '@/lib/logger'
import { editReceiptSchema } from '@/lib/validations'

type RouteContext = { params: Promise<{ id: string; receiptId: string }> }

/**
 * PUT /api/magazines/[id]/receipts/[receiptId]
 * Edits a specific receipt. Admin only.
 * Body: { receivedDate?: string, branchId?: string, notes?: string | null }
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

    const data = parsed.data

    // Fetch the existing receipt, verify it belongs to this magazine
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

    // If branchId is provided, verify the branch exists
    let newBranchName: string | null = null
    if (data.branchId) {
      const branch = await db.branch.findUnique({ where: { id: data.branchId }, select: { name: true } })
      if (!branch) return Response.json({ error: 'Branch not found' }, { status: 404 })
      newBranchName = branch.name
    }

    // Build update payload
    const updateData: { receivedDate?: Date; branchId?: string; notes?: string | null } = {}
    if (data.receivedDate !== undefined) {
      const dateStr = data.receivedDate
      updateData.receivedDate = dateStr.includes('T')
        ? new Date(dateStr)
        : new Date(dateStr + 'T12:00:00Z')
    }
    if (data.branchId !== undefined) updateData.branchId = data.branchId
    if (data.notes !== undefined) updateData.notes = data.notes?.trim() || null

    const updated = await withRetry(() => db.issueReceipt.update({
      where: { id: receiptId },
      data: updateData,
      include: {
        receivedBy: { select: { name: true } },
        branch: { select: { name: true, code: true } },
      },
    }))

    // Build audit changes string
    const changes: string[] = []
    if (data.receivedDate !== undefined) {
      const oldDate = receipt.receivedDate.toISOString().split('T')[0]
      const newDate = data.receivedDate.split('T')[0]
      if (oldDate !== newDate) changes.push(`receivedDate: ${oldDate} \u2192 ${newDate}`)
    }
    if (data.branchId !== undefined && data.branchId !== receipt.branchId) {
      const oldBranch = receipt.branch?.name ?? 'none'
      changes.push(`branch: ${oldBranch} \u2192 ${newBranchName}`)
    }
    if (data.notes !== undefined) {
      const oldNotes = receipt.notes ?? 'null'
      const newNotes = data.notes?.trim() || 'null'
      if (oldNotes !== newNotes) changes.push(`notes: ${oldNotes} \u2192 ${newNotes}`)
    }

    if (changes.length > 0) {
      auditLog(session.userId, 'RECEIPT_EDITED', {
        magazineName: receipt.magazine.name,
        changes: changes.join(', '),
      })
    }

    return Response.json(updated)
  } catch (err) {
    const e = err as { code?: string; message?: string }
    if (e?.code === 'SQLITE_BUSY' || e?.code === 'SQLITE_LOCKED' || (e?.message ?? '').includes('database is locked')) {
      return Response.json({ error: 'Database is busy, please try again' }, { status: 503 })
    }
    console.error('Edit receipt error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/magazines/[id]/receipts/[receiptId]
 * Deletes a specific receipt. Admin only.
 * Returns 204 on success.
 */
export async function DELETE(_request: NextRequest, { params }: RouteContext): Promise<Response> {
  const session = await verifySessionForApi()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'ADMIN') return Response.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { id, receiptId } = await params

    // Fetch the receipt, verify it belongs to this magazine
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
      branchName: receipt.branch?.name ?? 'unknown',
    })

    return new Response(null, { status: 204 })
  } catch (err) {
    const e = err as { code?: string; message?: string }
    if (e?.code === 'SQLITE_BUSY' || e?.code === 'SQLITE_LOCKED' || (e?.message ?? '').includes('database is locked')) {
      return Response.json({ error: 'Database is busy, please try again' }, { status: 503 })
    }
    console.error('Delete receipt error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
