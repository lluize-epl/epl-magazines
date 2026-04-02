import type { NextRequest } from 'next/server'
import { Prisma } from '@/generated/prisma/client'
import db from '@/lib/db'
import { withRetry } from '@/lib/db-retry'
import { verifySessionForApi } from '@/lib/dal'
import { auditLog } from '@/lib/logger'
import { updateUserSchema } from '@/lib/validations'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * PUT /api/users/[id]
 * Updates a user's active status and/or role. ADMIN only.
 * Admins cannot modify their own account via this endpoint.
 * Body: { active?: boolean, role?: 'ADMIN' | 'STAFF' }.
 */
export async function PUT(request: NextRequest, { params }: RouteContext): Promise<Response> {
  const session = await verifySessionForApi()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'ADMIN') return Response.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const { id } = await params
    if (id === session.userId) {
      return Response.json({ error: 'Cannot modify your own account here' }, { status: 400 })
    }
    const body = await request.json()
    const parsed = updateUserSchema.safeParse(body)
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message }, { status: 400 })
    const validFields = parsed.data

    const targetUser = await db.user.findUnique({ where: { id }, select: { name: true, username: true } })
    await withRetry(() => db.user.update({ where: { id }, data: validFields }))
    auditLog(session.userId, 'USER_UPDATED', { targetUserName: targetUser?.name, targetUsername: targetUser?.username, changes: Object.keys(validFields).join(',') })
    return Response.json({ success: true })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return Response.json({ error: 'Not found' }, { status: 404 })
    }
    const e = err as { code?: string; message?: string }
    if (e?.code === 'SQLITE_BUSY' || e?.code === 'SQLITE_LOCKED' || (e?.message ?? '').includes('database is locked')) {
      return Response.json({ error: 'Database is busy, please try again' }, { status: 503 })
    }
    console.error('Update user error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/users/[id]
 * Deletes a user by ID. ADMIN only.
 * Admins cannot delete their own account. Returns 404 if user does not exist.
 */
export async function DELETE(_request: NextRequest, { params }: RouteContext): Promise<Response> {
  const session = await verifySessionForApi()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'ADMIN') return Response.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const { id } = await params
    if (id === session.userId) {
      return Response.json({ error: 'Cannot delete your own account' }, { status: 400 })
    }

    const user = await withRetry(() => db.user.delete({ where: { id } }))
    auditLog(session.userId, 'USER_DELETED', { deletedUserName: user.name, username: user.username })
    return Response.json({ success: true })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return Response.json({ error: 'Not found' }, { status: 404 })
    }
    const e = err as { code?: string; message?: string }
    if (e?.code === 'SQLITE_BUSY' || e?.code === 'SQLITE_LOCKED' || (e?.message ?? '').includes('database is locked')) {
      return Response.json({ error: 'Database is busy, please try again' }, { status: 503 })
    }
    console.error('Delete user error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
