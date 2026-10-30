'use client';

import { useEffect, useState } from 'react';
import {
  fetchCurrentUser,
  fetchExpenses,
  getSavedAccounts,
  exportAccountData,
  importAccountData,
  requestToJoinGroup,
  get2faStatus,
  setup2fa,
  enable2fa,
  disable2fa,
  regenerateRecoveryCodes,
  changePassword,
  type SavedAccount,
  type AccountExportPayload,
  type ImportResult,
  type TwoFactorSetupData,
  type TwoFactorStatus
} from '../../../lib/api';
import { AuthUser } from '../../../lib/types';
import {
  getQuickFormPreferences,
  saveQuickFormPreferences,
  DEFAULT_QUICK_FORM_PREFERENCES,
  QUICK_FORM_FIELDS,
  type QuickFormPreferences
} from '../../../lib/quick-form-preferences';

interface TagItem {
  name: string;
  count: number;
}

interface CategoryItem {
  name: string;
  count: number;
  isCustom: boolean;
  type?: 'EXPENSE' | 'INCOME';
}

const DEFAULT_EXPENSE_CATS = ['Grocery', 'Fuel', 'Food & Beverage', 'Shopping', 'Entertainment', 'Utilities', 'Other'];
const DEFAULT_INCOME_CATS = ['Salary', 'Freelance', 'Investment', 'Other'];

export default function SettingsPage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([]);
  const [activeTab, setActiveTab] = useState<'profile' | 'preferences' | 'data' | 'security'>('profile');
  const [loading, setLoading] = useState(true);

  // Export / Import states
  const [exporting, setExporting] = useState(false);
  const [exportSuccessMsg, setExportSuccessMsg] = useState('');
  const [exportError, setExportError] = useState('');

  const [importFile, setImportFile] = useState<File | null>(null);
  const [importJsonData, setImportJsonData] = useState<AccountExportPayload | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [requestedGroupIds, setRequestedGroupIds] = useState<Record<string, boolean>>({});

  // Settings states
  const [currency, setCurrency] = useState('INR');
  const [notifications, setNotifications] = useState(true);
  const [theme, setTheme] = useState('light');

  // Quick Form Preferences state
  const [quickPrefs, setQuickPrefs] = useState<QuickFormPreferences>(() => getQuickFormPreferences());
  const [quickPrefsSavedMsg, setQuickPrefsSavedMsg] = useState('');

  // Manage Tags state
  const [tags, setTags] = useState<TagItem[]>([]);
  const [newTagInput, setNewTagInput] = useState('');

  // Manage Categories state
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [newCatInput, setNewCatInput] = useState('');
  const [newCatType, setNewCatType] = useState<'EXPENSE' | 'INCOME'>('EXPENSE');

  // 2FA & Security states
  const [twoFactorStatus, setTwoFactorStatus] = useState<TwoFactorStatus | null>(null);
  const [loading2faStatus, setLoading2faStatus] = useState(false);

  // 2FA Setup Modal State
  const [is2faSetupModalOpen, setIs2faSetupModalOpen] = useState(false);
  const [setupData, setSetupData] = useState<TwoFactorSetupData | null>(null);
  const [setupCode, setSetupCode] = useState('');
  const [setupError, setSetupError] = useState('');
  const [setupSubmitting, setSetupSubmitting] = useState(false);
  const [newRecoveryCodes, setNewRecoveryCodes] = useState<string[]>([]);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedCodes, setCopiedCodes] = useState(false);

  // 2FA Disable Modal State
  const [is2faDisableModalOpen, setIs2faDisableModalOpen] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [disableError, setDisableError] = useState('');
  const [disableSubmitting, setDisableSubmitting] = useState(false);

  // 2FA Regenerate Codes Modal State
  const [isRegenerateModalOpen, setIsRegenerateModalOpen] = useState(false);
  const [regenPassword, setRegenPassword] = useState('');
  const [regenError, setRegenError] = useState('');
  const [regenSubmitting, setRegenSubmitting] = useState(false);
  const [regeneratedCodes, setRegeneratedCodes] = useState<string[]>([]);
  const [copiedRegenCodes, setCopiedRegenCodes] = useState(false);

  // Change Password State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const [currentUser, userExpenses, status2fa] = await Promise.all([
          fetchCurrentUser(),
          fetchExpenses().catch(() => []),
          get2faStatus().catch(() => null)
        ]);
        setUser(currentUser);
        if (status2fa) {
          setTwoFactorStatus(status2fa);
        }

        // 1. Calculate tag usage count from expenses
        const tagCounts: Record<string, number> = {};
        userExpenses.forEach((exp) => {
          exp.tags?.forEach((t) => {
            if (t.name) {
              const nameTrimmed = t.name.trim();
              tagCounts[nameTrimmed] = (tagCounts[nameTrimmed] || 0) + 1;
            }
          });
        });

        // Load custom tags from local storage
        const tagStoredKey = `cashflow_custom_tags_${currentUser?.id || 'guest'}`;
        let customTags: string[] = [];
        try {
          const stored = localStorage.getItem(tagStoredKey);
          if (stored) customTags = JSON.parse(stored);
        } catch (err) {
          console.error('Failed to parse custom tags', err);
        }

        const allTagNames = Array.from(new Set([...Object.keys(tagCounts), ...customTags])).sort((a, b) =>
          a.localeCompare(b)
        );
        setTags(allTagNames.map((name) => ({ name, count: tagCounts[name] || 0 })));

        // 2. Calculate category usage count from expenses
        const catCounts: Record<string, number> = {};
        userExpenses.forEach((exp) => {
          if (exp.category) {
            const nameTrimmed = exp.category.trim();
            catCounts[nameTrimmed] = (catCounts[nameTrimmed] || 0) + 1;
          }
        });

        // Load custom categories from local storage
        const catStoredKey = `cashflow_custom_cats_${currentUser?.id || 'guest'}`;
        let customCats: string[] = [];
        try {
          const stored = localStorage.getItem(catStoredKey);
          if (stored) customCats = JSON.parse(stored);
        } catch (err) {
          console.error('Failed to parse custom categories', err);
        }

        const allCatNames = Array.from(
          new Set([...DEFAULT_EXPENSE_CATS, ...DEFAULT_INCOME_CATS, ...customCats, ...Object.keys(catCounts)])
        ).sort((a, b) => a.localeCompare(b));

        setCategories(
          allCatNames.map((name) => ({
            name,
            count: catCounts[name] || 0,
            isCustom: customCats.includes(name),
            type: DEFAULT_INCOME_CATS.includes(name) ? 'INCOME' : 'EXPENSE'
          }))
        );
      } catch (err) {
        console.error('Failed to load settings data', err);
      } finally {
        setLoading(false);
      }
    }
    void loadData();
    setSavedAccounts(getSavedAccounts());
    setQuickPrefs(getQuickFormPreferences());
  }, []);

  const handleUpdateQuickPref = (key: keyof QuickFormPreferences, value: boolean) => {
    const updated = { ...quickPrefs, [key]: value };
    setQuickPrefs(updated);
    saveQuickFormPreferences({ [key]: value });
    setQuickPrefsSavedMsg('Preferences saved');
    setTimeout(() => setQuickPrefsSavedMsg(''), 2500);
  };

  const handleResetQuickPrefs = () => {
    setQuickPrefs(DEFAULT_QUICK_FORM_PREFERENCES);
    saveQuickFormPreferences(DEFAULT_QUICK_FORM_PREFERENCES);
    setQuickPrefsSavedMsg('Reset to default');
    setTimeout(() => setQuickPrefsSavedMsg(''), 2500);
  };

  const handleAddTag = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newTagInput.trim();
    if (!trimmed) return;

    if (tags.some((t) => t.name.toLowerCase() === trimmed.toLowerCase())) {
      alert('This tag already exists!');
      return;
    }

    const updated = [...tags, { name: trimmed, count: 0 }].sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    setTags(updated);
    setNewTagInput('');

    if (user) {
      const storedKey = `cashflow_custom_tags_${user.id}`;
      localStorage.setItem(storedKey, JSON.stringify(updated.map((t) => t.name)));
    }
  };

  const handleDeleteTag = (tagName: string) => {
    const updated = tags.filter((t) => t.name !== tagName);
    setTags(updated);

    if (user) {
      const storedKey = `cashflow_custom_tags_${user.id}`;
      localStorage.setItem(storedKey, JSON.stringify(updated.map((t) => t.name)));
    }
  };

  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newCatInput.trim();
    if (!trimmed) return;

    if (categories.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) {
      alert('This category already exists!');
      return;
    }

    const newCatItem: CategoryItem = {
      name: trimmed,
      count: 0,
      isCustom: true,
      type: newCatType
    };

    const updated = [...categories, newCatItem].sort((a, b) => a.name.localeCompare(b.name));
    setCategories(updated);
    setNewCatInput('');

    if (user) {
      const catStoredKey = `cashflow_custom_cats_${user.id}`;
      const customList = updated.filter((c) => c.isCustom).map((c) => c.name);
      localStorage.setItem(catStoredKey, JSON.stringify(customList));
    }
  };

  const handleDeleteCategory = (catName: string) => {
    const updated = categories.filter((c) => c.name !== catName);
    setCategories(updated);

    if (user) {
      const catStoredKey = `cashflow_custom_cats_${user.id}`;
      const customList = updated.filter((c) => c.isCustom).map((c) => c.name);
      localStorage.setItem(catStoredKey, JSON.stringify(customList));
    }
  };

  const handleExportData = async () => {
    if (!user) return;
    setExporting(true);
    setExportError('');
    setExportSuccessMsg('');
    try {
      const payload = await exportAccountData();

      // Gather local preferences if available
      try {
        const catKey = `cashflow_custom_cats_${user.id}`;
        const tagKey = `cashflow_custom_tags_${user.id}`;
        const dashKey = `cashflow_custom_dashboards_${user.id}`;
        const savedCats = localStorage.getItem(catKey);
        const savedTags = localStorage.getItem(tagKey);
        const savedDash = localStorage.getItem(dashKey);

        payload.data.customPreferences = {
          categories: savedCats ? JSON.parse(savedCats) : [],
          tags: savedTags ? JSON.parse(savedTags) : [],
          dashboards: savedDash ? JSON.parse(savedDash) : [],
          quickFormPreferences: getQuickFormPreferences()
        };
      } catch (err) {
        console.warn('Could not bundle local preferences:', err);
      }

      // Generate downloadable JSON blob
      const jsonStr = JSON.stringify(payload, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const filename = `cashflow_backup_${user.id}_${payload.exportId}.json`;

      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setExportSuccessMsg(`Successfully generated and downloaded backup file: "${filename}" with ${payload.summary.totalTransactions} transactions, ${payload.summary.totalInvestments} investments, and ${payload.summary.totalGroups} groups.`);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Failed to export account data');
    } finally {
      setExporting(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFile(file);
    setImportError('');
    setImportResult(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);
        if (!parsed || typeof parsed !== 'object') {
          throw new Error('Selected file does not contain a valid JSON object.');
        }
        setImportJsonData(parsed);
      } catch (err) {
        setImportError(err instanceof Error ? err.message : 'Invalid JSON file format.');
        setImportJsonData(null);
      }
    };
    reader.onerror = () => {
      setImportError('Failed to read the selected file.');
    };
    reader.readAsText(file);
  };

  const handleExecuteImport = async () => {
    if (!importJsonData || !user) return;
    setImporting(true);
    setImportError('');
    setImportResult(null);

    try {
      const result = await importAccountData(importJsonData);
      setImportResult(result);

      // If customPreferences exist in the backup, restore them into localStorage
      if (importJsonData.data?.customPreferences) {
        const prefs = importJsonData.data.customPreferences;
        if (Array.isArray(prefs.categories) && prefs.categories.length > 0) {
          localStorage.setItem(`cashflow_custom_cats_${user.id}`, JSON.stringify(prefs.categories));
        }
        if (Array.isArray(prefs.tags) && prefs.tags.length > 0) {
          localStorage.setItem(`cashflow_custom_tags_${user.id}`, JSON.stringify(prefs.tags));
        }
        if (Array.isArray(prefs.dashboards) && prefs.dashboards.length > 0) {
          localStorage.setItem(`cashflow_custom_dashboards_${user.id}`, JSON.stringify(prefs.dashboards));
        }
        if (prefs.quickFormPreferences) {
          saveQuickFormPreferences(prefs.quickFormPreferences);
          setQuickPrefs(getQuickFormPreferences());
        }
      }

      // Reset file input preview
      setImportFile(null);
      setImportJsonData(null);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Failed to import account data.');
    } finally {
      setImporting(false);
    }
  };

  const handleRequestJoin = async (groupId: string) => {
    try {
      const res = await requestToJoinGroup(groupId);
      setRequestedGroupIds(prev => ({ ...prev, [groupId]: true }));
      alert(res.message);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to send join request');
    }
  };

  async function load2faStatus() {
    setLoading2faStatus(true);
    try {
      const status = await get2faStatus();
      setTwoFactorStatus(status);
    } catch (err) {
      console.error('Failed to load 2FA status', err);
    } finally {
      setLoading2faStatus(false);
    }
  }

  useEffect(() => {
    if (activeTab === 'security') {
      void load2faStatus();
    }
  }, [activeTab]);

  const handleStart2faSetup = async () => {
    setSetupError('');
    setSetupCode('');
    setNewRecoveryCodes([]);
    setCopiedKey(false);
    setCopiedCodes(false);
    setSetupSubmitting(true);
    setIs2faSetupModalOpen(true);
    try {
      const data = await setup2fa();
      setSetupData(data);
    } catch (err) {
      setSetupError(err instanceof Error ? err.message : 'Failed to initialize 2FA setup');
    } finally {
      setSetupSubmitting(false);
    }
  };

  const handleConfirm2faEnable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!setupCode.trim()) return;
    setSetupError('');
    setSetupSubmitting(true);
    try {
      const res = await enable2fa(setupCode.trim());
      setNewRecoveryCodes(res.recoveryCodes);
      setTwoFactorStatus({ enabled: true, remainingRecoveryCodes: res.recoveryCodes.length });
      if (user) {
        setUser({ ...user, twoFactorEnabled: true });
      }
    } catch (err) {
      setSetupError(err instanceof Error ? err.message : 'Invalid verification code. Please check your authenticator app and try again.');
    } finally {
      setSetupSubmitting(false);
    }
  };

  const handleExecute2faDisable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disablePassword) {
      setDisableError('Please enter your current password to confirm.');
      return;
    }
    setDisableError('');
    setDisableSubmitting(true);
    try {
      await disable2fa({ password: disablePassword, code: disableCode.trim() || undefined });
      setTwoFactorStatus({ enabled: false, remainingRecoveryCodes: 0 });
      if (user) {
        setUser({ ...user, twoFactorEnabled: false });
      }
      setIs2faDisableModalOpen(false);
      setDisablePassword('');
      setDisableCode('');
    } catch (err) {
      setDisableError(err instanceof Error ? err.message : 'Failed to disable 2FA. Verify your password.');
    } finally {
      setDisableSubmitting(false);
    }
  };

  const handleExecuteRegenerateCodes = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regenPassword) {
      setRegenError('Please enter your current password to confirm.');
      return;
    }
    setRegenError('');
    setRegenSubmitting(true);
    try {
      const res = await regenerateRecoveryCodes(regenPassword);
      setRegeneratedCodes(res.recoveryCodes);
      setTwoFactorStatus({ enabled: true, remainingRecoveryCodes: res.recoveryCodes.length });
      setRegenPassword('');
    } catch (err) {
      setRegenError(err instanceof Error ? err.message : 'Failed to regenerate backup codes. Verify your password.');
    } finally {
      setRegenSubmitting(false);
    }
  };

  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');
    if (!currentPassword) {
      setPasswordError('Please enter your current password');
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters long');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }
    setPasswordSubmitting(true);
    try {
      const res = await changePassword({ currentPassword, newPassword });
      setPasswordSuccess(res.message || 'Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Failed to change password. Verify your current password.');
    } finally {
      setPasswordSubmitting(false);
    }
  };

  const downloadRecoveryCodes = (codes: string[]) => {
    const text = `CASHFLOW EMERGENCY TWO-FACTOR BACKUP CODES\nGenerated: ${new Date().toISOString()}\nAccount: ${user?.email || ''}\n\n` +
      `Each of these 8 codes can be used ONCE as an emergency fallback if you lose your mobile authenticator device.\n\n` +
      codes.map((c, i) => `${i + 1}. ${c}`).join('\n') +
      `\n\nStore this file in an encrypted vault or safe offline location.`;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cashflow-2fa-backup-codes-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getInitials = () => {
    if (!user || !user.name) return 'U';
    const parts = user.name.split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return user.name.slice(0, 2).toUpperCase();
  };

  if (loading) {
    return (
      <div className="min-h-screen px-4 py-8 sm:px-6 lg:px-8 bg-ink-50">
        <div className="mx-auto max-w-7xl space-y-6 text-left">
          <div className="h-10 w-48 bg-ink-150 rounded animate-pulse" />
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="h-28 bg-white rounded-3xl border border-ink-100 animate-pulse" />
            <div className="h-28 bg-white rounded-3xl border border-ink-100 animate-pulse" />
            <div className="h-28 bg-white rounded-3xl border border-ink-100 animate-pulse" />
            <div className="h-28 bg-white rounded-3xl border border-ink-100 animate-pulse" />
          </div>
          <div className="h-80 bg-white rounded-3xl border border-ink-100 animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-8 sm:px-6 lg:px-8 bg-ink-50 text-ink-900 text-left animate-in fade-in duration-200">
      <div className="mx-auto max-w-7xl space-y-6">
        
        {/* Header matching Investments & Groups */}
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-ink-100 pb-4">
          <div className="space-y-1">
            <h1 className="font-display text-4xl font-semibold tracking-tight text-ink-900">
              Settings & Account Control
            </h1>
            <p className="text-sm text-ink-500">
              Manage your account profiles, categories, tags, visual preferences, and security configurations.
            </p>
          </div>
        </header>

        {/* Top 4-Stats Grid matching Investments & Groups */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-left">
          <article className="cash-card p-5 bg-white border border-ink-150 relative overflow-hidden">
            <p className="text-xs font-semibold text-ink-500">Active Profile</p>
            <p className="mt-2 text-2xl font-bold tracking-tight text-ink-900 truncate">
              {user?.name || 'User'}
            </p>
            <div className="mt-2 text-xs text-ink-400 truncate">
              {user?.email || 'N/A'}
            </div>
          </article>

          <article className="cash-card p-5 bg-white border border-ink-150 relative overflow-hidden">
            <p className="text-xs font-semibold text-ink-500">Saved Sessions</p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-brand-700">
              {savedAccounts.length}
            </p>
            <div className="mt-2 text-xs text-ink-400">
              Browser accounts
            </div>
          </article>

          <article className="cash-card p-5 bg-white border border-ink-150 relative overflow-hidden">
            <p className="text-xs font-semibold text-ink-500">Categories</p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-emerald-600">
              {categories.length}
            </p>
            <div className="mt-2 text-xs text-ink-400">
              Expense & Income types
            </div>
          </article>

          <article className="cash-card p-5 bg-white border border-ink-150 relative overflow-hidden">
            <p className="text-xs font-semibold text-ink-500">Active Tags</p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-ink-900">
              {tags.length}
            </p>
            <div className="mt-2 text-xs text-ink-400">
              Categorization tags
            </div>
          </article>
        </section>

        {/* Main Settings Card */}
        <div className="cash-card p-6 bg-white border border-ink-150 space-y-6">
          {/* Navigation Tab Pills */}
          <div className="flex gap-2 border-b border-ink-100 pb-4 overflow-x-auto">
            {[
              { id: 'profile', label: '👤 User Profile' },
              { id: 'preferences', label: '⚙️ Preferences' },
              { id: 'data', label: '💾 Backup & Restore (Export/Import)' },
              { id: 'security', label: '🛡️ Security' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-4 py-2 text-xs font-semibold rounded-xl transition shrink-0 ${
                  activeTab === tab.id
                    ? 'bg-brand-900 text-white shadow-sm'
                    : 'bg-ink-50 text-ink-600 hover:bg-ink-100/80 border border-ink-150'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Profile Tab */}
          {activeTab === 'profile' && user && (
            <section className="space-y-6 animate-in fade-in duration-150">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-100 text-brand-800 text-lg font-bold border border-brand-200 shadow-sm shrink-0">
                  {getInitials()}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-ink-900">{user.name}</h3>
                  <p className="text-xs text-ink-500">Active account session</p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="cash-label">Email address</label>
                  <input className="cash-input bg-ink-50/50 cursor-not-allowed text-xs" value={user.email} disabled />
                </div>
                <div>
                  <label className="cash-label">Phone number</label>
                  <input className="cash-input bg-ink-50/50 cursor-not-allowed text-xs" value={user.phoneNumber || 'N/A'} disabled />
                </div>
                <div>
                  <label className="cash-label">Account Created</label>
                  <input className="cash-input bg-ink-50/50 cursor-not-allowed text-xs" value={new Date(user.createdAt).toLocaleDateString()} disabled />
                </div>
                <div>
                  <label className="cash-label">User ID (Numeric UUIDv7)</label>
                  <input className="cash-input bg-ink-50/50 cursor-not-allowed font-mono text-xs font-semibold text-ink-900" value={user.id} disabled />
                </div>
              </div>

              {/* Data Portability Banner */}
              <div className="p-4 border border-brand-200 rounded-2xl bg-brand-50/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-brand-900 flex items-center gap-2">
                    <span>💾 Account Data Backup & Portability</span>
                    <span className="text-[10px] bg-brand-200 text-brand-900 px-2 py-0.5 rounded-full font-bold">
                      Zero-Duplicates
                    </span>
                  </p>
                  <p className="text-xs text-brand-700 mt-0.5">
                    Export all transactions, investments, groups, and tags into a JSON backup or restore an existing archive.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('data')}
                  className="px-4 py-2 bg-brand-800 hover:bg-brand-900 text-white font-semibold text-xs rounded-xl transition shrink-0 shadow-xs"
                >
                  Open Backup & Restore
                </button>
              </div>

              <div className="pt-4 border-t border-ink-100">
                <h4 className="text-sm font-semibold text-ink-900">Linked Accounts in this browser</h4>
                <p className="text-xs text-ink-500 mt-0.5">
                  You have {savedAccounts.length} saved accounts in your session storage. Use the navbar switcher to toggle.
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {savedAccounts.map((acc) => (
                    <div key={acc.id} className="flex justify-between items-center p-3 border border-ink-150 rounded-2xl bg-ink-50/40 text-xs">
                      <div className="truncate mr-2">
                        <p className="font-semibold text-ink-900 truncate">
                          {acc.name}{' '}
                          {acc.id === user.id && (
                            <span className="text-xxs bg-brand-100 text-brand-800 px-1.5 py-0.5 rounded-full font-bold ml-1">
                              Active
                            </span>
                          )}
                        </p>
                        <p className="text-ink-500 text-xxs truncate mt-0.5">{acc.email}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* Preferences Tab */}
          {activeTab === 'preferences' && (
            <section className="space-y-6 animate-in fade-in duration-150">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex items-center justify-between p-4 border border-ink-150 rounded-2xl bg-ink-50/30">
                  <div>
                    <p className="text-sm font-semibold text-ink-900">Primary Currency</p>
                    <p className="text-xs text-ink-500 mt-0.5">Determine currency symbol used on dashboard calculations.</p>
                  </div>
                  <select
                    className="cash-input max-w-[110px] text-xs py-1.5"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                  >
                    <option value="INR">INR (₹)</option>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                  </select>
                </div>

                <div className="flex items-center justify-between p-4 border border-ink-150 rounded-2xl bg-ink-50/30">
                  <div>
                    <p className="text-sm font-semibold text-ink-900">App Theme</p>
                    <p className="text-xs text-ink-500 mt-0.5">Choose layout background color scheme.</p>
                  </div>
                  <div className="flex gap-2">
                    {['light', 'dark'].map((t) => (
                      <button
                        key={t}
                        onClick={() => setTheme(t)}
                        className={`capitalize px-3 py-1 text-xs font-semibold rounded-lg border transition ${
                          theme === t
                            ? 'bg-brand-900 text-white border-brand-900'
                            : 'border-ink-200 text-ink-600 hover:bg-ink-100/50'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 border border-ink-150 rounded-2xl bg-ink-50/30">
                  <div>
                    <p className="text-sm font-semibold text-ink-900">Push Notifications</p>
                    <p className="text-xs text-ink-500 mt-0.5">Alert for unusual budget activity or spikes.</p>
                  </div>
                  <input
                    type="checkbox"
                    className="h-5 w-5 rounded border-ink-300 text-brand-700 focus:ring-brand-500 cursor-pointer"
                    checked={notifications}
                    onChange={(e) => setNotifications(e.target.checked)}
                  />
                </div>
              </div>

              {/* Quick Entry Form Preferences */}
              <div className="pt-6 border-t border-ink-100 space-y-4 text-left">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h4 className="text-base font-bold text-ink-900 flex items-center gap-2">
                      <span>⚡ Quick Entry Form Customization</span>
                      <span className="text-xs bg-brand-100 text-brand-800 px-2 py-0.5 rounded-full font-bold">
                        User Preferences
                      </span>
                      {quickPrefsSavedMsg && (
                        <span className="text-xs bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full font-semibold animate-in fade-in duration-200">
                          ✓ {quickPrefsSavedMsg}
                        </span>
                      )}
                    </h4>
                    <p className="text-xs text-ink-500 mt-0.5">
                      Configure which fields appear in your Quick Entry form. Amount and Description are mandatory; use the radio options below to show or hide optional fields.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleResetQuickPrefs}
                    className="text-xs text-ink-500 hover:text-ink-800 underline self-start sm:self-auto font-medium transition"
                  >
                    Reset to Default
                  </button>
                </div>

                {/* Fields Table/Card */}
                <div className="overflow-hidden rounded-2xl border border-ink-150 bg-white divide-y divide-ink-100 shadow-2xs">
                  {QUICK_FORM_FIELDS.map((field) => {
                    const isMandatory = field.isMandatory;
                    const isChecked = isMandatory ? true : !!quickPrefs[field.key];

                    return (
                      <div
                        key={field.key}
                        className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 sm:p-4 gap-3 hover:bg-ink-50/40 transition"
                      >
                        <div className="flex items-start gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ink-50 border border-ink-150 text-base shadow-2xs">
                            {field.icon}
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-ink-900">{field.label}</span>
                              {isMandatory && (
                                <span className="text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-200/80 px-2 py-0.5 rounded-full">
                                  Mandatory
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-ink-500 mt-0.5">{field.description}</p>
                          </div>
                        </div>

                        {/* Radio Controls */}
                        <div className="shrink-0 pl-12 sm:pl-0">
                          {isMandatory ? (
                            <div className="flex items-center gap-2 text-xs font-semibold text-ink-400">
                              <label className="flex items-center gap-1.5 cursor-not-allowed opacity-75">
                                <input
                                  type="radio"
                                  name={`quick_pref_${field.key}`}
                                  checked={true}
                                  readOnly
                                  disabled
                                  className="h-3.5 w-3.5 accent-brand-700 cursor-not-allowed"
                                />
                                <span>Always Included</span>
                              </label>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 bg-ink-50/70 p-1 rounded-xl border border-ink-200/60">
                              <label
                                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer transition ${
                                  isChecked
                                    ? 'bg-brand-700 text-white shadow-2xs'
                                    : 'text-ink-600 hover:text-ink-900'
                                }`}
                              >
                                <input
                                  type="radio"
                                  name={`quick_pref_${field.key}`}
                                  value="show"
                                  checked={isChecked}
                                  onChange={() => handleUpdateQuickPref(field.key, true)}
                                  className="h-3.5 w-3.5 accent-brand-700 cursor-pointer"
                                />
                                <span>Show</span>
                              </label>

                              <label
                                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer transition ${
                                  !isChecked
                                    ? 'bg-ink-800 text-white shadow-2xs'
                                    : 'text-ink-600 hover:text-ink-900'
                                }`}
                              >
                                <input
                                  type="radio"
                                  name={`quick_pref_${field.key}`}
                                  value="hide"
                                  checked={!isChecked}
                                  onChange={() => handleUpdateQuickPref(field.key, false)}
                                  className="h-3.5 w-3.5 accent-ink-800 cursor-pointer"
                                />
                                <span>Hide</span>
                              </label>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Live Form Summary */}
                <div className="p-3.5 rounded-2xl bg-brand-50/40 border border-brand-200/50 flex flex-wrap items-center gap-2 text-xs text-ink-700">
                  <span className="font-bold text-brand-900 flex items-center gap-1">
                    <span>⚡ Quick Form will include:</span>
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-white border border-brand-200 text-ink-800 font-semibold text-[11px]">
                    ₹ Amount <span className="text-rose-500">*</span>
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-white border border-brand-200 text-ink-800 font-semibold text-[11px]">
                    📝 Description <span className="text-rose-500">*</span>
                  </span>
                  {quickPrefs.specialExpenseType && (
                    <span className="px-2 py-0.5 rounded-md bg-brand-100 text-brand-900 font-semibold text-[11px]">
                      🔄 Transfer & Lending
                    </span>
                  )}
                  {quickPrefs.quickCategories && (
                    <span className="px-2 py-0.5 rounded-md bg-brand-100 text-brand-900 font-semibold text-[11px]">
                      ⚡ Quick Categories
                    </span>
                  )}
                  {quickPrefs.categoryDropdown && (
                    <span className="px-2 py-0.5 rounded-md bg-brand-100 text-brand-900 font-semibold text-[11px]">
                      📁 Category Dropdown
                    </span>
                  )}
                  {quickPrefs.categoryType && (
                    <span className="px-2 py-0.5 rounded-md bg-brand-100 text-brand-900 font-semibold text-[11px]">
                      📌 Category Type
                    </span>
                  )}
                  {quickPrefs.date ? (
                    <span className="px-2 py-0.5 rounded-md bg-brand-100 text-brand-900 font-semibold text-[11px]">
                      📅 Date & Time (Manual)
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-md bg-ink-100 text-ink-600 font-medium text-[11px]">
                      📅 Date & Time (Auto Current Timestamp)
                    </span>
                  )}
                  {quickPrefs.paymentMethod && (
                    <span className="px-2 py-0.5 rounded-md bg-brand-100 text-brand-900 font-semibold text-[11px]">
                      💳 Payment Method
                    </span>
                  )}
                  {quickPrefs.paymentAccount && (
                    <span className="px-2 py-0.5 rounded-md bg-brand-100 text-brand-900 font-semibold text-[11px]">
                      🏦 Payment Account
                    </span>
                  )}
                  {quickPrefs.tags && (
                    <span className="px-2 py-0.5 rounded-md bg-brand-100 text-brand-900 font-semibold text-[11px]">
                      🏷️ Tags
                    </span>
                  )}
                </div>
              </div>

              {/* Manage Expense & Income Categories Feature */}
              <div className="pt-6 border-t border-ink-100 space-y-4 text-left">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-base font-bold text-ink-900 flex items-center gap-2">
                      <span>📂 Manage Expense & Income Categories</span>
                      <span className="text-xs bg-brand-100 text-brand-800 px-2 py-0.5 rounded-full font-bold">
                        {categories.length} {categories.length === 1 ? 'category' : 'categories'}
                      </span>
                    </h4>
                    <p className="text-xs text-ink-500 mt-0.5">
                      View, create, and manage categories available for expenses and income across all forms and reports.
                    </p>
                  </div>
                </div>

                {/* Add Category Form */}
                <form onSubmit={handleAddCategory} className="flex flex-col sm:flex-row gap-2 max-w-lg">
                  <input
                    type="text"
                    placeholder="e.g. Subscriptions, Healthcare, Education..."
                    className="cash-input text-xs py-2 flex-1"
                    value={newCatInput}
                    onChange={(e) => setNewCatInput(e.target.value)}
                  />
                  <select
                    className="cash-input max-w-[120px] text-xs py-2"
                    value={newCatType}
                    onChange={(e) => setNewCatType(e.target.value as any)}
                  >
                    <option value="EXPENSE">Expense</option>
                    <option value="INCOME">Income</option>
                  </select>
                  <button
                    type="submit"
                    disabled={!newCatInput.trim()}
                    className="cash-button-primary text-xs py-2 px-4 shrink-0 font-semibold disabled:opacity-50"
                  >
                    ➕ Add Category
                  </button>
                </form>

                {/* Categories List */}
                {categories.length === 0 ? (
                  <div className="p-4 border border-dashed border-ink-200 rounded-2xl bg-ink-50/20 text-center text-xs text-ink-400">
                    No categories recorded yet. Add your first category above.
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {categories.map((cat) => (
                      <span
                        key={cat.name}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-ink-200 bg-ink-50/70 text-ink-900 text-xs font-semibold shadow-2xs group hover:bg-ink-100 transition"
                      >
                        <span>📁 {cat.name}</span>
                        {cat.count > 0 && (
                          <span
                            className="text-xxs bg-brand-100 text-brand-800 px-1.5 py-0.2 rounded-full font-bold"
                            title={`${cat.count} transaction(s) in this category`}
                          >
                            {cat.count}
                          </span>
                        )}
                        {cat.isCustom && (
                          <button
                            type="button"
                            onClick={() => handleDeleteCategory(cat.name)}
                            className="ml-1 text-ink-400 hover:text-red-600 transition font-bold"
                            title={`Remove ${cat.name} custom category`}
                          >
                            ✕
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Manage Tags Feature */}
              <div className="pt-6 border-t border-ink-100 space-y-4 text-left">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-base font-bold text-ink-900 flex items-center gap-2">
                      <span>🏷️ Manage Tags</span>
                      <span className="text-xs bg-brand-100 text-brand-800 px-2 py-0.5 rounded-full font-bold">
                        {tags.length} {tags.length === 1 ? 'tag' : 'tags'}
                      </span>
                    </h4>
                    <p className="text-xs text-ink-500 mt-0.5">
                      View, create, and manage tags used for categorizing and searching transactions across your dashboards.
                    </p>
                  </div>
                </div>

                {/* Add Tag Form */}
                <form onSubmit={handleAddTag} className="flex gap-2 max-w-md">
                  <input
                    type="text"
                    placeholder="e.g. Travel, Work, Subscriptions..."
                    className="cash-input text-xs py-2 flex-1"
                    value={newTagInput}
                    onChange={(e) => setNewTagInput(e.target.value)}
                  />
                  <button
                    type="submit"
                    disabled={!newTagInput.trim()}
                    className="cash-button-primary text-xs py-2 px-4 shrink-0 font-semibold disabled:opacity-50"
                  >
                    ➕ Add Tag
                  </button>
                </form>

                {/* Tags List */}
                {tags.length === 0 ? (
                  <div className="p-4 border border-dashed border-ink-200 rounded-2xl bg-ink-50/20 text-center text-xs text-ink-400">
                    No tags recorded yet. Add your first tag above.
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {tags.map((tag) => (
                      <span
                        key={tag.name}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-brand-200 bg-brand-50/60 text-brand-900 text-xs font-semibold shadow-2xs group hover:bg-brand-100/70 transition"
                      >
                        <span>🏷️ {tag.name}</span>
                        {tag.count > 0 && (
                          <span
                            className="text-xxs bg-brand-200/80 text-brand-900 px-1.5 py-0.2 rounded-full font-bold"
                            title={`${tag.count} transaction(s) use this tag`}
                          >
                            {tag.count}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDeleteTag(tag.name)}
                          className="ml-1 text-brand-400 hover:text-red-600 transition font-bold"
                          title={`Remove ${tag.name} tag`}
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Backup & Restore (Export/Import) Tab */}
          {activeTab === 'data' && (
            <section className="space-y-6 animate-in fade-in duration-150 text-left">
              <div>
                <h3 className="text-lg font-bold text-ink-900 flex items-center gap-2">
                  <span>💾 Account Data Backup & Restore</span>
                  <span className="text-xs bg-brand-100 text-brand-800 px-2.5 py-0.5 rounded-full font-bold">
                    Zero-Duplicate Architecture
                  </span>
                </h3>
                <p className="text-xs text-ink-500 mt-1 max-w-2xl leading-relaxed">
                  Export your entire account history into a portable JSON backup file. Unique tracking IDs for all transactions (<code className="font-mono text-brand-700">E...</code>, <code className="font-mono text-brand-700">I...</code>, <code className="font-mono text-brand-700">TE...</code>, <code className="font-mono text-brand-700">TI...</code>), assets (<code className="font-mono text-brand-700">A...</code>), investment orders (<code className="font-mono text-brand-700">PB...</code>, <code className="font-mono text-brand-700">PS...</code>), and groups (<code className="font-mono text-brand-700">G...</code>) ensure that re-importing merges records cleanly with <strong>no duplicates</strong>.
                </p>
              </div>

              {/* Informational Banner */}
              <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4 text-xs text-blue-900 flex items-start gap-3">
                <span className="text-xl shrink-0">🛡️</span>
                <div className="space-y-1">
                  <p className="font-semibold text-blue-950">Intelligent Upsert & Metadata Verification</p>
                  <p className="text-blue-800 leading-relaxed text-[11px]">
                    Every export package includes ISO timestamps and collision-checked tracking IDs. If you import an export file into this or another authorized environment, matching entities are refreshed and non-existent entities are created—guaranteeing <strong>zero duplicate records</strong>.
                  </p>
                </div>
              </div>

              {/* Export & Import Grid */}
              <div className="grid gap-6 lg:grid-cols-2">
                
                {/* 1. Export Card */}
                <article className="cash-card p-6 bg-white border border-ink-150 space-y-4 flex flex-col justify-between">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2.5">
                      <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-brand-100 text-brand-800 text-lg font-bold border border-brand-200 shrink-0">
                        📤
                      </div>
                      <div>
                        <h4 className="font-bold text-ink-900 text-base">Export Account Data</h4>
                        <p className="text-xs text-ink-500">Download complete account snapshot</p>
                      </div>
                    </div>

                    <p className="text-xs text-ink-600 leading-relaxed">
                      Generates a comprehensive, human-readable JSON backup file containing:
                    </p>
                    <ul className="text-xs text-ink-500 space-y-1.5 list-disc list-inside">
                      <li><strong>All Transactions</strong>: Expenses (E...), Income (I...), Outgoing transfers (TE...), Incoming transfers (TI...)</li>
                      <li><strong>Investment Assets</strong>: Stocks, mutual funds, crypto, real estate holdings (A...)</li>
                      <li><strong>Investment Orders</strong>: Buy (PB...) and Sell (PS...) orders</li>
                      <li><strong>Shared Groups & Members</strong>: Groups (G...), members, and invitations</li>
                      <li><strong>Metadata</strong>: Timestamp, unique Export ID, user credentials, and category definitions</li>
                    </ul>

                    {exportSuccessMsg && (
                      <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50 text-xs text-emerald-800 space-y-1 animate-in fade-in duration-150">
                        <p className="font-semibold flex items-center gap-1.5 text-emerald-900">
                          <span>✅</span> Backup Exported Successfully
                        </p>
                        <p className="text-[11px] leading-relaxed text-emerald-700">{exportSuccessMsg}</p>
                      </div>
                    )}

                    {exportError && (
                      <div className="p-3 rounded-xl border border-red-200 bg-red-50 text-xs text-red-700">
                        {exportError}
                      </div>
                    )}
                  </div>

                  <div className="pt-4 border-t border-ink-100">
                    <button
                      type="button"
                      onClick={handleExportData}
                      disabled={exporting}
                      className="cash-button-primary w-full py-2.5 px-4 text-xs font-semibold flex items-center justify-center gap-2 shadow-xs disabled:opacity-50"
                    >
                      {exporting ? (
                        <span>⏳ Generating Account Backup...</span>
                      ) : (
                        <span>⬇️ Download Account Data (.json)</span>
                      )}
                    </button>
                    <p className="text-center text-[10px] text-ink-400 mt-2">
                      Includes timestamp & unique export ID metadata for reliable restore
                    </p>
                  </div>
                </article>

                {/* 2. Import Card */}
                <article className="cash-card p-6 bg-white border border-ink-150 space-y-4 flex flex-col justify-between">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2.5">
                      <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-emerald-100 text-emerald-800 text-lg font-bold border border-emerald-200 shrink-0">
                        📥
                      </div>
                      <div>
                        <h4 className="font-bold text-ink-900 text-base">Import Account Data</h4>
                        <p className="text-xs text-ink-500">Restore or merge backup JSON file</p>
                      </div>
                    </div>

                    <p className="text-xs text-ink-600 leading-relaxed">
                      Select a downloaded CashFlow backup JSON file. Duplicate prevention is enforced automatically via unique tracking IDs.
                    </p>

                    {/* File Picker */}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-ink-700">
                        Select JSON Backup File
                      </label>
                      <input
                        type="file"
                        accept=".json,application/json"
                        onChange={handleFileSelect}
                        disabled={importing}
                        className="block w-full text-xs text-ink-600 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100 cursor-pointer border border-ink-200 rounded-xl p-1 bg-ink-50/30"
                      />
                    </div>

                    {/* Selected File Preview Box */}
                    {importJsonData && (
                      <div className="p-3.5 rounded-xl border border-brand-200 bg-brand-50/40 text-xs text-ink-800 space-y-2.5 animate-in fade-in duration-150">
                        <div className="flex justify-between items-center border-b border-brand-200/60 pb-2">
                          <span className="font-semibold text-brand-900 text-xs">File Ready to Import</span>
                          <span className="font-mono text-[10px] bg-brand-100 text-brand-800 px-2 py-0.5 rounded font-bold">
                            {importJsonData.exportId || 'Backup File'}
                          </span>
                        </div>
                        <div className="text-[11px] text-ink-600 space-y-0.5">
                          <p>
                            <strong>Exported Date:</strong>{' '}
                            {importJsonData.exportedAt ? new Date(importJsonData.exportedAt).toLocaleString() : 'N/A'}
                          </p>
                          {importJsonData.user && (
                            <p>
                              <strong>Source Account:</strong> {importJsonData.user.name} ({importJsonData.user.email})
                            </p>
                          )}
                        </div>
                        {/* Summary Badges */}
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          <span className="text-[10px] bg-white border border-brand-200 px-2 py-0.5 rounded-md font-semibold text-ink-800">
                            📝 {importJsonData.data?.transactions?.length ?? importJsonData.summary?.totalTransactions ?? 0} Transactions
                          </span>
                          <span className="text-[10px] bg-white border border-brand-200 px-2 py-0.5 rounded-md font-semibold text-ink-800">
                            📈 {importJsonData.data?.investments?.length ?? importJsonData.summary?.totalInvestments ?? 0} Investments
                          </span>
                          <span className="text-[10px] bg-white border border-brand-200 px-2 py-0.5 rounded-md font-semibold text-ink-800">
                            👥 {importJsonData.data?.groups?.length ?? importJsonData.summary?.totalGroups ?? 0} Groups
                          </span>
                          <span className="text-[10px] bg-white border border-brand-200 px-2 py-0.5 rounded-md font-semibold text-ink-800">
                            🏷️ {importJsonData.data?.tags?.length ?? importJsonData.summary?.totalTags ?? 0} Tags
                          </span>
                        </div>
                      </div>
                    )}

                    {importError && (
                      <div className="p-3 rounded-xl border border-red-200 bg-red-50 text-xs text-red-700">
                        {importError}
                      </div>
                    )}

                    {/* Import Results Box */}
                    {importResult && (
                      <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50 text-xs text-emerald-900 space-y-2 animate-in fade-in duration-150">
                        <p className="font-bold flex items-center gap-1.5 text-emerald-800">
                          <span>🎉</span> Import Complete (No Duplicates)
                        </p>
                        <p className="text-[11px] text-emerald-700">{importResult.message}</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1 text-[11px]">
                          <div className="bg-white/80 p-2 rounded-lg border border-emerald-200/60">
                            <span className="text-ink-500 block text-[10px]">Transactions</span>
                            <span className="font-bold text-ink-900">+{importResult.stats.transactions.created} new</span>{' '}
                            <span className="text-ink-500 text-[10px]">({importResult.stats.transactions.updated} merged)</span>
                          </div>
                          <div className="bg-white/80 p-2 rounded-lg border border-emerald-200/60">
                            <span className="text-ink-500 block text-[10px]">Investments</span>
                            <span className="font-bold text-ink-900">+{importResult.stats.investments.created} new</span>{' '}
                            <span className="text-ink-500 text-[10px]">({importResult.stats.investments.updated} merged)</span>
                          </div>
                          <div className="bg-white/80 p-2 rounded-lg border border-emerald-200/60">
                            <span className="text-ink-500 block text-[10px]">Groups</span>
                            <span className="font-bold text-ink-900">+{importResult.stats.groups.created} new</span>{' '}
                            <span className="text-ink-500 text-[10px]">({importResult.stats.groups.updated} merged)</span>
                          </div>
                        </div>

                        {/* Discovered External Groups (from different user account) */}
                        {importResult.externalGroups && importResult.externalGroups.length > 0 && (
                          <div className="pt-2 border-t border-emerald-200/80 space-y-2">
                            <div className="flex items-center gap-1.5 text-ink-800 font-semibold text-xs">
                              <span>👥 Discovered Groups from Backup (Different User Account)</span>
                              <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded-full font-bold">
                                Not a member yet
                              </span>
                            </div>
                            <p className="text-[11px] text-ink-600 leading-relaxed">
                              Since you are a different user, you were not automatically added as a member. You can send a request to join any of these groups:
                            </p>
                            <div className="space-y-2">
                              {importResult.externalGroups.map((grp) => {
                                const hasRequested = requestedGroupIds[grp.id];
                                return (
                                  <div key={grp.id} className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-emerald-200 text-xs">
                                    <div>
                                      <p className="font-bold text-ink-900 flex items-center gap-1.5">
                                        <span>{grp.name}</span>
                                        <span className="font-mono text-[10px] bg-amber-50 border border-amber-200 text-amber-800 px-1.5 py-0.2 rounded font-bold">
                                          {grp.id}
                                        </span>
                                      </p>
                                      <p className="text-[10px] text-ink-500 mt-0.5">
                                        Owner: {grp.ownerName || grp.ownerId} • {grp.memberCount} member(s)
                                      </p>
                                    </div>
                                    <button
                                      type="button"
                                      disabled={hasRequested}
                                      onClick={() => handleRequestJoin(grp.id)}
                                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                                        hasRequested
                                          ? 'bg-ink-100 text-ink-500 cursor-default'
                                          : 'bg-brand-900 text-white hover:bg-brand-800 shadow-2xs'
                                      }`}
                                    >
                                      {hasRequested ? '✅ Request Sent' : '🙋 Request to Join'}
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="pt-4 border-t border-ink-100 flex gap-2">
                    <button
                      type="button"
                      onClick={handleExecuteImport}
                      disabled={!importJsonData || importing}
                      className="cash-button-primary flex-1 py-2.5 px-4 text-xs font-semibold flex items-center justify-center gap-2 shadow-xs disabled:opacity-50"
                    >
                      {importing ? (
                        <span>⏳ Importing & Merging Data...</span>
                      ) : (
                        <span>🚀 Import & Merge Data</span>
                      )}
                    </button>
                    {importJsonData && (
                      <button
                        type="button"
                        onClick={() => {
                          setImportFile(null);
                          setImportJsonData(null);
                          setImportError('');
                        }}
                        disabled={importing}
                        className="px-3 py-2 text-xs border border-ink-200 rounded-xl hover:bg-ink-100 transition text-ink-600 font-semibold"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </article>

              </div>
            </section>
          )}

          {/* Security Tab */}
          {activeTab === 'security' && (
            <section className="space-y-6 animate-in fade-in duration-150">
              {/* 2FA Main Hero Card */}
              <article className="cash-card p-6 sm:p-8 bg-white border border-ink-150 shadow-card">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 pb-6 border-b border-ink-100">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="p-2 rounded-xl bg-brand-50 text-brand-700 border border-brand-200 shadow-xxs">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      </span>
                      <h2 className="text-xl font-bold text-ink-900">Two-Factor Authentication (2FA)</h2>
                      {twoFactorStatus?.enabled ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          Active & Enforced
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-ink-100 text-ink-600 border border-ink-200">
                          Not Enabled
                        </span>
                      )}
                    </div>
                    <p className="text-xs sm:text-sm text-ink-600 max-w-2xl leading-relaxed">
                      Protect your financial account with military-grade two-factor authentication. When enabled, logging in requires both your password and a live 6-digit TOTP verification code from your mobile authenticator app.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {twoFactorStatus?.enabled ? (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setRegenPassword('');
                            setRegenError('');
                            setRegeneratedCodes([]);
                            setCopiedRegenCodes(false);
                            setIsRegenerateModalOpen(true);
                          }}
                          className="cash-button-secondary py-2 px-3.5 text-xs font-semibold flex items-center gap-1.5 shadow-xxs"
                        >
                          <svg className="w-4 h-4 text-ink-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          <span>Backup Codes</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDisablePassword('');
                            setDisableCode('');
                            setDisableError('');
                            setIs2faDisableModalOpen(true);
                          }}
                          className="px-3.5 py-2 text-xs font-semibold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl transition shadow-xxs"
                        >
                          Disable 2FA
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={handleStart2faSetup}
                        className="cash-button-primary py-2.5 px-4 text-xs font-semibold flex items-center gap-2 shadow-xs"
                      >
                        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        <span>Enable Mobile Authenticator (2FA)</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* 2FA Specs Details */}
                <div className="mt-6 pt-2 grid gap-4 sm:grid-cols-3">
                  <div className="p-4 rounded-2xl bg-ink-50/70 border border-ink-150">
                    <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Security Standard</p>
                    <p className="mt-1 text-sm font-bold text-ink-900">RFC 6238 TOTP Protocol</p>
                    <p className="mt-0.5 text-xs text-ink-500">Time-based one-time passwords refreshed every 30 seconds</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-ink-50/70 border border-ink-150">
                    <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Supported Apps</p>
                    <p className="mt-1 text-sm font-bold text-ink-900">Google, Microsoft, Authy</p>
                    <p className="mt-0.5 text-xs text-ink-500">Compatible with Apple Passwords, 1Password & Bitwarden</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-ink-50/70 border border-ink-150">
                    <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Emergency Recovery</p>
                    <p className="mt-1 text-sm font-bold text-ink-900">
                      {twoFactorStatus?.enabled
                        ? `${twoFactorStatus.remainingRecoveryCodes ?? 8} Codes Remaining`
                        : '8 Single-Use Codes'}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-500">SHA-256 hashed fallback tokens with auto-burn on use</p>
                  </div>
                </div>
              </article>

              {/* Update Password Card */}
              <article className="cash-card p-6 sm:p-8 bg-white border border-ink-150 shadow-card">
                <div className="space-y-1 mb-5">
                  <div className="flex items-center gap-2">
                    <span className="p-2 rounded-xl bg-ink-100 text-ink-700 border border-ink-200">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                      </svg>
                    </span>
                    <h2 className="text-lg font-bold text-ink-900">Update Password</h2>
                  </div>
                  <p className="text-xs text-ink-500">Change your login credentials to maintain maximum account security.</p>
                </div>

                <form onSubmit={handleChangePasswordSubmit} className="space-y-4 max-w-xl">
                  <div>
                    <label className="cash-label" htmlFor="currentPassword">Current Password</label>
                    <input
                      id="currentPassword"
                      type="password"
                      className="cash-input"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Enter your current password"
                      required
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="cash-label" htmlFor="newPassword">New Password</label>
                      <input
                        id="newPassword"
                        type="password"
                        className="cash-input"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="At least 8 characters"
                        minLength={8}
                        required
                      />
                    </div>
                    <div>
                      <label className="cash-label" htmlFor="confirmPassword">Confirm New Password</label>
                      <input
                        id="confirmPassword"
                        type="password"
                        className="cash-input"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Repeat new password"
                        minLength={8}
                        required
                      />
                    </div>
                  </div>

                  {passwordError && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium">
                      {passwordError}
                    </div>
                  )}

                  {passwordSuccess && (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-medium">
                      ✅ {passwordSuccess}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={passwordSubmitting}
                    className="cash-button-primary py-2.5 px-4 text-xs font-semibold disabled:opacity-50"
                  >
                    {passwordSubmitting ? 'Updating Password...' : 'Update Password'}
                  </button>
                </form>
              </article>

              {/* Maximum Security Architecture Specs */}
              <article className="cash-card p-6 sm:p-8 bg-white border border-ink-150 shadow-card">
                <div className="space-y-1 mb-5">
                  <h2 className="text-lg font-bold text-ink-900">Security Architecture & Automated Defenses</h2>
                  <p className="text-xs text-ink-500">Comprehensive overview of automated protections currently enforcing your account's safety.</p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="p-4 border border-ink-150 rounded-2xl bg-ink-50/40 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-brand-700 font-semibold text-xs">
                      <span className="w-2 h-2 rounded-full bg-brand-500" />
                      Brute-Force Lockout
                    </div>
                    <p className="text-sm font-bold text-ink-900">5 Attempts / 15-Min Lock</p>
                    <p className="text-xs text-ink-500 leading-relaxed">
                      Accounts automatically lock for 15 minutes after 5 consecutive failed login or 2FA attempts to stop credential stuffing.
                    </p>
                  </div>

                  <div className="p-4 border border-ink-150 rounded-2xl bg-ink-50/40 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-brand-700 font-semibold text-xs">
                      <span className="w-2 h-2 rounded-full bg-brand-500" />
                      Cryptographic Hashing
                    </div>
                    <p className="text-sm font-bold text-ink-900">Bcrypt + HMAC-SHA1</p>
                    <p className="text-xs text-ink-500 leading-relaxed">
                      Salted passwords with 10 rounds of Bcrypt. Real-time constant-time comparison prevents timing attacks on authentication.
                    </p>
                  </div>

                  <div className="p-4 border border-ink-150 rounded-2xl bg-ink-50/40 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-brand-700 font-semibold text-xs">
                      <span className="w-2 h-2 rounded-full bg-brand-500" />
                      Session Hardening
                    </div>
                    <p className="text-sm font-bold text-ink-900">HTTP-Only SameSite Cookie</p>
                    <p className="text-xs text-ink-500 leading-relaxed">
                      Tokens isolated from client-side JavaScript to eliminate XSS session theft risks, expiring automatically after 7 days.
                    </p>
                  </div>

                  <div className="p-4 border border-ink-150 rounded-2xl bg-ink-50/40 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-brand-700 font-semibold text-xs">
                      <span className="w-2 h-2 rounded-full bg-brand-500" />
                      One-Way Recovery Codes
                    </div>
                    <p className="text-sm font-bold text-ink-900">SHA-256 Single-Use Burn</p>
                    <p className="text-xs text-ink-500 leading-relaxed">
                      Emergency codes are never stored in plaintext. Consumed tokens are permanently invalidated upon first use.
                    </p>
                  </div>
                </div>
              </article>

              {/* Session Storage Clearing */}
              <article className="p-4 border border-red-100 rounded-2xl bg-red-50/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-red-900">Session Storage & Multi-Account Reset</p>
                  <p className="text-xs text-red-700 mt-0.5">
                    Instantly purge all saved browser account sessions and cached tokens on this workstation.
                  </p>
                </div>
                <button
                  onClick={() => {
                    if (confirm('Clear all saved account sessions? You will be signed out.')) {
                      localStorage.clear();
                      window.location.href = '/login';
                    }
                  }}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold text-xs rounded-xl transition shrink-0"
                >
                  Clear Storage Sessions
                </button>
              </article>
            </section>
          )}
        </div>

        {/* 2FA SETUP MODAL */}
        {is2faSetupModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/50 backdrop-blur-xs p-4 overflow-y-auto">
            <div className="w-full max-w-lg bg-white rounded-3xl shadow-xl border border-ink-150 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150">
              {/* Modal Header */}
              <div className="p-6 bg-gradient-to-r from-brand-50 to-emerald-50/60 border-b border-ink-150 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="p-2 rounded-xl bg-brand-100 text-brand-800 border border-brand-200 shadow-xxs">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </span>
                  <div>
                    <h3 className="text-lg font-bold text-ink-900">
                      {newRecoveryCodes.length > 0 ? '2FA Enabled Successfully!' : 'Set Up Mobile Authenticator'}
                    </h3>
                    <p className="text-xs text-ink-500">
                      {newRecoveryCodes.length > 0 ? 'Save your emergency recovery codes below' : 'Scan the QR code with your mobile app'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setIs2faSetupModalOpen(false);
                    setNewRecoveryCodes([]);
                    setSetupCode('');
                  }}
                  className="p-1.5 rounded-lg text-ink-400 hover:text-ink-700 hover:bg-ink-100 transition"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="p-6 space-y-5">
                {newRecoveryCodes.length > 0 ? (
                  /* SUCCESS STATE: SHOW RECOVERY CODES */
                  <div className="space-y-4">
                    <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 space-y-1">
                      <p className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                        <span>⚠️</span> Save These Recovery Codes Now
                      </p>
                      <p className="text-xs text-amber-800 leading-relaxed">
                        If you lose access to your phone or authenticator app, these emergency backup codes are the <strong>only way</strong> to regain access to your account. Each code can only be used once.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 p-4 bg-ink-50 rounded-2xl border border-ink-150 font-mono text-center text-xs font-bold text-ink-800 tracking-wider">
                      {newRecoveryCodes.map((code, idx) => (
                        <div key={idx} className="p-2 bg-white rounded-lg border border-ink-100 shadow-xxs">
                          {code}
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-wrap gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(newRecoveryCodes.join('\n'));
                          setCopiedCodes(true);
                          setTimeout(() => setCopiedCodes(false), 2500);
                        }}
                        className="cash-button-secondary flex-1 py-2 text-xs font-semibold flex items-center justify-center gap-1.5 shadow-xxs"
                      >
                        {copiedCodes ? '✅ Copied to Clipboard!' : '📋 Copy All Codes'}
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadRecoveryCodes(newRecoveryCodes)}
                        className="cash-button-secondary flex-1 py-2 text-xs font-semibold flex items-center justify-center gap-1.5 shadow-xxs"
                      >
                        📥 Download .txt
                      </button>
                    </div>

                    <div className="pt-4 border-t border-ink-100">
                      <button
                        type="button"
                        onClick={() => {
                          setIs2faSetupModalOpen(false);
                          setNewRecoveryCodes([]);
                          setSetupCode('');
                        }}
                        className="cash-button-primary w-full py-2.5 text-xs font-semibold"
                      >
                        I Have Safely Saved My Codes
                      </button>
                    </div>
                  </div>
                ) : (
                  /* SETUP STATE: QR CODE & 6-DIGIT VERIFICATION */
                  <div className="space-y-5">
                    {setupSubmitting && !setupData ? (
                      <div className="py-12 text-center text-ink-500 space-y-2">
                        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-brand-600 border-r-transparent" />
                        <p className="text-xs font-medium">Generating secure 2FA keys & QR code...</p>
                      </div>
                    ) : setupData ? (
                      <>
                        <div className="space-y-3">
                          <p className="text-xs font-bold uppercase tracking-wider text-ink-500">
                            Step 1: Scan with Authenticator App
                          </p>
                          <div className="flex flex-col sm:flex-row items-center gap-4 p-4 bg-ink-50 rounded-2xl border border-ink-150">
                            <div className="bg-white p-2.5 rounded-xl border border-ink-200 shadow-xs shrink-0">
                              <img
                                src={setupData.qrCode || setupData.qrCodeDataUrl}
                                alt="2FA QR Code"
                                className="w-36 h-36 rounded"
                              />
                            </div>
                            <div className="space-y-2 text-left">
                              <p className="text-xs text-ink-600 leading-relaxed">
                                Open <strong>Google Authenticator</strong>, <strong>Microsoft Authenticator</strong>, or <strong>Authy</strong> on your mobile phone and scan this QR code.
                              </p>
                              <div className="space-y-1">
                                <p className="text-[11px] font-semibold text-ink-500">Can't scan? Enter key manually:</p>
                                <div className="flex items-center gap-1.5">
                                  <code className="text-[11px] font-mono bg-white px-2 py-1 rounded border border-ink-200 text-ink-800 break-all select-all font-semibold">
                                    {setupData.secret}
                                  </code>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      navigator.clipboard.writeText(setupData.secret);
                                      setCopiedKey(true);
                                      setTimeout(() => setCopiedKey(false), 2000);
                                    }}
                                    className="px-2 py-1 text-[11px] font-semibold bg-white border border-ink-200 hover:bg-ink-100 rounded transition shrink-0"
                                  >
                                    {copiedKey ? '✅' : 'Copy'}
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        <form onSubmit={handleConfirm2faEnable} className="space-y-4">
                          <div>
                            <label className="cash-label" htmlFor="setupCode">
                              Step 2: Enter 6-Digit Code from App
                            </label>
                            <input
                              id="setupCode"
                              type="text"
                              className="cash-input text-center text-2xl tracking-widest font-mono font-bold"
                              value={setupCode}
                              onChange={(e) => setSetupCode(e.target.value)}
                              placeholder="000000"
                              maxLength={6}
                              autoFocus
                              required
                            />
                          </div>

                          {setupError && (
                            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium">
                              {setupError}
                            </div>
                          )}

                          <div className="flex gap-2 pt-2">
                            <button
                              type="submit"
                              disabled={setupSubmitting || setupCode.length < 6}
                              className="cash-button-primary flex-1 py-2.5 text-xs font-semibold disabled:opacity-50"
                            >
                              {setupSubmitting ? 'Verifying...' : 'Verify & Enable 2FA'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setIs2faSetupModalOpen(false)}
                              className="px-4 py-2.5 text-xs font-semibold border border-ink-200 hover:bg-ink-100 rounded-xl text-ink-600 transition"
                            >
                              Cancel
                            </button>
                          </div>
                        </form>
                      </>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 2FA DISABLE MODAL */}
        {is2faDisableModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/50 backdrop-blur-xs p-4">
            <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-ink-150 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              <div className="p-6 bg-red-50 border-b border-red-150 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="p-2 rounded-xl bg-red-100 text-red-700 border border-red-200">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </span>
                  <div>
                    <h3 className="text-base font-bold text-red-950">Disable Two-Factor Authentication</h3>
                    <p className="text-xs text-red-700">Security protection will be reduced</p>
                  </div>
                </div>
                <button
                  onClick={() => setIs2faDisableModalOpen(false)}
                  className="p-1.5 rounded-lg text-ink-400 hover:text-ink-700 hover:bg-ink-100 transition"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <form onSubmit={handleExecute2faDisable} className="p-6 space-y-4">
                <p className="text-xs text-ink-600 leading-relaxed">
                  Disabling 2FA makes your account accessible with only your email and password. To confirm this change, enter your current password below.
                </p>

                <div>
                  <label className="cash-label" htmlFor="disablePassword">Account Password</label>
                  <input
                    id="disablePassword"
                    type="password"
                    className="cash-input"
                    value={disablePassword}
                    onChange={(e) => setDisablePassword(e.target.value)}
                    placeholder="Enter current password"
                    autoFocus
                    required
                  />
                </div>

                <div>
                  <label className="cash-label" htmlFor="disableCode">Authenticator Code (Optional)</label>
                  <input
                    id="disableCode"
                    type="text"
                    className="cash-input text-center font-mono tracking-widest text-lg"
                    value={disableCode}
                    onChange={(e) => setDisableCode(e.target.value)}
                    placeholder="000000"
                    maxLength={6}
                  />
                </div>

                {disableError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium">
                    {disableError}
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    type="submit"
                    disabled={disableSubmitting || !disablePassword}
                    className="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold flex-1 transition disabled:opacity-50"
                  >
                    {disableSubmitting ? 'Disabling 2FA...' : 'Confirm & Disable 2FA'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIs2faDisableModalOpen(false)}
                    className="px-4 py-2.5 text-xs font-semibold border border-ink-200 hover:bg-ink-100 rounded-xl text-ink-600 transition"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* REGENERATE BACKUP CODES MODAL */}
        {isRegenerateModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/50 backdrop-blur-xs p-4">
            <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-ink-150 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              <div className="p-6 bg-ink-50 border-b border-ink-150 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="p-2 rounded-xl bg-ink-200 text-ink-800 border border-ink-300">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </span>
                  <div>
                    <h3 className="text-base font-bold text-ink-900">Emergency Backup Codes</h3>
                    <p className="text-xs text-ink-500">Regenerate 8 fresh recovery tokens</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setIsRegenerateModalOpen(false);
                    setRegeneratedCodes([]);
                  }}
                  className="p-1.5 rounded-lg text-ink-400 hover:text-ink-700 hover:bg-ink-100 transition"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="p-6 space-y-4">
                {regeneratedCodes.length > 0 ? (
                  <div className="space-y-4">
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-medium">
                      ✅ 8 New Backup Codes Generated! Any previous backup codes are now permanently invalid.
                    </div>

                    <div className="grid grid-cols-2 gap-2 p-4 bg-ink-50 rounded-2xl border border-ink-150 font-mono text-center text-xs font-bold text-ink-800 tracking-wider">
                      {regeneratedCodes.map((code, idx) => (
                        <div key={idx} className="p-2 bg-white rounded-lg border border-ink-100 shadow-xxs">
                          {code}
                        </div>
                      ))}
                    </div>

                    <div className="flex gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(regeneratedCodes.join('\n'));
                          setCopiedRegenCodes(true);
                          setTimeout(() => setCopiedRegenCodes(false), 2500);
                        }}
                        className="cash-button-secondary flex-1 py-2 text-xs font-semibold flex items-center justify-center gap-1.5 shadow-xxs"
                      >
                        {copiedRegenCodes ? '✅ Copied!' : '📋 Copy Codes'}
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadRecoveryCodes(regeneratedCodes)}
                        className="cash-button-secondary flex-1 py-2 text-xs font-semibold flex items-center justify-center gap-1.5 shadow-xxs"
                      >
                        📥 Download .txt
                      </button>
                    </div>

                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setIsRegenerateModalOpen(false);
                          setRegeneratedCodes([]);
                        }}
                        className="cash-button-primary w-full py-2.5 text-xs font-semibold"
                      >
                        Done
                      </button>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleExecuteRegenerateCodes} className="space-y-4">
                    <p className="text-xs text-ink-600 leading-relaxed">
                      Generating new backup codes will immediately invalidate any previous backup codes. Enter your password to confirm.
                    </p>

                    <div>
                      <label className="cash-label" htmlFor="regenPassword">Account Password</label>
                      <input
                        id="regenPassword"
                        type="password"
                        className="cash-input"
                        value={regenPassword}
                        onChange={(e) => setRegenPassword(e.target.value)}
                        placeholder="Enter current password"
                        autoFocus
                        required
                      />
                    </div>

                    {regenError && (
                      <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium">
                        {regenError}
                      </div>
                    )}

                    <div className="flex gap-2 pt-2">
                      <button
                        type="submit"
                        disabled={regenSubmitting || !regenPassword}
                        className="cash-button-primary flex-1 py-2.5 text-xs font-semibold disabled:opacity-50"
                      >
                        {regenSubmitting ? 'Generating...' : 'Generate New Codes'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsRegenerateModalOpen(false)}
                        className="px-4 py-2.5 text-xs font-semibold border border-ink-200 hover:bg-ink-100 rounded-xl text-ink-600 transition"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
