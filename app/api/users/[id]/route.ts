import type { NextRequest } from 'next/server'
import { Prisma } from '@/generated/prisma/client'
import db from '@/lib/db'
import { withRetry } from '@/lib/db-retry'
import { verifySession } from '@/lib/dal'
import { auditLog } from '@/lib/logger'
import type { UserRole } from '@/types'

type RouteContext = { params: Promise<{ id: string }> }

interface UpdateUserBody {
  active?: boolean
  role?: UserRole
}

/**
 * PUT /api/users/[id]
 * Updates a user's active status and/or role. ADMIN only.
 * Admins cannot modify their own account via this endpoint.
 * Body: { active?: boolean, role?: UserRole }.
 */
export async function PUT(request: NextRequest, { params }: RouteContext): Promise<Response> {
  try {
    const session = await verifySession()
    if (session.role !== 'ADMIN') {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }
    const { id } = await params
    if (id === session.userId) {
      return Response.json({ error: 'Cannot modify your own account here' }, { status: 400 })
    }

    const body = (await request.json()) as UpdateUserBody
    const validFields: Partial<UpdateUserBody> = {}
    if (body.active !== undefined) validFields.active = body.active
    if (body.role !== undefined) validFields.role = body.role

    const targetUser = await db.user.findUnique({ where: { id }, select: { name: true, email: true } })
    await withRetry(() => db.user.update({ where: { id }, data: validFields }))
    auditLog(session.userId, 'USER_UPDATED', { targetUserName: targetUser?.name, targetEmail: targetUser?.email, changes: Object.keys(validFields).join(',') })
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

/**
 * DELETE /api/users/[id]
 * Deletes a user by ID. ADMIN only.
 * Admins cannot delete their own account. Returns 404 if user does not exist.
 */
export async function DELETE(_request: NextRequest, { params }: RouteContext): Promise<Response> {
  try {
    const session = await verifySession()
    if (session.role !== 'ADMIN') {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }
    const { id } = await params
    if (id === session.userId) {
      return Response.json({ error: 'Cannot delete your own account' }, { status: 400 })
    }

    const user = await withRetry(() => db.user.delete({ where: { id } }))
    auditLog(session.userId, 'USER_DELETED', { deletedUserName: user.name, email: user.email })
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
