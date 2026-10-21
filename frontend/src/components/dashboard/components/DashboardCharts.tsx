import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatCurrency } from '../../../lib/finance';

export type DashboardChartsProps = {
  areaData: { date: string; amount: number }[];
  categories: { name: string; value: number }[];
  categoryPalette: string[];
  trendTitle?: string;
  trendSubtitle?: string;
};

export function DashboardCharts({
  areaData,
  categories,
  categoryPalette,
  trendTitle = 'Spending trend',
  trendSubtitle = 'Recent entries mapped as a rolling area chart.'
}: DashboardChartsProps) {
  const totalTrendSpending = areaData.reduce((acc, curr) => acc + curr.amount, 0);
  const hasAreaData = areaData.length > 0 && areaData.some((d) => d.amount > 0);
  const hasCategories = categories.length > 0 && categories.some((c) => c.value > 0);

  return (
    <div className="space-y-6">
      <div className="cash-card p-6">
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-2xl font-semibold text-ink-900">{trendTitle}</h2>
            <p className="text-sm text-ink-500">{trendSubtitle}</p>
          </div>
          {hasAreaData && (
            <div className="text-left sm:text-right">
              <p className="text-xs text-ink-400">Total in period</p>
              <p className="text-lg font-bold text-ink-900">{formatCurrency(totalTrendSpending)}</p>
            </div>
          )}
        </div>

        <div className="h-72">
          {hasAreaData ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={areaData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="cashflowGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#17a66b" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#17a66b" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5ecec" />
                <XAxis dataKey="date" stroke="#5b7676" fontSize={12} tickLine={false} />
                <YAxis
                  stroke="#5b7676"
                  fontSize={12}
                  tickLine={false}
                  tickFormatter={(val) => `₹${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`}
                />
                <Tooltip formatter={(value) => [formatCurrency(Number(value)), 'Spent']} />
                <Area
                  type="monotone"
                  dataKey="amount"
                  stroke="#0d533c"
                  fill="url(#cashflowGradient)"
                  strokeWidth={3}
                  activeDot={{ r: 6, fill: '#17a66b', stroke: '#fff', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-ink-150 rounded-2xl bg-ink-50/50">
              <svg className="w-10 h-10 text-ink-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <p className="text-sm font-semibold text-ink-600">No spending data for this period</p>
              <p className="text-xs text-ink-400 mt-1">Expenses recorded in this period will appear on this timeline chart.</p>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="cash-card p-6">
          <h2 className="text-2xl font-semibold text-ink-900">Category mix</h2>
          <p className="text-xs text-ink-400 mt-0.5">Distribution across expense categories</p>
          <div className="mt-4 h-72">
            {hasCategories ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categories} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5ecec" />
                  <XAxis dataKey="name" stroke="#5b7676" fontSize={12} tickLine={false} />
                  <YAxis
                    stroke="#5b7676"
                    fontSize={12}
                    tickLine={false}
                    tickFormatter={(val) => `₹${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`}
                  />
                  <Tooltip formatter={(value) => [formatCurrency(Number(value)), 'Total']} />
                  <Bar dataKey="value" radius={[12, 12, 0, 0]}>
                    {categories.map((entry, index) => (
                      <Cell key={entry.name} fill={categoryPalette[index % categoryPalette.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-ink-150 rounded-2xl bg-ink-50/50">
                <p className="text-sm font-semibold text-ink-600">No category data</p>
                <p className="text-xs text-ink-400 mt-1">No categorized expenses in this date range.</p>
              </div>
            )}
          </div>
        </div>

        <div className="cash-card p-6">
          <h2 className="text-2xl font-semibold text-ink-900">Category share</h2>
          <p className="text-xs text-ink-400 mt-0.5">Proportional breakdown of spend</p>
          <div className="mt-4 h-72">
            {hasCategories ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categories}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={62}
                    outerRadius={96}
                    paddingAngle={4}
                  >
                    {categories.map((entry, index) => (
                      <Cell key={entry.name} fill={categoryPalette[index % categoryPalette.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [formatCurrency(Number(value)), 'Share']} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-ink-150 rounded-2xl bg-ink-50/50">
                <p className="text-sm font-semibold text-ink-600">No category share data</p>
                <p className="text-xs text-ink-400 mt-1">Record expenses to see your category pie chart.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

