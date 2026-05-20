# Production Seed 2026 — Design Spec

## Purpose

Fresh database seed for the 2026-27 EPL Magazine Tracker cycle. Parses two vendor invoices (EBSCO and WT COX) into two TypeScript seed files:

- **`prisma/seed-2026-training.ts`** — Omits 7 magazines for staff/branch-manager training exercises
- **`prisma/seed-2026-complete.ts`** — All magazines included, for quick DB rebuild if needed

No receipts are created. No WT COX period is created (branch manager will create it via UI as a training exercise).

## Source Documents

| Vendor | Invoice | Period | Titles |
|---|---|---|---|
| EBSCO | 8082352 (PO 25-01253, 04-01-2026) | 06/01/2026 – 05/31/2027 | 103 |
| WT COX | 3156039 (PO 25-01052, 11/10/2025) | 01/01/2026 – 12/31/2026 | 15 |

## What the Seed Creates

1. **Admin user**: `magadmin` / `magTech` (ADMIN role)
2. **4 branches**: Main Library (MAIN), North Edison (NORTH), Clara Barton (CB), Bookmobile (MOBILE)
3. **EBSCO magazines**: 103 titles with cadence, language, notes, issuesPerYear
4. **WT COX magazines**: 15 titles as bare `Magazine` records (no period, no subscription)
5. **Subscription period**: `Ebsco-26/27` (06/01/2026 – 05/31/2027, `active: false`)
6. **MagazineSubscription**: Links each EBSCO magazine to the period with issuesPerYear
7. **BranchMagazine**: Branch assignments for ALL magazines (EBSCO + WT COX)

## What the Seed Does NOT Create

- No `IssueReceipt` records
- No WT COX `SubscriptionPeriod` (created manually via UI for training)
- No staff users (admin creates them via UI)

## Training Omissions

### Training version (`seed-2026-training.ts`)

**5 EBSCO magazines omitted** (staff will add these via the admin UI):
1. Practical Homeschooling — 4 issues/yr, SEASONAL, ML+NE+CB
2. VegNews Magazine — 4 issues/yr, SEASONAL, ML+NE+CB
3. Runners World - US — 4 issues/yr, SEASONAL, ML+NE
4. Out — 6 issues/yr, BI_MONTHLY, ML+NE
5. Cosmopolitan — 4 issues/yr, SEASONAL, ML+NE+CB

**2 WT COX magazines omitted** (branch manager will add these via UI):
1. Saras Salil (Tamil Edition) — 12 issues/yr, MONTHLY, Tamil, ML+NE+CB
2. Saras Salil (Telugu Edition) — 12 issues/yr, MONTHLY, Telugu, ML+NE+CB

### Complete version (`seed-2026-complete.ts`)

All 103 EBSCO + 15 WT COX magazines included. No omissions.

## DB Reset Strategy

Delete in foreign-key order:

```
MagazineSubscription
IssueReceipt
Transfer
BranchMagazine
Magazine
SubscriptionPeriod
Branch
User
```

Then rebuild from scratch.

## Branch Distribution Rules

### EBSCO Sub 01 (Main invoice — covers ML, NE, CB)

The `Qty` field in the invoice represents the number of branches, not copies at one branch:

| Invoice Qty | Branch Assignment |
|---|---|
| 1 (or no qty shown) | ML(1) |
| 2 | ML(1), NE(1) |
| 3 | ML(1), NE(1), CB(1) |
| 4 | ML(1), NE(1), CB(1), MOBILE(1) |

### EBSCO Sub 02 + Sub 03 (Economist only)

Economist has separate subscriptions for NE and CB, adding to its Sub 01 entry.

### EBSCO Sub 04 (Bookmobile)

Separate order for ~24 titles at the Bookmobile. Qty in Sub 04 = copies at MOBILE.
These are additive — a title can appear in both Sub 01 and Sub 04.

Example: Babybug has Qty 3 in Sub 01 (ML, NE, CB) + Qty 2 in Sub 04 (MOBILE) → BranchMagazine records: ML(1), NE(1), CB(1), MOBILE(2).

### WT COX (same pattern)

| Invoice Qty | Branch Assignment |
|---|---|
| 3 | ML(1), NE(1), CB(1) |
| 4 | ML(1), NE(1), CB(1), MOBILE(1) |

## Data Deltas from Old Seed (Ebsco-25/26)

### 10 EBSCO titles dropped

Not in the 26/27 invoice — will not be created:

1. Ask
2. Bloomberg Businessweek
3. Bon Appetit
4. Consumer Reports on Health
5. Cook's Country
6. Elle Decor
7. Essence
8. First for Women
9. Muse
10. Superman

### 1 EBSCO title added

- Practical Homeschooling — 4 issues/yr, SEASONAL, ML+NE+CB (+ MOBILE)

### 3 WT COX titles added

- Saras Salil (Gujarati Edition) — 12 issues/yr, MONTHLY, Gujarati
- Saras Salil (Tamil Edition) — 12 issues/yr, MONTHLY, Tamil
- Saras Salil (Telugu Edition) — 12 issues/yr, MONTHLY, Telugu

### Ananda Vikatan vendor change

Moved from WT COX to EBSCO (listed as Standing Order on EBSCO invoice).

### Name changes (old → new)

| Old Seed Name | Invoice Name (canonical) |
|---|---|
| Atlantic Monthly | Atlantic |
| Make | Make: Technology on Your Time |
| Hockey News | Hockey News - Canada |
| Popular Mechanics | Popular Mechanics - English ed |
| Mens Health | Mens Health - PA |
| Scientific American | Scientific American - NY |
| Sports Illustrated Kids | Sports Illustrated for Kids |
| Readers Digest - Large Print | Readers Digest - Large Print for Easier Reading |
| Swati Saparivara Patrika (Telugu) | Swati Saparivara Patrika (IND) |

### Issues-per-year updates

| Title | Old | New |
|---|---|---|
| Babybug | 9 | 6 |
| Discover | 6 | 4 |
| Elle - American ed | 10 | 9 |
| Good Housekeeping | 6 | 6 |
| Harpers Bazaar | 10 | 9 |
| Inc | 5 | 4 |
| Ladybug | 9 | 6 |
| Mens Health - PA | 6 | 4 |
| New Jersey Monthly | 12 | 11 |
| Publishers Weekly | 46 | 48 |
| Scientific American - NY | 12 | 10 |
| Spider | 9 | 6 |
| Week Junior | 48 | 52 |
| Womens Health | 4 | 4 |

## EBSCO Magazine Data (103 titles)

Each entry: Name | Issues/Yr | Cadence | Language | Qty (Sub 01) | Bookmobile Qty (Sub 04) | Notes

### Qty 1 — Main Library only

| Name | Issues/Yr | Cadence | Notes |
|---|---|---|---|
| AARP Bulletin | 10 | MONTHLY | Membership Title |
| AARP The Magazine | 6 | BI_MONTHLY | Membership Title |
| AllRecipes Magazine | 5 | SEASONAL | |
| American Association of Retired Persons Membership | 6 | BI_MONTHLY | Membership Title |
| Consumer Reports Buying Guide | 1 | YEARLY | Membership Title |
| Elle - American ed | 9 | MONTHLY | |
| Food & Wine | 11 | MONTHLY | |
| Inc 500 | 1 | YEARLY | Membership Title |
| Library Journal | 12 | MONTHLY | |
| Magnolia Journal | 4 | SEASONAL | |
| Publishers Weekly | 48 | WEEKLY | |
| School Library Journal | 12 | MONTHLY | |
| Series Made Simple | 1 | YEARLY | Membership Title |

### Qty 2 — Main Library + North Edison

| Name | Issues/Yr | Cadence | Language | Notes |
|---|---|---|---|---|
| Ananda Vikatan - India | 52 | WEEKLY | Tamil | Standing Order |
| Architectural Digest | 11 | MONTHLY | | |
| Artists Magazine | 6 | BI_MONTHLY | | |
| Astronomy | 12 | MONTHLY | | |
| Car and Driver | 6 | BI_MONTHLY | | Membership Title |
| China Today - Chinese ed | 12 | MONTHLY | Chinese | Start 01/01/2026 |
| Country Living | 6 | BI_MONTHLY | | |
| Entrepreneur | 6 | BI_MONTHLY | | |
| Esquire | 6 | BI_MONTHLY | | |
| Fortune - Domestic Ed | 6 | BI_MONTHLY | | |
| Golf Digest | 11 | MONTHLY | | |
| Harpers Bazaar | 9 | MONTHLY | | |
| Harvard Health Letter | 12 | MONTHLY | | |
| Hockey News - Canada | 14 | MONTHLY | | |
| Out | 6 | BI_MONTHLY | | *Training omission* |
| Pastel Journal | 4 | SEASONAL | | |
| Poetry | 10 | MONTHLY | | |
| Poets & Writers Magazine | 6 | BI_MONTHLY | | |
| Psychology Today | 6 | BI_MONTHLY | | |
| Runners World - US | 4 | SEASONAL | | *Training omission* |
| Scientific American - NY | 10 | MONTHLY | | |
| Scout Life | 10 | MONTHLY | | |
| Threads | 4 | SEASONAL | | |
| Town & Country | 9 | MONTHLY | | |
| Travel & Leisure | 11 | MONTHLY | | |
| Vanity Fair - American ed | 12 | MONTHLY | | |
| Veranda | 6 | BI_MONTHLY | | |

### Qty 3 — Main Library + North Edison + Clara Barton

| Name | Issues/Yr | Cadence | Bookmobile Qty | Notes |
|---|---|---|---|---|
| Atlantic | 12 | MONTHLY | — | |
| Babybug | 6 | BI_MONTHLY | 2 | |
| Better Homes and Gardens | 10 | MONTHLY | 1 | |
| Chirp | 10 | MONTHLY | 2 | |
| Consumer Reports | 13 | MONTHLY | 1 | |
| Cooks Illustrated | 6 | BI_MONTHLY | — | |
| Cosmopolitan | 4 | SEASONAL | — | *Training omission* |
| Crossword Puzzles Only | 13 | MONTHLY | 1 | |
| Discover | 4 | SEASONAL | — | |
| Family Handyman | 7 | MONTHLY | — | |
| Family Tree Magazine | 6 | BI_MONTHLY | — | |
| Fine Gardening | 4 | SEASONAL | — | |
| Food Network Magazine | 6 | BI_MONTHLY | 1 | |
| Forbes | 8 | BI_MONTHLY | 1 | |
| Fun for Kidz | 6 | BI_MONTHLY | 2 | |
| Good Housekeeping | 6 | BI_MONTHLY | 1 | |
| GQ - US Ed | 8 | BI_MONTHLY | — | |
| Harvard Business Review | 12 | MONTHLY | — | |
| HGTV Magazine | 6 | BI_MONTHLY | 1 | |
| Highlights for Children | 12 | MONTHLY | 2 | |
| Highlights High Five | 12 | MONTHLY | — | |
| Home & Design Magazine | 6 | BI_MONTHLY | — | |
| House Beautiful | 6 | BI_MONTHLY | — | |
| Humpty Dumpty Magazine | 6 | BI_MONTHLY | 2 | |
| INC | 4 | SEASONAL | — | Membership Title |
| Kiplingers Personal Finance | 12 | MONTHLY | 1 | |
| Ladybug | 6 | BI_MONTHLY | 2 | |
| Mens Health - PA | 4 | SEASONAL | — | |
| Mother Earth News | 6 | BI_MONTHLY | — | |
| National Geographic | 12 | MONTHLY | — | |
| National Geographic History | 6 | BI_MONTHLY | — | |
| National Geographic Kids | 10 | MONTHLY | 2 | |
| National Geographic Little Kids | 6 | BI_MONTHLY | — | |
| New Jersey Monthly | 11 | MONTHLY | — | |
| New York | 26 | BI_WEEKLY | — | |
| New Yorker | 47 | WEEKLY | — | |
| People | 48 | WEEKLY | 1 | |
| Pioneer Woman | 4 | SEASONAL | — | |
| Popular Mechanics - English ed | 6 | BI_MONTHLY | — | |
| Practical Homeschooling | 4 | SEASONAL | 1 | *Training omission* |
| Prevention - PA | 12 | MONTHLY | 1 | |
| Ranger Rick - American ed | 10 | MONTHLY | — | |
| Ranger Rick Jr | 10 | MONTHLY | — | |
| Readers Digest - US ed | 8 | BI_MONTHLY | 1 | |
| Readers Digest - Large Print for Easier Reading | 8 | BI_MONTHLY | — | |
| Real Simple | 6 | BI_MONTHLY | — | |
| Science News | 12 | MONTHLY | — | |
| Smithsonian | 12 | MONTHLY | — | Membership Title |
| Spider | 6 | BI_MONTHLY | 2 | |
| Sports Illustrated | 12 | MONTHLY | 1 | |
| Sports Illustrated for Kids | 6 | BI_MONTHLY | 2 | |
| Taste of Home | 4 | SEASONAL | — | |
| TIME Magazine - Domestic ed | 44 | WEEKLY | 1 | |
| Us Weekly | 52 | WEEKLY | — | |
| VegNews Magazine | 4 | SEASONAL | — | *Training omission* |
| Vogue | 10 | MONTHLY | — | |
| The Week - Us Edition | 52 | WEEKLY | — | Start 07/01/2026 |
| Week Junior | 52 | WEEKLY | — | |
| Wired | 12 | MONTHLY | — | |
| Womens Health | 4 | SEASONAL | — | |
| Zoobooks | 9 | MONTHLY | 2 | |

### Qty 4 — All branches (ML + NE + CB + MOBILE)

| Name | Issues/Yr | Cadence |
|---|---|---|
| Make: Technology on Your Time | 4 | SEASONAL |

### Economist — special case (4 separate subs)

| Name | Issues/Yr | Cadence | Branches |
|---|---|---|---|
| Economist | 50 | WEEKLY | ML(1), NE(1), CB(1), MOBILE(1) |

## WT COX Magazine Data (15 titles, bare records)

All non-English. No period created. No MagazineSubscription created.

### Qty 3 — ML + NE + CB

| Name | Issues/Yr | Cadence | Language |
|---|---|---|---|
| Champak (Gujarati Edition) | 24 | BI_WEEKLY | Gujarati |
| Champak (Hindi Edition) | 24 | BI_WEEKLY | Hindi |
| Champak (Tamil Edition) | 12 | MONTHLY | Tamil |
| Champak (Telugu Edition) | 12 | MONTHLY | Telugu |
| Saras Salil (Gujarati Edition) | 12 | MONTHLY | Gujarati |
| Saras Salil (Hindi Edition) | 24 | BI_WEEKLY | Hindi |
| Saras Salil (Tamil Edition) | 12 | MONTHLY | Tamil | *Training omission* |
| Saras Salil (Telugu Edition) | 12 | MONTHLY | Telugu | *Training omission* |
| Sarita (Hindi) | 26 | BI_WEEKLY | Hindi |
| Swati Saparivara Patrika (IND) | 52 | WEEKLY | Telugu |

### Qty 4 — All branches (ML + NE + CB + MOBILE)

| Name | Issues/Yr | Cadence | Language |
|---|---|---|---|
| Chitralekha (Gujarati) | 52 | WEEKLY | Gujarati |
| GrihShobha (Gujarati) | 12 | MONTHLY | Gujarati |
| GrihShobha (Hindi)(IND) | 24 | BI_WEEKLY | Hindi |
| GrihShobha (Tamil) | 12 | MONTHLY | Tamil |
| GrihShobha (Telugu) | 12 | MONTHLY | Telugu |

## Script Conventions

- TypeScript, strict mode, TSDoc on exports
- `import 'dotenv/config'` at top (tsx doesn't auto-load .env.local)
- Prisma v7 adapter pattern from `lib/db.ts`
- Dates stored at noon UTC: `new Date('2026-06-01T12:00:00Z')`
- Console output with counts at each step
- `npm run` scripts: `seed:2026` → training version, `seed:2026:complete` → complete version
