-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Magazine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "cadence" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'English',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Magazine" ("active", "cadence", "createdAt", "id", "name", "notes", "updatedAt") SELECT "active", "cadence", "createdAt", "id", "name", "notes", "updatedAt" FROM "Magazine";
DROP TABLE "Magazine";
ALTER TABLE "new_Magazine" RENAME TO "Magazine";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
