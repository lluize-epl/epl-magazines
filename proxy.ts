import type { NextRequest, NextResponse } from 'next/server'
import { NextResponse as NextResponseImpl } from 'next/server'
import { decrypt } from '@/lib/session'
import { cookies } from 'next/headers'
import type { SessionPayload } from '@/types'

const publicRoutes = ['/login']

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

  const cookieStore = await cookies()
  const cookie = cookieStore.get('session')?.value
  const session: SessionPayload | null = await decrypt(cookie)

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
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
