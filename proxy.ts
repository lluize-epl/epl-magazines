import type { NextRequest, NextResponse } from 'next/server'
import { NextResponse as NextResponseImpl } from 'next/server'
import { jwtVerify } from 'jose'
import type { SessionPayload } from '@/types'

const publicRoutes = ['/login']

/** Returns the encoded SESSION_SECRET key */
function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET is not set')
  return new TextEncoder().encode(secret)
}

/**
 * Decrypts a session JWT for use in middleware (Edge-compatible).
 * Duplicated from lib/session.ts to avoid importing 'server-only' in Edge runtime.
 */
async function decryptSession(session: string | undefined): Promise<SessionPayload | null> {
  if (!session) return null
  try {
    const { payload } = await jwtVerify(session, getSecret(), {
      algorithms: ['HS256'],
    })
    return payload as unknown as SessionPayload
  } catch {
    return null
  }
}

/**
 * Middleware proxy for route protection.
 * Redirects unauthenticated users to /login for protected routes.
 * Redirects authenticated users away from /login to the home page.
 * @param request - The incoming HTTP request from Next.js
 * @returns NextResponse with redirect or next() call
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const path = request.nextUrl.pathname
  const isPublicRoute = publicRoutes.includes(path)

  const cookie = request.cookies.get('session')?.value
  const session = await decryptSession(cookie)

  // Redirect unauthenticated users trying to access protected routes
  if (!isPublicRoute && !session?.userId) {
    return NextResponseImpl.redirect(new URL('/login', request.nextUrl))
  }

  // Redirect authenticated users away from login
  if (isPublicRoute && session?.userId) {
    return NextResponseImpl.redirect(new URL('/', request.nextUrl))
  }

  return NextResponseImpl.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.png$).*)'],
}
