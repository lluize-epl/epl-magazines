import bcrypt from 'bcrypt'
import type { NextRequest } from 'next/server'
import db from '@/lib/db'
import { withRetry } from '@/lib/db-retry'
import { verifySession } from '@/lib/dal'
import { auditLog } from '@/lib/logger'
import type { UserRole } from '@/types'

interface CreateUserBody {
  name: string
  email: string
  password: string
  role?: string
}

/**
 * GET /api/users
 * Returns all users ordered by name. ADMIN only.
 */
export async function GET(): Promise<Response> {
  try {
    const session = await verifySession()
    if (session.role !== 'ADMIN') {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }
    const users = await db.user.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
    })
    return Response.json(users)
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

/**
 * POST /api/users
 * Creates a new user. ADMIN only.
 * Body: { name, email, password (min 8 chars), role?: 'ADMIN' | 'STAFF' }.
 * Defaults to STAFF if role is omitted. Returns 409 if email already exists.
 */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const session = await verifySession()
    if (session.role !== 'ADMIN') {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { name, email, password, role } = (await request.json()) as CreateUserBody

    if (!name?.trim() || !email?.trim() || !password) {
      return Response.json({ error: 'Name, email, and password are required' }, { status: 400 })
    }
    if (password.length < 8) {
      return Response.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    }

    const existing = await db.user.findUnique({ where: { email: email.toLowerCase() } })
    if (existing) {
      return Response.json({ error: 'A user with this email already exists' }, { status: 409 })
    }

    const passwordHash = await bcrypt.hash(password, 10)
    const assignedRole: UserRole = role === 'ADMIN' ? 'ADMIN' : 'STAFF'
    const user = await withRetry(() => db.user.create({
      data: {
        name: name.trim(),
        email: email.toLowerCase().trim(),
        passwordHash,
        role: assignedRole,
      },
      select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
    }))

    auditLog(session.userId, 'USER_CREATED', { newUserName: user.name, email: user.email, role: user.role })
    return Response.json(user, { status: 201 })
  } catch (err) {
    const e = err as { code?: string; message?: string }
    if (e?.code === 'SQLITE_BUSY' || e?.code === 'SQLITE_LOCKED' || (e?.message ?? '').includes('database is locked')) {
      return Response.json({ error: 'Database is busy, please try again' }, { status: 503 })
    }
    console.error('Create user error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
