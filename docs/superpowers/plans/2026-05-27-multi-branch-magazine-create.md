# Multi-Branch Magazine Create + Subscription Disambiguation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin add one magazine to multiple branches at once, keeping a single canonical `Magazine` per (name, language) so the vendor-subscription picker shows it once across all its branches.

**Architecture:** `CreateMagazineDialog` collects a per-branch quantity map and POSTs a single `branches[]` payload. `POST /api/magazines` dedupes by (name, language) and creates the `Magazine` + all `BranchMagazine` links in one `withRetry(db.$transaction(...))`. The subscription picker disambiguates same-name titles by language via a shared `formatMagazineLabel` helper.

**Tech Stack:** Next.js App Router, TypeScript (strict), Prisma v7 (`@prisma/adapter-better-sqlite3`), Zod, shadcn/Base-UI components, sonner toasts.

**Verification note:** This project has **no automated test harness** (no test script, no test dirs). Per the project's established workflow (`feedback_dev_server`), each task is verified with `npx tsc --noEmit` and the final task includes a manual dev-server checklist. This intentionally departs from unit-test TDD because the codebase has none.

---

### Task 1: `formatMagazineLabel` shared helper

**Files:**
- Modify: `lib/utils.ts`

- [ ] **Step 1: Add the helper** to `lib/utils.ts` (append after `toLocalDate`)

```ts
/**
 * Display label for a magazine, disambiguating same-name titles by language.
 * English titles show the bare name; non-English append " - <Language>".
 * @param name - Magazine name
 * @param language - Magazine language (e.g. "English", "Spanish")
 */
export function formatMagazineLabel(name: string, language: string): string {
  return language && language !== 'English' ? `${name} - ${language}` : name
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/utils.ts
git commit -m "add formatMagazineLabel helper"
```

---

### Task 2: Extend `createMagazineSchema` with required `branches`

**Files:**
- Modify: `lib/validations.ts:29-34`

- [ ] **Step 1: Replace the schema** at `lib/validations.ts:29-34`

`quantitySchema` (1–100 int) already exists at line 16; reuse it.

```ts
export const createMagazineSchema = z.object({
  name: z.string().min(1, 'Name is required').transform((s) => s.trim()),
  cadence: cadenceSchema,
  language: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  branches: z
    .array(z.object({ branchId: z.string().min(1), quantity: quantitySchema }))
    .min(1, 'Select at least one branch'),
})
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: **fails** in `app/api/magazines/route.ts` because `branches` is now destructured-but-unused / the create call doesn't use it yet. That's expected — Task 3 fixes it. (If tsc passes here, that's fine too; the route just ignores the new field until Task 3.)

- [ ] **Step 3: Commit** (commit together with Task 3 if tsc fails — see Task 3 Step 4)

---

### Task 3: Atomic create + (name, language) dedup in `POST /api/magazines`

**Files:**
- Modify: `app/api/magazines/route.ts:36-62` (the `try` block of `POST`)

- [ ] **Step 1: Replace the body** of the `POST` `try` block (lines 36–62) with:

```ts
  try {
    const body = await request.json()
    const parsed = createMagazineSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }
    const { name, cadence, language, notes, branches } = parsed.data

    /** Normalize language: "hindi" → "Hindi", "GUJARATI" → "Gujarati" */
    const normalizedLanguage = language?.trim()
      ? language.trim().charAt(0).toUpperCase() + language.trim().slice(1).toLowerCase()
      : 'English'

    // Dedup: block an exact (name + language) duplicate among ACTIVE magazines.
    // SQLite `equals` is case-sensitive, so compare case-insensitively in JS over the
    // (small) set of active magazines sharing this language.
    const sameLanguage = await db.magazine.findMany({
      where: { active: true, language: normalizedLanguage },
      select: { id: true, name: true },
    })
    if (sameLanguage.some((m) => m.name.toLowerCase() === name.toLowerCase())) {
      const label = normalizedLanguage !== 'English' ? `${name} - ${normalizedLanguage}` : name
      return Response.json({ error: `"${label}" already exists` }, { status: 409 })
    }

    const magazine = await withRetry(() => db.$transaction(async (tx) => {
      const mag = await tx.magazine.create({
        data: { name, cadence, language: normalizedLanguage, notes: notes?.trim() || null },
      })
      for (const b of branches) {
        await tx.branchMagazine.upsert({
          where: { branchId_magazineId: { branchId: b.branchId, magazineId: mag.id } },
          update: { quantity: b.quantity, active: true },
          create: { branchId: b.branchId, magazineId: mag.id, quantity: b.quantity },
        })
      }
      return mag
    }))

    // Audit with human-readable branch codes, never cuids.
    const branchCodes = await db.branch.findMany({
      where: { id: { in: branches.map((b) => b.branchId) } },
      select: { code: true },
    })
    auditLog(session.userId, 'MAGAZINE_CREATED', {
      name: magazine.name,
      language: magazine.language,
      branches: branchCodes.map((b) => b.code),
    })

    return Response.json(magazine, { status: 201 })
  } catch (err) {
    const e = err as { code?: string; message?: string }
    if (e?.code === 'SQLITE_BUSY' || e?.code === 'SQLITE_LOCKED' || (e?.message ?? '').includes('database is locked')) {
      return Response.json({ error: 'Database is busy, please try again' }, { status: 503 })
    }
    console.error('Create magazine error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
```

Note: `name` is already trimmed by the Zod `.transform`, so no extra `.trim()` is needed. The POST doc comment at lines 27–30 mentions the body shape — update it to include `branches` (`Body: { name, cadence, language?, notes?, branches:[{branchId,quantity}] }`).

- [ ] **Step 2: Update the POST TSDoc** at `app/api/magazines/route.ts:27-30` to mention `branches`.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (`db`, `withRetry`, `auditLog` are already imported at the top of the file.)

- [ ] **Step 4: Commit** (Tasks 2 + 3 together — they form one coherent server-side change)

```bash
git add lib/validations.ts app/api/magazines/route.ts
git commit -m "atomic multi-branch magazine create with name+language dedup"
```

---

### Task 4: Multi-branch UI in `CreateMagazineDialog` + prop wiring

This task changes the dialog, the client wrapper, and the page together so `tsc` stays green and the commit is coherent.

**Files:**
- Modify: `components/CreateMagazineDialog.tsx` (props + form body + submit)
- Modify: `components/AdminMagazinesClient.tsx:21-29,232` (pass `branches` through)
- Modify: `app/(dashboard)/admin/magazines/page.tsx` (pass `branches` to client)

- [ ] **Step 1: Rewrite `CreateMagazineDialog.tsx`.** Replace the whole file with:

```tsx
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
                    <label className="flex items-center gap-2 cursor-pointer text-sm">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => toggleBranch(b.id, v === true)}
                      />
                      <span>{b.name} <span className="text-muted-foreground">({b.code})</span></span>
                    </label>
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
```

- [ ] **Step 2: Confirm the Checkbox component exists.**

Run: `ls components/ui/checkbox.tsx`
Expected: file exists. If it does NOT, add it: `npx shadcn@latest add checkbox` (per CLAUDE.md convention). Then re-run.

- [ ] **Step 3: Update `AdminMagazinesClient.tsx`.**

Add `branches` to the props interface (after line 26) and the destructure (line 29), and pass it to the dialog (line 232). `branchId` stays — it's still used by `toggleActive`/`removeFromBranch`.

Props interface — add field:
```ts
  /** All active branches for the create dialog */
  branches: { id: string; name: string; code: string }[]
```
Destructure:
```ts
export default function AdminMagazinesClient({ magazines, branchId, branches, search, periods }: AdminMagazinesClientProps) {
```
Dialog usage (replace line 232):
```tsx
      <CreateMagazineDialog open={createOpen} onOpenChange={setCreateOpen} branches={branches} />
```

- [ ] **Step 4: Update `app/(dashboard)/admin/magazines/page.tsx`.**

`branches` is already loaded via `getActiveBranches()` (it includes `id`, `name`, `code`). Pass a trimmed list to the client. Replace the `<AdminMagazinesClient .../>` usage:

```tsx
      <AdminMagazinesClient
        magazines={enriched}
        branchId={branchId}
        branches={branches.map((b) => ({ id: b.id, name: b.name, code: b.code }))}
        search={search}
        periods={allPeriods}
      />
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add components/CreateMagazineDialog.tsx components/AdminMagazinesClient.tsx "app/(dashboard)/admin/magazines/page.tsx" components/ui/checkbox.tsx
git commit -m "multi-branch magazine create UI with per-branch quantity"
```
(Omit `components/ui/checkbox.tsx` from the add if it already existed and wasn't newly created.)

---

### Task 5: Disambiguate the subscription picker by language

The existing-subscriptions table already has a dedicated **Language** column (`SubscriptionManagement.tsx:219-223`), so its name cell does NOT need the language suffix. Only the **add-subscription picker** (no language column) needs disambiguation.

**Files:**
- Modify: `app/(dashboard)/admin/subscriptions/[id]/page.tsx:95-98` (add `language` to query)
- Modify: `components/SubscriptionManagement.tsx` (option type + label rendering + search filter)

- [ ] **Step 1: Add `language` to the magazine query** at `app/(dashboard)/admin/subscriptions/[id]/page.tsx:95-99`

```ts
  const allActiveMagazines = await db.magazine.findMany({
    where: { active: true },
    select: { id: true, name: true, language: true },
    orderBy: { name: 'asc' },
  })
```

- [ ] **Step 2: Extend `MagazineOption`** in `components/SubscriptionManagement.tsx:27-30`

```ts
/** Magazine option for the add-subscription dropdown */
interface MagazineOption {
  id: string
  name: string
  language: string
}
```

- [ ] **Step 3: Import the helper** — add to the imports near `CADENCE_LABELS` (line 9):

```ts
import { formatMagazineLabel } from '@/lib/utils'
```

- [ ] **Step 4: Use the label in the search filter** at `components/SubscriptionManagement.tsx:161-163`

```ts
  const filteredAvailable = magSearch
    ? availableMagazines.filter((m) =>
        formatMagazineLabel(m.name, m.language).toLowerCase().includes(magSearch.toLowerCase()))
    : availableMagazines
```

- [ ] **Step 5: Use the label in the SelectValue** at line 291

```tsx
                  <SelectValue>{addMagazineId ? (() => { const m = availableMagazines.find((m) => m.id === addMagazineId); return m ? formatMagazineLabel(m.name, m.language) : 'Select magazine' })() : 'Select magazine'}</SelectValue>
```

- [ ] **Step 6: Use the label in the SelectItem** at line 300

```tsx
                    filteredAvailable.map((mag) => (
                      <SelectItem key={mag.id} value={mag.id}>{formatMagazineLabel(mag.name, mag.language)}</SelectItem>
                    ))
```

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add "app/(dashboard)/admin/subscriptions/[id]/page.tsx" components/SubscriptionManagement.tsx
git commit -m "disambiguate subscription picker by language"
```

---

### Task 6: Manual verification on the dev server

**Files:** none (verification only)

- [ ] **Step 1: Re-seed dev** (clears prior duplicate test data)

Run: `npx tsx prisma/seed-2026-training.ts`
Expected: completes without error.

- [ ] **Step 2: Restart dev server** (clears stale compiled routes per CLAUDE.md)

Run: `rm -rf .next && npm run dev`
Expected: server starts on localhost:3000.

- [ ] **Step 3: Multi-branch create.** Log in as admin → `/admin/magazines` → Add Magazine. Enter a NEW name (e.g. "Test Title"), pick a cadence, check 2–3 branches with different quantities, submit.
Expected: success toast "added to N branches"; exactly **one** new `Magazine` row and one `BranchMagazine` per checked branch (verify in `npx prisma studio` if desired).

- [ ] **Step 4: Picker shows one entry spanning branches.** Go to `/admin/subscriptions/<a period>` → Add Subscription → open the magazine dropdown.
Expected: "Test Title" appears **once**; after adding it, the table row's **At Branches** column lists all the branches you checked in Step 3.

- [ ] **Step 5: Language disambiguation.** Create another magazine with the same name "Test Title" but language = Spanish (any branch).
Expected: allowed; the picker now shows "Test Title" and "Test Title - Spanish" as two distinct options.

- [ ] **Step 6: Dedup guard.** Try to create "Test Title" again with language = English.
Expected: blocked with a 409 toast: `"Test Title" already exists`; the dialog stays open.

- [ ] **Step 7: Empty-branch guard.** Open Add Magazine, fill name + cadence but check no branch.
Expected: the Add Magazine button is disabled and "Select at least one branch." hint shows.

---

## Self-Review Notes

- **Spec coverage:** Goal 1 (multi-branch) → Tasks 2–4. Goal 2 (one canonical magazine) → Task 3 dedup + atomic create. Goal 3 (same name/different language) → Task 3 (dedup keyed on name+language) + Tasks 1 & 5 (label). Non-goal (no DB unique constraint, no cleanup) → respected: dedup is app-level, re-seed handles data.
- **Type consistency:** `BranchOption`/`branches` prop shape (`{id,name,code}`) is consistent across page → `AdminMagazinesClient` → `CreateMagazineDialog`. `MagazineOption` gains `language` and the query selects it. `formatMagazineLabel(name, language)` signature is used identically in Tasks 4-context and 5.
- **Placeholder scan:** none — every code step is complete.
