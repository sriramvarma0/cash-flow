import React, { useState, useMemo } from 'react';
import { AuthUser, Expense } from '../../../lib/types';
import { formatCurrency, getDisplayTrackingId, isReceivableExpense } from '../../../lib/finance';

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

export type TxFilterTab = 'ALL' | 'EXPENSE' | 'RECEIVABLE' | 'INCOME' | 'TRANSFER_OUT' | 'TRANSFER_IN' | 'INVESTMENT';

function getTransactionTitle(expense: Expense, currentUserId?: string) {
  if (expense.transactionType === 'TRANSFER') {
    if (expense.userId === currentUserId) {
      return `Transfer to ${expense.toUser?.name || expense.toUser?.email || 'Unknown'}`;
    } else {
      return `Transfer from ${expense.user?.name || expense.user?.email || 'Unknown'}`;
    }
  }
  if (isReceivableExpense(expense)) {
    return expense.category ? `Receivable: ${expense.category}` : 'Receivable: Lent';
  }
  if (expense.transactionType === 'INCOME') {
    return expense.category ? `Income: ${expense.category}` : 'Income: ⚠️ Uncategorized';
  }
  if (expense.transactionType === 'INVESTMENT') {
    return `Investment: ${expense.category || 'Portfolio'}`;
  }
  return expense.category || '⚠️ Uncategorized';
}

function getAmountDisplay(expense: Expense, currentUserId?: string) {
  const formatted = formatCurrency(expense.amount);
  if (expense.transactionType === 'INCOME') {
    return <span className="text-emerald-600 font-bold">+{formatted}</span>;
  }
  if (isReceivableExpense(expense)) {
    const isSettled = expense.receivableStatus === 'SETTLED';
    const isPartial = expense.receivableStatus === 'PARTIALLY_SETTLED';
    const netAmount = Math.max(0, expense.amount - (expense.reimbursedAmount || 0));

    if (isSettled) {
      return (
        <span className="flex flex-col items-end">
          <span className="line-through text-ink-400 font-medium text-xs">{formatted}</span>
          <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Settled (₹0 net)</span>
        </span>
      );
    }
    if (isPartial) {
      return (
        <span className="flex flex-col items-end">
          <span className="text-amber-600 font-bold">-{formatCurrency(netAmount)}</span>
          <span className="text-[10px] text-ink-400 line-through">Orig: {formatted}</span>
        </span>
      );
    }
    return (
      <span className="flex flex-col items-end">
        <span className="text-amber-700 font-bold">-{formatted}</span>
        <span className="text-[10px] text-amber-600 font-medium">Outstanding</span>
      </span>
    );
  }
  if (expense.transactionType === 'TRANSFER') {
    if (expense.userId === currentUserId) {
      return <span className="text-rose-600 font-bold">-{formatted}</span>;
    } else {
      return <span className="text-emerald-600 font-bold">+{formatted}</span>;
    }
  }
  if (expense.transactionType === 'INVESTMENT') {
    return <span className="text-brand-600 font-bold">-{formatted}</span>;
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
  const [activeTab, setActiveTab] = useState<TxFilterTab>('ALL');

  // Filter based on selected bottom tab
  const listToRender = useMemo(() => {
    if (activeTab === 'EXPENSE') {
      return displayedExpenses.filter((e) => (!e.transactionType || e.transactionType === 'EXPENSE') && !isReceivableExpense(e));
    }
    if (activeTab === 'RECEIVABLE') {
      return displayedExpenses.filter(isReceivableExpense);
    }
    if (activeTab === 'INCOME') {
      return displayedExpenses.filter((e) => e.transactionType === 'INCOME');
    }
    if (activeTab === 'TRANSFER_OUT') {
      return displayedExpenses.filter((e) => e.transactionType === 'TRANSFER' && (!currentUser || e.userId === currentUser.id));
    }
    if (activeTab === 'TRANSFER_IN') {
      return displayedExpenses.filter((e) => e.transactionType === 'TRANSFER' && (currentUser && e.toUserId === currentUser.id));
    }
    if (activeTab === 'INVESTMENT') {
      return displayedExpenses.filter((e) => e.transactionType === 'INVESTMENT');
    }
    return displayedExpenses;
  }, [displayedExpenses, activeTab, currentUser]);

  // Tab counts
  const expenseCount = useMemo(() => displayedExpenses.filter((e) => (!e.transactionType || e.transactionType === 'EXPENSE') && !isReceivableExpense(e)).length, [displayedExpenses]);
  const receivableCount = useMemo(() => displayedExpenses.filter(isReceivableExpense).length, [displayedExpenses]);
  const incomeCount = useMemo(() => displayedExpenses.filter((e) => e.transactionType === 'INCOME').length, [displayedExpenses]);
  const transferOutCount = useMemo(() => displayedExpenses.filter((e) => e.transactionType === 'TRANSFER' && (!currentUser || e.userId === currentUser.id)).length, [displayedExpenses, currentUser]);
  const transferInCount = useMemo(() => displayedExpenses.filter((e) => e.transactionType === 'TRANSFER' && (currentUser && e.toUserId === currentUser.id)).length, [displayedExpenses, currentUser]);
  const investmentCount = useMemo(() => displayedExpenses.filter((e) => e.transactionType === 'INVESTMENT').length, [displayedExpenses]);

  return (
    <div className="space-y-6">
      <div className="cash-card overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-ink-100 p-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-ink-900">Transactions</h2>
            <p className="text-sm text-ink-500">Filter, edit, and inspect all records and transfer tracking IDs.</p>
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
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => {
                const now = new Date();
                const y = now.getFullYear();
                const m = String(now.getMonth() + 1).padStart(2, '0');
                const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
                setFromFilter(`${y}-${m}-01`);
                setToFilter(`${y}-${m}-${String(lastDay).padStart(2, '0')}`);
              }}
              className="text-xs font-semibold px-2.5 py-2 rounded-xl border border-brand-200 bg-brand-50/70 text-brand-800 hover:bg-brand-100 transition shadow-2xs flex items-center gap-1"
              title="Set date range to Current Month"
            >
              <span>📅 Current Month</span>
            </button>
            {(fromFilter || toFilter) && (
              <button
                type="button"
                onClick={() => {
                  setFromFilter('');
                  setToFilter('');
                }}
                className="text-xs font-medium text-ink-500 hover:text-ink-800 underline px-1"
              >
                Clear
              </button>
            )}
            <button
              className="cash-button-primary"
              type="button"
              onClick={onApplyFilters}
            >
              Apply filters
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-ink-100 text-left text-sm">
            <thead className="bg-ink-50/80 text-ink-500">
              <tr>
                <th className="px-6 py-4 font-medium">Tracking ID</th>
                <th className="px-6 py-4 font-medium">Date & Time</th>
                <th className="px-6 py-4 font-medium">Description</th>
                <th className="px-6 py-4 font-medium">Type</th>
                <th className="px-6 py-4 font-medium">Category / Detail</th>
                <th className="px-6 py-4 font-medium">Category Type</th>
                <th className="px-6 py-4 font-medium">Method</th>
                <th className="px-6 py-4 font-medium">Amount</th>
                <th className="px-6 py-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 bg-white">
              {loading ? (
                <tr>
                  <td className="px-6 py-8 text-ink-500" colSpan={9}>
                    Loading transactions...
                  </td>
                </tr>
              ) : listToRender.length === 0 ? (
                <tr>
                  <td className="px-6 py-8 text-ink-500 text-center" colSpan={9}>
                    No transactions found in this view.
                  </td>
                </tr>
              ) : (
                listToRender.map((expense) => {
                  const isTransfer = expense.transactionType === 'TRANSFER';
                  const isOutgoingTransfer = isTransfer && currentUser?.id && expense.userId === currentUser.id;
                  const isIncomingTransfer = isTransfer && currentUser?.id && expense.toUserId === currentUser.id;
                  const displayId = getDisplayTrackingId(expense, currentUser?.id);

                  return (
                    <tr key={expense.id} className="hover:bg-ink-50/70">
                      <td className="px-6 py-4 whitespace-nowrap">
                        {isOutgoingTransfer ? (
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(displayId);
                              alert(`Outgoing Transfer Tracking ID "${displayId}" copied to clipboard!`);
                            }}
                            title="Click to copy Outgoing Transfer Tracking ID (TE + 8 chars)"
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 transition font-mono text-xs font-bold"
                          >
                            <span className="text-[10px] text-amber-600 font-extrabold">↗</span>
                            <span>{displayId}</span>
                            <span className="text-[10px] text-amber-500 opacity-70">📋</span>
                          </button>
                        ) : isIncomingTransfer ? (
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(displayId);
                              alert(`Incoming Transfer Tracking ID "${displayId}" copied to clipboard!`);
                            }}
                            title="Click to copy Incoming Transfer Tracking ID (TI + 8 chars)"
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 transition font-mono text-xs font-bold"
                          >
                            <span className="text-[10px] text-emerald-600 font-extrabold">↙</span>
                            <span>{displayId}</span>
                            <span className="text-[10px] text-emerald-500 opacity-70">📋</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(displayId);
                              alert(`Tracking ID "${displayId}" copied to clipboard!`);
                            }}
                            title="Click to copy Tracking ID"
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-ink-100 hover:bg-brand-50 hover:text-brand-800 border border-ink-200 transition font-mono text-xs font-bold text-ink-800"
                          >
                            <span>{displayId}</span>
                            <span className="text-[10px] text-ink-400 opacity-70">📋</span>
                          </button>
                        )}
                      </td>
                      <td className="px-6 py-4 text-ink-600 whitespace-nowrap">
                        {new Date(expense.date).toLocaleString('en-IN', {
                          dateStyle: 'medium',
                          timeStyle: 'short'
                        })}
                      </td>
                      <td className="px-6 py-4 text-ink-600 font-medium max-w-xs">
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
                      <td className="px-6 py-4 whitespace-nowrap">
                        {isOutgoingTransfer ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
                            ↗ Outgoing (TE)
                          </span>
                        ) : isIncomingTransfer ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
                            ↙ Incoming (TI)
                          </span>
                        ) : isReceivableExpense(expense) ? (
                          expense.receivableStatus === 'SETTLED' ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
                              ✅ Settled (R)
                            </span>
                          ) : expense.receivableStatus === 'PARTIALLY_SETTLED' ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-sky-100 text-sky-900 border border-sky-300">
                              🔄 Partial (R)
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
                              ⏳ Outstanding (R)
                            </span>
                          )
                        ) : expense.transactionType === 'INCOME' ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
                            Income (I)
                          </span>
                        ) : expense.transactionType === 'EXPENSE' || !expense.transactionType ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-100">
                            Expense (E)
                          </span>
                        ) : expense.transactionType === 'INVESTMENT' ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-100">
                            Investment
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100">
                            Transfer
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-ink-700 whitespace-nowrap">
                        {expense.transactionType === 'TRANSFER' ? (
                          <span>{getTransactionTitle(expense, currentUser?.id)}</span>
                        ) : !expense.category || expense.category.trim() === '' || expense.category.toLowerCase() === 'uncategorized' ? (
                          <span
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200/90 shadow-2xs"
                            title="Category not mentioned"
                          >
                            <span className="text-amber-500 font-bold">⚠️</span>
                            <span className="italic">Uncategorized</span>
                          </span>
                        ) : (
                          <span>{getTransactionTitle(expense, currentUser?.id)}</span>
                        )}
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
                      <td className="px-6 py-4 text-ink-600 whitespace-nowrap">
                        <div>{expense.paymentMethod}</div>
                        {expense.paymentAccount && (
                          <div className="text-[11px] text-ink-400 font-normal">{expense.paymentAccount}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 font-semibold whitespace-nowrap">
                        {getAmountDisplay(expense, currentUser?.id)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {isIncomingTransfer ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs text-ink-400 font-medium">
                            Received
                          </span>
                        ) : (
                          <div className="flex gap-2">
                            <button
                              className="cash-button-secondary px-3 py-1.5 text-xs font-semibold"
                              type="button"
                              onClick={() => onEditExpense(expense)}
                            >
                              Edit
                            </button>
                            <button
                              className="cash-button-secondary px-3 py-1.5 text-xs font-semibold text-red-700"
                              type="button"
                              onClick={() => onDeleteExpense(expense.id)}
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Bottom Section Tabs Bar */}
        <div className="border-t border-ink-100 bg-ink-50/70 p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <span className="text-xs font-bold uppercase tracking-wider text-ink-400">
              Filter by Transaction Type:
            </span>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setActiveTab('ALL')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  activeTab === 'ALL'
                    ? 'bg-ink-900 text-white shadow-xs'
                    : 'bg-white border border-ink-200 text-ink-600 hover:text-ink-900 hover:bg-ink-50'
                }`}
              >
                All ({displayedExpenses.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('EXPENSE')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  activeTab === 'EXPENSE'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'bg-white border border-ink-200 text-ink-600 hover:text-rose-700 hover:bg-rose-50/50'
                }`}
              >
                💳 Expenses (E...) [{expenseCount}]
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('RECEIVABLE')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  activeTab === 'RECEIVABLE'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-white border border-ink-200 text-ink-600 hover:text-amber-700 hover:bg-amber-50/50'
                }`}
              >
                🤝 Receivables (R...) [{receivableCount}]
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('INCOME')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  activeTab === 'INCOME'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-white border border-ink-200 text-ink-600 hover:text-emerald-700 hover:bg-emerald-50/50'
                }`}
              >
                💰 Income (I...) [{incomeCount}]
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('TRANSFER_OUT')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  activeTab === 'TRANSFER_OUT'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-white border border-ink-200 text-ink-600 hover:text-amber-700 hover:bg-amber-50/50'
                }`}
              >
                ↗ Outgoing Transfers (TE...) [{transferOutCount}]
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('TRANSFER_IN')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  activeTab === 'TRANSFER_IN'
                    ? 'bg-emerald-700 text-white shadow-xs'
                    : 'bg-white border border-ink-200 text-ink-600 hover:text-emerald-700 hover:bg-emerald-50/50'
                }`}
              >
                ↙ Incoming Transfers (TI...) [{transferInCount}]
              </button>
              {investmentCount > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveTab('INVESTMENT')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    activeTab === 'INVESTMENT'
                      ? 'bg-purple-600 text-white shadow-xs'
                      : 'bg-white border border-ink-200 text-ink-600 hover:text-purple-700 hover:bg-purple-50/50'
                  }`}
                >
                  📈 Investments (PB/PS) [{investmentCount}]
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

