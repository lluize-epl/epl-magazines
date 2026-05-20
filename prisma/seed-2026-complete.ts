import { runSeed, db } from './seed-2026-data.js'

runSeed(false)
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
