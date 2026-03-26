'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { Magazine } from '@/types'
import { Button } from '@/components/ui/button'
import { CalendarCheck, PackageCheck, Loader2 } from 'lucide-react'
import MarkReceivedDialog from './MarkReceivedDialog'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

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
  const [loading, setLoading] = useState(false)

  async function completeTransfer() {
    setLoading(true)
    try {
      const res = await fetch(`/api/transfers/${pendingTransfer!.id}/complete`, { method: 'PUT' })
      if (res.ok) {
        toast.success(`Transfer received — ${pendingTransfer!.quantity} copy(s) of ${magazine.name}`)
        setConfirmOpen(false)
        router.refresh()
      } else {
        const data = (await res.json()) as { error?: string }
        toast.error(data.error || 'Failed to complete transfer')
      }
    } finally {
      setLoading(false)
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
        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle style={{ fontFamily: 'var(--font-playfair)' }}>
                Receive transfer of &quot;{magazine.name}&quot;?
              </DialogTitle>
              <DialogDescription>
                {pendingTransfer.quantity} copy(s) from {pendingTransfer.fromBranchName}. This will mark the transfer as completed and record a receipt.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="pt-2">
              <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={loading}>
                Cancel
              </Button>
              <Button
                onClick={completeTransfer}
                disabled={loading}
                className="gap-2"
                style={{ backgroundColor: 'oklch(0.45 0.15 250)' }}
              >
                {loading ? (
                  <><Loader2 size={15} className="animate-spin" /> Receiving...</>
                ) : (
                  <><PackageCheck size={15} /> Receive</>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
