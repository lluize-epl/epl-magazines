'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Plus } from 'lucide-react'
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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import type { SubscriptionPeriod } from '@/types'

export interface CreatePeriodDialogProps {
  /** All existing periods, offered as copy sources. */
  periods: SubscriptionPeriod[]
}

/** Dialog for creating a new subscription period. */
export default function CreatePeriodDialog({ periods }: CreatePeriodDialogProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [copyFromPeriodId, setCopyFromPeriodId] = useState('')
  const [loading, setLoading] = useState(false)

  function reset() {
    setName('')
    setStartDate('')
    setEndDate('')
    setCopyFromPeriodId('')
  }

  const selectedPeriodName = periods.find((p) => p.id === copyFromPeriodId)?.name ?? ''

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    try {
      const body: Record<string, string> = { name: name.trim(), startDate, endDate }
      if (copyFromPeriodId) body.copyFromPeriodId = copyFromPeriodId

      const res = await fetch('/api/subscription-periods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = (await res.json()) as { error?: string; name?: string }
      if (!res.ok) { toast.error(data.error || 'Failed to create period'); return }
      toast.success(`Period "${data.name}" created`)
      setOpen(false)
      reset()
      router.refresh()
    } catch {
      toast.error('Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className="gap-2"
        style={{ backgroundColor: 'oklch(0.38 0.082 156)' }}
      >
        <Plus size={16} /> Create New Period
      </Button>

      <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); setOpen(v) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'var(--font-playfair)' }}>Create Subscription Period</DialogTitle>
            <DialogDescription>
              Create a new subscription period for tracking magazine deliveries.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="period-name">Period Name</Label>
              <Input
                id="period-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Ebsco-25/26, Wtcox-25"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="period-copy-from">Copy subscriptions from</Label>
              <Select value={copyFromPeriodId} onValueChange={(v) => setCopyFromPeriodId(v != null && v !== '__none__' ? v : '')}>
                <SelectTrigger id="period-copy-from">
                  <SelectValue>
                    {copyFromPeriodId ? selectedPeriodName : 'None'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {periods.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {copyFromPeriodId && (
                <p className="text-xs" style={{ color: 'oklch(0.45 0.06 200)' }}>
                  Subscriptions from {selectedPeriodName} will be copied as inactive.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="period-start">Start Date</Label>
              <Input
                id="period-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="period-end">End Date</Label>
              <Input
                id="period-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={loading}
                className="gap-2"
                style={{ backgroundColor: 'oklch(0.38 0.082 156)' }}
              >
                {loading ? <><Loader2 size={15} className="animate-spin" /> Creating...</> : <><Plus size={15} /> Create Period</>}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
