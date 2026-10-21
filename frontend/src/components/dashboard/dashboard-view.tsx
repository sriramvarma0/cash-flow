'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  deleteExpense,
  fetchExpenses,
  createExpense,
  updateExpense,
  createExpensesBulk,
  fetchCurrentUser,
  fetchGroups,
  fetchGroupExpenses,
  fetchInvestments,
  updateInvestmentTransaction,
  deleteInvestmentTransaction
} from '../../lib/api';
import { AuthUser, Expense, Investment } from '../../lib/types';
import {
  categoryBreakdown,
  formatCurrency,
  monthlyExpenses,
  totalExpenses,
  totalIncome,
  transfersSent,
  transfersReceived,
  totalOutflow,
  DateFilterType,
  getDateFilterRange,
  filterExpensesByDateRange,
  generateSpendingTrend
} from '../../lib/finance';

import { DashboardStats } from './components/DashboardStats';
import { DashboardCharts } from './components/DashboardCharts';
import { TransactionList } from './components/TransactionList';
import { TransactionForm } from './components/TransactionForm';
import { AIBulkAdd } from './components/AIBulkAdd';
import { DashboardHeader } from './components/DashboardHeader';
import { ExpenseTable } from './components/ExpenseTable';

const paymentMethods = ['Card', 'Cash', 'Bank transfer', 'Wallet'];
const categoryPalette = ['#0d533c', '#17a66b', '#3ecb8e', '#7fe0b5', '#a6bbbb', '#5b7676'];

function getLocalDateTimeString() {
  const tzoffset = new Date().getTimezoneOffset() * 60000;
  return new Date(Date.now() - tzoffset).toISOString().slice(0, 16);
}

function parseAILocalDate(dateStr: string): Date {
  let cleanStr = dateStr.trim();

  // Handle YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleanStr)) {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    cleanStr = `${cleanStr}T${hours}:${minutes}`;
  }
  // Handle YYYY-MM-DD HH:mm or YYYY-MM-DDTHH:mm format
  else if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?$/.test(cleanStr)) {
    cleanStr = cleanStr.replace(' ', 'T');
  }

  const d = new Date(cleanStr);
  if (isNaN(d.getTime())) {
    return new Date();
  }
  return d;
}

function formatToDateTimeLocal(d: Date): string {
  let targetDate = d;
  if (isNaN(targetDate.getTime())) {
    targetDate = new Date();
  }
  const year = targetDate.getFullYear();
  const month = String(targetDate.getMonth() + 1).padStart(2, '0');
  const day = String(targetDate.getDate()).padStart(2, '0');
  const hours = String(targetDate.getHours()).padStart(2, '0');
  const minutes = String(targetDate.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function emptyForm(defaultType = 'EXPENSE') {
  return {
    amount: '',
    category: '',
    description: '',
    paymentMethod: 'Card',
    date: getLocalDateTimeString(),
    transactionType: defaultType,
    toUserId: '',
    tags: '',
    categoryType: ''
  };
}

function getTransactionTitle(expense: Expense, currentUserId?: string | null) {
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
  if (expense.transactionType === 'INVESTMENT') {
    return `Investment: ${expense.category || 'Portfolio'}`;
  }
  return expense.category || 'Expense';
}

function getAmountDisplay(expense: Expense, currentUserId?: string | null) {
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
  if (expense.transactionType === 'INVESTMENT') {
    return <span className="text-brand-600 font-bold">-{formatted}</span>;
  }
  return <span className="text-red-600 font-bold">-{formatted}</span>;
}

function getCategoryIcon(category?: string | null, transactionType?: string | null) {
  if (transactionType === 'TRANSFER') return '🔄';
  if (transactionType === 'INCOME') return '💰';
  if (transactionType === 'INVESTMENT') return '📈';
  const cat = (category || '').toLowerCase();
  if (cat.includes('groc') || cat.includes('food') || cat.includes('rest') || cat.includes('bev') || cat.includes('eat') || cat.includes('dining')) return '🍔';
  if (cat.includes('fuel') || cat.includes('petrol') || cat.includes('diesel') || cat.includes('gas')) return '⛽';
  if (cat.includes('shop') || cat.includes('cloth') || cat.includes('amazon') || cat.includes('store') || cat.includes('mall')) return '🛍️';
  if (cat.includes('util') || cat.includes('bill') || cat.includes('elect') || cat.includes('water') || cat.includes('rent') || cat.includes('wifi')) return '⚡';
  if (cat.includes('travel') || cat.includes('flight') || cat.includes('train') || cat.includes('cab') || cat.includes('uber') || cat.includes('trip')) return '✈️';
  if (cat.includes('enter') || cat.includes('mov') || cat.includes('game') || cat.includes('ott') || cat.includes('sub') || cat.includes('netflix')) return '🎬';
  if (cat.includes('health') || cat.includes('med') || cat.includes('doc') || cat.includes('pharma') || cat.includes('hospital')) return '💊';
  if (cat.includes('salary') || cat.includes('freelance') || cat.includes('bonus') || cat.includes('wage')) return '💵';
  return '💳';
}

export type DashboardConfig = {
  id: string;
  type: 'personal' | 'group' | 'custom';
  name: string;
  categories?: string[];
  tags?: string[];
};

export function DashboardView() {
  const pathname = usePathname();
  const [searchQuery, setSearchQuery] = useState('');
  const quickAmountRef = useRef<HTMLInputElement>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [investmentsList, setInvestmentsList] = useState<Investment[]>([]);
  const [editingInvestmentTx, setEditingInvestmentTx] = useState<{
    id: string;
    code: string;
    name: string;
    type: 'BUY' | 'SELL';
    units: string;
    price: string;
    date: string;
  } | null>(null);
  const [savingInvestmentTx, setSavingInvestmentTx] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [fromFilter, setFromFilter] = useState('');
  const [toFilter, setToFilter] = useState('');
  const [categoryTypeFilter, setCategoryTypeFilter] = useState('');
  const [form, setForm] = useState(emptyForm());

  // Dashboard Management States
  const [timeFilter, setTimeFilter] = useState<DateFilterType>('current_month');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [selectedDashboard, setSelectedDashboard] = useState<DashboardConfig | null>(null);
  const [customDashboards, setCustomDashboards] = useState<DashboardConfig[]>([]);
  const [groupExpenses, setGroupExpenses] = useState<Expense[]>([]);
  const [loadingGroup, setLoadingGroup] = useState(false);
  const [isCreateDashboardOpen, setIsCreateDashboardOpen] = useState(false);

  // Custom Dashboard Creation Form State
  const [newDashboardName, setNewDashboardName] = useState('');
  const [newDashboardCats, setNewDashboardCats] = useState<string[]>([]);
  const [newDashboardTags, setNewDashboardTags] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [userGroups, setUserGroups] = useState<any[]>([]);
  const [isQuickOpen, setIsQuickOpen] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPwaGuide, setShowPwaGuide] = useState(false);
  const [isPwaActive, setIsPwaActive] = useState(false);
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [showCustomInput, setShowCustomInput] = useState(false);

  // Synchronize height of recent activity card to match the left form card
  const leftFormRef = useRef<HTMLDivElement>(null);
  const [leftFormHeight, setLeftFormHeight] = useState<number | null>(null);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(typeof window !== 'undefined' ? window.innerWidth >= 1280 : false);
      if (leftFormRef.current) {
        setLeftFormHeight(leftFormRef.current.offsetHeight);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);

    let observer: ResizeObserver | null = null;
    if (leftFormRef.current && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => {
        if (leftFormRef.current) {
          setLeftFormHeight(leftFormRef.current.offsetHeight);
        }
      });
      observer.observe(leftFormRef.current);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      if (observer) observer.disconnect();
    };
  }, [editingId, pathname, showCustomInput, expenses]);

  // AI Bulk Add State variables
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [bulkStep, setBulkStep] = useState<'input' | 'preview'>('input');
  const [pasteValue, setPasteValue] = useState('');
  const [parsedExpenses, setParsedExpenses] = useState<
    {
      date: string;
      title: string;
      category: string;
      categoryType: string;
      amount: string;
      paymentMethod: string;
      tags: string;
    }[]
  >([]);
  const [bulkError, setBulkError] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkSuccessMessage, setBulkSuccessMessage] = useState<string | null>(null);

  const AI_PROMPT = `You are an expense data converter.

Convert my spoken or written expenses into ONLY valid JSON.

Rules:
- Return only a JSON array
- Do not add explanations
- Do not use markdown formatting
- Amount must be a number
- Date format must be YYYY-MM-DDTHH:mm or YYYY-MM-DD HH:mm (include the time if specified, otherwise default to 12:00)
- If year is missing, assume current year
- If date is missing, use today's date
- Automatically choose a suitable category
- Categorize the expense type under "category_type": must be one of "ESSENTIALS" (groceries, bills, rent, necessary fuel), "HIGH_VALUE" (expensive electronics, luxury shopping, large single payments), or "LIFESTYLE" (dining out, drinks, entertainment, movies, hobby subscriptions, travel), or null if not clear.
- Keep descriptions short
- Extract any relevant tags (e.g., travel, groceries, personal, work) as a JSON array of strings in the "tags" field

Return format:

[
  {
    "date": "YYYY-MM-DDTHH:mm",
    "title": "expense title",
    "category": "category",
    "category_type": "ESSENTIALS" | "HIGH_VALUE" | "LIFESTYLE" | null,
    "amount": 0,
    "payment_method": null,
    "notes": "",
    "tags": ["tag1", "tag2"]
  }
]

My expenses:
`;

  const handlePreview = () => {
    setBulkError('');
    if (!pasteValue.trim()) {
      setBulkError('Please paste the AI response before previewing.');
      return;
    }

    let parsed: any;
    try {
      let jsonText = pasteValue.trim();
      if (jsonText.startsWith('```')) {
        const lines = jsonText.split('\n');
        if (lines[0].startsWith('```')) lines.shift();
        if (lines[lines.length - 1].startsWith('```')) lines.pop();
        jsonText = lines.join('\n').trim();
      }
      parsed = JSON.parse(jsonText);
    } catch {
      setBulkError('Invalid JSON format. Please ensure you copied a valid JSON array.');
      return;
    }

    if (!Array.isArray(parsed)) {
      setBulkError('AI response must be a JSON array of expenses.');
      return;
    }

    if (parsed.length === 0) {
      setBulkError('The pasted response contains no expenses (empty array).');
      return;
    }

    const validated: typeof parsedExpenses = [];

    for (let i = 0; i < parsed.length; i++) {
      const item = parsed[i];
      const indexStr = `Expense #${i + 1}`;

      if (item.amount === undefined || item.amount === null) {
        setBulkError(`${indexStr} is missing the "amount" field.`);
        return;
      }
      const amountNum = Number(item.amount);
      if (isNaN(amountNum) || amountNum <= 0) {
        setBulkError(`${indexStr} must have a valid positive "amount".`);
        return;
      }

      if (!item.title || typeof item.title !== 'string' || !item.title.trim()) {
        setBulkError(`${indexStr} is missing a valid "title" field.`);
        return;
      }

      if (!item.category || typeof item.category !== 'string' || !item.category.trim()) {
        setBulkError(`${indexStr} is missing a valid "category" field.`);
        return;
      }

      if (!item.date || typeof item.date !== 'string') {
        setBulkError(`${indexStr} is missing the "date" field.`);
        return;
      }

      const parsedDate = parseAILocalDate(item.date);
      const formattedDate = formatToDateTimeLocal(parsedDate);

      let pm = 'Card';
      if (item.payment_method && typeof item.payment_method === 'string') {
        const matched = paymentMethods.find(
          (m) => m.toLowerCase() === item.payment_method.toLowerCase()
        );
        if (matched) pm = matched;
      }

      let parsedTags = '';
      if (Array.isArray(item.tags)) {
        parsedTags = item.tags
          .map((t: any) => String(t).trim())
          .filter(Boolean)
          .join(', ');
      } else if (typeof item.tags === 'string') {
        parsedTags = item.tags;
      }

      let ct = '';
      if (
        item.category_type &&
        ['ESSENTIALS', 'HIGH_VALUE', 'LIFESTYLE'].includes(
          String(item.category_type).toUpperCase()
        )
      ) {
        ct = String(item.category_type).toUpperCase();
      }

      validated.push({
        date: formattedDate,
        title: item.title.trim(),
        category: item.category.trim(),
        categoryType: ct,
        amount: String(amountNum),
        paymentMethod: pm,
        tags: parsedTags
      });
    }

    setParsedExpenses(validated);
    setBulkStep('preview');
  };

  const handleConfirmImport = async () => {
    setBulkSaving(true);
    setBulkError('');
    try {
      const payloadExpenses = parsedExpenses.map((exp, i) => {
        const amt = Number(exp.amount);
        if (isNaN(amt) || amt <= 0) {
          throw new Error(`Expense #${i + 1} ("${exp.title}") must have a valid positive amount.`);
        }
        if (!exp.title.trim()) {
          throw new Error(`Expense #${i + 1} must have a non-empty title.`);
        }
        if (!exp.category.trim()) {
          throw new Error(`Expense #${i + 1} must have a non-empty category.`);
        }
        const d = new Date(exp.date);
        if (isNaN(d.getTime())) {
          throw new Error(
            `Expense #${i + 1} ("${exp.title}") has an invalid date-time: "${exp.date}".`
          );
        }
        return {
          amount: amt,
          category: exp.category.trim(),
          description: exp.title.trim(),
          paymentMethod: exp.paymentMethod,
          date: d.toISOString(),
          categoryType: exp.categoryType || undefined,
          tags: exp.tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
        };
      });

      await createExpensesBulk({ expenses: payloadExpenses });

      const count = payloadExpenses.length;
      setBulkSuccessMessage(`Successfully imported ${count} expense${count > 1 ? 's' : ''}`);

      setPasteValue('');
      setParsedExpenses([]);
      setBulkStep('input');
      setIsBulkOpen(false);

      setTimeout(() => {
        setBulkSuccessMessage(null);
      }, 5000);

      await loadExpenses();
    } catch (e) {
      setBulkError(e instanceof Error ? e.message : 'Failed to import expenses');
    } finally {
      setBulkSaving(false);
    }
  };

  async function loadExpenses() {
    setLoading(true);
    setError('');

    try {
      const [expensesData, investmentsData] = await Promise.all([
        fetchExpenses({
          category: categoryFilter || undefined,
          tag: tagFilter || undefined,
          from: fromFilter || undefined,
          to: toFilter || undefined,
          categoryType: categoryTypeFilter || undefined
        }),
        fetchInvestments()
      ]);

      setInvestmentsList(investmentsData);

      const formattedInvestments: Expense[] = [];
      investmentsData.forEach((inv) => {
        if (inv.transactions && inv.transactions.length > 0) {
          inv.transactions.forEach((tx) => {
            formattedInvestments.push({
              id: tx.id,
              amount: tx.amount,
              category: 'Investment',
              description: `${tx.type === 'BUY' ? 'Bought' : 'Sold'} ${tx.units} units of ${inv.name} (${inv.code}) @ ${formatCurrency(tx.price)}`,
              paymentMethod: 'Portfolio',
              date: tx.date || tx.createdAt,
              createdAt: tx.createdAt,
              userId: tx.userId,
              transactionType: 'INVESTMENT' as const,
              tags: []
            });
          });
        } else {
          formattedInvestments.push({
            id: inv.id,
            amount: inv.units * inv.buyPrice,
            category: 'Investment',
            description: `Bought ${inv.units} units of ${inv.name} (${inv.code}) @ ${formatCurrency(inv.buyPrice)}`,
            paymentMethod: 'Portfolio',
            date: inv.date || inv.createdAt,
            createdAt: inv.createdAt,
            userId: inv.userId,
            transactionType: 'INVESTMENT' as const,
            tags: []
          });
        }
      });

      let merged = [...expensesData, ...formattedInvestments];

      if (categoryFilter) {
        merged = merged.filter((item) => item.category?.toLowerCase() === categoryFilter.toLowerCase());
      }
      if (tagFilter) {
        merged = merged.filter((item) => item.tags?.some((t: { name: string }) => t.name.toLowerCase() === tagFilter.toLowerCase()));
      }

      merged.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setExpenses(merged);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load transactions');
    } finally {
      setLoading(false);
    }
  }

  async function loadGroupExpenses(groupId: string) {
    setLoadingGroup(true);
    setError('');
    try {
      const data = await fetchGroupExpenses(groupId);
      setGroupExpenses(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load group transactions');
    } finally {
      setLoadingGroup(false);
    }
  }

  useEffect(() => {
    async function loadInitial() {
      try {
        const profile = await fetchCurrentUser();
        setCurrentUser(profile);
        const groupsList = await fetchGroups();
        setUserGroups(groupsList);

        // Load custom dashboards
        const stored = localStorage.getItem(`cashflow_custom_dashboards_${profile.id}`);
        if (stored) {
          try {
            setCustomDashboards(JSON.parse(stored));
          } catch (e) {
            console.error(e);
          }
        }
      } catch (err) {
        console.error('Failed to load user groups list', err);
      }
    }
    void loadInitial();
    void loadExpenses();
  }, []);

  useEffect(() => {
    if (selectedDashboard && selectedDashboard.type === 'group') {
      void loadGroupExpenses(selectedDashboard.id);
    }
  }, [selectedDashboard]);

  const handleCreateDashboard = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDashboardName.trim()) {
      alert('Dashboard name is required');
      return;
    }
    if (newDashboardCats.length === 0 && newDashboardTags.length === 0) {
      alert('Select at least one category or tag');
      return;
    }

    const newDash: DashboardConfig = {
      id: `custom_${Date.now()}`,
      type: 'custom',
      name: newDashboardName.trim(),
      categories: newDashboardCats,
      tags: newDashboardTags
    };

    const updated = [...customDashboards, newDash];
    setCustomDashboards(updated);
    if (currentUser) {
      localStorage.setItem(`cashflow_custom_dashboards_${currentUser.id}`, JSON.stringify(updated));
    }

    // Reset and close
    setNewDashboardName('');
    setNewDashboardCats([]);
    setNewDashboardTags([]);
    setIsCreateDashboardOpen(false);
  };

  const handleDeleteDashboard = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this custom dashboard?')) {
      return;
    }

    const updated = customDashboards.filter((d) => d.id !== id);
    setCustomDashboards(updated);
    if (currentUser) {
      localStorage.setItem(`cashflow_custom_dashboards_${currentUser.id}`, JSON.stringify(updated));
    }
    if (selectedDashboard?.id === id) {
      setSelectedDashboard(null);
    }
  };

  const dateRange = useMemo(() => {
    return getDateFilterRange(timeFilter, customStartDate, customEndDate);
  }, [timeFilter, customStartDate, customEndDate]);

  const getExpensesMetrics = (list: Expense[]) => {
    const filtered = filterExpensesByDateRange(list, dateRange);
    const totalOut = totalOutflow(filtered, currentUser?.id || '');
    const totalIn = totalIncome(filtered);
    return { totalOut, totalIn };
  };

  const getCustomDashboardMetrics = (dash: DashboardConfig) => {
    const allowedCats = dash.categories || [];
    const allowedTags = dash.tags || [];

    const filtered = expenses.filter((e) => {
      const matchesCategory =
        allowedCats.length === 0 || (e.category && allowedCats.includes(e.category));
      const matchesTag =
        allowedTags.length === 0 || (e.tags && e.tags.some((t) => allowedTags.includes(t.name)));

      if (allowedCats.length > 0 && allowedTags.length > 0) {
        return matchesCategory || matchesTag;
      }
      if (allowedCats.length > 0) return matchesCategory;
      if (allowedTags.length > 0) return matchesTag;
      return true;
    });
    return getExpensesMetrics(filtered);
  };

  const eligibleRecipients = useMemo(() => {
    if (!currentUser) return [];
    const map = new Map<string, { id: string; name: string; email: string }>();

    userGroups.forEach((g) => {
      g.members.forEach((m: any) => {
        if (m.id !== currentUser.id) {
          map.set(m.id, { id: m.id, name: m.name, email: m.email });
        }
      });
      if (g.owner.id !== currentUser.id) {
        map.set(g.owner.id, { id: g.owner.id, name: g.owner.name, email: g.owner.email });
      }
    });

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [userGroups, currentUser]);

  useEffect(() => {
    if (currentUser) {
      const stored = localStorage.getItem(`cashflow_custom_cats_${currentUser.id}`);
      if (stored) {
        try {
          setCustomCategories(JSON.parse(stored));
        } catch {
          // ignore
        }
      }
    }
  }, [currentUser]);

  const allCategories = useMemo(() => {
    const defaults =
      form.transactionType === 'INCOME'
        ? ['Salary', 'Freelance', 'Investment', 'Other']
        : ['Grocery', 'Fuel', 'Food & Beverage', 'Shopping', 'Entertainment', 'Utilities', 'Other'];

    const existing = expenses
      .filter((e) => e.transactionType === form.transactionType && e.category)
      .map((e) => e.category as string);

    const merged = Array.from(
      new Set([...defaults, ...customCategories, ...existing])
    ).sort((a, b) => a.localeCompare(b));

    return merged;
  }, [form.transactionType, expenses, customCategories]);

  const allTags = useMemo(() => {
    const unique = new Set<string>();
    expenses.forEach((e) => {
      e.tags?.forEach((t) => {
        if (t.name) unique.add(t.name);
      });
    });
    return Array.from(unique).sort();
  }, [expenses]);

  useEffect(() => {
    const defaultType = pathname === '/income' ? 'INCOME' : 'EXPENSE';
    setForm(emptyForm(defaultType));
    setShowCustomInput(false);
  }, [pathname]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const handleBeforeInstall = (e: Event) => {
        e.preventDefault();
        setDeferredPrompt(e);
      };
      window.addEventListener('beforeinstallprompt', handleBeforeInstall);

      const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
      const params = new URLSearchParams(window.location.search);
      if (isStandalone || params.get('mode') === 'pwa') {
        setIsQuickOpen(true);
        setIsPwaActive(true);
      }

      return () => {
        window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      };
    }
  }, []);

  const handleInstallApp = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`PWA install outcome: ${outcome}`);
      setDeferredPrompt(null);
    } else {
      setShowPwaGuide(true);
    }
  };

  const activeExpenses = useMemo(() => {
    if (!selectedDashboard) {
      return expenses;
    }

    if (selectedDashboard.type === 'personal') {
      return expenses;
    }

    if (selectedDashboard.type === 'group') {
      return groupExpenses;
    }

    if (selectedDashboard.type === 'custom') {
      const allowedCats = selectedDashboard.categories || [];
      const allowedTags = selectedDashboard.tags || [];

      return expenses.filter((e) => {
        const matchesCategory =
          allowedCats.length === 0 || (e.category && allowedCats.includes(e.category));
        const matchesTag =
          allowedTags.length === 0 || (e.tags && e.tags.some((t) => allowedTags.includes(t.name)));

        if (allowedCats.length > 0 && allowedTags.length > 0) {
          return matchesCategory || matchesTag;
        }
        if (allowedCats.length > 0) return matchesCategory;
        if (allowedTags.length > 0) return matchesTag;
        return true;
      });
    }

    return expenses;
  }, [expenses, selectedDashboard, groupExpenses]);

  const filteredActiveExpenses = useMemo(() => {
    return filterExpensesByDateRange(activeExpenses, dateRange);
  }, [activeExpenses, dateRange]);

  const displayedExpenses = useMemo(() => {
    let list = activeExpenses;

    if (searchQuery) {
      list = list.filter(
        (e) =>
          (e.description && e.description.toLowerCase().includes(searchQuery)) ||
          (e.category && e.category.toLowerCase().includes(searchQuery)) ||
          (e.paymentMethod && e.paymentMethod.toLowerCase().includes(searchQuery))
      );
    }

    if (selectedDashboard?.type !== 'custom') {
      if (categoryFilter) {
        list = list.filter(
          (e) => e.category && e.category.toLowerCase().includes(categoryFilter.toLowerCase())
        );
      }
      if (tagFilter) {
        list = list.filter((e) => e.tags && e.tags.some((t) => t.name.includes(tagFilter)));
      }
      if (fromFilter) {
        const fromDate = new Date(fromFilter);
        list = list.filter((e) => new Date(e.date) >= fromDate);
      }
      if (toFilter) {
        const toDate = new Date(toFilter);
        list = list.filter((e) => new Date(e.date) <= toDate);
      }
      if (categoryTypeFilter) {
        list = list.filter((e) => e.categoryType === categoryTypeFilter);
      }
    } else {
      if (categoryTypeFilter) {
        list = list.filter((e) => e.categoryType === categoryTypeFilter);
      }
    }

    return list;
  }, [activeExpenses, selectedDashboard, categoryFilter, tagFilter, fromFilter, toFilter, categoryTypeFilter, searchQuery]);

  const dashboardTotals = useMemo(() => {
    const sorted = [...filteredActiveExpenses].sort(
      (left, right) => new Date(right.date).getTime() - new Date(left.date).getTime()
    );
    const recent = sorted.slice(0, 5);
    const expenseTransactions = sorted.filter((e) => !e.transactionType || e.transactionType === 'EXPENSE');
    const incomeTransactions = sorted.filter((e) => e.transactionType === 'INCOME');

    const expensesTotal = totalExpenses(filteredActiveExpenses);
    const expensesMonthly = monthlyExpenses(filteredActiveExpenses);
    const incomeTotal = totalIncome(filteredActiveExpenses);
    const tSent = currentUser ? transfersSent(filteredActiveExpenses, currentUser.id) : 0;
    const tReceived = currentUser ? transfersReceived(filteredActiveExpenses, currentUser.id) : 0;
    const outflowTotal = currentUser ? totalOutflow(filteredActiveExpenses, currentUser.id) : expensesTotal;

    return {
      total: expensesTotal,
      monthly: expensesMonthly,
      income: incomeTotal,
      transfersSent: tSent,
      transfersReceived: tReceived,
      outflow: outflowTotal,
      categories: categoryBreakdown(filteredActiveExpenses),
      recent,
      expenseTransactions,
      incomeTransactions
    };
  }, [filteredActiveExpenses, currentUser]);

  // Overall recent expenses & income irrespective of bottom table date filter
  const recentExpenses = useMemo(() => {
    return activeExpenses
      .filter((e) => !e.transactionType || e.transactionType === 'EXPENSE')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 15);
  }, [activeExpenses]);

  const recentIncome = useMemo(() => {
    return activeExpenses
      .filter((e) => e.transactionType === 'INCOME')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 15);
  }, [activeExpenses]);

  const trendResult = useMemo(() => {
    return generateSpendingTrend(filteredActiveExpenses, timeFilter, dateRange);
  }, [filteredActiveExpenses, timeFilter, dateRange]);

  async function handleSubmit(event: import('react').FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');

    try {
      const payload = {
        amount: Number(form.amount),
        category: form.transactionType === 'TRANSFER' ? 'Transfer' : form.category || 'General',
        description: form.description,
        paymentMethod: form.paymentMethod,
        date: (() => {
          const parsed = new Date(form.date);
          return isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
        })(),
        transactionType: (form.transactionType || 'EXPENSE') as 'EXPENSE' | 'INCOME' | 'TRANSFER' | 'INVESTMENT',
        toUserId: form.transactionType === 'TRANSFER' ? form.toUserId || undefined : undefined,
        categoryType: form.categoryType || undefined,
        tags: form.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
      };

      if (editingId) {
        await updateExpense(editingId, payload);
      } else {
        await createExpense(payload);
      }

      if (
        payload.category &&
        payload.transactionType !== 'TRANSFER' &&
        !allCategories.includes(payload.category)
      ) {
        const updated = [...customCategories, payload.category];
        setCustomCategories(updated);
        if (currentUser) {
          localStorage.setItem(`cashflow_custom_cats_${currentUser.id}`, JSON.stringify(updated));
        }
      }

      setShowCustomInput(false);
      setForm(emptyForm(pathname === '/income' ? 'INCOME' : 'EXPENSE'));
      setEditingId(null);
      await loadExpenses();
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : 'Could not save transaction'
      );
    } finally {
      setSaving(false);
    }
  }

  function editExpense(expense: Expense) {
    const isInvestment =
      expense.transactionType === 'INVESTMENT' ||
      expense.id.startsWith('PB') ||
      expense.id.startsWith('PS');

    if (isInvestment) {
      let foundTx: any = null;
      let foundInv: any = null;

      for (const inv of investmentsList) {
        if (inv.transactions) {
          const t = inv.transactions.find((tx) => tx.id === expense.id);
          if (t) {
            foundTx = t;
            foundInv = inv;
            break;
          }
        }
      }

      if (foundTx) {
        setEditingInvestmentTx({
          id: foundTx.id,
          code: foundInv?.code || '',
          name: foundInv?.name || '',
          type: (foundTx.type === 'SELL' ? 'SELL' : 'BUY') as 'BUY' | 'SELL',
          units: String(foundTx.units || ''),
          price: String(foundTx.price || ''),
          date: foundTx.date ? new Date(foundTx.date).toISOString().slice(0, 16) : ''
        });
        return;
      }
    }

    setEditingId(expense.id);
    setForm({
      amount: String(expense.amount),
      category: expense.category || '',
      description: expense.description ?? '',
      paymentMethod: expense.paymentMethod,
      date: formatToDateTimeLocal(new Date(expense.date)),
      transactionType: expense.transactionType || 'EXPENSE',
      toUserId: expense.toUserId || '',
      tags: expense.tags ? expense.tags.map((t) => t.name).join(', ') : '',
      categoryType: expense.categoryType || ''
    });
  }

  async function handleDelete(id: string) {
    const isInvestment =
      id.startsWith('PB') ||
      id.startsWith('PS') ||
      expenses.find((e) => e.id === id)?.transactionType === 'INVESTMENT';

    const confirmMsg = isInvestment
      ? `Delete investment transaction "${id}"?\n\nThe asset holding will NOT be deleted. Its units and portfolio values will be automatically recalculated.`
      : 'Delete this transaction?';

    if (!confirm(confirmMsg)) {
      return;
    }

    try {
      if (isInvestment) {
        await deleteInvestmentTransaction(id);
      } else {
        await deleteExpense(id);
      }
      await loadExpenses();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete transaction.');
    }
  }

  async function handleSaveInvestmentTx(e: React.FormEvent) {
    e.preventDefault();
    if (!editingInvestmentTx) return;

    const units = Number(editingInvestmentTx.units);
    const price = Number(editingInvestmentTx.price);

    if (!units || units <= 0 || !price || price <= 0) {
      alert('Please enter a valid quantity of units and price.');
      return;
    }

    setSavingInvestmentTx(true);
    try {
      await updateInvestmentTransaction(editingInvestmentTx.id, {
        type: editingInvestmentTx.type,
        units,
        price,
        date: editingInvestmentTx.date ? new Date(editingInvestmentTx.date).toISOString() : undefined
      });

      setEditingInvestmentTx(null);
      await loadExpenses();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update transaction.');
    } finally {
      setSavingInvestmentTx(false);
    }
  }

  const renderRecentActivity = () => {
    let title = 'Recent activity';
    let items = dashboardTotals.recent;
    let emptyText = 'No transactions recorded yet.';

    if (pathname === '/expenses') {
      title = 'Recent Expenses';
      items = recentExpenses;
      emptyText = 'No expense transactions recorded yet.';
    } else if (pathname === '/income') {
      title = 'Recent Income';
      items = recentIncome;
      emptyText = 'No income transactions recorded yet.';
    }

    return (
      <div className="cash-card p-6 h-full flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-ink-100 pb-4 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-50 border border-brand-200/80 flex items-center justify-center text-sm">
              🕒
            </div>
            <div>
              <h2 className="text-xl font-bold text-ink-900 text-left">{title}</h2>
              <p className="text-xxs text-ink-400">Latest recorded transactions</p>
            </div>
          </div>
          {items.length > 0 && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-brand-50 text-brand-700 border border-brand-200/60">
              {items.length} {items.length === 1 ? 'item' : 'items'}
            </span>
          )}
        </div>

        {/* Scrollable list taking remaining vertical height */}
        <div className="mt-4 flex-1 min-h-0 overflow-y-auto space-y-2.5 pr-1.5">
          {items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center py-16 text-center text-xs text-ink-400">
              <div className="w-12 h-12 rounded-full bg-ink-50 border border-ink-100 flex items-center justify-center text-2xl mb-3">
                📝
              </div>
              <p className="font-semibold text-ink-700">{emptyText}</p>
              <p className="mt-1 text-ink-400 max-w-xs">
                Add a transaction using the form on the left to see it appear here.
              </p>
            </div>
          ) : (
            items.map((expense) => (
              <div
                key={expense.id}
                className="flex items-center justify-between p-3 rounded-2xl bg-white border border-ink-100/60 hover:border-ink-200 transition-all text-left"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1 pr-2">
                  <div className="w-10 h-10 rounded-xl bg-ink-50 border border-ink-100/80 flex items-center justify-center text-lg shrink-0">
                    {getCategoryIcon(expense.category, expense.transactionType)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-ink-900 truncate">
                        {getTransactionTitle(expense, currentUser?.id)}
                      </p>
                      {expense.categoryType && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-ink-100/80 text-ink-600 font-medium shrink-0">
                          {expense.categoryType}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-xxs text-ink-400">
                      <span>
                        {new Date(expense.date).toLocaleDateString('en-IN', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                      <span>•</span>
                      <span className="font-medium text-ink-500">{expense.paymentMethod}</span>
                      {expense.description && expense.description !== expense.category && (
                        <>
                          <span>•</span>
                          <span className="truncate max-w-[140px] italic text-ink-400">
                            {expense.description}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0 pl-2">
                  <div className="text-sm font-bold">{getAmountDisplay(expense, currentUser?.id)}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        
        {/* Banner/Overview Section only on Dashboard/Home when a dashboard is selected */}
        <DashboardHeader
          pathname={pathname}
          selectedDashboard={selectedDashboard}
          setSelectedDashboard={setSelectedDashboard}
          customDashboards={customDashboards}
          userGroups={userGroups}
          expenses={expenses}
          getExpensesMetrics={getExpensesMetrics}
          getCustomDashboardMetrics={getCustomDashboardMetrics}
          handleDeleteDashboard={handleDeleteDashboard}
          isCreateDashboardOpen={isCreateDashboardOpen}
          setIsCreateDashboardOpen={setIsCreateDashboardOpen}
          newDashboardName={newDashboardName}
          setNewDashboardName={setNewDashboardName}
          newDashboardCats={newDashboardCats}
          setNewDashboardCats={setNewDashboardCats}
          newDashboardTags={newDashboardTags}
          setNewDashboardTags={setNewDashboardTags}
          allCategories={allCategories}
          allTags={allTags}
          handleCreateDashboard={handleCreateDashboard}
          loadGroupExpenses={loadGroupExpenses}
          loadExpenses={loadExpenses}
          timeFilter={timeFilter}
          setTimeFilter={setTimeFilter}
          customStartDate={customStartDate}
          setCustomStartDate={setCustomStartDate}
          customEndDate={customEndDate}
          setCustomEndDate={setCustomEndDate}
          dateRangeLabel={dateRange.label}
          filteredCount={filteredActiveExpenses.length}
        />

        {pathname === '/dashboard' && selectedDashboard !== null && (
          loadingGroup ? (
            <div className="py-8 text-center text-ink-500 font-semibold animate-pulse text-xs">
              Loading dashboard data...
            </div>
          ) : (
            <DashboardStats
              outflow={dashboardTotals.outflow}
              total={dashboardTotals.total}
              income={dashboardTotals.income}
              transfersSent={dashboardTotals.transfersSent}
              transfersReceived={dashboardTotals.transfersReceived}
              periodLabel={dateRange.label}
            />
          )
        )}

        {/* Global Error Display */}
        {error && (
          <div className="rounded-3xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Global Success Display */}
        {bulkSuccessMessage && (
          <div className="rounded-3xl border border-brand-200 bg-brand-50 px-5 py-4 text-sm text-brand-700 flex items-center justify-between">
            <span>✨ {bulkSuccessMessage}</span>
            <button
              className="text-brand-600 hover:text-brand-800 font-semibold"
              onClick={() => setBulkSuccessMessage(null)}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Route Segment 1: Dashboard Home */}
        {pathname === '/dashboard' && selectedDashboard !== null && (
          <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr] animate-in fade-in duration-300">
            <div className="space-y-6">
              <DashboardCharts
                areaData={trendResult.data}
                categories={dashboardTotals.categories}
                categoryPalette={categoryPalette}
                trendTitle={trendResult.title}
                trendSubtitle={trendResult.subtitle}
              />
            </div>

            <aside className="space-y-6">
              {renderRecentActivity()}
            </aside>
          </section>
        )}

        {/* Route Segment 2: Transactions Page */}
        {pathname === '/transactions' && (
          <TransactionList
            displayedExpenses={displayedExpenses}
            loading={loading}
            currentUser={currentUser}
            categoryFilter={categoryFilter}
            setCategoryFilter={setCategoryFilter}
            tagFilter={tagFilter}
            setTagFilter={setTagFilter}
            categoryTypeFilter={categoryTypeFilter}
            setCategoryTypeFilter={setCategoryTypeFilter}
            fromFilter={fromFilter}
            setFromFilter={setFromFilter}
            toFilter={toFilter}
            setToFilter={setToFilter}
            onApplyFilters={loadExpenses}
            onEditExpense={editExpense}
            onDeleteExpense={handleDelete}
          />
        )}

        {/* Route Segment 3: Expenses Page (Top: Form + Recent Transactions, Bottom: Full Expense Table) */}
        {pathname === '/expenses' && (
          <div className="space-y-8 animate-in fade-in duration-300">
            {/* Top Row: Add Form on Left, Recent Transactions on Right */}
            <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr] items-start">
              {/* Form Card */}
              <div ref={leftFormRef} className="cash-card p-6 shadow-sm">
                <div>
                  <div className="mb-6 flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-ink-100 pb-4">
                    <div>
                      <h2 className="text-2xl font-bold text-ink-900">
                        {editingId ? 'Edit expense' : 'Add expense'}
                      </h2>
                      <p className="text-xs text-ink-500 mt-0.5">
                        {editingId
                          ? 'Modify transaction details and click save.'
                          : 'Keep the data model ready for future encryption and prediction layers.'}
                      </p>
                    </div>
                    {!editingId && (
                      <div className="flex flex-wrap gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={handleInstallApp}
                          className="cash-button-secondary py-1.5 px-2.5 text-xs flex items-center gap-1 border-brand-200 bg-brand-50/50 text-brand-700 hover:bg-brand-50 transition-all font-semibold"
                          title="Add to Home Screen / Install PWA App"
                        >
                          <span>📥 Install</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsQuickOpen(true);
                            quickAmountRef.current?.focus();
                          }}
                          className="cash-button-secondary py-1.5 px-2.5 text-xs flex items-center gap-1 border-brand-200 bg-brand-50/50 text-brand-700 hover:bg-brand-50 transition-all font-semibold"
                        >
                          <span>📱 Quick</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setBulkStep('input');
                            setBulkError('');
                            setIsBulkOpen(true);
                          }}
                          className="cash-button-secondary py-1.5 px-2.5 text-xs flex items-center gap-1 border-brand-200 bg-brand-50/50 text-brand-700 hover:bg-brand-50 transition-all font-semibold animate-pulse"
                        >
                          <span>⚡ AI Bulk</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {editingId && (
                    <div className="mb-4 flex items-center justify-between rounded-xl bg-amber-50 border border-amber-200/80 px-3.5 py-2 text-xs text-amber-800 animate-in fade-in duration-200">
                      <div className="flex items-center gap-2 font-semibold">
                        <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                        <span>Editing transaction</span>
                        <code className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-950 font-mono text-[11px] font-bold tracking-wider border border-amber-300/80">
                          {editingId}
                        </code>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(null);
                          setForm(emptyForm('EXPENSE'));
                        }}
                        className="text-amber-900 hover:underline font-bold"
                      >
                        Cancel Edit
                      </button>
                    </div>
                  )}

                  <div className="block md:hidden">
                    <TransactionForm
                      form={form}
                      setForm={setForm}
                      onSubmit={handleSubmit}
                      saving={saving}
                      editingId={editingId}
                      setEditingId={setEditingId}
                      allCategories={allCategories}
                      allTags={allTags}
                      eligibleRecipients={eligibleRecipients}
                      showCustomInput={showCustomInput}
                      setShowCustomInput={setShowCustomInput}
                      onCancel={() => {
                        setEditingId(null);
                        setForm(emptyForm('EXPENSE'));
                      }}
                      quickAmountRef={quickAmountRef}
                      isQuickForm={true}
                      pathname={pathname}
                      isPwaActive={isPwaActive}
                    />
                  </div>
                  <div className="hidden md:block">
                    <TransactionForm
                      form={form}
                      setForm={setForm}
                      onSubmit={handleSubmit}
                      saving={saving}
                      editingId={editingId}
                      setEditingId={setEditingId}
                      allCategories={allCategories}
                      allTags={allTags}
                      eligibleRecipients={eligibleRecipients}
                      showCustomInput={showCustomInput}
                      setShowCustomInput={setShowCustomInput}
                      onCancel={() => {
                        setEditingId(null);
                        setForm(emptyForm('EXPENSE'));
                      }}
                      pathname={pathname}
                    />
                  </div>
                </div>
              </div>

              {/* Beside Add Form: Recent Transactions Activity */}
              <aside
                className="w-full flex flex-col min-h-0"
                style={isDesktop && leftFormHeight ? { height: `${leftFormHeight}px` } : undefined}
              >
                {renderRecentActivity()}
              </aside>
            </section>

            {/* Bottom Row: Full Width Comprehensive Expense Table */}
            <section className="w-full">
              <ExpenseTable
                expenses={activeExpenses}
                loading={loading}
                currentUser={currentUser}
                timeFilter={timeFilter}
                setTimeFilter={setTimeFilter}
                customStartDate={customStartDate}
                setCustomStartDate={setCustomStartDate}
                customEndDate={customEndDate}
                setCustomEndDate={setCustomEndDate}
                categoryFilter={categoryFilter}
                setCategoryFilter={setCategoryFilter}
                tagFilter={tagFilter}
                setTagFilter={setTagFilter}
                categoryTypeFilter={categoryTypeFilter}
                setCategoryTypeFilter={setCategoryTypeFilter}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                allCategories={allCategories}
                allTags={allTags}
                onEditExpense={(expense) => {
                  editExpense(expense);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                onDeleteExpense={handleDelete}
                onRefresh={loadExpenses}
                periodLabel={dateRange.label}
                title="All Expense Transactions"
                transactionType="EXPENSE"
              />
            </section>
          </div>
        )}

        {/* Route Segment 4: Income Page (Top: Form + Recent Activity, Bottom: Full Income Table) */}
        {pathname === '/income' && (
          <div className="space-y-8 animate-in fade-in duration-300">
            {/* Top Row: Metrics & Form on Left, Recent Activity on Right */}
            <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr] items-start">
              <div ref={leftFormRef} className="space-y-6 flex flex-col">
                <div className="grid gap-4 sm:grid-cols-2 text-left">
                  <article
                    className="cash-card p-5 bg-gradient-to-br from-emerald-100 to-white shadow-sm text-left"
                    style={{
                      backgroundImage: `linear-gradient(135deg, rgba(255,255,255,0.9), rgba(255,255,255,0.72)), linear-gradient(135deg, var(--tw-gradient-stops))`
                    }}
                  >
                    <p className="text-xs font-semibold text-ink-500 text-left">Total Income</p>
                    <p className="mt-2 text-2xl font-bold tracking-tight text-ink-900 text-left">
                      {formatCurrency(dashboardTotals.income)}
                    </p>
                  </article>
                  <article
                    className="cash-card p-5 bg-gradient-to-br from-purple-100 to-white shadow-sm text-left"
                    style={{
                      backgroundImage: `linear-gradient(135deg, rgba(255,255,255,0.9), rgba(255,255,255,0.72)), linear-gradient(135deg, var(--tw-gradient-stops))`
                    }}
                  >
                    <p className="text-xs font-semibold text-ink-500 text-left">Incoming Transfers</p>
                    <p className="mt-2 text-2xl font-bold tracking-tight text-ink-900 text-left">
                      {formatCurrency(dashboardTotals.transfersReceived)}
                    </p>
                  </article>
                </div>

                <div className="cash-card p-6 shadow-sm">
                  <div>
                    <div className="mb-6 flex items-start justify-between gap-4 border-b border-ink-100 pb-4">
                      <div>
                        <h2 className="text-2xl font-bold text-ink-900">
                          {editingId ? 'Edit income' : 'Add income'}
                        </h2>
                        <p className="text-xs text-ink-500 mt-0.5">
                          Record salary, dividends, freelance, and other earnings.
                        </p>
                      </div>
                      {!editingId && (
                        <div className="flex gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setIsQuickOpen(true);
                              quickAmountRef.current?.focus();
                            }}
                            className="cash-button-secondary py-1.5 px-3 text-xs flex items-center gap-1 border-brand-200 bg-brand-50/50 text-brand-700 hover:bg-brand-50 transition-all font-semibold"
                          >
                            <span>📱 Quick Entry</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {editingId && (
                      <div className="mb-4 flex items-center justify-between rounded-xl bg-amber-50 border border-amber-200/80 px-3.5 py-2 text-xs text-amber-800 animate-in fade-in duration-200">
                        <div className="flex items-center gap-2 font-semibold">
                          <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                          <span>Editing transaction</span>
                          <code className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-950 font-mono text-[11px] font-bold tracking-wider border border-amber-300/80">
                            {editingId}
                          </code>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(null);
                            setForm(emptyForm('INCOME'));
                          }}
                          className="text-amber-900 hover:underline font-bold"
                        >
                          Cancel Edit
                        </button>
                      </div>
                    )}

                    <div className="block md:hidden">
                      <TransactionForm
                        form={form}
                        setForm={setForm}
                        onSubmit={handleSubmit}
                        saving={saving}
                        editingId={editingId}
                        setEditingId={setEditingId}
                        allCategories={allCategories}
                        allTags={allTags}
                        eligibleRecipients={eligibleRecipients}
                        showCustomInput={showCustomInput}
                        setShowCustomInput={setShowCustomInput}
                        onCancel={() => {
                          setEditingId(null);
                          setForm(emptyForm('INCOME'));
                        }}
                        quickAmountRef={quickAmountRef}
                        isQuickForm={true}
                        pathname={pathname}
                        isPwaActive={isPwaActive}
                      />
                    </div>
                    <div className="hidden md:block">
                      <TransactionForm
                        form={form}
                        setForm={setForm}
                        onSubmit={handleSubmit}
                        saving={saving}
                        editingId={editingId}
                        setEditingId={setEditingId}
                        allCategories={allCategories}
                        allTags={allTags}
                        eligibleRecipients={eligibleRecipients}
                        showCustomInput={showCustomInput}
                        setShowCustomInput={setShowCustomInput}
                        onCancel={() => {
                          setEditingId(null);
                          setForm(emptyForm('INCOME'));
                        }}
                        pathname={pathname}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Beside Income Form: Recent Activity */}
              <aside
                className="w-full flex flex-col min-h-0"
                style={isDesktop && leftFormHeight ? { height: `${leftFormHeight}px` } : undefined}
              >
                {renderRecentActivity()}
              </aside>
            </section>

            {/* Bottom Row: Full Width Comprehensive Income Table */}
            <section className="w-full">
              <ExpenseTable
                expenses={activeExpenses}
                loading={loading}
                currentUser={currentUser}
                timeFilter={timeFilter}
                setTimeFilter={setTimeFilter}
                customStartDate={customStartDate}
                setCustomStartDate={setCustomStartDate}
                customEndDate={customEndDate}
                setCustomEndDate={setCustomEndDate}
                categoryFilter={categoryFilter}
                setCategoryFilter={setCategoryFilter}
                tagFilter={tagFilter}
                setTagFilter={setTagFilter}
                categoryTypeFilter={categoryTypeFilter}
                setCategoryTypeFilter={setCategoryTypeFilter}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                allCategories={allCategories}
                allTags={allTags}
                onEditExpense={(expense) => {
                  editExpense(expense);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                onDeleteExpense={handleDelete}
                onRefresh={loadExpenses}
                periodLabel={dateRange.label}
                title="All Income Transactions"
                transactionType="INCOME"
              />
            </section>
          </div>
        )}

        {/* Modal edit panel for transactions page */}
        {pathname === '/transactions' && editingId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-ink-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="cash-card max-w-lg w-full max-h-[90vh] flex flex-col p-5 sm:p-6 bg-white animate-in zoom-in duration-200 shadow-2xl overflow-hidden">
              <div className="mb-3 flex items-center justify-between border-b border-ink-100 pb-3 shrink-0">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-semibold text-ink-900">Edit Expense</h3>
                    <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 font-bold border border-brand-200">
                      {editingId}
                    </span>
                  </div>
                  <p className="text-xs text-ink-500">Modify the transaction details.</p>
                </div>
                <button
                  type="button"
                  className="rounded-full p-2 text-ink-500 hover:bg-ink-100 transition"
                  onClick={() => {
                    setEditingId(null);
                    setForm(emptyForm('EXPENSE'));
                  }}
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              <div className="overflow-y-auto flex-1 pr-1 -mr-1">
                <TransactionForm
                  form={form}
                  setForm={setForm}
                  onSubmit={handleSubmit}
                  saving={saving}
                  editingId={editingId}
                  setEditingId={setEditingId}
                  allCategories={allCategories}
                  allTags={allTags}
                  eligibleRecipients={eligibleRecipients}
                  showCustomInput={showCustomInput}
                  setShowCustomInput={setShowCustomInput}
                  onCancel={() => {
                    setEditingId(null);
                    setForm(emptyForm('EXPENSE'));
                  }}
                  pathname={pathname}
                />
              </div>
            </div>
          </div>
        )}

        {/* Modal edit panel for investment transactions */}
        {editingInvestmentTx && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-ink-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="cash-card max-w-md w-full p-5 sm:p-6 bg-white animate-in zoom-in duration-200 shadow-2xl text-left">
              <div className="mb-4 flex items-center justify-between border-b border-ink-100 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-semibold text-ink-900">Edit Investment</h3>
                    <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 font-bold border border-purple-200">
                      {editingInvestmentTx.id}
                    </span>
                  </div>
                  <p className="text-xs text-ink-500">
                    {editingInvestmentTx.name} ({editingInvestmentTx.code})
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded-full p-2 text-ink-500 hover:bg-ink-100 transition"
                  onClick={() => setEditingInvestmentTx(null)}
                  disabled={savingInvestmentTx}
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <form onSubmit={handleSaveInvestmentTx} className="space-y-4">
                {/* Order Type Toggle */}
                <div className="grid grid-cols-2 gap-2 p-1 bg-ink-100 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setEditingInvestmentTx({ ...editingInvestmentTx, type: 'BUY' })}
                    className={`py-2 text-xs font-bold rounded-lg transition-all ${
                      editingInvestmentTx.type === 'BUY'
                        ? 'bg-white text-emerald-800 shadow-sm'
                        : 'text-ink-600 hover:text-ink-900'
                    }`}
                  >
                    Buy Order (PB)
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingInvestmentTx({ ...editingInvestmentTx, type: 'SELL' })}
                    className={`py-2 text-xs font-bold rounded-lg transition-all ${
                      editingInvestmentTx.type === 'SELL'
                        ? 'bg-white text-amber-800 shadow-sm'
                        : 'text-ink-600 hover:text-ink-900'
                    }`}
                  >
                    Sell Order (PS)
                  </button>
                </div>

                <div>
                  <label className="cash-label" htmlFor="dashEditTxUnits">
                    Quantity (Units)
                  </label>
                  <input
                    id="dashEditTxUnits"
                    type="number"
                    step="any"
                    placeholder="e.g. 10"
                    className="cash-input"
                    value={editingInvestmentTx.units}
                    onChange={(e) =>
                      setEditingInvestmentTx({ ...editingInvestmentTx, units: e.target.value })
                    }
                    disabled={savingInvestmentTx}
                    required
                  />
                </div>

                <div>
                  <label className="cash-label" htmlFor="dashEditTxPrice">
                    Price Per Unit ({editingInvestmentTx.code})
                  </label>
                  <input
                    id="dashEditTxPrice"
                    type="number"
                    step="any"
                    placeholder="e.g. 150"
                    className="cash-input"
                    value={editingInvestmentTx.price}
                    onChange={(e) =>
                      setEditingInvestmentTx({ ...editingInvestmentTx, price: e.target.value })
                    }
                    disabled={savingInvestmentTx}
                    required
                  />
                </div>

                <div>
                  <label className="cash-label" htmlFor="dashEditTxDate">
                    Transaction Date & Time
                  </label>
                  <input
                    id="dashEditTxDate"
                    type="datetime-local"
                    className="cash-input"
                    value={editingInvestmentTx.date}
                    onChange={(e) =>
                      setEditingInvestmentTx({ ...editingInvestmentTx, date: e.target.value })
                    }
                    disabled={savingInvestmentTx}
                    required
                  />
                </div>

                {Number(editingInvestmentTx.units) > 0 && Number(editingInvestmentTx.price) > 0 && (
                  <div className="p-3 bg-ink-50 rounded-xl border border-ink-150 flex justify-between items-center text-xs">
                    <span className="text-ink-600">Total Value:</span>
                    <span className="font-bold text-ink-900 text-sm">
                      {formatCurrency(
                        Number(editingInvestmentTx.units) * Number(editingInvestmentTx.price)
                      )}
                    </span>
                  </div>
                )}

                <p className="text-[11px] text-ink-500 bg-brand-50/50 p-2.5 rounded-lg border border-brand-100">
                  ℹ️ Saving changes will update this transaction and recalculate the asset holding's units, average cost basis, and portfolio valuation.
                </p>

                <div className="pt-2 flex justify-end gap-2 border-t border-ink-100">
                  <button
                    type="button"
                    onClick={() => setEditingInvestmentTx(null)}
                    className="cash-button-secondary py-2 px-4 text-xs font-semibold"
                    disabled={savingInvestmentTx}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingInvestmentTx}
                    className="cash-button-primary py-2 px-4 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700"
                  >
                    {savingInvestmentTx ? 'Updating...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      <AIBulkAdd
        isBulkOpen={isBulkOpen}
        setIsBulkOpen={setIsBulkOpen}
        bulkStep={bulkStep}
        setBulkStep={setBulkStep}
        pasteValue={pasteValue}
        setPasteValue={setPasteValue}
        parsedExpenses={parsedExpenses}
        setParsedExpenses={setParsedExpenses}
        bulkError={bulkError}
        setBulkError={setBulkError}
        bulkSaving={bulkSaving}
        handlePreview={handlePreview}
        handleConfirmImport={handleConfirmImport}
        AI_PROMPT={AI_PROMPT}
      />

      {/* Quick Entry Form Modal Triggered by Button */}
      <div
        className={`fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-ink-900/60 backdrop-blur-sm transition-all duration-200 ${
          isQuickOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div
          className={`cash-card max-w-lg w-full max-h-[90vh] flex flex-col p-5 sm:p-6 bg-white transform transition-all duration-200 shadow-2xl overflow-hidden ${
            isQuickOpen ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
          }`}
        >
          <div className="mb-3 flex items-center justify-between border-b border-ink-100 pb-3 shrink-0">
            <div>
              <h3 className="text-xl font-semibold text-ink-900">⚡ Quick Entry</h3>
              <p className="text-xs text-ink-500">Tap chips for instant transaction record.</p>
            </div>
            <button
              type="button"
              className="rounded-full p-2 text-ink-500 hover:bg-ink-100 transition"
              onClick={() => {
                setIsQuickOpen(false);
                setEditingId(null);
                setForm(emptyForm(pathname === '/income' ? 'INCOME' : 'EXPENSE'));
              }}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="overflow-y-auto flex-1 pr-1 -mr-1">
            <TransactionForm
              form={form}
              setForm={setForm}
              onSubmit={handleSubmit}
              saving={saving}
              editingId={editingId}
              setEditingId={setEditingId}
              allCategories={allCategories}
              allTags={allTags}
              eligibleRecipients={eligibleRecipients}
              showCustomInput={showCustomInput}
              setShowCustomInput={setShowCustomInput}
              onCancel={() => {
                setIsQuickOpen(false);
                setEditingId(null);
                setForm(emptyForm(pathname === '/income' ? 'INCOME' : 'EXPENSE'));
              }}
              quickAmountRef={quickAmountRef}
              isQuickForm={true}
              pathname={pathname}
              isPwaActive={isPwaActive}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
