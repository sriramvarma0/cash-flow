'use client';

import { useEffect, useState, useMemo, useRef, Suspense } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { formatCurrency } from '../../../../lib/finance';
import {
  fetchInvestments,
  fetchExpenses,
  fetchInvestmentTransactions,
  recordInvestmentTransaction,
  updateInvestmentTransaction,
  deleteInvestmentTransaction,
  deleteInvestmentAsset
} from '../../../../lib/api';
import { Expense, Investment, InvestmentTransaction } from '../../../../lib/types';

function AssetDetailsContent() {
  const router = useRouter();
  const params = useParams();
  const code = (params?.code as string)?.toUpperCase() || '';

  const [holding, setHolding] = useState<Investment | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [invTransactions, setInvTransactions] = useState<InvestmentTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Trade Modal State (Buy / Sell)
  const [isTradeOpen, setIsTradeOpen] = useState(false);
  const [tradeType, setTradeType] = useState<'BUY' | 'SELL'>('BUY');
  const [tradeUnits, setTradeUnits] = useState('');
  const [tradePrice, setTradePrice] = useState('');
  const [tradeSaving, setTradeSaving] = useState(false);

  // Manage Asset Dropdown & Delete Asset Modal States
  const [isManageMenuOpen, setIsManageMenuOpen] = useState(false);
  const manageMenuRef = useRef<HTMLDivElement>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [isDeletingAsset, setIsDeletingAsset] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Close manage menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (manageMenuRef.current && !manageMenuRef.current.contains(event.target as Node)) {
        setIsManageMenuOpen(false);
      }
    }
    if (isManageMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isManageMenuOpen]);

  // Edit Transaction Modal State
  const [editingTx, setEditingTx] = useState<{
    id: string;
    type: 'BUY' | 'SELL';
    units: string;
    price: string;
    date: string;
  } | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [deletingTxId, setDeletingTxId] = useState<string | null>(null);

  useEffect(() => {
    async function loadAsset() {
      try {
        const [invData, expData, txData] = await Promise.all([
          fetchInvestments(),
          fetchExpenses().catch(() => []),
          fetchInvestmentTransactions(code).catch(() => [])
        ]);
        const found = invData.find((h: Investment) => h.code.toUpperCase() === code);
        if (found) {
          setHolding(found);
          setExpenses(expData);
          setInvTransactions(txData || []);
        } else {
          setError(`Investment holding with code "${code}" could not be found in your portfolio.`);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to retrieve asset details');
      } finally {
        setLoading(false);
      }
    }
    if (code) {
      void loadAsset();
    }
  }, [code]);

  const relatedTransactions = useMemo(() => {
    if (!holding) return [];

    const items: Array<{
      id: string;
      date: string;
      type: string;
      description: string;
      category?: string;
      paymentMethod?: string;
      unitDetails?: string;
      amount: number;
      isInvestmentTx?: boolean;
      units?: number;
      price?: number;
    }> = [];

    // 1. Transactions from database (InvestmentTransaction)
    if (invTransactions && invTransactions.length > 0) {
      invTransactions.forEach((tx) => {
        items.push({
          id: tx.id, // PB... or PS...
          date: tx.date,
          type: tx.type === 'BUY' ? 'BUY' : 'SELL',
          description: `${tx.type === 'BUY' ? 'Bought' : 'Sold'} ${tx.units} units of ${holding.name} (${holding.code})`,
          category: holding.type,
          paymentMethod: 'Portfolio Asset',
          unitDetails: `${tx.units} units @ ${formatCurrency(tx.price)}`,
          amount: tx.amount,
          isInvestmentTx: true,
          units: tx.units,
          price: tx.price
        });
      });
    }

    // 2. Matching user transactions mentioning asset code or name in expenses
    expenses.forEach((exp) => {
      const desc = (exp.description || '').toLowerCase();
      const cat = (exp.category || '').toLowerCase();
      const codeMatch = code.toLowerCase();
      const nameMatch = holding.name.toLowerCase();

      if (
        desc.includes(codeMatch) ||
        desc.includes(nameMatch) ||
        cat.includes(codeMatch) ||
        cat.includes(nameMatch)
      ) {
        items.push({
          id: exp.id,
          date: exp.date,
          type: exp.transactionType || 'EXPENSE',
          description: exp.description || exp.category || 'Asset Transaction',
          category: exp.category || undefined,
          paymentMethod: exp.paymentMethod || undefined,
          amount: exp.amount,
          isInvestmentTx: false
        });
      }
    });

    // Sort by date descending
    return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [holding, invTransactions, expenses, code]);

  const handleExecuteTrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!holding) return;

    const units = Number(tradeUnits);
    const price = Number(tradePrice);

    if (!units || units <= 0 || !price || price <= 0) {
      alert('Please enter a valid quantity of units and price.');
      return;
    }

    if (tradeType === 'SELL' && units > holding.units) {
      alert(`Cannot sell ${units} units. You currently own ${holding.units} units.`);
      return;
    }

    setTradeSaving(true);
    try {
      const result = await recordInvestmentTransaction(code, {
        type: tradeType,
        units,
        price,
        date: new Date().toISOString()
      });

      // Update holding state with new units & cost basis
      setHolding(result.investment);
      // Prepend newly created transaction
      setInvTransactions((prev) => [result.transaction, ...prev]);

      setIsTradeOpen(false);
      setTradeUnits('');
      setTradePrice('');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to execute trade.');
    } finally {
      setTradeSaving(false);
    }
  };

  const handleEditTransactionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTx || !holding) return;

    const units = Number(editingTx.units);
    const price = Number(editingTx.price);

    if (!units || units <= 0 || !price || price <= 0) {
      alert('Please enter a valid quantity of units and price.');
      return;
    }

    setEditSaving(true);
    try {
      const result = await updateInvestmentTransaction(editingTx.id, {
        type: editingTx.type,
        units,
        price,
        date: editingTx.date ? new Date(editingTx.date).toISOString() : undefined
      });

      // Update holding with recalculated investment values (units, buyPrice, etc.)
      setHolding((prev) => (prev ? { ...prev, ...result.investment } : result.investment));

      // Update transaction in invTransactions list
      setInvTransactions((prev) =>
        prev.map((t) => (t.id === editingTx.id ? result.transaction : t))
      );

      setEditingTx(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update transaction.');
    } finally {
      setEditSaving(false);
    }
  };

  const handleDeleteTransaction = async (id: string) => {
    if (!holding) return;
    const ok = confirm(
      `Delete transaction "${id}"?\n\nThe asset holding "${holding.name} (${holding.code})" will NOT be deleted. Its units and portfolio values will be automatically recalculated.`
    );
    if (!ok) return;

    setDeletingTxId(id);
    try {
      const result = await deleteInvestmentTransaction(id);

      // Update holding with recalculated investment values
      if (result.investment) {
        setHolding((prev) => (prev ? { ...prev, ...result.investment } : result.investment));
      }

      // Remove transaction from local invTransactions
      setInvTransactions((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete transaction.');
    } finally {
      setDeletingTxId(null);
    }
  };

  const handleDeleteAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!holding) return;
    if (!deletePassword) {
      setDeleteError('Please enter your account password to confirm deletion.');
      return;
    }

    setIsDeletingAsset(true);
    setDeleteError('');

    try {
      await deleteInvestmentAsset(holding.code, deletePassword);
      setIsDeleteModalOpen(false);
      alert(`Asset "${holding.name} (${holding.code})" and all associated transactions have been permanently deleted.`);
      router.push('/investments');
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete asset holding.');
    } finally {
      setIsDeletingAsset(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen px-4 py-8 sm:px-6 lg:px-8 bg-ink-50">
        <div className="mx-auto max-w-7xl space-y-6 text-left">
          <div className="h-6 w-36 bg-ink-150 rounded animate-pulse" />
          <div className="h-10 w-64 bg-ink-150 rounded animate-pulse" />
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

  if (error || !holding) {
    return (
      <div className="min-h-screen px-4 py-8 sm:px-6 lg:px-8 bg-ink-50 text-left">
        <div className="mx-auto max-w-7xl space-y-6">
          <Link href="/investments" className="text-xs font-semibold text-brand-700 hover:text-brand-900 transition flex items-center gap-1.5">
            <span>← Back to Investments</span>
          </Link>
          <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
            {error || 'Holding details not found.'}
          </div>
        </div>
      </div>
    );
  }

  const costBasis = holding.units * holding.buyPrice;
  const currentValuation = holding.units * holding.currentPrice;
  const returns = currentValuation - costBasis;
  const returnPercent = costBasis > 0 ? (returns / costBasis) * 100 : 0;
  const isPositive = returns >= 0;

  return (
    <div className="min-h-screen px-4 py-8 sm:px-6 lg:px-8 bg-ink-50 text-left animate-in fade-in duration-200">
      <div className="mx-auto max-w-7xl space-y-6">
        
        {/* Navigation Breadcrumb & Header */}
        <header className="space-y-3 border-b border-ink-100 pb-4">
          <Link
            href="/investments"
            className="text-xs font-semibold text-brand-700 hover:text-brand-900 transition inline-flex items-center gap-1.5"
          >
            <span>← Back to Investments Portfolio</span>
          </Link>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="w-4 h-4 rounded-full shrink-0 shadow-2xs" style={{ backgroundColor: holding.color }} />
                <h1 className="font-display text-4xl font-semibold tracking-tight text-ink-900">
                  {holding.name}
                </h1>
                <span className="text-xs font-mono font-bold bg-ink-100 text-ink-700 px-2 py-0.5 rounded-lg border border-ink-200">
                  {holding.code}
                </span>
                <span className="text-xs uppercase tracking-wider font-semibold text-brand-700 bg-brand-50 border border-brand-200 px-2.5 py-0.5 rounded-full">
                  {holding.type}
                </span>
                {holding.id && (
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(holding.id);
                      alert(`Asset Tracking ID "${holding.id}" copied to clipboard!`);
                    }}
                    title="Click to copy Asset Tracking ID (A + 9 chars)"
                    className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-200 transition font-mono text-xs font-bold shadow-2xs"
                  >
                    <span className="text-[10px] text-purple-600 font-extrabold">🏷️ Asset ID:</span>
                    <span>{holding.id}</span>
                    <span className="text-[10px] text-purple-400 opacity-70">📋</span>
                  </button>
                )}
              </div>
              <p className="text-sm text-ink-500">
                Detailed asset valuation, historical cost basis, returns yield, and transactions history.
              </p>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <button
                onClick={() => {
                  setTradeType('BUY');
                  setTradeUnits('');
                  setTradePrice(holding.currentPrice.toString());
                  setIsTradeOpen(true);
                }}
                className="cash-button-primary py-2.5 px-4 text-xs font-semibold flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 text-white shadow-2xs"
              >
                <span>⚡ Trade (Buy / Sell)</span>
              </button>

              {/* Manage Asset Menu (Three Dots / Manage Asset Dropdown) */}
              <div className="relative" ref={manageMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsManageMenuOpen((prev) => !prev)}
                  className={`inline-flex items-center gap-1.5 py-2.5 px-3 rounded-xl border text-xs font-semibold shadow-2xs transition ${
                    isManageMenuOpen
                      ? 'bg-ink-100 border-ink-300 text-ink-900'
                      : 'bg-white border-ink-200 hover:bg-ink-50 text-ink-700'
                  }`}
                  title="Manage Asset"
                  aria-expanded={isManageMenuOpen}
                >
                  <span className="hidden sm:inline">Manage Asset</span>
                  <svg className="w-4 h-4 text-ink-600" fill="currentColor" viewBox="0 0 24 24">
                    <circle cx="12" cy="5" r="1.75" />
                    <circle cx="12" cy="12" r="1.75" />
                    <circle cx="12" cy="19" r="1.75" />
                  </svg>
                </button>

                {isManageMenuOpen && (
                  <div className="absolute right-0 top-full mt-1.5 w-60 rounded-2xl border border-ink-150 bg-white py-1.5 shadow-xl z-30 animate-in fade-in zoom-in-95 duration-150 text-left">
                    <div className="px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-400 border-b border-ink-100 mb-1">
                      Manage Holding ({holding.code})
                    </div>
                    {holding.id && (
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(holding.id!);
                          alert(`Asset Tracking ID "${holding.id}" copied to clipboard!`);
                          setIsManageMenuOpen(false);
                        }}
                        className="w-full text-left px-3.5 py-2 text-xs font-medium text-ink-700 hover:bg-ink-50 flex items-center gap-2.5 transition"
                      >
                        <span className="text-sm">🏷️</span>
                        <div>
                          <div>Copy Tracking ID</div>
                          <div className="text-[10px] text-ink-400 font-mono">{holding.id}</div>
                        </div>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setIsManageMenuOpen(false);
                        setDeletePassword('');
                        setDeleteError('');
                        setIsDeleteModalOpen(true);
                      }}
                      className="w-full text-left px-3.5 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 flex items-center gap-2.5 transition"
                    >
                      <div className="w-7 h-7 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center text-xs shrink-0">
                        🗑️
                      </div>
                      <div>
                        <div className="font-bold text-rose-700">Delete Asset</div>
                        <div className="text-[10px] text-rose-600/80 font-normal">Requires password confirmation</div>
                      </div>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Portfolio Stats Row - 4 Card Grid matching Investments and Expenses UI */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-left">
          
          <article className="cash-card p-5 bg-white border border-ink-150 relative overflow-hidden">
            <p className="text-xs font-semibold text-ink-500">Current Valuation</p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-ink-900">
              {formatCurrency(currentValuation)}
            </p>
            <div className="mt-2 text-xs text-ink-400">
              {holding.units} units × {formatCurrency(holding.currentPrice)} live
            </div>
          </article>

          <article className="cash-card p-5 bg-white border border-ink-150 relative overflow-hidden">
            <p className="text-xs font-semibold text-ink-500">Total Returns</p>
            <p className={`mt-2 text-3xl font-bold tracking-tight ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
              {isPositive ? '+' : ''}{formatCurrency(returns)}
            </p>
            <div className={`mt-2 text-xs font-semibold ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
              {isPositive ? '▲' : '▼'} {Math.abs(returnPercent).toFixed(1)}% absolute return
            </div>
          </article>

          <article className="cash-card p-5 bg-white border border-ink-150 relative overflow-hidden">
            <p className="text-xs font-semibold text-ink-500">Total Cost Basis</p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-ink-900">
              {formatCurrency(costBasis)}
            </p>
            <div className="mt-2 text-xs text-ink-400">
              Invested capital at purchase
            </div>
          </article>

          <article className="cash-card p-5 bg-white border border-ink-150 relative overflow-hidden">
            <p className="text-xs font-semibold text-ink-500">Current Market Price</p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-brand-700">
              {formatCurrency(holding.currentPrice)}
            </p>
            <div className="mt-2 text-xs text-ink-400">
              Avg buy price: {formatCurrency(holding.buyPrice)}
            </div>
          </article>

        </section>

        {/* Detailed Insights & Ledger Breakdown */}
        <section className="grid gap-6 lg:grid-cols-3 text-left">
          
          {/* Key Fundamentals Card */}
          <div className="cash-card p-6 bg-white border border-ink-150 space-y-4">
            <h2 className="text-xl font-semibold text-ink-900 border-b border-ink-100 pb-3">Holding Metrics</h2>
            
            <div className="space-y-3.5 text-xs">
              <div className="flex justify-between items-center py-1 border-b border-ink-50">
                <span className="text-ink-500">Asset Class</span>
                <span className="font-semibold text-ink-900">{holding.type}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-ink-50">
                <span className="text-ink-500">Total Units Owned</span>
                <span className="font-semibold text-ink-900">{holding.units}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-ink-50">
                <span className="text-ink-500">Average Acquisition Price</span>
                <span className="font-semibold text-ink-900">{formatCurrency(holding.buyPrice)}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-ink-50">
                <span className="text-ink-500">Recorded Acquisition Date</span>
                <span className="font-semibold text-ink-900">
                  {new Date(holding.date).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                  })}
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-ink-50">
                <span className="text-ink-500">Annualized Dividend Yield</span>
                <span className="font-semibold text-emerald-700">{holding.dividendYield || 0}%</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-ink-50">
                <span className="text-ink-500">1Y Systematic Beta</span>
                <span className="font-semibold text-ink-900">{holding.beta || 1.0}</span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-ink-500">Performance Status</span>
                <span className={`font-bold ${isPositive ? 'text-emerald-700' : 'text-red-600'}`}>
                  {isPositive ? 'Outperforming Cost Basis' : 'Under Cost Basis'}
                </span>
              </div>
            </div>
          </div>

          {/* Asset Strategy & Notes */}
          <div className="cash-card p-6 bg-white border border-ink-150 space-y-4 lg:col-span-2 flex flex-col justify-between">
            <div>
              <h2 className="text-xl font-semibold text-ink-900 border-b border-ink-100 pb-3">Position Summary</h2>
              
              <div className="mt-4 grid gap-4 sm:grid-cols-2 text-xs">
                <div className="p-4 rounded-2xl bg-ink-50/70 border border-ink-150 space-y-2">
                  <p className="font-semibold text-ink-900">Break-Even & Valuation Pacing</p>
                  <p className="text-ink-600 leading-relaxed">
                    At current market price of <span className="font-semibold text-ink-900">{formatCurrency(holding.currentPrice)}</span>, 
                    this asset represents <span className="font-semibold text-ink-900">{formatCurrency(currentValuation)}</span> of portfolio assets.
                  </p>
                </div>
                
                <div className="p-4 rounded-2xl bg-ink-50/70 border border-ink-150 space-y-2">
                  <p className="font-semibold text-ink-900">Capital Gain Status</p>
                  <p className="text-ink-600 leading-relaxed">
                    {isPositive ? (
                      <span className="text-emerald-700 font-medium">
                        Unrealized profit of {formatCurrency(returns)} ({returnPercent.toFixed(1)}%).
                      </span>
                    ) : (
                      <span className="text-red-600 font-medium">
                        Unrealized loss of {formatCurrency(Math.abs(returns))} ({Math.abs(returnPercent).toFixed(1)}%).
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 space-y-3 pt-4 border-t border-ink-100">
              <div className="p-4 rounded-2xl bg-brand-50/30 border border-brand-100 text-xs text-brand-900 space-y-1.5">
                <p className="font-semibold flex items-center gap-1.5 text-brand-950">
                  <span>💡 Asset Management Note</span>
                </p>
                <p className="text-[11px] leading-relaxed text-ink-600">
                  Performance is calculated based on current market feed prices vs. your recorded average cost basis. Each buy and sell order receives a unique UUIDv7 tracking ID (PB for Buy, PS for Sell).
                </p>
              </div>
            </div>
          </div>

        </section>

        {/* Asset Transactions & Activity History Table */}
        <section className="cash-card p-6 bg-white border border-ink-150 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-ink-100 pb-4 gap-2">
            <div>
              <h2 className="text-xl font-semibold text-ink-900">Asset Transactions & Purchase History</h2>
              <p className="text-xs text-ink-500 mt-0.5">All recorded purchases, orders, and ledger transactions for {holding.name}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setTradeType('BUY');
                  setTradeUnits('');
                  setTradePrice(holding.currentPrice.toString());
                  setIsTradeOpen(true);
                }}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 transition"
              >
                + Buy Order (PB)
              </button>
              <button
                onClick={() => {
                  setTradeType('SELL');
                  setTradeUnits('');
                  setTradePrice(holding.currentPrice.toString());
                  setIsTradeOpen(true);
                }}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 transition"
              >
                - Sell Order (PS)
              </button>
              <span className="text-xs font-semibold text-brand-700 bg-brand-50 border border-brand-200 px-3 py-1 rounded-full">
                {relatedTransactions.length} {relatedTransactions.length === 1 ? 'Transaction' : 'Transactions'}
              </span>
            </div>
          </div>

          {relatedTransactions.length === 0 ? (
            <div className="py-8 text-center text-xs text-ink-400">
              <p>No transaction records found for this asset.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-ink-100 text-left text-xs">
                <thead className="bg-ink-50 text-ink-500 font-medium">
                  <tr>
                    <th className="px-3.5 py-3 rounded-l-xl text-left">Tracking ID</th>
                    <th className="px-3.5 py-3 text-left">Transaction Date</th>
                    <th className="px-3.5 py-3 text-left">Action / Type</th>
                    <th className="px-3.5 py-3 text-left">Description</th>
                    <th className="px-3.5 py-3 text-left">Category / Method</th>
                    <th className="px-3.5 py-3 text-right">Units / Price</th>
                    <th className="px-3.5 py-3 text-right">Total Value</th>
                    <th className="px-3.5 py-3 text-right rounded-r-xl">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100 font-medium">
                  {relatedTransactions.map((tx) => {
                    const isBuy = tx.type === 'BUY' || tx.type.includes('BUY') || tx.id.startsWith('PB');
                    const isSell = tx.type === 'SELL' || tx.type.includes('SELL') || tx.id.startsWith('PS');

                    return (
                      <tr key={tx.id} className="hover:bg-ink-50/60 transition">
                        <td className="px-3.5 py-3.5 text-left font-mono text-xs">
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(tx.id);
                              alert(`Tracking ID "${tx.id}" copied to clipboard!`);
                            }}
                            title="Click to copy Tracking ID"
                            className={`inline-flex items-center gap-1 font-mono text-xs font-semibold px-2 py-0.5 rounded-md border transition-colors ${
                              isBuy
                                ? 'bg-purple-50 text-purple-700 border-purple-200/80 hover:bg-purple-100'
                                : isSell
                                ? 'bg-amber-50 text-amber-800 border-amber-200/80 hover:bg-amber-100'
                                : 'bg-ink-50 text-ink-700 border-ink-200 hover:bg-ink-100'
                            }`}
                          >
                            <span>{tx.id}</span>
                            <svg className="w-3 h-3 opacity-60 hover:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          </button>
                        </td>
                        <td className="px-3.5 py-3.5 text-ink-600 whitespace-nowrap">
                          {new Date(tx.date).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                        </td>
                        <td className="px-3.5 py-3.5">
                          <span className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full border ${
                            isBuy
                              ? 'bg-purple-50 text-purple-700 border-purple-200'
                              : isSell
                              ? 'bg-amber-50 text-amber-800 border-amber-200'
                              : 'bg-ink-50 text-ink-700 border-ink-200'
                          }`}>
                            {tx.type}
                          </span>
                        </td>
                        <td className="px-3.5 py-3.5 text-ink-900 font-semibold">{tx.description}</td>
                        <td className="px-3.5 py-3.5 text-ink-500">{tx.category || 'Investment'} {tx.paymentMethod ? `• ${tx.paymentMethod}` : ''}</td>
                        <td className="px-3.5 py-3.5 text-right font-mono text-ink-700">{tx.unitDetails || '-'}</td>
                        <td className="px-3.5 py-3.5 text-right font-bold text-ink-900">{formatCurrency(tx.amount)}</td>
                        <td className="px-3.5 py-3.5 text-right whitespace-nowrap">
                          {tx.isInvestmentTx ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingTx({
                                    id: tx.id,
                                    type: (tx.type === 'SELL' ? 'SELL' : 'BUY') as 'BUY' | 'SELL',
                                    units: String(tx.units || ''),
                                    price: String(tx.price || ''),
                                    date: tx.date ? new Date(tx.date).toISOString().slice(0, 16) : ''
                                  });
                                }}
                                className="px-2.5 py-1 rounded-lg text-xs font-semibold text-ink-700 hover:text-brand-700 hover:bg-brand-50 border border-ink-200/80 transition"
                                title="Edit this transaction"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteTransaction(tx.id)}
                                disabled={deletingTxId === tx.id}
                                className="px-2.5 py-1 rounded-lg text-xs font-semibold text-rose-600 hover:text-rose-800 hover:bg-rose-50 border border-rose-100 transition disabled:opacity-50"
                                title="Delete this transaction (Asset holding will be kept)"
                              >
                                {deletingTxId === tx.id ? 'Deleting...' : 'Delete'}
                              </button>
                            </div>
                          ) : (
                            <span className="text-ink-300 text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

      </div>

      {/* Trade Modal: Buy (PB) or Sell (PS) */}
      {isTradeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="cash-card max-w-md w-full p-6 bg-white animate-in zoom-in duration-200 text-left">
            <div className="mb-4 flex items-center justify-between border-b border-ink-100 pb-4">
              <div>
                <h3 className="text-xl font-semibold text-ink-900">
                  {tradeType === 'BUY' ? '🟢 Buy More Units' : '🟠 Sell Asset Units'}
                </h3>
                <p className="text-xs text-ink-500">
                  {holding.name} ({holding.code}) • Will generate tracking ID ({tradeType === 'BUY' ? 'PB...' : 'PS...'})
                </p>
              </div>
              <button
                type="button"
                className="rounded-full p-2 text-ink-500 hover:bg-ink-100 transition"
                onClick={() => setIsTradeOpen(false)}
                disabled={tradeSaving}
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleExecuteTrade} className="space-y-4">
              {/* Order Type Toggle */}
              <div className="grid grid-cols-2 gap-2 p-1 bg-ink-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => setTradeType('BUY')}
                  className={`py-2 text-xs font-bold rounded-lg transition-all ${
                    tradeType === 'BUY' ? 'bg-white text-emerald-800 shadow-sm' : 'text-ink-600 hover:text-ink-900'
                  }`}
                >
                  Buy Order (PB)
                </button>
                <button
                  type="button"
                  onClick={() => setTradeType('SELL')}
                  className={`py-2 text-xs font-bold rounded-lg transition-all ${
                    tradeType === 'SELL' ? 'bg-white text-amber-800 shadow-sm' : 'text-ink-600 hover:text-ink-900'
                  }`}
                >
                  Sell Order (PS)
                </button>
              </div>

              <div>
                <label className="cash-label" htmlFor="tradeUnits">
                  Quantity (Units to {tradeType === 'BUY' ? 'Buy' : 'Sell'})
                </label>
                <input
                  id="tradeUnits"
                  type="number"
                  step="any"
                  placeholder="e.g. 10"
                  className="cash-input"
                  value={tradeUnits}
                  onChange={(e) => setTradeUnits(e.target.value)}
                  disabled={tradeSaving}
                  required
                />
                {tradeType === 'SELL' && (
                  <p className="mt-1 text-[11px] text-ink-500">Available: {holding.units} units</p>
                )}
              </div>

              <div>
                <label className="cash-label" htmlFor="tradePrice">
                  Price Per Unit ({holding.code})
                </label>
                <input
                  id="tradePrice"
                  type="number"
                  step="any"
                  placeholder="e.g. 150"
                  className="cash-input"
                  value={tradePrice}
                  onChange={(e) => setTradePrice(e.target.value)}
                  disabled={tradeSaving}
                  required
                />
              </div>

              {Number(tradeUnits) > 0 && Number(tradePrice) > 0 && (
                <div className="p-3 bg-ink-50 rounded-xl border border-ink-150 flex justify-between items-center text-xs">
                  <span className="text-ink-600">Total Order Value:</span>
                  <span className="font-bold text-ink-900 text-sm">
                    {formatCurrency(Number(tradeUnits) * Number(tradePrice))}
                  </span>
                </div>
              )}

              <div className="pt-2 flex justify-end gap-2 border-t border-ink-100">
                <button
                  type="button"
                  onClick={() => setIsTradeOpen(false)}
                  className="cash-button-secondary py-2 px-4 text-xs font-semibold"
                  disabled={tradeSaving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={tradeSaving}
                  className={`cash-button-primary py-2 px-4 text-xs font-semibold text-white ${
                    tradeType === 'BUY' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-amber-600 hover:bg-amber-700'
                  }`}
                >
                  {tradeSaving ? 'Executing...' : `Execute ${tradeType === 'BUY' ? 'Buy (PB...)' : 'Sell (PS...)'}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Transaction Modal: Buy (PB) or Sell (PS) */}
      {editingTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="cash-card max-w-md w-full p-6 bg-white animate-in zoom-in duration-200 text-left">
            <div className="mb-4 flex items-center justify-between border-b border-ink-100 pb-4">
              <div>
                <h3 className="text-xl font-semibold text-ink-900">
                  ✏️ Edit Transaction
                </h3>
                <p className="text-xs text-ink-500 font-mono">
                  {editingTx.id} • {holding.name} ({holding.code})
                </p>
              </div>
              <button
                type="button"
                className="rounded-full p-2 text-ink-500 hover:bg-ink-100 transition"
                onClick={() => setEditingTx(null)}
                disabled={editSaving}
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleEditTransactionSubmit} className="space-y-4">
              {/* Order Type Toggle */}
              <div className="grid grid-cols-2 gap-2 p-1 bg-ink-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => setEditingTx({ ...editingTx, type: 'BUY' })}
                  className={`py-2 text-xs font-bold rounded-lg transition-all ${
                    editingTx.type === 'BUY' ? 'bg-white text-emerald-800 shadow-sm' : 'text-ink-600 hover:text-ink-900'
                  }`}
                >
                  Buy Order (PB)
                </button>
                <button
                  type="button"
                  onClick={() => setEditingTx({ ...editingTx, type: 'SELL' })}
                  className={`py-2 text-xs font-bold rounded-lg transition-all ${
                    editingTx.type === 'SELL' ? 'bg-white text-amber-800 shadow-sm' : 'text-ink-600 hover:text-ink-900'
                  }`}
                >
                  Sell Order (PS)
                </button>
              </div>

              <div>
                <label className="cash-label" htmlFor="editTxUnits">
                  Quantity (Units)
                </label>
                <input
                  id="editTxUnits"
                  type="number"
                  step="any"
                  placeholder="e.g. 10"
                  className="cash-input"
                  value={editingTx.units}
                  onChange={(e) => setEditingTx({ ...editingTx, units: e.target.value })}
                  disabled={editSaving}
                  required
                />
              </div>

              <div>
                <label className="cash-label" htmlFor="editTxPrice">
                  Price Per Unit ({holding.code})
                </label>
                <input
                  id="editTxPrice"
                  type="number"
                  step="any"
                  placeholder="e.g. 150"
                  className="cash-input"
                  value={editingTx.price}
                  onChange={(e) => setEditingTx({ ...editingTx, price: e.target.value })}
                  disabled={editSaving}
                  required
                />
              </div>

              <div>
                <label className="cash-label" htmlFor="editTxDate">
                  Transaction Date & Time
                </label>
                <input
                  id="editTxDate"
                  type="datetime-local"
                  className="cash-input"
                  value={editingTx.date}
                  onChange={(e) => setEditingTx({ ...editingTx, date: e.target.value })}
                  disabled={editSaving}
                  required
                />
              </div>

              {Number(editingTx.units) > 0 && Number(editingTx.price) > 0 && (
                <div className="p-3 bg-ink-50 rounded-xl border border-ink-150 flex justify-between items-center text-xs">
                  <span className="text-ink-600">Total Value:</span>
                  <span className="font-bold text-ink-900 text-sm">
                    {formatCurrency(Number(editingTx.units) * Number(editingTx.price))}
                  </span>
                </div>
              )}

              <p className="text-[11px] text-ink-500 bg-brand-50/50 p-2.5 rounded-lg border border-brand-100">
                ℹ️ Saving changes will update this transaction and automatically recalculate the asset holding's units, average cost basis, and portfolio valuation.
              </p>

              <div className="pt-2 flex justify-end gap-2 border-t border-ink-100">
                <button
                  type="button"
                  onClick={() => setEditingTx(null)}
                  className="cash-button-secondary py-2 px-4 text-xs font-semibold"
                  disabled={editSaving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSaving}
                  className="cash-button-primary py-2 px-4 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700"
                >
                  {editSaving ? 'Updating...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Asset Confirmation & Password Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="cash-card max-w-md w-full p-6 bg-white animate-in zoom-in duration-200 text-left shadow-2xl border border-ink-150">
            <div className="mb-4 flex items-center justify-between border-b border-ink-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center text-lg shrink-0">
                  ⚠️
                </div>
                <div>
                  <h3 className="text-lg font-bold text-ink-900">Delete Asset Holding</h3>
                  <p className="text-xs text-ink-500 font-mono">
                    {holding.name} ({holding.code})
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="rounded-full p-2 text-ink-500 hover:bg-ink-100 transition"
                onClick={() => setIsDeleteModalOpen(false)}
                disabled={isDeletingAsset}
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleDeleteAsset} className="space-y-4">
              {/* Cascade Deletion Warning Banner */}
              <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-3.5 text-xs text-rose-900 space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-rose-800">
                  <span>🚨 Permanent Cascade Deletion</span>
                </div>
                <p className="text-[11px] leading-relaxed text-rose-700">
                  Deleting this asset will permanently remove <strong>{holding.name} ({holding.code})</strong> and <strong>ALL {relatedTransactions.length} recorded buy/sell transaction(s)</strong> associated with it. This action cannot be undone.
                </p>
              </div>

              {deleteError && (
                <div className="p-3 rounded-xl bg-rose-100 border border-rose-300 text-rose-800 text-xs font-semibold animate-in fade-in">
                  {deleteError}
                </div>
              )}

              {/* Password Input Field */}
              <div>
                <label className="cash-label" htmlFor="assetDeletePassword">
                  Enter Account Password to Confirm
                </label>
                <div className="relative">
                  <input
                    id="assetDeletePassword"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your account password"
                    className="cash-input pr-10 text-xs"
                    value={deletePassword}
                    onChange={(e) => {
                      setDeletePassword(e.target.value);
                      if (deleteError) setDeleteError('');
                    }}
                    disabled={isDeletingAsset}
                    required
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700 p-1 text-xs"
                    tabIndex={-1}
                  >
                    {showPassword ? '🙈' : '👁️'}
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-ink-500">
                  Your password is required to verify authorization before deleting portfolio assets.
                </p>
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-ink-100">
                <button
                  type="button"
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="cash-button-secondary py-2 px-4 text-xs font-semibold"
                  disabled={isDeletingAsset}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isDeletingAsset || !deletePassword}
                  className="cash-button-primary py-2 px-4 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isDeletingAsset ? (
                    <>
                      <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      <span>Deleting Asset...</span>
                    </>
                  ) : (
                    <span>Delete Asset & All Transactions</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

export default function AssetDetailsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen px-4 py-8 sm:px-6 lg:px-8 bg-ink-50">
        <div className="mx-auto max-w-7xl space-y-6">
          <div className="h-6 w-36 bg-ink-150 rounded animate-pulse" />
          <div className="h-10 w-64 bg-ink-150 rounded animate-pulse" />
        </div>
      </div>
    }>
      <AssetDetailsContent />
    </Suspense>
  );
}
