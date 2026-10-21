import { Suspense } from 'react';
import { BudgetView } from '../../../components/budget/budget-view';

export default function BudgetPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-ink-50 px-4 py-8 sm:px-6 lg:px-8 text-ink-500 animate-pulse">Loading budget...</div>}>
      <BudgetView />
    </Suspense>
  );
}
