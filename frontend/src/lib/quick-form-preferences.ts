export type QuickFormPreferences = {
  amount: true; // Mandatory
  description: true; // Mandatory
  specialExpenseType: boolean;
  quickCategories: boolean;
  categoryDropdown: boolean;
  categoryType: boolean;
  tags: boolean;
  date: boolean;
  paymentMethod: boolean;
  paymentAccount: boolean;
};

export const DEFAULT_QUICK_FORM_PREFERENCES: QuickFormPreferences = {
  amount: true,
  description: true,
  specialExpenseType: true,
  quickCategories: true,
  categoryDropdown: false,
  categoryType: false,
  tags: false,
  date: false,
  paymentMethod: false,
  paymentAccount: false
};

export type QuickFormFieldConfig = {
  key: keyof QuickFormPreferences;
  label: string;
  icon: string;
  description: string;
  isMandatory?: boolean;
};

export const QUICK_FORM_FIELDS: QuickFormFieldConfig[] = [
  {
    key: 'amount',
    label: 'Amount',
    icon: '₹',
    description: 'Transaction numeric value or cost',
    isMandatory: true
  },
  {
    key: 'description',
    label: 'Description',
    icon: '📝',
    description: 'Note, purpose, or merchant details',
    isMandatory: true
  },
  {
    key: 'specialExpenseType',
    label: 'Transfer & Lending (Expense Type)',
    icon: '🔄',
    description: 'Direct radio options for Transfer (to other users) and Lending (recoverable loans / expenses)'
  },
  {
    key: 'quickCategories',
    label: 'Quick Category Chips',
    icon: '⚡',
    description: 'Instant 1-tap category buttons (Grocery, Food, Fuel, etc.)'
  },
  {
    key: 'categoryDropdown',
    label: 'Category Dropdown & Custom',
    icon: '📁',
    description: 'Full list dropdown with custom category creation input'
  },
  {
    key: 'categoryType',
    label: 'Category Type',
    icon: '📌',
    description: 'Essentials, Lifestyle, or High-Value spending classification'
  },
  {
    key: 'date',
    label: 'Date & Time',
    icon: '📅',
    description: 'Manual date picker (when hidden, automatically records current date & time)'
  },
  {
    key: 'paymentMethod',
    label: 'Payment Method',
    icon: '💳',
    description: 'Selector for Card, Cash, Bank Transfer, or Wallet (defaults to Card when hidden)'
  },
  {
    key: 'paymentAccount',
    label: 'Payment Account',
    icon: '🏦',
    description: 'Selector for Bank Account, Card, or Wallet (e.g. HDFC Bank, SBI, Salary Account, Cash in Hand)'
  },
  {
    key: 'tags',
    label: 'Tags',
    icon: '🏷️',
    description: 'Comma-separated tags with auto-suggest dropdown'
  }
];

export const QUICK_PREFS_STORAGE_KEY = 'cashflow_quick_form_preferences';
export const QUICK_PREFS_EVENT_NAME = 'cashflow-quick-prefs-changed';

export function getQuickFormPreferences(): QuickFormPreferences {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_QUICK_FORM_PREFERENCES };
  }
  try {
    const raw = localStorage.getItem(QUICK_PREFS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_QUICK_FORM_PREFERENCES };
    const parsed = JSON.parse(raw);
    return {
      amount: true,
      description: true,
      specialExpenseType: parsed.specialExpenseType ?? DEFAULT_QUICK_FORM_PREFERENCES.specialExpenseType,
      quickCategories: parsed.quickCategories ?? DEFAULT_QUICK_FORM_PREFERENCES.quickCategories,
      categoryDropdown: parsed.categoryDropdown ?? DEFAULT_QUICK_FORM_PREFERENCES.categoryDropdown,
      categoryType: parsed.categoryType ?? DEFAULT_QUICK_FORM_PREFERENCES.categoryType,
      tags: parsed.tags ?? DEFAULT_QUICK_FORM_PREFERENCES.tags,
      date: parsed.date ?? DEFAULT_QUICK_FORM_PREFERENCES.date,
      paymentMethod: parsed.paymentMethod ?? DEFAULT_QUICK_FORM_PREFERENCES.paymentMethod,
      paymentAccount: parsed.paymentAccount ?? DEFAULT_QUICK_FORM_PREFERENCES.paymentAccount
    };
  } catch (err) {
    console.error('Failed to parse quick form preferences', err);
    return { ...DEFAULT_QUICK_FORM_PREFERENCES };
  }
}

export function saveQuickFormPreferences(newPrefs: Partial<QuickFormPreferences>) {
  if (typeof window === 'undefined') return;
  try {
    const current = getQuickFormPreferences();
    const updated: QuickFormPreferences = {
      ...current,
      ...newPrefs,
      amount: true,
      description: true
    };
    localStorage.setItem(QUICK_PREFS_STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new Event(QUICK_PREFS_EVENT_NAME));
  } catch (err) {
    console.error('Failed to save quick form preferences', err);
  }
}
