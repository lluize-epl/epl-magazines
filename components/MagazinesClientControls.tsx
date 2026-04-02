'use client'

import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import type { MagazineWithStatus, Branch } from '@/types'
import { Button } from '@/components/ui/button'
import { CalendarCheck, Filter, SendHorizontal } from 'lucide-react'
import MarkReceivedDialog from './MarkReceivedDialog'
import TransferDialog from './TransferDialog'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'

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
  branches: Branch[]
  senderQuantity: number
  currentFilter?: never
}

export type MagazinesClientControlsProps = FilterBarMode | RowActionsMode

const FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'this_week', label: 'This Week' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'never_received', label: 'Never Received' },
  { value: 'completed', label: 'Completed' },
  { value: 'not_subscribed', label: 'Not Subscribed' },
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

function RowActions({ magazine, activeBranchId, branches, senderQuantity }: {
  magazine: MagazineWithStatus
  activeBranchId: string
  branches: Branch[]
  senderQuantity: number
}) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)
  const otherBranches = branches.filter(b => b.id !== activeBranchId)

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
      {senderQuantity > 0 && otherBranches.length > 0 && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 w-7 p-0"
                  onClick={() => setTransferOpen(true)}
                />
              }
            >
              <SendHorizontal size={13} style={{ color: 'oklch(0.45 0.082 156)' }} />
            </TooltipTrigger>
            <TooltipContent>Transfer</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      <MarkReceivedDialog
        magazine={magazine}
        activeBranchId={activeBranchId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
      <TransferDialog
        magazineName={magazine.name}
        magazineId={magazine.id}
        maxQuantity={senderQuantity}
        availableBranches={otherBranches}
        open={transferOpen}
        onOpenChange={setTransferOpen}
      />
    </>
  )
}

export default function MagazinesClientControls(props: MagazinesClientControlsProps) {
  if (props.mode === 'row-actions') {
    return (
      <RowActions
        magazine={props.magazine}
        activeBranchId={props.activeBranchId}
        branches={props.branches}
        senderQuantity={props.senderQuantity}
      />
    )
  }
  return <FilterBar currentFilter={props.currentFilter} />
}
