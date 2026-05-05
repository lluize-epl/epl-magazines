# Project Context

A self-hosted magazine receiving and tracking system for public libraries.

## What this is

A web application that lets library staff log when periodical magazines arrive,
see what is expected each week, and flag overdue issues. It is built to replace
the paper-and-spreadsheet workflow that most small and mid-sized libraries still
use to track magazine subscriptions.

The system was built for one public library and is now open-sourced so other
libraries can adopt, fork, or contribute to it.

## Who it is for

- **Library staff** — log receipts, see what is coming, flag missing issues
- **Library admins** — manage subscriptions, users, branches, pull reports for
  vendor renewals
- **Library IT** — deploy and maintain a single Docker stack on internal
  infrastructure

There is no patron-facing surface. The application is intended to live on the
library's internal network, behind whatever proxy or auth layer the library
already uses internally.

## Problem it solves

Most libraries track magazine receipts on paper logs or shared spreadsheets:

- No shared visibility across branches
- No audit trail when issues are claimed missing
- Manual cadence math (when *was* the last issue of a quarterly?)
- Inter-branch transfers happen informally
- Vendor invoices land with no easy way to verify what was actually delivered

This system replaces that with one shared web UI, automatic cadence calculation,
multi-vendor subscription period tracking, transfer records, and a JSON-line
audit log.

## Architecture at a glance

| Layer | Technology |
|---|---|
| Framework | Next.js (App Router), TypeScript (strict) |
| Database | SQLite via Prisma v7 (driver-adapter pattern, WAL mode) |
| Auth | Session cookies (JWT via `jose`) + bcrypt |
| Validation | Zod on every API route |
| UI | Tailwind CSS + shadcn/ui |
| Logging | Winston → `logs/audit.log` (JSON lines) |
| Deployment | Docker Compose, self-hosted, internal network only |

For implementation details, see:

- [`CLAUDE.md`](../CLAUDE.md) — Authoritative rules, conventions, and gotchas
- [`AGENTS.md`](../AGENTS.md) — Cross-tool agent conventions (Claude Code,
  Gemini CLI, Codex, Cursor, Aider all read this)
- [`docs/business-logic.md`](business-logic.md) — Business rules in depth
- [`docs/database.md`](database.md) — Schema reference
- [`docs/api.md`](api.md) — API surface
- [`docs/deployment.md`](deployment.md) — Deployment guide
- [`docs/onboarding.md`](onboarding.md) — New-staff orientation

## Key concepts

### Cadence-driven scheduling

Each magazine has a **cadence** (`WEEKLY`, `BI_WEEKLY`, `MONTHLY`, `BI_MONTHLY`,
`SEASONAL`, `YEARLY`). The system never stores a "next expected date" — it
computes it from the last received date. A magazine with no receipts yet shows
status "never received."

### Multi-vendor subscription periods

A library typically has more than one magazine vendor, each running on its own
cycle (e.g., one vendor on a fiscal-year cycle, another on a calendar-year
cycle). The system tracks parallel subscription **periods** — every magazine
belongs to exactly one active period at a time. Periods auto-deactivate when
their `endDate` passes.

This matters because:

- Progress bars are computed per period (issues received within the period vs.
  `issuesPerYear`)
- Vendor renewal decisions need per-vendor fulfillment data
- Periods can overlap mid-year without confusing the dashboard

### Multi-branch with role-based access

The system supports multiple **branches** (locations). Staff log in, pick their
active branch (cookie-persisted), and see only that branch's expected and
overdue list. Admins see all branches.

Roles are intentionally simple: `STAFF` (log receipts, view history) and
`ADMIN` (everything else).

### Transfers between branches

When a magazine is sent from one branch to another, staff initiate a
`Transfer` in `PENDING` status. When the destination branch receives it,
completing the transfer atomically creates a receipt at the destination
*and* marks the transfer `COMPLETED`. The magazine detail page shows a
context-aware "Receive Transfer" button when a pending transfer matches the
active branch — preventing staff from creating duplicate manual receipts.

### Audit log

Every meaningful action — login, magazine create/update/delete, receipt,
transfer state change — is written as a JSON line to `logs/audit.log`.
Admins view it through a UI page. Ops back it up alongside the SQLite file.

## Deployment model

- **Single Docker Compose stack** (one `app` service, plus an opt-in
  `migrate` tooling service for seeds and migrations)
- **SQLite file mounted as a volume** — no separate database server
- **Internal network only** — not internet-facing; reverse-proxy behind the
  library's existing internal infrastructure if desired
- **Concurrent users**: tested with a few staff at once; SQLite WAL mode
  handles this fine. For consortium-scale deployments, the only architectural
  change needed would be swapping to PostgreSQL.

For a fresh library installing this, the path is roughly:

1. Deploy the Docker Compose stack on an internal host
2. Run the seed script with the library's branch and vendor data
3. Create staff and admin user accounts
4. Done — staff can begin receiving the next day

See [`docs/deployment.md`](deployment.md) for the detailed procedure.

## How this differs from off-the-shelf alternatives

Most library ILS systems (Polaris, Sierra, Koha) include serial/periodical
modules, but they tend to be:

- Heavyweight to configure for small libraries
- Tied to expensive ILS contracts
- Hard to share data across consortium boundaries

This tool is intentionally **narrow** — only the receiving workflow — but
covers that flow cleanly, with no licensing cost and minimal IT overhead.
It is meant to coexist with an ILS, not replace one. See
[`ROADMAP.md`](ROADMAP.md) for planned ILS *integration* (catalog
auto-publishing on receipt).

## For agents working on this repo

If you are an LLM agent (Claude Code, Gemini CLI, Codex, Cursor, Aider, etc.)
opening this repo for the first time, read in this order:

1. [`CLAUDE.md`](../CLAUDE.md) — Hard rules, conventions, gotchas
2. [`AGENTS.md`](../AGENTS.md) — Cross-tool conventions
3. This file — Project orientation and intent
4. [`ROADMAP.md`](ROADMAP.md) — Active work and future direction
5. The topical docs in this folder as the task requires

## What is not in scope

- Patron-facing features (catalog, holds, checkouts)
- Vendor portal integration (automatic invoice pulling)
- Multi-tenant SaaS — each library runs its own instance
- Replacing the library's ILS
