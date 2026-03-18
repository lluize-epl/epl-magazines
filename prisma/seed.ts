import bcrypt from 'bcrypt'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient } from '../generated/prisma/client'

const adapter = new PrismaBetterSqlite3({ url: process.env['DATABASE_URL']! })
const db = new PrismaClient({ adapter })

async function main() {
  console.log('Seeding database...')

  // Create admin user
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

  // Create staff user
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

  // Create sample magazines
  const magazines = [
    { name: 'The Economist', cadence: 'WEEKLY' as const, notes: 'International edition' },
    { name: 'Time Magazine', cadence: 'WEEKLY' as const },
    { name: 'National Geographic', cadence: 'MONTHLY' as const, notes: 'With maps supplement' },
    { name: 'Scientific American', cadence: 'MONTHLY' as const },
    { name: 'The New Yorker', cadence: 'WEEKLY' as const },
    { name: 'Consumer Reports', cadence: 'MONTHLY' as const },
    { name: 'Nature', cadence: 'WEEKLY' as const, notes: 'Academic journal' },
    { name: 'Wired', cadence: 'MONTHLY' as const },
  ]

  for (const mag of magazines) {
    const created = await db.magazine.upsert({
      where: { id: mag.name },
      update: {},
      create: mag,
    }).catch(() => db.magazine.create({ data: mag }))

    // Add some sample receipts
    const receiptCount = Math.floor(Math.random() * 3)
    for (let i = receiptCount; i >= 0; i--) {
      const daysAgo = i * (mag.cadence === 'WEEKLY' ? 7 : 30) + Math.floor(Math.random() * 3)
      const receivedDate = new Date()
      receivedDate.setDate(receivedDate.getDate() - daysAgo)

      await db.issueReceipt.create({
        data: {
          magazineId: created.id,
          receivedById: Math.random() > 0.5 ? admin.id : staff.id,
          receivedDate,
          notes: i === 0 ? null : 'Received in good condition',
        },
      }).catch(() => {})
    }
  }

  console.log('✓ Seed complete')
  console.log('  Admin: admin@library.org / admin1234')
  console.log('  Staff: staff@library.org / staff1234')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
