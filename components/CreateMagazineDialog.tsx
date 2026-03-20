'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { CADENCE_LABELS } from '@/lib/cadence'

export interface CreateMagazineDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  branchId: string
}

const CADENCES = Object.entries(CADENCE_LABELS)

export default function CreateMagazineDialog({ open, onOpenChange, branchId }: CreateMagazineDialogProps) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [cadence, setCadence] = useState('')
  const [notes, setNotes] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [loading, setLoading] = useState(false)

  function reset() {
    setName('')
    setCadence('')
    setNotes('')
    setQuantity(1)
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!cadence) return
    setLoading(true)

    try {
      // Step 1: Create the global magazine record
      const magRes = await fetch('/api/magazines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), cadence, notes: notes.trim() || null }),
      })

      const magData = (await magRes.json()) as { id?: string; error?: string }
      if (!magRes.ok) {
        toast.error(magData.error || 'Failed to create magazine')
        return
      }

      // Step 2: Subscribe to the active branch
      const subRes = await fetch(`/api/branches/${branchId}/magazines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ magazineId: magData.id, quantity }),
      })

      if (!subRes.ok) {
        toast.error('Magazine created but failed to subscribe to branch. You can retry from the edit view.')
      } else {
        toast.success(`${name} added to the collection`)
      }

      onOpenChange(false)
      reset()
      router.refresh()
    } catch {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: 'var(--font-playfair)' }}>Add New Magazine</DialogTitle>
          <DialogDescription>Add a periodical to this branch&apos;s collection.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="mag-name">Magazine Name</Label>
            <Input
              id="mag-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. The Economist"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mag-cadence">Delivery Cadence</Label>
            <Select value={cadence} onValueChange={(v) => setCadence(v ?? '')} required>
              <SelectTrigger id="mag-cadence">
                <SelectValue placeholder="Select cadence…" />
              </SelectTrigger>
              <SelectContent>
                {CADENCES.map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mag-quantity">Quantity</Label>
            <Input
              id="mag-quantity"
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mag-notes">
              Notes <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Textarea
              id="mag-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any notes about this publication…"
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || !cadence}
              className="gap-2"
              style={{ backgroundColor: 'oklch(0.38 0.082 156)' }}
            >
              {loading ? (
                <><Loader2 size={15} className="animate-spin" /> Saving…</>
              ) : (
                <><Plus size={15} /> Add Magazine</>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
