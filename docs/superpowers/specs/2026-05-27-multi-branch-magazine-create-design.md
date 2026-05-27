# Multi-Branch Magazine Create + Subscription Disambiguation

**Date:** 2026-05-27
**Status:** Approved design, pending implementation
**Driver:** Pre-training fixes — staff onboarding blocked by single-branch create flow.

## Problem

Creating a magazine in the admin UI (`CreateMagazineDialog`) does two calls:
1. `POST /api/magazines` → creates one global `Magazine` row.
2. `POST /api/branches/[id]/magazines` → links it to the **cookie's active branch only**.

There is no UI to pick branches, and — unlike `seed.ts`, which dedupes by name — the
create path never checks for an existing magazine. To put "Cosmopolitan" in 3 branches,
an admin repeats the flow 3 times, producing **3 distinct `Magazine` rows with the same name**
(`Magazine.name` has no unique constraint).

Downstream, the subscription picker (`/admin/subscriptions/[id]`) lists distinct `Magazine`
rows, so those 3 rows appear as 3 separate "Cosmopolitan" options, each linked to only 1
branch — instead of one canonical "Cosmopolitan" whose `At Branches` column aggregates all
branches (the correct behavior the seed data produces).

Both reported flaws share this single root cause. The data model is already correct
(`Magazine 1—N BranchMagazine`); only the **create UI** violates it.

## Goals

1. Add a magazine to **multiple branches at once**, with a per-branch quantity.
2. Keep **one canonical `Magazine`** per (name, language) so the subscription picker shows it once.
3. Allow same name across **different languages** (e.g. Cosmopolitan English + Spanish),
   disambiguated in the picker by the existing "Title - Language" convention.

## Non-Goals

- Editing a magazine's branch membership **after** creation (`EditMagazineDialog` stays
  period-only). Selecting all branches at create time covers the training need.
- Cleanup of existing duplicate rows — dev DB will be re-seeded from `seed-2026-training.ts`,
  which dedupes correctly. No migration or cleanup script.
- No `@@unique` DB constraint on `Magazine` — dedup is enforced at the API layer so that
  same-name/different-language remains valid.

## Design

### 1. `CreateMagazineDialog.tsx` — multi-branch picker

- Replace the single `quantity` field with a **branch list**.
- New prop `branches: { id: string; name: string; code: string }[]` (all active branches).
- Each branch renders a checkbox; when checked, reveal a small number input (qty, default 1,
  range 1–100). State shape: `Record<branchId, quantity>` for checked branches.
- Client validation: at least one branch must be checked (disable submit otherwise).
- Submit a **single** request to `POST /api/magazines` with body:
  ```json
  { "name", "cadence", "language", "notes", "branches": [{ "branchId", "quantity" }] }
  ```
- Drops the second `POST /api/branches/[id]/magazines` call entirely.
- On `409` duplicate, surface the API error message via toast.

### 2. `POST /api/magazines` + `lib/validations.ts` — atomic create + dedup

- Extend `createMagazineSchema` with
  `branches: z.array(z.object({ branchId: z.string().min(1), quantity: z.number().int().min(1).max(100) })).min(1)`.
  `CreateMagazineDialog` is the only caller of this endpoint, so ≥1 branch is required (no
  hedging for hypothetical callers).
- **Dedup guard:** before create, `findFirst` an **active** magazine where trimmed `name`
  equals the input AND `language` equals the input. If found → return `409`
  `{ error: "<Name> (<Language>) already exists" }`. Scope = active only (soft-deleted
  same-name titles may be freshly recreated).
- Create `Magazine` + each `BranchMagazine` (via `upsert` on `[branchId, magazineId]`) inside
  **one `withRetry` transaction**.
- Audit-log magazine creation including branch **codes** (human-readable), never cuids.

### 3. Admin magazines `page.tsx`

- Call `getActiveBranches()` (already in `lib/branch.ts`) and pass `branches` down through
  `AdminMagazinesClient` → `CreateMagazineDialog`. Keep existing `branchId` if still used
  elsewhere in the client; the dialog no longer needs it.

### 4. Subscription picker disambiguation

- Add `formatMagazineLabel(name: string, language: string): string` to `lib/utils.ts`:
  returns `name` when `language === 'English'`, else `` `${name} - ${language}` ``.
- `subscriptions/[id]/page.tsx`: add `language` to the `availableMagazines` select.
- `SubscriptionManagement.tsx`: render picker options and the table magazine-name cell via
  `formatMagazineLabel`. After the dedup fix there is one row per (name, language); the
  `At Branches` column already aggregates branches by `magazineId` correctly.

## Edge Cases

- No branch selected → blocked client-side (submit disabled) and rejected server-side by the
  `.min(1)` Zod rule.
- Duplicate (name+language) active magazine → `409`, friendly toast, form stays open.
- Quantity bounds 1–100, matching the existing `branchMagazineSchema`.

## Verification

- `tsc --noEmit` clean.
- Manual (dev server): re-seed → create "Cosmopolitan" for ML+NE+CB in one submit → exactly
  one `Magazine` row, three `BranchMagazine` rows; subscription picker shows one "Cosmopolitan"
  with `At Branches = ML | NE | CB`. Create "Cosmopolitan" Spanish → second picker entry
  "Cosmopolitan - Spanish". Re-create "Cosmopolitan" English → blocked with 409 toast.
