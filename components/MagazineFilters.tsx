'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CADENCE_LABELS } from '@/lib/cadence'
import type { CadenceType } from '@/types'

/** Status filter options with human-readable labels */
const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
]

export interface MagazineFiltersProps {
  /** Available languages for the language dropdown */
  languages: string[]
  /** Available cadences for the cadence dropdown */
  cadences: CadenceType[]
}

/**
 * Filter dropdowns for the admin magazines page.
 * Uses URL search params for server-side filtering.
 */
export default function MagazineFilters({ languages, cadences }: MagazineFiltersProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const currentCadence = searchParams.get('cadence') ?? ''
  const currentLanguage = searchParams.get('language') ?? ''
  const currentStatus = searchParams.get('status') ?? ''

  const hasActiveFilters = !!(currentCadence || currentLanguage || currentStatus)

  /** Update a single URL param, resetting pagination */
  const setFilter = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) {
        params.set(key, value)
      } else {
        params.delete(key)
      }
      params.delete('page')
      const qs = params.toString()
      router.push(`${pathname}${qs ? `?${qs}` : ''}`)
    },
    [router, pathname, searchParams],
  )

  /** Clear all filter params (preserves search) */
  const clearAllFilters = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('cadence')
    params.delete('language')
    params.delete('status')
    params.delete('page')
    const qs = params.toString()
    router.push(`${pathname}${qs ? `?${qs}` : ''}`)
  }, [router, pathname, searchParams])

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Cadence filter */}
      <Select
        value={currentCadence || 'all'}
        onValueChange={(v) => setFilter('cadence', v === 'all' ? null : v)}
      >
        <SelectTrigger className="h-9 text-sm" style={{ borderColor: 'oklch(0.876 0.016 88)' }}>
          <SelectValue>
            {currentCadence
              ? CADENCE_LABELS[currentCadence as CadenceType]
              : 'All Cadences'}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Cadences</SelectItem>
          {cadences.map((c) => (
            <SelectItem key={c} value={c}>
              {CADENCE_LABELS[c]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Language filter */}
      <Select
        value={currentLanguage || 'all'}
        onValueChange={(v) => setFilter('language', v === 'all' ? null : v)}
      >
        <SelectTrigger className="h-9 text-sm" style={{ borderColor: 'oklch(0.876 0.016 88)' }}>
          <SelectValue>
            {currentLanguage || 'All Languages'}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Languages</SelectItem>
          {languages.map((lang) => (
            <SelectItem key={lang} value={lang}>
              {lang}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Status filter */}
      <Select
        value={currentStatus || 'all'}
        onValueChange={(v) => setFilter('status', v === 'all' ? null : v)}
      >
        <SelectTrigger className="h-9 text-sm" style={{ borderColor: 'oklch(0.876 0.016 88)' }}>
          <SelectValue>
            {currentStatus
              ? STATUS_OPTIONS.find((o) => o.value === currentStatus)?.label ?? 'All Statuses'
              : 'All Statuses'}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Statuses</SelectItem>
          {STATUS_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Clear all button */}
      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={clearAllFilters}
          className="h-9 px-2.5 text-sm gap-1"
          style={{ color: 'oklch(0.50 0.035 72)' }}
        >
          <X size={14} />
          Clear filters
        </Button>
      )}
    </div>
  )
}
