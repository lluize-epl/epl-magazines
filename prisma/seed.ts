import 'dotenv/config'
import { readFileSync } from 'fs'
import bcrypt from 'bcrypt'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient } from '../generated/prisma/client'

const adapter = new PrismaBetterSqlite3({ url: process.env['DATABASE_URL']! })
const db = new PrismaClient({ adapter })

/**
 * Magazine seed data.
 * Branches: ML = Main Library, NE = North Edison, CB = Clara Barton.
 * Default quantity is 1 per branch unless specified with (N).
 */
interface MagSeed {
  name: string
  cadence: 'WEEKLY' | 'BI_WEEKLY' | 'MONTHLY' | 'BI_MONTHLY' | 'SEASONAL' | 'YEARLY'
  language?: string
  notes?: string
  branches: { code: string; qty: number }[]
}

// Helper: parse branch string like "ML,NE,CB" or "ML(2),NE(2),CB(1)"
function parseBranches(s: string): { code: string; qty: number }[] {
  return s.split(',').map((part) => {
    const match = part.match(/^(\w+)\((\d+)\)$/)
    if (match) return { code: match[1], qty: parseInt(match[2], 10) }
    return { code: part, qty: 1 }
  })
}

// Branch code mapping: spreadsheet abbreviation → DB code
const BRANCH_MAP: Record<string, string> = { ML: 'MAIN', NE: 'NORTH', CB: 'CB', MAIN: 'MAIN', NORTH: 'NORTH' }

const MAGAZINES: MagSeed[] = [
  { name: 'AARP Bulletin', cadence: 'BI_MONTHLY', notes: 'Comes with: American Association of Retired Persons Membership', branches: parseBranches('ML') },
  { name: 'AARP The Magazine', cadence: 'BI_MONTHLY', notes: 'Comes with: American Association of Retired Persons Membership', branches: parseBranches('ML') },
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
  { name: 'Bloomberg Businessweek', cadence: 'WEEKLY', branches: parseBranches('ML,NE,CB') },
  { name: 'Bon Appetit', cadence: 'MONTHLY', branches: parseBranches('ML,NE,CB') },
  { name: 'Car and Driver', cadence: 'MONTHLY', notes: 'Membership Title', branches: parseBranches('ML,NE') },
  { name: 'China Today - Chinese Ed', cadence: 'MONTHLY', branches: parseBranches('ML,NE') },
  { name: 'Chirp', cadence: 'MONTHLY', branches: parseBranches('ML,NE') },
  { name: 'Consumer Reports', cadence: 'MONTHLY', branches: parseBranches('ML(2),NE(2),CB(1)') },
  { name: 'Consumer Reports Buying Guide', cadence: 'YEARLY', notes: 'Comes with: Consumer Reports', branches: parseBranches('ML') },
  { name: 'Consumer Reports on Health', cadence: 'MONTHLY', branches: parseBranches('ML,NE') },
  { name: "Cook's Country", cadence: 'BI_MONTHLY', branches: parseBranches('ML,NE') },
  { name: 'Cooks Illustrated', cadence: 'BI_MONTHLY', branches: parseBranches('ML,NE,CB') },
  { name: 'Cosmopolitan', cadence: 'SEASONAL', branches: parseBranches('ML,NE,CB') },
  { name: 'Country Living', cadence: 'MONTHLY', branches: parseBranches('ML,NE') },
  { name: 'Crossword Puzzles Only', cadence: 'MONTHLY', branches: parseBranches('ML,NE,CB') },
  { name: 'Discover', cadence: 'BI_MONTHLY', branches: parseBranches('ML,NE,CB') },
  { name: 'Economist', cadence: 'WEEKLY', branches: parseBranches('ML,NE,CB') },
  { name: 'Elle - American Ed', cadence: 'MONTHLY', branches: parseBranches('ML') },
  { name: 'Elle Decor', cadence: 'MONTHLY', branches: parseBranches('ML,NE') },
  { name: 'Entrepreneur', cadence: 'MONTHLY', branches: parseBranches('ML,NE') },
  { name: 'Esquire', cadence: 'BI_MONTHLY', branches: parseBranches('ML,NE') },
  { name: 'Essence', cadence: 'BI_MONTHLY', branches: parseBranches('ML,NE') },
  { name: 'Family Handyman', cadence: 'MONTHLY', branches: parseBranches('ML,NE,CB') },
  { name: 'Family Tree Magazine', cadence: 'BI_MONTHLY', branches: parseBranches('ML,NE,CB') },
  { name: 'Fine Gardening', cadence: 'SEASONAL', branches: parseBranches('ML,NE,CB') },
  { name: 'First for Women', cadence: 'BI_WEEKLY', branches: parseBranches('ML,NE,CB') },
  { name: 'Food Network Magazine', cadence: 'BI_MONTHLY', branches: parseBranches('ML,NE,CB') },
  { name: 'Food & Wine', cadence: 'MONTHLY', branches: parseBranches('ML') },
  { name: 'Forbes', cadence: 'BI_MONTHLY', branches: parseBranches('ML,NE,CB') },
  { name: 'Fortune - Domestic Ed', cadence: 'MONTHLY', branches: parseBranches('ML,NE') },
  { name: 'Fun for Kidz', cadence: 'BI_MONTHLY', branches: parseBranches('ML,NE') },
  { name: 'Golf Digest', cadence: 'MONTHLY', branches: parseBranches('ML,NE') },
  { name: 'Good Housekeeping', cadence: 'MONTHLY', branches: parseBranches('ML,NE,CB') },
  { name: 'GQ - US Edition', cadence: 'BI_MONTHLY', branches: parseBranches('ML,NE,CB') },
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
  { name: 'Inc', cadence: 'BI_MONTHLY', branches: parseBranches('ML,NE') },
  { name: 'Inc 500', cadence: 'YEARLY', notes: 'Comes with: Inc (special issue)', branches: parseBranches('ML') },
  { name: 'Kiplingers Personal Finance', cadence: 'MONTHLY', branches: parseBranches('ML,NE,CB') },
  { name: 'Ladybug', cadence: 'MONTHLY', branches: parseBranches('ML,NE,CB') },
  { name: 'Library Journal', cadence: 'MONTHLY', branches: parseBranches('ML') },
  { name: 'Magnolia Journal', cadence: 'SEASONAL', branches: parseBranches('ML') },
  { name: 'Make', cadence: 'SEASONAL', branches: parseBranches('ML,NE,CB') },
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
  { name: 'Pastel Journal', cadence: 'SEASONAL', branches: parseBranches('ML,NE') },
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
  { name: 'Readers Digest - US Ed', cadence: 'BI_MONTHLY', branches: parseBranches('ML,NE,CB') },
  { name: 'Readers Digest - Large Print', cadence: 'BI_MONTHLY', branches: parseBranches('ML,NE,CB') },
  { name: 'Real Simple', cadence: 'MONTHLY', branches: parseBranches('ML,NE,CB') },
  { name: 'Runners World', cadence: 'SEASONAL', branches: parseBranches('ML,NE') },
  { name: 'School Library Journal', cadence: 'MONTHLY', branches: parseBranches('ML') },
  { name: 'Science News', cadence: 'BI_WEEKLY', branches: parseBranches('ML,NE,CB') },
  { name: 'Scientific American', cadence: 'MONTHLY', branches: parseBranches('ML,NE') },
  { name: 'Scout Life', cadence: 'MONTHLY', branches: parseBranches('ML,NE') },
  { name: 'Series Made Simple', cadence: 'YEARLY', notes: 'Comes with: School Library Journal', branches: parseBranches('ML') },
  { name: 'Smithsonian', cadence: 'MONTHLY', notes: 'Membership Title', branches: parseBranches('ML,NE,CB') },
  { name: 'Spider', cadence: 'MONTHLY', branches: parseBranches('ML,NE') },
  { name: 'Sports Illustrated', cadence: 'MONTHLY', branches: parseBranches('ML,NE,CB') },
  { name: 'Sports Illustrated Kids', cadence: 'MONTHLY', branches: parseBranches('ML,NE,CB') },
  { name: 'Superman', cadence: 'MONTHLY', branches: parseBranches('ML,NE') },
  { name: 'Taste of Home', cadence: 'SEASONAL', branches: parseBranches('ML,NE,CB') },
  { name: 'Threads', cadence: 'SEASONAL', branches: parseBranches('ML,NE') },
  { name: 'Time Magazine', cadence: 'WEEKLY', branches: parseBranches('ML,NE,CB') },
  { name: 'Town & Country', cadence: 'MONTHLY', branches: parseBranches('ML,NE') },
  { name: 'Travel & Leisure', cadence: 'MONTHLY', branches: parseBranches('ML,NE') },
  { name: 'US Weekly', cadence: 'WEEKLY', branches: parseBranches('ML,NE,CB') },
  { name: 'Vanity Fair - American Ed', cadence: 'MONTHLY', branches: parseBranches('ML,NE') },
  { name: 'VegNews Magazine', cadence: 'SEASONAL', branches: parseBranches('ML,NE,CB') },
  { name: 'Veranda', cadence: 'BI_MONTHLY', branches: parseBranches('ML,NE') },
  { name: 'Vogue', cadence: 'MONTHLY', branches: parseBranches('ML,NE,CB') },
  { name: 'The Week - US Edition', cadence: 'WEEKLY', branches: parseBranches('ML,NE,CB') },
  { name: 'The Week Junior', cadence: 'WEEKLY', branches: parseBranches('ML,NE,CB') },
  { name: 'Wired', cadence: 'MONTHLY', branches: parseBranches('ML,NE,CB') },
  { name: 'Womens Health', cadence: 'SEASONAL', branches: parseBranches('ML,NE,CB') },
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

/** Receipt record from seed-receipts.json */
interface ReceiptRecord {
  magazine: string
  branch: string
  date: string
  notes: string | null
}

async function main() {
  console.log('Seeding database...')

  // Users — single admin for initial deployment
  const adminHash = await bcrypt.hash('magTech', 10)
  const admin = await db.user.upsert({
    where: { username: 'magadmin' },
    update: {},
    create: {
      name: 'Tech Admin',
      username: 'magadmin',
      passwordHash: adminHash,
      role: 'ADMIN',
    },
  })

  // Branches
  const branchData = [
    { name: 'Main Library', code: 'MAIN' },
    { name: 'North Edison Branch Library', code: 'NORTH' },
    { name: 'Clara Barton Branch Library', code: 'CB' },
    { name: 'Bookmobile', code: 'MOBILE' },
  ]
  const branchMap = new Map<string, string>()
  for (const b of branchData) {
    const branch = await db.branch.upsert({
      where: { code: b.code },
      update: { name: b.name },
      create: b,
    })
    branchMap.set(b.code, branch.id)
    console.log(`  Branch: ${b.name} (${b.code})`)
  }
  console.log(`✓ ${branchData.length} branches created`)

  // Magazines + subscriptions
  let magCount = 0
  let subCount = 0
  for (const mag of MAGAZINES) {
    const existing = await db.magazine.findFirst({ where: { name: mag.name } })
    const magazine = existing ?? await db.magazine.create({
      data: {
        name: mag.name,
        cadence: mag.cadence,
        language: mag.language ?? 'English',
        notes: mag.notes ?? null,
      },
    })
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
      subCount++
    }
  }

  console.log(`✓ ${magCount} magazines, ${subCount} branch subscriptions`)

  // EBSCO invoice data — issues per year (keys must match seed MAGAZINES names exactly)
  const EBSCO_ISSUES: Record<string, number> = {
    'AARP Bulletin': 10,
    'AARP The Magazine': 6,
    'All Recipes Magazine': 5,
    'American Association of Retired Persons Membership': 6,
    'Ananda Vikatan': 52,
    'Architectural Digest': 11,
    'Artists Magazine': 6,
    'Ask': 9,
    'Astronomy': 12,
    'Atlantic Monthly': 12,
    'Babybug': 9,
    'Better Homes and Gardens': 10,
    'Bon Appetit': 10,
    'Car and Driver': 6,
    'China Today - Chinese Ed': 12,
    'Chirp': 10,
    'Consumer Reports': 13,
    'Consumer Reports Buying Guide': 1,
    'Cooks Illustrated': 6,
    'Cosmopolitan': 4,
    'Country Living': 6,
    'Crossword Puzzles Only': 13,
    'Discover': 6,
    'Economist': 50,
    'Elle - American Ed': 10,
    'Entrepreneur': 6,
    'Esquire': 6,
    'Essence': 6,
    'Family Handyman': 7,
    'Family Tree Magazine': 6,
    'Fine Gardening': 4,
    'First for Women': 26,
    'Food Network Magazine': 6,
    'Food & Wine': 11,
    'Forbes': 8,
    'Fortune - Domestic Ed': 6,
    'Fun for Kidz': 6,
    'Golf Digest': 11,
    'Good Housekeeping': 6,
    'GQ - US Edition': 8,
    'Harpers Bazaar': 10,
    'Harvard Business Review': 12,
    'Harvard Health Letter': 12,
    'HGTV Magazine': 6,
    'Highlights for Children': 12,
    'Highlights High Five': 12,
    'Hockey News': 14,
    'Home & Design Magazine': 6,
    'House Beautiful': 6,
    'Humpty Dumpty Magazine': 6,
    'Inc': 5,
    'Inc 500': 1,
    'Kiplingers Personal Finance': 12,
    'Ladybug': 9,
    'Library Journal': 12,
    'Magnolia Journal': 4,
    'Make': 4,
    'Mens Health': 6,
    'Mother Earth News': 6,
    'Muse': 9,
    'National Geographic': 12,
    'National Geographic History': 6,
    'National Geographic Kids': 10,
    'National Geographic Little Kids': 6,
    'New Jersey Monthly': 12,
    'New York': 26,
    'New Yorker': 47,
    'Out': 6,
    'Pastel Journal': 4,
    'People': 48,
    'Pioneer Woman': 4,
    'Poetry': 10,
    'Poets & Writers Magazine': 6,
    'Popular Mechanics': 6,
    'Prevention': 12,
    'Psychology Today': 6,
    'Publishers Weekly': 46,
    'Ranger Rick': 10,
    'Ranger Rick Jr': 10,
    'Readers Digest - US Ed': 8,
    'Readers Digest - Large Print': 8,
    'Real Simple': 6,
    'Runners World': 4,
    'School Library Journal': 12,
    'Science News': 12,
    'Scientific American': 12,
    'Scout Life': 10,
    'Series Made Simple': 1,
    'Smithsonian': 12,
    'Spider': 9,
    'Sports Illustrated': 12,
    'Sports Illustrated Kids': 6,
    'Taste of Home': 4,
    'Threads': 4,
    'Time Magazine': 44,
    'Town & Country': 9,
    'Travel & Leisure': 11,
    'US Weekly': 52,
    'Vanity Fair - American Ed': 12,
    'VegNews Magazine': 4,
    'Veranda': 6,
    'Vogue': 10,
    'The Week - US Edition': 52,
    'The Week Junior': 48,
    'Wired': 12,
    'Womens Health': 4,
    'Zoobooks': 9,
  }

  // Cadence-based fallback for magazines not in EBSCO data
  const CADENCE_FALLBACK: Record<string, number> = {
    WEEKLY: 52, BI_WEEKLY: 26, MONTHLY: 12,
    BI_MONTHLY: 6, SEASONAL: 4, YEARLY: 1,
  }

  // Create 2025-2026 subscription period
  const period = await db.subscriptionPeriod.create({
    data: {
      name: '2025-2026',
      startDate: new Date('2025-06-01T12:00:00Z'),
      endDate: new Date('2026-05-31T12:00:00Z'),
      active: true,
    },
  })
  console.log('✓ Subscription period 2025-2026 created')

  // Create MagazineSubscriptions
  let magazineSubscriptionCount = 0
  for (const mag of await db.magazine.findMany({ select: { id: true, name: true, cadence: true } })) {
    const issuesPerYear = EBSCO_ISSUES[mag.name] ?? CADENCE_FALLBACK[mag.cadence]
    if (issuesPerYear) {
      await db.magazineSubscription.create({
        data: {
          magazineId: mag.id,
          periodId: period.id,
          issuesPerYear,
        },
      })
      magazineSubscriptionCount++
    }
  }
  console.log(`✓ ${magazineSubscriptionCount} magazine subscriptions created`)

  // Import historical receipts
  const receiptsPath = new URL('seed-receipts.json', import.meta.url).pathname
  const receiptsRaw = readFileSync(receiptsPath, 'utf-8')
  const receipts = JSON.parse(receiptsRaw) as ReceiptRecord[]

  // Build lookup map
  const magazineByName = new Map<string, string>()
  for (const mag of await db.magazine.findMany({ select: { id: true, name: true } })) {
    magazineByName.set(mag.name, mag.id)
  }

  let receiptCount = 0
  for (const r of receipts) {
    const magazineId = magazineByName.get(r.magazine)
    const dbCode = BRANCH_MAP[r.branch] ?? r.branch
    const bId = branchMap.get(dbCode)
    if (!magazineId || !bId) {
      console.warn(`  Skipping receipt: ${r.magazine} @ ${r.branch} (not found)`)
      continue
    }

    await db.issueReceipt.create({
      data: {
        magazineId,
        branchId: bId,
        receivedById: admin.id,
        receivedDate: new Date(r.date + 'T12:00:00'),
        notes: (r.notes && r.notes.toLowerCase() !== 'x') ? r.notes : null,
      },
    })
    receiptCount++
  }
  console.log(`✓ ${receiptCount} historical receipts imported`)

  console.log('✓ Seed complete')
  console.log('  Admin: magadmin / magTech')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
