import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { parseISO } from 'date-fns'

/**
 * Merges Tailwind CSS class names, resolving conflicts with tailwind-merge.
 * @param inputs - Any combination of strings, arrays, or conditional class values
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/**
 * Safely converts a date value to a Date object for display, avoiding UTC timezone shift.
 * Receipt dates are stored at UTC midnight. Whether they reach us as a `Date` instance
 * (server-side, or preserved across the RSC boundary) or as an ISO timestamp string,
 * formatting that UTC-midnight instant in a US timezone renders the previous day. We take
 * the UTC calendar date and re-parse just the date portion, which `parseISO` treats as
 * local midnight — so the displayed day matches the stored day in any timezone.
 * @param date - A Date object, ISO date or timestamp string, or null
 */
export function toLocalDate(date: Date | string | null): Date | null {
  if (!date) return null
  const iso = typeof date === 'string' ? date : date.toISOString()
  return parseISO(iso.split('T')[0])
}

/**
 * Display label for a magazine, disambiguating same-name titles by language.
 * English titles show the bare name; non-English append " - <Language>".
 * @param name - Magazine name
 * @param language - Magazine language (e.g. "English", "Spanish")
 */
export function formatMagazineLabel(name: string, language: string): string {
  return language && language !== 'English' ? `${name} - ${language}` : name
}
