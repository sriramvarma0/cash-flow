'use client';

import { useEffect, useState, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { formatCurrency } from '../../../lib/finance';
import {
  fetchInvestments,
  createInvestment,
  fetchInvestmentTransactions
} from '../../../lib/api';
import { InvestmentTransaction } from '../../../lib/types';

interface Holding {
  id?: string;
  code: string;
  name: string;
  type: string;
  units: number;
  buyPrice: number;
  currentPrice: number;
  color: string;
  date: string;
  dividendYield?: number;
  beta?: number;
  transactions?: InvestmentTransaction[];
}

const assetColors = ['#0d533c', '#17a66b', '#3ecb8e', '#7fe0b5', '#a6bbbb', '#5b7676', '#3b82f6', '#f59e0b', '#ef4444'];

function getLocalDateTimeString() {
  const tzoffset = new Date().getTimezoneOffset() * 60000;
  return new Date(Date.now() - tzoffset).toISOString().slice(0, 16);
}

function InvestmentsContent() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [allTransactions, setAllTransactions] = useState<any[]>([]);
  const [txTypeFilter, setTxTypeFilter] = useState<'ALL' | 'BUY' | 'SELL'>('ALL');
  const [txAssetFilter, setTxAssetFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');

  // Form states
  const [type, setType] = useState('Stock');
  const [code, setCode] = useState('');
  const [units, setUnits] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [date, setDate] = useState(getLocalDateTimeString());

  // Fetch investments and all investment transactions from backend
  useEffect(() => {
    async function loadData() {
      try {
        const [data, txData] = await Promise.all([
          fetchInvestments(),
          fetchInvestmentTransactions().catch(() => [])
        ]);
        setHoldings(data);
        setAllTransactions(txData || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not fetch data');
      } finally {
        setLoading(false);
      }
    }
    void loadData();
  }, []);

  // Dynamically calculate metrics based on state
  const metrics = useMemo(() => {
    let totalCurrentValue = 0;
    let totalCostBasis = 0;

    const items = holdings.map((h) => {
      const value = h.units * h.currentPrice;
      const cost = h.units * h.buyPrice;
      const gain = value - cost;
      const returnPercent = cost > 0 ? (gain / cost) * 100 : 0;

      totalCurrentValue += value;
      totalCostBasis += cost;

      return {
        ...h,
        value,
        cost,
        returnPercent: Number(returnPercent.toFixed(1))
      };
    });

    const portfolioTotal = totalCurrentValue;
    const totalGain = totalCurrentValue - totalCostBasis;
    const percentageGain = totalCostBasis > 0 ? (totalGain / totalCostBasis) * 100 : 0;

    // Calculate allocation distribution
    const allocationMap: Record<string, number> = {};
    items.forEach((item) => {
      allocationMap[item.type] = (allocationMap[item.type] || 0) + item.value;
    });

    const allocationList = Object.entries(allocationMap).map(([assetType, val]) => ({
      type: assetType,
      value: val,
      percent: portfolioTotal > 0 ? (val / portfolioTotal) * 100 : 0
    }));

    // Dynamic Ring Chart SVG Segments
    let cumulativeValue = 0;
    const circumference = 377; // 2 * Math.PI * 60
    const chartSegments = allocationList.map((alloc, index) => {
      const segmentLength = portfolioTotal > 0 ? (alloc.value / portfolioTotal) * circumference : 0;
      const dashArray = `${segmentLength.toFixed(1)} ${(circumference - segmentLength).toFixed(1)}`;
      const dashOffset = portfolioTotal > 0 ? -((cumulativeValue / portfolioTotal) * circumference) : 0;
      
      cumulativeValue += alloc.value;

      return {
        ...alloc,
        dashArray,
        dashOffset,
        color: assetColors[index % assetColors.length]
      };
    });

    // Dynamic Dividend Yield & Beta calculation from holdings
    const weightedYieldSum = items.reduce((sum, h) => sum + h.value * (h.dividendYield || 0), 0);
    const portfolioYield = portfolioTotal > 0 ? Number((weightedYieldSum / portfolioTotal).toFixed(2)) : 0.00;

    const weightedBetaSum = items.reduce((sum, h) => sum + h.value * (h.beta || 1.0), 0);
    const portfolioBeta = portfolioTotal > 0 ? Number((weightedBetaSum / portfolioTotal).toFixed(2)) : 1.00;

    return {
      items,
      totalValue: portfolioTotal,
      totalGain,
      percentageGain: Number(percentageGain.toFixed(2)),
      allocationMap,
      chartSegments,
      portfolioYield,
      portfolioBeta
    };
  }, [holdings]);

  const displayedItems = useMemo(() => {
    if (!searchQuery) return metrics.items;
    const q = searchQuery.toLowerCase().trim();
    return metrics.items.filter(
      (item) =>
        item.code.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q) ||
        item.type.toLowerCase().includes(q) ||
        (item.id && item.id.toLowerCase().includes(q))
    );
  }, [metrics.items, searchQuery]);

  const totalReturnDisplay = (percent: number) => {
    const isPositive = percent >= 0;
    return (
      <span className={`font-semibold ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
        {isPositive ? '▲' : '▼'} {Math.abs(percent)}%
      </span>
    );
  };

  const filteredTransactions = useMemo(() => {
    return allTransactions.filter((tx) => {
      if (txTypeFilter !== 'ALL' && tx.type !== txTypeFilter) {
        return false;
      }
      const assetCode = tx.investment?.code || '';
      if (txAssetFilter !== 'ALL' && assetCode.toUpperCase() !== txAssetFilter.toUpperCase()) {
        return false;
      }
      if (searchQuery) {
        const q = searchQuery.toLowerCase().trim();
        const codeMatch = (tx.investment?.code || '').toLowerCase().includes(q);
        const nameMatch = (tx.investment?.name || '').toLowerCase().includes(q);
        const idMatch = (tx.id || '').toLowerCase().includes(q);
        if (!codeMatch && !nameMatch && !idMatch) return false;
      }
      return true;
    });
  }, [allTransactions, txTypeFilter, txAssetFilter, searchQuery]);

  const handleAddHolding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !units || !buyPrice) {
      alert('Please fill out all fields.');
      return;
    }

    setSaving(true);
    try {
      const newHolding = await createInvestment({
        code: code.trim().toUpperCase(),
        type,
        units: Number(units),
        buyPrice: Number(buyPrice),
        date: new Date(date).toISOString()
      });

      setHoldings([...holdings, newHolding]);

      // Reset form & close modal
      setCode('');
      setType('Stock');
      setUnits('');
      setBuyPrice('');
      setDate(getLocalDateTimeString());
      setIsModalOpen(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save investment');
    } finally {
      setSaving(false);
    }
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
    <div className="min-h-screen px-4 py-8 sm:px-6 lg:px-8 bg-ink-50">
      <div className="mx-auto max-w-7xl space-y-6">
        
        {/* Header */}
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-ink-100 pb-4">
          <div className="space-y-1 text-left">
            <h1 className="font-display text-4xl font-semibold tracking-tight text-ink-900">
              Investment Portfolio
            </h1>
            <p className="text-sm text-ink-500">
              Monitor and track your mutual funds, equity holdings, ETFs, and assets. Click on any holding row to open details.
            </p>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="cash-button-primary py-2.5 px-4 text-xs font-semibold self-start sm:self-center flex items-center gap-1.5 shrink-0"
          >
            <span>➕ Add Investment</span>
          </button>
        </header>

        {error && (
          <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 text-left">
            {error}
          </div>
        )}

        {/* Portfolio Stats Row */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-left animate-in fade-in duration-200">
          <article className="cash-card p-5 bg-white border border-ink-150 relative overflow-hidden">
            <p className="text-xs font-semibold text-ink-500">Portfolio Value</p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-ink-900">
              {formatCurrency(metrics.totalValue)}
            </p>
            <div className="mt-2 text-xs text-ink-400">
              Total valuation of active assets
            </div>
          </article>

          <article className="cash-card p-5 bg-white border border-ink-150 relative overflow-hidden">
            <p className="text-xs font-semibold text-ink-500">Total Returns</p>
            <p className={`mt-2 text-3xl font-bold tracking-tight ${metrics.totalGain >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {metrics.totalGain >= 0 ? '+' : ''}{formatCurrency(metrics.totalGain)}
            </p>
            <div className="mt-2 text-xs font-semibold text-emerald-600">
              ▲ {metrics.percentageGain}% absolute yield
            </div>
          </article>

          <article className="cash-card p-5 bg-white border border-ink-150 relative overflow-hidden">
            <p className="text-xs font-semibold text-ink-500">Annualized Dividend Yield</p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-ink-900">
              {metrics.portfolioYield}%
            </p>
            <div className="mt-2 text-xs text-ink-400">
              Weighted average portfolio yield
            </div>
          </article>

          <article className="cash-card p-5 bg-white border border-ink-150 relative overflow-hidden">
            <p className="text-xs font-semibold text-ink-500">1Y Portfolio Beta</p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-brand-700">
              {metrics.portfolioBeta}
            </p>
            <div className="mt-2 text-xs text-ink-400">
              Weighted volatility metric vs index
            </div>
          </article>
        </section>

        {/* Lower Grid */}
        <section className="grid gap-6 lg:grid-cols-3 text-left">
          
          {/* Holdings Table */}
          <div className="cash-card p-6 bg-white border border-ink-150 lg:col-span-2 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-ink-100 pb-4 gap-3">
              <div>
                <h2 className="text-xl font-semibold text-ink-900">Current Asset Allocation</h2>
                <span className="text-xs text-ink-500 font-medium">Showing {displayedItems.length} of {holdings.length} major holdings</span>
              </div>
              <div className="relative w-full sm:w-64">
                <svg className="absolute left-3 top-2.5 w-3.5 h-3.5 text-ink-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter holdings..."
                  className="w-full bg-ink-50/70 border border-ink-200 focus:bg-white focus:border-brand-500 rounded-xl py-1.5 pl-8 pr-3 text-xs text-ink-900 focus:outline-none transition"
                />
              </div>
            </div>
            
            {displayedItems.length === 0 ? (
              <div className="py-12 text-center text-ink-400 text-xs font-medium space-y-2">
                <p>{searchQuery ? 'No investments matching your search query.' : 'No investments recorded yet.'}</p>
                {!searchQuery && (
                  <button
                    onClick={() => setIsModalOpen(true)}
                    className="text-brand-700 hover:text-brand-900 font-semibold"
                  >
                    Create your first investment now
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-ink-100 text-left text-xs">
                  <thead className="bg-ink-50 text-ink-500 font-medium">
                    <tr>
                      <th className="px-3 py-3 rounded-l-2xl text-left">Asset ID</th>
                      <th className="px-3 py-3 text-left">Asset Code</th>
                      <th className="px-3 py-3 text-left">Asset Name</th>
                      <th className="px-3 py-3 text-left">Asset Class</th>
                      <th className="px-3 py-3 text-left">Date & Time</th>
                      <th className="px-3 py-3 text-right">Units</th>
                      <th className="px-3 py-3 text-right">Buy Price</th>
                      <th className="px-3 py-3 text-right">Current Price</th>
                      <th className="px-3 py-3 text-right">Current Value</th>
                      <th className="px-3 py-3 text-center rounded-r-2xl">Returns</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100 bg-white">
                    {displayedItems.map((item, idx) => (
                      <tr
                        key={item.id || idx}
                        onClick={() => router.push(`/investments/${item.code.toLowerCase()}`)}
                        className="hover:bg-ink-50/60 cursor-pointer transition-colors duration-150"
                        title="Click to view details"
                      >
                        <td className="px-3 py-3.5 text-left whitespace-nowrap">
                          {item.id ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(item.id!);
                                alert(`Asset Tracking ID "${item.id}" copied to clipboard!`);
                              }}
                              title="Click to copy Asset Tracking ID (A + 9 chars)"
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-200 transition font-mono text-xs font-bold shadow-2xs"
                            >
                              <span className="text-[10px] text-purple-600 font-extrabold">🏷️</span>
                              <span>{item.id}</span>
                              <span className="text-[10px] text-purple-400 opacity-70">📋</span>
                            </button>
                          ) : (
                            <span className="text-ink-300">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3.5 text-left font-mono font-bold text-ink-900 flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                          {item.code}
                        </td>
                        <td className="px-3 py-3.5 text-left text-ink-700 font-medium max-w-[200px] truncate" title={item.name}>
                          {item.name}
                        </td>
                        <td className="px-3 py-3.5 text-left text-ink-500">{item.type}</td>
                        <td className="px-3 py-3.5 text-left text-ink-400 whitespace-nowrap">
                          {new Date(item.date).toLocaleString('en-US', {
                            dateStyle: 'medium',
                            timeStyle: 'short'
                          })}
                        </td>
                        <td className="px-3 py-3.5 text-right font-semibold text-ink-800">{item.units}</td>
                        <td className="px-3 py-3.5 text-right text-ink-600 font-medium">{formatCurrency(item.buyPrice)}</td>
                        <td className="px-3 py-3.5 text-right text-brand-700 font-bold">{formatCurrency(item.currentPrice)}</td>
                        <td className="px-3 py-3.5 text-right font-bold text-ink-900">{formatCurrency(item.value)}</td>
                        <td className="px-3 py-3.5 text-center">{totalReturnDisplay(item.returnPercent)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Allocation Breakdown Ring Chart */}
          <div className="cash-card p-6 bg-white border border-ink-150 space-y-4 flex flex-col justify-between">
            <div>
              <h2 className="text-xl font-semibold text-ink-900 border-b border-ink-100 pb-4">Portfolio Split</h2>
              <div className="py-6 flex justify-center relative">
                <svg className="w-40 h-40 transform -rotate-90">
                  {/* Background Base Circle */}
                  <circle cx="80" cy="80" r="60" stroke="#f3f4f6" strokeWidth="22" fill="transparent" />
                  
                  {/* Dynamic Segments */}
                  {metrics.chartSegments.map((seg, idx) => (
                    <circle
                      key={idx}
                      cx="80"
                      cy="80"
                      r="60"
                      stroke={seg.color}
                      strokeWidth="22"
                      strokeDasharray={seg.dashArray}
                      strokeDashoffset={seg.dashOffset}
                      fill="transparent"
                      strokeLinecap="butt"
                      className="transition-all duration-500 ease-out"
                    />
                  ))}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[10px] text-ink-400 uppercase tracking-widest font-semibold">Active Assets</span>
                  <span className="text-xl font-bold text-ink-900">{holdings.length} Holdings</span>
                </div>
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-ink-100">
              {metrics.chartSegments.map((seg) => (
                <div key={seg.type} className="flex justify-between items-center text-xs">
                  <span className="flex items-center gap-1.5 font-medium text-ink-600">
                    <span className="w-2.5 h-2.5 rounded" style={{ backgroundColor: seg.color }} /> {seg.type}
                  </span>
                  <span className="font-bold text-ink-950">{seg.percent.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>

        </section>

        {/* All Investment Transactions Table (Below Asset Allocation / Portfolio Split) */}
        <section className="cash-card p-6 bg-white border border-ink-150 space-y-4 text-left shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-ink-100 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold text-ink-900">All Investment Transactions</h2>
                <span className="text-xs font-semibold text-brand-700 bg-brand-50 border border-brand-200 px-2.5 py-0.5 rounded-full">
                  {filteredTransactions.length} {filteredTransactions.length === 1 ? 'Transaction' : 'Transactions'}
                </span>
              </div>
              <p className="text-xs text-ink-500 mt-0.5">
                Complete history of buy (PB) and sell (PS) orders across your portfolio.
              </p>
            </div>

            {/* Quick Filters / Search */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Type Filter: All / Buys / Sells */}
              <div className="inline-flex p-0.5 bg-ink-100 rounded-xl border border-ink-150 text-xs">
                <button
                  type="button"
                  onClick={() => setTxTypeFilter('ALL')}
                  className={`px-3 py-1 rounded-lg font-semibold transition ${
                    txTypeFilter === 'ALL' ? 'bg-white text-ink-900 shadow-2xs' : 'text-ink-600 hover:text-ink-900'
                  }`}
                >
                  All Orders
                </button>
                <button
                  type="button"
                  onClick={() => setTxTypeFilter('BUY')}
                  className={`px-3 py-1 rounded-lg font-semibold transition ${
                    txTypeFilter === 'BUY' ? 'bg-white text-emerald-800 shadow-2xs' : 'text-ink-600 hover:text-ink-900'
                  }`}
                >
                  Buys (PB)
                </button>
                <button
                  type="button"
                  onClick={() => setTxTypeFilter('SELL')}
                  className={`px-3 py-1 rounded-lg font-semibold transition ${
                    txTypeFilter === 'SELL' ? 'bg-white text-amber-800 shadow-2xs' : 'text-ink-600 hover:text-ink-900'
                  }`}
                >
                  Sells (PS)
                </button>
              </div>

              {/* Asset Filter dropdown if multiple assets exist */}
              {holdings.length > 1 && (
                <select
                  value={txAssetFilter}
                  onChange={(e) => setTxAssetFilter(e.target.value)}
                  className="cash-input text-xs py-1 px-2.5 max-w-[160px]"
                >
                  <option value="ALL">All Assets</option>
                  {holdings.map((h) => (
                    <option key={h.code} value={h.code}>
                      {h.code} - {h.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {filteredTransactions.length === 0 ? (
            <div className="py-12 text-center text-ink-400 text-xs font-medium space-y-2">
              <p>No investment transactions recorded yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-ink-100 text-left text-xs">
                <thead className="bg-ink-50 text-ink-500 font-medium">
                  <tr>
                    <th className="px-3.5 py-3 rounded-l-xl text-left">Tracking ID</th>
                    <th className="px-3.5 py-3 text-left">Date & Time</th>
                    <th className="px-3.5 py-3 text-left">Order Type</th>
                    <th className="px-3.5 py-3 text-left">Asset</th>
                    <th className="px-3.5 py-3 text-left">Asset Class</th>
                    <th className="px-3.5 py-3 text-right">Units</th>
                    <th className="px-3.5 py-3 text-right">Price / Unit</th>
                    <th className="px-3.5 py-3 text-right rounded-r-xl">Total Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100 font-medium bg-white">
                  {filteredTransactions.map((tx) => {
                    const isBuy = tx.type === 'BUY' || tx.type?.includes('BUY') || tx.id.startsWith('PB');
                    const isSell = tx.type === 'SELL' || tx.type?.includes('SELL') || tx.id.startsWith('PS');
                    const asset = tx.investment;

                    return (
                      <tr
                        key={tx.id}
                        onClick={() => {
                          if (asset?.code) {
                            router.push(`/investments/${asset.code.toLowerCase()}`);
                          }
                        }}
                        className={`hover:bg-ink-50/60 transition ${asset ? 'cursor-pointer' : ''}`}
                        title={asset ? `Click to view ${asset.name} and manage orders` : undefined}
                      >
                        <td className="px-3.5 py-3.5 text-left font-mono text-xs" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
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
                        <td className="px-3.5 py-3.5">
                          {asset ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                router.push(`/investments/${asset.code.toLowerCase()}`);
                              }}
                              className="flex items-center gap-2 hover:opacity-80 transition text-left"
                              title={`View ${asset.name} details`}
                            >
                              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: asset.color }} />
                              <span className="font-mono font-bold text-ink-900">{asset.code}</span>
                              <span className="text-ink-600 max-w-[140px] truncate">({asset.name})</span>
                            </button>
                          ) : (
                            <span className="text-ink-400">—</span>
                          )}
                        </td>
                        <td className="px-3.5 py-3.5 text-ink-500">{asset?.type || 'Investment'}</td>
                        <td className="px-3.5 py-3.5 text-right font-semibold text-ink-800">{tx.units}</td>
                        <td className="px-3.5 py-3.5 text-right font-mono text-ink-600">{formatCurrency(tx.price)}</td>
                        <td className="px-3.5 py-3.5 text-right font-bold text-ink-900 rounded-r-xl">{formatCurrency(tx.amount || tx.units * tx.price)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

      </div>

      {/* Add Investment Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="cash-card max-w-md w-full p-6 bg-white animate-in zoom-in duration-200">
            <div className="mb-4 flex items-center justify-between border-b border-ink-100 pb-4">
              <div className="text-left">
                <h3 className="text-xl font-semibold text-ink-900">Add Investment</h3>
                <p className="text-xs text-ink-500">Enter a ticker code. Company name and pricing are resolved automatically.</p>
              </div>
              <button
                type="button"
                className="rounded-full p-2 text-ink-500 hover:bg-ink-100 transition"
                onClick={() => setIsModalOpen(false)}
                disabled={saving}
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleAddHolding} className="space-y-4 text-left">
              {/* 1. Asset Class */}
              <div>
                <label className="cash-label" htmlFor="assetType">Asset Class</label>
                <select
                  id="assetType"
                  className="cash-input"
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  disabled={saving}
                >
                  <option value="Stock">Stock / Direct Equity</option>
                  <option value="Mutual Fund">Mutual Fund</option>
                  <option value="ETF">ETF</option>
                  <option value="Crypto">Cryptocurrency</option>
                  <option value="Gold">Gold & Commodities</option>
                  <option value="Real Estate">Real Estate</option>
                </select>
              </div>

              {/* 2. Asset Ticker / Code */}
              <div>
                <label className="cash-label" htmlFor="assetCode">Asset Ticker / Code</label>
                <input
                  id="assetCode"
                  type="text"
                  placeholder="e.g. AAPL, BTC-USD, RELIANCE.NS"
                  className="cash-input font-mono"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                  disabled={saving}
                />
              </div>

              {/* Date & Time */}
              <div>
                <label className="cash-label" htmlFor="date">Transaction Date & Time</label>
                <input
                  id="date"
                  type="datetime-local"
                  className="cash-input"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                  disabled={saving}
                />
              </div>

              {/* 3 & 4. Units & Price */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="cash-label" htmlFor="units">Units / Qty</label>
                  <input
                    id="units"
                    type="number"
                    step="0.001"
                    min="0.001"
                    placeholder="1.0"
                    className="cash-input"
                    value={units}
                    onChange={(e) => setUnits(e.target.value)}
                    required
                    disabled={saving}
                  />
                </div>
                <div>
                  <label className="cash-label" htmlFor="buyPrice">Buy Price (Avg)</label>
                  <input
                    id="buyPrice"
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="100.00"
                    className="cash-input"
                    value={buyPrice}
                    onChange={(e) => setBuyPrice(e.target.value)}
                    required
                    disabled={saving}
                  />
                </div>
              </div>

              <div className="border-t border-ink-100 pt-4 flex gap-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="cash-button-primary flex-1 py-2.5 text-xs font-semibold"
                >
                  {saving ? 'Resolving & Saving...' : 'Save Investment'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={saving}
                  className="cash-button-secondary py-2.5 text-xs font-semibold"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function InvestmentsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-ink-50 px-4 py-8 animate-pulse text-ink-500">Loading investments...</div>}>
      <InvestmentsContent />
    </Suspense>
  );
}
