import React, { useState, useRef, useMemo } from 'react';

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

const paymentMethods = ['Card', 'Cash', 'Bank transfer', 'Wallet'];

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
  if (isQuickForm) {
    const quickCategories = [
      { label: 'Grocery 🛒', type: 'EXPENSE', category: 'Grocery' },
      { label: 'Food & Bev 🍔', type: 'EXPENSE', category: 'Food & Beverage' },
      { label: 'Fuel ⛽', type: 'EXPENSE', category: 'Fuel' },
      { label: 'Shopping 🛍️', type: 'EXPENSE', category: 'Shopping' },
      { label: 'Salary 💰', type: 'INCOME', category: 'Salary' },
      { label: 'Refund/Other 💵', type: 'INCOME', category: 'Other' },
      { label: 'Transfer 🔄', type: 'TRANSFER', category: 'Transfer' }
    ];

    return (
      <form className="space-y-4 text-left" onSubmit={onSubmit}>
        {/* Large Amount Field */}
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

        {/* Description/Note */}
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

        {/* Tags with Auto-suggest */}
        <TagInputField
          value={form.tags}
          onChange={(val) => setForm({ ...form, tags: val })}
          allTags={allTags}
          id="quickTags"
        />

        {/* Category Tap Chips */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="cash-label">Quick Categories (Optional)</label>
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
                form.transactionType === item.type && form.category === item.category;
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
                        categoryType: ''
                      });
                    } else {
                      setForm({
                        ...form,
                        transactionType: item.type,
                        category: item.type === 'TRANSFER' ? 'Transfer' : item.category,
                        toUserId: item.type === 'TRANSFER' ? form.toUserId : ''
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

        {/* Dropdown for other/custom categories (if not transfer) */}
        {form.transactionType !== 'TRANSFER' && (
          <div className="space-y-2">
            <label className="cash-label" htmlFor="quickCategorySelect">
              Or Select Other Category (Optional)
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

        {/* Transfer Recipient dropdown (if transfer selected) */}
        {form.transactionType === 'TRANSFER' && (
          <div>
            <label className="cash-label" htmlFor="quickToUserId">
              Recipient
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

        {/* Date & Time */}
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

      <div>
        <label className="cash-label" htmlFor="transactionType">
          Transaction Type
        </label>
        <select
          id="transactionType"
          className="cash-input text-xs"
          value={form.transactionType}
          onChange={(event) =>
            setForm({
              ...form,
              transactionType: event.target.value,
              category: event.target.value === 'TRANSFER' ? '' : form.category
            })
          }
        >
          <option value="EXPENSE">Expense</option>
          <option value="INCOME">Income</option>
          <option value="TRANSFER">Transfer</option>
        </select>
      </div>

      <div>
        <label className="cash-label" htmlFor="amount">
          Amount
        </label>
        <input
          id="amount"
          className="cash-input"
          type="number"
          min="0"
          step="0.01"
          value={form.amount}
          onChange={(event) => setForm({ ...form, amount: event.target.value })}
          required
        />
      </div>

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
                  className="cash-input"
                  value={form.category}
                  onChange={(event) => setForm({ ...form, category: event.target.value })}
                  placeholder="Enter custom category name"
                  required
                />
              </div>
              <button
                type="button"
                className="cash-button-secondary py-2 px-3 text-xs shrink-0 self-end h-[42px] rounded-2xl"
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

      {form.transactionType === 'TRANSFER' && (
        <div>
          <label className="cash-label" htmlFor="toUserId">
            Recipient
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

      <div>
        <label className="cash-label" htmlFor="date">
          Date & Time
        </label>
        <input
          id="date"
          className="cash-input"
          type="datetime-local"
          value={form.date}
          onChange={(event) => setForm({ ...form, date: event.target.value })}
          required
        />
      </div>

      <div>
        <label className="cash-label" htmlFor="paymentMethod">
          Payment method
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

      <div>
        <label className="cash-label" htmlFor="description">
          Description
        </label>
        <textarea
          id="description"
          className="cash-input min-h-24 resize-none"
          value={form.description}
          onChange={(event) => setForm({ ...form, description: event.target.value })}
          placeholder="Lunch with clients, monthly subscription, etc."
          required
        />
      </div>

      {/* Tags with Auto-suggest */}
      <TagInputField
        value={form.tags}
        onChange={(val) => setForm({ ...form, tags: val })}
        allTags={allTags}
        id="tags"
      />

      <div className="flex gap-3">
        <button className="cash-button-primary flex-1" type="submit" disabled={saving}>
          {saving ? 'Saving...' : editingId ? 'Update transaction' : 'Save transaction'}
        </button>
        {editingId || pathname === '/transactions' ? (
          <button className="cash-button-secondary" type="button" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}
