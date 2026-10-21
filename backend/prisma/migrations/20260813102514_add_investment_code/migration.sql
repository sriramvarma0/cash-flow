-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Investment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "units" REAL NOT NULL,
    "buyPrice" REAL NOT NULL,
    "currentPrice" REAL NOT NULL,
    "color" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Investment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Investment" ("buyPrice", "color", "createdAt", "currentPrice", "id", "name", "type", "units", "updatedAt", "userId") SELECT "buyPrice", "color", "createdAt", "currentPrice", "id", "name", "type", "units", "updatedAt", "userId" FROM "Investment";
DROP TABLE "Investment";
ALTER TABLE "new_Investment" RENAME TO "Investment";
CREATE INDEX "Investment_userId_idx" ON "Investment"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
