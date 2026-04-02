import type { NextRequest } from 'next/server'
import db from '@/lib/db'
import { withRetry } from '@/lib/db-retry'
import { verifySessionForApi } from '@/lib/dal'
import { auditLog } from '@/lib/logger'
import { updateMagazineSubscriptionSchema } from '@/lib/validations'

type RouteContext = { params: Promise<{ id: string; subId: string }> }

/**
 * PUT /api/subscription-periods/[id]/subscriptions/[subId]
 * Updates a magazine subscription (issuesPerYear, active). ADMIN only.
 * Logs SUBSCRIPTION_DEACTIVATED when setting active: false, otherwise SUBSCRIPTION_UPDATED.
 */
export async function PUT(
  request: NextRequest,
  context: RouteContext,
): Promise<Response> {
  const session = await verifySessionForApi()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'ADMIN') return Response.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const { id, subId } = await context.params
    const body = await request.json()
    const parsed = updateMagazineSubscriptionSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    // Fetch existing subscription with magazine and period names for audit
    const existing = await db.magazineSubscription.findUnique({
      where: { id: subId, periodId: id },
      include: {
        magazine: { select: { name: true } },
        period: { select: { name: true } },
      },
    })
    if (!existing) return Response.json({ error: 'Subscription not found' }, { status: 404 })

    const data: Record<string, unknown> = {}
    if (parsed.data.issuesPerYear !== undefined) data.issuesPerYear = parsed.data.issuesPerYear
    if (parsed.data.active !== undefined) data.active = parsed.data.active

    const updated = await withRetry(() => db.magazineSubscription.update({
      where: { id: subId },
      data,
      include: {
        magazine: { select: { id: true, name: true, cadence: true, language: true, active: true } },
      },
    }))

    // Audit log with old/new values
    if (parsed.data.active === false && existing.active) {
      auditLog(session.userId, 'SUBSCRIPTION_DEACTIVATED', {
        magazineName: existing.magazine.name,
        periodName: existing.period.name,
      })
    } else {
      const changes: Record<string, string> = {}
      if (parsed.data.issuesPerYear !== undefined && parsed.data.issuesPerYear !== existing.issuesPerYear) {
        changes.issuesPerYear = `${existing.issuesPerYear} -> ${parsed.data.issuesPerYear}`
      }
      if (parsed.data.active !== undefined && parsed.data.active !== existing.active) {
        changes.active = `${existing.active} -> ${parsed.data.active}`
      }
      auditLog(session.userId, 'SUBSCRIPTION_UPDATED', {
        magazineName: existing.magazine.name,
        periodName: existing.period.name,
        ...changes,
      })
    }

    return Response.json(updated)
  } catch (err) {
    const e = err as { code?: string; message?: string }
    if (e?.code === 'SQLITE_BUSY' || e?.code === 'SQLITE_LOCKED' || (e?.message ?? '').includes('database is locked')) {
      return Response.json({ error: 'Database is busy, please try again' }, { status: 503 })
    }
    console.error('Update period subscription error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
