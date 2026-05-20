import { runSeed, db } from './seed-2026-data.js'

runSeed(true)
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
