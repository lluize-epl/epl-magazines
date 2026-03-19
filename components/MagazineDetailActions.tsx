'use client'

import { useState } from 'react'
import type { Magazine } from '@/types'
import { Button } from '@/components/ui/button'
import { CalendarCheck } from 'lucide-react'
import MarkReceivedDialog from './MarkReceivedDialog'

export interface MagazineDetailActionsProps {
  magazine: Pick<Magazine, 'id' | 'name'>
  activeBranchId: string
}

export default function MagazineDetailActions({ magazine, activeBranchId }: MagazineDetailActionsProps) {
  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <>
      <Button
        className="gap-2 flex-shrink-0"
        onClick={() => setDialogOpen(true)}
        style={{ backgroundColor: 'oklch(0.38 0.082 156)' }}
      >
        <CalendarCheck size={16} /> Mark Received
      </Button>
      <MarkReceivedDialog magazine={magazine} activeBranchId={activeBranchId} open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  )
}
