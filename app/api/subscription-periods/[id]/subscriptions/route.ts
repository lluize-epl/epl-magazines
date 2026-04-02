import type { NextRequest } from 'next/server'
import db from '@/lib/db'
import { withRetry } from '@/lib/db-retry'
import { verifySessionForApi } from '@/lib/dal'
import { auditLog } from '@/lib/logger'
import { createMagazineSubscriptionSchema } from '@/lib/validations'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * GET /api/subscription-periods/[id]/subscriptions
 * Lists all magazine subscriptions for a period with magazine details.
 * Supports optional `?search=` query param to filter by magazine name.
 * Any authenticated user.
 */
export async function GET(
  request: NextRequest,
  context: RouteContext,
): Promise<Response> {
  const session = await verifySessionForApi()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const { id } = await context.params
    const search = request.nextUrl.searchParams.get('search')?.trim() ?? ''

    // Verify period exists
    const period = await db.subscriptionPeriod.findUnique({ where: { id }, select: { id: true } })
    if (!period) return Response.json({ error: 'Period not found' }, { status: 404 })

    const subscriptions = await db.magazineSubscription.findMany({
      where: {
        periodId: id,
        ...(search ? { magazine: { name: { contains: search } } } : {}),
      },
      include: {
        magazine: { select: { id: true, name: true, cadence: true, language: true, active: true } },
      },
      orderBy: { magazine: { name: 'asc' } },
    })

    return Response.json(subscriptions)
  } catch (err) {
    console.error('List period subscriptions error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/subscription-periods/[id]/subscriptions
 * Adds a magazine subscription to this period. ADMIN only.
 * Returns 409 if the magazine is already subscribed in this period.
 */
export async function POST(
  request: NextRequest,
  context: RouteContext,
): Promise<Response> {
  const session = await verifySessionForApi()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'ADMIN') return Response.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const { id } = await context.params
    const body = await request.json()
    const parsed = createMagazineSubscriptionSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }
    const { magazineId, issuesPerYear } = parsed.data

    // Verify period and magazine exist
    const [period, magazine] = await Promise.all([
      db.subscriptionPeriod.findUnique({ where: { id }, select: { id: true, name: true } }),
      db.magazine.findUnique({ where: { id: magazineId }, select: { id: true, name: true } }),
    ])
    if (!period) return Response.json({ error: 'Period not found' }, { status: 404 })
    if (!magazine) return Response.json({ error: 'Magazine not found' }, { status: 404 })

    // Check for duplicate
    const existing = await db.magazineSubscription.findUnique({
      where: { magazineId_periodId: { magazineId, periodId: id } },
    })
    if (existing) {
      return Response.json({ error: `${magazine.name} is already subscribed in this period` }, { status: 409 })
    }

    const subscription = await withRetry(() => db.magazineSubscription.create({
      data: { magazineId, periodId: id, issuesPerYear, active: true },
      include: {
        magazine: { select: { id: true, name: true, cadence: true, language: true, active: true } },
      },
    }))

    auditLog(session.userId, 'SUBSCRIPTION_CREATED', {
      magazineName: magazine.name,
      periodName: period.name,
      issuesPerYear,
    })

    return Response.json(subscription, { status: 201 })
  } catch (err) {
    const e = err as { code?: string; message?: string }
    if (e?.code === 'SQLITE_BUSY' || e?.code === 'SQLITE_LOCKED' || (e?.message ?? '').includes('database is locked')) {
      return Response.json({ error: 'Database is busy, please try again' }, { status: 503 })
    }
    console.error('Create period subscription error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
