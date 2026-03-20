import { addDays, addMonths, startOfWeek, endOfWeek } from 'date-fns'
import type { CadenceType, MagazineStatus } from '@/types'

/** Maps each cadence to a function that advances a date by one period */
const CADENCE_OFFSETS: Record<CadenceType, (d: Date) => Date> = {
  WEEKLY:    (d) => addDays(d, 7),
  BI_WEEKLY: (d) => addDays(d, 14),
  MONTHLY:   (d) => addMonths(d, 1),
  BI_MONTHLY:(d) => addMonths(d, 2),
  SEASONAL:  (d) => addMonths(d, 3),
}

/** Human-readable labels for each cadence value */
export const CADENCE_LABELS: Record<CadenceType, string> = {
  WEEKLY:    'Weekly',
  BI_WEEKLY: 'Bi-Weekly',
  MONTHLY:   'Monthly',
  BI_MONTHLY:'Bi-Monthly',
  SEASONAL:  'Seasonal',
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
