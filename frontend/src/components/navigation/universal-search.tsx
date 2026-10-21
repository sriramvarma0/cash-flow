'use client';

import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { fetchExpenses, fetchInvestments, fetchGroups, fetchCurrentUser, Group } from '../../lib/api';
import { AuthUser, Expense, Investment } from '../../lib/types';
import { formatCurrency, getDisplayTrackingId } from '../../lib/finance';

export interface SearchResultItem {
  id: string;
  type: 'PAGE' | 'ACTION' | 'EXPENSE' | 'INCOME' | 'INVESTMENT' | 'GROUP';
  groupKey: 'Pages & Actions' | 'Transactions & Income' | 'Investments' | 'Groups';
  title: string;
  subtitle?: string;
  badge?: string;
  amount?: string;
  url?: string;
  onSelect?: () => void;
}

const STATIC_PAGES: SearchResultItem[] = [
  { id: 'page-dashboard', type: 'PAGE', groupKey: 'Pages & Actions', title: 'Dashboard', subtitle: 'Overview, analytics & summaries', url: '/dashboard', badge: 'Page' },
  { id: 'page-expenses', type: 'PAGE', groupKey: 'Pages & Actions', title: 'Expenses & Transactions', subtitle: 'Manage expenses & spending', url: '/expenses', badge: 'Page' },
  { id: 'page-income', type: 'PAGE', groupKey: 'Pages & Actions', title: 'Income Tracker', subtitle: 'Earnings, salary & recurring income', url: '/income', badge: 'Page' },
  { id: 'page-budget', type: 'PAGE', groupKey: 'Pages & Actions', title: 'Budget Management', subtitle: 'Category limits, burn rates & pacing alerts', url: '/budget', badge: 'Page' },
  { id: 'page-investments', type: 'PAGE', groupKey: 'Pages & Actions', title: 'Investments Portfolio', subtitle: 'Stocks, mutual funds & holdings', url: '/investments', badge: 'Page' },
  { id: 'page-groups', type: 'PAGE', groupKey: 'Pages & Actions', title: 'Groups & Shared Expenses', subtitle: 'Split bills & group balances', url: '/groups', badge: 'Page' },
  { id: 'page-settings', type: 'PAGE', groupKey: 'Pages & Actions', title: 'Settings', subtitle: 'Profile & system preferences', url: '/settings', badge: 'Page' },
];

const QUICK_ACTIONS: SearchResultItem[] = [
  { id: 'act-add-expense', type: 'ACTION', groupKey: 'Pages & Actions', title: 'Add New Expense', subtitle: 'Record an expense or payment', url: '/expenses?action=new', badge: 'Action' },
  { id: 'act-add-income', type: 'ACTION', groupKey: 'Pages & Actions', title: 'Add Income Entry', subtitle: 'Log a new income stream', url: '/income?action=new', badge: 'Action' },
  { id: 'act-add-budget', type: 'ACTION', groupKey: 'Pages & Actions', title: 'Set Category Budget', subtitle: 'Configure spending caps & alerts', url: '/budget?action=new', badge: 'Action' },
  { id: 'act-add-investment', type: 'ACTION', groupKey: 'Pages & Actions', title: 'Add Investment', subtitle: 'Record stock, MF, or asset purchase', url: '/investments?action=new', badge: 'Action' },
  { id: 'act-create-group', type: 'ACTION', groupKey: 'Pages & Actions', title: 'Create Shared Group', subtitle: 'Start a group to split expenses', url: '/groups?action=new', badge: 'Action' },
];

export function UniversalSearch() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Loaded Data for Global Searching
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // OS detection for keyboard shortcut prompt
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    setIsMac(typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform));
  }, []);

  // Fetch search data when dropdown opens
  const loadSearchData = useCallback(async () => {
    if (dataLoaded || loadingData) return;
    setLoadingData(true);
    try {
      const [expData, invData, grpData, userProfile] = await Promise.all([
        fetchExpenses().catch(() => []),
        fetchInvestments().catch(() => []),
        fetchGroups().catch(() => []),
        fetchCurrentUser().catch(() => null)
      ]);
      setExpenses(expData);
      setInvestments(invData);
      setGroups(grpData);
      setCurrentUser(userProfile);
      setDataLoaded(true);
    } catch (err) {
      console.error('Failed to pre-load universal search index:', err);
    } finally {
      setLoadingData(false);
    }
  }, [dataLoaded, loadingData]);

  const handleOpen = () => {
    setIsOpen(true);
    void loadSearchData();
  };

  const handleClose = () => {
    setIsOpen(false);
    setSelectedIndex(0);
  };

  // Keyboard shortcut listener (Cmd+K or Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOpen((prev) => {
          if (!prev) {
            void loadSearchData();
            setTimeout(() => inputRef.current?.focus(), 50);
            return true;
          }
          return false;
        });
      } else if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, loadSearchData]);

  // Compute Flat Search Results List
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return [...QUICK_ACTIONS, ...STATIC_PAGES];
    }

    const items: SearchResultItem[] = [];

    // 1. Pages
    STATIC_PAGES.forEach((page) => {
      if (page.title.toLowerCase().includes(q) || page.subtitle?.toLowerCase().includes(q)) {
        items.push(page);
      }
    });

    // 2. Quick Actions
    QUICK_ACTIONS.forEach((act) => {
      if (act.title.toLowerCase().includes(q) || act.subtitle?.toLowerCase().includes(q)) {
        items.push(act);
      }
    });

    // 3. Expenses / Transactions
    expenses.forEach((exp) => {
      const desc = exp.description || '';
      const cat = exp.category || '';
      const method = exp.paymentMethod || '';
      const amtStr = exp.amount.toString();
      const tags = (exp.tags || []).map((t: any) => typeof t === 'string' ? t : t.name).join(' ');
      const isTransfer = exp.transactionType === 'TRANSFER';
      const isIncomingTransfer = isTransfer && currentUser?.id && exp.toUserId === currentUser.id;
      const isOutgoingTransfer = isTransfer && currentUser?.id && exp.userId === currentUser.id;
      const displayId = getDisplayTrackingId(exp, currentUser?.id);
      const toUserName = exp.toUser?.name || '';
      const fromUserName = exp.user?.name || '';
      const isIncome = exp.transactionType === 'INCOME' || isIncomingTransfer;

      if (
        (exp.id && exp.id.toLowerCase().includes(q)) ||
        (displayId && displayId.toLowerCase().includes(q)) ||
        desc.toLowerCase().includes(q) ||
        cat.toLowerCase().includes(q) ||
        method.toLowerCase().includes(q) ||
        amtStr.includes(q) ||
        tags.toLowerCase().includes(q) ||
        toUserName.toLowerCase().includes(q) ||
        fromUserName.toLowerCase().includes(q)
      ) {
        let itemTitle = desc || cat || (isIncome ? 'Income Entry' : 'Expense Entry');
        let itemBadge = isIncome ? 'Income' : 'Expense';
        let itemUrl = isIncome ? '/income' : '/expenses';
        let itemType: 'INCOME' | 'EXPENSE' = isIncome ? 'INCOME' : 'EXPENSE';

        if (isOutgoingTransfer) {
          itemTitle = `Transfer to ${exp.toUser?.name || 'User'}${desc && desc.toLowerCase() !== 'transfer' ? ` (${desc})` : ''}`;
          itemBadge = 'Transfer (TE)';
          itemUrl = '/expenses';
        } else if (isIncomingTransfer) {
          itemTitle = `Transfer from ${exp.user?.name || 'User'}${desc && desc.toLowerCase() !== 'transfer' ? ` (${desc})` : ''}`;
          itemBadge = 'Transfer (TI)';
          itemUrl = '/income';
        } else if (isTransfer) {
          itemBadge = 'Transfer';
        }

        items.push({
          id: `exp-${exp.id}`,
          type: itemType,
          groupKey: 'Transactions & Income',
          title: itemTitle,
          subtitle: `[${displayId}] ${cat ? `${cat} • ` : ''}${new Date(exp.date).toLocaleDateString()} ${method ? `(${method})` : ''}`,
          amount: `${isIncome ? '+' : '-'}${formatCurrency(exp.amount)}`,
          badge: itemBadge,
          url: itemUrl
        });
      }
    });

    // 4. Investments & Investment Transactions
    investments.forEach((inv) => {
      const code = inv.code || '';
      const name = inv.name || '';
      const type = inv.type || '';
      const currentVal = inv.units * inv.buyPrice;

      if (
        code.toLowerCase().includes(q) ||
        name.toLowerCase().includes(q) ||
        type.toLowerCase().includes(q) ||
        (inv.id && inv.id.toLowerCase().includes(q))
      ) {
        items.push({
          id: `inv-${inv.id}`,
          type: 'INVESTMENT',
          groupKey: 'Investments',
          title: `${code.toUpperCase()} • ${name || type}`,
          subtitle: `[${inv.id}] ${inv.units} units @ ${formatCurrency(inv.buyPrice)}`,
          amount: formatCurrency(currentVal),
          badge: 'Asset (A)',
          url: `/investments/${code.toLowerCase()}`
        });
      }

      // Search transactions of this investment by PB/PS tracking ID
      if (inv.transactions) {
        inv.transactions.forEach((tx) => {
          if (tx.id.toLowerCase().includes(q)) {
            items.push({
              id: `inv-tx-${tx.id}`,
              type: 'INVESTMENT',
              groupKey: 'Investments',
              title: `${tx.type === 'BUY' ? 'Buy Order' : 'Sell Order'} - ${code.toUpperCase()}`,
              subtitle: `[${tx.id}] ${tx.units} units @ ${formatCurrency(tx.price)}`,
              amount: formatCurrency(tx.amount),
              badge: tx.type === 'BUY' ? 'Buy (PB)' : 'Sell (PS)',
              url: `/investments/${code.toLowerCase()}`
            });
          }
        });
      }
    });

    // 5. Groups & Members
    groups.forEach((grp) => {
      const name = grp.name || '';
      const owner = grp.owner?.name || '';
      const ownerId = grp.ownerId || '';
      const members = grp.members ? grp.members.map((m) => `${m.name} ${m.id} ${m.email}`).join(' ') : '';

      if (
        (grp.id && grp.id.toLowerCase().includes(q)) ||
        name.toLowerCase().includes(q) ||
        owner.toLowerCase().includes(q) ||
        ownerId.includes(q) ||
        members.toLowerCase().includes(q)
      ) {
        items.push({
          id: `grp-${grp.id}`,
          type: 'GROUP',
          groupKey: 'Groups',
          title: name,
          subtitle: `[${grp.id}] Owner: ${owner} (ID: ${ownerId}) • ${grp.members?.length || 1} members`,
          badge: 'Group (G)',
          url: '/groups'
        });
      }
    });

    return items;
  }, [query, expenses, investments, groups]);

  // Grouped results for account-dropdown styled layout
  const groupedResults = useMemo(() => {
    const groupsMap: Record<string, SearchResultItem[]> = {};
    results.forEach((item) => {
      if (!groupsMap[item.groupKey]) {
        groupsMap[item.groupKey] = [];
      }
      groupsMap[item.groupKey].push(item);
    });
    return groupsMap;
  }, [results]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleNavigate = (item: SearchResultItem) => {
    handleClose();
    if (item.onSelect) {
      item.onSelect();
    } else if (item.url) {
      router.push(item.url as any);
    }
  };

  const handleKeyDownInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[selectedIndex]) {
        handleNavigate(results[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      handleClose();
    }
  };

  const getItemIcon = (type: SearchResultItem['type']) => {
    switch (type) {
      case 'PAGE':
        return (
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-100 text-ink-700 border border-ink-200 shrink-0">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
        );
      case 'ACTION':
        return (
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800 border border-emerald-200 shrink-0">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          </div>
        );
      case 'EXPENSE':
        return (
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-100 text-red-700 border border-red-200 shrink-0">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
        );
      case 'INCOME':
        return (
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 border border-emerald-200 shrink-0">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        );
      case 'INVESTMENT':
        return (
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-100 text-purple-700 border border-purple-200 shrink-0">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
        );
      case 'GROUP':
        return (
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-700 border border-blue-200 shrink-0">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
        );
    }
  };

  let globalIndexCounter = -1;

  return (
    <div className="relative flex-1 max-w-md">
      {/* Desktop Search Input Field */}
      <div className="hidden md:flex items-center relative">
        <svg className="absolute left-3 w-4 h-4 text-ink-400 pointer-events-none z-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          ref={inputRef}
          type="search"
          value={query}
          onFocus={handleOpen}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!isOpen) handleOpen();
          }}
          onKeyDown={handleKeyDownInput}
          placeholder="Search transactions, holdings, groups, pages..."
          className="w-full bg-ink-50/60 hover:bg-ink-100/40 focus:bg-white border border-ink-150 focus:border-brand-500 rounded-xl py-1.5 pl-9 pr-12 text-xs text-ink-900 focus:outline-none transition-all placeholder-ink-400 shadow-2xs"
        />
        <kbd className="absolute right-2.5 hidden sm:inline-flex items-center gap-0.5 rounded border border-ink-200 bg-white px-1.5 text-[9.5px] font-medium text-ink-400 pointer-events-none">
          <span>{isMac ? '⌘' : 'Ctrl+'}</span>K
        </kbd>
      </div>

      {/* Mobile Search Button */}
      <button
        type="button"
        onClick={handleOpen}
        className="md:hidden p-2 rounded-xl text-ink-600 hover:text-ink-900 hover:bg-ink-100/50 transition focus:outline-none"
        aria-label="Universal Search"
      >
        <svg className="w-5 h-5 text-ink-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </button>

      {/* Search Dropdown Card - Matching Account & Notification Dropdown UI */}
      {isOpen && (
        <>
          {/* Invisible Backdrop (Closes on outside click, matching Account Dropdown) */}
          <div className="fixed inset-0 z-40" onClick={handleClose} />

          {/* Dropdown Card */}
          <div
            ref={dropdownRef}
            className="absolute left-0 top-full mt-2.5 w-full min-w-[320px] sm:min-w-[440px] md:min-w-[480px] rounded-2xl border border-ink-100 bg-white p-4 shadow-2xl z-50 animate-in fade-in slide-in-from-top-2 duration-150 text-left space-y-3"
          >
            {/* Mobile Search Input (Visible on small screens inside dropdown) */}
            <div className="md:hidden relative">
              <svg className="absolute left-3 top-2.5 w-4 h-4 text-ink-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDownInput}
                autoFocus
                placeholder="Search everything..."
                className="w-full bg-ink-50/70 border border-ink-150 rounded-xl py-1.5 pl-9 pr-3 text-xs text-ink-900 focus:outline-none focus:border-brand-500"
              />
            </div>

            {/* Loading Skeleton Animation */}
            {loadingData ? (
              <div className="space-y-3 py-1">
                <div className="flex items-center gap-3 p-2 rounded-xl border border-ink-50">
                  <div className="h-8 w-8 rounded-lg bg-ink-100 animate-pulse shrink-0" />
                  <div className="space-y-1.5 flex-1">
                    <div className="h-3 w-32 bg-ink-100 rounded animate-pulse" />
                    <div className="h-2 w-48 bg-ink-100 rounded animate-pulse" />
                  </div>
                </div>
                <div className="flex items-center gap-3 p-2 rounded-xl border border-ink-50">
                  <div className="h-8 w-8 rounded-lg bg-ink-100 animate-pulse shrink-0" />
                  <div className="space-y-1.5 flex-1">
                    <div className="h-3 w-24 bg-ink-100 rounded animate-pulse" />
                    <div className="h-2 w-40 bg-ink-100 rounded animate-pulse" />
                  </div>
                </div>
              </div>
            ) : (
              /* Results Grouped List */
              <div className="space-y-4 max-h-80 overflow-y-auto pr-1">
                {results.length === 0 ? (
                  <div className="py-8 text-center text-xs text-ink-400">
                    <p>No results found for "<span className="font-semibold text-ink-700">{query}</span>"</p>
                  </div>
                ) : (
                Object.entries(groupedResults).map(([groupTitle, groupItems]) => (
                  <div key={groupTitle} className="space-y-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-400 text-left px-1 mb-1">
                      {groupTitle}
                    </p>
                    <div className="space-y-1">
                      {groupItems.map((item) => {
                        globalIndexCounter++;
                        const itemIdx = globalIndexCounter;
                        const isSelected = itemIdx === selectedIndex;

                        return (
                          <div
                            key={item.id}
                            onClick={() => handleNavigate(item)}
                            onMouseEnter={() => setSelectedIndex(itemIdx)}
                            className={`group flex items-center justify-between p-2 rounded-xl cursor-pointer transition text-left ${
                              isSelected ? 'bg-brand-50/70 border border-brand-100 text-brand-950' : 'hover:bg-ink-50 text-ink-900'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0 pr-2">
                              {getItemIcon(item.type)}
                              <div className="text-left min-w-0">
                                <p className="text-xs font-semibold text-ink-900 leading-tight truncate">{item.title}</p>
                                {item.subtitle && (
                                  <p className="text-xxs text-ink-500 leading-tight truncate mt-0.5">{item.subtitle}</p>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {item.amount && (
                                <span className={`text-xs font-semibold ${item.type === 'INCOME' ? 'text-emerald-600' : item.type === 'EXPENSE' ? 'text-ink-900' : 'text-purple-700'}`}>
                                  {item.amount}
                                </span>
                              )}
                              {item.badge && (
                                <span className="text-[9px] font-semibold px-2 py-0.5 rounded-md bg-ink-100 text-ink-600 border border-ink-200">
                                  {item.badge}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
              </div>
            )}

          </div>
        </>
      )}
    </div>
  );
}
