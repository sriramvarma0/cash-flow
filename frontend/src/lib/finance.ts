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

/**
 * Resolves the user-contextual tracking ID for a transaction.
 * For transfers:
 * - If current user is recipient (incoming): uses 'TI' prefix + 8-digit alphanumeric body
 * - If current user is sender (outgoing): uses 'TE' prefix + 8-digit alphanumeric body
 * For other transactions:
 * - Uses the native tracking ID (E..., I..., PB..., PS...)
 */
export function getDisplayTrackingId(expense: Expense, currentUserId?: string): string {
  if (!expense || !expense.id) return '';
  if (expense.transactionType === 'TRANSFER') {
    const isRecipient = currentUserId && expense.toUserId === currentUserId;
    if (isRecipient) {
      if (expense.id.startsWith('TE')) {
        return 'TI' + expense.id.slice(2);
      }
      if (expense.id.startsWith('T') && !expense.id.startsWith('TI')) {
        return 'TI' + expense.id.slice(1);
      }
      return expense.id.startsWith('TI') ? expense.id : `TI${expense.id}`;
    }
    // Outgoing transfer (sender)
    if (expense.id.startsWith('TI')) {
      return 'TE' + expense.id.slice(2);
    }
    if (expense.id.startsWith('T') && !expense.id.startsWith('TE')) {
      return 'TE' + expense.id.slice(1);
    }
    return expense.id.startsWith('TE') ? expense.id : `TE${expense.id}`;
  }
  return expense.id;
}

export type DateFilterType = 'current_month' | 'calendar_year' | 'financial_year' | 'custom' | 'all';

export interface DateRange {
  start: Date | null;
  end: Date | null;
  label: string;
  shortLabel: string;
}

export function getDateFilterRange(
  type: DateFilterType,
  customStart?: string,
  customEnd?: string,
  referenceDate: Date = new Date()
): DateRange {
  const refYear = referenceDate.getFullYear();
  const refMonth = referenceDate.getMonth(); // 0-indexed (0 = Jan, 8 = Sep)

  if (type === 'current_month') {
    const start = new Date(refYear, refMonth, 1, 0, 0, 0, 0);
    const end = new Date(refYear, refMonth + 1, 0, 23, 59, 59, 999);
    const monthName = referenceDate.toLocaleString('default', { month: 'long', year: 'numeric' });
    const shortMonth = referenceDate.toLocaleString('default', { month: 'short', year: 'numeric' });
    return {
      start,
      end,
      label: `Current Month (${monthName})`,
      shortLabel: shortMonth
    };
  }

  if (type === 'calendar_year') {
    const start = new Date(refYear, 0, 1, 0, 0, 0, 0);
    const end = new Date(refYear, 11, 31, 23, 59, 59, 999);
    return {
      start,
      end,
      label: `Calendar Year ${refYear}`,
      shortLabel: `CY ${refYear}`
    };
  }

  if (type === 'financial_year') {
    // Financial year in India: Apr 1 - Mar 31
    const isAfterOrInApril = refMonth >= 3; // Month index 3 is April
    const startYear = isAfterOrInApril ? refYear : refYear - 1;
    const endYear = startYear + 1;
    const start = new Date(startYear, 3, 1, 0, 0, 0, 0); // Apr 1
    const end = new Date(endYear, 2, 31, 23, 59, 59, 999); // Mar 31
    const shortLabel = `FY ${startYear}-${String(endYear).slice(-2)}`;
    return {
      start,
      end,
      label: `Financial Year (${shortLabel})`,
      shortLabel
    };
  }

  if (type === 'custom') {
    let start: Date | null = null;
    let end: Date | null = null;

    if (customStart) {
      const [sy, sm, sd] = customStart.split('-').map(Number);
      if (!isNaN(sy) && !isNaN(sm) && !isNaN(sd)) {
        start = new Date(sy, sm - 1, sd, 0, 0, 0, 0);
      }
    }

    if (customEnd) {
      const [ey, em, ed] = customEnd.split('-').map(Number);
      if (!isNaN(ey) && !isNaN(em) && !isNaN(ed)) {
        end = new Date(ey, em - 1, ed, 23, 59, 59, 999);
      }
    }

    let label = 'Custom Range';
    let shortLabel = 'Custom';

    if (start && end) {
      const sStr = start.toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' });
      const eStr = end.toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' });
      label = `${sStr} - ${eStr}`;
      shortLabel = `${start.toLocaleDateString('default', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('default', { month: 'short', day: 'numeric' })}`;
    } else if (start) {
      const sStr = start.toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' });
      label = `From ${sStr}`;
      shortLabel = `From ${sStr}`;
    } else if (end) {
      const eStr = end.toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' });
      label = `Until ${eStr}`;
      shortLabel = `Until ${eStr}`;
    }

    return {
      start,
      end,
      label,
      shortLabel
    };
  }

  // 'all'
  return {
    start: null,
    end: null,
    label: 'All Time',
    shortLabel: 'All Time'
  };
}

export function filterExpensesByDateRange(
  expenses: Expense[],
  range: { start: Date | null; end: Date | null }
): Expense[] {
  return expenses.filter((e) => {
    if (!e.date) return false;
    const expDate = new Date(e.date);
    if (isNaN(expDate.getTime())) return false;
    if (range.start && expDate < range.start) return false;
    if (range.end && expDate > range.end) return false;
    return true;
  });
}

export interface TrendChartPoint {
  date: string;
  amount: number;
}

export function generateSpendingTrend(
  expenses: Expense[],
  filterType: DateFilterType,
  range: DateRange,
  referenceDate: Date = new Date()
): { data: TrendChartPoint[]; title: string; subtitle: string } {
  // Only include EXPENSE transactions for spending trends
  const expenseList = expenses.filter((e) => !e.transactionType || e.transactionType === 'EXPENSE');

  if (filterType === 'current_month') {
    const targetYear = (range.start || referenceDate).getFullYear();
    const targetMonth = (range.start || referenceDate).getMonth();
    const daysInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
    const monthShort = (range.start || referenceDate).toLocaleString('default', { month: 'short' });

    const dailyTotals: Record<number, number> = {};
    expenseList.forEach((e) => {
      const d = new Date(e.date);
      if (d.getFullYear() === targetYear && d.getMonth() === targetMonth) {
        const day = d.getDate();
        dailyTotals[day] = (dailyTotals[day] || 0) + e.amount;
      }
    });

    const data: TrendChartPoint[] = [];
    for (let day = 1; day <= daysInMonth; day++) {
      data.push({
        date: `${monthShort} ${day}`,
        amount: Number((dailyTotals[day] || 0).toFixed(2))
      });
    }

    return {
      data,
      title: 'Spending trend',
      subtitle: `Daily spending for ${range.label}`
    };
  }

  if (filterType === 'calendar_year') {
    const targetYear = (range.start || referenceDate).getFullYear();
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlyTotals: Record<number, number> = {};

    expenseList.forEach((e) => {
      const d = new Date(e.date);
      if (d.getFullYear() === targetYear) {
        const m = d.getMonth();
        monthlyTotals[m] = (monthlyTotals[m] || 0) + e.amount;
      }
    });

    const data: TrendChartPoint[] = monthNames.map((name, idx) => ({
      date: name,
      amount: Number((monthlyTotals[idx] || 0).toFixed(2))
    }));

    return {
      data,
      title: 'Spending trend',
      subtitle: `Monthly spending across Calendar Year ${targetYear}`
    };
  }

  if (filterType === 'financial_year') {
    const startYear = range.start ? range.start.getFullYear() : referenceDate.getFullYear();
    const endYear = range.end ? range.end.getFullYear() : startYear + 1;

    const fyMonths = [
      { name: 'Apr', month: 3, year: startYear },
      { name: 'May', month: 4, year: startYear },
      { name: 'Jun', month: 5, year: startYear },
      { name: 'Jul', month: 6, year: startYear },
      { name: 'Aug', month: 7, year: startYear },
      { name: 'Sep', month: 8, year: startYear },
      { name: 'Oct', month: 9, year: startYear },
      { name: 'Nov', month: 10, year: startYear },
      { name: 'Dec', month: 11, year: startYear },
      { name: 'Jan', month: 0, year: endYear },
      { name: 'Feb', month: 1, year: endYear },
      { name: 'Mar', month: 2, year: endYear }
    ];

    const totals: Record<string, number> = {};
    expenseList.forEach((e) => {
      const d = new Date(e.date);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      totals[key] = (totals[key] || 0) + e.amount;
    });

    const data: TrendChartPoint[] = fyMonths.map((item) => {
      const key = `${item.year}-${item.month}`;
      return {
        date: item.name,
        amount: Number((totals[key] || 0).toFixed(2))
      };
    });

    return {
      data,
      title: 'Spending trend',
      subtitle: `Monthly spending for Financial Year (${range.shortLabel})`
    };
  }

  if (filterType === 'custom') {
    if (!range.start && !range.end) {
      return generateSpendingTrend(expenses, 'all', range, referenceDate);
    }

    const start = range.start || new Date(2020, 0, 1);
    const end = range.end || new Date();
    const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays <= 45 && diffDays >= 0) {
      const data: TrendChartPoint[] = [];
      const current = new Date(start);
      const dailyMap: Record<string, number> = {};

      expenseList.forEach((e) => {
        const d = new Date(e.date);
        const k = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        dailyMap[k] = (dailyMap[k] || 0) + e.amount;
      });

      while (current <= end) {
        const k = `${current.getFullYear()}-${current.getMonth()}-${current.getDate()}`;
        const label = current.toLocaleDateString('default', { month: 'short', day: 'numeric' });
        data.push({
          date: label,
          amount: Number((dailyMap[k] || 0).toFixed(2))
        });
        current.setDate(current.getDate() + 1);
      }

      return {
        data,
        title: 'Spending trend',
        subtitle: `Daily spending trend for custom range (${range.shortLabel})`
      };
    } else {
      const data: TrendChartPoint[] = [];
      const current = new Date(start.getFullYear(), start.getMonth(), 1);
      const monthEnd = new Date(end.getFullYear(), end.getMonth(), 1);
      const monthlyMap: Record<string, number> = {};

      expenseList.forEach((e) => {
        const d = new Date(e.date);
        const k = `${d.getFullYear()}-${d.getMonth()}`;
        monthlyMap[k] = (monthlyMap[k] || 0) + e.amount;
      });

      while (current <= monthEnd) {
        const k = `${current.getFullYear()}-${current.getMonth()}`;
        const label = current.toLocaleDateString('default', { month: 'short', year: '2-digit' });
        data.push({
          date: label,
          amount: Number((monthlyMap[k] || 0).toFixed(2))
        });
        current.setMonth(current.getMonth() + 1);
      }

      return {
        data,
        title: 'Spending trend',
        subtitle: `Monthly spending trend for custom range (${range.shortLabel})`
      };
    }
  }

  // 'all'
  if (expenseList.length === 0) {
    return {
      data: [],
      title: 'Spending trend',
      subtitle: 'All-time spending trend'
    };
  }

  const dates = expenseList.map((e) => new Date(e.date).getTime()).filter((t) => !isNaN(t));
  const minDate = new Date(Math.min(...dates));
  const maxDate = new Date(Math.max(...dates));

  const current = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  const endMonth = new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);
  const monthlyMap: Record<string, number> = {};

  expenseList.forEach((e) => {
    const d = new Date(e.date);
    const k = `${d.getFullYear()}-${d.getMonth()}`;
    monthlyMap[k] = (monthlyMap[k] || 0) + e.amount;
  });

  const data: TrendChartPoint[] = [];
  while (current <= endMonth) {
    const k = `${current.getFullYear()}-${current.getMonth()}`;
    const label = current.toLocaleDateString('default', { month: 'short', year: '2-digit' });
    data.push({
      date: label,
      amount: Number((monthlyMap[k] || 0).toFixed(2))
    });
    current.setMonth(current.getMonth() + 1);
  }

  return {
    data,
    title: 'Spending trend',
    subtitle: 'All-time monthly spending trend'
  };
}

