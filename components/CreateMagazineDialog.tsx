'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
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

/** Minimal branch shape needed by the create form. */
export interface BranchOption {
  id: string
  name: string
  code: string
}

export interface CreateMagazineDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** All active branches the magazine can be added to. */
  branches: BranchOption[]
}

const CADENCES = Object.entries(CADENCE_LABELS)
const LANGUAGES = ['English', 'Gujarati', 'Hindi', 'Tamil', 'Telugu']

export default function CreateMagazineDialog({ open, onOpenChange, branches }: CreateMagazineDialogProps) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [cadence, setCadence] = useState('')
  const [language, setLanguage] = useState('English')
  const [notes, setNotes] = useState('')
  // Map of branchId → quantity for checked branches only.
  const [branchQty, setBranchQty] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(false)

  const selectedBranchIds = Object.keys(branchQty)

  function reset() {
    setName('')
    setCadence('')
    setLanguage('English')
    setNotes('')
    setBranchQty({})
  }

  function toggleBranch(branchId: string, checked: boolean) {
    setBranchQty((prev) => {
      const next = { ...prev }
      if (checked) next[branchId] = next[branchId] ?? 1
      else delete next[branchId]
      return next
    })
  }

  function setQty(branchId: string, qty: number) {
    setBranchQty((prev) => ({ ...prev, [branchId]: Math.max(1, qty || 1) }))
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!cadence || selectedBranchIds.length === 0) return
    setLoading(true)

    try {
      const res = await fetch('/api/magazines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          cadence,
          language,
          notes: notes.trim() || null,
          branches: selectedBranchIds.map((branchId) => ({ branchId, quantity: branchQty[branchId] })),
        }),
      })

      const data = (await res.json()) as { id?: string; error?: string }
      if (!res.ok) {
        toast.error(data.error || 'Failed to create magazine')
        return
      }

      toast.success(`${name} added to ${selectedBranchIds.length} branch${selectedBranchIds.length > 1 ? 'es' : ''}`)
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
          <DialogDescription>Add a periodical to one or more branch collections.</DialogDescription>
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
            <Label htmlFor="mag-language">Language</Label>
            <Select value={language} onValueChange={(v) => setLanguage(v ?? 'English')}>
              <SelectTrigger id="mag-language">
                <SelectValue>{language}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((lang) => (
                  <SelectItem key={lang} value={lang}>{lang}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Branches &amp; Quantity</Label>
            <div className="rounded-md border divide-y" style={{ borderColor: 'oklch(0.876 0.016 88)' }}>
              {branches.map((b) => {
                const checked = b.id in branchQty
                return (
                  <div key={b.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="flex items-center gap-2 text-sm">
                      <Checkbox
                        id={`branch-${b.id}`}
                        checked={checked}
                        onCheckedChange={(v) => toggleBranch(b.id, v === true)}
                      />
                      <label htmlFor={`branch-${b.id}`} className="cursor-pointer">
                        {b.name} <span className="text-muted-foreground">({b.code})</span>
                      </label>
                    </div>
                    {checked && (
                      <Input
                        type="number"
                        min={1}
                        max={100}
                        value={branchQty[b.id]}
                        onChange={(e) => setQty(b.id, parseInt(e.target.value, 10))}
                        className="h-8 w-20"
                        aria-label={`Quantity for ${b.name}`}
                      />
                    )}
                  </div>
                )
              })}
            </div>
            {selectedBranchIds.length === 0 && (
              <p className="text-xs text-muted-foreground">Select at least one branch.</p>
            )}
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
              disabled={loading || !cadence || selectedBranchIds.length === 0}
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
