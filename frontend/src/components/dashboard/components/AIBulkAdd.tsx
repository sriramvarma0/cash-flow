import React from 'react';
import { formatCurrency } from '../../../lib/finance';

export type AIBulkAddProps = {
  isBulkOpen: boolean;
  setIsBulkOpen: (val: boolean) => void;
  bulkStep: 'input' | 'preview';
  setBulkStep: (val: 'input' | 'preview') => void;
  pasteValue: string;
  setPasteValue: (val: string) => void;
  parsedExpenses: {
    date: string;
    title: string;
    category: string;
    categoryType: string;
    amount: string;
    paymentMethod: string;
    tags: string;
  }[];
  setParsedExpenses: (val: any[]) => void;
  bulkError: string;
  setBulkError: (val: string) => void;
  bulkSaving: boolean;
  handlePreview: () => void;
  handleConfirmImport: () => void;
  AI_PROMPT: string;
};

const paymentMethods = ['Card', 'Cash', 'Bank transfer', 'Wallet'];

export function AIBulkAdd({
  isBulkOpen,
  setIsBulkOpen,
  bulkStep,
  setBulkStep,
  pasteValue,
  setPasteValue,
  parsedExpenses,
  setParsedExpenses,
  bulkError,
  setBulkError,
  bulkSaving,
  handlePreview,
  handleConfirmImport,
  AI_PROMPT
}: AIBulkAddProps) {
  if (!isBulkOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/60 backdrop-blur-sm">
      <div className="cash-card flex h-[85vh] w-full max-w-4xl flex-col overflow-hidden bg-white/95 p-6 shadow-xl animate-in fade-in zoom-in duration-200">
        {/* Modal Header */}
        <div className="mb-4 flex items-center justify-between border-b border-ink-100 pb-4">
          <div>
            <h3 className="text-2xl font-semibold text-ink-900">AI Bulk Expense Import</h3>
            <p className="text-xs text-ink-500 mt-1">
              Convert spoken or written expenses into database entries using AI assistance.
            </p>
          </div>
          <button
            type="button"
            className="rounded-full p-2 text-ink-500 hover:bg-ink-100 transition"
            onClick={() => {
              setIsBulkOpen(false);
              setBulkError('');
            }}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto pr-1">
          {bulkError && (
            <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {bulkError}
            </div>
          )}

          {bulkStep === 'input' ? (
            <div className="space-y-4">
              <div className="flex flex-col gap-4 rounded-2xl bg-ink-50/50 p-4 border border-ink-100">
                <h4 className="text-sm font-semibold text-ink-900">1. Copy the AI instruction prompt</h4>
                <p className="text-xs text-ink-600">
                  Copy this prompt and paste it into ChatGPT, Gemini, or Claude along with your written or spoken list of expenses.
                </p>
                <button
                  type="button"
                  className="cash-button-secondary py-2 self-start flex items-center gap-2 text-xs"
                  onClick={() => {
                    void navigator.clipboard.writeText(AI_PROMPT);
                    alert('AI Prompt copied to clipboard!');
                  }}
                >
                  <span>📋 Copy AI Prompt</span>
                </button>
              </div>

              <div className="space-y-2">
                <label className="cash-label" htmlFor="pasteArea">
                  2. Paste AI Response Here
                </label>
                <textarea
                  id="pasteArea"
                  className="cash-input min-h-[30vh] font-mono text-xs leading-relaxed"
                  placeholder={`[\n  {\n    "date": "2026-07-08",\n    "title": "Groceries at supermarket",\n    "category": "Food",\n    "amount": 45.20,\n    "payment_method": "Card"\n  }\n]`}
                  value={pasteValue}
                  onChange={(e) => setPasteValue(e.target.value)}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-2xl bg-ink-50/50 p-4 border border-ink-100">
                <h4 className="text-sm font-semibold text-ink-900">Verify and Edit Expenses</h4>
                <p className="text-xs text-ink-600 mt-1">
                  Check each item below. You can edit any field directly inside the table before completing the import.
                </p>
              </div>

              <div className="overflow-x-auto border border-ink-100 rounded-2xl">
                <table className="min-w-full divide-y divide-ink-100 text-left text-xs">
                  <thead className="bg-ink-50 text-ink-500 font-medium">
                    <tr>
                      <th className="px-3 py-2 w-[180px]">Date & Time</th>
                      <th className="px-3 py-2">Title/Description</th>
                      <th className="px-3 py-2 w-[120px]">Category</th>
                      <th className="px-3 py-2 w-[120px]">Category Type</th>
                      <th className="px-3 py-2 w-[120px]">Tags</th>
                      <th className="px-3 py-2 w-[100px]">Amount</th>
                      <th className="px-3 py-2 w-[120px]">Payment Method</th>
                      <th className="px-3 py-2 w-[60px] text-center">Delete</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100 bg-white">
                    {parsedExpenses.map((expense, idx) => (
                      <tr key={idx} className="hover:bg-ink-50/40">
                        <td className="p-1.5">
                          <input
                            type="datetime-local"
                            className="w-full bg-transparent border border-transparent hover:border-ink-200 focus:border-brand-400 focus:ring-1 focus:ring-brand-100 rounded p-1 text-xs text-ink-900"
                            value={expense.date}
                            onChange={(e) => {
                              const updated = [...parsedExpenses];
                              updated[idx].date = e.target.value;
                              setParsedExpenses(updated);
                            }}
                          />
                        </td>
                        <td className="p-1.5">
                          <input
                            type="text"
                            className="w-full bg-transparent border border-transparent hover:border-ink-200 focus:border-brand-400 focus:ring-1 focus:ring-brand-100 rounded p-1 text-xs text-ink-900 font-semibold"
                            value={expense.title}
                            onChange={(e) => {
                              const updated = [...parsedExpenses];
                              updated[idx].title = e.target.value;
                              setParsedExpenses(updated);
                            }}
                          />
                        </td>
                        <td className="p-1.5">
                          <input
                            type="text"
                            className="w-full bg-transparent border border-transparent hover:border-ink-200 focus:border-brand-400 focus:ring-1 focus:ring-brand-100 rounded p-1 text-xs text-ink-700"
                            value={expense.category}
                            onChange={(e) => {
                              const updated = [...parsedExpenses];
                              updated[idx].category = e.target.value;
                              setParsedExpenses(updated);
                            }}
                          />
                        </td>
                        <td className="p-1.5">
                          <select
                            className="w-full bg-transparent border border-transparent hover:border-ink-200 focus:border-brand-400 focus:ring-1 focus:ring-brand-100 rounded p-1 text-xs text-ink-700 outline-none"
                            value={expense.categoryType || ''}
                            onChange={(e) => {
                              const updated = [...parsedExpenses];
                              updated[idx].categoryType = e.target.value;
                              setParsedExpenses(updated);
                            }}
                          >
                            <option value="">None</option>
                            <option value="ESSENTIALS">Essentials</option>
                            <option value="LIFESTYLE">Lifestyle</option>
                            <option value="HIGH_VALUE">High-Value</option>
                          </select>
                        </td>
                        <td className="p-1.5">
                          <input
                            type="text"
                            className="w-full bg-transparent border border-transparent hover:border-ink-200 focus:border-brand-400 focus:ring-1 focus:ring-brand-100 rounded p-1 text-xs text-ink-700"
                            value={expense.tags}
                            onChange={(e) => {
                              const updated = [...parsedExpenses];
                              updated[idx].tags = e.target.value;
                              setParsedExpenses(updated);
                            }}
                            placeholder="tag1, tag2"
                          />
                        </td>
                        <td className="p-1.5">
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            className="w-full bg-transparent border border-transparent hover:border-ink-200 focus:border-brand-400 focus:ring-1 focus:ring-brand-100 rounded p-1 text-xs text-ink-900 font-bold"
                            value={expense.amount}
                            onChange={(e) => {
                              const updated = [...parsedExpenses];
                              updated[idx].amount = e.target.value;
                              setParsedExpenses(updated);
                            }}
                          />
                        </td>
                        <td className="p-1.5">
                          <select
                            className="w-full bg-transparent border border-transparent hover:border-ink-200 focus:border-brand-400 focus:ring-1 focus:ring-brand-100 rounded p-1 text-xs text-ink-700 outline-none"
                            value={expense.paymentMethod}
                            onChange={(e) => {
                              const updated = [...parsedExpenses];
                              updated[idx].paymentMethod = e.target.value;
                              setParsedExpenses(updated);
                            }}
                          >
                            {paymentMethods.map((m) => (
                              <option key={m} value={m}>
                                {m}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-1.5 text-center">
                          <button
                            type="button"
                            className="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded transition"
                            onClick={() => {
                              const updated = parsedExpenses.filter((_, i) => i !== idx);
                              setParsedExpenses(updated);
                            }}
                          >
                            <svg
                              className="h-4 w-4 mx-auto"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between text-xs text-ink-600 px-1">
                <span>Showing {parsedExpenses.length} potential expense(s)</span>
                <span className="font-semibold text-ink-900 text-sm">
                  Total:{' '}
                  {formatCurrency(
                    parsedExpenses.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
                  )}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="mt-4 flex items-center justify-end gap-3 border-t border-ink-100 pt-4">
          {bulkStep === 'input' ? (
            <>
              <button
                type="button"
                className="cash-button-secondary py-2.5 px-4 text-xs"
                onClick={() => {
                  setIsBulkOpen(false);
                  setBulkError('');
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="cash-button-primary py-2.5 px-4 text-xs"
                onClick={handlePreview}
              >
                Preview Expenses
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="cash-button-secondary py-2.5 px-4 text-xs"
                onClick={() => {
                  setBulkStep('input');
                  setBulkError('');
                }}
                disabled={bulkSaving}
              >
                Back to Input
              </button>
              <button
                type="button"
                className="cash-button-primary py-2.5 px-4 text-xs flex items-center gap-1.5"
                onClick={handleConfirmImport}
                disabled={bulkSaving || parsedExpenses.length === 0}
              >
                {bulkSaving ? 'Saving...' : 'Confirm Import'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
