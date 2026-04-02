'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { toLocalDate } from '@/lib/utils'
import { Pencil, Trash2, Loader2, Save } from 'lucide-react'
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
  DialogFooter,
} from '@/components/ui/dialog'
import DeleteConfirmDialog from '@/components/DeleteConfirmDialog'

/** Branch option for the edit dialog dropdown */
interface BranchOption {
  id: string
  name: string
}

/** Receipt data needed by the actions component */
interface ReceiptData {
  id: string
  receivedDate: string
  branchId: string | null
  branchName: string | null
  notes: string | null
}

export interface ReceiptActionsProps {
  receipt: ReceiptData
  magazineId: string
  branches: BranchOption[]
}

/**
 * Admin-only actions (edit / delete) for an individual receipt row.
 * Renders icon buttons that open edit and delete dialogs.
 */
export default function ReceiptActions({ receipt, magazineId, branches }: ReceiptActionsProps) {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  // Edit form state
  const localDate = toLocalDate(receipt.receivedDate)
  const [receivedDate, setReceivedDate] = useState(
    localDate ? format(localDate, 'yyyy-MM-dd') : ''
  )
  const [branchId, setBranchId] = useState(receipt.branchId ?? '')
  const [notes, setNotes] = useState(receipt.notes ?? '')

  function resetForm() {
    const d = toLocalDate(receipt.receivedDate)
    setReceivedDate(d ? format(d, 'yyyy-MM-dd') : '')
    setBranchId(receipt.branchId ?? '')
    setNotes(receipt.notes ?? '')
  }

  async function handleEdit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch(`/api/magazines/${magazineId}/receipts/${receipt.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receivedDate,
          branchId: branchId || undefined,
          notes: notes.trim() || null,
        }),
      })
      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        toast.error(data.error || 'Failed to update receipt')
        return
      }
      toast.success('Receipt updated')
      setEditOpen(false)
      router.refresh()
    } catch {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    const res = await fetch(`/api/magazines/${magazineId}/receipts/${receipt.id}`, {
      method: 'DELETE',
    })
    if (!res.ok && res.status !== 204) {
      const data = (await res.json()) as { error?: string }
      toast.error(data.error || 'Failed to delete receipt')
      return
    }
    toast.success('Receipt deleted')
    setDeleteOpen(false)
    router.refresh()
  }

  const displayDate = localDate ? format(localDate, 'MMM d, yyyy') : 'unknown date'

  return (
    <>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => { resetForm(); setEditOpen(true) }}
          title="Edit receipt"
        >
          <Pencil size={14} style={{ color: 'oklch(0.45 0.082 156)' }} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setDeleteOpen(true)}
          title="Delete receipt"
        >
          <Trash2 size={14} className="text-destructive" />
        </Button>
      </div>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'var(--font-playfair)' }}>Edit Receipt</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleEdit} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Date Received</Label>
              <Input
                type="date"
                value={receivedDate}
                onChange={(e) => setReceivedDate(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label>Branch</Label>
              <Select value={branchId} onValueChange={(v) => setBranchId(v ?? '')}>
                <SelectTrigger>
                  <SelectValue>
                    {branches.find((b) => b.id === branchId)?.name ?? 'Select branch'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Optional notes..."
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)} disabled={loading}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={loading}
                className="gap-2"
                style={{ backgroundColor: 'oklch(0.38 0.082 156)' }}
              >
                {loading ? (
                  <><Loader2 size={15} className="animate-spin" /> Saving...</>
                ) : (
                  <><Save size={15} /> Save Changes</>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete Receipt"
        description={`Delete this receipt from ${displayDate}? This cannot be undone.`}
        onConfirm={handleDelete}
      />
    </>
  )
}
