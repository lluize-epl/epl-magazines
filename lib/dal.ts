import 'server-only'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { decrypt } from './session'
import db from './db'
import type { SessionUser, AuthUser } from '@/types'

/**
 * Verifies the current session cookie and returns the session user.
 * Redirects to /login if the session is missing or invalid.
 * Cached per request via React's `cache()`.
 */
export const verifySession = cache(async (): Promise<SessionUser> => {
  const cookieStore = await cookies()
  const cookie = cookieStore.get('session')?.value
  const session = await decrypt(cookie)

  if (!session?.userId) {
    redirect('/login')
  }

  return { userId: session.userId as string, role: session.role }
})

/**
 * Verifies the current session cookie for API route handlers.
 * Returns `null` instead of redirecting — API routes must handle 401 explicitly.
 * Cached per request via React's `cache()`.
 */
export const verifySessionForApi = cache(async (): Promise<SessionUser | null> => {
  const cookieStore = await cookies()
  const cookie = cookieStore.get('session')?.value
  const session = await decrypt(cookie)

  if (!session?.userId) {
    return null
  }

  return { userId: session.userId as string, role: session.role }
})

/**
 * Returns the full authenticated user record.
 * Redirects to /login if the session is invalid or the user is inactive.
 * Cached per request via React's `cache()`.
 */
export const getUser = cache(async (): Promise<AuthUser> => {
  const session = await verifySession()

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      name: true,
      username: true,
      role: true,
      active: true,
    },
  })

  if (!user || !user.active) {
    redirect('/login')
  }

  return user
})
