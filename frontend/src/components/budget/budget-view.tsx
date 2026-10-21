'use client';

import { useEffect, useState, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { fetchExpenses, fetchCurrentUser } from '../../lib/api';
import { AuthUser, Expense, CategoryBudget } from '../../lib/types';
import {
  formatCurrency,
  DateFilterType,
  getDateFilterRange,
  filterExpensesByDateRange
} from '../../lib/finance';

const DEFAULT_BUDGET_CATEGORIES: Omit<CategoryBudget, 'id' | 'createdAt' | 'updatedAt'>[] = [
  { category: 'Food & Dining', limit: 12000, period: 'monthly', color: '#10b981', alertThreshold: 80, notes: 'Groceries, restaurants, snacks & takeout' },
  { category: 'Groceries', limit: 8000, period: 'monthly', color: '#059669', alertThreshold: 80, notes: 'Supermarket and grocery shopping' },
  { category: 'Fuel & Transport', limit: 5000, period: 'monthly', color: '#f59e0b', alertThreshold: 80, notes: 'Petrol, diesel, cab, metro & bus' },
  { category: 'Utilities & Bills', limit: 6500, period: 'monthly', color: '#6366f1', alertThreshold: 85, notes: 'Electricity, water, broadband, mobile recharge' },
  { category: 'Shopping & Apparel', limit: 7000, period: 'monthly', color: '#ec4899', alertThreshold: 75, notes: 'Clothing, electronics, personal accessories' },
  { category: 'Entertainment & OTT', limit: 3000, period: 'monthly', color: '#8b5cf6', alertThreshold: 80, notes: 'Movies, Netflix, subscriptions & events' },
  { category: 'Healthcare & Pharma', limit: 3500, period: 'monthly', color: '#ef4444', alertThreshold: 85, notes: 'Medicines, consultation & health supplies' },
  { category: 'General & Others', limit: 4000, period: 'monthly', color: '#64748b', alertThreshold: 80, notes: 'Miscellaneous everyday expenses' },
];

function getCategoryIcon(category?: string | null): string {
  const cat = (category || '').toLowerCase();
  if (cat.includes('groc') || cat.includes('supermarket') || cat.includes('veg')) return '🥦';
  if (cat.includes('food') || cat.includes('rest') || cat.includes('dining') || cat.includes('eat') || cat.includes('cafe') || cat.includes('snack') || cat.includes('swiggy') || cat.includes('zomato')) return '🍔';
  if (cat.includes('fuel') || cat.includes('petrol') || cat.includes('diesel') || cat.includes('gas')) return '⛽';
  if (cat.includes('trans') || cat.includes('cab') || cat.includes('uber') || cat.includes('ola') || cat.includes('metro') || cat.includes('auto') || cat.includes('bus')) return '🚗';
  if (cat.includes('shop') || cat.includes('cloth') || cat.includes('amazon') || cat.includes('flipkart') || cat.includes('myntra') || cat.includes('store') || cat.includes('mall')) return '🛍️';
  if (cat.includes('util') || cat.includes('bill') || cat.includes('elect') || cat.includes('water') || cat.includes('rent') || cat.includes('wifi') || cat.includes('broadband') || cat.includes('recharge')) return '⚡';
  if (cat.includes('travel') || cat.includes('flight') || cat.includes('train') || cat.includes('hotel') || cat.includes('vacation') || cat.includes('trip')) return '✈️';
  if (cat.includes('enter') || cat.includes('mov') || cat.includes('game') || cat.includes('ott') || cat.includes('sub') || cat.includes('netflix') || cat.includes('spotify') || cat.includes('prime')) return '🎬';
  if (cat.includes('health') || cat.includes('med') || cat.includes('doc') || cat.includes('pharma') || cat.includes('hospital') || cat.includes('gym') || cat.includes('fit')) return '💊';
  if (cat.includes('edu') || cat.includes('course') || cat.includes('school') || cat.includes('book') || cat.includes('college')) return '📚';
  if (cat.includes('invest') || cat.includes('stock') || cat.includes('mutual') || cat.includes('sip') || cat.includes('gold') || cat.includes('crypto')) return '📈';
  if (cat.includes('insur') || cat.includes('lic') || cat.includes('policy')) return '🛡️';
  if (cat.includes('gift') || cat.includes('donat') || cat.includes('charity')) return '🎁';
  return '💳';
}

function getStorageKey(userId?: string | null): string {
  return `cashflow_budgets_${userId || 'guest'}`;
}

export function BudgetView() {
  const searchParams = useSearchParams();
  const actionParam = searchParams.get('action');

  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [budgets, setBudgets] = useState<CategoryBudget[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Filtering and Views
  const [timeFilter, setTimeFilter] = useState<DateFilterType>('current_month');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'on_track' | 'warning' | 'danger' | 'over_budget'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<CategoryBudget | null>(null);
  const [isAutoModalOpen, setIsAutoModalOpen] = useState(false);
  const [selectedCategoryTransactions, setSelectedCategoryTransactions] = useState<string | null>(null);

  // Form State
  const [formCategory, setFormCategory] = useState('');
  const [formLimit, setFormLimit] = useState('');
  const [formPeriod, setFormPeriod] = useState<'monthly' | 'yearly'>('monthly');
  const [formAlertThreshold, setFormAlertThreshold] = useState(80);
  const [formNotes, setFormNotes] = useState('');
  const [customCategoryInput, setCustomCategoryInput] = useState('');
  const [isCustomCategory, setIsCustomCategory] = useState(false);

  // Auto-generator state
  const [autoSuggestions, setAutoSuggestions] = useState<
    { category: string; avgSpent: number; suggestedLimit: number; selected: boolean }[]
  >([]);

  // Load User, Expenses, and Budgets
  useEffect(() => {
    async function init() {
      try {
        setLoading(true);
        const [userData, expensesData] = await Promise.all([
          fetchCurrentUser().catch(() => null),
          fetchExpenses().catch(() => [])
        ]);

        setCurrentUser(userData);
        setExpenses(expensesData);

        // Load stored budgets
        const key = getStorageKey(userData?.id);
        const saved = localStorage.getItem(key);
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setBudgets(parsed);
            } else {
              initializeDefaultBudgets(userData?.id);
            }
          } catch {
            initializeDefaultBudgets(userData?.id);
          }
        } else {
          initializeDefaultBudgets(userData?.id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load budget data');
      } finally {
        setLoading(false);
      }
    }

    void init();
  }, []);

  // Handle URL action parameter (e.g. /budget?action=new)
  useEffect(() => {
    if (actionParam === 'new') {
      openAddModal();
    }
  }, [actionParam]);

  function initializeDefaultBudgets(userId?: string) {
    const initial: CategoryBudget[] = DEFAULT_BUDGET_CATEGORIES.map((cat, idx) => ({
      ...cat,
      id: `bgt_${Date.now()}_${idx}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }));
    setBudgets(initial);
    saveBudgets(initial, userId);
  }

  function saveBudgets(newBudgets: CategoryBudget[], userId?: string) {
    setBudgets(newBudgets);
    const key = getStorageKey(userId || currentUser?.id);
    localStorage.setItem(key, JSON.stringify(newBudgets));
  }

  // Active Date Range Filter
  const activeDateRange = useMemo(() => {
    return getDateFilterRange(timeFilter, customStartDate, customEndDate);
  }, [timeFilter, customStartDate, customEndDate]);

  // Expenses filtered by current period & transaction type EXPENSE
  const periodExpenses = useMemo(() => {
    const inRange = filterExpensesByDateRange(expenses, activeDateRange);
    return inRange.filter((e) => !e.transactionType || e.transactionType === 'EXPENSE');
  }, [expenses, activeDateRange]);

  // Distinct category list from existing expenses
  const existingCategories = useMemo(() => {
    const set = new Set<string>();
    expenses.forEach((e) => {
      if (e.category && e.category.trim()) {
        set.add(e.category.trim());
      }
    });
    DEFAULT_BUDGET_CATEGORIES.forEach((d) => set.add(d.category));
    return Array.from(set).sort();
  }, [expenses]);

  // Category-wise calculations
  const categoryMetrics = useMemo(() => {
    // Map spending per category
    const spentMap: Record<string, { total: number; transactions: Expense[] }> = {};
    periodExpenses.forEach((exp) => {
      const catKey = (exp.category || 'General & Others').trim().toLowerCase();
      if (!spentMap[catKey]) {
        spentMap[catKey] = { total: 0, transactions: [] };
      }
      spentMap[catKey].total += exp.amount;
      spentMap[catKey].transactions.push(exp);
    });

    const isYearlyPeriod = timeFilter === 'calendar_year' || timeFilter === 'financial_year';

    const items = budgets.map((bgt) => {
      const catKey = bgt.category.trim().toLowerCase();
      const spentData = spentMap[catKey] || { total: 0, transactions: [] };
      const spent = spentData.total;

      // Scale limit depending on selected period and budget definition
      let effectiveLimit = bgt.limit;
      if (isYearlyPeriod && bgt.period === 'monthly') {
        effectiveLimit = bgt.limit * 12;
      } else if (!isYearlyPeriod && timeFilter === 'current_month' && bgt.period === 'yearly') {
        effectiveLimit = Math.round(bgt.limit / 12);
      }

      const remaining = effectiveLimit - spent;
      const percentage = effectiveLimit > 0 ? (spent / effectiveLimit) * 100 : 0;
      const threshold = bgt.alertThreshold || 80;

      let status: 'on_track' | 'warning' | 'danger' | 'over_budget' = 'on_track';
      if (percentage > 100) {
        status = 'over_budget';
      } else if (percentage >= 90) {
        status = 'danger';
      } else if (percentage >= threshold) {
        status = 'warning';
      }

      return {
        ...bgt,
        effectiveLimit,
        spent,
        remaining,
        percentage: Number(percentage.toFixed(1)),
        status,
        transactions: spentData.transactions
      };
    });

    // Unbudgeted spending: expenses with category that has no budget item
    const budgetedCatKeys = new Set(budgets.map((b) => b.category.trim().toLowerCase()));
    const unbudgetedCategories: { category: string; spent: number; count: number }[] = [];

    Object.entries(spentMap).forEach(([catKey, data]) => {
      if (!budgetedCatKeys.has(catKey)) {
        // Find original casing from first matching expense
        const originalName = data.transactions[0]?.category || 'Uncategorized';
        unbudgetedCategories.push({
          category: originalName,
          spent: data.total,
          count: data.transactions.length
        });
      }
    });

    // Overall Totals
    const totalBudget = items.reduce((sum, item) => sum + item.effectiveLimit, 0);
    const totalSpentBudgeted = items.reduce((sum, item) => sum + item.spent, 0);
    const totalUnbudgetedSpent = unbudgetedCategories.reduce((sum, u) => sum + u.spent, 0);
    const grandTotalSpent = totalSpentBudgeted + totalUnbudgetedSpent;
    const totalRemaining = totalBudget - grandTotalSpent;
    const overallPercentage = totalBudget > 0 ? (grandTotalSpent / totalBudget) * 100 : 0;

    const onTrackCount = items.filter((i) => i.status === 'on_track').length;
    const warningCount = items.filter((i) => i.status === 'warning' || i.status === 'danger').length;
    const overBudgetCount = items.filter((i) => i.status === 'over_budget').length;

    // Monthly burn rate pacing (for Current Month)
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const currentDay = now.getDate();
    const monthProgressPercent = (currentDay / daysInMonth) * 100;
    const expectedSpendPace = (currentDay / daysInMonth) * totalBudget;
    const isPaceFaster = grandTotalSpent > expectedSpendPace && totalBudget > 0;
    const dailyAllowance = Math.max(0, totalRemaining / Math.max(1, daysInMonth - currentDay + 1));

    return {
      items,
      unbudgetedCategories,
      totalBudget,
      totalSpent: grandTotalSpent,
      totalSpentBudgeted,
      totalUnbudgetedSpent,
      totalRemaining,
      overallPercentage: Number(overallPercentage.toFixed(1)),
      onTrackCount,
      warningCount,
      overBudgetCount,
      monthProgressPercent: Number(monthProgressPercent.toFixed(1)),
      currentDay,
      daysInMonth,
      isPaceFaster,
      dailyAllowance
    };
  }, [budgets, periodExpenses, timeFilter]);

  // Filtered displayed budget cards
  const displayedItems = useMemo(() => {
    return categoryMetrics.items.filter((item) => {
      const matchesSearch =
        !searchQuery ||
        item.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.notes && item.notes.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'on_track' && item.status === 'on_track') ||
        (statusFilter === 'warning' && (item.status === 'warning' || item.status === 'danger')) ||
        (statusFilter === 'over_budget' && item.status === 'over_budget');

      return matchesSearch && matchesStatus;
    });
  }, [categoryMetrics.items, searchQuery, statusFilter]);

  // Open Create Modal
  const openAddModal = (presetCategory?: string) => {
    setEditingBudget(null);
    if (presetCategory) {
      setFormCategory(presetCategory);
      setIsCustomCategory(false);
    } else {
      setFormCategory(existingCategories[0] || 'Food & Dining');
      setIsCustomCategory(false);
    }
    setCustomCategoryInput('');
    setFormLimit('5000');
    setFormPeriod('monthly');
    setFormAlertThreshold(80);
    setFormNotes('');
    setIsModalOpen(true);
  };

  // Open Edit Modal
  const openEditModal = (bgt: CategoryBudget) => {
    setEditingBudget(bgt);
    if (existingCategories.includes(bgt.category)) {
      setFormCategory(bgt.category);
      setIsCustomCategory(false);
      setCustomCategoryInput('');
    } else {
      setFormCategory('custom');
      setIsCustomCategory(true);
      setCustomCategoryInput(bgt.category);
    }
    setFormLimit(String(bgt.limit));
    setFormPeriod(bgt.period || 'monthly');
    setFormAlertThreshold(bgt.alertThreshold || 80);
    setFormNotes(bgt.notes || '');
    setIsModalOpen(true);
  };

  // Save Add/Edit Budget
  const handleSaveBudget = (e: React.FormEvent) => {
    e.preventDefault();
    const finalCategory = isCustomCategory ? customCategoryInput.trim() : formCategory.trim();
    if (!finalCategory) {
      alert('Please specify a valid category name.');
      return;
    }

    const limitNum = Number(formLimit);
    if (isNaN(limitNum) || limitNum <= 0) {
      alert('Please enter a valid positive budget limit amount.');
      return;
    }

    const nowIso = new Date().toISOString();

    if (editingBudget) {
      const updated = budgets.map((b) =>
        b.id === editingBudget.id
          ? {
              ...b,
              category: finalCategory,
              limit: limitNum,
              period: formPeriod,
              alertThreshold: Number(formAlertThreshold),
              notes: formNotes.trim(),
              updatedAt: nowIso
            }
          : b
      );
      saveBudgets(updated);
      setSuccessMsg(`Budget for "${finalCategory}" updated successfully.`);
    } else {
      // Check if category already budgeted
      const existingIdx = budgets.findIndex(
        (b) => b.category.toLowerCase() === finalCategory.toLowerCase()
      );
      if (existingIdx >= 0) {
        if (!confirm(`A budget for "${finalCategory}" already exists. Overwrite it?`)) {
          return;
        }
        const updated = [...budgets];
        updated[existingIdx] = {
          ...updated[existingIdx],
          limit: limitNum,
          period: formPeriod,
          alertThreshold: Number(formAlertThreshold),
          notes: formNotes.trim(),
          updatedAt: nowIso
        };
        saveBudgets(updated);
        setSuccessMsg(`Budget for "${finalCategory}" updated successfully.`);
      } else {
        const newBudget: CategoryBudget = {
          id: `bgt_${Date.now()}`,
          category: finalCategory,
          limit: limitNum,
          period: formPeriod,
          alertThreshold: Number(formAlertThreshold),
          notes: formNotes.trim(),
          createdAt: nowIso,
          updatedAt: nowIso
        };
        saveBudgets([...budgets, newBudget]);
        setSuccessMsg(`New budget for "${finalCategory}" added.`);
      }
    }

    setIsModalOpen(false);
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  // Delete budget item
  const handleDeleteBudget = (id: string, category: string) => {
    if (confirm(`Are you sure you want to remove the budget for "${category}"?`)) {
      const filtered = budgets.filter((b) => b.id !== id);
      saveBudgets(filtered);
      setSuccessMsg(`Removed budget for "${category}".`);
      setTimeout(() => setSuccessMsg(''), 4000);
    }
  };

  // Quick limit increment/decrement
  const handleQuickAdjust = (budgetId: string, delta: number) => {
    const updated = budgets.map((b) => {
      if (b.id === budgetId) {
        const newLimit = Math.max(500, b.limit + delta);
        return { ...b, limit: newLimit, updatedAt: new Date().toISOString() };
      }
      return b;
    });
    saveBudgets(updated);
  };

  // Reset to Defaults
  const handleResetDefaults = () => {
    if (confirm('Reset all category budgets to suggested defaults? Any custom limits will be replaced.')) {
      initializeDefaultBudgets(currentUser?.id);
      setSuccessMsg('Budgets reset to recommended defaults.');
      setTimeout(() => setSuccessMsg(''), 4000);
    }
  };

  // Auto-Generator calculation
  const handleOpenAutoGenerator = () => {
    // Analyze expenses in past 90 days
    const catSum: Record<string, number> = {};
    const catMonths: Record<string, Set<string>> = {};

    expenses.forEach((e) => {
      if (!e.transactionType || e.transactionType === 'EXPENSE') {
        const cat = (e.category || 'General & Others').trim();
        const d = new Date(e.date);
        const monthKey = `${d.getFullYear()}-${d.getMonth()}`;

        catSum[cat] = (catSum[cat] || 0) + e.amount;
        if (!catMonths[cat]) catMonths[cat] = new Set();
        catMonths[cat].add(monthKey);
      }
    });

    const suggestions = Object.entries(catSum).map(([category, total]) => {
      const numMonths = Math.max(1, catMonths[category]?.size || 1);
      const avgSpent = Math.round(total / numMonths);
      // Suggest limit with +15% safety buffer rounded to nearest 500
      const withBuffer = avgSpent * 1.15;
      const suggestedLimit = Math.max(1000, Math.ceil(withBuffer / 500) * 500);

      return {
        category,
        avgSpent,
        suggestedLimit,
        selected: true
      };
    }).sort((a, b) => b.avgSpent - a.avgSpent);

    setAutoSuggestions(suggestions);
    setIsAutoModalOpen(true);
  };

  // Apply Auto-generated budgets
  const handleApplyAutoBudgets = () => {
    const selected = autoSuggestions.filter((s) => s.selected);
    if (selected.length === 0) {
      alert('Please select at least one category to apply.');
      return;
    }

    const nowIso = new Date().toISOString();
    const existingMap = new Map(budgets.map((b) => [b.category.toLowerCase(), b]));

    selected.forEach((s) => {
      const key = s.category.toLowerCase();
      if (existingMap.has(key)) {
        const current = existingMap.get(key)!;
        existingMap.set(key, {
          ...current,
          limit: s.suggestedLimit,
          updatedAt: nowIso
        });
      } else {
        existingMap.set(key, {
          id: `bgt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          category: s.category,
          limit: s.suggestedLimit,
          period: 'monthly',
          alertThreshold: 80,
          createdAt: nowIso,
          updatedAt: nowIso
        });
      }
    });

    const updated = Array.from(existingMap.values());
    saveBudgets(updated);
    setIsAutoModalOpen(false);
    setSuccessMsg(`Successfully generated & applied ${selected.length} category budgets.`);
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  // Render Category Transactions Modal
  const activeCategoryForModal = selectedCategoryTransactions
    ? categoryMetrics.items.find((i) => i.category === selectedCategoryTransactions)
    : null;

  if (loading) {
    return (
      <div className="min-h-screen px-4 py-8 sm:px-6 lg:px-8 bg-ink-50">
        <div className="mx-auto max-w-7xl space-y-6 text-left">
          <div className="h-10 w-48 bg-ink-150 rounded-2xl animate-pulse" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="h-32 bg-white rounded-3xl border border-ink-100 animate-pulse" />
            <div className="h-32 bg-white rounded-3xl border border-ink-100 animate-pulse" />
            <div className="h-32 bg-white rounded-3xl border border-ink-100 animate-pulse" />
            <div className="h-32 bg-white rounded-3xl border border-ink-100 animate-pulse" />
          </div>
          <div className="h-96 bg-white rounded-3xl border border-ink-100 animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-8 sm:px-6 lg:px-8 bg-ink-50">
      <div className="mx-auto max-w-7xl space-y-6">

        {/* Top Header */}
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-ink-100 pb-5">
          <div className="space-y-1 text-left">
            <div className="flex items-center gap-2.5">
              <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight text-ink-900">
                Budget Management
              </h1>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-brand-50 text-brand-700 border border-brand-200">
                Smart Tracker
              </span>
            </div>
            <p className="text-sm text-ink-500">
              Set category spending limits, track ongoing burn rates, and receive real-time alerts before exceeding caps.
            </p>
          </div>

          {/* Header Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-center shrink-0">
            <button
              onClick={() => openAddModal()}
              className="cash-button-primary py-2.5 px-4 text-xs font-semibold flex items-center gap-1.5 shadow-sm"
              title="Add a new budget target"
            >
              <span>➕ Set Category Budget</span>
            </button>
            <button
              onClick={handleOpenAutoGenerator}
              className="cash-button-secondary py-2.5 px-3.5 text-xs font-semibold flex items-center gap-1.5 hover:border-brand-300 hover:text-brand-700 transition"
              title="Calculate suggested budget caps from transaction history"
            >
              <span>⚡ Auto-Generate</span>
            </button>
            <button
              onClick={handleResetDefaults}
              className="cash-button-secondary py-2.5 px-3 text-xs font-medium text-ink-500 hover:text-ink-800"
              title="Reset to recommended standard categories"
            >
              <span>🔄 Reset</span>
            </button>
          </div>
        </header>

        {/* Feedback Messages */}
        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 text-left animate-in fade-in">
            {error}
          </div>
        )}
        {successMsg && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800 text-left animate-in fade-in flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span>✅</span> {successMsg}
            </span>
            <button onClick={() => setSuccessMsg('')} className="text-emerald-600 hover:text-emerald-900 text-xs font-bold">✕</button>
          </div>
        )}

        {/* Period Filter Bar */}
        <section className="cash-card p-4 bg-white border border-ink-150 flex flex-col md:flex-row md:items-center justify-between gap-4 text-left shadow-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-400 mr-1">Period:</span>
            <button
              onClick={() => setTimeFilter('current_month')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                timeFilter === 'current_month'
                  ? 'bg-ink-900 text-white shadow-xs'
                  : 'bg-ink-50 text-ink-600 hover:bg-ink-100 hover:text-ink-900'
              }`}
            >
              Current Month
            </button>
            <button
              onClick={() => setTimeFilter('calendar_year')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                timeFilter === 'calendar_year'
                  ? 'bg-ink-900 text-white shadow-xs'
                  : 'bg-ink-50 text-ink-600 hover:bg-ink-100 hover:text-ink-900'
              }`}
            >
              Calendar Year ({new Date().getFullYear()})
            </button>
            <button
              onClick={() => setTimeFilter('financial_year')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                timeFilter === 'financial_year'
                  ? 'bg-ink-900 text-white shadow-xs'
                  : 'bg-ink-50 text-ink-600 hover:bg-ink-100 hover:text-ink-900'
              }`}
            >
              Financial Year
            </button>
            <button
              onClick={() => setTimeFilter('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                timeFilter === 'all'
                  ? 'bg-ink-900 text-white shadow-xs'
                  : 'bg-ink-50 text-ink-600 hover:bg-ink-100 hover:text-ink-900'
              }`}
            >
              All Time
            </button>
            <button
              onClick={() => setTimeFilter('custom')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                timeFilter === 'custom'
                  ? 'bg-ink-900 text-white shadow-xs'
                  : 'bg-ink-50 text-ink-600 hover:bg-ink-100 hover:text-ink-900'
              }`}
            >
              Custom Range
            </button>
          </div>

          {/* Active Range Display / Custom Inputs */}
          <div className="flex items-center gap-3">
            {timeFilter === 'custom' ? (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="px-2.5 py-1 text-xs border border-ink-200 rounded-xl text-ink-800 bg-ink-50 focus:bg-white focus:outline-none focus:border-brand-500"
                />
                <span className="text-xs text-ink-400">to</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="px-2.5 py-1 text-xs border border-ink-200 rounded-xl text-ink-800 bg-ink-50 focus:bg-white focus:outline-none focus:border-brand-500"
                />
              </div>
            ) : (
              <span className="text-xs font-medium text-ink-500 bg-ink-50 px-3 py-1 rounded-xl border border-ink-100">
                📅 {activeDateRange.label}
              </span>
            )}
          </div>
        </section>

        {/* 4 Summary Metric Cards */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-left animate-in fade-in duration-200">
          
          {/* 1. Total Budget Limit */}
          <article className="cash-card p-5 bg-white border border-ink-150 relative overflow-hidden group hover:border-brand-300 transition-colors">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-ink-500">Total Budget Limit</p>
              <span className="w-8 h-8 rounded-full bg-brand-50 text-brand-700 flex items-center justify-center text-sm font-bold">
                🎯
              </span>
            </div>
            <p className="mt-2 text-3xl font-bold tracking-tight text-ink-900">
              {formatCurrency(categoryMetrics.totalBudget)}
            </p>
            <div className="mt-2 flex items-center justify-between text-xs text-ink-500">
              <span>{budgets.length} active category caps</span>
              <span className="font-semibold text-ink-700">100% target</span>
            </div>
          </article>

          {/* 2. Total Period Spent */}
          <article className="cash-card p-5 bg-white border border-ink-150 relative overflow-hidden group hover:border-brand-300 transition-colors">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-ink-500">Total Spent in Period</p>
              <span className="w-8 h-8 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center text-sm font-bold">
                💳
              </span>
            </div>
            <p className="mt-2 text-3xl font-bold tracking-tight text-ink-900">
              {formatCurrency(categoryMetrics.totalSpent)}
            </p>
            <div className="mt-2 flex items-center justify-between text-xs">
              <span className={`font-semibold ${categoryMetrics.overallPercentage > 100 ? 'text-red-600' : 'text-ink-600'}`}>
                {categoryMetrics.overallPercentage}% of total limit
              </span>
              <span className="text-ink-400">{periodExpenses.length} transactions</span>
            </div>
            {/* Mini Progress Bar */}
            <div className="mt-2 w-full bg-ink-100 h-1.5 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  categoryMetrics.overallPercentage > 100
                    ? 'bg-red-500'
                    : categoryMetrics.overallPercentage > 80
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
                }`}
                style={{ width: `${Math.min(100, categoryMetrics.overallPercentage)}%` }}
              />
            </div>
          </article>

          {/* 3. Safe Remaining Balance */}
          <article className="cash-card p-5 bg-white border border-ink-150 relative overflow-hidden group hover:border-brand-300 transition-colors">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-ink-500">Remaining Allowance</p>
              <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                categoryMetrics.totalRemaining >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
              }`}>
                {categoryMetrics.totalRemaining >= 0 ? '💰' : '⚠️'}
              </span>
            </div>
            <p className={`mt-2 text-3xl font-bold tracking-tight ${
              categoryMetrics.totalRemaining >= 0 ? 'text-emerald-600' : 'text-red-600'
            }`}>
              {categoryMetrics.totalRemaining >= 0 ? '+' : ''}{formatCurrency(categoryMetrics.totalRemaining)}
            </p>
            <div className="mt-2 text-xs text-ink-500">
              {timeFilter === 'current_month' ? (
                <span>~{formatCurrency(categoryMetrics.dailyAllowance)} / day safe spend</span>
              ) : (
                <span>{categoryMetrics.totalRemaining >= 0 ? 'Under total allocation' : 'Exceeded total cap'}</span>
              )}
            </div>
          </article>

          {/* 4. Budget Health & Alerts */}
          <article className="cash-card p-5 bg-white border border-ink-150 relative overflow-hidden group hover:border-brand-300 transition-colors">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-ink-500">Category Health</p>
              <span className="w-8 h-8 rounded-full bg-purple-50 text-purple-700 flex items-center justify-center text-sm font-bold">
                🛡️
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-tight text-ink-900">
                {categoryMetrics.onTrackCount}
              </span>
              <span className="text-xs font-medium text-ink-500">/ {budgets.length} On Track</span>
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs font-semibold">
              {categoryMetrics.overBudgetCount > 0 && (
                <span className="text-red-600 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                  {categoryMetrics.overBudgetCount} Over Limit
                </span>
              )}
              {categoryMetrics.warningCount > 0 && (
                <span className="text-amber-600 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  {categoryMetrics.warningCount} Near Limit
                </span>
              )}
              {categoryMetrics.overBudgetCount === 0 && categoryMetrics.warningCount === 0 && (
                <span className="text-emerald-600 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  All Budgets Optimal
                </span>
              )}
            </div>
          </article>

        </section>

        {/* Burn-rate & Pacing Insight Banner (When viewing current month) */}
        {timeFilter === 'current_month' && (
          <section className="cash-card p-5 bg-gradient-to-r from-emerald-950 to-ink-900 text-white border border-emerald-900/40 relative overflow-hidden shadow-md text-left">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1 max-w-2xl">
                <div className="flex items-center gap-2">
                  <span className="text-base">⏱️</span>
                  <h2 className="text-sm font-bold uppercase tracking-wider text-emerald-400">
                    Monthly Pace & Burn Rate Analysis
                  </h2>
                </div>
                <p className="text-xs text-ink-200 leading-relaxed">
                  {categoryMetrics.isPaceFaster ? (
                    <span>
                      ⚠️ <strong>Pace Alert:</strong> You have spent <span className="text-amber-300 font-bold">{categoryMetrics.overallPercentage}%</span> of your budget with <span className="text-emerald-300 font-bold">{categoryMetrics.monthProgressPercent}%</span> of the month elapsed (Day {categoryMetrics.currentDay} of {categoryMetrics.daysInMonth}). Consider slowing down discretionary spend.
                    </span>
                  ) : (
                    <span>
                      🎉 <strong>Excellent Pace:</strong> You have used <span className="text-emerald-300 font-bold">{categoryMetrics.overallPercentage}%</span> of your budget with <span className="text-emerald-300 font-bold">{categoryMetrics.monthProgressPercent}%</span> of the month elapsed. Your burn rate is healthy!
                    </span>
                  )}
                </p>
              </div>

              {/* Progress Indicators */}
              <div className="w-full md:w-72 shrink-0 bg-white/10 p-3 rounded-2xl border border-white/10 space-y-2">
                <div className="flex justify-between text-[11px]">
                  <span className="text-ink-300">Month Time: {categoryMetrics.monthProgressPercent}%</span>
                  <span className="text-ink-300">Spent: {categoryMetrics.overallPercentage}%</span>
                </div>
                <div className="w-full bg-black/30 h-2 rounded-full overflow-hidden flex">
                  <div
                    className="bg-emerald-400 h-full transition-all duration-500"
                    style={{ width: `${Math.min(100, categoryMetrics.overallPercentage)}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-ink-400">
                  <span>Day {categoryMetrics.currentDay} / {categoryMetrics.daysInMonth}</span>
                  <span>Safe Daily: {formatCurrency(categoryMetrics.dailyAllowance)}</span>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Unbudgeted Spending Alert (if any categories have spending without a budget) */}
        {categoryMetrics.unbudgetedCategories.length > 0 && (
          <section className="cash-card p-4 bg-amber-50/80 border border-amber-200 text-left flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in">
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
                <span>⚠️</span>
                <span>Unbudgeted Category Spending Detected</span>
              </div>
              <p className="text-xs text-amber-700">
                You spent <strong className="font-semibold">{formatCurrency(categoryMetrics.totalUnbudgetedSpent)}</strong> across {categoryMetrics.unbudgetedCategories.length} category({categoryMetrics.unbudgetedCategories.map(u => u.category).join(', ')}) without active budget caps.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {categoryMetrics.unbudgetedCategories.slice(0, 2).map((unb) => (
                <button
                  key={unb.category}
                  onClick={() => openAddModal(unb.category)}
                  className="px-3 py-1.5 rounded-xl bg-amber-200 hover:bg-amber-300 text-amber-900 text-xs font-semibold transition"
                >
                  + Add "{unb.category}"
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Categories Toolbar: Search, Status Filter & View Toggle */}
        <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-left border-b border-ink-100 pb-3">
          {/* Status Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                statusFilter === 'all'
                  ? 'bg-ink-900 text-white shadow-xs'
                  : 'bg-white border border-ink-200 text-ink-600 hover:bg-ink-50'
              }`}
            >
              All Categories ({categoryMetrics.items.length})
            </button>
            <button
              onClick={() => setStatusFilter('on_track')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                statusFilter === 'on_track'
                  ? 'bg-emerald-700 text-white shadow-xs'
                  : 'bg-white border border-ink-200 text-emerald-700 hover:bg-emerald-50'
              }`}
            >
              🟢 On Track ({categoryMetrics.onTrackCount})
            </button>
            <button
              onClick={() => setStatusFilter('warning')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                statusFilter === 'warning'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-white border border-ink-200 text-amber-700 hover:bg-amber-50'
              }`}
            >
              ⚠️ Near Limit ({categoryMetrics.warningCount})
            </button>
            <button
              onClick={() => setStatusFilter('over_budget')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                statusFilter === 'over_budget'
                  ? 'bg-red-600 text-white shadow-xs'
                  : 'bg-white border border-ink-200 text-red-700 hover:bg-red-50'
              }`}
            >
              🚨 Over Budget ({categoryMetrics.overBudgetCount})
            </button>
          </div>

          {/* Search and View Mode */}
          <div className="flex items-center gap-3">
            <div className="relative w-full sm:w-56">
              <svg
                className="absolute left-3 top-2.5 w-3.5 h-3.5 text-ink-400 pointer-events-none"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search category..."
                className="w-full bg-white border border-ink-200 focus:border-brand-500 rounded-xl py-1.5 pl-8 pr-3 text-xs text-ink-900 focus:outline-none transition shadow-xs"
              />
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center bg-white border border-ink-200 rounded-xl p-0.5 shrink-0 shadow-xs">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-lg text-xs transition ${
                  viewMode === 'grid' ? 'bg-ink-900 text-white' : 'text-ink-500 hover:text-ink-900'
                }`}
                title="Grid View"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-lg text-xs transition ${
                  viewMode === 'table' ? 'bg-ink-900 text-white' : 'text-ink-500 hover:text-ink-900'
                }`}
                title="Table View"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
              </button>
            </div>
          </div>
        </section>

        {/* Main Content: Category Budgets (Grid or Table) */}
        {displayedItems.length === 0 ? (
          <div className="cash-card p-12 bg-white border border-ink-150 text-center space-y-3">
            <span className="text-4xl">🎯</span>
            <h3 className="text-base font-semibold text-ink-900">No category budgets match your criteria</h3>
            <p className="text-xs text-ink-500 max-w-md mx-auto">
              {searchQuery || statusFilter !== 'all'
                ? 'Try adjusting your search filters or status selection to see more categories.'
                : 'Get started by creating your first category budget target or auto-generating from history.'}
            </p>
            <div className="pt-2 flex justify-center gap-3">
              <button
                onClick={() => openAddModal()}
                className="cash-button-primary py-2 px-4 text-xs font-semibold"
              >
                + Add Category Budget
              </button>
              {(searchQuery || statusFilter !== 'all') && (
                <button
                  onClick={() => { setSearchQuery(''); setStatusFilter('all'); }}
                  className="cash-button-secondary py-2 px-3 text-xs font-medium"
                >
                  Clear Filters
                </button>
              )}
            </div>
          </div>
        ) : viewMode === 'grid' ? (
          /* Card Grid View */
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 text-left animate-in fade-in duration-200">
            {displayedItems.map((item) => {
              const icon = getCategoryIcon(item.category);
              const isOver = item.status === 'over_budget';
              const isDanger = item.status === 'danger';
              const isWarning = item.status === 'warning';

              return (
                <div
                  key={item.id}
                  className={`cash-card p-5 bg-white border transition-all duration-200 flex flex-col justify-between group hover:shadow-card hover:-translate-y-0.5 ${
                    isOver
                      ? 'border-red-300 ring-2 ring-red-100'
                      : isDanger
                      ? 'border-orange-300 ring-2 ring-orange-50'
                      : isWarning
                      ? 'border-amber-300'
                      : 'border-ink-150'
                  }`}
                >
                  <div>
                    {/* Header: Icon, Category Name, Period badge */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-10 h-10 rounded-2xl bg-ink-50 border border-ink-100 flex items-center justify-center text-xl shrink-0 group-hover:scale-105 transition-transform">
                          {icon}
                        </span>
                        <div className="min-w-0">
                          <h3 className="text-sm font-bold text-ink-900 truncate" title={item.category}>
                            {item.category}
                          </h3>
                          <span className="text-[11px] text-ink-400 capitalize">
                            {item.period} Cap
                          </span>
                        </div>
                      </div>

                      {/* Status Badge */}
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase shrink-0 ${
                          isOver
                            ? 'bg-red-100 text-red-700'
                            : isDanger
                            ? 'bg-orange-100 text-orange-700'
                            : isWarning
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-emerald-100 text-emerald-700'
                        }`}
                      >
                        {isOver ? 'Over Cap' : isDanger ? 'Critical' : isWarning ? 'Near Cap' : 'On Track'}
                      </span>
                    </div>

                    {/* Spend Numbers */}
                    <div className="mt-4 flex items-baseline justify-between">
                      <span className="text-lg font-bold text-ink-900 tracking-tight">
                        {formatCurrency(item.spent)}
                      </span>
                      <span className="text-xs text-ink-400 font-medium">
                        of {formatCurrency(item.effectiveLimit)}
                      </span>
                    </div>

                    {/* Animated Dynamic Progress Bar */}
                    <div className="mt-2 w-full bg-ink-100 h-2.5 rounded-full overflow-hidden relative">
                      <div
                        className={`h-full rounded-full transition-all duration-600 ${
                          isOver
                            ? 'bg-gradient-to-r from-red-500 to-rose-600'
                            : isDanger
                            ? 'bg-gradient-to-r from-amber-500 to-orange-500'
                            : isWarning
                            ? 'bg-gradient-to-r from-yellow-400 to-amber-500'
                            : 'bg-gradient-to-r from-emerald-500 to-teal-500'
                        }`}
                        style={{ width: `${Math.min(100, item.percentage)}%` }}
                      />
                    </div>

                    {/* Percentage & Remaining Text */}
                    <div className="mt-2 flex items-center justify-between text-xs font-semibold">
                      <span className={isOver ? 'text-red-600' : isDanger ? 'text-orange-600' : isWarning ? 'text-amber-600' : 'text-emerald-700'}>
                        {item.percentage}% used
                      </span>
                      <span className={item.remaining >= 0 ? 'text-ink-600' : 'text-red-600 font-bold'}>
                        {item.remaining >= 0 ? `${formatCurrency(item.remaining)} left` : `Over by ${formatCurrency(Math.abs(item.remaining))}`}
                      </span>
                    </div>

                    {/* Notes if any */}
                    {item.notes && (
                      <p className="mt-2 text-[11px] text-ink-400 italic line-clamp-1" title={item.notes}>
                        "{item.notes}"
                      </p>
                    )}
                  </div>

                  {/* Quick Actions Footer */}
                  <div className="mt-4 pt-3 border-t border-ink-100 flex items-center justify-between gap-1">
                    {/* View Transactions link */}
                    <button
                      onClick={() => setSelectedCategoryTransactions(item.category)}
                      className="text-[11px] font-semibold text-brand-700 hover:text-brand-900 transition flex items-center gap-1"
                    >
                      <span>📜 {item.transactions.length} txns</span>
                    </button>

                    {/* Quick +₹500 / -₹500 buttons and Edit/Delete icons */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleQuickAdjust(item.id, -500)}
                        title="Reduce budget limit by ₹500"
                        className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-ink-50 hover:bg-ink-150 text-ink-600 border border-ink-200 transition"
                      >
                        -500
                      </button>
                      <button
                        onClick={() => handleQuickAdjust(item.id, 500)}
                        title="Increase budget limit by ₹500"
                        className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-ink-50 hover:bg-ink-150 text-ink-600 border border-ink-200 transition"
                      >
                        +500
                      </button>
                      <button
                        onClick={() => openEditModal(item)}
                        title="Edit budget details"
                        className="p-1 rounded text-ink-400 hover:text-ink-800 hover:bg-ink-100 transition"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => handleDeleteBudget(item.id, item.category)}
                        title="Remove this budget"
                        className="p-1 rounded text-ink-400 hover:text-red-600 hover:bg-red-50 transition"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Table View */
          <div className="cash-card p-6 bg-white border border-ink-150 text-left overflow-x-auto shadow-xs">
            <table className="min-w-full divide-y divide-ink-100 text-xs">
              <thead className="bg-ink-50 text-ink-500 font-semibold">
                <tr>
                  <th className="px-4 py-3 rounded-l-2xl text-left">Category</th>
                  <th className="px-3 py-3 text-left">Period</th>
                  <th className="px-4 py-3 text-right">Limit Target</th>
                  <th className="px-4 py-3 text-right">Actual Spent</th>
                  <th className="px-4 py-3 text-right">Balance</th>
                  <th className="px-4 py-3 text-left min-w-[140px]">Usage Bar</th>
                  <th className="px-3 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-center rounded-r-2xl">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100 bg-white">
                {displayedItems.map((item) => {
                  const icon = getCategoryIcon(item.category);
                  const isOver = item.status === 'over_budget';
                  const isWarning = item.status === 'warning' || item.status === 'danger';

                  return (
                    <tr key={item.id} className="hover:bg-ink-50/60 transition-colors">
                      <td className="px-4 py-3.5 text-left font-bold text-ink-900 flex items-center gap-2.5">
                        <span className="text-base">{icon}</span>
                        <div>
                          <span>{item.category}</span>
                          {item.notes && <p className="text-[10px] text-ink-400 font-normal">{item.notes}</p>}
                        </div>
                      </td>
                      <td className="px-3 py-3.5 text-left text-ink-500 capitalize">{item.period}</td>
                      <td className="px-4 py-3.5 text-right font-semibold text-ink-800">{formatCurrency(item.effectiveLimit)}</td>
                      <td className="px-4 py-3.5 text-right font-bold text-ink-900">{formatCurrency(item.spent)}</td>
                      <td className={`px-4 py-3.5 text-right font-bold ${item.remaining >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {formatCurrency(item.remaining)}
                      </td>
                      <td className="px-4 py-3.5 text-left">
                        <div className="w-full bg-ink-100 h-2 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              isOver ? 'bg-red-500' : isWarning ? 'bg-amber-500' : 'bg-emerald-500'
                            }`}
                            style={{ width: `${Math.min(100, item.percentage)}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-ink-400 font-medium">{item.percentage}%</span>
                      </td>
                      <td className="px-3 py-3.5 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            isOver
                              ? 'bg-red-100 text-red-700'
                              : isWarning
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-emerald-100 text-emerald-700'
                          }`}
                        >
                          {isOver ? 'Over' : isWarning ? 'Warning' : 'OK'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => setSelectedCategoryTransactions(item.category)}
                            className="p-1 rounded text-ink-400 hover:text-brand-700 transition"
                            title="View category transactions"
                          >
                            📜
                          </button>
                          <button
                            onClick={() => openEditModal(item)}
                            className="p-1 rounded text-ink-400 hover:text-ink-800 transition"
                            title="Edit budget"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => handleDeleteBudget(item.id, item.category)}
                            className="p-1 rounded text-ink-400 hover:text-red-600 transition"
                            title="Delete"
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

      </div>

      {/* Add / Edit Budget Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/60 backdrop-blur-sm animate-in fade-in duration-200 text-left">
          <div className="cash-card max-w-md w-full p-6 bg-white animate-in zoom-in duration-200">
            <div className="mb-4 flex items-center justify-between border-b border-ink-100 pb-3">
              <div>
                <h3 className="text-xl font-semibold text-ink-900">
                  {editingBudget ? 'Edit Category Budget' : 'Set Category Budget'}
                </h3>
                <p className="text-xs text-ink-500">
                  Configure monthly spending limit, threshold warning, and notes.
                </p>
              </div>
              <button
                type="button"
                className="rounded-full p-1.5 text-ink-400 hover:bg-ink-100 transition"
                onClick={() => setIsModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveBudget} className="space-y-4">
              {/* Category selector */}
              <div>
                <label className="cash-label">Expense Category</label>
                {!isCustomCategory ? (
                  <select
                    value={formCategory}
                    onChange={(e) => {
                      if (e.target.value === 'custom') {
                        setIsCustomCategory(true);
                        setCustomCategoryInput('');
                      } else {
                        setFormCategory(e.target.value);
                      }
                    }}
                    className="cash-input"
                  >
                    {existingCategories.map((c) => (
                      <option key={c} value={c}>
                        {getCategoryIcon(c)} {c}
                      </option>
                    ))}
                    <option value="custom">➕ + Custom Category Name...</option>
                  </select>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g. Pet Care, Subscriptions, Golf..."
                      value={customCategoryInput}
                      onChange={(e) => setCustomCategoryInput(e.target.value)}
                      className="cash-input flex-1"
                      required
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setIsCustomCategory(false);
                        setFormCategory(existingCategories[0] || 'Food & Dining');
                      }}
                      className="px-3 py-2 text-xs font-semibold text-ink-500 hover:text-ink-800 bg-ink-50 rounded-2xl border border-ink-200"
                    >
                      Preset
                    </button>
                  </div>
                )}
              </div>

              {/* Limit Amount and Period */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="cash-label">Target Limit (₹)</label>
                  <input
                    type="number"
                    min="1"
                    step="100"
                    placeholder="5000"
                    value={formLimit}
                    onChange={(e) => setFormLimit(e.target.value)}
                    className="cash-input font-bold"
                    required
                  />
                </div>
                <div>
                  <label className="cash-label">Period</label>
                  <select
                    value={formPeriod}
                    onChange={(e) => setFormPeriod(e.target.value as 'monthly' | 'yearly')}
                    className="cash-input"
                  >
                    <option value="monthly">Monthly Cap</option>
                    <option value="yearly">Annual / Yearly Cap</option>
                  </select>
                </div>
              </div>

              {/* Alert Threshold Slider */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-semibold text-ink-700">Alert Warning Threshold</label>
                  <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                    {formAlertThreshold}% of budget
                  </span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="100"
                  step="5"
                  value={formAlertThreshold}
                  onChange={(e) => setFormAlertThreshold(Number(e.target.value))}
                  className="w-full accent-brand-600 h-2 bg-ink-100 rounded-lg cursor-pointer"
                />
                <span className="text-[10px] text-ink-400">
                  You'll be alerted when spending reaches {formAlertThreshold}% of your limit.
                </span>
              </div>

              {/* Notes */}
              <div>
                <label className="cash-label">Notes & Description (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Maximum allowance for weekend dining & coffee"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="cash-input text-xs"
                />
              </div>

              {/* Buttons */}
              <div className="border-t border-ink-100 pt-4 flex gap-3">
                <button
                  type="submit"
                  className="cash-button-primary flex-1 py-2.5 text-xs font-semibold shadow-sm"
                >
                  {editingBudget ? 'Save Changes' : 'Create Budget'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="cash-button-secondary py-2.5 text-xs font-semibold"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Auto-Generator Modal */}
      {isAutoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/60 backdrop-blur-sm animate-in fade-in duration-200 text-left">
          <div className="cash-card max-w-lg w-full p-6 bg-white animate-in zoom-in duration-200 max-h-[90vh] flex flex-col justify-between">
            <div>
              <div className="mb-4 flex items-center justify-between border-b border-ink-100 pb-3">
                <div>
                  <h3 className="text-xl font-semibold text-ink-900 flex items-center gap-2">
                    <span>⚡</span> Auto-Generate Smart Budgets
                  </h3>
                  <p className="text-xs text-ink-500">
                    Calculated from your past transactions with a suggested 15% safety buffer.
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded-full p-1.5 text-ink-400 hover:bg-ink-100 transition"
                  onClick={() => setIsAutoModalOpen(false)}
                >
                  ✕
                </button>
              </div>

              {autoSuggestions.length === 0 ? (
                <div className="py-8 text-center text-xs text-ink-400">
                  No previous expense history found to calculate averages.
                </div>
              ) : (
                <div className="space-y-3 overflow-y-auto max-h-80 pr-1">
                  {autoSuggestions.map((sug, idx) => (
                    <div
                      key={sug.category}
                      className="p-3 bg-ink-50/70 border border-ink-150 rounded-2xl flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={sug.selected}
                          onChange={(e) => {
                            const updated = [...autoSuggestions];
                            updated[idx].selected = e.target.checked;
                            setAutoSuggestions(updated);
                          }}
                          className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500"
                        />
                        <div>
                          <p className="text-xs font-bold text-ink-900 flex items-center gap-1">
                            <span>{getCategoryIcon(sug.category)}</span> {sug.category}
                          </p>
                          <p className="text-[10px] text-ink-400">
                            Historical Monthly Avg: {formatCurrency(sug.avgSpent)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-ink-400">Cap:</span>
                        <input
                          type="number"
                          value={sug.suggestedLimit}
                          onChange={(e) => {
                            const updated = [...autoSuggestions];
                            updated[idx].suggestedLimit = Number(e.target.value);
                            setAutoSuggestions(updated);
                          }}
                          className="w-24 text-right px-2 py-1 text-xs font-bold border border-ink-200 rounded-lg bg-white"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-ink-100 pt-4 mt-4 flex gap-3">
              <button
                type="button"
                onClick={handleApplyAutoBudgets}
                className="cash-button-primary flex-1 py-2.5 text-xs font-semibold"
              >
                Apply Selected Budgets
              </button>
              <button
                type="button"
                onClick={() => setIsAutoModalOpen(false)}
                className="cash-button-secondary py-2.5 text-xs font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Category Transactions Drawer/Modal */}
      {selectedCategoryTransactions && activeCategoryForModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/60 backdrop-blur-sm animate-in fade-in duration-200 text-left">
          <div className="cash-card max-w-xl w-full p-6 bg-white animate-in zoom-in duration-200 max-h-[85vh] flex flex-col justify-between">
            <div>
              <div className="mb-4 flex items-center justify-between border-b border-ink-100 pb-3">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{getCategoryIcon(activeCategoryForModal.category)}</span>
                  <div>
                    <h3 className="text-lg font-bold text-ink-900">
                      {activeCategoryForModal.category} Transactions
                    </h3>
                    <p className="text-xs text-ink-500">
                      Total {formatCurrency(activeCategoryForModal.spent)} spent of {formatCurrency(activeCategoryForModal.effectiveLimit)} limit in {activeDateRange.shortLabel}.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="rounded-full p-1.5 text-ink-400 hover:bg-ink-100 transition"
                  onClick={() => setSelectedCategoryTransactions(null)}
                >
                  ✕
                </button>
              </div>

              {/* Transactions List */}
              {activeCategoryForModal.transactions.length === 0 ? (
                <div className="py-12 text-center text-xs text-ink-400">
                  No transactions recorded for this category in the selected period.
                </div>
              ) : (
                <div className="overflow-y-auto max-h-96 divide-y divide-ink-100 pr-1">
                  {activeCategoryForModal.transactions.map((txn) => (
                    <div key={txn.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                      <div>
                        <p className="font-semibold text-ink-900">{txn.description || 'Expense'}</p>
                        <p className="text-[11px] text-ink-400">
                          {new Date(txn.date).toLocaleDateString('default', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          })} • {txn.paymentMethod || 'Card'}
                        </p>
                      </div>
                      <span className="font-bold text-red-600">
                        -{formatCurrency(txn.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-ink-100 pt-4 mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedCategoryTransactions(null)}
                className="cash-button-secondary py-2 px-4 text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
