'use client';

import { useState, Suspense } from 'react';
import { Navbar } from '../../components/navigation/navbar';
import { Sidebar } from '../../components/navigation/sidebar';

export default function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col bg-ink-50">
      <Suspense fallback={<div className="h-16 bg-white border-b border-ink-100" />}>
        <Navbar onMenuClick={() => setSidebarOpen(true)} />
      </Suspense>
      <div className="flex flex-1 flex-col md:flex-row relative">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
