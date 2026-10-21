import { Suspense } from 'react';
import { DashboardView } from '../../../components/dashboard/dashboard-view';

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-ink-50 px-4 py-8 sm:px-6 lg:px-8 text-ink-500">Loading dashboard...</div>}>
      <DashboardView />
    </Suspense>
  );
}
