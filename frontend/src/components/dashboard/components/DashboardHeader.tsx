import React from 'react';
import { DashboardConfig } from '../dashboard-view';
import { Expense } from '../../../lib/types';
import { formatCurrency } from '../../../lib/finance';

export type DashboardHeaderProps = {
  pathname: string;
  selectedDashboard: DashboardConfig | null;
  setSelectedDashboard: (dash: DashboardConfig | null) => void;
  customDashboards: DashboardConfig[];
  userGroups: any[];
  expenses: Expense[];
  getExpensesMetrics: (list: Expense[]) => any;
  getCustomDashboardMetrics: (dash: DashboardConfig) => any;
  handleDeleteDashboard: (id: string, e: React.MouseEvent) => void;
  isCreateDashboardOpen: boolean;
  setIsCreateDashboardOpen: (val: boolean) => void;
  newDashboardName: string;
  setNewDashboardName: (val: string) => void;
  newDashboardCats: string[];
  setNewDashboardCats: (val: string[]) => void;
  newDashboardTags: string[];
  setNewDashboardTags: (val: string[]) => void;
  allCategories: string[];
  allTags: string[];
  handleCreateDashboard: (e: React.FormEvent) => void;
  loadGroupExpenses: (id: string) => Promise<void>;
  loadExpenses: () => Promise<void>;
};

export function DashboardHeader({
  pathname,
  selectedDashboard,
  setSelectedDashboard,
  customDashboards,
  userGroups,
  expenses,
  getExpensesMetrics,
  getCustomDashboardMetrics,
  handleDeleteDashboard,
  isCreateDashboardOpen,
  setIsCreateDashboardOpen,
  newDashboardName,
  setNewDashboardName,
  newDashboardCats,
  setNewDashboardCats,
  newDashboardTags,
  setNewDashboardTags,
  allCategories,
  allTags,
  handleCreateDashboard,
  loadGroupExpenses,
  loadExpenses
}: DashboardHeaderProps) {
  const renderDashboardSelector = () => {
    return (
      <div className="space-y-8 animate-in fade-in duration-300">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight text-ink-900 text-left">
            Your Dashboards
          </h2>
          <p className="text-sm text-ink-500 text-left mt-1">
            Select a dashboard to view rich metrics, charts, and transaction activity.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {/* Personal Dashboard Card */}
          <div
            onClick={() =>
              setSelectedDashboard({
                id: 'personal',
                type: 'personal',
                name: 'Personal Dashboard'
              })
            }
            className="cash-card relative overflow-hidden p-6 cursor-pointer hover:-translate-y-1 hover:shadow-lg transition-all duration-300 border border-ink-150 group text-left"
          >
            <div className="absolute top-0 right-0 h-24 w-24 translate-x-6 -translate-y-6 rounded-full bg-brand-50/50 group-hover:scale-110 transition-transform duration-300" />
            <div className="relative space-y-4">
              <div className="inline-flex rounded-xl bg-brand-100 p-2.5 text-brand-800">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-ink-900 group-hover:text-brand-700 transition">
                  Personal Dashboard
                </h3>
                <p className="text-xs text-ink-500 mt-1">
                  Your own transactions, transfers, and income streams.
                </p>
              </div>
              <div className="pt-2 border-t border-ink-100 flex items-center justify-between text-xs font-semibold text-ink-600">
                <span>Spent: {formatCurrency(getExpensesMetrics(expenses).totalOut)}</span>
                <span className="text-emerald-600">
                  Income: {formatCurrency(getExpensesMetrics(expenses).totalIn)}
                </span>
              </div>
            </div>
          </div>

          {/* Group Dashboards */}
          {userGroups.map((g) => (
            <div
              key={g.id}
              onClick={() =>
                setSelectedDashboard({ id: g.id, type: 'group', name: `${g.name} Dashboard` })
              }
              className="cash-card relative overflow-hidden p-6 cursor-pointer hover:-translate-y-1 hover:shadow-lg transition-all duration-300 border border-ink-150 group text-left"
            >
              <div className="absolute top-0 right-0 h-24 w-24 translate-x-6 -translate-y-6 rounded-full bg-blue-50/50 group-hover:scale-110 transition-transform duration-300" />
              <div className="relative space-y-4">
                <div className="inline-flex rounded-xl bg-blue-100 p-2.5 text-blue-800">
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                    />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-ink-900 group-hover:text-blue-700 transition">
                    {g.name}
                  </h3>
                  <p className="text-xs text-ink-500 mt-1">
                    Shared group expenses between {g.members.length} members.
                  </p>
                </div>
                <div className="pt-2 border-t border-ink-100 flex items-center justify-between text-xs text-ink-500">
                  <span>Owner: {g.owner.name}</span>
                  <span className="font-semibold text-blue-600">Active</span>
                </div>
              </div>
            </div>
          ))}

          {/* Custom Dashboards */}
          {customDashboards.map((dash) => {
            const metrics = getCustomDashboardMetrics(dash);
            return (
              <div
                key={dash.id}
                onClick={() => setSelectedDashboard(dash)}
                className="cash-card relative overflow-hidden p-6 cursor-pointer hover:-translate-y-1 hover:shadow-lg transition-all duration-300 border border-ink-150 group text-left"
              >
                <button
                  type="button"
                  onClick={(e) => handleDeleteDashboard(dash.id, e)}
                  className="absolute top-4 right-4 p-1 rounded-md text-ink-300 hover:text-red-600 hover:bg-red-50 transition z-10 opacity-0 group-hover:opacity-100"
                  title="Delete Custom Dashboard"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
                <div className="absolute top-0 right-0 h-24 w-24 translate-x-6 -translate-y-6 rounded-full bg-amber-50/50 group-hover:scale-110 transition-transform duration-300" />
                <div className="relative space-y-4">
                  <div className="inline-flex rounded-xl bg-amber-100 p-2.5 text-amber-800">
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
                      />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-ink-900 group-hover:text-amber-700 transition">
                      {dash.name}
                    </h3>
                    <p className="text-xs text-ink-500 mt-1 line-clamp-2">
                      Filtered by:{' '}
                      {dash.categories?.length ? `${dash.categories.length} category(ies)` : ''}{' '}
                      {dash.categories?.length && dash.tags?.length ? 'and' : ''}{' '}
                      {dash.tags?.length ? `${dash.tags.length} tag(s)` : ''}.
                    </p>
                  </div>
                  <div className="pt-2 border-t border-ink-100 flex items-center justify-between text-xs font-semibold text-ink-600">
                    <span>Spent: {formatCurrency(metrics.totalOut)}</span>
                    <span className="text-emerald-600">Income: {formatCurrency(metrics.totalIn)}</span>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Create Custom Dashboard Button Card */}
          <div
            onClick={() => setIsCreateDashboardOpen(true)}
            className="relative p-6 cursor-pointer rounded-3xl border-2 border-dashed border-ink-200 hover:border-brand-500 bg-ink-50/20 hover:bg-brand-50/10 flex flex-col items-center justify-center text-center gap-3 transition-all duration-300 min-h-[180px]"
          >
            <div className="rounded-full bg-ink-100 p-3 text-ink-500">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold text-ink-900">Create Custom Dashboard</p>
              <p className="text-xs text-ink-500 mt-1">
                Filter widgets by custom category or tag lists.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderCreateDashboardModal = () => {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/60 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="cash-card max-w-lg w-full p-6 bg-white animate-in zoom-in duration-200 max-h-[85vh] flex flex-col overflow-hidden shadow-2xl">
          <div className="mb-4 flex items-center justify-between border-b border-ink-100 pb-4 shrink-0">
            <div>
              <h3 className="text-xl font-semibold text-ink-900">Create Custom Dashboard</h3>
              <p className="text-xs text-ink-500 mt-1">Filter your analytics page by specific criteria.</p>
            </div>
            <button
              type="button"
              className="rounded-full p-2 text-ink-500 hover:bg-ink-100 transition"
              onClick={() => {
                setIsCreateDashboardOpen(false);
                setNewDashboardName('');
                setNewDashboardCats([]);
                setNewDashboardTags([]);
              }}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <form
            onSubmit={handleCreateDashboard}
            className="flex-1 flex flex-col overflow-hidden space-y-4"
          >
            <div className="flex-1 overflow-y-auto space-y-4 pr-1 text-left">
              {/* Dashboard Name */}
              <div>
                <label className="cash-label" htmlFor="dashName">
                  Dashboard Name
                </label>
                <input
                  id="dashName"
                  className="cash-input"
                  type="text"
                  placeholder="e.g., Grocery & Shopping, Travel Expenses"
                  value={newDashboardName}
                  onChange={(e) => setNewDashboardName(e.target.value)}
                  required
                />
              </div>

              {/* Categories Selector */}
              <div>
                <label className="cash-label mb-2 block">
                  Filter by Categories (Select all that apply)
                </label>
                {allCategories.length === 0 ? (
                  <p className="text-xs text-ink-400">
                    No categories found. Add some transactions first!
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto border border-ink-200 rounded-2xl p-3 bg-ink-50/30">
                    {allCategories.map((cat) => {
                      const isChecked = newDashboardCats.includes(cat);
                      return (
                        <label
                          key={cat}
                          className="flex items-center gap-2 text-xs text-ink-700 font-medium cursor-pointer hover:text-brand-700 transition"
                        >
                          <input
                            type="checkbox"
                            className="rounded border-ink-300 text-brand-600 focus:ring-brand-500"
                            checked={isChecked}
                            onChange={() => {
                              if (isChecked) {
                                setNewDashboardCats(newDashboardCats.filter((c) => c !== cat));
                              } else {
                                setNewDashboardCats([...newDashboardCats, cat]);
                              }
                            }}
                          />
                          <span>{cat}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Tags Selector */}
              <div>
                <label className="cash-label mb-2 block font-semibold text-ink-600">
                  Filter by Tags (Select all that apply)
                </label>
                {allTags.length === 0 ? (
                  <p className="text-xs text-ink-400 font-medium">
                    No tags found. Tag your transactions first!
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto border border-ink-200 rounded-2xl p-3 bg-ink-50/30">
                    {allTags.map((tag) => {
                      const isChecked = newDashboardTags.includes(tag);
                      return (
                        <label
                          key={tag}
                          className="flex items-center gap-2 text-xs text-ink-700 font-medium cursor-pointer hover:text-brand-700 transition"
                        >
                          <input
                            type="checkbox"
                            className="rounded border-ink-300 text-brand-600 focus:ring-brand-500"
                            checked={isChecked}
                            onChange={() => {
                              if (isChecked) {
                                setNewDashboardTags(newDashboardTags.filter((t) => t !== tag));
                              } else {
                                setNewDashboardTags([...newDashboardTags, tag]);
                              }
                            }}
                          />
                          <span>{tag}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="border-t border-ink-100 pt-4 flex gap-3 shrink-0">
              <button
                type="submit"
                className="cash-button-primary flex-1 py-2.5 rounded-xl text-xs font-semibold"
              >
                Create Dashboard
              </button>
              <button
                type="button"
                className="cash-button-secondary py-2.5 rounded-xl text-xs font-semibold"
                onClick={() => {
                  setIsCreateDashboardOpen(false);
                  setNewDashboardName('');
                  setNewDashboardCats([]);
                  setNewDashboardTags([]);
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  if (pathname !== '/dashboard') return null;

  if (selectedDashboard === null) {
    return (
      <>
        {renderDashboardSelector()}
        {isCreateDashboardOpen && renderCreateDashboardModal()}
      </>
    );
  }

  return (
    <header className="cash-card relative overflow-hidden p-6 sm:p-8 animate-in fade-in duration-200">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(23,166,107,0.18),transparent_35%)]" />
      <div className="relative flex flex-col gap-4">
        <button
          onClick={() => setSelectedDashboard(null)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:text-brand-900 transition self-start"
        >
          ← Back to Dashboards
        </button>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl space-y-2">
            <p className="inline-flex rounded-full border border-brand-200 bg-white/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-brand-700">
              {selectedDashboard.type} dashboard
            </p>
            <h1 className="font-display text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
              {selectedDashboard.name}
            </h1>
            {selectedDashboard.type === 'custom' && (
              <p className="text-xs text-ink-500 font-medium">
                {selectedDashboard.categories?.length
                  ? `Categories: [${selectedDashboard.categories.join(', ')}] `
                  : ''}
                {selectedDashboard.categories?.length && selectedDashboard.tags?.length
                  ? '| '
                  : ''}
                {selectedDashboard.tags?.length
                  ? `Tags: [${selectedDashboard.tags.join(', ')}]`
                  : ''}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              className="cash-button-secondary py-2 text-xs"
              type="button"
              onClick={() => {
                if (selectedDashboard.type === 'group') {
                  void loadGroupExpenses(selectedDashboard.id);
                } else {
                  void loadExpenses();
                }
              }}
            >
              Refresh
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
