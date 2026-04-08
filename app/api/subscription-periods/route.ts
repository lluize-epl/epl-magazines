import type { NextRequest } from 'next/server'
import db from '@/lib/db'
import { withRetry } from '@/lib/db-retry'
import { verifySessionForApi } from '@/lib/dal'
import { auditLog } from '@/lib/logger'
import { createSubscriptionPeriodSchema } from '@/lib/validations'
import { format } from 'date-fns'

/**
 * GET /api/subscription-periods
 * Lists all subscription periods with active subscription count. Any authenticated user.
 */
export async function GET(): Promise<Response> {
  const session = await verifySessionForApi()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const periods = await db.subscriptionPeriod.findMany({
      orderBy: { startDate: 'desc' },
      include: {
        _count: { select: { subscriptions: { where: { active: true } } } },
      },
    })
    return Response.json(periods)
  } catch (err) {
    console.error('List subscription periods error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/subscription-periods
 * Creates a new subscription period. ADMIN only.
 * Creates the period as inactive (active: false).
 * If copyFromPeriodId is provided, bulk-copies all MagazineSubscription records
 * from the source period into the new period (all copied as active: false).
 */
export async function POST(request: NextRequest): Promise<Response> {
  const session = await verifySessionForApi()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'ADMIN') return Response.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const body = await request.json()
    const parsed = createSubscriptionPeriodSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }
    const { name, startDate: startDateStr, endDate: endDateStr, copyFromPeriodId } = parsed.data

    // Normalize dates to noon UTC
    const startDate = new Date(startDateStr + 'T12:00:00Z')
    const endDate = new Date(endDateStr + 'T12:00:00Z')

    if (endDate <= startDate) {
      return Response.json({ error: 'End date must be after start date' }, { status: 400 })
    }

    const result = await withRetry(() => db.$transaction(async (tx) => {
      // Create the new period as inactive
      const newPeriod = await tx.subscriptionPeriod.create({
        data: { name: name.trim(), startDate, endDate, active: false },
      })

      // Bulk-copy subscriptions from source period if requested
      let copiedCount = 0
      let sourcePeriodName: string | null = null

      if (copyFromPeriodId) {
        const sourcePeriod = await tx.subscriptionPeriod.findUnique({
          where: { id: copyFromPeriodId },
          select: { id: true, name: true },
        })

        if (sourcePeriod) {
          sourcePeriodName = sourcePeriod.name
          const sourceSubs = await tx.magazineSubscription.findMany({
            where: { periodId: sourcePeriod.id },
            select: { magazineId: true, issuesPerYear: true },
          })

          if (sourceSubs.length > 0) {
            await tx.magazineSubscription.createMany({
              data: sourceSubs.map((sub) => ({
                magazineId: sub.magazineId,
                periodId: newPeriod.id,
                issuesPerYear: sub.issuesPerYear,
                active: false,
              })),
            })
            copiedCount = sourceSubs.length
          }
        }
      }

      return { period: newPeriod, copiedCount, sourcePeriodName }
    }))

    auditLog(session.userId, 'PERIOD_CREATED', {
      periodName: result.period.name,
      startDate: format(startDate, 'MM/dd/yyyy'),
      endDate: format(endDate, 'MM/dd/yyyy'),
    })

    if (result.copiedCount > 0) {
      auditLog(session.userId, 'SUBSCRIPTIONS_BULK_COPIED', {
        fromPeriod: result.sourcePeriodName,
        toPeriod: result.period.name,
        count: result.copiedCount,
      })
    }

    return Response.json(result.period, { status: 201 })
  } catch (err) {
    const e = err as { code?: string; message?: string }
    if (e?.code === 'SQLITE_BUSY' || e?.code === 'SQLITE_LOCKED' || (e?.message ?? '').includes('database is locked')) {
      return Response.json({ error: 'Database is busy, please try again' }, { status: 503 })
    }
    if ((e?.message ?? '').includes('Unique constraint')) {
      return Response.json({ error: 'A period with that name already exists' }, { status: 409 })
    }
    console.error('Create subscription period error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
