import { formatCurrency } from '../../../lib/finance';

export type DashboardStatsProps = {
  outflow: number;
  total: number;
  income: number;
  transfersSent: number;
  transfersReceived: number;
  periodLabel?: string;
};

export function DashboardStats({
  outflow,
  total,
  income,
  transfersSent,
  transfersReceived,
  periodLabel
}: DashboardStatsProps) {
  const cards = [
    { label: 'Total Outflow', value: formatCurrency(outflow), accent: 'from-amber-100 to-white', color: 'text-amber-700' },
    { label: 'Total Expenses', value: formatCurrency(total), accent: 'from-red-100 to-white', color: 'text-rose-700' },
    { label: 'Total Income', value: formatCurrency(income), accent: 'from-emerald-100 to-white', color: 'text-emerald-700' },
    { label: 'Transfers Sent', value: formatCurrency(transfersSent), accent: 'from-blue-100 to-white', color: 'text-blue-700' },
    { label: 'Transfers Received', value: formatCurrency(transfersReceived), accent: 'from-purple-100 to-white', color: 'text-purple-700' }
  ];

  return (
    <div className="space-y-2">
      {periodLabel && (
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-semibold text-ink-500 uppercase tracking-wider">Metrics Overview</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50/80 border border-brand-200/60 px-2.5 py-0.5 text-[11px] font-medium text-brand-800 shadow-2xs">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500 animate-pulse" />
            Showing: {periodLabel}
          </span>
        </div>
      )}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 text-left animate-in fade-in duration-200">
        {cards.map((card) => (
          <article
            key={card.label}
            className="cash-card bg-gradient-to-br p-5 shadow-sm text-left animate-in zoom-in-95 duration-200 hover:-translate-y-0.5 transition-all"
            style={{
              backgroundImage: `linear-gradient(135deg, rgba(255,255,255,0.95), rgba(255,255,255,0.78)), linear-gradient(135deg, var(--tw-gradient-stops))`
            }}
          >
            <p className="text-xs font-semibold text-ink-500 text-left">{card.label}</p>
            <p className="mt-2 text-2xl font-bold tracking-tight text-ink-900 text-left">
              {card.value}
            </p>
          </article>
        ))}
      </section>
    </div>
  );
}

