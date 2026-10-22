'use client';

import React, { useState, useMemo } from 'react';
import { AuthUser, Expense } from '../../../lib/types';
import { formatCurrency, DateFilterType, getDisplayTrackingId } from '../../../lib/finance';

export type BottomSectionTab = 'DIRECT' | 'TRANSFERS' | 'ALL';

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
  periodLabel: string;
  title?: string;
  transactionType?: 'EXPENSE' | 'INCOME';
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
  transactionType = 'EXPENSE'
}: ExpenseTableProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [sectionTab, setSectionTab] = useState<BottomSectionTab>('DIRECT');
  const pageSize = 12;

  // Split into direct transactions vs transfers
  const directList = useMemo(() => {
    return expenses.filter((e) => {
      if (transactionType === 'EXPENSE') {
        return !e.transactionType || e.transactionType === 'EXPENSE';
      }
      if (transactionType === 'INCOME') {
        return e.transactionType === 'INCOME';
      }
      return true;
    });
  }, [expenses, transactionType]);

  const transferList = useMemo(() => {
    return expenses.filter((e) => {
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
  }, [expenses, transactionType, currentUser]);

  const combinedList = useMemo(() => {
    return [...directList, ...transferList];
  }, [directList, transferList]);

  // Tab summary metrics
  const directCount = directList.length;
  const directTotal = useMemo(() => directList.reduce((acc, curr) => acc + curr.amount, 0), [directList]);

  const transfersCount = transferList.length;
  const transfersTotal = useMemo(() => transferList.reduce((acc, curr) => acc + curr.amount, 0), [transferList]);

  const allCount = combinedList.length;
  const allTotal = directTotal + transfersTotal;

  // Active base list depending on selected bottom section tab
  const activeBaseList = useMemo(() => {
    if (sectionTab === 'TRANSFERS') return transferList;
    if (sectionTab === 'ALL') return combinedList;
    return directList;
  }, [sectionTab, directList, transferList, combinedList]);

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

  const totalAmount = useMemo(() => {
    return filteredList.reduce((acc, curr) => acc + curr.amount, 0);
  }, [filteredList]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredList.length / pageSize));
  const paginatedList = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredList.slice(start, start + pageSize);
  }, [filteredList, currentPage, pageSize]);

  const hasActiveSecondaryFilters = searchQuery || categoryFilter || tagFilter || categoryTypeFilter;

  const resetSecondaryFilters = () => {
    setSearchQuery('');
    setCategoryFilter('');
    setTagFilter('');
    setCategoryTypeFilter('');
    setCurrentPage(1);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

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
            <p className="text-xs text-ink-500 mt-1">
              Showing detailed records with live category, date, and keyword filters.
            </p>
          </div>

          {/* Date Range Selector & Refresh */}
          <div className="flex flex-wrap items-center gap-2">
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
                <option value="current_month">Current Month</option>
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

            {/* Refresh Button */}
            <button
              className="cash-button-secondary py-1.5 px-3 text-xs flex items-center gap-1.5 font-semibold text-ink-700 hover:text-ink-900 border-ink-200 hover:border-ink-300 shadow-2xs transition"
              type="button"
              disabled={isRefreshing}
              onClick={handleRefresh}
              title="Refresh transaction list"
            >
              <svg
                className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin text-brand-600' : 'text-ink-500'}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Secondary Filter Controls Row */}
        <div className="mt-4 pt-4 border-t border-ink-100/70 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {/* Search input */}
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 pointer-events-none text-ink-400">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input
              className="cash-input pl-8 py-1.5 text-xs w-full bg-white"
              placeholder="Search tracking ID, note, tags, users..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>

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

        {/* Summary Info Bar */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs font-medium text-ink-600 bg-ink-50/80 rounded-xl px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="text-ink-400">Period:</span>
            <span className="font-semibold text-brand-700 bg-brand-50 border border-brand-200/60 rounded-md px-2 py-0.5 text-[11px]">
              {periodLabel}
            </span>
            <span className="text-ink-300">•</span>
            <span className="text-ink-500 font-semibold">
              View:{' '}
              <strong className="text-brand-800">
                {sectionTab === 'DIRECT'
                  ? transactionType === 'EXPENSE' ? 'Direct Expenses' : 'Direct Income'
                  : sectionTab === 'TRANSFERS'
                  ? transactionType === 'EXPENSE' ? 'Outgoing Transfers' : 'Incoming Transfers'
                  : 'All Combined'}
              </strong>
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span>
              Transactions: <strong className="text-ink-900">{filteredList.length}</strong>
            </span>
            <span>
              Total{' '}
              {transactionType === 'INCOME'
                ? sectionTab === 'TRANSFERS'
                  ? 'Transfers In'
                  : 'Income'
                : sectionTab === 'TRANSFERS'
                ? 'Transfers Out'
                : 'Outflow'}
              :{' '}
              <strong
                className={
                  transactionType === 'INCOME' && sectionTab !== 'TRANSFERS'
                    ? 'text-emerald-700 font-bold'
                    : transactionType === 'INCOME' && sectionTab === 'TRANSFERS'
                    ? 'text-emerald-700 font-bold'
                    : 'text-rose-700 font-bold'
                }
              >
                {formatCurrency(totalAmount)}
              </strong>
            </span>
          </div>
        </div>
      </div>

      {/* Full-Level Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-ink-100 text-left text-xs sm:text-sm">
          <thead className="bg-ink-50/90 text-ink-600 font-semibold uppercase tracking-wider text-[11px]">
            <tr>
              <th className="px-4 py-3 sm:px-5 sm:py-3.5">Tracking ID</th>
              <th className="px-4 py-3 sm:px-5 sm:py-3.5">Date & Time</th>
              <th className="px-4 py-3 sm:px-5 sm:py-3.5">Description & Tags</th>
              <th className="px-4 py-3 sm:px-5 sm:py-3.5">Category</th>
              <th className="px-4 py-3 sm:px-5 sm:py-3.5">Type</th>
              <th className="px-4 py-3 sm:px-5 sm:py-3.5">Method</th>
              <th className="px-4 py-3 sm:px-5 sm:py-3.5 text-right">Amount</th>
              <th className="px-4 py-3 sm:px-5 sm:py-3.5 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100 bg-white">
            {loading ? (
              <tr>
                <td className="px-6 py-12 text-center text-ink-500 font-medium" colSpan={8}>
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
                <td className="px-6 py-12 text-center text-ink-500" colSpan={8}>
                  <div className="flex flex-col items-center justify-center gap-2 max-w-sm mx-auto">
                    <div className="w-10 h-10 rounded-full bg-ink-100 flex items-center justify-center text-ink-400">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <p className="text-sm font-semibold text-ink-800">
                      No{' '}
                      {sectionTab === 'TRANSFERS'
                        ? transactionType === 'EXPENSE' ? 'outgoing transfers' : 'incoming transfers'
                        : sectionTab === 'ALL'
                        ? 'transactions'
                        : `${transactionType.toLowerCase()}s`}{' '}
                      found
                    </p>
                    <p className="text-xs text-ink-400">
                      {hasActiveSecondaryFilters
                        ? 'Try clearing the search or category filters, or select a different time range.'
                        : sectionTab === 'TRANSFERS'
                        ? transactionType === 'EXPENSE'
                          ? 'Send a transfer to another group member from the form to record an outgoing transfer.'
                          : 'Incoming transfers received from your group members will appear here.'
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
                const isDirectExpense = !expense.transactionType || expense.transactionType === 'EXPENSE';
                const isDirectIncome = expense.transactionType === 'INCOME';
                const isNegative = isDirectExpense || isOutgoingTransfer;
                const trackingId = getDisplayTrackingId(expense, currentUser?.id);

                return (
                  <tr key={expense.id} className="hover:bg-ink-50/70 transition-colors group">
                    {/* Tracking ID with exact TE/TI 8-char or E/I 9-char formatting */}
                    <td className="px-4 py-3 sm:px-5 sm:py-3.5 whitespace-nowrap">
                      {isOutgoingTransfer ? (
                        <button
                          type="button"
                          onClick={() => {
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
                          onClick={() => {
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
                          onClick={() => {
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
                    <td className="px-4 py-3 sm:px-5 sm:py-3.5 text-ink-700 whitespace-nowrap">
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
                    </td>

                    {/* Description & Tags */}
                    <td className="px-4 py-3 sm:px-5 sm:py-3.5 max-w-xs">
                      {isOutgoingTransfer ? (
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
                        <div className="font-medium text-ink-900 truncate" title={expense.description || ''}>
                          {expense.description || <span className="text-ink-300 italic">No note</span>}
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
                    </td>

                    {/* Category */}
                    <td className="px-4 py-3 sm:px-5 sm:py-3.5 whitespace-nowrap">
                      {isTransfer ? (
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

                    {/* Category Type */}
                    <td className="px-4 py-3 sm:px-5 sm:py-3.5 whitespace-nowrap">
                      {isOutgoingTransfer ? (
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
                    <td className="px-4 py-3 sm:px-5 sm:py-3.5 text-ink-600 whitespace-nowrap text-xs">
                      {expense.paymentMethod || (isTransfer ? 'Transfer' : 'Card')}
                    </td>

                    {/* Amount */}
                    <td className="px-4 py-3 sm:px-5 sm:py-3.5 text-right whitespace-nowrap font-bold">
                      <span className={isNegative ? 'text-rose-600' : 'text-emerald-600'}>
                        {isNegative ? '-' : '+'}{formatCurrency(expense.amount)}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 sm:px-5 sm:py-3.5 text-center whitespace-nowrap">
                      {isIncomingTransfer ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200" title="Incoming transfers are managed by sender">
                          Received
                        </span>
                      ) : (
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              onEditExpense(expense);
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                            className="px-2.5 py-1 rounded-lg text-xs font-semibold text-ink-700 hover:text-brand-700 hover:bg-brand-50 border border-ink-200/80 transition"
                            title="Edit transaction"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteExpense(expense.id)}
                            className="px-2.5 py-1 rounded-lg text-xs font-semibold text-rose-600 hover:text-rose-800 hover:bg-rose-50 border border-rose-100 transition"
                            title="Delete transaction"
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

      {/* Interactive Bottom Section Tabs Bar */}
      <div className="border-t border-ink-200 bg-gradient-to-r from-ink-50/90 via-white to-ink-50/90 px-4 py-3 sm:px-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-ink-500">
              {transactionType === 'EXPENSE' ? 'Expense Category Tabs:' : 'Income Category Tabs:'}
            </span>
          </div>

          <div className="inline-flex p-1 bg-ink-100/80 rounded-2xl border border-ink-200/80 shadow-2xs gap-1 flex-wrap sm:flex-nowrap">
            {/* Tab 1: Direct Transactions */}
            <button
              type="button"
              onClick={() => {
                setSectionTab('DIRECT');
                setCurrentPage(1);
              }}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                sectionTab === 'DIRECT'
                  ? 'bg-white text-ink-900 shadow-sm border border-ink-200/60'
                  : 'text-ink-600 hover:text-ink-900 hover:bg-white/50'
              }`}
            >
              <span>{transactionType === 'EXPENSE' ? '💳 Direct Expenses' : '💰 Direct Income'}</span>
              <span className="text-[10px] font-mono opacity-60">
                {transactionType === 'EXPENSE' ? '(E...)' : '(I...)'}
              </span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                  sectionTab === 'DIRECT' ? 'bg-brand-100 text-brand-800' : 'bg-ink-200/60 text-ink-700'
                }`}
              >
                {directCount}
              </span>
              <span className="text-[11px] font-semibold text-ink-500 hidden md:inline">
                • {formatCurrency(directTotal)}
              </span>
            </button>

            {/* Tab 2: Transfers (Outgoing TE or Incoming TI) */}
            <button
              type="button"
              onClick={() => {
                setSectionTab('TRANSFERS');
                setCurrentPage(1);
              }}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                sectionTab === 'TRANSFERS'
                  ? transactionType === 'EXPENSE'
                    ? 'bg-white text-amber-900 shadow-sm border border-amber-300 ring-1 ring-amber-300'
                    : 'bg-white text-emerald-900 shadow-sm border border-emerald-300 ring-1 ring-emerald-300'
                  : 'text-ink-600 hover:text-ink-900 hover:bg-white/50'
              }`}
            >
              <span>{transactionType === 'EXPENSE' ? '↗ Outgoing Transfers' : '↙ Incoming Transfers'}</span>
              <span className="text-[10px] font-mono font-bold opacity-80">
                {transactionType === 'EXPENSE' ? '(TE...)' : '(TI...)'}
              </span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                  sectionTab === 'TRANSFERS'
                    ? transactionType === 'EXPENSE'
                      ? 'bg-amber-100 text-amber-900'
                      : 'bg-emerald-100 text-emerald-900'
                    : 'bg-ink-200/60 text-ink-700'
                }`}
              >
                {transfersCount}
              </span>
              <span className="text-[11px] font-semibold text-ink-500 hidden md:inline">
                • {formatCurrency(transfersTotal)}
              </span>
            </button>

            {/* Tab 3: All Outflows / Inflows */}
            <button
              type="button"
              onClick={() => {
                setSectionTab('ALL');
                setCurrentPage(1);
              }}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                sectionTab === 'ALL'
                  ? 'bg-white text-ink-900 shadow-sm border border-ink-200/60'
                  : 'text-ink-600 hover:text-ink-900 hover:bg-white/50'
              }`}
            >
              <span>{transactionType === 'EXPENSE' ? '📊 All Outflows' : '📊 All Inflows'}</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                  sectionTab === 'ALL' ? 'bg-brand-100 text-brand-800' : 'bg-ink-200/60 text-ink-700'
                }`}
              >
                {allCount}
              </span>
              <span className="text-[11px] font-semibold text-ink-500 hidden md:inline">
                • {formatCurrency(allTotal)}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="p-4 border-t border-ink-100 flex items-center justify-between bg-ink-50/40 text-xs">
          <span className="text-ink-500">
            Page <strong className="text-ink-800">{currentPage}</strong> of <strong className="text-ink-800">{totalPages}</strong>
          </span>
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
      )}
    </div>
  );
}

