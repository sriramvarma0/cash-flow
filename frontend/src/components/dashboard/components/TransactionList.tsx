import { AuthUser, Expense } from '../../../lib/types';
import { formatCurrency } from '../../../lib/finance';

export type TransactionListProps = {
  displayedExpenses: Expense[];
  loading: boolean;
  currentUser: AuthUser | null;
  categoryFilter: string;
  setCategoryFilter: (val: string) => void;
  tagFilter: string;
  setTagFilter: (val: string) => void;
  categoryTypeFilter: string;
  setCategoryTypeFilter: (val: string) => void;
  fromFilter: string;
  setFromFilter: (val: string) => void;
  toFilter: string;
  setToFilter: (val: string) => void;
  onApplyFilters: () => void;
  onEditExpense: (expense: Expense) => void;
  onDeleteExpense: (id: string) => void;
};

function getTransactionTitle(expense: Expense, currentUserId?: string) {
  if (expense.transactionType === 'TRANSFER') {
    if (expense.userId === currentUserId) {
      return `Transfer to ${expense.toUser?.name || 'Unknown'}`;
    } else {
      return `Transfer from ${expense.user?.name || 'Unknown'}`;
    }
  }
  if (expense.transactionType === 'INCOME') {
    return `Income: ${expense.category || 'General'}`;
  }
  return expense.category || 'Expense';
}

function getAmountDisplay(expense: Expense, currentUserId?: string) {
  const formatted = formatCurrency(expense.amount);
  if (expense.transactionType === 'INCOME') {
    return <span className="text-emerald-600 font-bold">+{formatted}</span>;
  }
  if (expense.transactionType === 'TRANSFER') {
    if (expense.userId === currentUserId) {
      return <span className="text-amber-500 font-semibold">-{formatted}</span>;
    } else {
      return <span className="text-amber-500 font-semibold">+{formatted}</span>;
    }
  }
  return <span className="text-red-600 font-bold">-{formatted}</span>;
}

export function TransactionList({
  displayedExpenses,
  loading,
  currentUser,
  categoryFilter,
  setCategoryFilter,
  tagFilter,
  setTagFilter,
  categoryTypeFilter,
  setCategoryTypeFilter,
  fromFilter,
  setFromFilter,
  toFilter,
  setToFilter,
  onApplyFilters,
  onEditExpense,
  onDeleteExpense
}: TransactionListProps) {
  return (
    <div className="space-y-6">
      <div className="cash-card overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-ink-100 p-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-ink-900">Transactions</h2>
            <p className="text-sm text-ink-500">Filter, edit, and remove expenses.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-5">
            <input
              className="cash-input"
              placeholder="Category"
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
            />
            <input
              className="cash-input"
              placeholder="Tag"
              value={tagFilter}
              onChange={(event) => setTagFilter(event.target.value)}
            />
            <select
              className="cash-input text-xs"
              value={categoryTypeFilter}
              onChange={(event) => setCategoryTypeFilter(event.target.value)}
            >
              <option value="">All Category Types</option>
              <option value="ESSENTIALS">Essentials</option>
              <option value="LIFESTYLE">Lifestyle</option>
              <option value="HIGH_VALUE">High-Value</option>
            </select>
            <input
              className="cash-input"
              type="date"
              value={fromFilter}
              onChange={(event) => setFromFilter(event.target.value)}
            />
            <input
              className="cash-input"
              type="date"
              value={toFilter}
              onChange={(event) => setToFilter(event.target.value)}
            />
          </div>
          <button
            className="cash-button-primary self-start sm:self-auto"
            type="button"
            onClick={onApplyFilters}
          >
            Apply filters
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-ink-100 text-left text-sm">
            <thead className="bg-ink-50/80 text-ink-500">
              <tr>
                <th className="px-6 py-4 font-medium">Date & Time</th>
                <th className="px-6 py-4 font-medium">Description</th>
                <th className="px-6 py-4 font-medium">Type</th>
                <th className="px-6 py-4 font-medium">Category</th>
                <th className="px-6 py-4 font-medium">Category Type</th>
                <th className="px-6 py-4 font-medium">Method</th>
                <th className="px-6 py-4 font-medium">Amount</th>
                <th className="px-6 py-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 bg-white">
              {loading ? (
                <tr>
                  <td className="px-6 py-8 text-ink-500" colSpan={8}>
                    Loading transactions...
                  </td>
                </tr>
              ) : displayedExpenses.length === 0 ? (
                <tr>
                  <td className="px-6 py-8 text-ink-500" colSpan={8}>
                    No transactions yet.
                  </td>
                </tr>
              ) : (
                displayedExpenses.map((expense) => (
                  <tr key={expense.id} className="hover:bg-ink-50/70">
                    <td className="px-6 py-4 text-ink-600">
                      {new Date(expense.date).toLocaleString('en-IN', {
                        dateStyle: 'medium',
                        timeStyle: 'short'
                      })}
                    </td>
                    <td className="px-6 py-4 text-ink-600 font-medium">
                      <div>{expense.description ?? '—'}</div>
                      {expense.tags && expense.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {expense.tags.map((t) => (
                            <span
                              key={t.id}
                              className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-brand-50 text-brand-700 border border-brand-100"
                            >
                              {t.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {expense.transactionType === 'INCOME' && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
                          Income
                        </span>
                      )}
                      {expense.transactionType === 'EXPENSE' && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-100">
                          Expense
                        </span>
                      )}
                      {expense.transactionType === 'TRANSFER' && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100">
                          Transfer
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-ink-700">
                      {getTransactionTitle(expense, currentUser?.id)}
                    </td>
                    <td className="px-6 py-4">
                      {expense.categoryType === 'ESSENTIALS' && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-50 text-slate-700 border border-slate-200">
                          Essentials
                        </span>
                      )}
                      {expense.categoryType === 'LIFESTYLE' && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                          Lifestyle
                        </span>
                      )}
                      {expense.categoryType === 'HIGH_VALUE' && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                          High-Value
                        </span>
                      )}
                      {!expense.categoryType && <span className="text-ink-400">—</span>}
                    </td>
                    <td className="px-6 py-4 text-ink-600">{expense.paymentMethod}</td>
                    <td className="px-6 py-4 font-semibold">
                      {getAmountDisplay(expense, currentUser?.id)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        <button
                          className="cash-button-secondary px-3 py-2 text-xs"
                          type="button"
                          onClick={() => onEditExpense(expense)}
                        >
                          Edit
                        </button>
                        <button
                          className="cash-button-secondary px-3 py-2 text-xs text-red-700"
                          type="button"
                          onClick={() => onDeleteExpense(expense.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
