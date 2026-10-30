-- AlterTable: Add paymentAccount, isReceivable, receivableStatus, and reimbursedAmount to Expense
ALTER TABLE "Expense" ADD COLUMN "paymentAccount" TEXT;
ALTER TABLE "Expense" ADD COLUMN "isReceivable" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Expense" ADD COLUMN "receivableStatus" TEXT DEFAULT 'OUTSTANDING';
ALTER TABLE "Expense" ADD COLUMN "reimbursedAmount" REAL DEFAULT 0;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Expense_userId_transactionType_idx" ON "Expense"("userId", "transactionType");
CREATE INDEX IF NOT EXISTS "Expense_userId_isReceivable_idx" ON "Expense"("userId", "isReceivable");
