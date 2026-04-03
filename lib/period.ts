import db from './db'
import { withRetry } from '@/lib/db-retry'
import { auditLog } from '@/lib/logger'
import type { AuditAction, SubscriptionPeriod } from '@/types'

/**
 * Returns all subscription periods ordered by startDate descending.
 * Used by server components that need the period list.
 */
export async function getSubscriptionPeriods(): Promise<SubscriptionPeriod[]> {
  const periods = await db.subscriptionPeriod.findMany({
    orderBy: { startDate: 'desc' },
    select: { id: true, name: true, startDate: true, endDate: true, active: true, createdAt: true },
  })
  return periods as SubscriptionPeriod[]
}

/**
 * Returns all currently active subscription periods.
 * Used by dashboard and layout for multi-period display.
 */
export async function getActivePeriods(): Promise<SubscriptionPeriod[]> {
  const periods = await db.subscriptionPeriod.findMany({
    where: { active: true },
    orderBy: { startDate: 'desc' },
    select: { id: true, name: true, startDate: true, endDate: true, active: true, createdAt: true },
  })
  return periods as SubscriptionPeriod[]
}

/**
 * Auto-deactivates periods whose endDate has passed.
 * Also bulk-deactivates all MagazineSubscription records for those periods.
 * Called in dashboard layout before data fetching.
 */
export async function deactivateExpiredPeriods(): Promise<void> {
  const now = new Date()
  const expired = await db.subscriptionPeriod.findMany({
    where: { active: true, endDate: { lt: now } },
    select: { id: true, name: true, endDate: true },
  })

  for (const period of expired) {
    await withRetry(async () => {
      await db.$transaction([
        db.subscriptionPeriod.update({
          where: { id: period.id },
          data: { active: false },
        }),
        db.magazineSubscription.updateMany({
          where: { periodId: period.id },
          data: { active: false },
        }),
      ])
    })
    auditLog('system', 'PERIOD_AUTO_DEACTIVATED' as AuditAction, {
      periodName: period.name,
      periodId: period.id,
      endDate: period.endDate,
    })
  }
}

/**
 * Checks if any magazines in a period conflict with other active periods.
 * A conflict means the magazine already has an active MagazineSubscription
 * in another active SubscriptionPeriod.
 * Returns array of conflicts (empty if none).
 */
export async function checkPeriodActivationConflicts(periodId: string): Promise<
  { magazineId: string; magazineName: string; conflictingPeriodName: string }[]
> {
  const subscriptions = await db.magazineSubscription.findMany({
    where: { periodId },
    include: { magazine: { select: { id: true, name: true } } },
  })

  const conflicts: { magazineId: string; magazineName: string; conflictingPeriodName: string }[] = []

  for (const sub of subscriptions) {
    const existing = await db.magazineSubscription.findFirst({
      where: {
        magazineId: sub.magazineId,
        active: true,
        period: { active: true },
        NOT: { periodId },
      },
      include: { period: { select: { name: true } } },
    })
    if (existing) {
      conflicts.push({
        magazineId: sub.magazineId,
        magazineName: sub.magazine.name,
        conflictingPeriodName: existing.period.name,
      })
    }
  }
  return conflicts
}
