import { cookies } from 'next/headers'
import db from './db'
import type { SubscriptionPeriod } from '@/types'

const PERIOD_COOKIE = 'epl-active-period'

/**
 * Reads the active period ID from the cookie.
 * Returns null if not set.
 */
export async function getActivePeriodId(): Promise<string | null> {
  const cookieStore = await cookies()
  return cookieStore.get(PERIOD_COOKIE)?.value ?? null
}

/**
 * Returns all subscription periods ordered by startDate descending.
 * Used by server components that need the period list (e.g., Sidebar).
 */
export async function getSubscriptionPeriods(): Promise<SubscriptionPeriod[]> {
  const periods = await db.subscriptionPeriod.findMany({
    orderBy: { startDate: 'desc' },
    select: { id: true, name: true, startDate: true, endDate: true, active: true, createdAt: true },
  })
  return periods as SubscriptionPeriod[]
}

/**
 * Resolves the active period. If cookie is set and valid, returns that period ID.
 * Falls back to the period with active=true, then the most recent period.
 */
export async function resolveActivePeriodId(): Promise<string> {
  const cookiePeriodId = await getActivePeriodId()

  if (cookiePeriodId) {
    const period = await db.subscriptionPeriod.findUnique({
      where: { id: cookiePeriodId },
      select: { id: true },
    })
    if (period) return period.id
  }

  const fallback = await db.subscriptionPeriod.findFirst({
    where: { active: true },
    select: { id: true },
  }) ?? await db.subscriptionPeriod.findFirst({
    orderBy: { startDate: 'desc' },
    select: { id: true },
  })

  if (!fallback) throw new Error('No subscription periods in database')
  return fallback.id
}

/**
 * Resolves the full active period record.
 * Needed for date range filtering in queries.
 */
export async function resolveActivePeriod(): Promise<SubscriptionPeriod> {
  const periodId = await resolveActivePeriodId()
  const period = await db.subscriptionPeriod.findUniqueOrThrow({
    where: { id: periodId },
    select: { id: true, name: true, startDate: true, endDate: true, active: true, createdAt: true },
  })
  return period as SubscriptionPeriod
}

export { PERIOD_COOKIE }
