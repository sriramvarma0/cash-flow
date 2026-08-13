import { Expense } from './types';

export function formatCurrency(amount: number) {
  const isNegative = amount < 0;
  const fixedAmount = Math.abs(amount).toFixed(2);
  const [integerPart, decimalPart] = fixedAmount.split('.');

  let lastThree = integerPart.substring(integerPart.length - 3);
  const otherParts = integerPart.substring(0, integerPart.length - 3);
  if (otherParts !== '') {
    lastThree = ',' + lastThree;
  }
  const formattedInteger = otherParts.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + lastThree;

  return `${isNegative ? '-' : ''}₹${formattedInteger}.${decimalPart}`;
}

export function totalExpenses(expenses: Expense[]) {
  return expenses
    .filter((e) => !e.transactionType || e.transactionType === 'EXPENSE')
    .reduce((sum, expense) => sum + expense.amount, 0);
}

export function monthlyExpenses(expenses: Expense[], referenceDate = new Date()) {
  return expenses
    .filter((e) => !e.transactionType || e.transactionType === 'EXPENSE')
    .reduce((sum, expense) => {
      const date = new Date(expense.date);
      const sameMonth =
        date.getFullYear() === referenceDate.getFullYear() &&
        date.getMonth() === referenceDate.getMonth();

      return sameMonth ? sum + expense.amount : sum;
    }, 0);
}

export function categoryBreakdown(expenses: Expense[]) {
  const totals = new Map<string, number>();

  const activeExpenses = expenses.filter(
    (e) => !e.transactionType || e.transactionType === 'EXPENSE'
  );

  for (const expense of activeExpenses) {
    const category = expense.category || 'Uncategorized';
    totals.set(category, (totals.get(category) ?? 0) + expense.amount);
  }

  return Array.from(totals.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((left, right) => right.value - left.value);
}

export function totalIncome(expenses: Expense[]) {
  return expenses
    .filter((e) => e.transactionType === 'INCOME')
    .reduce((sum, expense) => sum + expense.amount, 0);
}

export function transfersSent(expenses: Expense[], currentUserId: string) {
  return expenses
    .filter((e) => e.transactionType === 'TRANSFER' && e.userId === currentUserId)
    .reduce((sum, expense) => sum + expense.amount, 0);
}

export function transfersReceived(expenses: Expense[], currentUserId: string) {
  return expenses
    .filter((e) => e.transactionType === 'TRANSFER' && e.toUserId === currentUserId)
    .reduce((sum, expense) => sum + expense.amount, 0);
}

export function totalOutflow(expenses: Expense[], currentUserId: string) {
  return totalExpenses(expenses) + transfersSent(expenses, currentUserId);
}

