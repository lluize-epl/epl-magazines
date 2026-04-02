import bcrypt from 'bcrypt'
import type { NextRequest } from 'next/server'
import db from '@/lib/db'
import { createSession } from '@/lib/session'
import { auditLog } from '@/lib/logger'
import { loginSchema } from '@/lib/validations'

/**
 * POST /api/auth/login
 * Validates credentials and creates an encrypted session cookie.
 * Returns 400 if fields are missing, 401 if credentials are wrong.
 */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body: unknown = await request.json()
    const parsed = loginSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    const { username, password } = parsed.data

    const user = await db.user.findUnique({
      where: { username: username.toLowerCase() },
    })

    if (!user || !user.active) {
      return Response.json({ error: 'Invalid username or password' }, { status: 401 })
    }

    const match = await bcrypt.compare(password, user.passwordHash)
    if (!match) {
      return Response.json({ error: 'Invalid username or password' }, { status: 401 })
    }

    await createSession(user.id, user.role)
    auditLog(user.id, 'LOGIN', { username: user.username })

    return Response.json({ success: true })
  } catch (err) {
    console.error('Login error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
