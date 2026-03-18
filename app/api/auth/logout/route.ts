import { cookies } from 'next/headers'
import { decrypt, deleteSession } from '@/lib/session'
import { auditLog } from '@/lib/logger'

/**
 * POST /api/auth/logout
 * Reads the current session to log the action, then clears the session cookie.
 * Always returns success — a missing/invalid session is not an error.
 */
export async function POST(): Promise<Response> {
  try {
    const cookieStore = await cookies()
    const cookie = cookieStore.get('session')?.value
    const session = await decrypt(cookie)

    if (session?.userId) {
      auditLog(session.userId, 'LOGOUT')
    }

    await deleteSession()
    return Response.json({ success: true })
  } catch {
    return Response.json({ success: true })
  }
}
