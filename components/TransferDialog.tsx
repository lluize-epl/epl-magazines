'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { Branch } from '@/types'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SendHorizontal } from 'lucide-react'

export interface TransferDialogProps {
  /** Magazine to transfer */
  magazineName: string
  magazineId: string
  /** Max quantity the sender branch holds */
  maxQuantity: number
  /** All active branches except the sender */
  availableBranches: Branch[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function TransferDialog({
  magazineName,
  magazineId,
  maxQuantity,
  availableBranches,
  open,
  onOpenChange,
}: TransferDialogProps) {
  const router = useRouter()
  const [toBranchId, setToBranchId] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    if (!toBranchId) {
      toast.error('Please select a destination branch')
      return
    }
    if (quantity < 1 || quantity > maxQuantity) {
      toast.error(`Quantity must be between 1 and ${maxQuantity}`)
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ magazineId, toBranchId, quantity }),
      })

      if (res.ok) {
        toast.success('Transfer initiated')
        onOpenChange(false)
        setToBranchId('')
        setQuantity(1)
        router.refresh()
      } else {
        const data = (await res.json()) as { error?: string }
        toast.error(data.error || 'Failed to initiate transfer')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SendHorizontal size={18} style={{ color: 'oklch(0.38 0.082 156)' }} />
            Transfer Magazine
          </DialogTitle>
          <DialogDescription>
            Send copies of <strong>{magazineName}</strong> to another branch.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Destination Branch</Label>
            <Select value={toBranchId} onValueChange={(val) => setToBranchId(val ?? '')}>
              <SelectTrigger>
                <SelectValue placeholder="Select branch" />
              </SelectTrigger>
              <SelectContent>
                {availableBranches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Quantity (max {maxQuantity})</Label>
            <Input
              type="number"
              min={1}
              max={maxQuantity}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Math.min(maxQuantity, parseInt(e.target.value) || 1)))}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !toBranchId}
            style={{ backgroundColor: 'oklch(0.38 0.082 156)' }}
          >
            {submitting ? 'Sending...' : 'Send Transfer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
