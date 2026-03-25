/**
 * Test/demo seed: generates ~12 months of realistic receipt and transfer data.
 * Self-contained — deletes all existing data and creates users, branches,
 * magazines, subscriptions, receipts, and transfers from scratch.
 *
 * Receipt patterns are modeled on real CSV tracking data from the library,
 * including realistic gaps, never-received magazines, and controlled last-receipt
 * dates to ensure the dashboard always shows overdue + coming-this-week items.
 *
 * Usage:  npx tsx prisma/seed_test.ts
 * WARNING: This DESTROYS all existing data. Reset your DB first if needed.
 */

import 'dotenv/config'
import bcrypt from 'bcrypt'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient } from '../generated/prisma/client'
import { addDays, addMonths, subDays, subMonths } from 'date-fns'

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
  /** Branch subscriptions from the production seed (ML/NE/CB shorthand) */
  branches: { code: string; qty: number }[]
}

/** Reliability tier — controls how many issues are skipped */
type ReliabilityTier = 'highly_regular' | 'moderate_gaps' | 'significant_gaps' | 'never_received'

/** A subscription record linking a branch to a magazine for receipt generation */
interface SubRecord {
  branchId: string
  branchCode: string
  magazineId: string
  magazineName: string
  cadence: CadenceType
  language: string
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

/** Deterministically shuffle an array in place */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
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

/** Reverse offset: how many days back should the last receipt be to make it overdue? */
function daysForCadence(cadence: CadenceType): number {
  switch (cadence) {
    case 'WEEKLY': return 7
    case 'BI_WEEKLY': return 14
    case 'MONTHLY': return 31
    case 'BI_MONTHLY': return 62
    case 'SEASONAL': return 93
  }
}

// ---------------------------------------------------------------------------
// Branch code mapping: spreadsheet abbreviation -> DB code
// ---------------------------------------------------------------------------

/** Maps CSV shorthand to database branch code. Bookmobile is excluded. */
const BRANCH_MAP: Record<string, string> = { ML: 'MAIN', NE: 'NORTH', CB: 'CB' }

/** Parse branch string like "ML,NE,CB" or "ML(2),NE(2),CB(1)" */
function parseBranches(s: string): { code: string; qty: number }[] {
  return s.split(',').map((part) => {
    const match = part.match(/^(\w+)\((\d+)\)$/)
    if (match) return { code: match[1], qty: parseInt(match[2], 10) }
    return { code: part, qty: 1 }
  })
}

// ---------------------------------------------------------------------------
// Magazine catalogue (canonical list from seed.ts)
// ---------------------------------------------------------------------------

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
  // Non-English magazines (ML only)
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
// Reliability tiers — based on real CSV tracking data
// ---------------------------------------------------------------------------

/**
 * Magazine reliability tiers from real tracking data.
 * Controls skip probability during receipt generation.
 */
const RELIABILITY: Record<string, ReliabilityTier> = {
  // Highly regular — almost never missed (skip ~3%)
  'Science News': 'highly_regular',
  'Economist': 'highly_regular',
  'People': 'highly_regular',
  'US Weekly': 'highly_regular',
  'The Week - US Edition': 'highly_regular',
  'New Yorker': 'highly_regular',
  'Time Magazine': 'highly_regular',
  'Forbes': 'highly_regular',
  'New York': 'highly_regular',
  'Consumer Reports': 'highly_regular',
  'Readers Digest - US Ed': 'highly_regular',
  'Readers Digest - Large Print': 'highly_regular',
  'Good Housekeeping': 'highly_regular',
  'Better Homes and Gardens': 'highly_regular',
  'National Geographic Kids': 'highly_regular',
  'Highlights for Children': 'highly_regular',
  'Highlights High Five': 'highly_regular',
  'Real Simple': 'highly_regular',
  'Cosmopolitan': 'highly_regular',
  'Prevention': 'highly_regular',
  'Smithsonian': 'highly_regular',

  // Moderate gaps — miss 1-3 issues per year (skip ~10-15%)
  'National Geographic': 'moderate_gaps',
  'Sports Illustrated': 'moderate_gaps',
  'Atlantic Monthly': 'moderate_gaps',
  'Vogue': 'moderate_gaps',
  'Harpers Bazaar': 'moderate_gaps',
  'Architectural Digest': 'moderate_gaps',
  'Bon Appetit': 'moderate_gaps',
  'GQ - US Edition': 'moderate_gaps',
  'Harvard Business Review': 'moderate_gaps',
  'Popular Mechanics': 'moderate_gaps',
  'Scientific American': 'moderate_gaps',
  'Vanity Fair - American Ed': 'moderate_gaps',
  'Mens Health': 'moderate_gaps',
  'Womens Health': 'moderate_gaps',
  'Entrepreneur': 'moderate_gaps',
  'Fortune - Domestic Ed': 'moderate_gaps',

  // Significant gaps — miss 3+ issues (skip ~35-50%)
  'The Week Junior': 'significant_gaps',
  'Wired': 'significant_gaps',
  'Muse': 'significant_gaps',
  'Spider': 'significant_gaps',
  'Babybug': 'significant_gaps',
  'Chirp': 'significant_gaps',
  'Ask': 'significant_gaps',
  'Ladybug': 'significant_gaps',
  'Poetry': 'significant_gaps',
  'Hockey News': 'significant_gaps',
  'Scout Life': 'significant_gaps',

  // Never received — 0 receipts
  'Library Journal': 'never_received',
  'Publishers Weekly': 'never_received',
  'School Library Journal': 'never_received',
  'Series Made Simple': 'never_received',
  'Inc 500': 'never_received',
  'MAD': 'never_received',
  'Consumer Reports Buying Guide - Online': 'never_received',
}

/** Returns the skip probability for a magazine based on its reliability tier */
function skipProbability(magazineName: string): number {
  const tier = RELIABILITY[magazineName]
  switch (tier) {
    case 'highly_regular': return 0.03
    case 'moderate_gaps': return 0.12
    case 'significant_gaps': return 0.40
    case 'never_received': return 1.0
    default: return 0.10 // default: most magazines have moderate reliability
  }
}

// ---------------------------------------------------------------------------
// Bookmobile subscription list (~10-15 popular magazines)
// ---------------------------------------------------------------------------

/** Popular magazines subscribed at the Bookmobile branch */
const BOOKMOBILE_MAGAZINES = [
  'People',
  'Time Magazine',
  'National Geographic',
  'Readers Digest - US Ed',
  'Readers Digest - Large Print',
  'Good Housekeeping',
  'Better Homes and Gardens',
  'Highlights for Children',
  'National Geographic Kids',
  'Sports Illustrated',
  'US Weekly',
  'Real Simple',
  'Consumer Reports',
]

// ---------------------------------------------------------------------------
// Clara Barton ~1/3 English subset (representative mix)
// These are the CB magazines from the production seed that already have CB
// in their branches string. We use the production seed's CB assignments as-is.
// ---------------------------------------------------------------------------

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
// Dashboard-aware last-receipt date calculation
// ---------------------------------------------------------------------------

/**
 * For a given cadence, returns a receivedDate that makes the next expected
 * date fall within [targetStart, targetEnd].
 *
 * nextExpected = lastReceived + cadenceInterval
 * So lastReceived = targetDate - cadenceInterval
 */
function lastReceiptForTarget(targetDate: Date, cadence: CadenceType): Date {
  const days = daysForCadence(cadence)
  return subDays(targetDate, days)
}

// ---------------------------------------------------------------------------
// Main seed logic
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== Test Seed: generating ~12 months of realistic demo data ===\n')

  const today = new Date()

  // ---- Step 0: Clean existing data ----
  console.log('Cleaning existing data...')
  await db.transfer.deleteMany()
  await db.issueReceipt.deleteMany()
  await db.branchMagazine.deleteMany()
  await db.magazine.deleteMany()
  await db.branch.deleteMany()
  await db.user.deleteMany()
  console.log('  All tables cleared.\n')

  // ---- Step 1: Users ----

  const adminHash = await bcrypt.hash('admin1234', 10)
  const admin = await db.user.create({
    data: {
      name: 'Library Admin',
      email: 'admin@library.org',
      passwordHash: adminHash,
      role: 'ADMIN',
    },
  })

  const staffHash = await bcrypt.hash('staff1234', 10)
  const staff = await db.user.create({
    data: {
      name: 'Jane Smith',
      email: 'staff@library.org',
      passwordHash: staffHash,
      role: 'STAFF',
    },
  })
  const users = [admin, staff]
  console.log('Users: admin@library.org / admin1234, staff@library.org / staff1234')

  // ---- Step 2: Branches ----

  const branchData = [
    { name: 'Main Library', code: 'MAIN' },
    { name: 'North Edison Branch Library', code: 'NORTH' },
    { name: 'Clara Barton Branch Library', code: 'CB' },
    { name: 'Bookmobile', code: 'MOBILE' },
  ]
  const branchMap = new Map<string, string>() // code -> id
  const branchIds: string[] = []
  for (const b of branchData) {
    const branch = await db.branch.create({ data: b })
    branchMap.set(b.code, branch.id)
    branchIds.push(branch.id)
    console.log(`  Branch: ${b.name} (${b.code})`)
  }
  console.log(`Branches: ${branchData.length} created\n`)

  // ---- Step 3: Magazines + subscriptions ----

  /** Tracks created magazine IDs by name */
  const magazineIndex = new Map<string, { id: string; cadence: CadenceType; language: string }>()
  /** All subscriptions for receipt generation */
  const allSubs: SubRecord[] = []
  let magCount = 0
  let subCount = 0

  for (const mag of MAGAZINES) {
    const magazine = await db.magazine.create({
      data: { name: mag.name, cadence: mag.cadence, language: mag.language ?? 'English' },
    })
    magazineIndex.set(mag.name, { id: magazine.id, cadence: mag.cadence, language: mag.language ?? 'English' })
    magCount++

    // Create subscriptions from CSV branch mapping (ML/NE/CB)
    for (const b of mag.branches) {
      const dbCode = BRANCH_MAP[b.code]
      if (!dbCode) continue
      const branchId = branchMap.get(dbCode)
      if (!branchId) continue
      await db.branchMagazine.create({
        data: { branchId, magazineId: magazine.id, quantity: b.qty },
      })
      allSubs.push({
        branchId,
        branchCode: dbCode,
        magazineId: magazine.id,
        magazineName: mag.name,
        cadence: mag.cadence,
        language: mag.language ?? 'English',
      })
      subCount++
    }
  }

  // Bookmobile subscriptions — popular English magazines only
  const mobileId = branchMap.get('MOBILE')!
  for (const magName of BOOKMOBILE_MAGAZINES) {
    const mag = magazineIndex.get(magName)
    if (!mag) continue
    await db.branchMagazine.create({
      data: { branchId: mobileId, magazineId: mag.id, quantity: 1 },
    })
    allSubs.push({
      branchId: mobileId,
      branchCode: 'MOBILE',
      magazineId: mag.id,
      magazineName: magName,
      cadence: mag.cadence,
      language: mag.language,
    })
    subCount++
  }

  console.log(`Magazines: ${magCount} created, ${subCount} subscriptions\n`)

  // ---- Step 4: Receipt history (Jan 2025 - Mar 2026) ----

  // Data range: Jan 1 2025 through ~today
  const historyStart = new Date(2025, 0, 1) // Jan 1, 2025

  console.log(`Generating receipts from ${historyStart.toISOString().slice(0, 10)} to ${today.toISOString().slice(0, 10)}...`)

  let receiptCount = 0

  /**
   * Per-branch, per-magazine tracking of last receipt date.
   * Used to control dashboard state after bulk generation.
   */
  const lastReceiptDates = new Map<string, Date>() // key: `${branchId}:${magazineId}`

  // Generate receipts for ALL subscriptions
  for (const sub of allSubs) {
    const skip = skipProbability(sub.magazineName)

    // Never-received magazines get no receipts at all
    if (skip >= 1.0) continue

    let cursor = new Date(historyStart)
    const advance = CADENCE_OFFSETS[sub.cadence]

    // Stagger start dates slightly per subscription so not everything starts Jan 1
    const staggerDays = randInt(0, daysForCadence(sub.cadence) - 1)
    cursor = addDays(cursor, staggerDays)

    // Stop generating about 5 weeks ago — we will place the final receipts
    // carefully in Step 5 to control dashboard state
    const cutoff = subDays(today, 35)

    while (cursor <= cutoff) {
      // Skip based on reliability tier
      if (rand() < skip) {
        cursor = advance(cursor)
        continue
      }

      // Add 0-2 days of jitter to make dates realistic
      const jitter = randInt(0, 2)
      const receivedDate = addDays(cursor, jitter)

      const receivedById = pick(users).id
      const notes = rand() < 0.2 ? pick(RECEIPT_NOTES) : null

      await db.issueReceipt.create({
        data: {
          magazineId: sub.magazineId,
          branchId: sub.branchId,
          receivedById,
          receivedDate,
          notes,
        },
      })
      receiptCount++

      const key = `${sub.branchId}:${sub.magazineId}`
      const prev = lastReceiptDates.get(key)
      if (!prev || receivedDate > prev) {
        lastReceiptDates.set(key, receivedDate)
      }

      cursor = advance(cursor)
    }
  }

  console.log(`  Bulk receipts: ${receiptCount}`)

  // ---- Step 5: Dashboard-controlled final receipts ----
  //
  // For each branch, we ensure at least:
  //   - 3 magazines whose next expected date is overdue (past)
  //   - 3 magazines whose next expected date is within the next 7 days
  //   - Remaining get a recent receipt so they show as "upcoming"
  //
  // We do this by placing a final receipt at a carefully computed date.

  console.log('  Placing dashboard-controlled final receipts...')

  const branchCodes = ['MAIN', 'NORTH', 'CB', 'MOBILE']

  for (const code of branchCodes) {
    const branchId = branchMap.get(code)!
    // Get all subs for this branch that are NOT never-received
    const branchSubs = allSubs.filter(
      (s) => s.branchId === branchId && skipProbability(s.magazineName) < 1.0
    )

    if (branchSubs.length === 0) continue

    // Shuffle to randomize which magazines get which dashboard state
    const shuffled = shuffle([...branchSubs])

    // Pick 3 for overdue, 3 for this-week, rest get normal recent receipt
    const overdueTargets = shuffled.slice(0, 3)
    const thisWeekTargets = shuffled.slice(3, 6)
    const recentTargets = shuffled.slice(6)

    // Overdue: last receipt should be old enough that nextExpected < today
    // Place last receipt such that nextExpected is 3-14 days in the past
    for (const sub of overdueTargets) {
      const daysOverdue = randInt(3, 14)
      const targetNext = subDays(today, daysOverdue)
      const receiptDate = lastReceiptForTarget(targetNext, sub.cadence)

      await db.issueReceipt.create({
        data: {
          magazineId: sub.magazineId,
          branchId: sub.branchId,
          receivedById: pick(users).id,
          receivedDate: receiptDate,
          notes: null,
        },
      })
      receiptCount++
    }

    // This week: last receipt such that nextExpected is within [today, today+7]
    for (const sub of thisWeekTargets) {
      const daysUntil = randInt(0, 6)
      const targetNext = addDays(today, daysUntil)
      const receiptDate = lastReceiptForTarget(targetNext, sub.cadence)

      await db.issueReceipt.create({
        data: {
          magazineId: sub.magazineId,
          branchId: sub.branchId,
          receivedById: pick(users).id,
          receivedDate: receiptDate,
          notes: null,
        },
      })
      receiptCount++
    }

    // Recent: last receipt 1-3 weeks ago (shows as "upcoming" on dashboard)
    for (const sub of recentTargets) {
      const daysAgo = randInt(3, 14)
      const receiptDate = subDays(today, daysAgo)

      await db.issueReceipt.create({
        data: {
          magazineId: sub.magazineId,
          branchId: sub.branchId,
          receivedById: pick(users).id,
          receivedDate: receiptDate,
          notes: null,
        },
      })
      receiptCount++
    }

    console.log(`    ${code}: ${overdueTargets.length} overdue, ${thisWeekTargets.length} this-week, ${recentTargets.length} upcoming`)
  }

  console.log(`  Total receipts: ${receiptCount}\n`)

  // Verify non-English receipt counts
  for (const lang of ['Gujarati', 'Hindi', 'Tamil', 'Telugu']) {
    const langMagIds = Array.from(magazineIndex.entries())
      .filter(([, v]) => v.language === lang)
      .map(([, v]) => v.id)
    const langReceipts = await db.issueReceipt.count({
      where: { magazineId: { in: langMagIds } },
    })
    console.log(`  ${lang}: ${langReceipts} receipts`)
  }

  // ---- Step 6: Transfers ----

  // Use all magazine IDs (excluding never-received) for transfer variety
  const transferMagIds = Array.from(magazineIndex.entries())
    .filter(([name]) => skipProbability(name) < 1.0)
    .map(([, v]) => v.id)

  // All four branches participate in transfers
  const transferBranchIds = branchIds

  let transferCount = 0

  /**
   * Creates a transfer record between two random branches.
   * @param status - Transfer lifecycle status
   * @param daysAgo - How many days ago the transfer was initiated
   */
  async function createTransfer(
    status: 'COMPLETED' | 'PENDING' | 'CANCELLED',
    daysAgo: number,
  ): Promise<void> {
    const magazineId = pick(transferMagIds)
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

  console.log('\nGenerating transfers...')

  // 10 COMPLETED transfers spread across last 90 days
  for (let i = 0; i < 10; i++) {
    await createTransfer('COMPLETED', randInt(5, 90))
  }

  // 4 PENDING transfers (recent) — ensures 2+ pending per branch on average
  // We create extras involving each branch to guarantee coverage
  for (let i = 0; i < 4; i++) {
    await createTransfer('PENDING', randInt(1, 14))
  }

  // Ensure each branch has at least 2 pending transfers (as from or to)
  // Create targeted pending transfers for branches that may be underserved
  for (const code of branchCodes) {
    const branchId = branchMap.get(code)!
    // Create 1 pending FROM this branch and 1 pending TO this branch
    const otherBranches = transferBranchIds.filter((id) => id !== branchId)

    const mag1 = pick(transferMagIds)
    await db.transfer.create({
      data: {
        magazineId: mag1,
        fromBranchId: branchId,
        toBranchId: pick(otherBranches),
        quantity: randInt(1, 2),
        status: 'PENDING',
        initiatedById: pick(users).id,
        createdAt: subDays(today, randInt(1, 7)),
      },
    })
    transferCount++

    const mag2 = pick(transferMagIds)
    await db.transfer.create({
      data: {
        magazineId: mag2,
        fromBranchId: pick(otherBranches),
        toBranchId: branchId,
        quantity: randInt(1, 2),
        status: 'PENDING',
        initiatedById: pick(users).id,
        createdAt: subDays(today, randInt(1, 7)),
      },
    })
    transferCount++
  }

  // 3 CANCELLED transfers
  for (let i = 0; i < 3; i++) {
    await createTransfer('CANCELLED', randInt(10, 60))
  }

  console.log(`Created ${transferCount} transfers (${transferCount - 3} pending/completed, 3 cancelled)\n`)

  // ---- Summary ----

  const totalReceipts = await db.issueReceipt.count()
  const totalTransfers = await db.transfer.count()
  const pendingTransfers = await db.transfer.count({ where: { status: 'PENDING' } })
  const completedTransfers = await db.transfer.count({ where: { status: 'COMPLETED' } })
  const cancelledTransfers = await db.transfer.count({ where: { status: 'CANCELLED' } })

  console.log('=== Test Seed Complete ===')
  console.log(`  Receipts:   ${totalReceipts}`)
  console.log(`  Transfers:  ${totalTransfers} (${pendingTransfers} pending, ${completedTransfers} completed, ${cancelledTransfers} cancelled)`)
  console.log(`  Magazines:  ${magCount}`)
  console.log(`  Subs:       ${subCount}`)
  console.log(`  Users:      admin@library.org / admin1234, staff@library.org / staff1234`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
