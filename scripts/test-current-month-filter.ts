import {
  getDateFilterRange,
  filterExpensesByDateRange,
  parseDateSafe,
  monthlyExpenses,
  getNetExpenseAmount,
  generateSpendingTrend
} from '../frontend/src/lib/finance';
import { Expense } from '../frontend/src/lib/types';

function createMockExpense(partial: Partial<Expense> & { id: string; amount: number; date: string }): Expense {
  return {
    description: 'Test expense',
    category: 'General',
    paymentMethod: 'Card',
    createdAt: new Date().toISOString(),
    userId: 'u1',
    transactionType: 'EXPENSE',
    ...partial
  } as Expense;
}

function runTests() {
  console.log('================================================================');
  console.log('   CURRENT MONTH FILTERING & EDGE-CASE VERIFICATION SUITE       ');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`[PASS] ${msg}`);
      passed++;
    } else {
      console.error(`[FAIL] ${msg}`);
      failed++;
    }
  }

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonthIdx = now.getMonth(); // 0-indexed
  const daysInCurrentMonth = new Date(currentYear, currentMonthIdx + 1, 0).getDate();

  // Test 1: getDateFilterRange('current_month') produces exact boundaries
  const range = getDateFilterRange('current_month');
  assert(range.start !== null && range.end !== null, 'Start and End dates are non-null');
  assert(range.start!.getFullYear() === currentYear, `Start year is ${currentYear}`);
  assert(range.start!.getMonth() === currentMonthIdx, `Start month index is ${currentMonthIdx}`);
  assert(range.start!.getDate() === 1, 'Start day is 1st of month');
  assert(range.start!.getHours() === 0 && range.start!.getMinutes() === 0, 'Start time is 00:00:00');

  assert(range.end!.getFullYear() === currentYear, `End year is ${currentYear}`);
  assert(range.end!.getMonth() === currentMonthIdx, `End month index is ${currentMonthIdx}`);
  assert(range.end!.getDate() === daysInCurrentMonth, `End day is ${daysInCurrentMonth}`);
  assert(range.end!.getHours() === 23 && range.end!.getMinutes() === 59, 'End time is 23:59:59');

  // Test 2: parseDateSafe handles date-only, local datetime, and ISO correctly
  const dOnly = parseDateSafe(`${currentYear}-${String(currentMonthIdx + 1).padStart(2, '0')}-01`);
  assert(dOnly.getFullYear() === currentYear && dOnly.getMonth() === currentMonthIdx && dOnly.getDate() === 1, 'Date-only string parses to correct year, month, day');

  const dLocal = parseDateSafe(`${currentYear}-${String(currentMonthIdx + 1).padStart(2, '0')}-15T14:30`);
  assert(dLocal.getHours() === 14 && dLocal.getMinutes() === 30, 'Local datetime-local string parses accurately');

  // Test 3: filterExpensesByDateRange inclusion/exclusion
  const curMonthStr = String(currentMonthIdx + 1).padStart(2, '0');

  const testExpenses: Expense[] = [
    // 1. Boundary: First second of current month
    createMockExpense({
      id: 'E1',
      amount: 100,
      category: 'Food',
      date: new Date(currentYear, currentMonthIdx, 1, 0, 0, 0, 0).toISOString()
    }),
    // 2. Middle of current month
    createMockExpense({
      id: 'E2',
      amount: 250,
      category: 'Fuel',
      date: `${currentYear}-${curMonthStr}-15T12:00:00`
    }),
    // 3. Boundary: Last second of current month
    createMockExpense({
      id: 'E3',
      amount: 500,
      category: 'Grocery',
      date: new Date(currentYear, currentMonthIdx, daysInCurrentMonth, 23, 59, 59, 999).toISOString()
    }),
    // 4. Outside: Last second of previous month
    createMockExpense({
      id: 'E_PREV',
      amount: 999,
      category: 'Old',
      date: new Date(currentYear, currentMonthIdx, 0, 23, 59, 59, 999).toISOString()
    }),
    // 5. Outside: First second of next month
    createMockExpense({
      id: 'E_NEXT',
      amount: 888,
      category: 'Future',
      date: new Date(currentYear, currentMonthIdx + 1, 1, 0, 0, 0, 0).toISOString()
    }),
    // 6. Current month receivable (outstanding)
    createMockExpense({
      id: 'R_OUT',
      amount: 1000,
      category: 'Lent to Alice',
      date: `${currentYear}-${curMonthStr}-10T10:00:00`,
      isReceivable: true,
      receivableStatus: 'OUTSTANDING',
      reimbursedAmount: 0
    }),
    // 7. Current month receivable (partially settled)
    createMockExpense({
      id: 'R_PART',
      amount: 1000,
      category: 'Lent to Bob',
      date: `${currentYear}-${curMonthStr}-12T10:00:00`,
      isReceivable: true,
      receivableStatus: 'PARTIALLY_SETTLED',
      reimbursedAmount: 400
    }),
    // 8. Current month receivable (fully settled)
    createMockExpense({
      id: 'R_SETTLED',
      amount: 1000,
      category: 'Lent to Charlie',
      date: `${currentYear}-${curMonthStr}-14T10:00:00`,
      isReceivable: true,
      receivableStatus: 'SETTLED',
      reimbursedAmount: 1000
    })
  ];

  const filtered = filterExpensesByDateRange(testExpenses, range);
  assert(filtered.length === 6, `Filtered count is exactly 6 (excluded previous and next month)`);
  assert(filtered.some((e) => e.id === 'E1'), 'Includes first day of month (E1)');
  assert(filtered.some((e) => e.id === 'E2'), 'Includes middle day of month (E2)');
  assert(filtered.some((e) => e.id === 'E3'), 'Includes last day of month (E3)');
  assert(!filtered.some((e) => e.id === 'E_PREV'), 'Excludes previous month expense (E_PREV)');
  assert(!filtered.some((e) => e.id === 'E_NEXT'), 'Excludes next month expense (E_NEXT)');

  // Test 4: Monthly net expense sum in current month
  const monthlySum = monthlyExpenses(filtered);
  // Expected:
  // E1 = 100
  // E2 = 250
  // E3 = 500
  // R_OUT = 1000
  // R_PART = 600 (1000 - 400)
  // R_SETTLED = 0 (1000 - 1000)
  // Total = 100 + 250 + 500 + 1000 + 600 + 0 = 2450
  assert(monthlySum === 2450, `Monthly net expense sum is 2450 (got ${monthlySum})`);

  // Test 5: generateSpendingTrend for current month
  const trend = generateSpendingTrend(filtered, 'current_month', range);
  assert(trend.data.length === daysInCurrentMonth, `Spending trend has data for all ${daysInCurrentMonth} days of current month`);
  const trendSum = trend.data.reduce((s, d) => s + d.amount, 0);
  assert(trendSum === 2450, `Spending trend daily total sum equals monthly sum (2450)`);

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
