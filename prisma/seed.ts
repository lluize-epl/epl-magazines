import 'dotenv/config'
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
  cadence: 'WEEKLY' | 'BI_WEEKLY' | 'MONTHLY' | 'BI_MONTHLY' | 'SEASONAL'
  language?: string
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

async function main() {
  console.log('Seeding database...')

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
  await db.user.upsert({
    where: { email: 'staff@library.org' },
    update: {},
    create: {
      name: 'Jane Smith',
      email: 'staff@library.org',
      passwordHash: staffHash,
      role: 'STAFF',
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
      data: { name: mag.name, cadence: mag.cadence, language: mag.language ?? 'English' },
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

  console.log(`✓ ${magCount} magazines, ${subCount} subscriptions`)
  console.log('✓ Seed complete')
  console.log('  Admin: admin@library.org / admin1234')
  console.log('  Staff: staff@library.org / staff1234')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
