'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { Loader2, Plus, Pencil, Search } from 'lucide-react'
import type { MagazineSubscriptionWithDetails, CadenceType } from '@/types'
import { CADENCE_LABELS } from '@/lib/cadence'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import DeleteConfirmDialog from './DeleteConfirmDialog'

/** Magazine option for the add-subscription dropdown */
interface MagazineOption {
  id: string
  name: string
}

export interface SubscriptionManagementProps {
  /** Subscription period ID */
  periodId: string
  /** Subscriptions for this period (current page) */
  subscriptions: MagazineSubscriptionWithDetails[]
  /** All active magazines not yet subscribed in this period (for the add dialog) */
  availableMagazines: MagazineOption[]
  /** Current search term */
  search: string
  /** Map of magazineId → branch codes (e.g., ["MAIN", "NORTH"]) */
  branchesPerMagazine: Record<string, string[]>
}

/** Client component for managing magazine subscriptions within a period. */
export default function SubscriptionManagement({
  periodId,
  subscriptions,
  availableMagazines,
  search,
  branchesPerMagazine,
}: SubscriptionManagementProps) {
  const router = useRouter()

  // Add subscription dialog
  const [addOpen, setAddOpen] = useState(false)
  const [addMagazineId, setAddMagazineId] = useState('')
  const [addIssuesPerYear, setAddIssuesPerYear] = useState('12')
  const [addLoading, setAddLoading] = useState(false)

  // Edit issues per year dialog
  const [editTarget, setEditTarget] = useState<MagazineSubscriptionWithDetails | null>(null)
  const [editIssues, setEditIssues] = useState('')
  const [editLoading, setEditLoading] = useState(false)

  // Deactivation confirm
  const [deactivateTarget, setDeactivateTarget] = useState<MagazineSubscriptionWithDetails | null>(null)

  // Toggle loading state
  const [togglingId, setTogglingId] = useState<string | null>(null)

  // Magazine search filter in the add dialog
  const [magSearch, setMagSearch] = useState('')

  function resetAdd() { setAddMagazineId(''); setAddIssuesPerYear('12'); setMagSearch('') }

  async function handleAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setAddLoading(true)
    try {
      const res = await fetch(`/api/subscription-periods/${periodId}/subscriptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ magazineId: addMagazineId, issuesPerYear: parseInt(addIssuesPerYear, 10) }),
      })
      const data = (await res.json()) as { error?: string; magazine?: { name: string } }
      if (!res.ok) { toast.error(data.error || 'Failed to add subscription'); return }
      toast.success(`${data.magazine?.name ?? 'Magazine'} added`)
      setAddOpen(false)
      resetAdd()
      router.refresh()
    } catch {
      toast.error('Something went wrong.')
    } finally {
      setAddLoading(false)
    }
  }

  async function handleEditSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!editTarget) return
    setEditLoading(true)
    try {
      const res = await fetch(`/api/subscription-periods/${periodId}/subscriptions/${editTarget.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issuesPerYear: parseInt(editIssues, 10) }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) { toast.error(data.error || 'Failed to update'); return }
      toast.success('Issues per year updated')
      setEditTarget(null)
      router.refresh()
    } catch {
      toast.error('Something went wrong.')
    } finally {
      setEditLoading(false)
    }
  }

  async function toggleActive(sub: MagazineSubscriptionWithDetails) {
    if (sub.active) {
      setDeactivateTarget(sub)
      return
    }
    await performToggle(sub)
  }

  async function performToggle(sub: MagazineSubscriptionWithDetails) {
    setTogglingId(sub.id)
    try {
      const res = await fetch(`/api/subscription-periods/${periodId}/subscriptions/${sub.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !sub.active }),
      })
      if (res.ok) {
        toast.success(`${sub.magazine.name} ${sub.active ? 'deactivated' : 'activated'}`)
        setDeactivateTarget(null)
        router.refresh()
      } else {
        toast.error('Failed to update subscription')
      }
    } finally {
      setTogglingId(null)
    }
  }

  const filteredAvailable = magSearch
    ? availableMagazines.filter((m) => m.name.toLowerCase().includes(magSearch.toLowerCase()))
    : availableMagazines

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button
          onClick={() => setAddOpen(true)}
          className="gap-2"
          style={{ backgroundColor: 'oklch(0.38 0.082 156)' }}
        >
          <Plus size={16} /> Add Subscription
        </Button>
      </div>

      {subscriptions.length === 0 ? (
        <div className="text-center py-16" style={{ color: 'oklch(0.60 0.025 72)' }}>
          <Search size={36} className="mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium" style={{ fontFamily: 'var(--font-playfair)' }}>
            {search ? 'No subscriptions match your search' : 'No subscriptions in this period'}
          </p>
        </div>
      ) : (
        <div
          className="rounded-lg border overflow-hidden"
          style={{ borderColor: 'oklch(0.876 0.016 88)', backgroundColor: 'oklch(0.978 0.009 88)' }}
        >
          <Table>
            <TableHeader>
              <TableRow style={{ borderColor: 'oklch(0.876 0.016 88)', backgroundColor: 'oklch(0.963 0.012 91)' }}>
                {['Magazine', 'Language', 'Cadence', 'At Branches', 'Issues/Year', 'Actions'].map((h) => (
                  <TableHead
                    key={h}
                    className={`font-semibold ${h === 'Actions' ? 'text-right' : ''}`}
                    style={{ color: 'oklch(0.30 0.028 62)' }}
                  >
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {subscriptions.map((sub) => (
                <TableRow
                  key={sub.id}
                  className="hover:bg-black/[0.02] transition-colors"
                  style={{ borderColor: 'oklch(0.900 0.012 88)' }}
                >
                  <TableCell style={{ opacity: sub.active ? 1 : 0.55 }}>
                    <Link
                      href={`/magazines/${sub.magazine.id}`}
                      className="font-medium hover:underline cursor-pointer"
                      style={{ fontFamily: 'var(--font-playfair)', color: 'oklch(0.15 0.028 62)' }}
                    >
                      {sub.magazine.name}
                    </Link>
                  </TableCell>
                  <TableCell style={{ opacity: sub.active ? 1 : 0.55 }}>
                    <span className="text-sm" style={{ color: 'oklch(0.40 0.028 62)' }}>
                      {sub.magazine.language}
                    </span>
                  </TableCell>
                  <TableCell style={{ opacity: sub.active ? 1 : 0.55 }}>
                    <span className="text-sm" style={{ color: 'oklch(0.40 0.028 62)' }}>
                      {CADENCE_LABELS[sub.magazine.cadence as CadenceType] ?? sub.magazine.cadence}
                    </span>
                  </TableCell>
                  <TableCell style={{ opacity: sub.active ? 1 : 0.55 }}>
                    <span className="text-xs font-mono" style={{ color: 'oklch(0.45 0.035 72)' }}>
                      {(branchesPerMagazine[sub.magazineId] ?? [])
                        .map((c) => c === 'MAIN' ? 'ML' : c === 'NORTH' ? 'NE' : c)
                        .join(' | ') || '—'}
                    </span>
                  </TableCell>
                  <TableCell style={{ opacity: sub.active ? 1 : 0.55 }}>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm" style={{ color: 'oklch(0.40 0.028 62)' }}>
                        {sub.issuesPerYear}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0"
                        onClick={() => { setEditTarget(sub); setEditIssues(String(sub.issuesPerYear)) }}
                      >
                        <Pencil size={12} style={{ color: 'oklch(0.50 0.035 72)' }} />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end">
                      <Switch
                        checked={sub.active}
                        onCheckedChange={() => toggleActive(sub)}
                        disabled={togglingId === sub.id}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add Subscription Dialog */}
      <Dialog open={addOpen} onOpenChange={(v) => { if (!v) resetAdd(); setAddOpen(v) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'var(--font-playfair)' }}>Add Subscription</DialogTitle>
            <DialogDescription>Add a magazine to this subscription period.</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAdd} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Magazine</Label>
              {availableMagazines.length > 10 && (
                <div className="relative mb-2">
                  <Search size={14} className="absolute left-2.5 top-2.5" style={{ color: 'oklch(0.50 0.035 72)' }} />
                  <Input
                    value={magSearch}
                    onChange={(e) => setMagSearch(e.target.value)}
                    placeholder="Filter magazines..."
                    className="pl-8 h-8 text-sm"
                  />
                </div>
              )}
              <Select value={addMagazineId} onValueChange={(v) => setAddMagazineId(v ?? '')} required>
                <SelectTrigger>
                  <SelectValue>{addMagazineId ? availableMagazines.find((m) => m.id === addMagazineId)?.name ?? 'Select magazine' : 'Select magazine'}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {filteredAvailable.length === 0 ? (
                    <div className="px-3 py-2 text-sm" style={{ color: 'oklch(0.50 0.035 72)' }}>
                      {availableMagazines.length === 0 ? 'All magazines are already subscribed' : 'No matches'}
                    </div>
                  ) : (
                    filteredAvailable.map((mag) => (
                      <SelectItem key={mag.id} value={mag.id}>{mag.name}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Issues per Year</Label>
              <Input
                type="number"
                min={1}
                max={365}
                value={addIssuesPerYear}
                onChange={(e) => setAddIssuesPerYear(e.target.value)}
                required
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)} disabled={addLoading}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={addLoading || !addMagazineId}
                className="gap-2"
                style={{ backgroundColor: 'oklch(0.38 0.082 156)' }}
              >
                {addLoading ? <><Loader2 size={15} className="animate-spin" /> Adding...</> : <><Plus size={15} /> Add</>}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Issues Per Year Dialog */}
      {editTarget && (
        <Dialog open={!!editTarget} onOpenChange={(v) => { if (!v) setEditTarget(null) }}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle style={{ fontFamily: 'var(--font-playfair)' }}>Edit Issues Per Year</DialogTitle>
              <DialogDescription>{editTarget.magazine.name}</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleEditSave} className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label>Issues per Year</Label>
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={editIssues}
                  onChange={(e) => setEditIssues(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditTarget(null)} disabled={editLoading}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={editLoading}
                  className="gap-2"
                  style={{ backgroundColor: 'oklch(0.38 0.082 156)' }}
                >
                  {editLoading ? <><Loader2 size={15} className="animate-spin" /> Saving...</> : 'Save'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Deactivation Confirm */}
      {deactivateTarget && (
        <DeleteConfirmDialog
          open={!!deactivateTarget}
          onOpenChange={(v) => { if (!v) setDeactivateTarget(null) }}
          title={`Deactivate "${deactivateTarget.magazine.name}"?`}
          description="This subscription will be marked inactive for this period. You can reactivate it later."
          onConfirm={() => performToggle(deactivateTarget)}
          confirmLabel="Deactivate"
          loadingLabel="Deactivating..."
        />
      )}
    </>
  )
}
