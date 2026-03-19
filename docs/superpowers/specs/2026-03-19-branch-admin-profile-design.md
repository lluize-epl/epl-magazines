# Branch-Aware Admin, User Profile, and UX Improvements

**Date:** 2026-03-19
**Status:** Approved

---

## 1. Branch-Aware Admin Magazines Page

### Problem

The admin magazines page (`/admin/magazines`) shows a global list of magazines with no branch context. Since magazines are managed per-branch via `BranchMagazine` subscriptions, the admin page should act as a branch inventory view.

### Design

The server component reads the active branch cookie and queries `BranchMagazine` records for that branch, joining the related `Magazine` data, receipt count (current calendar year, Jan–Dec), and most recent receipt date.

**Table columns:**

| Name | Cadence | Quantity | Total Issues | Last Received | Next Expected | Status | Notes | Actions |

- **Quantity** — from `BranchMagazine.quantity`
- **Total Issues** — count of `IssueReceipt` for this magazine+branch in the current calendar year (Jan 1 – Dec 31), resets each January
- **Last Received** — most recent `IssueReceipt.receivedDate` for this magazine+branch
- **Next Expected** — computed from last received date + cadence via `computeNextExpectedDate()`
- **Status** — toggle slider (`Switch` component) controlling `BranchMagazine.active`

**Pagination:** Server-side, 10 rows per page, Previous/Next controls at bottom.

### Create Flow

1. Admin fills form: name, cadence, notes, quantity (default 1)
2. `POST /api/magazines` creates the global magazine record, returns the magazine ID
3. `POST /api/branches/[branchId]/magazines` creates the `BranchMagazine` subscription with the specified quantity
4. If step 3 fails, an error is shown. The global magazine exists but is not subscribed — the admin can retry. No orphan data or integrity issues.

### Edit Flow

Single dialog with two sections:

- **Magazine details** (global): name, cadence, notes → `PUT /api/magazines/[id]`
- **Branch subscription** (branch-specific): quantity, last received date → `PUT /api/branches/[branchId]/magazines/[magazineId]`

Changing last received date inserts a new `IssueReceipt` via `POST /api/magazines/[id]/receipts` with the chosen date and a system note (e.g., "Manually adjusted by admin"). The system always uses the most recently created receipt as the anchor for next expected date computation.

### Delete Flow

The delete confirmation offers two options:

- **"Remove from this branch"** — `DELETE /api/branches/[branchId]/magazines/[magazineId]` (removes the `BranchMagazine` subscription only)
- **"Delete magazine entirely"** — `DELETE /api/magazines/[id]` (removes the global magazine and cascades to all branch subscriptions and receipts)

---

## 2. Toggle Slider Component

### Problem

The active/inactive toggles on both admin pages (magazines and users) use `ToggleLeft`/`ToggleRight` Lucide icons styled as buttons. They look like sliders but have no slider animation — they act as plain buttons.

### Design

Add the shadcn/ui `Switch` component (`npx shadcn@latest add switch`). Replace the icon buttons in both `AdminMagazinesClient` and `AdminUsersClient` with `Switch`. The component provides a proper slider with smooth animation. It fires the toggle API call on click — no intermediate state, optimistic update that reverts on error.

---

## 3. Button Disable Pattern

### Problem

Rapid clicks on action buttons (toggle, edit, delete, create) can fire multiple API calls.

### Design

All action buttons across both admin pages (magazines and users) set `disabled={true}` while their API call is in flight. Re-enabled on success or error response. This includes: toggle switches, edit/save buttons, delete/confirm buttons, and create/submit buttons.

---

## 4. Branch Selection at Login

### Problem

Users log in without selecting a branch, defaulting to Main. Staff may not realize which branch they're operating in before making changes.

### Design

Add a required branch dropdown to the login page, above the login button. No default is selected — the user must explicitly pick a branch. On successful login, the selected branch is set as the `epl-active-branch` cookie (same mechanism as `BranchSelector`).

The `BranchSelector` in the sidebar remains available for switching branches after login.

---

## 5. User Profile Page

### Problem

No user profile page exists. The sidebar user badge (name + role) is not clickable. Users cannot change their own name or password.

### Design

**Sidebar change:** The user badge/name/role section becomes a `<Link href="/profile">` — same visual appearance, clickable with hover effect.

**Route:** `app/(dashboard)/profile/page.tsx`

**Page contents:**

- User info display: name, email (read-only), role (read-only)
- **Change name** form: text input + save button
- **Change password** form: current password, new password, confirm new password + save button

**API route:** `app/api/users/profile/route.ts`

- `PUT` — accepts `{ name }` and/or `{ currentPassword, newPassword }`
- Validates current password with bcrypt before allowing password change
- Updates the user record by ID — since `IssueReceipt` links by `receivedById` (foreign key), changing the user's name does not break any logs or receipts

**Audit logging:** Log name changes and password changes (without logging actual password values).

---

## 6. Audit Log Display

### Problem

The audit log viewer shows raw cuid strings for user IDs, magazine IDs, and branch IDs. These are not human-readable.

### Design

The audit log page resolves IDs to names when rendering:

- User IDs → user names
- Magazine IDs → magazine names
- Branch IDs → branch names

The stored log entries (`logs/audit.log`) continue to use IDs for data integrity. Resolution happens at display time only.

---

## Technical Notes

- **No schema changes required.** All features use existing Prisma models (`Magazine`, `BranchMagazine`, `IssueReceipt`, `User`, `Branch`).
- **New shadcn component:** `Switch` (via `npx shadcn@latest add switch`)
- **New routes:** `app/(dashboard)/profile/page.tsx`, `app/api/users/profile/route.ts`
- **Modified routes:** `app/(dashboard)/admin/magazines/page.tsx`, `app/(auth)/login/page.tsx`
- **Modified components:** `AdminMagazinesClient`, `AdminUsersClient`, `Sidebar`, `CreateMagazineDialog`, `EditMagazineDialog`, login form
