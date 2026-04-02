'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'

/** Dialog for creating a new subscription period. */
export default function CreatePeriodDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [loading, setLoading] = useState(false)

  function reset() { setName(''); setStartDate(''); setEndDate('') }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch('/api/subscription-periods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), startDate, endDate }),
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
              Define a new EBSCO billing cycle period.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Period Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. 2026-2027"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Start Date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>End Date</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
              />
            </div>

            <p
              className="text-xs rounded-md px-3 py-2"
              style={{ backgroundColor: 'oklch(0.95 0.06 85 / 0.3)', color: 'oklch(0.40 0.10 78)' }}
            >
              All active magazine subscriptions from the current period will be copied to the new period.
            </p>

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
