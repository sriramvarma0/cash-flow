-- CreateTable: Asset
CREATE TABLE IF NOT EXISTS "Asset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "currentPrice" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex: Asset_code_key
CREATE UNIQUE INDEX IF NOT EXISTS "Asset_code_key" ON "Asset"("code");

-- CreateIndex: Investment_assetId_idx
CREATE INDEX IF NOT EXISTS "Investment_assetId_idx" ON "Investment"("assetId");

-- CreateIndex: Investment_userId_code_key
CREATE UNIQUE INDEX IF NOT EXISTS "Investment_userId_code_key" ON "Investment"("userId", "code");

