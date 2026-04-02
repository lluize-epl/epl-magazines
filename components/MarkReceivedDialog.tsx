'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { CheckCircle, Loader2 } from 'lucide-react'
import type { Magazine } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

export interface MarkReceivedDialogProps {
  magazine: Pick<Magazine, 'id' | 'name'>
  activeBranchId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Whether all expected issues for the period have been received */
  isCompleted?: boolean
}

export default function MarkReceivedDialog({ magazine, activeBranchId, open, onOpenChange, isCompleted = false }: MarkReceivedDialogProps) {
  const router = useRouter()
  const today = format(new Date(), 'yyyy-MM-dd')
  const [receivedDate, setReceivedDate] = useState(today)
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)

    try {
      const res = await fetch(`/api/magazines/${magazine.id}/receipts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receivedDate, notes: notes.trim() || null, branchId: activeBranchId }),
      })

      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        toast.error(data.error || 'Failed to record receipt')
        return
      }

      toast.success(`${magazine.name} marked as received`)
      onOpenChange(false)
      setNotes('')
      setReceivedDate(today)
      router.refresh()
    } catch {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle
            className="text-lg"
            style={{ fontFamily: 'var(--font-playfair)' }}
          >
            Mark as Received
          </DialogTitle>
          <DialogDescription>
            Recording receipt for <strong>{magazine.name}</strong>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="received-date">Date Received</Label>
            <Input
              id="received-date"
              type="date"
              value={receivedDate}
              onChange={(e) => setReceivedDate(e.target.value)}
              max={today}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">
              Notes <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any notes about this issue…"
              rows={3}
            />
          </div>

          {isCompleted && (
            <div className="rounded-md p-3 mb-4 text-sm" style={{ backgroundColor: 'oklch(0.95 0.06 85 / 0.3)', color: 'oklch(0.35 0.06 85)' }}>
              All expected issues for this period have been received. Is this an extra or replacement copy?
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="gap-2"
              style={{ backgroundColor: 'oklch(0.38 0.082 156)' }}
            >
              {loading ? (
                <><Loader2 size={15} className="animate-spin" /> Saving…</>
              ) : (
                <><CheckCircle size={15} /> Confirm Receipt</>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
