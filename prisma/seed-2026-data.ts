import 'dotenv/config'
import bcrypt from 'bcrypt'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient } from '../generated/prisma/client'

const adapter = new PrismaBetterSqlite3({ url: process.env['DATABASE_URL']! })
const db = new PrismaClient({ adapter })

type Cadence = 'WEEKLY' | 'BI_WEEKLY' | 'MONTHLY' | 'BI_MONTHLY' | 'SEASONAL' | 'YEARLY'

interface MagSeed {
  name: string
  cadence: Cadence
  language?: string
  notes?: string
  issuesPerYear: number
  vendor: 'EBSCO' | 'WTCOX'
  branches: { code: string; qty: number }[]
}

function b(s: string): { code: string; qty: number }[] {
  return s.split(',').map((part) => {
    const match = part.match(/^(\w+)\((\d+)\)$/)
    if (match) return { code: match[1], qty: parseInt(match[2], 10) }
    return { code: part, qty: 1 }
  })
}

const BRANCH_MAP: Record<string, string> = {
  ML: 'MAIN', NE: 'NORTH', CB: 'CB', MO: 'MOBILE',
}

const BRANCHES = [
  { name: 'Main Library', code: 'MAIN' },
  { name: 'North Edison Branch Library', code: 'NORTH' },
  { name: 'Clara Barton Branch Library', code: 'CB' },
  { name: 'Bookmobile', code: 'MOBILE' },
]

const TRAINING_OMISSIONS = new Set([
  'Practical Homeschooling',
  'VegNews Magazine',
  'Runners World - US',
  'Out',
  'Cosmopolitan',
  'Saras Salil (Tamil Edition)',
  'Saras Salil (Telugu Edition)',
])

const EBSCO: MagSeed[] = [
  // Qty 1 — Main Library only
  { name: 'AARP Bulletin', cadence: 'MONTHLY', issuesPerYear: 10, notes: 'Membership Title', vendor: 'EBSCO', branches: b('ML') },
  { name: 'AARP The Magazine', cadence: 'BI_MONTHLY', issuesPerYear: 6, notes: 'Membership Title', vendor: 'EBSCO', branches: b('ML') },
  { name: 'AllRecipes Magazine', cadence: 'SEASONAL', issuesPerYear: 5, vendor: 'EBSCO', branches: b('ML') },
  { name: 'Consumer Reports Buying Guide', cadence: 'YEARLY', issuesPerYear: 1, notes: 'Membership Title', vendor: 'EBSCO', branches: b('ML') },
  { name: 'Elle - American ed', cadence: 'MONTHLY', issuesPerYear: 9, vendor: 'EBSCO', branches: b('ML') },
  { name: 'Food & Wine', cadence: 'MONTHLY', issuesPerYear: 11, vendor: 'EBSCO', branches: b('ML') },
  { name: 'Inc 500', cadence: 'YEARLY', issuesPerYear: 1, notes: 'Membership Title', vendor: 'EBSCO', branches: b('ML') },
  { name: 'Library Journal', cadence: 'MONTHLY', issuesPerYear: 12, vendor: 'EBSCO', branches: b('ML') },
  { name: 'Magnolia Journal', cadence: 'SEASONAL', issuesPerYear: 4, vendor: 'EBSCO', branches: b('ML') },
  { name: 'Publishers Weekly', cadence: 'WEEKLY', issuesPerYear: 48, vendor: 'EBSCO', branches: b('ML') },
  { name: 'School Library Journal', cadence: 'MONTHLY', issuesPerYear: 12, vendor: 'EBSCO', branches: b('ML') },
  { name: 'Series Made Simple', cadence: 'YEARLY', issuesPerYear: 1, notes: 'Membership Title', vendor: 'EBSCO', branches: b('ML') },

  // Qty 2 — Main Library + North Edison
  { name: 'Ananda Vikatan - India', cadence: 'WEEKLY', issuesPerYear: 52, language: 'Tamil', notes: 'Standing Order', vendor: 'EBSCO', branches: b('ML,NE') },
  { name: 'Architectural Digest', cadence: 'MONTHLY', issuesPerYear: 11, vendor: 'EBSCO', branches: b('ML,NE') },
  { name: 'Artists Magazine', cadence: 'BI_MONTHLY', issuesPerYear: 6, vendor: 'EBSCO', branches: b('ML,NE') },
  { name: 'Astronomy', cadence: 'MONTHLY', issuesPerYear: 12, vendor: 'EBSCO', branches: b('ML,NE') },
  { name: 'Car and Driver', cadence: 'BI_MONTHLY', issuesPerYear: 6, notes: 'Membership Title', vendor: 'EBSCO', branches: b('ML,NE') },
  { name: 'China Today - Chinese ed', cadence: 'MONTHLY', issuesPerYear: 12, language: 'Chinese', vendor: 'EBSCO', branches: b('ML,NE') },
  { name: 'Country Living', cadence: 'BI_MONTHLY', issuesPerYear: 6, vendor: 'EBSCO', branches: b('ML,NE') },
  { name: 'Entrepreneur', cadence: 'BI_MONTHLY', issuesPerYear: 6, vendor: 'EBSCO', branches: b('ML,NE') },
  { name: 'Esquire', cadence: 'BI_MONTHLY', issuesPerYear: 6, vendor: 'EBSCO', branches: b('ML,NE') },
  { name: 'Fortune - Domestic Ed', cadence: 'BI_MONTHLY', issuesPerYear: 6, vendor: 'EBSCO', branches: b('ML,NE') },
  { name: 'Golf Digest', cadence: 'MONTHLY', issuesPerYear: 11, vendor: 'EBSCO', branches: b('ML,NE') },
  { name: 'Harpers Bazaar', cadence: 'MONTHLY', issuesPerYear: 9, vendor: 'EBSCO', branches: b('ML,NE') },
  { name: 'Harvard Health Letter', cadence: 'MONTHLY', issuesPerYear: 12, vendor: 'EBSCO', branches: b('ML,NE') },
  { name: 'Hockey News - Canada', cadence: 'MONTHLY', issuesPerYear: 14, vendor: 'EBSCO', branches: b('ML,NE') },
  { name: 'Out', cadence: 'BI_MONTHLY', issuesPerYear: 6, vendor: 'EBSCO', branches: b('ML,NE') },
  { name: 'Pastel Journal', cadence: 'SEASONAL', issuesPerYear: 4, vendor: 'EBSCO', branches: b('ML,NE') },
  { name: 'Poetry', cadence: 'MONTHLY', issuesPerYear: 10, vendor: 'EBSCO', branches: b('ML,NE') },
  { name: 'Poets & Writers Magazine', cadence: 'BI_MONTHLY', issuesPerYear: 6, vendor: 'EBSCO', branches: b('ML,NE') },
  { name: 'Psychology Today', cadence: 'BI_MONTHLY', issuesPerYear: 6, vendor: 'EBSCO', branches: b('ML,NE') },
  { name: 'Runners World - US', cadence: 'SEASONAL', issuesPerYear: 4, vendor: 'EBSCO', branches: b('ML,NE') },
  { name: 'Scientific American - NY', cadence: 'MONTHLY', issuesPerYear: 10, vendor: 'EBSCO', branches: b('ML,NE') },
  { name: 'Scout Life', cadence: 'MONTHLY', issuesPerYear: 10, vendor: 'EBSCO', branches: b('ML,NE') },
  { name: 'Threads', cadence: 'SEASONAL', issuesPerYear: 4, vendor: 'EBSCO', branches: b('ML,NE') },
  { name: 'Town & Country', cadence: 'MONTHLY', issuesPerYear: 9, vendor: 'EBSCO', branches: b('ML,NE') },
  { name: 'Travel & Leisure', cadence: 'MONTHLY', issuesPerYear: 11, vendor: 'EBSCO', branches: b('ML,NE') },
  { name: 'Vanity Fair - American ed', cadence: 'MONTHLY', issuesPerYear: 12, vendor: 'EBSCO', branches: b('ML,NE') },
  { name: 'Veranda', cadence: 'BI_MONTHLY', issuesPerYear: 6, vendor: 'EBSCO', branches: b('ML,NE') },

  // Qty 3 — Main Library + North Edison + Clara Barton
  { name: 'Atlantic', cadence: 'MONTHLY', issuesPerYear: 12, vendor: 'EBSCO', branches: b('ML,NE,CB') },
  { name: 'Babybug', cadence: 'BI_MONTHLY', issuesPerYear: 6, vendor: 'EBSCO', branches: b('ML,NE,CB,MO(2)') },
  { name: 'Better Homes and Gardens', cadence: 'MONTHLY', issuesPerYear: 10, vendor: 'EBSCO', branches: b('ML,NE,CB,MO') },
  { name: 'Chirp', cadence: 'MONTHLY', issuesPerYear: 10, vendor: 'EBSCO', branches: b('ML,NE,CB,MO(2)') },
  { name: 'Consumer Reports', cadence: 'MONTHLY', issuesPerYear: 13, vendor: 'EBSCO', branches: b('ML,NE,CB,MO') },
  { name: 'Cooks Illustrated', cadence: 'BI_MONTHLY', issuesPerYear: 6, vendor: 'EBSCO', branches: b('ML,NE,CB') },
  { name: 'Cosmopolitan', cadence: 'SEASONAL', issuesPerYear: 4, vendor: 'EBSCO', branches: b('ML,NE,CB') },
  { name: 'Crossword Puzzles Only', cadence: 'MONTHLY', issuesPerYear: 13, vendor: 'EBSCO', branches: b('ML,NE,CB,MO') },
  { name: 'Discover', cadence: 'SEASONAL', issuesPerYear: 4, vendor: 'EBSCO', branches: b('ML,NE,CB') },
  { name: 'Family Handyman', cadence: 'MONTHLY', issuesPerYear: 7, vendor: 'EBSCO', branches: b('ML,NE,CB') },
  { name: 'Family Tree Magazine', cadence: 'BI_MONTHLY', issuesPerYear: 6, vendor: 'EBSCO', branches: b('ML,NE,CB') },
  { name: 'Fine Gardening', cadence: 'SEASONAL', issuesPerYear: 4, vendor: 'EBSCO', branches: b('ML,NE,CB') },
  { name: 'Food Network Magazine', cadence: 'BI_MONTHLY', issuesPerYear: 6, vendor: 'EBSCO', branches: b('ML,NE,CB,MO') },
  { name: 'Forbes', cadence: 'BI_MONTHLY', issuesPerYear: 8, vendor: 'EBSCO', branches: b('ML,NE,CB,MO') },
  { name: 'Fun for Kidz', cadence: 'BI_MONTHLY', issuesPerYear: 6, vendor: 'EBSCO', branches: b('ML,NE,CB,MO(2)') },
  { name: 'Good Housekeeping', cadence: 'BI_MONTHLY', issuesPerYear: 6, vendor: 'EBSCO', branches: b('ML,NE,CB,MO') },
  { name: 'GQ - US Ed', cadence: 'BI_MONTHLY', issuesPerYear: 8, vendor: 'EBSCO', branches: b('ML,NE,CB') },
  { name: 'Harvard Business Review', cadence: 'MONTHLY', issuesPerYear: 12, vendor: 'EBSCO', branches: b('ML,NE,CB') },
  { name: 'HGTV Magazine', cadence: 'BI_MONTHLY', issuesPerYear: 6, vendor: 'EBSCO', branches: b('ML,NE,CB,MO') },
  { name: 'Highlights for Children', cadence: 'MONTHLY', issuesPerYear: 12, vendor: 'EBSCO', branches: b('ML,NE,CB,MO(2)') },
  { name: 'Highlights High Five', cadence: 'MONTHLY', issuesPerYear: 12, vendor: 'EBSCO', branches: b('ML,NE,CB') },
  { name: 'Home & Design Magazine', cadence: 'BI_MONTHLY', issuesPerYear: 6, vendor: 'EBSCO', branches: b('ML,NE,CB') },
  { name: 'House Beautiful', cadence: 'BI_MONTHLY', issuesPerYear: 6, vendor: 'EBSCO', branches: b('ML,NE,CB') },
  { name: 'Humpty Dumpty Magazine', cadence: 'BI_MONTHLY', issuesPerYear: 6, vendor: 'EBSCO', branches: b('ML,NE,CB,MO(2)') },
  { name: 'INC', cadence: 'SEASONAL', issuesPerYear: 4, notes: 'Membership Title', vendor: 'EBSCO', branches: b('ML,NE,CB') },
  { name: 'Kiplingers Personal Finance', cadence: 'MONTHLY', issuesPerYear: 12, vendor: 'EBSCO', branches: b('ML,NE,CB,MO') },
  { name: 'Ladybug', cadence: 'BI_MONTHLY', issuesPerYear: 6, vendor: 'EBSCO', branches: b('ML,NE,CB,MO(2)') },
  { name: 'Mens Health - PA', cadence: 'SEASONAL', issuesPerYear: 4, vendor: 'EBSCO', branches: b('ML,NE,CB') },
  { name: 'Mother Earth News', cadence: 'BI_MONTHLY', issuesPerYear: 6, vendor: 'EBSCO', branches: b('ML,NE,CB') },
  { name: 'National Geographic', cadence: 'MONTHLY', issuesPerYear: 12, vendor: 'EBSCO', branches: b('ML,NE,CB') },
  { name: 'National Geographic History', cadence: 'BI_MONTHLY', issuesPerYear: 6, vendor: 'EBSCO', branches: b('ML,NE,CB') },
  { name: 'National Geographic Kids', cadence: 'MONTHLY', issuesPerYear: 10, vendor: 'EBSCO', branches: b('ML,NE,CB,MO(2)') },
  { name: 'National Geographic Little Kids', cadence: 'BI_MONTHLY', issuesPerYear: 6, vendor: 'EBSCO', branches: b('ML,NE,CB') },
  { name: 'New Jersey Monthly', cadence: 'MONTHLY', issuesPerYear: 11, vendor: 'EBSCO', branches: b('ML,NE,CB') },
  { name: 'New York', cadence: 'BI_WEEKLY', issuesPerYear: 26, vendor: 'EBSCO', branches: b('ML,NE,CB') },
  { name: 'New Yorker', cadence: 'WEEKLY', issuesPerYear: 47, vendor: 'EBSCO', branches: b('ML,NE,CB') },
  { name: 'People', cadence: 'WEEKLY', issuesPerYear: 48, vendor: 'EBSCO', branches: b('ML,NE,CB,MO') },
  { name: 'Pioneer Woman', cadence: 'SEASONAL', issuesPerYear: 4, vendor: 'EBSCO', branches: b('ML,NE,CB') },
  { name: 'Popular Mechanics - English ed', cadence: 'BI_MONTHLY', issuesPerYear: 6, vendor: 'EBSCO', branches: b('ML,NE,CB') },
  { name: 'Practical Homeschooling', cadence: 'SEASONAL', issuesPerYear: 4, vendor: 'EBSCO', branches: b('ML,NE,CB,MO') },
  { name: 'Prevention - PA', cadence: 'MONTHLY', issuesPerYear: 12, vendor: 'EBSCO', branches: b('ML,NE,CB,MO') },
  { name: 'Ranger Rick - American ed', cadence: 'MONTHLY', issuesPerYear: 10, vendor: 'EBSCO', branches: b('ML,NE,CB') },
  { name: 'Ranger Rick Jr', cadence: 'MONTHLY', issuesPerYear: 10, vendor: 'EBSCO', branches: b('ML,NE,CB') },
  { name: 'Readers Digest - US ed', cadence: 'BI_MONTHLY', issuesPerYear: 8, vendor: 'EBSCO', branches: b('ML,NE,CB,MO') },
  { name: 'Readers Digest - Large Print for Easier Reading', cadence: 'BI_MONTHLY', issuesPerYear: 8, vendor: 'EBSCO', branches: b('ML,NE,CB') },
  { name: 'Real Simple', cadence: 'BI_MONTHLY', issuesPerYear: 6, vendor: 'EBSCO', branches: b('ML,NE,CB') },
  { name: 'Science News', cadence: 'MONTHLY', issuesPerYear: 12, vendor: 'EBSCO', branches: b('ML,NE,CB') },
  { name: 'Smithsonian', cadence: 'MONTHLY', issuesPerYear: 12, notes: 'Membership Title', vendor: 'EBSCO', branches: b('ML,NE,CB') },
  { name: 'Spider', cadence: 'BI_MONTHLY', issuesPerYear: 6, vendor: 'EBSCO', branches: b('ML,NE,CB,MO(2)') },
  { name: 'Sports Illustrated', cadence: 'MONTHLY', issuesPerYear: 12, vendor: 'EBSCO', branches: b('ML,NE,CB,MO') },
  { name: 'Sports Illustrated for Kids', cadence: 'BI_MONTHLY', issuesPerYear: 6, vendor: 'EBSCO', branches: b('ML,NE,CB,MO(2)') },
  { name: 'Taste of Home', cadence: 'SEASONAL', issuesPerYear: 4, vendor: 'EBSCO', branches: b('ML,NE,CB') },
  { name: 'TIME Magazine - Domestic ed', cadence: 'WEEKLY', issuesPerYear: 44, vendor: 'EBSCO', branches: b('ML,NE,CB,MO') },
  { name: 'Us Weekly', cadence: 'WEEKLY', issuesPerYear: 52, vendor: 'EBSCO', branches: b('ML,NE,CB') },
  { name: 'VegNews Magazine', cadence: 'SEASONAL', issuesPerYear: 4, vendor: 'EBSCO', branches: b('ML,NE,CB') },
  { name: 'Vogue', cadence: 'MONTHLY', issuesPerYear: 10, vendor: 'EBSCO', branches: b('ML,NE,CB') },
  { name: 'The Week - Us Edition', cadence: 'WEEKLY', issuesPerYear: 52, vendor: 'EBSCO', branches: b('ML,NE,CB') },
  { name: 'Week Junior', cadence: 'WEEKLY', issuesPerYear: 52, vendor: 'EBSCO', branches: b('ML,NE,CB') },
  { name: 'Wired', cadence: 'MONTHLY', issuesPerYear: 12, vendor: 'EBSCO', branches: b('ML,NE,CB') },
  { name: 'Womens Health', cadence: 'SEASONAL', issuesPerYear: 4, vendor: 'EBSCO', branches: b('ML,NE,CB') },
  { name: 'Zoobooks', cadence: 'MONTHLY', issuesPerYear: 9, vendor: 'EBSCO', branches: b('ML,NE,CB,MO(2)') },

  // Qty 4 — All branches
  { name: 'Make: Technology on Your Time', cadence: 'SEASONAL', issuesPerYear: 4, vendor: 'EBSCO', branches: b('ML,NE,CB,MO') },

  // Economist — 4 separate subs
  { name: 'Economist', cadence: 'WEEKLY', issuesPerYear: 50, vendor: 'EBSCO', branches: b('ML,NE,CB,MO') },
]

const WTCOX: MagSeed[] = [
  // Qty 3 — ML + NE + CB
  { name: 'Champak (Gujarati Edition)', cadence: 'BI_WEEKLY', issuesPerYear: 24, language: 'Gujarati', vendor: 'WTCOX', branches: b('ML,NE,CB') },
  { name: 'Champak (Hindi Edition)', cadence: 'BI_WEEKLY', issuesPerYear: 24, language: 'Hindi', vendor: 'WTCOX', branches: b('ML,NE,CB') },
  { name: 'Champak (Tamil Edition)', cadence: 'MONTHLY', issuesPerYear: 12, language: 'Tamil', vendor: 'WTCOX', branches: b('ML,NE,CB') },
  { name: 'Champak (Telugu Edition)', cadence: 'MONTHLY', issuesPerYear: 12, language: 'Telugu', vendor: 'WTCOX', branches: b('ML,NE,CB') },
  { name: 'Saras Salil (Gujarati Edition)', cadence: 'MONTHLY', issuesPerYear: 12, language: 'Gujarati', vendor: 'WTCOX', branches: b('ML,NE,CB') },
  { name: 'Saras Salil (Hindi Edition)', cadence: 'BI_WEEKLY', issuesPerYear: 24, language: 'Hindi', vendor: 'WTCOX', branches: b('ML,NE,CB') },
  { name: 'Saras Salil (Tamil Edition)', cadence: 'MONTHLY', issuesPerYear: 12, language: 'Tamil', vendor: 'WTCOX', branches: b('ML,NE,CB') },
  { name: 'Saras Salil (Telugu Edition)', cadence: 'MONTHLY', issuesPerYear: 12, language: 'Telugu', vendor: 'WTCOX', branches: b('ML,NE,CB') },
  { name: 'Sarita (Hindi)', cadence: 'BI_WEEKLY', issuesPerYear: 26, language: 'Hindi', vendor: 'WTCOX', branches: b('ML,NE,CB') },
  { name: 'Swati Saparivara Patrika (IND)', cadence: 'WEEKLY', issuesPerYear: 52, language: 'Telugu', vendor: 'WTCOX', branches: b('ML,NE,CB') },

  // Qty 4 — All branches
  { name: 'Chitralekha (Gujarati)', cadence: 'WEEKLY', issuesPerYear: 52, language: 'Gujarati', vendor: 'WTCOX', branches: b('ML,NE,CB,MO') },
  { name: 'GrihShobha (Gujarati)', cadence: 'MONTHLY', issuesPerYear: 12, language: 'Gujarati', vendor: 'WTCOX', branches: b('ML,NE,CB,MO') },
  { name: 'GrihShobha (Hindi)(IND)', cadence: 'BI_WEEKLY', issuesPerYear: 24, language: 'Hindi', vendor: 'WTCOX', branches: b('ML,NE,CB,MO') },
  { name: 'GrihShobha (Tamil)', cadence: 'MONTHLY', issuesPerYear: 12, language: 'Tamil', vendor: 'WTCOX', branches: b('ML,NE,CB,MO') },
  { name: 'GrihShobha (Telugu)', cadence: 'MONTHLY', issuesPerYear: 12, language: 'Telugu', vendor: 'WTCOX', branches: b('ML,NE,CB,MO') },
]

const ALL_MAGAZINES = [...EBSCO, ...WTCOX]

export async function runSeed(training: boolean): Promise<void> {
  const label = training ? 'TRAINING' : 'COMPLETE'
  console.log(`\n🌱 Seeding database (${label} mode)...\n`)

  const magazines = training
    ? ALL_MAGAZINES.filter((m) => !TRAINING_OMISSIONS.has(m.name))
    : ALL_MAGAZINES

  console.log('Resetting database...')
  await db.magazineSubscription.deleteMany()
  await db.issueReceipt.deleteMany()
  await db.transfer.deleteMany()
  await db.branchMagazine.deleteMany()
  await db.magazine.deleteMany()
  await db.subscriptionPeriod.deleteMany()
  await db.branch.deleteMany()
  await db.user.deleteMany()
  console.log('✓ Database reset')

  const adminHash = await bcrypt.hash('magTech', 10)
  await db.user.create({
    data: {
      name: 'Tech Admin',
      username: 'magadmin',
      passwordHash: adminHash,
      role: 'ADMIN',
    },
  })
  console.log('✓ Admin user created (magadmin / magTech)')

  const branchMap = new Map<string, string>()
  for (const branch of BRANCHES) {
    const created = await db.branch.create({ data: branch })
    branchMap.set(branch.code, created.id)
  }
  console.log(`✓ ${BRANCHES.length} branches created`)

  let magCount = 0
  let branchMagCount = 0
  const magazineIds = new Map<string, { id: string; vendor: string }>()

  for (const mag of magazines) {
    const magazine = await db.magazine.create({
      data: {
        name: mag.name,
        cadence: mag.cadence,
        language: mag.language ?? 'English',
        notes: mag.notes ?? null,
      },
    })
    magazineIds.set(mag.name, { id: magazine.id, vendor: mag.vendor })
    magCount++

    for (const branch of mag.branches) {
      const branchCode = BRANCH_MAP[branch.code]
      const branchId = branchMap.get(branchCode)
      if (!branchId) continue
      await db.branchMagazine.create({
        data: { branchId, magazineId: magazine.id, quantity: branch.qty },
      })
      branchMagCount++
    }
  }
  console.log(`✓ ${magCount} magazines created`)
  console.log(`✓ ${branchMagCount} branch-magazine assignments created`)

  const ebscoPeriod = await db.subscriptionPeriod.create({
    data: {
      name: 'Ebsco-26/27',
      startDate: new Date('2026-06-01T12:00:00Z'),
      endDate: new Date('2027-05-31T12:00:00Z'),
      active: false,
    },
  })
  console.log('✓ Subscription period Ebsco-26/27 created (inactive)')

  let wtcoxPeriodId: string | null = null
  if (!training) {
    const wtcoxPeriod = await db.subscriptionPeriod.create({
      data: {
        name: 'Wtcox-26',
        startDate: new Date('2026-01-01T12:00:00Z'),
        endDate: new Date('2026-12-31T12:00:00Z'),
        active: true,
      },
    })
    wtcoxPeriodId = wtcoxPeriod.id
    console.log('✓ Subscription period Wtcox-26 created (active)')
  }

  let subCount = 0
  for (const mag of magazines) {
    const entry = magazineIds.get(mag.name)
    if (!entry) continue

    if (mag.vendor === 'EBSCO') {
      await db.magazineSubscription.create({
        data: {
          magazineId: entry.id,
          periodId: ebscoPeriod.id,
          issuesPerYear: mag.issuesPerYear,
          active: true,
        },
      })
      subCount++
    } else if (mag.vendor === 'WTCOX' && wtcoxPeriodId) {
      await db.magazineSubscription.create({
        data: {
          magazineId: entry.id,
          periodId: wtcoxPeriodId,
          issuesPerYear: mag.issuesPerYear,
          active: true,
        },
      })
      subCount++
    }
  }
  console.log(`✓ ${subCount} magazine subscriptions created`)

  const ebscoCount = magazines.filter((m) => m.vendor === 'EBSCO').length
  const wtcoxCount = magazines.filter((m) => m.vendor === 'WTCOX').length
  console.log(`\n✓ Seed complete (${label})`)
  console.log(`  EBSCO magazines: ${ebscoCount}`)
  console.log(`  WT COX magazines: ${wtcoxCount}${training ? ' (bare records, no period)' : ''}`)
  console.log(`  Branch assignments: ${branchMagCount}`)
  console.log(`  Subscriptions: ${subCount}`)
  if (training) {
    console.log(`  Omitted for training: ${TRAINING_OMISSIONS.size} magazines`)
    console.log(`    ${[...TRAINING_OMISSIONS].join(', ')}`)
  }
  console.log('  Admin: magadmin / magTech')
}

export { db }
