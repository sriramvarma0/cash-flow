-- AlterTable
ALTER TABLE "Expense" ADD COLUMN "categoryType" TEXT;

-- CreateIndex
CREATE INDEX "Expense_userId_categoryType_idx" ON "Expense"("userId", "categoryType");
