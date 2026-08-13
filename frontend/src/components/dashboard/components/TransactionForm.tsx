import React from 'react';

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
            Amount
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
            Description
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

        {/* Tags */}
        <div>
          <label className="cash-label" htmlFor="quickTags">
            Tags (comma-separated)
          </label>
          <input
            id="quickTags"
            className="cash-input text-xs py-2"
            value={form.tags}
            onChange={(event) => setForm({ ...form, tags: event.target.value })}
            placeholder="e.g. travel, work"
          />
        </div>

        {/* Category Tap Chips */}
        <div>
          <label className="cash-label mb-2 block">Quick Categories</label>
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
                    setForm({
                      ...form,
                      transactionType: item.type,
                      category: item.type === 'TRANSFER' ? 'Transfer' : item.category,
                      toUserId: item.type === 'TRANSFER' ? form.toUserId : ''
                    });
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
              Or Select Other Category
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

            {(showCustomInput || (form.category && !allCategories.includes(form.category))) && (
              <div className="flex gap-2 items-center animate-in fade-in duration-200">
                <div className="flex-1">
                  <input
                    id="quickCustomCategory"
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
                  {u.name} ({u.email})
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

        {/* Quick Save Button */}
        <div className="flex gap-2 pt-2">
          <button
            className="cash-button-primary flex-1 py-3 text-sm font-semibold rounded-2xl"
            type="submit"
            disabled={saving}
          >
            {saving ? 'Saving...' : editingId ? 'Update transaction' : 'Quick Save'}
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
          <p className="text-[10px] text-ink-400 text-center mt-3">
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
                {u.name} ({u.email})
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

      <div>
        <label className="cash-label" htmlFor="tags">
          Tags (comma-separated)
        </label>
        <input
          id="tags"
          className="cash-input"
          type="text"
          value={form.tags}
          onChange={(event) => setForm({ ...form, tags: event.target.value })}
          placeholder="e.g. travel, work, food"
        />
        {allTags.length > 0 && (
          <div className="mt-2">
            <span className="text-[10px] text-ink-400 font-semibold block mb-1">Your Tags:</span>
            <div className="flex flex-wrap gap-1">
              {allTags.map((tag) => {
                const currentTagsList = form.tags
                  .split(',')
                  .map((t) => t.trim())
                  .filter(Boolean);
                const hasTag = currentTagsList.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => {
                      let updatedTags;
                      if (hasTag) {
                        updatedTags = currentTagsList.filter((t) => t !== tag);
                      } else {
                        updatedTags = [...currentTagsList, tag];
                      }
                      setForm({ ...form, tags: updatedTags.join(', ') });
                    }}
                    className={`px-2 py-0.5 rounded-full text-xxs font-medium border transition-all ${
                      hasTag
                        ? 'bg-brand-600 text-white border-brand-600'
                        : 'bg-ink-50 border-ink-200 text-ink-600 hover:bg-ink-100'
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

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
