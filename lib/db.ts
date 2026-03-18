import 'dotenv/config'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient } from '../generated/prisma/client'

/**
 * Prisma client singleton — prevents multiple instances in Next.js dev hot-reload.
 */
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined }

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaBetterSqlite3({ url: process.env['DATABASE_URL']! })
  return new PrismaClient({ adapter })
}

const db: PrismaClient = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

export default db
