import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as path from 'path';
import { ExpensesService } from '../src/expenses/expenses.service';

process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  `file:${path.resolve(__dirname, '../../data/dev.db')}`;

const prisma = new PrismaClient();
const expensesService = new ExpensesService(prisma as any);

function isReceivableExpense(expense: any): boolean {
  return Boolean(
    expense.isReceivable === true ||
    expense.transactionType === 'RECEIVABLE' ||
    expense.id?.startsWith('R')
  );
}

function getNetExpenseAmount(expense: { amount: number; transactionType?: string | null; reimbursedAmount?: number | null; isReceivable?: boolean | null }): number {
  if (expense.transactionType === 'INCOME' || expense.transactionType === 'TRANSFER') {
    return 0;
  }
  if (isReceivableExpense(expense)) {
    const reimbursed = expense.reimbursedAmount ?? 0;
    return Math.max(0, expense.amount - reimbursed);
  }
  return expense.amount;
}

function totalExpenses(expenses: any[]) {
  return expenses
    .filter((e) => !e.transactionType || e.transactionType === 'EXPENSE' || isReceivableExpense(e))
    .reduce((sum, expense) => sum + getNetExpenseAmount(expense), 0);
}

async function runReceivableTests() {
  console.log('================================================================');
  console.log('   RECEIVABLE & RECOVERABLE EXPENSE FEATURE VERIFICATION SUITE  ');
  console.log('================================================================\n');

  let testUser: any = null;

  try {
    const ts = Date.now();
    const passwordHash = await bcrypt.hash('TestPassword123!', 10);
    testUser = await prisma.user.create({
      data: {
        id: '20' + Math.floor(10000000 + Math.random() * 90000000).toString(),
        name: 'Receivable Test User',
        email: `receivable_user_${ts}@test.com`,
        phoneNumber: '+9199' + Math.floor(10000000 + Math.random() * 90000000).toString(),
        passwordHash
      }
    });
    console.log(`[PASS] Created test user: ${testUser.name} (${testUser.id})`);

    // TEST 1: Create a normal expense and a receivable expense
    console.log('\n--- TEST 1: Create Receivable Transaction & Verify R Prefix ---');
    const normalExpense = await expensesService.create(testUser.id, {
      amount: 1000,
      category: 'Grocery',
      description: 'Weekly groceries',
      paymentMethod: 'Card',
      date: new Date().toISOString(),
      transactionType: 'EXPENSE'
    });
    console.log(`[PASS] Normal expense created with ID: ${normalExpense.id}`);
    if (!normalExpense.id.startsWith('E')) {
      throw new Error(`Expected normal expense ID to start with 'E', got: ${normalExpense.id}`);
    }

    const receivableExpense = await expensesService.create(testUser.id, {
      amount: 2000,
      category: 'Receivable',
      description: 'Lent money to colleague for lunch & transport',
      paymentMethod: 'UPI',
      date: new Date().toISOString(),
      transactionType: 'EXPENSE',
      isReceivable: true
    });
    console.log(`[PASS] Receivable transaction created with ID: ${receivableExpense.id}`);
    if (!receivableExpense.id.startsWith('R')) {
      throw new Error(`Expected receivable ID to start with 'R', got: ${receivableExpense.id}`);
    }
    if (receivableExpense.transactionType !== 'EXPENSE') {
      throw new Error(`Expected receivable transactionType to be 'EXPENSE', got: ${receivableExpense.transactionType}`);
    }
    if (receivableExpense.isReceivable !== true) {
      throw new Error(`Expected receivable isReceivable to be true, got: ${receivableExpense.isReceivable}`);
    }
    console.log(`[PASS] Verified receivable transactionType = 'EXPENSE' and isReceivable = true`);

    if (receivableExpense.receivableStatus !== 'OUTSTANDING') {
      throw new Error(`Expected initial receivableStatus to be 'OUTSTANDING', got: ${receivableExpense.receivableStatus}`);
    }
    if ((receivableExpense.reimbursedAmount || 0) !== 0) {
      throw new Error(`Expected initial reimbursedAmount to be 0, got: ${receivableExpense.reimbursedAmount}`);
    }
    console.log('[PASS] Initial receivable state verified: OUTSTANDING with reimbursedAmount = 0');

    // TEST 2: Net Expense Contribution when OUTSTANDING
    console.log('\n--- TEST 2: Net Expense Contribution when OUTSTANDING ---');
    const allExpensesInitial = [normalExpense, receivableExpense];
    const initialNetTotal = totalExpenses(allExpensesInitial);
    console.log(`Initial expenses net total: ₹${initialNetTotal}`);
    // Normal (1000) + Outstanding Receivable (2000) = 3000
    if (initialNetTotal !== 3000) {
      throw new Error(`Expected initial net total to be 3000, got ${initialNetTotal}`);
    }
    console.log('[PASS] Outstanding receivable counts 100% (₹2000) as an expense');

    // TEST 3: Partial Repayment (PARTIALLY_SETTLED)
    console.log('\n--- TEST 3: Partial Repayment (PARTIALLY_SETTLED) ---');
    const partiallySettled = await expensesService.update(testUser.id, receivableExpense.id, {
      receivableStatus: 'PARTIALLY_SETTLED',
      reimbursedAmount: 800
    });
    console.log(`[PASS] Updated receivable with ₹800 reimbursement:`);
    console.log(`       Status: ${partiallySettled.receivableStatus}, Reimbursed: ₹${partiallySettled.reimbursedAmount}`);

    const allExpensesPartial = [normalExpense, partiallySettled];
    const partialNetTotal = totalExpenses(allExpensesPartial);
    console.log(`Partial expenses net total: ₹${partialNetTotal}`);
    // Normal (1000) + Unreimbursed (2000 - 800 = 1200) = 2200
    if (partialNetTotal !== 2200) {
      throw new Error(`Expected partial net total to be 2200, got ${partialNetTotal}`);
    }
    console.log('[PASS] Only unreimbursed amount (₹1200) counts as an expense during partial repayment');

    // TEST 4: Full Repayment / Settlement (SETTLED)
    console.log('\n--- TEST 4: Full Settlement (SETTLED) ---');
    const fullySettled = await expensesService.update(testUser.id, receivableExpense.id, {
      receivableStatus: 'SETTLED',
      reimbursedAmount: 2000
    });
    console.log(`[PASS] Settled receivable with full ₹2000 reimbursement:`);
    console.log(`       Status: ${fullySettled.receivableStatus}, Reimbursed: ₹${fullySettled.reimbursedAmount}`);

    const allExpensesSettled = [normalExpense, fullySettled];
    const settledNetTotal = totalExpenses(allExpensesSettled);
    console.log(`Settled expenses net total: ₹${settledNetTotal}`);
    // Normal (1000) + Settled Receivable (0 net) = 1000
    if (settledNetTotal !== 1000) {
      throw new Error(`Expected settled net total to be 1000, got ${settledNetTotal}`);
    }
    console.log('[PASS] Reimbursed amount is completely excluded from net expenses when SETTLED');

    // TEST 5: Verify History Preservation
    console.log('\n--- TEST 5: History Preservation ---');
    const fetchedRecord = await prisma.expense.findUnique({
      where: { id: receivableExpense.id }
    });
    if (!fetchedRecord) {
      throw new Error('Record not found in database');
    }
    if (fetchedRecord.amount !== 2000) {
      throw new Error(`Expected original amount 2000 to be preserved, got ${fetchedRecord.amount}`);
    }
    console.log(`[PASS] Transaction record is preserved in database with original amount: ₹${fetchedRecord.amount}`);

    console.log('\n================================================================');
    console.log('   ALL RECEIVABLE SPECIFICATION TESTS PASSED SUCCESSFULLY! ✅   ');
    console.log('================================================================\n');
  } finally {
    if (testUser) {
      await prisma.expense.deleteMany({ where: { userId: testUser.id } });
      await prisma.user.delete({ where: { id: testUser.id } }).catch(() => {});
    }
    await prisma.$disconnect();
  }
}

runReceivableTests().catch((err) => {
  console.error('\n[FAIL] Test suite failed:', err);
  process.exit(1);
});
