/**
 * Test/demo seed: generates realistic receipt and transfer data for
 * demonstrating the admin reports feature. Self-contained — creates users,
 * branches, magazines, and subscriptions from scratch, then layers on
 * 3-6 months of receipt history plus sample transfers.
 *
 * Usage:  npx tsx prisma/seed_test.ts
 * WARNING: This will add data to the existing database. Reset first if needed.
 */

import 'dotenv/config'
import bcrypt from 'bcrypt'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient } from '../generated/prisma/client'
import { addDays, addMonths, subMonths, subDays } from 'date-fns'

const adapter = new PrismaBetterSqlite3({ url: process.env['DATABASE_URL']! })
const db = new PrismaClient({ adapter })

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CadenceType = 'WEEKLY' | 'BI_WEEKLY' | 'MONTHLY' | 'BI_MONTHLY' | 'SEASONAL'

interface MagSeed {
  name: string
  cadence: CadenceType
  language?: string
  branches: { code: string; qty: number }[]
}

// ---------------------------------------------------------------------------
// Deterministic PRNG (seeded) for reproducible test data
// ---------------------------------------------------------------------------

/** Simple mulberry32 PRNG so test data is reproducible across runs */
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rand = mulberry32(42)

/** Random int in [min, max] inclusive */
function randInt(min: number, max: number): number {
  return Math.floor(rand() * (max - min + 1)) + min
}

/** Pick a random element from an array */
function pick<T>(arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)]
}

// ---------------------------------------------------------------------------
// Cadence offset logic (mirrors lib/cadence.ts)
// ---------------------------------------------------------------------------

const CADENCE_OFFSETS: Record<CadenceType, (d: Date) => Date> = {
  WEEKLY: (d) => addDays(d, 7),
  BI_WEEKLY: (d) => addDays(d, 14),
  MONTHLY: (d) => addMonths(d, 1),
  BI_MONTHLY: (d) => addMonths(d, 2),
  SEASONAL: (d) => addMonths(d, 3),
}

// ---------------------------------------------------------------------------
// Magazine catalogue (copied from seed.ts)
// ---------------------------------------------------------------------------

function parseBranches(s: string): { code: string; qty: number }[] {
  return s.split(',').map((part) => {
    const match = part.match(/^(\w+)\((\d+)\)$/)
    if (match) return { code: match[1], qty: parseInt(match[2], 10) }
    return { code: part, qty: 1 }
  })
}

const BRANCH_MAP: Record<string, string> = { ML: 'MAIN', NE: 'NORTH', CB: 'CB' }

const MAGAZINES: MagSeed[] = [
  { name: 'AARP Bulletin', cadence: 'BI_MONTHLY', branches: parseBranches('ML') },
  { name: 'AARP The Magazine', cadence: 'BI_MONTHLY', branches: parseBranches('ML') },
  { name: 'All Recipes Magazine', cadence: 'BI_MONTHLY', branches: parseBranches('ML') },
  { name: 'American Association of Retired Persons Membership', cadence: 'MONTHLY', branches: parseBranches('ML') },
  { name: 'Ananda Vikatan', cadence: 'WEEKLY', branches: parseBranches('ML,NE') },
  { name: 'Architectural Digest', cadence: 'MONTHLY', branches: parseBranches('ML,NE') },
  { name: 'Artists Magazine', cadence: 'MONTHLY', branches: parseBranches('ML,NE') },
  { name: 'Ask', cadence: 'MONTHLY', branches: parseBranches('ML,NE,CB') },
  { name: 'Astronomy', cadence: 'MONTHLY', branches: parseBranches('ML,NE') },
  { name: 'Atlantic Monthly', cadence: 'MONTHLY', branches: parseBranches('ML,NE,CB') },
  { name: 'Babybug', cadence: 'MONTHLY', branches: parseBranches('ML,NE,CB') },
  { name: 'Better Homes and Gardens', cadence: 'MONTHLY', branches: parseBranches('ML,NE,CB') },
  { name: 'Bon Appetit', cadence: 'MONTHLY', branches: parseBranches('ML,NE,CB') },
  { name: 'Car and Driver', cadence: 'MONTHLY', branches: parseBranches('ML,NE') },
  { name: 'China Today - Chinese Ed', cadence: 'MONTHLY', branches: parseBranches('ML,NE') },
  { name: 'Chirp', cadence: 'MONTHLY', branches: parseBranches('ML,NE') },
  { name: 'Consumer Reports', cadence: 'MONTHLY', branches: parseBranches('ML(2),NE(2),CB(1)') },
  { name: 'Consumer Reports Buying Guide - Online', cadence: 'MONTHLY', branches: parseBranches('ML') },
  { name: 'Cooks Illustrated', cadence: 'BI_MONTHLY', branches: parseBranches('ML,NE,CB') },
  { name: 'Cosmopolitan', cadence: 'MONTHLY', branches: parseBranches('ML,NE,CB') },
  { name: 'Country Living', cadence: 'MONTHLY', branches: parseBranches('ML,NE') },
  { name: 'Crossword Puzzles Only', cadence: 'MONTHLY', branches: parseBranches('ML,NE,CB') },
  { name: 'Discover', cadence: 'BI_MONTHLY', branches: parseBranches('ML,NE,CB') },
  { name: 'Economist', cadence: 'WEEKLY', branches: parseBranches('ML,NE,CB') },
  { name: 'Elle - American Ed', cadence: 'MONTHLY', branches: parseBranches('ML') },
  { name: 'Entrepreneur', cadence: 'MONTHLY', branches: parseBranches('ML,NE') },
  { name: 'Esquire', cadence: 'BI_MONTHLY', branches: parseBranches('ML,NE') },
  { name: 'Essence', cadence: 'BI_MONTHLY', branches: parseBranches('ML,NE') },
  { name: 'Family Handyman', cadence: 'MONTHLY', branches: parseBranches('ML,NE,CB') },
  { name: 'Family Tree Magazine', cadence: 'BI_MONTHLY', branches: parseBranches('ML,NE,CB') },
  { name: 'Fine Gardening', cadence: 'BI_MONTHLY', branches: parseBranches('ML,NE,CB') },
  { name: 'First for Women', cadence: 'MONTHLY', branches: parseBranches('ML,NE,CB') },
  { name: 'Food Network Magazine', cadence: 'BI_MONTHLY', branches: parseBranches('ML,NE,CB') },
  { name: 'Food & Wine', cadence: 'MONTHLY', branches: parseBranches('ML') },
  { name: 'Forbes', cadence: 'BI_WEEKLY', branches: parseBranches('ML,NE,CB') },
  { name: 'Fortune - Domestic Ed', cadence: 'MONTHLY', branches: parseBranches('ML,NE') },
  { name: 'Fun for Kidz', cadence: 'BI_MONTHLY', branches: parseBranches('ML,NE') },
  { name: 'Golf Digest', cadence: 'MONTHLY', branches: parseBranches('ML,NE') },
  { name: 'Good Housekeeping', cadence: 'MONTHLY', branches: parseBranches('ML,NE,CB') },
  { name: 'GQ - US Edition', cadence: 'MONTHLY', branches: parseBranches('ML,NE,CB') },
  { name: 'Harpers Bazaar', cadence: 'MONTHLY', branches: parseBranches('ML,NE') },
  { name: 'Harvard Business Review', cadence: 'MONTHLY', branches: parseBranches('ML,NE,CB') },
  { name: 'Harvard Health Letter', cadence: 'MONTHLY', branches: parseBranches('ML,NE') },
  { name: 'HGTV Magazine', cadence: 'MONTHLY', branches: parseBranches('ML,NE,CB') },
  { name: 'Highlights for Children', cadence: 'MONTHLY', branches: parseBranches('ML,NE,CB') },
  { name: 'Highlights High Five', cadence: 'MONTHLY', branches: parseBranches('ML,NE,CB') },
  { name: 'Hockey News', cadence: 'MONTHLY', branches: parseBranches('ML,NE') },
  { name: 'Home & Design Magazine', cadence: 'MONTHLY', branches: parseBranches('ML,NE,CB') },
  { name: 'House Beautiful', cadence: 'MONTHLY', branches: parseBranches('ML,NE,CB') },
  { name: 'Humpty Dumpty Magazine', cadence: 'BI_MONTHLY', branches: parseBranches('ML,NE,CB') },
  { name: 'Inc', cadence: 'MONTHLY', branches: parseBranches('ML,NE') },
  { name: 'Inc 500', cadence: 'MONTHLY', branches: parseBranches('ML') },
  { name: 'Kiplingers Personal Finance', cadence: 'MONTHLY', branches: parseBranches('ML,NE,CB') },
  { name: 'Ladybug', cadence: 'MONTHLY', branches: parseBranches('ML,NE,CB') },
  { name: 'Library Journal', cadence: 'MONTHLY', branches: parseBranches('ML') },
  { name: 'Magnolia Journal', cadence: 'SEASONAL', branches: parseBranches('ML') },
  { name: 'Make', cadence: 'BI_MONTHLY', branches: parseBranches('ML,NE,CB') },
  { name: 'Mens Health', cadence: 'MONTHLY', branches: parseBranches('ML,NE,CB') },
  { name: 'Mother Earth News', cadence: 'BI_MONTHLY', branches: parseBranches('ML,NE,CB') },
  { name: 'Muse', cadence: 'MONTHLY', branches: parseBranches('ML,NE') },
  { name: 'National Geographic', cadence: 'MONTHLY', branches: parseBranches('ML,NE,CB') },
  { name: 'National Geographic History', cadence: 'BI_MONTHLY', branches: parseBranches('ML,NE,CB') },
  { name: 'National Geographic Kids', cadence: 'MONTHLY', branches: parseBranches('ML,NE,CB') },
  { name: 'National Geographic Little Kids', cadence: 'BI_MONTHLY', branches: parseBranches('ML,NE,CB') },
  { name: 'New Jersey Monthly', cadence: 'MONTHLY', branches: parseBranches('ML,NE,CB') },
  { name: 'New York', cadence: 'BI_WEEKLY', branches: parseBranches('ML,NE,CB') },
  { name: 'New Yorker', cadence: 'WEEKLY', branches: parseBranches('ML,NE,CB') },
  { name: 'Out', cadence: 'BI_MONTHLY', branches: parseBranches('ML,NE') },
  { name: 'Pastel Journal', cadence: 'BI_MONTHLY', branches: parseBranches('ML,NE') },
  { name: 'People', cadence: 'WEEKLY', branches: parseBranches('ML,NE,CB') },
  { name: 'Pioneer Woman', cadence: 'SEASONAL', branches: parseBranches('ML,NE,CB') },
  { name: 'Poetry', cadence: 'MONTHLY', branches: parseBranches('ML,NE') },
  { name: 'Poets & Writers Magazine', cadence: 'BI_MONTHLY', branches: parseBranches('ML,NE') },
  { name: 'Popular Mechanics', cadence: 'MONTHLY', branches: parseBranches('ML,NE,CB') },
  { name: 'Prevention', cadence: 'MONTHLY', branches: parseBranches('ML,NE,CB') },
  { name: 'Psychology Today', cadence: 'BI_MONTHLY', branches: parseBranches('ML,NE') },
  { name: 'Publishers Weekly', cadence: 'WEEKLY', branches: parseBranches('ML') },
  { name: 'Ranger Rick', cadence: 'MONTHLY', branches: parseBranches('ML,NE,CB') },
  { name: 'Ranger Rick Jr', cadence: 'MONTHLY', branches: parseBranches('ML,NE,CB') },
  { name: 'Readers Digest - US Ed', cadence: 'MONTHLY', branches: parseBranches('ML,NE,CB') },
  { name: 'Readers Digest - Large Print', cadence: 'MONTHLY', branches: parseBranches('ML,NE,CB') },
  { name: 'Real Simple', cadence: 'MONTHLY', branches: parseBranches('ML,NE,CB') },
  { name: 'Runners World', cadence: 'MONTHLY', branches: parseBranches('ML,NE') },
  { name: 'School Library Journal', cadence: 'MONTHLY', branches: parseBranches('ML') },
  { name: 'Science News', cadence: 'BI_WEEKLY', branches: parseBranches('ML,NE,CB') },
  { name: 'Scientific American', cadence: 'MONTHLY', branches: parseBranches('ML,NE') },
  { name: 'Scout Life', cadence: 'MONTHLY', branches: parseBranches('ML,NE') },
  { name: 'Series Made Simple', cadence: 'MONTHLY', branches: parseBranches('ML') },
  { name: 'Smithsonian', cadence: 'MONTHLY', branches: parseBranches('ML,NE,CB') },
  { name: 'Spider', cadence: 'MONTHLY', branches: parseBranches('ML,NE') },
  { name: 'Sports Illustrated', cadence: 'MONTHLY', branches: parseBranches('ML,NE,CB') },
  { name: 'Sports Illustrated Kids', cadence: 'MONTHLY', branches: parseBranches('ML,NE,CB') },
  { name: 'Taste of Home', cadence: 'BI_MONTHLY', branches: parseBranches('ML,NE,CB') },
  { name: 'Threads', cadence: 'BI_MONTHLY', branches: parseBranches('ML,NE') },
  { name: 'Time Magazine', cadence: 'WEEKLY', branches: parseBranches('ML,NE,CB') },
  { name: 'Town & Country', cadence: 'MONTHLY', branches: parseBranches('ML,NE') },
  { name: 'Travel & Leisure', cadence: 'MONTHLY', branches: parseBranches('ML,NE') },
  { name: 'US Weekly', cadence: 'WEEKLY', branches: parseBranches('ML,NE,CB') },
  { name: 'Vanity Fair - American Ed', cadence: 'MONTHLY', branches: parseBranches('ML,NE') },
  { name: 'VegNews Magazine', cadence: 'BI_MONTHLY', branches: parseBranches('ML,NE,CB') },
  { name: 'Veranda', cadence: 'BI_MONTHLY', branches: parseBranches('ML,NE') },
  { name: 'Vogue', cadence: 'MONTHLY', branches: parseBranches('ML,NE,CB') },
  { name: 'The Week - US Edition', cadence: 'WEEKLY', branches: parseBranches('ML,NE,CB') },
  { name: 'The Week Junior', cadence: 'WEEKLY', branches: parseBranches('ML,NE,CB') },
  { name: 'Wired', cadence: 'MONTHLY', branches: parseBranches('ML,NE,CB') },
  { name: 'Womens Health', cadence: 'MONTHLY', branches: parseBranches('ML,NE,CB') },
  { name: 'Zoobooks', cadence: 'BI_MONTHLY', branches: parseBranches('ML,NE,CB') },
  // Non-English magazines
  { name: 'Champak (Gujarati Edition)', cadence: 'BI_WEEKLY', language: 'Gujarati', branches: parseBranches('ML') },
  { name: 'Champak (Hindi Edition)', cadence: 'BI_WEEKLY', language: 'Hindi', branches: parseBranches('ML') },
  { name: 'Champak (Tamil Edition)', cadence: 'MONTHLY', language: 'Tamil', branches: parseBranches('ML') },
  { name: 'Champak (Telugu Edition)', cadence: 'MONTHLY', language: 'Telugu', branches: parseBranches('ML') },
  { name: 'Chitralekha (Gujarati)', cadence: 'WEEKLY', language: 'Gujarati', branches: parseBranches('ML') },
  { name: 'GrihShobha (Gujarati)', cadence: 'MONTHLY', language: 'Gujarati', branches: parseBranches('ML') },
  { name: 'GrihShobha (Hindi)(IND)', cadence: 'BI_WEEKLY', language: 'Hindi', branches: parseBranches('ML') },
  { name: 'GrihShobha (Tamil)', cadence: 'MONTHLY', language: 'Tamil', branches: parseBranches('ML') },
  { name: 'GrihShobha (Telugu)', cadence: 'MONTHLY', language: 'Telugu', branches: parseBranches('ML') },
  { name: 'Saras Salil (Hindi Edition)', cadence: 'BI_WEEKLY', language: 'Hindi', branches: parseBranches('ML') },
  { name: 'Sarita (Hindi)', cadence: 'BI_WEEKLY', language: 'Hindi', branches: parseBranches('ML') },
  { name: 'Swati Saparivara Patrika (Telugu)', cadence: 'WEEKLY', language: 'Telugu', branches: parseBranches('ML') },
]

// ---------------------------------------------------------------------------
// Receipt note templates (~20% of receipts get a note)
// ---------------------------------------------------------------------------

const RECEIPT_NOTES = [
  'Arrived late',
  'Damaged copy — replacement requested',
  'Cover torn, otherwise OK',
  'Two copies received',
  'Missing supplement',
  'Patron hold placed immediately',
  'Water damage on back cover',
  'Arrived early this month',
  'Bundled with previous issue',
  'Special edition',
]

// ---------------------------------------------------------------------------
// Main seed logic
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== Test Seed: generating demo data for reports ===\n')

  // ---- Step 1: Base data (users, branches, magazines, subscriptions) ----

  // Users
  const adminHash = await bcrypt.hash('admin1234', 10)
  const admin = await db.user.upsert({
    where: { email: 'admin@library.org' },
    update: {},
    create: {
      name: 'Library Admin',
      email: 'admin@library.org',
      passwordHash: adminHash,
      role: 'ADMIN',
    },
  })

  const staffHash = await bcrypt.hash('staff1234', 10)
  const staff = await db.user.upsert({
    where: { email: 'staff@library.org' },
    update: {},
    create: {
      name: 'Jane Smith',
      email: 'staff@library.org',
      passwordHash: staffHash,
      role: 'STAFF',
    },
  })
  const users = [admin, staff]
  console.log('Users: admin@library.org / admin1234, staff@library.org / staff1234')

  // Branches
  const branchData = [
    { name: 'Main Library', code: 'MAIN' },
    { name: 'North Edison Branch Library', code: 'NORTH' },
    { name: 'Clara Barton Branch Library', code: 'CB' },
    { name: 'Bookmobile', code: 'MOBILE' },
  ]
  const branchMap = new Map<string, string>()
  const branchIds: string[] = []
  for (const b of branchData) {
    const branch = await db.branch.upsert({
      where: { code: b.code },
      update: { name: b.name },
      create: b,
    })
    branchMap.set(b.code, branch.id)
    branchIds.push(branch.id)
    console.log(`  Branch: ${b.name} (${b.code})`)
  }
  console.log(`Branches: ${branchData.length} created\n`)

  // Magazines + subscriptions
  /** Tracks created magazine IDs by name for later receipt/transfer generation */
  const magazineIndex = new Map<string, { id: string; cadence: CadenceType; language: string }>()
  let magCount = 0
  let subCount = 0

  /** All BranchMagazine records for receipt generation */
  interface SubRecord {
    branchId: string
    magazineId: string
    cadence: CadenceType
    language: string
  }
  const allSubs: SubRecord[] = []

  for (const mag of MAGAZINES) {
    const existing = await db.magazine.findFirst({ where: { name: mag.name } })
    const magazine = existing ?? await db.magazine.create({
      data: { name: mag.name, cadence: mag.cadence, language: mag.language ?? 'English' },
    })
    magazineIndex.set(mag.name, { id: magazine.id, cadence: mag.cadence, language: mag.language ?? 'English' })
    magCount++

    for (const b of mag.branches) {
      const dbCode = BRANCH_MAP[b.code]
      const branchId = branchMap.get(dbCode)
      if (!branchId) continue
      await db.branchMagazine.upsert({
        where: { branchId_magazineId: { branchId, magazineId: magazine.id } },
        update: { quantity: b.qty },
        create: { branchId, magazineId: magazine.id, quantity: b.qty },
      })
      allSubs.push({ branchId, magazineId: magazine.id, cadence: mag.cadence, language: mag.language ?? 'English' })
      subCount++
    }
  }
  console.log(`Magazines: ${magCount} created, ${subCount} subscriptions\n`)

  // ---- Step 2: Receipt history (3-6 months) ----

  // Select ~30 subscriptions: ensure all non-English magazines are included,
  // then fill up with random English ones.
  const nonEnglishSubs = allSubs.filter((s) => s.language !== 'English')
  const englishSubs = allSubs.filter((s) => s.language === 'English')

  // Shuffle English subs deterministically
  for (let i = englishSubs.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [englishSubs[i], englishSubs[j]] = [englishSubs[j], englishSubs[i]]
  }

  const targetSubCount = 30
  const selectedSubs = [
    ...nonEnglishSubs,
    ...englishSubs.slice(0, Math.max(0, targetSubCount - nonEnglishSubs.length)),
  ]

  console.log(`Generating receipts for ${selectedSubs.length} subscriptions...`)

  let receiptCount = 0
  const today = new Date()

  for (const sub of selectedSubs) {
    // Random start: 3-6 months ago
    const monthsBack = randInt(3, 6)
    let cursor = subMonths(today, monthsBack)
    const advance = CADENCE_OFFSETS[sub.cadence]

    while (cursor <= today) {
      // Skip ~15% of expected receipts to create overdue gaps
      if (rand() < 0.15) {
        cursor = advance(cursor)
        continue
      }

      const receivedById = pick(users).id
      const notes = rand() < 0.2 ? pick(RECEIPT_NOTES) : null

      await db.issueReceipt.create({
        data: {
          magazineId: sub.magazineId,
          branchId: sub.branchId,
          receivedById,
          receivedDate: cursor,
          notes,
        },
      })
      receiptCount++
      cursor = advance(cursor)
    }
  }
  console.log(`Created ${receiptCount} receipts\n`)

  // Verify non-English receipt counts
  for (const lang of ['Gujarati', 'Hindi', 'Tamil', 'Telugu']) {
    const langSubs = nonEnglishSubs.filter((s) => s.language === lang)
    const langMagIds = langSubs.map((s) => s.magazineId)
    const langReceipts = await db.issueReceipt.count({
      where: { magazineId: { in: langMagIds } },
    })
    console.log(`  ${lang}: ${langReceipts} receipts across ${langSubs.length} subscriptions`)
  }

  // ---- Step 3: Transfers (15-20) ----

  // Pick magazine IDs from our selected subs for transfers
  const subMagIds = [...new Set(selectedSubs.map((s) => s.magazineId))]
  // We need branches that aren't MOBILE for transfers (only MAIN, NORTH, CB)
  const transferBranchIds = branchIds.filter((id) => {
    const code = [...branchMap.entries()].find(([, v]) => v === id)?.[0]
    return code !== 'MOBILE'
  })

  let transferCount = 0

  /**
   * Creates a transfer record with the given status.
   * Spreads creation dates across the last 3 months.
   */
  async function createTransfer(
    status: 'COMPLETED' | 'PENDING' | 'CANCELLED',
    daysAgo: number
  ): Promise<void> {
    const magazineId = pick(subMagIds)
    // Pick two different branches
    let fromIdx = Math.floor(rand() * transferBranchIds.length)
    let toIdx = Math.floor(rand() * transferBranchIds.length)
    while (toIdx === fromIdx) {
      toIdx = Math.floor(rand() * transferBranchIds.length)
    }
    const fromBranchId = transferBranchIds[fromIdx]
    const toBranchId = transferBranchIds[toIdx]

    const createdAt = subDays(today, daysAgo)
    const initiatedById = pick(users).id

    const data: Parameters<typeof db.transfer.create>[0]['data'] = {
      magazineId,
      fromBranchId,
      toBranchId,
      quantity: randInt(1, 3),
      status,
      initiatedById,
      createdAt,
    }

    if (status === 'COMPLETED') {
      data.completedById = pick(users).id
      data.completedAt = addDays(createdAt, randInt(1, 3))
    } else if (status === 'CANCELLED') {
      data.cancelledById = pick(users).id
      data.cancelledAt = addDays(createdAt, randInt(1, 5))
    }

    await db.transfer.create({ data })
    transferCount++
  }

  console.log('Generating transfers...')

  // 10 COMPLETED transfers spread across last 90 days
  for (let i = 0; i < 10; i++) {
    await createTransfer('COMPLETED', randInt(5, 90))
  }

  // 3 PENDING transfers (more recent)
  for (let i = 0; i < 3; i++) {
    await createTransfer('PENDING', randInt(1, 14))
  }

  // 3 CANCELLED transfers
  for (let i = 0; i < 3; i++) {
    await createTransfer('CANCELLED', randInt(10, 60))
  }

  console.log(`Created ${transferCount} transfers\n`)

  // ---- Summary ----

  console.log(`\nTest seed complete: ${receiptCount} receipts, ${transferCount} transfers`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
