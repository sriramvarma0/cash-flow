'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { AuthUser, Expense } from '../../../lib/types';
import {
  formatCurrency,
  DateFilterType,
  getDisplayTrackingId,
  isReceivableExpense,
  getDateFilterRange,
  filterExpensesByDateRange
} from '../../../lib/finance';
import { updateExpense, deleteExpense } from '../../../lib/api';

export type TableMode = 'view' | 'edit' | 'delete';
export type BottomSectionTab = 'DIRECT' | 'RECEIVABLES' | 'TRANSFERS' | 'ALL' | '';

export type ExpenseTableProps = {
  expenses: Expense[];
  loading: boolean;
  currentUser: AuthUser | null;
  timeFilter: DateFilterType;
  setTimeFilter: (val: DateFilterType) => void;
  customStartDate: string;
  setCustomStartDate: (val: string) => void;
  customEndDate: string;
  setCustomEndDate: (val: string) => void;
  categoryFilter: string;
  setCategoryFilter: (val: string) => void;
  tagFilter: string;
  setTagFilter: (val: string) => void;
  categoryTypeFilter: string;
  setCategoryTypeFilter: (val: string) => void;
  searchQuery: string;
  setSearchQuery: (val: string) => void;
  allCategories: string[];
  allTags: string[];
  onEditExpense: (expense: Expense) => void;
  onDeleteExpense: (id: string) => void;
  onRefresh: () => Promise<void>;
  periodLabel?: string;
  title?: string;
  transactionType?: 'EXPENSE' | 'INCOME';
  initialTab?: BottomSectionTab;
};

export function ExpenseTable({
  expenses,
  loading,
  currentUser,
  timeFilter,
  setTimeFilter,
  customStartDate,
  setCustomStartDate,
  customEndDate,
  setCustomEndDate,
  categoryFilter,
  setCategoryFilter,
  tagFilter,
  setTagFilter,
  categoryTypeFilter,
  setCategoryTypeFilter,
  searchQuery,
  setSearchQuery,
  allCategories,
  allTags,
  onEditExpense,
  onDeleteExpense,
  onRefresh,
  periodLabel,
  title = 'Expense Transactions',
  transactionType = 'EXPENSE',
  initialTab = ''
}: ExpenseTableProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [expenseTypeFilter, setExpenseTypeFilter] = useState<string>(
    initialTab === 'ALL' ? '' : (initialTab || '')
  );

  useEffect(() => {
    if (initialTab === 'ALL') {
      setExpenseTypeFilter('');
    } else if (initialTab !== undefined) {
      setExpenseTypeFilter(initialTab);
    }
    setCurrentPage(1);
  }, [initialTab]);

  const [settlingExpense, setSettlingExpense] = useState<Expense | null>(null);
  const [repaymentInput, setRepaymentInput] = useState<string>('');
  const [isSettlingSubmitting, setIsSettlingSubmitting] = useState(false);
  const [pageSize, setPageSize] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('expense_table_page_size');
      if (saved) {
        const parsed = parseInt(saved, 10);
        if ([10, 12, 20, 25, 50, 100].includes(parsed)) return parsed;
      }
    }
    return 12;
  });

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(1);
    if (typeof window !== 'undefined') {
      localStorage.setItem('expense_table_page_size', String(newSize));
    }
  };

  // Table Mode & Manage Dropdown State
  const [tableMode, setTableMode] = useState<TableMode>('view');
  const [isManageOpen, setIsManageOpen] = useState(false);
  const manageDropdownRef = useRef<HTMLDivElement>(null);

  // Multi-Select Deletion State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  // In-Table Editing State
  const [editedRows, setEditedRows] = useState<
    Record<
      string,
      {
        amount?: number | string;
        category?: string;
        description?: string;
        paymentMethod?: string;
        paymentAccount?: string;
        date?: string;
        categoryType?: string;
        tagsString?: string;
      }
    >
  >({});
  const [savingRowId, setSavingRowId] = useState<string | null>(null);
  const [isBulkSaving, setIsBulkSaving] = useState(false);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (manageDropdownRef.current && !manageDropdownRef.current.contains(e.target as Node)) {
        setIsManageOpen(false);
      }
    };
    if (isManageOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isManageOpen]);

  // Date conversion helpers for datetime-local inputs
  const toDateTimeLocal = (iso: string) => {
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return '';
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch {
      return '';
    }
  };

  const fromDateTimeLocal = (localStr: string) => {
    try {
      const d = new Date(localStr);
      if (isNaN(d.getTime())) return new Date().toISOString();
      return d.toISOString();
    } catch {
      return new Date().toISOString();
    }
  };

  const updateDraftField = (id: string, field: string, val: any) => {
    setEditedRows((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: val
      }
    }));
  };

  const getDraftValue = (expense: Expense, field: string) => {
    const draft = editedRows[expense.id];
    if (draft && (draft as any)[field] !== undefined) {
      return (draft as any)[field];
    }
    if (field === 'date') return toDateTimeLocal(expense.date);
    if (field === 'description') return expense.description || '';
    if (field === 'tagsString') return (expense.tags || []).map((t) => t.name).join(', ');
    if (field === 'category') return expense.category || '';
    if (field === 'categoryType') return expense.categoryType || '';
    if (field === 'paymentMethod') return expense.paymentMethod || 'Card';
    if (field === 'paymentAccount') return expense.paymentAccount || '';
    if (field === 'amount') return expense.amount;
    return '';
  };

  const isRowModified = (id: string) => {
    const draft = editedRows[id];
    return Boolean(draft && Object.keys(draft).length > 0);
  };

  const saveDraft = async (id: string, draftObj?: any) => {
    const draft = draftObj || editedRows[id];
    if (!draft) return;
    const payload: any = {};
    if (draft.amount !== undefined) {
      const num = parseFloat(String(draft.amount));
      if (isNaN(num) || num <= 0) throw new Error('Amount must be a positive number');
      payload.amount = num;
    }
    if (draft.description !== undefined) payload.description = draft.description.trim();
    if (draft.category !== undefined) payload.category = draft.category.trim();
    if (draft.categoryType !== undefined) payload.categoryType = draft.categoryType || null;
    if (draft.paymentMethod !== undefined) payload.paymentMethod = draft.paymentMethod;
    if (draft.paymentAccount !== undefined) payload.paymentAccount = draft.paymentAccount.trim() || null;
    if (draft.date !== undefined) payload.date = fromDateTimeLocal(draft.date);
    if (draft.tagsString !== undefined) {
      payload.tags = draft.tagsString
        .split(',')
        .map((t: string) => t.trim().replace(/^#/, ''))
        .filter(Boolean);
    }
    await updateExpense(id, payload);
  };

  const handleSaveRow = async (id: string) => {
    setSavingRowId(id);
    try {
      await saveDraft(id);
      setEditedRows((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      await onRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setSavingRowId(null);
    }
  };

  const handleSaveAllChanges = async () => {
    const entries = Object.entries(editedRows);
    if (entries.length === 0) return;
    const count = entries.length;
    if (!window.confirm(`Save changes to ${count} modified transaction${count > 1 ? 's' : ''}?`)) {
      return;
    }
    setIsBulkSaving(true);
    try {
      for (const [id, draft] of entries) {
        await saveDraft(id, draft);
      }
      setEditedRows({});
      setTableMode('view');
      await onRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save all changes');
    } finally {
      setIsBulkSaving(false);
    }
  };

  const toggleSelectRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleDeleteSingle = async (id: string, desc?: string | null) => {
    const name = desc ? `"${desc}"` : `ID ${id}`;
    if (!window.confirm(`Are you sure you want to delete transaction ${name}?`)) {
      return;
    }
    try {
      if (onDeleteExpense) {
        await onDeleteExpense(id);
      } else {
        await deleteExpense(id);
        await onRefresh();
      }
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete transaction');
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    if (!window.confirm(`Are you sure you want to delete ${count} selected transaction${count > 1 ? 's' : ''}? This action cannot be undone.`)) {
      return;
    }
    setIsBulkDeleting(true);
    try {
      const ids = Array.from(selectedIds);
      await Promise.all(ids.map((id) => deleteExpense(id)));
      setSelectedIds(new Set());
      await onRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete selected transactions');
    } finally {
      setIsBulkDeleting(false);
    }
  };

  // Active date range filter based on selected period
  const dateRange = useMemo(() => {
    return getDateFilterRange(timeFilter, customStartDate, customEndDate);
  }, [timeFilter, customStartDate, customEndDate]);

  // Expenses filtered by active date range (e.g. Current Month by default)
  const dateFilteredExpenses = useMemo(() => {
    return filterExpensesByDateRange(expenses, dateRange);
  }, [expenses, dateRange]);

  // Split into direct transactions vs receivables vs transfers
  const directList = useMemo(() => {
    return dateFilteredExpenses.filter((e) => {
      if (transactionType === 'EXPENSE') {
        return (!e.transactionType || e.transactionType === 'EXPENSE') && !isReceivableExpense(e);
      }
      if (transactionType === 'INCOME') {
        return e.transactionType === 'INCOME';
      }
      return true;
    });
  }, [dateFilteredExpenses, transactionType]);

  const receivableList = useMemo(() => {
    return dateFilteredExpenses.filter(isReceivableExpense);
  }, [dateFilteredExpenses]);

  const transferList = useMemo(() => {
    return dateFilteredExpenses.filter((e) => {
      if (e.transactionType !== 'TRANSFER') return false;
      if (transactionType === 'EXPENSE') {
        // Outgoing transfers sent by current user
        return currentUser ? e.userId === currentUser.id : true;
      }
      if (transactionType === 'INCOME') {
        // Incoming transfers received by current user
        return currentUser ? e.toUserId === currentUser.id : false;
      }
      return true;
    });
  }, [dateFilteredExpenses, transactionType, currentUser]);

  const combinedList = useMemo(() => {
    return transactionType === 'EXPENSE'
      ? [...directList, ...receivableList, ...transferList]
      : [...directList, ...transferList];
  }, [directList, receivableList, transferList, transactionType]);

  // Active base list depending on selected expense/transaction type filter
  const activeBaseList = useMemo(() => {
    if (expenseTypeFilter === 'RECEIVABLES') return receivableList;
    if (expenseTypeFilter === 'TRANSFERS') return transferList;
    if (expenseTypeFilter === 'DIRECT') return directList;
    return combinedList;
  }, [expenseTypeFilter, directList, receivableList, transferList, combinedList]);

  // Secondary filters applied to the active list
  const filteredList = useMemo(() => {
    let list = activeBaseList;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((e) => {
        const displayId = getDisplayTrackingId(e, currentUser?.id).toLowerCase();
        const nativeId = (e.id || '').toLowerCase();
        const desc = (e.description || '').toLowerCase();
        const cat = (e.category || '').toLowerCase();
        const method = (e.paymentMethod || '').toLowerCase();
        const account = (e.paymentAccount || '').toLowerCase();
        const toUserName = (e.toUser?.name || '').toLowerCase();
        const toUserEmail = (e.toUser?.email || '').toLowerCase();
        const fromUserName = (e.user?.name || '').toLowerCase();
        const fromUserEmail = (e.user?.email || '').toLowerCase();
        const tagsMatch = e.tags && e.tags.some((t) => t.name.toLowerCase().includes(q));

        return (
          displayId.includes(q) ||
          nativeId.includes(q) ||
          desc.includes(q) ||
          cat.includes(q) ||
          method.includes(q) ||
          account.includes(q) ||
          toUserName.includes(q) ||
          toUserEmail.includes(q) ||
          fromUserName.includes(q) ||
          fromUserEmail.includes(q) ||
          tagsMatch
        );
      });
    }

    if (categoryFilter === '__UNCATEGORIZED__') {
      list = list.filter((e) => !e.category || e.category.trim() === '' || e.category.toLowerCase() === 'uncategorized');
    } else if (categoryFilter) {
      list = list.filter(
        (e) => e.category && e.category.toLowerCase() === categoryFilter.toLowerCase()
      );
    }

    if (tagFilter) {
      list = list.filter((e) => e.tags && e.tags.some((t) => t.name === tagFilter));
    }

    if (categoryTypeFilter) {
      list = list.filter((e) => e.categoryType === categoryTypeFilter);
    }

    return list.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [activeBaseList, searchQuery, categoryFilter, tagFilter, categoryTypeFilter, currentUser?.id]);

  const handleOpenSettle = (expense: Expense) => {
    setSettlingExpense(expense);
    setRepaymentInput(String(expense.reimbursedAmount || 0));
  };

  const handleConfirmRepayment = async (newReimbursed: number, status: 'PARTIALLY_SETTLED' | 'SETTLED' | 'OUTSTANDING') => {
    if (!settlingExpense) return;
    setIsSettlingSubmitting(true);
    try {
      await updateExpense(settlingExpense.id, {
        receivableStatus: status,
        reimbursedAmount: Number(newReimbursed.toFixed(2))
      });
      setSettlingExpense(null);
      await onRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update receivable');
    } finally {
      setIsSettlingSubmitting(false);
    }
  };

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredList.length / pageSize));
  const paginatedList = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredList.slice(start, start + pageSize);
  }, [filteredList, currentPage, pageSize]);

  const hasActiveSecondaryFilters = Boolean(
    searchQuery || categoryFilter || tagFilter || categoryTypeFilter || expenseTypeFilter
  );

  const resetSecondaryFilters = () => {
    setSearchQuery('');
    setCategoryFilter('');
    setTagFilter('');
    setCategoryTypeFilter('');
    setExpenseTypeFilter('');
    setCurrentPage(1);
  };

  const currentMonthOptionLabel = useMemo(() => {
    const now = new Date();
    const monthShort = now.toLocaleString('en-US', { month: 'short' });
    const yearShort = String(now.getFullYear()).slice(-2);
    return `Current Month (${monthShort} ${yearShort})`;
  }, []);

  return (
    <div className="cash-card overflow-hidden text-left animate-in fade-in duration-200">
      {/* Top Header & Time Filter Bar */}
      <div className="p-5 sm:p-6 border-b border-ink-100 bg-gradient-to-r from-white via-ink-50/40 to-white">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-ink-900">
                {title}
              </h2>
              <span className="inline-flex items-center rounded-full bg-ink-100 px-2.5 py-0.5 text-xs font-semibold text-ink-700">
                {filteredList.length}
              </span>
            </div>
          </div>

          {/* Search Bar beside Date Range Selector */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Search Input beside Current Month selector */}
            <div className="relative min-w-[200px] sm:min-w-[260px]">
              <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 pointer-events-none text-ink-400">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </span>
              <input
                className="cash-input pl-8 py-1.5 text-xs w-full bg-white border-ink-200/90 shadow-2xs"
                placeholder="Search tracking ID, note, tags, users..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setCurrentPage(1);
                  }}
                  className="absolute inset-y-0 right-0 pr-2 flex items-center text-ink-400 hover:text-ink-600"
                  title="Clear search"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {/* Date Range Selector */}
            <div className="flex items-center gap-1.5 bg-white border border-ink-200/90 rounded-xl px-2.5 py-1.5 shadow-2xs hover:border-brand-300 transition">
              <span className="text-brand-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              </span>
              <select
                value={timeFilter}
                onChange={(e) => {
                  setTimeFilter(e.target.value as DateFilterType);
                  setCurrentPage(1);
                }}
                className="bg-transparent text-xs font-semibold text-ink-800 focus:outline-hidden cursor-pointer"
                title="Filter by time period"
              >
                <option value="current_month">{currentMonthOptionLabel}</option>
                <option value="calendar_year">Current Calendar Year</option>
                <option value="financial_year">Current Financial Year</option>
                <option value="custom">Custom Range...</option>
                <option value="all">All Time</option>
              </select>
            </div>

            {/* Custom Date Range Inputs */}
            {timeFilter === 'custom' && (
              <div className="flex items-center gap-1.5 bg-white border border-brand-200 rounded-xl px-2.5 py-1 text-xs shadow-2xs animate-in fade-in duration-200">
                <span className="text-ink-400 text-[11px] font-medium">From</span>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => {
                    setCustomStartDate(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="text-xs font-semibold text-ink-800 bg-ink-50/80 border border-ink-200 rounded-lg px-2 py-0.5 focus:outline-hidden focus:ring-1 focus:ring-brand-500"
                />
                <span className="text-ink-400 text-[11px] font-medium">To</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => {
                    setCustomEndDate(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="text-xs font-semibold text-ink-800 bg-ink-50/80 border border-ink-200 rounded-lg px-2 py-0.5 focus:outline-hidden focus:ring-1 focus:ring-brand-500"
                />
              </div>
            )}

            {/* Manage (Three Dots) Action Menu */}
            <div className="relative" ref={manageDropdownRef}>
              <button
                type="button"
                onClick={() => setIsManageOpen((prev) => !prev)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold shadow-2xs transition-all ${
                  tableMode !== 'view'
                    ? tableMode === 'delete'
                      ? 'bg-rose-50 border-rose-300 text-rose-800 ring-2 ring-rose-200'
                      : 'bg-amber-50 border-amber-300 text-amber-900 ring-2 ring-amber-200'
                    : 'bg-white border-ink-200/90 text-ink-700 hover:text-ink-900 hover:border-brand-300'
                }`}
                title="Manage table transactions (Edit / Delete)"
              >
                <span className="text-sm font-bold tracking-widest leading-none">⋯</span>
                <span>Manage</span>
                <svg className={`w-3.5 h-3.5 text-ink-400 transition-transform ${isManageOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {isManageOpen && (
                <div className="absolute right-0 mt-1.5 w-52 rounded-2xl bg-white border border-ink-200 shadow-xl py-1.5 z-40 text-left animate-in fade-in duration-150">
                  <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-400 border-b border-ink-100">
                    Table Actions
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setTableMode(tableMode === 'edit' ? 'view' : 'edit');
                      setIsManageOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium transition ${
                      tableMode === 'edit' ? 'bg-amber-50 text-amber-900 font-semibold' : 'text-ink-700 hover:bg-ink-50'
                    }`}
                  >
                    <span className="text-sm">✏️</span>
                    <span>{tableMode === 'edit' ? 'Exit Edit Mode' : 'Edit Transactions'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTableMode(tableMode === 'delete' ? 'view' : 'delete');
                      setIsManageOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium transition ${
                      tableMode === 'delete' ? 'bg-rose-50 text-rose-900 font-semibold' : 'text-ink-700 hover:bg-ink-50'
                    }`}
                  >
                    <span className="text-sm">🗑️</span>
                    <span>{tableMode === 'delete' ? 'Exit Delete Mode' : 'Delete Transactions'}</span>
                  </button>
                  {tableMode !== 'view' && (
                    <div className="pt-1 mt-1 border-t border-ink-100">
                      <button
                        type="button"
                        onClick={() => {
                          setTableMode('view');
                          setSelectedIds(new Set());
                          setEditedRows({});
                          setIsManageOpen(false);
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-ink-500 hover:text-ink-900 hover:bg-ink-50 transition"
                      >
                        <span>✕</span>
                        <span>Normal View</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Secondary Filter Controls Row */}
        <div className="mt-4 pt-4 border-t border-ink-100/70 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {/* Expense / Transaction Type Dropdown Filter */}
          <select
            className="cash-input py-1.5 text-xs bg-white text-ink-800"
            value={expenseTypeFilter}
            onChange={(e) => {
              setExpenseTypeFilter(e.target.value);
              setCurrentPage(1);
            }}
          >
            <option value="">
              {transactionType === 'EXPENSE' ? 'All Expense Types' : 'All Income Types'}
            </option>
            <option value="DIRECT">
              {transactionType === 'EXPENSE' ? 'Direct Expenses' : 'Direct Income'}
            </option>
            {transactionType === 'EXPENSE' && (
              <option value="RECEIVABLES">Lending (Receivables)</option>
            )}
            <option value="TRANSFERS">
              {transactionType === 'EXPENSE' ? 'Outgoing Transfers' : 'Incoming Transfers'}
            </option>
          </select>

          {/* Category Dropdown */}
          <select
            className="cash-input py-1.5 text-xs bg-white text-ink-800"
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setCurrentPage(1);
            }}
          >
            <option value="">All Categories</option>
            <option value="__UNCATEGORIZED__">⚠️ Uncategorized (Missing)</option>
            {allCategories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          {/* Category Type Dropdown */}
          <select
            className="cash-input py-1.5 text-xs bg-white text-ink-800"
            value={categoryTypeFilter}
            onChange={(e) => {
              setCategoryTypeFilter(e.target.value);
              setCurrentPage(1);
            }}
          >
            <option value="">All Types (Essentials/Lifestyle/High-Value)</option>
            <option value="ESSENTIALS">Essentials</option>
            <option value="LIFESTYLE">Lifestyle</option>
            <option value="HIGH_VALUE">High-Value</option>
          </select>

          {/* Tag Dropdown */}
          <div className="flex gap-2">
            <select
              className="cash-input py-1.5 text-xs bg-white text-ink-800 flex-1"
              value={tagFilter}
              onChange={(e) => {
                setTagFilter(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="">All Tags</option>
              {allTags.map((t) => (
                <option key={t} value={t}>
                  #{t}
                </option>
              ))}
            </select>

            {hasActiveSecondaryFilters && (
              <button
                type="button"
                onClick={resetSecondaryFilters}
                className="px-2.5 py-1.5 rounded-xl border border-ink-200 bg-white hover:bg-ink-100 text-[11px] font-semibold text-ink-600 transition shrink-0"
                title="Clear all filters"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Delete Mode Active Banner */}
        {tableMode === 'delete' && (
          <div className="mt-3 px-4 py-2.5 rounded-xl bg-rose-50 border border-rose-200 flex flex-wrap items-center justify-between gap-2 text-xs text-rose-900 animate-in fade-in duration-200">
            <div className="flex items-center gap-2">
              <span className="text-base">🗑️</span>
              <span>
                <strong>Delete Mode:</strong> Select transactions to bulk delete, or click Delete on any row.
              </span>
              {selectedIds.size > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-rose-200/80 text-rose-950 font-bold text-[11px]">
                  {selectedIds.size} selected
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setTableMode('view');
                setSelectedIds(new Set());
              }}
              className="px-2.5 py-1 rounded-lg bg-white border border-rose-200 text-rose-700 font-semibold hover:bg-rose-100 transition shadow-2xs"
            >
              Exit Delete Mode
            </button>
          </div>
        )}

        {/* Edit Mode Active Banner */}
        {tableMode === 'edit' && (
          <div className="mt-3 px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-950 animate-in fade-in duration-200">
            <div className="flex items-center gap-2">
              <span className="text-base">✏️</span>
              <span>
                <strong>In-Table Edit Mode:</strong> Directly edit fields in the table. Click <strong>✓</strong> on a row to save it, or click <strong>Save All Changes</strong> below.
              </span>
              {Object.keys(editedRows).length > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-amber-200/80 text-amber-950 font-bold text-[11px]">
                  {Object.keys(editedRows).length} modified
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                if (Object.keys(editedRows).length > 0 && !window.confirm(`Discard ${Object.keys(editedRows).length} unsaved changes?`)) {
                  return;
                }
                setTableMode('view');
                setEditedRows({});
              }}
              className="px-2.5 py-1 rounded-lg bg-white border border-amber-200 text-amber-800 font-semibold hover:bg-amber-100 transition shadow-2xs"
            >
              Exit Edit Mode
            </button>
          </div>
        )}
      </div>

      {/* Full-Level Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-ink-100 text-left text-xs sm:text-sm">
          <thead className="bg-ink-50/90 text-ink-600 font-semibold uppercase tracking-wider text-[11px]">
            <tr>
              {/* Select All Checkbox header in Delete Mode */}
              {tableMode === 'delete' && (
                <th className="px-3 py-3 sm:px-4 sm:py-3.5 text-center w-10 bg-rose-100/70 text-rose-900">
                  <input
                    type="checkbox"
                    checked={paginatedList.length > 0 && paginatedList.every((exp) => selectedIds.has(exp.id))}
                    onChange={(e) => {
                      const next = new Set(selectedIds);
                      if (e.target.checked) {
                        paginatedList.forEach((exp) => next.add(exp.id));
                      } else {
                        paginatedList.forEach((exp) => next.delete(exp.id));
                      }
                      setSelectedIds(next);
                    }}
                    className="w-4 h-4 rounded border-rose-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
                    title="Select / deselect all on this page"
                  />
                </th>
              )}
              <th className="px-4 py-3 sm:px-5 sm:py-3.5">Tracking ID</th>
              <th className={`px-4 py-3 sm:px-5 sm:py-3.5 ${tableMode === 'edit' ? 'bg-amber-100/60 text-amber-950 font-bold border-b border-amber-300' : ''}`}>
                Date & Time {tableMode === 'edit' && <span className="text-[10px] ml-1">✏️</span>}
              </th>
              <th className={`px-4 py-3 sm:px-5 sm:py-3.5 ${tableMode === 'edit' ? 'bg-amber-100/60 text-amber-950 font-bold border-b border-amber-300' : ''}`}>
                Description & Tags {tableMode === 'edit' && <span className="text-[10px] ml-1">✏️</span>}
              </th>
              <th className={`px-4 py-3 sm:px-5 sm:py-3.5 ${tableMode === 'edit' ? 'bg-amber-100/60 text-amber-950 font-bold border-b border-amber-300' : ''}`}>
                Category {tableMode === 'edit' && <span className="text-[10px] ml-1">✏️</span>}
              </th>
              <th className={`px-4 py-3 sm:px-5 sm:py-3.5 ${tableMode === 'edit' ? 'bg-amber-100/60 text-amber-950 font-bold border-b border-amber-300' : ''}`}>
                Type {tableMode === 'edit' && <span className="text-[10px] ml-1">✏️</span>}
              </th>
              <th className={`px-4 py-3 sm:px-5 sm:py-3.5 ${tableMode === 'edit' ? 'bg-amber-100/60 text-amber-950 font-bold border-b border-amber-300' : ''}`}>
                Method {tableMode === 'edit' && <span className="text-[10px] ml-1">✏️</span>}
              </th>
              <th className={`px-4 py-3 sm:px-5 sm:py-3.5 ${tableMode === 'edit' ? 'bg-amber-100/60 text-amber-950 font-bold border-b border-amber-300' : ''}`}>
                Account {tableMode === 'edit' && <span className="text-[10px] ml-1">✏️</span>}
              </th>
              <th className={`px-4 py-3 sm:px-5 sm:py-3.5 text-right ${tableMode === 'edit' ? 'bg-amber-100/60 text-amber-950 font-bold border-b border-amber-300' : ''}`}>
                Amount {tableMode === 'edit' && <span className="text-[10px] ml-1">✏️</span>}
              </th>
              {/* Actions header is ONLY rendered in Delete or Edit Mode */}
              {tableMode !== 'view' && (
                <th className={`px-4 py-3 sm:px-5 sm:py-3.5 text-center ${
                  tableMode === 'delete'
                    ? 'bg-rose-100/70 text-rose-900'
                    : 'bg-amber-100/60 text-amber-950 font-bold border-b border-amber-300'
                }`}>
                  {tableMode === 'delete' ? 'Action' : 'Save'}
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100 bg-white">
            {loading ? (
              <tr>
                <td className="px-6 py-12 text-center text-ink-500 font-medium" colSpan={tableMode === 'delete' ? 10 : (tableMode === 'edit' ? 9 : 8)}>
                  <div className="flex flex-col items-center justify-center gap-2">
                    <svg className="w-6 h-6 animate-spin text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span>Loading transactions...</span>
                  </div>
                </td>
              </tr>
            ) : paginatedList.length === 0 ? (
              <tr>
                <td className="px-6 py-12 text-center text-ink-500" colSpan={tableMode === 'delete' ? 10 : (tableMode === 'edit' ? 9 : 8)}>
                  <div className="flex flex-col items-center justify-center gap-2 max-w-sm mx-auto">
                    <div className="w-10 h-10 rounded-full bg-ink-100 flex items-center justify-center text-ink-400">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <p className="text-sm font-semibold text-ink-800">
                      No{' '}
                      {expenseTypeFilter === 'TRANSFERS'
                        ? transactionType === 'EXPENSE' ? 'outgoing transfers' : 'incoming transfers'
                        : expenseTypeFilter === 'RECEIVABLES'
                        ? 'lending receivables'
                        : expenseTypeFilter === 'DIRECT'
                        ? `${transactionType.toLowerCase()}s`
                        : 'transactions'}{' '}
                      found
                    </p>
                    <p className="text-xs text-ink-400">
                      {hasActiveSecondaryFilters
                        ? 'Try clearing the search or category filters, or select a different time range.'
                        : expenseTypeFilter === 'TRANSFERS'
                        ? transactionType === 'EXPENSE'
                          ? 'Send a transfer to another group member from the form to record an outgoing transfer.'
                          : 'Incoming transfers received from your group members will appear here.'
                        : expenseTypeFilter === 'RECEIVABLES'
                        ? 'Record money lent to others or expenses paid on their behalf to track receivables.'
                        : 'Use the form above to record your first entry.'}
                    </p>
                    {hasActiveSecondaryFilters && (
                      <button
                        type="button"
                        onClick={resetSecondaryFilters}
                        className="mt-2 text-xs text-brand-700 font-semibold hover:underline"
                      >
                        Reset filters
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              paginatedList.map((expense) => {
                const isTransfer = expense.transactionType === 'TRANSFER';
                const isOutgoingTransfer = isTransfer && currentUser?.id && expense.userId === currentUser.id;
                const isIncomingTransfer = isTransfer && currentUser?.id && expense.toUserId === currentUser.id;
                const isReceivable = isReceivableExpense(expense);
                const isDirectExpense = (!expense.transactionType || expense.transactionType === 'EXPENSE') && !isReceivable;
                const isDirectIncome = expense.transactionType === 'INCOME';
                const isNegative = isDirectExpense || isOutgoingTransfer || (isReceivable && expense.receivableStatus !== 'SETTLED');
                const trackingId = getDisplayTrackingId(expense, currentUser?.id);
                const isSelected = selectedIds.has(expense.id);
                const isModified = isRowModified(expense.id);

                return (
                  <tr
                    key={expense.id}
                    onClick={() => {
                      if (tableMode === 'delete') {
                        toggleSelectRow(expense.id);
                      }
                    }}
                    className={`transition-colors group ${
                      isSelected
                        ? 'bg-rose-50/95 ring-2 ring-rose-300 border-l-4 border-l-rose-500 font-medium'
                        : isModified
                        ? 'bg-amber-50/90 ring-2 ring-amber-400 border-l-4 border-l-amber-500'
                        : tableMode === 'delete'
                        ? 'hover:bg-rose-50/50 cursor-pointer'
                        : tableMode === 'edit'
                        ? 'bg-amber-50/15 hover:bg-amber-50/40'
                        : 'hover:bg-ink-50/70'
                    }`}
                  >
                    {/* Checkbox selector in Delete mode */}
                    {tableMode === 'delete' && (
                      <td className={`px-3 py-3 sm:px-4 sm:py-3.5 text-center transition-colors ${isSelected ? 'bg-rose-100/60' : 'bg-rose-50/20'}`}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            e.stopPropagation();
                            toggleSelectRow(expense.id);
                          }}
                          className="w-4 h-4 rounded border-rose-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
                        />
                      </td>
                    )}

                    {/* Tracking ID */}
                    <td className="px-4 py-3 sm:px-5 sm:py-3.5 whitespace-nowrap">
                      {isReceivable ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(trackingId);
                              alert(`Receivable Tracking ID "${trackingId}" copied to clipboard!`);
                            }}
                            title="Click to copy Receivable Tracking ID"
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 transition font-mono text-xs font-bold shadow-2xs"
                          >
                            <span className="text-[10px] text-amber-700 font-extrabold">🤝</span>
                            <span>{trackingId}</span>
                            <span className="text-[10px] text-amber-600 opacity-70">📋</span>
                          </button>
                          {tableMode === 'view' && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenSettle(expense);
                              }}
                              className={`px-2 py-0.5 rounded-md text-[11px] font-bold border transition shadow-2xs ${
                                expense.receivableStatus === 'SETTLED'
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                                  : 'bg-amber-100 text-amber-950 border-amber-300 hover:bg-amber-200'
                              }`}
                              title="Update repayment or settle this receivable"
                            >
                              {expense.receivableStatus === 'SETTLED' ? '✓ Settled' : '🤝 Repay'}
                            </button>
                          )}
                        </div>
                      ) : isOutgoingTransfer ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(trackingId);
                            alert(`Outgoing Transfer Tracking ID "${trackingId}" copied to clipboard!`);
                          }}
                          title="Click to copy Outgoing Transfer Tracking ID (TE + 8 chars)"
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 transition font-mono text-xs font-bold shadow-2xs"
                        >
                          <span className="text-[10px] text-amber-600 font-extrabold">↗</span>
                          <span>{trackingId}</span>
                          <span className="text-[10px] text-amber-500 opacity-70">📋</span>
                        </button>
                      ) : isIncomingTransfer ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(trackingId);
                            alert(`Incoming Transfer Tracking ID "${trackingId}" copied to clipboard!`);
                          }}
                          title="Click to copy Incoming Transfer Tracking ID (TI + 8 chars)"
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 transition font-mono text-xs font-bold shadow-2xs"
                        >
                          <span className="text-[10px] text-emerald-600 font-extrabold">↙</span>
                          <span>{trackingId}</span>
                          <span className="text-[10px] text-emerald-500 opacity-70">📋</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(trackingId);
                            alert(`Tracking ID "${trackingId}" copied to clipboard!`);
                          }}
                          title="Click to copy Tracking ID"
                          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-ink-100 hover:bg-brand-50 hover:text-brand-800 border border-ink-200 transition font-mono text-xs font-bold text-ink-800 shadow-2xs"
                        >
                          <span>{trackingId}</span>
                          <span className="text-[10px] text-ink-400 opacity-60 hover:opacity-100">📋</span>
                        </button>
                      )}
                    </td>

                    {/* Date & Time */}
                    <td className="px-4 py-3 sm:px-5 sm:py-3.5 whitespace-nowrap">
                      {tableMode === 'edit' ? (
                        <input
                          type="datetime-local"
                          value={String(getDraftValue(expense, 'date'))}
                          onChange={(e) => updateDraftField(expense.id, 'date', e.target.value)}
                          className="cash-input text-xs py-1 px-1.5 bg-white border-amber-300 focus:border-brand-500 w-full font-semibold shadow-2xs"
                        />
                      ) : (
                        <div className="text-ink-700">
                          <div className="font-semibold text-ink-900">
                            {new Date(expense.date).toLocaleDateString('en-IN', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric'
                            })}
                          </div>
                          <div className="text-[11px] text-ink-400">
                            {new Date(expense.date).toLocaleTimeString('en-IN', {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </div>
                        </div>
                      )}
                    </td>

                    {/* Description & Tags */}
                    <td className="px-4 py-3 sm:px-5 sm:py-3.5 max-w-xs">
                      {tableMode === 'edit' ? (
                        <div className="space-y-1">
                          <input
                            type="text"
                            value={String(getDraftValue(expense, 'description'))}
                            onChange={(e) => updateDraftField(expense.id, 'description', e.target.value)}
                            placeholder="Description..."
                            className="cash-input text-xs py-1 px-2 bg-white border-amber-300 focus:border-brand-500 w-full font-medium shadow-2xs"
                          />
                          <input
                            type="text"
                            value={String(getDraftValue(expense, 'tagsString'))}
                            onChange={(e) => updateDraftField(expense.id, 'tagsString', e.target.value)}
                            placeholder="Tags (comma separated)..."
                            className="cash-input text-[11px] py-0.5 px-2 bg-white border-ink-200 focus:border-brand-500 w-full text-ink-600 shadow-2xs"
                          />
                        </div>
                      ) : isReceivable ? (
                        <div>
                          <div className="font-semibold text-ink-900 flex items-center gap-1.5">
                            <span className="text-amber-800 font-bold text-xs">🤝 Lent:</span>
                            <span className="text-ink-900 truncate">{expense.description || 'No description'}</span>
                          </div>
                          {(expense.reimbursedAmount || 0) > 0 && (
                            <div className="text-[11px] text-emerald-700 font-semibold mt-0.5 flex items-center gap-1">
                              <span>✓ Reimbursed:</span>
                              <strong>{formatCurrency(expense.reimbursedAmount || 0)}</strong>
                              <span className="text-ink-400 font-normal">/ {formatCurrency(expense.amount)}</span>
                            </div>
                          )}
                          {expense.tags && expense.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {expense.tags.map((t) => (
                                <span
                                  key={t.id || t.name}
                                  className="inline-flex items-center px-1.5 py-0.2 rounded-md text-[10px] font-medium bg-brand-50 text-brand-700 border border-brand-100/80"
                                >
                                  #{t.name}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : isOutgoingTransfer ? (
                        <div>
                          <div className="font-semibold text-ink-900 flex items-center gap-1.5">
                            <span className="text-amber-700 font-bold text-xs">↗ To:</span>
                            <span className="text-ink-900">{expense.toUser?.name || expense.toUser?.email || 'Recipient'}</span>
                          </div>
                          {expense.description && expense.description.toLowerCase() !== 'transfer' && (
                            <div className="text-xs text-ink-500 italic mt-0.5 truncate" title={expense.description}>
                              {expense.description}
                            </div>
                          )}
                        </div>
                      ) : isIncomingTransfer ? (
                        <div>
                          <div className="font-semibold text-ink-900 flex items-center gap-1.5">
                            <span className="text-emerald-700 font-bold text-xs">↙ From:</span>
                            <span className="text-ink-900">{expense.user?.name || expense.user?.email || 'Sender'}</span>
                          </div>
                          {expense.description && expense.description.toLowerCase() !== 'transfer' && (
                            <div className="text-xs text-ink-500 italic mt-0.5 truncate" title={expense.description}>
                              {expense.description}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div>
                          <div className="font-medium text-ink-900 truncate" title={expense.description || ''}>
                            {expense.description || <span className="text-ink-300 italic">No note</span>}
                          </div>
                          {expense.tags && expense.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {expense.tags.map((t) => (
                                <span
                                  key={t.id || t.name}
                                  className="inline-flex items-center px-1.5 py-0.2 rounded-md text-[10px] font-medium bg-brand-50 text-brand-700 border border-brand-100/80"
                                >
                                  #{t.name}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Category */}
                    <td className="px-4 py-3 sm:px-5 sm:py-3.5 whitespace-nowrap">
                      {tableMode === 'edit' ? (
                        <select
                          value={String(getDraftValue(expense, 'category'))}
                          onChange={(e) => updateDraftField(expense.id, 'category', e.target.value)}
                          className="cash-input text-xs py-1 px-1.5 bg-white border-amber-300 focus:border-brand-500 w-full font-semibold shadow-2xs"
                        >
                          <option value="">Select Category</option>
                          {allCategories.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                          {expense.category && !allCategories.includes(expense.category) && (
                            <option value={expense.category}>{expense.category}</option>
                          )}
                        </select>
                      ) : isReceivable ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-bold bg-amber-50 text-amber-900 border border-amber-300 shadow-2xs">
                          <span>🤝</span> {expense.category || 'Receivable'}
                        </span>
                      ) : isTransfer ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200/70">
                          <span>🔄</span> Transfer
                        </span>
                      ) : !expense.category || expense.category.trim() === '' || expense.category.toLowerCase() === 'uncategorized' ? (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200/90 shadow-2xs"
                          title="Category not mentioned"
                        >
                          <span className="text-amber-500 font-bold">⚠️</span>
                          <span>Uncategorized</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-semibold bg-ink-100 text-ink-800">
                          {expense.category}
                        </span>
                      )}
                    </td>

                    {/* Category Type / Status */}
                    <td className="px-4 py-3 sm:px-5 sm:py-3.5 whitespace-nowrap">
                      {tableMode === 'edit' ? (
                        <select
                          value={String(getDraftValue(expense, 'categoryType'))}
                          onChange={(e) => updateDraftField(expense.id, 'categoryType', e.target.value)}
                          className="cash-input text-xs py-1 px-1.5 bg-white border-amber-300 focus:border-brand-500 w-full font-semibold shadow-2xs"
                        >
                          <option value="">None</option>
                          <option value="ESSENTIALS">Essentials</option>
                          <option value="LIFESTYLE">Lifestyle</option>
                          <option value="HIGH_VALUE">High-Value</option>
                        </select>
                      ) : isReceivable ? (
                        expense.receivableStatus === 'SETTLED' ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
                            ✅ Settled
                          </span>
                        ) : expense.receivableStatus === 'PARTIALLY_SETTLED' ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-sky-100 text-sky-900 border border-sky-300" title={`Reimbursed: ₹${expense.reimbursedAmount || 0} / ₹${expense.amount}`}>
                            🔄 Partial (₹{expense.reimbursedAmount || 0})
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                            ⏳ Outstanding
                          </span>
                        )
                      ) : isOutgoingTransfer ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100/90 text-amber-900 border border-amber-300/80">
                          ↗ Outgoing (TE)
                        </span>
                      ) : isIncomingTransfer ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100/90 text-emerald-900 border border-emerald-300/80">
                          ↙ Incoming (TI)
                        </span>
                      ) : expense.categoryType === 'ESSENTIALS' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200/60">
                          Essentials
                        </span>
                      ) : expense.categoryType === 'LIFESTYLE' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-purple-50 text-purple-700 border border-purple-200/60">
                          Lifestyle
                        </span>
                      ) : expense.categoryType === 'HIGH_VALUE' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200/60">
                          High-Value
                        </span>
                      ) : (
                        <span className="text-ink-300">—</span>
                      )}
                    </td>

                    {/* Payment Method */}
                    <td className={`px-4 py-3 sm:px-5 sm:py-3.5 text-ink-600 whitespace-nowrap text-xs ${tableMode === 'edit' ? 'bg-amber-50/20' : ''}`}>
                      {tableMode === 'edit' ? (
                        <select
                          value={String(getDraftValue(expense, 'paymentMethod'))}
                          onChange={(e) => updateDraftField(expense.id, 'paymentMethod', e.target.value)}
                          className="cash-input text-xs py-1 px-1.5 bg-white border-amber-300 focus:border-brand-500 w-full text-ink-800 font-semibold shadow-2xs"
                        >
                          <option value="Cash">Cash</option>
                          <option value="Card">Card</option>
                          <option value="UPI">UPI</option>
                          <option value="Net Banking">Net Banking</option>
                          <option value="Transfer">Transfer</option>
                          <option value="Other">Other</option>
                        </select>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-ink-100 text-ink-700">
                          {expense.paymentMethod || (isTransfer ? 'Transfer' : 'Card')}
                        </span>
                      )}
                    </td>

                    {/* Payment Account */}
                    <td className={`px-4 py-3 sm:px-5 sm:py-3.5 whitespace-nowrap text-xs ${tableMode === 'edit' ? 'bg-amber-50/20' : ''}`}>
                      {tableMode === 'edit' ? (
                        <input
                          type="text"
                          value={String(getDraftValue(expense, 'paymentAccount'))}
                          onChange={(e) => updateDraftField(expense.id, 'paymentAccount', e.target.value)}
                          placeholder="e.g. HDFC, Cash, SBI..."
                          className="cash-input text-xs py-1 px-2 bg-white border-amber-300 focus:border-brand-500 w-full text-ink-800 font-medium shadow-2xs"
                        />
                      ) : expense.paymentAccount ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-brand-50 text-brand-900 border border-brand-200/80 shadow-2xs">
                          <span className="text-[11px] text-brand-600">🏦</span>
                          <span>{expense.paymentAccount}</span>
                        </span>
                      ) : (
                        <span className="text-ink-300">—</span>
                      )}
                    </td>

                    {/* Amount */}
                    <td className="px-4 py-3 sm:px-5 sm:py-3.5 text-right whitespace-nowrap font-bold">
                      {tableMode === 'edit' ? (
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={getDraftValue(expense, 'amount')}
                          onChange={(e) => updateDraftField(expense.id, 'amount', e.target.value)}
                          className="cash-input text-xs py-1 px-2 bg-white border-amber-300 focus:border-brand-500 w-24 text-right font-bold text-ink-900 shadow-2xs"
                        />
                      ) : isReceivable ? (
                        expense.receivableStatus === 'SETTLED' ? (
                          <div className="flex flex-col items-end">
                            <span className="line-through text-ink-400 font-medium text-xs">
                              {formatCurrency(expense.amount)}
                            </span>
                            <span className="text-[11px] text-emerald-600 font-extrabold tracking-tight">
                              Settled (₹0 net)
                            </span>
                          </div>
                        ) : expense.receivableStatus === 'PARTIALLY_SETTLED' ? (
                          <div className="flex flex-col items-end">
                            <span className="text-amber-700 font-bold">
                              -{formatCurrency(Math.max(0, expense.amount - (expense.reimbursedAmount || 0)))}
                            </span>
                            <span className="line-through text-ink-400 text-[10px] font-normal">
                              Orig: {formatCurrency(expense.amount)}
                            </span>
                          </div>
                        ) : (
                          <div className="flex flex-col items-end">
                            <span className="text-amber-700 font-bold">
                              -{formatCurrency(expense.amount)}
                            </span>
                            <span className="text-[10px] text-amber-600 font-medium">
                              Counts as Expense
                            </span>
                          </div>
                        )
                      ) : (
                        <span className={isNegative ? 'text-rose-600' : 'text-emerald-600'}>
                          {isNegative ? '-' : '+'}{formatCurrency(expense.amount)}
                        </span>
                      )}
                    </td>

                    {/* Actions: ONLY rendered in Delete or Edit Mode */}
                    {tableMode !== 'view' && (
                      <td className="px-4 py-2 sm:px-5 text-center whitespace-nowrap">
                        {tableMode === 'delete' ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteSingle(expense.id, expense.description);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition shadow-2xs"
                            title="Delete this transaction"
                          >
                            <span>🗑️</span>
                            <span>Delete</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={savingRowId === expense.id || !isModified}
                            onClick={() => handleSaveRow(expense.id)}
                            className={`inline-flex items-center justify-center w-8 h-8 rounded-xl font-extrabold text-sm transition shadow-2xs ${
                              isModified
                                ? 'bg-emerald-600 hover:bg-emerald-700 text-white animate-pulse'
                                : 'bg-ink-100 text-ink-400 opacity-60 cursor-not-allowed'
                            }`}
                            title={isModified ? 'Click to save changes to this transaction' : 'No changes to save'}
                          >
                            {savingRowId === expense.id ? (
                              <svg className="w-4 h-4 animate-spin text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                            ) : (
                              '✓'
                            )}
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>



      {/* Pagination Footer */}
      {filteredList.length > 0 && (
        <div className="p-4 border-t border-ink-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-ink-50/40 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-ink-500">
              Page <strong className="text-ink-800">{currentPage}</strong> of <strong className="text-ink-800">{totalPages}</strong>
            </span>
            <span className="text-ink-300 hidden sm:inline">•</span>
            <div className="flex items-center gap-1.5 text-ink-600">
              <label htmlFor="pageSizeSelect" className="text-ink-500 font-medium">
                Per page:
              </label>
              <select
                id="pageSizeSelect"
                value={pageSize}
                onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                className="bg-white border border-ink-200/90 rounded-lg px-2 py-1 text-xs font-semibold text-ink-800 focus:outline-hidden focus:ring-1 focus:ring-brand-500 cursor-pointer shadow-2xs hover:border-brand-300 transition"
                title="Select number of entries per page"
              >
                <option value={10}>10</option>
                <option value={12}>12</option>
                <option value={20}>20</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span className="text-ink-400 text-[11px] hidden sm:inline">entries</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 self-end sm:self-auto">
            {/* Delete Mode Action Button */}
            {tableMode === 'delete' && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={isBulkDeleting || selectedIds.size === 0}
                  onClick={handleDeleteSelected}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-2xs ${
                    selectedIds.size > 0
                      ? 'bg-rose-600 hover:bg-rose-700 text-white cursor-pointer ring-2 ring-rose-300'
                      : 'bg-rose-100 text-rose-400 cursor-not-allowed opacity-60'
                  }`}
                  title={selectedIds.size > 0 ? `Delete ${selectedIds.size} selected transaction(s)` : 'Select transactions using checkboxes to delete'}
                >
                  <span>🗑️</span>
                  <span>{isBulkDeleting ? 'Deleting...' : `Delete Selected (${selectedIds.size})`}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTableMode('view');
                    setSelectedIds(new Set());
                  }}
                  className="cash-button-secondary py-1 px-2.5 text-xs font-semibold text-ink-600 hover:text-ink-900"
                >
                  Done
                </button>
              </div>
            )}

            {/* Edit Mode Action Button */}
            {tableMode === 'edit' && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={isBulkSaving || Object.keys(editedRows).length === 0}
                  onClick={handleSaveAllChanges}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-2xs ${
                    Object.keys(editedRows).length > 0
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer ring-2 ring-emerald-300'
                      : 'bg-ink-100 text-ink-400 cursor-not-allowed opacity-60'
                  }`}
                  title={Object.keys(editedRows).length > 0 ? `Save ${Object.keys(editedRows).length} modified transaction(s)` : 'Edit any table fields above to save'}
                >
                  <span>✓</span>
                  <span>{isBulkSaving ? 'Saving All...' : `Save All Changes (${Object.keys(editedRows).length})`}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (Object.keys(editedRows).length > 0 && !window.confirm(`Discard ${Object.keys(editedRows).length} unsaved changes?`)) {
                      return;
                    }
                    setTableMode('view');
                    setEditedRows({});
                  }}
                  className="cash-button-secondary py-1 px-2.5 text-xs font-semibold text-ink-600 hover:text-ink-900"
                >
                  {Object.keys(editedRows).length > 0 ? 'Discard & Exit' : 'Done'}
                </button>
              </div>
            )}

            <div className="flex gap-1.5">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="cash-button-secondary py-1 px-3 text-xs disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="cash-button-secondary py-1 px-3 text-xs disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Settlement / Repayment Modal */}
      {settlingExpense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-950/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl border border-ink-200 shadow-2xl w-full max-w-md p-6 space-y-5 animate-in zoom-in-95 duration-200 text-left">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🤝</span>
                <div>
                  <h3 className="text-lg font-bold text-ink-900">Receivable Repayment</h3>
                  <p className="text-xs text-ink-500 font-mono">
                    Tracking ID: <span className="font-bold text-ink-800">{settlingExpense.id}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSettlingExpense(null)}
                className="text-ink-400 hover:text-ink-600 p-1 rounded-lg hover:bg-ink-100 text-lg"
              >
                ✕
              </button>
            </div>

            {/* Overview Card */}
            <div className="p-4 bg-amber-50/70 border border-amber-200/80 rounded-2xl space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-ink-500">Description:</span>
                <span className="font-semibold text-ink-900">{settlingExpense.description || 'Lent money'}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-ink-500">Original Lent Amount:</span>
                <span className="font-bold text-ink-900">{formatCurrency(settlingExpense.amount)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-ink-500">Already Reimbursed:</span>
                <span className="font-bold text-emerald-700">{formatCurrency(settlingExpense.reimbursedAmount || 0)}</span>
              </div>
              <div className="flex justify-between text-xs pt-1.5 border-t border-amber-200/60">
                <span className="font-semibold text-amber-950">Current Unreimbursed (Counts as Expense):</span>
                <span className="font-extrabold text-amber-950 text-sm">
                  {formatCurrency(Math.max(0, settlingExpense.amount - (settlingExpense.reimbursedAmount || 0)))}
                </span>
              </div>
            </div>

            {/* Repayment Action Form */}
            <div className="space-y-3">
              <label className="cash-label block text-ink-800" htmlFor="modalRepaymentInput">
                Total Reimbursed Amount (₹)
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-ink-400">₹</span>
                <input
                  id="modalRepaymentInput"
                  type="number"
                  min="0"
                  max={settlingExpense.amount}
                  step="0.01"
                  value={repaymentInput}
                  onChange={(e) => setRepaymentInput(e.target.value)}
                  className="cash-input pl-8 text-base font-bold text-ink-900"
                  placeholder="0.00"
                />
              </div>

              {/* Quick shortcut buttons */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setRepaymentInput(String(settlingExpense.amount))}
                  className="flex-1 py-1.5 px-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold transition"
                >
                  ✅ Full Settle ({formatCurrency(settlingExpense.amount)})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const half = Number((settlingExpense.amount / 2).toFixed(2));
                    setRepaymentInput(String(half));
                  }}
                  className="flex-1 py-1.5 px-2 bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 rounded-xl text-xs font-bold transition"
                >
                  🔄 50% ({formatCurrency(settlingExpense.amount / 2)})
                </button>
                <button
                  type="button"
                  onClick={() => setRepaymentInput('0')}
                  className="py-1.5 px-2.5 bg-ink-100 hover:bg-ink-200 text-ink-700 rounded-xl text-xs font-semibold transition"
                >
                  Reset (₹0)
                </button>
              </div>

              <div className="p-3 rounded-xl bg-ink-50 text-[11px] text-ink-600 space-y-1">
                <p>
                  • Status will update to:{' '}
                  <strong className="text-ink-900 font-bold">
                    {(() => {
                      const val = parseFloat(repaymentInput) || 0;
                      if (val <= 0) return '⏳ Outstanding';
                      if (val >= settlingExpense.amount) return '✅ Settled';
                      return '🔄 Partially Settled';
                    })()}
                  </strong>
                </p>
                <p>
                  • Net Expense contribution:{' '}
                  <strong className="text-ink-900 font-bold">
                    {formatCurrency(Math.max(0, settlingExpense.amount - (parseFloat(repaymentInput) || 0)))}
                  </strong>
                  {parseFloat(repaymentInput) >= settlingExpense.amount && (
                    <span className="text-emerald-700 ml-1 font-semibold">(Excluded from net expenses!)</span>
                  )}
                </p>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                disabled={isSettlingSubmitting}
                onClick={() => {
                  const val = Math.min(settlingExpense.amount, Math.max(0, parseFloat(repaymentInput) || 0));
                  let status: 'OUTSTANDING' | 'PARTIALLY_SETTLED' | 'SETTLED' = 'OUTSTANDING';
                  if (val <= 0) status = 'OUTSTANDING';
                  else if (val >= settlingExpense.amount) status = 'SETTLED';
                  else status = 'PARTIALLY_SETTLED';

                  handleConfirmRepayment(val, status);
                }}
                className="cash-button-primary flex-1 py-2.5 text-xs font-bold"
              >
                {isSettlingSubmitting ? 'Saving...' : 'Confirm Repayment'}
              </button>
              <button
                type="button"
                onClick={() => setSettlingExpense(null)}
                className="cash-button-secondary py-2.5 px-4 text-xs font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

