import type { NextRequest } from 'next/server'
import db from '@/lib/db'
import { withRetry } from '@/lib/db-retry'
import { verifySessionForApi } from '@/lib/dal'
import { auditLog } from '@/lib/logger'
import { updateSubscriptionPeriodSchema } from '@/lib/validations'
import { checkPeriodActivationConflicts } from '@/lib/period'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * GET /api/subscription-periods/[id]
 * Returns a single period with active subscription count. Any authenticated user.
 */
export async function GET(
  _request: NextRequest,
  context: RouteContext,
): Promise<Response> {
  const session = await verifySessionForApi()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const { id } = await context.params
    const period = await db.subscriptionPeriod.findUnique({
      where: { id },
      include: {
        _count: { select: { subscriptions: { where: { active: true } } } },
      },
    })
    if (!period) return Response.json({ error: 'Period not found' }, { status: 404 })
    return Response.json(period)
  } catch (err) {
    console.error('Get subscription period error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PUT /api/subscription-periods/[id]
 * Updates a subscription period. ADMIN only.
 *
 * Activation (`active: true`):
 *   - Checks for per-magazine conflicts with other active periods.
 *   - Returns 409 with conflict list if any magazine is already active in another period.
 *   - On success: sets period active and bulk-activates all its MagazineSubscription records.
 *
 * Deactivation (`active: false`):
 *   - Sets period inactive and bulk-deactivates all its MagazineSubscription records.
 */
export async function PUT(
  request: NextRequest,
  context: RouteContext,
): Promise<Response> {
  const session = await verifySessionForApi()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'ADMIN') return Response.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const { id } = await context.params
    const body = await request.json()
    const parsed = updateSubscriptionPeriodSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    const existing = await db.subscriptionPeriod.findUnique({ where: { id } })
    if (!existing) return Response.json({ error: 'Period not found' }, { status: 404 })

    // Build update data, normalizing dates to noon UTC
    const data: Record<string, unknown> = {}
    if (parsed.data.name !== undefined) data.name = parsed.data.name.trim()
    if (parsed.data.startDate !== undefined) data.startDate = new Date(parsed.data.startDate + 'T12:00:00Z')
    if (parsed.data.endDate !== undefined) data.endDate = new Date(parsed.data.endDate + 'T12:00:00Z')
    if (parsed.data.active !== undefined) data.active = parsed.data.active

    // Validate date order if either date is being changed
    const newStart = (data.startDate as Date | undefined) ?? existing.startDate
    const newEnd = (data.endDate as Date | undefined) ?? existing.endDate
    if (new Date(newEnd) <= new Date(newStart)) {
      return Response.json({ error: 'End date must be after start date' }, { status: 400 })
    }

    // Activation path: check per-magazine conflicts before committing
    if (parsed.data.active === true && !existing.active) {
      const conflicts = await checkPeriodActivationConflicts(id)
      if (conflicts.length > 0) {
        return Response.json(
          { error: 'Activation blocked', conflicts },
          { status: 409 },
        )
      }
    }

    const updated = await withRetry(() => db.$transaction(async (tx) => {
      const period = await tx.subscriptionPeriod.update({
        where: { id },
        data,
      })

      if (parsed.data.active === true && !existing.active) {
        // Activating: bulk-activate all subscriptions in this period
        await tx.magazineSubscription.updateMany({
          where: { periodId: id },
          data: { active: true },
        })
      } else if (parsed.data.active === false && existing.active) {
        // Deactivating: bulk-deactivate all subscriptions in this period
        await tx.magazineSubscription.updateMany({
          where: { periodId: id },
          data: { active: false },
        })
      }

      return period
    }))

    // Emit targeted audit events for activation/deactivation
    if (parsed.data.active === true && !existing.active) {
      auditLog(session.userId, 'PERIOD_ACTIVATED', { periodName: updated.name })
    } else if (parsed.data.active === false && existing.active) {
      auditLog(session.userId, 'PERIOD_DEACTIVATED', { periodName: updated.name })
    } else {
      // Other field updates (name, dates)
      const changes: Record<string, string> = {}
      if (parsed.data.name !== undefined && parsed.data.name !== existing.name) {
        changes.name = `${existing.name} -> ${updated.name}`
      }
      auditLog(session.userId, 'PERIOD_UPDATED', {
        periodName: updated.name,
        ...changes,
      })
    }

    return Response.json(updated)
  } catch (err) {
    const e = err as { code?: string; message?: string }
    if (e?.code === 'SQLITE_BUSY' || e?.code === 'SQLITE_LOCKED' || (e?.message ?? '').includes('database is locked')) {
      return Response.json({ error: 'Database is busy, please try again' }, { status: 503 })
    }
    if ((e?.message ?? '').includes('Unique constraint')) {
      return Response.json({ error: 'A period with that name already exists' }, { status: 409 })
    }
    console.error('Update subscription period error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
