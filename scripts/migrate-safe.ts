import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..')
const DB_PATH = path.join(PROJECT_ROOT, 'prisma', 'dev.db')
const BACKUPS_DIR = path.join(PROJECT_ROOT, 'prisma', 'backups')

/**
 * Copies a file if it exists. Silently skips if the source doesn't exist.
 * @param src - Source file path
 * @param dest - Destination file path
 */
function copyIfExists(src: string, dest: string): void {
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest)
  }
}

/**
 * Creates a timestamped backup of the SQLite database (including WAL/SHM files).
 * @returns The path to the backup file
 */
function backupDatabase(): string {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true })

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = path.join(BACKUPS_DIR, `dev-${timestamp}.db`)

  if (!fs.existsSync(DB_PATH)) {
    console.error(`Database not found at ${DB_PATH}`)
    process.exit(1)
  }

  fs.copyFileSync(DB_PATH, backupPath)
  copyIfExists(`${DB_PATH}-wal`, `${backupPath}-wal`)
  copyIfExists(`${DB_PATH}-shm`, `${backupPath}-shm`)

  console.log(`Backup created: ${backupPath}`)
  return backupPath
}

/**
 * Runs `prisma migrate deploy` against the given database file.
 * @param dbPath - Absolute path to the SQLite database file
 * @param label - Label for log messages (e.g. "test copy" or "production")
 */
function runMigrate(dbPath: string, label: string): void {
  console.log(`\nRunning migrations on ${label}...`)
  execSync('npx prisma migrate deploy', {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: `file:${dbPath}`,
    },
  })
  console.log(`Migrations succeeded on ${label}.`)
}

/**
 * Cleans up temporary test database files.
 * @param testPath - Path to the temporary test database
 */
function cleanupTestDb(testPath: string): void {
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    const filePath = `${testPath}${suffix}`
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
  }
}

// --- Main ---

console.log('Safe Migration: backup > test > apply\n')

// Step 1: Backup
const backupPath = backupDatabase()

// Step 2: Test on a copy
const testPath = path.join(BACKUPS_DIR, 'migrate-test-temp.db')
fs.copyFileSync(backupPath, testPath)
copyIfExists(`${backupPath}-wal`, `${testPath}-wal`)
copyIfExists(`${backupPath}-shm`, `${testPath}-shm`)

try {
  runMigrate(testPath, 'test copy')
} catch {
  console.error('\nMigrations FAILED on the test copy. Real database was NOT touched.')
  console.error(`   Backup is at: ${backupPath}`)
  cleanupTestDb(testPath)
  process.exit(1)
}

cleanupTestDb(testPath)

// Step 3: Apply to real DB
try {
  runMigrate(DB_PATH, 'production database')
} catch {
  console.error('\nMigrations FAILED on the production database.')
  console.error(`   Backup is at: ${backupPath}`)
  console.error(`   Restore manually: cp ${backupPath} prisma/dev.db`)
  process.exit(1)
}

console.log('\nSafe migration complete.')
