import { formatCurrency } from '../../../lib/finance';

export type DashboardStatsProps = {
  outflow: number;
  total: number;
  income: number;
  transfersSent: number;
  transfersReceived: number;
};

export function DashboardStats({
  outflow,
  total,
  income,
  transfersSent,
  transfersReceived
}: DashboardStatsProps) {
  const cards = [
    { label: 'Total Outflow', value: formatCurrency(outflow), accent: 'from-amber-100 to-white' },
    { label: 'Total Expenses', value: formatCurrency(total), accent: 'from-red-100 to-white' },
    { label: 'Total Income', value: formatCurrency(income), accent: 'from-emerald-100 to-white' },
    { label: 'Transfers Sent', value: formatCurrency(transfersSent), accent: 'from-blue-100 to-white' },
    { label: 'Transfers Received', value: formatCurrency(transfersReceived), accent: 'from-purple-100 to-white' }
  ];

  return (
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 text-left animate-in fade-in duration-200">
      {cards.map((card) => (
        <article
          key={card.label}
          className="cash-card bg-gradient-to-br p-5 shadow-sm text-left animate-in zoom-in-95 duration-200"
          style={{
            backgroundImage: `linear-gradient(135deg, rgba(255,255,255,0.9), rgba(255,255,255,0.72)), linear-gradient(135deg, var(--tw-gradient-stops))`
          }}
        >
          <p className="text-xs font-semibold text-ink-500 text-left">{card.label}</p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-ink-900 text-left">
            {card.value}
          </p>
        </article>
      ))}
    </section>
  );
}
