# Roadmap

What is built, what is being worked on, and where this project is heading.

## Status

In production at one public library, formally adopted by administration in
May 2026. Other libraries are welcome to fork, deploy, and contribute.

## Done

| Capability | Notes |
|---|---|
| Cadence-driven scheduling | Six cadences from weekly to yearly; computed from last receipt |
| Multi-branch support | Branch cookie, role-based access, branch-scoped dashboard |
| Multi-vendor subscription periods | Parallel periods, auto-deactivation on `endDate` |
| Inter-branch transfers | `PENDING → COMPLETED / CANCELLED`, atomic receive at destination |
| Reports | Five report types with charts and `.xlsx` export |
| Audit log | JSON-line file, viewable in admin UI, retained on Docker volume |
| Soft-delete | Magazines and users use `active: false`; history is preserved |
| Custom session auth | bcrypt + `jose` JWT cookies, 7-day expiry |
| Zod-validated APIs | All input validation centralized in `lib/validations.ts` |
| Docker Compose deployment | Multi-stage build, healthcheck, separate `migrate` tooling service |
| Safe-migration script | `npm run migrate:safe` — backup → test on copy → apply |

## Active

### Real production seed for the next subscription cycle

The system was demoed on a small demo seed. With administrative approval and
new vendor data in hand, the next step is replacing demo data with the
library's real subscription data for the upcoming cycle. The seed pattern is
already established by `prisma/seed_demo.ts`.

### Branch creation admin UI

Branches are read-only in the application today — schema supports them, but
they are created only via seed scripts. Administrative feedback requested a
way to add branches from the UI, motivated by the possibility of adding
mobile/bookmobile branches in the future.

Scope:

- `app/(dashboard)/admin/branches/page.tsx`
- `POST /api/branches`, `PUT /api/branches/[id]`
- Soft-delete only (`active: false`); receipts and transfers reference
  `branchId`, so hard-delete would orphan history
- Mirrors the existing admin/magazines pattern (Zod, audit log, no hard
  delete)

### Staff onboarding rollout

After admin approval, staff training is being rolled out branch-by-branch,
with two staffers per branch trained in the first wave. Materials draw on
existing [`docs/onboarding.md`](onboarding.md) plus a printable
quick-reference for the receive flow.

## Future direction

### ILS integration (deferred until needed)

Long-term, when a magazine is marked received, the system could call the
library's ILS API to make the issue immediately available for patron
checkout — closing the gap between physical receipt and shelf availability.

Candidate platforms (which one applies depends on the library):

- **Polaris ILS**
- **Stella** (commonly paired with Polaris)
- **LMXAC** — a regional library consortium platform
- **Library IQ** — analytics; likely a read consumer rather than a write
  target

Natural integration points in the current codebase:

- `app/api/magazines/[id]/receipts/route.ts` — POST receipt handler
- `app/api/transfers/[id]/complete/route.ts` — transfer completion handler

Both already wrap their writes in transactions. An ILS hook would fire after
the local write succeeds; failures would be logged and retried out-of-band so
that the local operation is never blocked by an external API outage.

Design notes for whoever picks this up:

- Make integration optional and per-branch — different branches may use
  different ILS systems
- Use an environment flag plus a per-branch config table for credentials
- Add an async retry queue — ILS APIs do go down
- Audit-log every ILS call (success or failure) so problems are debuggable

### Other plausible directions

| Direction | Why it might matter |
|---|---|
| Newspapers, audiobooks, donated periodicals | Same data shape; minor schema additions |
| Multi-language UI | Library workforces are multilingual in many regions |
| Public reporting widget | Embeddable "what is the latest issue of X" for the library website |
| PostgreSQL backend option | For consortium-scale deployments with many concurrent users |
| Email/Slack notifications | Surface "still missing after N days" alerts to acquisitions staff |

## Out of scope

- Patron-facing checkout or holds (that is the ILS's job)
- SaaS / multi-tenant hosting (each library runs its own instance)
- Mobile native apps — the web UI is responsive and works on tablets at the
  desk
- Replacing the library's ILS

## Contributing

If you are a librarian or library IT person evaluating this for adoption,
[`docs/onboarding.md`](onboarding.md) and [`docs/deployment.md`](deployment.md)
are the right starting points. Issues and pull requests are welcome on
GitHub.
