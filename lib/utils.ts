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
 * Safely converts a date value to a Date object, avoiding UTC timezone shift.
 * `new Date('2026-03-27')` parses as UTC midnight, which displays as the previous
 * day in US timezones. `parseISO` from date-fns treats date-only strings as local time.
 * @param date - A Date object, ISO date string, or null
 */
export function toLocalDate(date: Date | string | null): Date | null {
  if (!date) return null
  if (date instanceof Date) return date
  return parseISO(date)
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
