import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  getQuickFormPreferences,
  QuickFormPreferences,
  QUICK_PREFS_EVENT_NAME
} from '../../../lib/quick-form-preferences';

function TagInputField({
  value,
  onChange,
  allTags,
  id = 'tags'
}: {
  value: string;
  onChange: (val: string) => void;
  allTags: string[];
  id?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  // Extract the current token being typed after the last comma
  const tokens = value.split(',');
  const currentToken = (tokens[tokens.length - 1] || '').trim().toLowerCase();
  const existingTags = tokens.slice(0, -1).map((t) => t.trim().toLowerCase());

  // Filter matching suggestions from allTags
  const suggestions = useMemo(() => {
    if (!currentToken) return [];
    return allTags.filter(
      (tag) =>
        tag.toLowerCase().includes(currentToken) &&
        !existingTags.includes(tag.toLowerCase()) &&
        tag.toLowerCase() !== currentToken
    );
  }, [currentToken, allTags, existingTags]);

  const selectSuggestion = (suggestedTag: string) => {
    const parts = value.split(',').map((p) => p.trim());
    parts.pop(); // Remove the partial token
    parts.push(suggestedTag);
    const newVal = parts.filter(Boolean).join(', ') + ', ';
    onChange(newVal);
    setIsOpen(false);
    setHighlightedIndex(0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (suggestions[highlightedIndex]) {
        e.preventDefault();
        selectSuggestion(suggestions[highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div className="relative">
      <label className="cash-label" htmlFor={id}>
        Tags (comma-separated)
      </label>
      <input
        id={id}
        className="cash-input text-xs"
        type="text"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setIsOpen(true);
          setHighlightedIndex(0);
        }}
        onFocus={() => {
          if (currentToken && suggestions.length > 0) {
            setIsOpen(true);
          }
        }}
        onBlur={() => {
          // Small delay so click on dropdown item registers
          setTimeout(() => setIsOpen(false), 200);
        }}
        onKeyDown={handleKeyDown}
        placeholder="Type to search tags e.g. travel, work, food"
        autoComplete="off"
      />

      {/* Auto-suggest Dropdown */}
      {isOpen && suggestions.length > 0 && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-ink-200 rounded-xl shadow-lg overflow-hidden py-1 max-h-48 overflow-y-auto animate-in fade-in duration-150 text-left">
          <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-ink-400 bg-ink-50 border-b border-ink-100">
            Suggested Tags
          </div>
          {suggestions.map((suggestion, idx) => (
            <button
              key={suggestion}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                selectSuggestion(suggestion);
              }}
              className={`w-full px-3 py-1.5 text-left text-xs font-medium flex items-center justify-between transition-colors ${
                idx === highlightedIndex
                  ? 'bg-brand-50 text-brand-800'
                  : 'text-ink-700 hover:bg-ink-50'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-brand-600 font-bold">#</span>
                <span>{suggestion}</span>
              </div>
              <span className="text-[10px] text-ink-400">Select</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export type TransactionFormProps = {
  form: {
    amount: string;
    category: string;
    description: string;
    paymentMethod: string;
    date: string;
    transactionType: string;
    toUserId: string;
    tags: string;
    categoryType: string;
    isReceivable?: boolean;
    receivableStatus?: 'OUTSTANDING' | 'PARTIALLY_SETTLED' | 'SETTLED' | string;
    reimbursedAmount?: number | string;
    paymentAccount?: string;
  };
  setForm: (form: any) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  saving: boolean;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  allCategories: string[];
  allTags: string[];
  eligibleRecipients: { id: string; name: string; email: string }[];
  showCustomInput: boolean;
  setShowCustomInput: (val: boolean) => void;
  onCancel: () => void;
  quickAmountRef?: React.RefObject<HTMLInputElement | null>;
  isQuickForm?: boolean;
  pathname?: string;
  isPwaActive?: boolean;
};

const paymentMethods = ['Card', 'Cash', 'Bank transfer', 'Wallet', 'UPI'];
const commonPaymentAccounts = [
  'Main Bank Account',
  'Savings Account',
  'Salary Account',
  'Credit Card',
  'Cash in Hand',
  'Digital Wallet / UPI'
];

export function TransactionForm({
  form,
  setForm,
  onSubmit,
  saving,
  editingId,
  setEditingId,
  allCategories,
  allTags,
  eligibleRecipients,
  showCustomInput,
  setShowCustomInput,
  onCancel,
  quickAmountRef,
  isQuickForm = false,
  pathname = '/expenses',
  isPwaActive = false
}: TransactionFormProps) {
  const [quickPrefs, setQuickPrefs] = useState<QuickFormPreferences>(() => getQuickFormPreferences());
  const [showCustomAccountInput, setShowCustomAccountInput] = useState(false);

  useEffect(() => {
    const handleUpdate = () => {
      setQuickPrefs(getQuickFormPreferences());
    };
    window.addEventListener(QUICK_PREFS_EVENT_NAME, handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener(QUICK_PREFS_EVENT_NAME, handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  if (isQuickForm) {
    const quickCategories = [
      { label: 'Grocery 🛒', type: 'EXPENSE', category: 'Grocery', isReceivable: false },
      { label: 'Food & Bev 🍔', type: 'EXPENSE', category: 'Food & Beverage', isReceivable: false },
      { label: 'Fuel ⛽', type: 'EXPENSE', category: 'Fuel', isReceivable: false },
      { label: 'Shopping 🛍️', type: 'EXPENSE', category: 'Shopping', isReceivable: false },
      { label: 'Lending 🤝', type: 'EXPENSE', category: 'Lending', isReceivable: true },
      { label: 'Salary 💰', type: 'INCOME', category: 'Salary', isReceivable: false },
      { label: 'Refund/Other 💵', type: 'INCOME', category: 'Other', isReceivable: false },
      { label: 'Transfer 🔄', type: 'TRANSFER', category: 'Transfer', isReceivable: false }
    ];

    const handleQuickSubmit = (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!quickPrefs.date) {
        const nowIso = new Date().toISOString();
        if (!editingId || !form.date) {
          form.date = nowIso;
          setForm((prev: any) => ({ ...prev, date: nowIso }));
        }
      }
      onSubmit(e);
    };

    return (
      <form className="space-y-4 text-left" onSubmit={handleQuickSubmit}>
        {/* Large Amount Field (Mandatory) */}
        <div>
          <label className="cash-label text-center block mb-2" htmlFor="quickAmount">
            Amount <span className="text-rose-500 font-bold">*</span>
          </label>
          <div
            onClick={() => quickAmountRef?.current?.focus()}
            className="relative rounded-2xl border border-ink-200 bg-ink-50/50 p-4 cursor-pointer"
          >
            <span className="absolute left-6 top-1/2 -translate-y-1/2 text-2xl font-bold text-ink-400">
              ₹
            </span>
            <input
              ref={quickAmountRef}
              id="quickAmount"
              className="w-full bg-transparent text-center text-4xl font-bold text-ink-900 focus:outline-none placeholder-ink-300"
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={form.amount}
              onChange={(event) => setForm({ ...form, amount: event.target.value })}
              required
            />
          </div>
        </div>

        {/* Description/Note (Mandatory) */}
        <div>
          <label className="cash-label" htmlFor="quickDescription">
            Description <span className="text-rose-500 font-bold">*</span>
          </label>
          <input
            id="quickDescription"
            className="cash-input text-xs py-2"
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
            placeholder="Enter transaction details"
            required
          />
        </div>

        {/* Quick form Radio for Transfer & Lending (Optional, User Configurable via Quick Prefs) */}
        {quickPrefs.specialExpenseType && form.transactionType !== 'INCOME' && (
          <div className="flex flex-wrap items-center gap-2 pt-0.5 text-xs">
            <label
              onClick={(e) => {
                e.preventDefault();
                if (form.transactionType === 'TRANSFER') {
                  setForm({
                    ...form,
                    transactionType: 'EXPENSE',
                    isReceivable: false,
                    toUserId: '',
                    category: '',
                    receivableStatus: undefined,
                    reimbursedAmount: undefined
                  });
                } else {
                  setForm({
                    ...form,
                    transactionType: 'TRANSFER',
                    isReceivable: false,
                    category: 'Transfer',
                    categoryType: '',
                    receivableStatus: undefined,
                    reimbursedAmount: undefined
                  });
                }
              }}
              className={`flex items-center gap-1.5 cursor-pointer font-medium px-2.5 py-1 rounded-lg border text-xs transition-all ${
                form.transactionType === 'TRANSFER'
                  ? 'bg-blue-50 text-blue-900 border-blue-300 font-semibold'
                  : 'text-ink-700 bg-white border-ink-200 hover:bg-ink-50'
              }`}
            >
              <input
                type="radio"
                name="quickSpecialExpenseType"
                checked={form.transactionType === 'TRANSFER'}
                onChange={() => {}}
                className="text-brand-600 focus:ring-brand-500 h-3.5 w-3.5 pointer-events-none"
              />
              <span>🔄 Transfer</span>
            </label>

            <label
              onClick={(e) => {
                e.preventDefault();
                if (form.transactionType === 'EXPENSE' && form.isReceivable) {
                  setForm({
                    ...form,
                    transactionType: 'EXPENSE',
                    isReceivable: false,
                    toUserId: '',
                    category: '',
                    receivableStatus: undefined,
                    reimbursedAmount: undefined
                  });
                } else {
                  setForm({
                    ...form,
                    transactionType: 'EXPENSE',
                    isReceivable: true,
                    toUserId: '',
                    category: form.category && form.category !== 'Transfer' ? form.category : 'Lending',
                    receivableStatus: form.receivableStatus || 'OUTSTANDING',
                    reimbursedAmount: form.reimbursedAmount || 0
                  });
                }
              }}
              className={`flex items-center gap-1.5 cursor-pointer font-medium px-2.5 py-1 rounded-lg border text-xs transition-all ${
                form.transactionType === 'EXPENSE' && form.isReceivable
                  ? 'bg-amber-50 text-amber-950 border-amber-300 font-semibold'
                  : 'text-ink-700 bg-white border-ink-200 hover:bg-ink-50'
              }`}
            >
              <input
                type="radio"
                name="quickSpecialExpenseType"
                checked={form.transactionType === 'EXPENSE' && Boolean(form.isReceivable)}
                onChange={() => {}}
                className="text-brand-600 focus:ring-brand-500 h-3.5 w-3.5 pointer-events-none"
              />
              <span>🤝 Lending</span>
            </label>
          </div>
        )}

        {/* Transfer Recipient dropdown (if transfer selected via radio or quick category chip) */}
        {form.transactionType === 'TRANSFER' && (
          <div className="animate-in fade-in duration-150">
            <label className="cash-label" htmlFor="quickToUserId">
              Recipient <span className="text-rose-500 font-bold">*</span>
            </label>
            <select
              id="quickToUserId"
              className="cash-input text-xs"
              value={form.toUserId}
              onChange={(event) => setForm({ ...form, toUserId: event.target.value })}
              required
            >
              <option value="">Select Recipient</option>
              {eligibleRecipients.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} (ID: {u.id}) • {u.email}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Tags with Auto-suggest (Optional, User Configurable) */}
        {quickPrefs.tags && (
          <TagInputField
            value={form.tags}
            onChange={(val) => setForm({ ...form, tags: val })}
            allTags={allTags}
            id="quickTags"
          />
        )}

        {/* Category Tap Chips (Optional, User Configurable) */}
        {quickPrefs.quickCategories && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="cash-label">Quick Categories</label>
              {form.category && (
                <button
                  type="button"
                  onClick={() => setForm({ ...form, category: '', categoryType: '' })}
                  className="text-[11px] font-semibold text-rose-600 hover:text-rose-800"
                >
                  Clear category
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {quickCategories.map((item) => {
                const isSelected =
                  form.transactionType === item.type &&
                  form.category === item.category &&
                  (item.isReceivable ? Boolean(form.isReceivable) : !form.isReceivable);
                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => {
                      setShowCustomInput(false);
                      if (isSelected) {
                        setForm({
                          ...form,
                          category: '',
                          categoryType: '',
                          isReceivable: false
                        });
                      } else {
                        setForm({
                          ...form,
                          transactionType: item.type,
                          isReceivable: Boolean(item.isReceivable),
                          category: item.type === 'TRANSFER' ? 'Transfer' : item.category,
                          toUserId: item.type === 'TRANSFER' ? form.toUserId : '',
                          receivableStatus: item.isReceivable ? 'OUTSTANDING' : form.receivableStatus,
                          reimbursedAmount: item.isReceivable ? 0 : form.reimbursedAmount
                        });
                      }
                    }}
                    className={`px-4 py-2 rounded-full border text-xs font-semibold transition-all ${
                      isSelected
                        ? 'bg-brand-700 text-white border-brand-700 shadow-sm'
                        : 'bg-white border-ink-200 text-ink-700 hover:bg-ink-50'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Dropdown for other/custom categories (Optional, User Configurable) */}
        {quickPrefs.categoryDropdown && form.transactionType !== 'TRANSFER' && (
          <div className="space-y-2">
            <label className="cash-label" htmlFor="quickCategorySelect">
              Category Dropdown
            </label>
            <select
              id="quickCategorySelect"
              className="cash-input text-xs"
              value={
                showCustomInput
                  ? 'CUSTOM'
                  : allCategories.includes(form.category)
                    ? form.category
                    : form.category
                      ? 'CUSTOM'
                      : ''
              }
              onChange={(event) => {
                const val = event.target.value;
                if (val === 'CUSTOM') {
                  setShowCustomInput(true);
                  setForm({ ...form, category: '' });
                } else {
                  setShowCustomInput(false);
                  setForm({ ...form, category: val });
                }
              }}
            >
              <option value="">No category (leave uncategorized ⚠️)</option>
              {allCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
              <option value="CUSTOM" className="font-semibold text-brand-700">
                + Add Custom Category...
              </option>
            </select>

            {(showCustomInput || (form.category && !allCategories.includes(form.category))) && (
              <div className="flex gap-2 items-center animate-in fade-in duration-200">
                <div className="flex-1">
                  <input
                    id="quickCustomCategory"
                    className="cash-input text-xs"
                    value={form.category}
                    onChange={(event) => setForm({ ...form, category: event.target.value })}
                    placeholder="Enter custom category name (optional)"
                  />
                </div>
                <button
                  type="button"
                  className="cash-button-secondary py-2 px-3 text-xs shrink-0 self-end h-[38px] rounded-2xl"
                  onClick={() => {
                    setShowCustomInput(false);
                    setForm({ ...form, category: '' });
                  }}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}

        {/* Category Type (Optional, User Configurable) */}
        {quickPrefs.categoryType && form.transactionType !== 'TRANSFER' && (
          <div>
            <span className="cash-label block mb-2">Category Type</span>
            <div className="flex flex-wrap gap-2">
              {[
                { value: 'ESSENTIALS', label: 'Essentials 📌' },
                { value: 'LIFESTYLE', label: 'Lifestyle 🍦' },
                { value: 'HIGH_VALUE', label: 'High-Value 💎' }
              ].map((item) => {
                const isSelected = form.categoryType === item.value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => {
                      setForm({
                        ...form,
                        categoryType: isSelected ? '' : item.value
                      });
                    }}
                    className={`px-3 py-1.5 rounded-full border text-xs font-semibold transition-all ${
                      isSelected
                        ? 'bg-brand-700 text-white border-brand-700 shadow-sm'
                        : 'bg-white border-ink-200 text-ink-700 hover:bg-ink-50'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Payment Method (Optional, User Configurable) */}
        {quickPrefs.paymentMethod && (
          <div>
            <label className="cash-label" htmlFor="quickPaymentMethod">
              Payment Method
            </label>
            <select
              id="quickPaymentMethod"
              className="cash-input text-xs"
              value={form.paymentMethod}
              onChange={(event) => setForm({ ...form, paymentMethod: event.target.value })}
            >
              {paymentMethods.map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Payment Account (Optional, User Configurable via Quick Prefs) */}
        {quickPrefs.paymentAccount && (
          <div className="space-y-2">
            <div>
              <label className="cash-label" htmlFor="quickPaymentAccount">
                Payment Account
              </label>
              <select
                id="quickPaymentAccount"
                className="cash-input text-xs"
                value={
                  showCustomAccountInput
                    ? 'CUSTOM'
                    : commonPaymentAccounts.includes(form.paymentAccount || '')
                      ? form.paymentAccount
                      : form.paymentAccount
                        ? 'CUSTOM'
                        : ''
                }
                onChange={(event) => {
                  const val = event.target.value;
                  if (val === 'CUSTOM') {
                    setShowCustomAccountInput(true);
                    setForm({ ...form, paymentAccount: '' });
                  } else {
                    setShowCustomAccountInput(false);
                    setForm({ ...form, paymentAccount: val });
                  }
                }}
              >
                <option value="">Select Account (Optional)</option>
                {commonPaymentAccounts.map((acc) => (
                  <option key={acc} value={acc}>
                    {acc}
                  </option>
                ))}
                <option value="CUSTOM" className="font-semibold text-brand-700">
                  + Other / Custom Account...
                </option>
              </select>
            </div>

            {(showCustomAccountInput ||
              (form.paymentAccount && !commonPaymentAccounts.includes(form.paymentAccount))) && (
              <div className="flex gap-2 items-center animate-in fade-in duration-200">
                <div className="flex-1">
                  <input
                    id="quickCustomPaymentAccount"
                    className="cash-input text-xs"
                    value={form.paymentAccount || ''}
                    onChange={(event) => setForm({ ...form, paymentAccount: event.target.value })}
                    placeholder="Enter custom account (e.g. HDFC Bank, SBI, Paytm UPI)"
                  />
                </div>
                <button
                  type="button"
                  className="cash-button-secondary py-2 px-3 text-xs shrink-0 self-end h-[38px] rounded-2xl"
                  onClick={() => {
                    setShowCustomAccountInput(false);
                    setForm({ ...form, paymentAccount: '' });
                  }}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}

        {/* Date & Time (Optional, User Configurable) */}
        {quickPrefs.date && (
          <div>
            <label className="cash-label" htmlFor="quickDate">
              Date & Time
            </label>
            <input
              id="quickDate"
              className="cash-input text-xs"
              type="datetime-local"
              value={form.date}
              onChange={(event) => setForm({ ...form, date: event.target.value })}
              required
            />
          </div>
        )}

        {/* Quick Save / Add Action Buttons (Sticky so always visible and accessible) */}
        <div className="sticky bottom-0 bg-white/95 backdrop-blur-md pt-3 pb-2 -mx-1 px-1 border-t border-ink-100 flex gap-2 z-10">
          <button
            className="cash-button-primary flex-1 py-3 text-sm font-semibold rounded-2xl shadow-sm"
            type="submit"
            disabled={saving}
          >
            {saving ? 'Saving...' : editingId ? 'Update Transaction' : '➕ Add Transaction'}
          </button>
          <button
            className="cash-button-secondary py-3 px-4 rounded-2xl"
            type="button"
            onClick={onCancel}
          >
            Close
          </button>
        </div>

        {/* Mobile guide message */}
        {!isPwaActive && (
          <p className="text-[10px] text-ink-400 text-center mt-2 pb-1">
            💡 <strong>Add to Home Screen</strong>: Tap your browser's share icon and select{' '}
            <strong>"Add to Home Screen"</strong> to open this Quick Entry form directly from your
            phone's home screen.
          </p>
        )}
      </form>
    );
  }

  // Detailed form for desktop/modals
  return (
    <form className="space-y-4 text-left" onSubmit={onSubmit}>
      {editingId && (
        <div className="flex items-center justify-between p-2.5 rounded-xl bg-ink-50 border border-ink-200 text-xs animate-in fade-in duration-150">
          <div className="flex items-center gap-1.5">
            <span className="text-ink-500 font-medium">Tracking ID:</span>
            <span className="font-mono font-bold text-ink-900 bg-white px-2 py-0.5 rounded border border-ink-150 shadow-2xs">
              {editingId}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(editingId);
              alert(`Tracking ID "${editingId}" copied to clipboard!`);
            }}
            title="Copy Tracking ID"
            className="text-[11px] font-semibold text-brand-700 hover:text-brand-900 flex items-center gap-1"
          >
            <span>📋 Copy</span>
          </button>
        </div>
      )}

      {/* 1. Amount (Mandatory with Red Star) */}
      <div>
        <label className="cash-label" htmlFor="amount">
          Amount <span className="text-rose-500 font-bold">*</span>
        </label>
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-ink-400">
            ₹
          </span>
          <input
            id="amount"
            className="cash-input pl-8 text-sm"
            type="number"
            min="0"
            step="0.01"
            value={form.amount}
            onChange={(event) => setForm({ ...form, amount: event.target.value })}
            placeholder="0.00"
            required
          />
        </div>
      </div>

      {/* 2. Description (Mandatory with Red Star, normal text input) */}
      <div>
        <label className="cash-label" htmlFor="description">
          Description <span className="text-rose-500 font-bold">*</span>
        </label>
        <input
          type="text"
          id="description"
          className="cash-input text-xs"
          value={form.description}
          onChange={(event) => setForm({ ...form, description: event.target.value })}
          placeholder="Enter transaction details (e.g. Grocery shopping, Dinner, Cab)"
          required
        />
      </div>

      {/* Direct Radio Buttons for Transfer and Lending (No "Normal" radio; if neither selected, it's normal expense) */}
      {form.transactionType !== 'INCOME' && (
        <div className="space-y-2 pt-0.5">
          <div className="flex flex-wrap items-center gap-3">
            <label
              onClick={(e) => {
                e.preventDefault();
                if (form.transactionType === 'TRANSFER') {
                  // Deselect -> back to normal expense
                  setForm({
                    ...form,
                    transactionType: 'EXPENSE',
                    isReceivable: false,
                    toUserId: '',
                    category: '',
                    receivableStatus: undefined,
                    reimbursedAmount: undefined
                  });
                } else {
                  // Select Transfer
                  setForm({
                    ...form,
                    transactionType: 'TRANSFER',
                    isReceivable: false,
                    category: 'Transfer',
                    categoryType: '',
                    receivableStatus: undefined,
                    reimbursedAmount: undefined
                  });
                }
              }}
              className={`flex items-center gap-2 cursor-pointer text-xs font-semibold px-3.5 py-2 rounded-xl transition-all border ${
                form.transactionType === 'TRANSFER'
                  ? 'bg-blue-50 text-blue-900 border-blue-300 ring-1 ring-blue-300 shadow-2xs'
                  : 'bg-white text-ink-700 border-ink-200/80 hover:bg-ink-50'
              }`}
            >
              <input
                type="radio"
                name="specialExpenseType"
                checked={form.transactionType === 'TRANSFER'}
                onChange={() => {}}
                className="text-brand-600 focus:ring-brand-500 h-3.5 w-3.5 pointer-events-none"
              />
              <span>🔄 Transfer</span>
            </label>

            <label
              onClick={(e) => {
                e.preventDefault();
                if (form.transactionType === 'EXPENSE' && form.isReceivable) {
                  // Deselect -> back to normal expense
                  setForm({
                    ...form,
                    transactionType: 'EXPENSE',
                    isReceivable: false,
                    toUserId: '',
                    category: '',
                    receivableStatus: undefined,
                    reimbursedAmount: undefined
                  });
                } else {
                  // Select Lending
                  setForm({
                    ...form,
                    transactionType: 'EXPENSE',
                    isReceivable: true,
                    toUserId: '',
                    category: form.category && form.category !== 'Transfer' ? form.category : 'Lending',
                    receivableStatus: form.receivableStatus || 'OUTSTANDING',
                    reimbursedAmount: form.reimbursedAmount || 0
                  });
                }
              }}
              className={`flex items-center gap-2 cursor-pointer text-xs font-semibold px-3.5 py-2 rounded-xl transition-all border ${
                form.transactionType === 'EXPENSE' && form.isReceivable
                  ? 'bg-amber-50 text-amber-950 border-amber-300 ring-1 ring-amber-300 shadow-2xs'
                  : 'bg-white text-ink-700 border-ink-200/80 hover:bg-ink-50'
              }`}
            >
              <input
                type="radio"
                name="specialExpenseType"
                checked={form.transactionType === 'EXPENSE' && Boolean(form.isReceivable)}
                onChange={() => {}}
                className="text-brand-600 focus:ring-brand-500 h-3.5 w-3.5 pointer-events-none"
              />
              <span>🤝 Lending</span>
            </label>
          </div>

          {/* If Lending, show helpful notice */}
          {form.isReceivable && (
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200/60 rounded-lg px-2.5 py-1 font-medium animate-in fade-in duration-150">
              💡 <strong>Lending Expense</strong>: Recorded as an expense (Outstanding) until returned. Tracked in the Lending section.
            </p>
          )}

          {/* If Transfer, new field directly below asking for recipient (dropdown) */}
          {form.transactionType === 'TRANSFER' && (
            <div className="pt-1 animate-in fade-in duration-200">
              <label className="cash-label" htmlFor="toUserId">
                Recipient <span className="text-rose-500 font-bold">*</span>
              </label>
              <select
                id="toUserId"
                className="cash-input text-xs"
                value={form.toUserId}
                onChange={(event) => setForm({ ...form, toUserId: event.target.value })}
                required
              >
                <option value="">Select Recipient</option>
                {eligibleRecipients.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} (ID: {u.id}) • {u.email}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* 3. Category (when not Transfer) */}
      {form.transactionType !== 'TRANSFER' && (
        <div className="space-y-2">
          <div>
            <label className="cash-label" htmlFor="category">
              Category
            </label>
            <select
              id="category"
              className="cash-input text-xs"
              value={
                showCustomInput
                  ? 'CUSTOM'
                  : allCategories.includes(form.category)
                    ? form.category
                    : form.category
                      ? 'CUSTOM'
                      : ''
              }
              onChange={(event) => {
                const val = event.target.value;
                if (val === 'CUSTOM') {
                  setShowCustomInput(true);
                  setForm({ ...form, category: '' });
                } else {
                  setShowCustomInput(false);
                  setForm({ ...form, category: val });
                }
              }}
              required={form.transactionType === 'EXPENSE'}
            >
              <option value="">Select Category</option>
              {allCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
              <option value="CUSTOM" className="font-semibold text-brand-700">
                + Add Custom Category...
              </option>
            </select>
          </div>

          {(showCustomInput || (form.category && !allCategories.includes(form.category))) && (
            <div className="flex gap-2 items-center animate-in fade-in duration-200">
              <div className="flex-1">
                <input
                  id="customCategory"
                  className="cash-input text-xs"
                  value={form.category}
                  onChange={(event) => setForm({ ...form, category: event.target.value })}
                  placeholder="Enter custom category name"
                  required
                />
              </div>
              <button
                type="button"
                className="cash-button-secondary py-2 px-3 text-xs shrink-0 self-end h-[38px] rounded-2xl"
                onClick={() => {
                  setShowCustomInput(false);
                  setForm({ ...form, category: '' });
                }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {/* 4. Category Type (when not Transfer) */}
      {form.transactionType !== 'TRANSFER' && (
        <div>
          <span className="cash-label block mb-2">Category Type</span>
          <div className="flex flex-wrap gap-2">
            {[
              { value: 'ESSENTIALS', label: 'Essentials 📌' },
              { value: 'LIFESTYLE', label: 'Lifestyle 🍦' },
              { value: 'HIGH_VALUE', label: 'High-Value 💎' }
            ].map((item) => {
              const isSelected = form.categoryType === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => {
                    setForm({
                      ...form,
                      categoryType: isSelected ? '' : item.value
                    });
                  }}
                  className={`px-3.5 py-1.5 rounded-full border text-xs font-semibold transition-all ${
                    isSelected
                      ? 'bg-brand-700 text-white border-brand-700 shadow-sm'
                      : 'bg-white border-ink-200 text-ink-700 hover:bg-ink-50'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 5. Date & Time (default current) */}
      <div>
        <label className="cash-label" htmlFor="date">
          Date & Time
        </label>
        <input
          id="date"
          className="cash-input text-xs"
          type="datetime-local"
          value={form.date}
          onChange={(event) => setForm({ ...form, date: event.target.value })}
          required
        />
      </div>

      {/* 6. Payment Method */}
      <div>
        <label className="cash-label" htmlFor="paymentMethod">
          Payment Method
        </label>
        <select
          id="paymentMethod"
          className="cash-input text-xs"
          value={form.paymentMethod}
          onChange={(event) => setForm({ ...form, paymentMethod: event.target.value })}
        >
          {paymentMethods.map((method) => (
            <option key={method} value={method}>
              {method}
            </option>
          ))}
        </select>
      </div>

      {/* 7. Payment Account (New Field!) */}
      <div className="space-y-2">
        <div>
          <label className="cash-label" htmlFor="paymentAccount">
            Payment Account
          </label>
          <select
            id="paymentAccount"
            className="cash-input text-xs"
            value={
              showCustomAccountInput
                ? 'CUSTOM'
                : commonPaymentAccounts.includes(form.paymentAccount || '')
                  ? form.paymentAccount
                  : form.paymentAccount
                    ? 'CUSTOM'
                    : ''
            }
            onChange={(event) => {
              const val = event.target.value;
              if (val === 'CUSTOM') {
                setShowCustomAccountInput(true);
                setForm({ ...form, paymentAccount: '' });
              } else {
                setShowCustomAccountInput(false);
                setForm({ ...form, paymentAccount: val });
              }
            }}
          >
            <option value="">Select Account (Optional)</option>
            {commonPaymentAccounts.map((acc) => (
              <option key={acc} value={acc}>
                {acc}
              </option>
            ))}
            <option value="CUSTOM" className="font-semibold text-brand-700">
              + Other / Custom Account...
            </option>
          </select>
        </div>

        {(showCustomAccountInput ||
          (form.paymentAccount && !commonPaymentAccounts.includes(form.paymentAccount))) && (
          <div className="flex gap-2 items-center animate-in fade-in duration-200">
            <div className="flex-1">
              <input
                id="customPaymentAccount"
                className="cash-input text-xs"
                value={form.paymentAccount || ''}
                onChange={(event) => setForm({ ...form, paymentAccount: event.target.value })}
                placeholder="Enter custom account (e.g. HDFC Bank, SBI, Paytm UPI)"
              />
            </div>
            <button
              type="button"
              className="cash-button-secondary py-2 px-3 text-xs shrink-0 self-end h-[38px] rounded-2xl"
              onClick={() => {
                setShowCustomAccountInput(false);
                setForm({ ...form, paymentAccount: '' });
              }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* 8. Tags */}
      <TagInputField
        value={form.tags}
        onChange={(val) => setForm({ ...form, tags: val })}
        allTags={allTags}
        id="tags"
      />

      {/* 9. Action Buttons */}
      <div className="flex gap-3 pt-2">
        <button className="cash-button-primary flex-1 py-2.5" type="submit" disabled={saving}>
          {saving ? 'Saving...' : editingId ? 'Update transaction' : 'Save transaction'}
        </button>
        {editingId || pathname === '/transactions' ? (
          <button className="cash-button-secondary py-2.5" type="button" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}
