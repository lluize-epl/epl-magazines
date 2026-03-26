'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { Magazine } from '@/types'
import { Button } from '@/components/ui/button'
import { CalendarCheck, PackageCheck } from 'lucide-react'
import MarkReceivedDialog from './MarkReceivedDialog'
import DeleteConfirmDialog from './DeleteConfirmDialog'

export interface PendingTransferInfo {
  id: string
  quantity: number
  fromBranchName: string
}

export interface MagazineDetailActionsProps {
  magazine: Pick<Magazine, 'id' | 'name'>
  activeBranchId: string
  pendingTransfer: PendingTransferInfo | null
}

export default function MagazineDetailActions({ magazine, activeBranchId, pendingTransfer }: MagazineDetailActionsProps) {
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  async function completeTransfer() {
    const res = await fetch(`/api/transfers/${pendingTransfer!.id}/complete`, { method: 'PUT' })
    if (res.ok) {
      toast.success(`Transfer received — ${pendingTransfer!.quantity} copy(s) of ${magazine.name}`)
      setConfirmOpen(false)
      router.refresh()
    } else {
      const data = (await res.json()) as { error?: string }
      toast.error(data.error || 'Failed to complete transfer')
    }
  }

  if (pendingTransfer) {
    return (
      <>
        <Button
          className="gap-2 flex-shrink-0"
          onClick={() => setConfirmOpen(true)}
          style={{ backgroundColor: 'oklch(0.45 0.15 250)' }}
        >
          <PackageCheck size={16} /> Receive Transfer
        </Button>
        <DeleteConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={`Receive transfer of "${magazine.name}"?`}
          description={`${pendingTransfer.quantity} copy(s) from ${pendingTransfer.fromBranchName}. This will mark the transfer as completed and record a receipt.`}
          confirmLabel="Receive"
          loadingLabel="Receiving..."
          onConfirm={completeTransfer}
        />
      </>
    )
  }

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
