'use client'

import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import type { MagazineWithStatus } from '@/types'
import { Button } from '@/components/ui/button'
import { CalendarCheck, Filter } from 'lucide-react'
import MarkReceivedDialog from './MarkReceivedDialog'

type FilterBarMode = {
  mode?: 'filter'
  currentFilter: string
  magazineId?: never
  magazine?: never
}

type RowActionsMode = {
  mode: 'row-actions'
  magazineId: string
  magazine: MagazineWithStatus
  activeBranchId: string
  currentFilter?: never
}

export type MagazinesClientControlsProps = FilterBarMode | RowActionsMode

const FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'this_week', label: 'This Week' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'never_received', label: 'Never Received' },
] as const

function FilterBar({ currentFilter }: { currentFilter: string }) {
  const router = useRouter()
  const pathname = usePathname()

  function applyFilter(value: string) {
    const params = new URLSearchParams()
    if (value !== 'all') params.set('status', value)
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Filter size={14} style={{ color: 'oklch(0.55 0.030 72)' }} />
      {FILTER_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => applyFilter(opt.value)}
          className="px-3 py-1.5 rounded-full text-xs font-medium transition-all border"
          style={{
            backgroundColor: currentFilter === opt.value
              ? 'oklch(0.38 0.082 156)'
              : 'oklch(0.978 0.009 88)',
            color: currentFilter === opt.value
              ? 'oklch(0.978 0.009 88)'
              : 'oklch(0.45 0.035 72)',
            borderColor: currentFilter === opt.value
              ? 'oklch(0.38 0.082 156)'
              : 'oklch(0.876 0.016 88)',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function RowActions({ magazine, activeBranchId }: { magazine: MagazineWithStatus; activeBranchId: string }) {
  const [dialogOpen, setDialogOpen] = useState(false)
  return (
    <>
      <Button
        size="sm"
        className="h-7 text-xs gap-1"
        onClick={() => setDialogOpen(true)}
        style={{ backgroundColor: 'oklch(0.38 0.082 156)' }}
      >
        <CalendarCheck size={12} /> Received
      </Button>
      <MarkReceivedDialog
        magazine={magazine}
        activeBranchId={activeBranchId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </>
  )
}

export default function MagazinesClientControls(props: MagazinesClientControlsProps) {
  if (props.mode === 'row-actions') {
    return <RowActions magazine={props.magazine} activeBranchId={props.activeBranchId} />
  }
  return <FilterBar currentFilter={props.currentFilter} />
}
