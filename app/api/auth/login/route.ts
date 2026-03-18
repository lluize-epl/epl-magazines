import bcrypt from 'bcrypt'
import type { NextRequest } from 'next/server'
import db from '@/lib/db'
import { createSession } from '@/lib/session'
import { auditLog } from '@/lib/logger'

interface LoginBody {
  email: string
  password: string
}

/**
 * POST /api/auth/login
 * Validates credentials and creates an encrypted session cookie.
 * Returns 400 if fields are missing, 401 if credentials are wrong.
 */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const { email, password } = (await request.json()) as LoginBody

    if (!email || !password) {
      return Response.json({ error: 'Email and password are required' }, { status: 400 })
    }

    const user = await db.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    })

    if (!user || !user.active) {
      return Response.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    const match = await bcrypt.compare(password, user.passwordHash)
    if (!match) {
      return Response.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    await createSession(user.id, user.role)
    auditLog(user.id, 'LOGIN', { email: user.email })

    return Response.json({ success: true })
  } catch (err) {
    console.error('Login error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
