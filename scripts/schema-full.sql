-- ==============================================================================
-- CashFlow Cloudflare D1 Full Target Schema DDL
-- Derived directly from backend/prisma/schema.prisma and validated against data/dev.db
-- Compatible with Cloudflare D1 (SQLite engine)
-- Safe for execution on empty databases and idempotent via IF NOT EXISTS
-- ==============================================================================

-- 1. User Table (includes all authentication, 2FA, and lockout fields)
CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorSecret" TEXT,
    "twoFactorTempSecret" TEXT,
    "twoFactorRecoveryCodes" TEXT,
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockoutUntil" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Group Table (includes adminIds JSON array)
CREATE TABLE IF NOT EXISTS "Group" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ownerId" TEXT NOT NULL,
    "adminIds" TEXT NOT NULL DEFAULT '[]',
    CONSTRAINT "Group_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 3. Invitation Table
CREATE TABLE IF NOT EXISTS "Invitation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT NOT NULL,
    "inviteeEmail" TEXT,
    "inviteePhone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Invitation_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 4. Tag Table
CREATE TABLE IF NOT EXISTS "Tag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "Tag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 5. Expense Table (includes transactionType, toUserId for transfers, categoryType)
CREATE TABLE IF NOT EXISTS "Expense" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "amount" REAL NOT NULL,
    "category" TEXT,
    "description" TEXT,
    "paymentMethod" TEXT NOT NULL DEFAULT 'Card',
    "paymentAccount" TEXT,
    "date" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "transactionType" TEXT NOT NULL DEFAULT 'EXPENSE',
    "toUserId" TEXT,
    "categoryType" TEXT,
    "isReceivable" BOOLEAN NOT NULL DEFAULT false,
    "receivableStatus" TEXT DEFAULT 'OUTSTANDING',
    "reimbursedAmount" REAL DEFAULT 0,
    CONSTRAINT "Expense_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Expense_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- 6. Investment Table
CREATE TABLE IF NOT EXISTS "Investment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "units" REAL NOT NULL,
    "buyPrice" REAL NOT NULL,
    "currentPrice" REAL NOT NULL,
    "color" TEXT NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Investment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 7. InvestmentTransaction Table (complete table with relationships to Investment and User)
CREATE TABLE IF NOT EXISTS "InvestmentTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL DEFAULT 'BUY',
    "units" REAL NOT NULL,
    "price" REAL NOT NULL,
    "amount" REAL NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "investmentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InvestmentTransaction_investmentId_fkey" FOREIGN KEY ("investmentId") REFERENCES "Investment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InvestmentTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 8. Many-to-Many Join Table: Expense <-> Tag
CREATE TABLE IF NOT EXISTS "_ExpenseToTag" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_ExpenseToTag_A_fkey" FOREIGN KEY ("A") REFERENCES "Expense" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_ExpenseToTag_B_fkey" FOREIGN KEY ("B") REFERENCES "Tag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 9. Many-to-Many Join Table: Group <-> Members (User)
CREATE TABLE IF NOT EXISTS "_GroupMembers" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_GroupMembers_A_fkey" FOREIGN KEY ("A") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_GroupMembers_B_fkey" FOREIGN KEY ("B") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 10. Prisma CLI Migration History Tracking Table
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "checksum" TEXT NOT NULL,
    "finished_at" DATETIME,
    "migration_name" TEXT NOT NULL,
    "logs" TEXT,
    "rolled_back_at" DATETIME,
    "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applied_steps_count" INTEGER UNSIGNED NOT NULL DEFAULT 0
);

-- ==============================================================================
-- Indexes and Unique Constraints
-- ==============================================================================

-- User Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "User_phoneNumber_key" ON "User"("phoneNumber");

-- Group Indexes
-- (Primary key on id is automatically indexed)

-- Invitation Indexes
CREATE INDEX IF NOT EXISTS "Invitation_inviteeEmail_idx" ON "Invitation"("inviteeEmail");
CREATE INDEX IF NOT EXISTS "Invitation_inviteePhone_idx" ON "Invitation"("inviteePhone");

-- Tag Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "Tag_name_userId_key" ON "Tag"("name", "userId");

-- Expense Indexes
CREATE INDEX IF NOT EXISTS "Expense_userId_date_idx" ON "Expense"("userId", "date");
CREATE INDEX IF NOT EXISTS "Expense_userId_category_idx" ON "Expense"("userId", "category");
CREATE INDEX IF NOT EXISTS "Expense_userId_categoryType_idx" ON "Expense"("userId", "categoryType");
CREATE INDEX IF NOT EXISTS "Expense_userId_transactionType_idx" ON "Expense"("userId", "transactionType");
CREATE INDEX IF NOT EXISTS "Expense_userId_isReceivable_idx" ON "Expense"("userId", "isReceivable");

-- Investment Indexes
CREATE INDEX IF NOT EXISTS "Investment_userId_idx" ON "Investment"("userId");

-- InvestmentTransaction Indexes
CREATE INDEX IF NOT EXISTS "InvestmentTransaction_investmentId_idx" ON "InvestmentTransaction"("investmentId");
CREATE INDEX IF NOT EXISTS "InvestmentTransaction_userId_idx" ON "InvestmentTransaction"("userId");

-- Join Table Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "_ExpenseToTag_AB_unique" ON "_ExpenseToTag"("A", "B");
CREATE INDEX IF NOT EXISTS "_ExpenseToTag_B_index" ON "_ExpenseToTag"("B");

-- Group Member Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "_GroupMembers_AB_unique" ON "_GroupMembers"("A", "B");
CREATE INDEX IF NOT EXISTS "_GroupMembers_B_index" ON "_GroupMembers"("B");
