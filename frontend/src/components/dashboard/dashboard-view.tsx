'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  deleteExpense,
  fetchExpenses,
  createExpense,
  updateExpense,
  createExpensesBulk,
  fetchCurrentUser,
  fetchGroups,
  fetchGroupExpenses
} from '../../lib/api';
import { AuthUser, Expense } from '../../lib/types';
import {
  categoryBreakdown,
  formatCurrency,
  monthlyExpenses,
  totalExpenses,
  totalIncome,
  transfersSent,
  transfersReceived,
  totalOutflow
} from '../../lib/finance';

import { DashboardStats } from './components/DashboardStats';
import { DashboardCharts } from './components/DashboardCharts';
import { TransactionList } from './components/TransactionList';
import { TransactionForm } from './components/TransactionForm';
import { AIBulkAdd } from './components/AIBulkAdd';
import { DashboardHeader } from './components/DashboardHeader';

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

export type DashboardConfig = {
  id: string;
  type: 'personal' | 'group' | 'custom';
  name: string;
  categories?: string[];
  tags?: string[];
};

export function DashboardView() {
  const pathname = usePathname();
  const quickAmountRef = useRef<HTMLInputElement>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [fromFilter, setFromFilter] = useState('');
  const [toFilter, setToFilter] = useState('');
  const [categoryTypeFilter, setCategoryTypeFilter] = useState('');
  const [form, setForm] = useState(emptyForm());

  // Dashboard Management States
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
      const data = await fetchExpenses({
        category: categoryFilter || undefined,
        tag: tagFilter || undefined,
        from: fromFilter || undefined,
        to: toFilter || undefined,
        categoryType: categoryTypeFilter || undefined
      });
      setExpenses(data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load expenses');
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

  const getExpensesMetrics = (list: Expense[]) => {
    const totalOut = totalOutflow(list, currentUser?.id || '');
    const totalIn = totalIncome(list);
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

  const displayedExpenses = useMemo(() => {
    let list = activeExpenses;

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
  }, [activeExpenses, selectedDashboard, categoryFilter, tagFilter, fromFilter, toFilter, categoryTypeFilter]);

  const dashboardTotals = useMemo(() => {
    const sorted = [...activeExpenses].sort(
      (left, right) => new Date(right.date).getTime() - new Date(left.date).getTime()
    );
    const recent = sorted.slice(0, 5);

    const expensesTotal = totalExpenses(activeExpenses);
    const expensesMonthly = monthlyExpenses(activeExpenses);
    const incomeTotal = totalIncome(activeExpenses);
    const tSent = currentUser ? transfersSent(activeExpenses, currentUser.id) : 0;
    const tReceived = currentUser ? transfersReceived(activeExpenses, currentUser.id) : 0;
    const outflowTotal = currentUser ? totalOutflow(activeExpenses, currentUser.id) : expensesTotal;

    return {
      total: expensesTotal,
      monthly: expensesMonthly,
      income: incomeTotal,
      transfersSent: tSent,
      transfersReceived: tReceived,
      outflow: outflowTotal,
      categories: categoryBreakdown(activeExpenses),
      recent
    };
  }, [activeExpenses, currentUser]);

  const areaData = useMemo(() => {
    if (activeExpenses.length === 0) {
      return [];
    }

    const sorted = [...activeExpenses].sort(
      (left, right) => new Date(left.date).getTime() - new Date(right.date).getTime()
    );

    const latestExpense = sorted[sorted.length - 1];
    const latestDate = new Date(latestExpense.date);
    const targetYear = latestDate.getFullYear();
    const targetMonth = latestDate.getMonth();

    const today = new Date();
    let lastDay = new Date(targetYear, targetMonth + 1, 0).getDate();

    if (targetYear === today.getFullYear() && targetMonth === today.getMonth()) {
      lastDay = Math.max(today.getDate(), latestDate.getDate());
    }

    const dailyTotals: Record<number, number> = {};
    sorted.forEach((expense) => {
      const expDate = new Date(expense.date);
      if (expDate.getFullYear() === targetYear && expDate.getMonth() === targetMonth) {
        const day = expDate.getDate();
        dailyTotals[day] = (dailyTotals[day] || 0) + expense.amount;
      }
    });

    const chartData = [];
    const monthLabel = latestDate.toLocaleDateString(undefined, { month: 'short' });

    for (let day = 1; day <= lastDay; day++) {
      chartData.push({
        date: `${monthLabel} ${day}`,
        amount: dailyTotals[day] || 0
      });
    }

    return chartData;
  }, [activeExpenses]);

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
        transactionType: (form.transactionType || 'EXPENSE') as 'EXPENSE' | 'INCOME' | 'TRANSFER',
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
    if (!confirm('Delete this expense?')) {
      return;
    }

    await deleteExpense(id);
    await loadExpenses();
  }

  const renderRecentActivity = () => (
    <div className="cash-card p-6">
      <h2 className="text-2xl font-semibold text-ink-900 text-left">Recent activity</h2>
      <div className="mt-4 space-y-4">
        {dashboardTotals.recent.length === 0 ? (
          <p className="py-8 text-center text-xs text-ink-400">No transactions recorded yet.</p>
        ) : (
          dashboardTotals.recent.map((expense) => (
            <div key={expense.id} className="flex items-center justify-between border-b border-ink-50 pb-3 text-left">
              <div>
                <p className="text-sm font-semibold text-ink-800">{getTransactionTitle(expense, currentUser?.id)}</p>
                <p className="text-xxs text-ink-400 mt-0.5">
                  {new Date(expense.date).toLocaleString('en-IN', {
                    dateStyle: 'medium',
                    timeStyle: 'short'
                  })}{' '}
                  • {expense.paymentMethod}
                </p>
              </div>
              <div className="text-right">{getAmountDisplay(expense, currentUser?.id)}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );

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
                areaData={areaData}
                categories={dashboardTotals.categories}
                categoryPalette={categoryPalette}
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

        {/* Route Segment 3: Expenses Form Page */}
        {(pathname === '/expenses' || pathname === '/income') && (
          <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-6">
              {pathname === '/income' && (
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
              )}

              <div className="cash-card p-6">
                <div className="mb-6 flex items-start justify-between gap-4 border-b border-ink-100 pb-4">
                  <div>
                    <h2 className="text-2xl font-semibold text-ink-900">
                      {editingId ? 'Edit transaction' : pathname === '/income' ? 'Add income' : 'Add expense'}
                    </h2>
                    <p className="text-sm text-ink-500">
                      {pathname === '/income'
                        ? 'Record salary, dividends, and other earnings.'
                        : 'Keep the data model ready for future encryption and prediction layers.'}
                    </p>
                  </div>
                  {!editingId && (
                    <div className="flex gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={handleInstallApp}
                        className="cash-button-secondary py-1.5 px-3 text-xs flex items-center gap-1 border-brand-200 bg-brand-50/50 text-brand-700 hover:bg-brand-50 transition-all font-semibold"
                        title="Add to Home Screen / Install PWA App"
                      >
                        <span>📥 Add to Home</span>
                      </button>
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
                      <button
                        type="button"
                        onClick={() => {
                          setBulkStep('input');
                          setBulkError('');
                          setIsBulkOpen(true);
                        }}
                        className="cash-button-secondary py-1.5 px-3 text-xs flex items-center gap-1 border-brand-200 bg-brand-50/50 text-brand-700 hover:bg-brand-50 transition-all font-semibold animate-pulse"
                      >
                        <span>⚡ AI Bulk Add</span>
                      </button>
                    </div>
                  )}
                </div>

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
                      setForm(emptyForm(pathname === '/income' ? 'INCOME' : 'EXPENSE'));
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
                      setForm(emptyForm(pathname === '/income' ? 'INCOME' : 'EXPENSE'));
                    }}
                    pathname={pathname}
                  />
                </div>
              </div>
            </div>

            <aside className="space-y-6">
              {renderRecentActivity()}
            </aside>
          </section>
        )}

        {/* Modal edit panel for transactions page */}
        {pathname === '/transactions' && editingId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="cash-card max-w-md w-full p-6 bg-white animate-in zoom-in duration-200">
              <div className="mb-4 flex items-center justify-between border-b border-ink-100 pb-4">
                <div>
                  <h3 className="text-xl font-semibold text-ink-900">Edit Expense</h3>
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
        className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/60 backdrop-blur-sm transition-all duration-200 ${
          isQuickOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div
          className={`cash-card max-w-md w-full p-6 bg-white transform transition-all duration-200 ${
            isQuickOpen ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
          }`}
        >
          <div className="mb-4 flex items-center justify-between border-b border-ink-100 pb-4">
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
  );
}
