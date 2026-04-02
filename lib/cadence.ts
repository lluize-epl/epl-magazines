import { addDays, addMonths, addYears, startOfWeek, endOfWeek } from 'date-fns'
import type { CadenceType, MagazineStatus } from '@/types'

/** Maps each cadence to a function that advances a date by one period */
const CADENCE_OFFSETS: Record<CadenceType, (d: Date) => Date> = {
  WEEKLY:    (d) => addDays(d, 7),
  BI_WEEKLY: (d) => addDays(d, 14),
  MONTHLY:   (d) => addMonths(d, 1),
  BI_MONTHLY:(d) => addMonths(d, 2),
  SEASONAL:  (d) => addMonths(d, 3),
  YEARLY:    (d) => addYears(d, 1),
}

/** Human-readable labels for each cadence value */
export const CADENCE_LABELS: Record<CadenceType, string> = {
  WEEKLY:    'Weekly',
  BI_WEEKLY: 'Bi-Weekly',
  MONTHLY:   'Monthly',
  BI_MONTHLY:'Bi-Monthly',
  SEASONAL:  'Seasonal',
  YEARLY:    'Yearly',
}

/**
 * Computes the next expected delivery date from the last received date and cadence.
 * Returns `null` when the magazine has never been received.
 * @param lastReceivedDate - The most recent IssueReceipt.receivedDate, or null
 * @param cadence - Publication cadence
 */
export function computeNextExpectedDate(
  lastReceivedDate: Date | string | null,
  cadence: CadenceType
): Date | null {
  if (!lastReceivedDate) return null
  return CADENCE_OFFSETS[cadence](new Date(lastReceivedDate))
}

/**
 * Returns `true` if the next expected date is in the past.
 * @param nextExpectedDate - Computed next expected date, or null
 */
export function isOverdue(nextExpectedDate: Date | null): boolean {
  if (!nextExpectedDate) return false
  return new Date(nextExpectedDate) < new Date()
}

/**
 * Returns `true` if the next expected date falls within the current calendar week
 * (Sunday through Saturday).
 * @param nextExpectedDate - Computed next expected date, or null
 */
export function isExpectedThisWeek(nextExpectedDate: Date | null): boolean {
  if (!nextExpectedDate) return false
  const now = new Date()
  const weekStart = startOfWeek(now, { weekStartsOn: 0 }) // Sunday
  const weekEnd = endOfWeek(now, { weekStartsOn: 0 })     // Saturday
  const next = new Date(nextExpectedDate)
  return next >= weekStart && next <= weekEnd
}

/**
 * Classifies a magazine's current status based on its last received date and cadence.
 * @param lastReceivedDate - Most recent receipt date, or null for never-received
 * @param cadence - Publication cadence
 * @returns Dashboard status bucket
 */
export function getMagazineStatus(
  lastReceivedDate: Date | string | null,
  cadence: CadenceType
): MagazineStatus {
  if (!lastReceivedDate) return 'never_received'
  const next = computeNextExpectedDate(lastReceivedDate, cadence)
  if (isOverdue(next)) return 'overdue'
  if (isExpectedThisWeek(next)) return 'this_week'
  return 'upcoming'
}

/**
 * Resolves magazine status considering subscription data.
 * Priority: not_subscribed > completed > never_received > cadence-based status.
 *
 * @param lastReceivedDate - Most recent receipt date at the branch within the period
 * @param cadence - Magazine's publication cadence
 * @param receivedCount - Total receipts at the branch within the period's date range
 * @param issuesPerYear - Expected issues from MagazineSubscription (null if not subscribed)
 * @param periodStartDate - The subscription period's start date (used as initial anchor)
 */
export function getSubscriptionAwareStatus(
  lastReceivedDate: Date | string | null,
  cadence: CadenceType,
  receivedCount: number,
  issuesPerYear: number | null,
  periodStartDate: Date | string,
): MagazineStatus {
  // No subscription for this period
  if (issuesPerYear === null) return 'not_subscribed'

  // All expected issues received
  if (receivedCount >= issuesPerYear) return 'completed'

  // Zero receipts — check if any expected date has passed
  if (receivedCount === 0) {
    const firstExpected = computeNextExpectedDate(periodStartDate, cadence)
    if (firstExpected && isOverdue(firstExpected)) return 'never_received'
    if (firstExpected && isExpectedThisWeek(firstExpected)) return 'this_week'
    return 'upcoming'
  }

  // Has some receipts — use cadence from last receipt
  return getMagazineStatus(lastReceivedDate, cadence)
}
