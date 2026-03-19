-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "BranchMagazine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branchId" TEXT NOT NULL,
    "magazineId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BranchMagazine_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BranchMagazine_magazineId_fkey" FOREIGN KEY ("magazineId") REFERENCES "Magazine" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_IssueReceipt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "magazineId" TEXT NOT NULL,
    "receivedById" TEXT NOT NULL,
    "branchId" TEXT,
    "receivedDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IssueReceipt_magazineId_fkey" FOREIGN KEY ("magazineId") REFERENCES "Magazine" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "IssueReceipt_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "IssueReceipt_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_IssueReceipt" ("createdAt", "id", "magazineId", "notes", "receivedById", "receivedDate") SELECT "createdAt", "id", "magazineId", "notes", "receivedById", "receivedDate" FROM "IssueReceipt";
DROP TABLE "IssueReceipt";
ALTER TABLE "new_IssueReceipt" RENAME TO "IssueReceipt";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Branch_code_key" ON "Branch"("code");

-- CreateIndex
CREATE UNIQUE INDEX "BranchMagazine_branchId_magazineId_key" ON "BranchMagazine"("branchId", "magazineId");
