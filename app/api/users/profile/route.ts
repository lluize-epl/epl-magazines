import type { NextRequest } from 'next/server'
import bcrypt from 'bcrypt'
import db from '@/lib/db'
import { verifySessionForApi } from '@/lib/dal'
import { auditLog } from '@/lib/logger'

interface UpdateProfileBody {
  name?: string
  currentPassword?: string
  newPassword?: string
}

/**
 * PUT /api/users/profile
 * Updates the current user's name and/or password.
 * Password change requires current password verification.
 */
export async function PUT(request: NextRequest): Promise<Response> {
  const session = await verifySessionForApi()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const body = (await request.json()) as UpdateProfileBody

    const user = await db.user.findUnique({ where: { id: session.userId } })
    if (!user) return Response.json({ error: 'User not found' }, { status: 404 })

    const updates: { name?: string; passwordHash?: string } = {}
    const auditDetails: string[] = []

    // Name update
    if (body.name !== undefined) {
      const trimmed = body.name.trim()
      if (!trimmed) return Response.json({ error: 'Name cannot be empty' }, { status: 400 })
      updates.name = trimmed
      auditDetails.push('name')
    }

    // Password update
    if (body.currentPassword && body.newPassword) {
      const valid = await bcrypt.compare(body.currentPassword, user.passwordHash)
      if (!valid) return Response.json({ error: 'Current password is incorrect' }, { status: 400 })

      if (body.newPassword.length < 8) {
        return Response.json({ error: 'New password must be at least 8 characters' }, { status: 400 })
      }

      updates.passwordHash = await bcrypt.hash(body.newPassword, 10)
      auditDetails.push('password')
    } else if (body.currentPassword || body.newPassword) {
      return Response.json({ error: 'Both currentPassword and newPassword are required' }, { status: 400 })
    }

    if (Object.keys(updates).length === 0) {
      return Response.json({ error: 'No changes provided' }, { status: 400 })
    }

    const updated = await db.user.update({
      where: { id: session.userId },
      data: updates,
      select: { id: true, name: true, username: true, role: true, active: true },
    })

    for (const detail of auditDetails) {
      if (detail === 'name') {
        auditLog(session.userId, 'USER_NAME_CHANGED', { oldName: user.name, newName: updates.name })
      } else if (detail === 'password') {
        auditLog(session.userId, 'USER_PASSWORD_CHANGED', {})
      }
    }

    return Response.json(updated)
  } catch (err) {
    console.error('Update profile error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
