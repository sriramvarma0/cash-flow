import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatCurrency } from '../../../lib/finance';

export type DashboardChartsProps = {
  areaData: any[];
  categories: any[];
  categoryPalette: string[];
};

export function DashboardCharts({ areaData, categories, categoryPalette }: DashboardChartsProps) {
  return (
    <div className="space-y-6">
      <div className="cash-card p-6">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-ink-900">Spending trend</h2>
            <p className="text-sm text-ink-500">Recent entries mapped as a rolling area chart.</p>
          </div>
        </div>

        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={areaData}>
              <defs>
                <linearGradient id="cashflowGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#17a66b" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#17a66b" stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5ecec" />
              <XAxis dataKey="date" stroke="#5b7676" fontSize={12} />
              <YAxis stroke="#5b7676" fontSize={12} />
              <Tooltip formatter={(value) => formatCurrency(Number(value))} />
              <Area type="monotone" dataKey="amount" stroke="#0d533c" fill="url(#cashflowGradient)" strokeWidth={3} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="cash-card p-6">
          <h2 className="text-2xl font-semibold text-ink-900">Category mix</h2>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categories}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5ecec" />
                <XAxis dataKey="name" stroke="#5b7676" fontSize={12} />
                <YAxis stroke="#5b7676" fontSize={12} />
                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                <Bar dataKey="value" radius={[12, 12, 0, 0]}>
                  {categories.map((entry, index) => (
                    <Cell key={entry.name} fill={categoryPalette[index % categoryPalette.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="cash-card p-6">
          <h2 className="text-2xl font-semibold text-ink-900">Category share</h2>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={categories} dataKey="value" nameKey="name" innerRadius={62} outerRadius={96} paddingAngle={4}>
                  {categories.map((entry, index) => (
                    <Cell key={entry.name} fill={categoryPalette[index % categoryPalette.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
