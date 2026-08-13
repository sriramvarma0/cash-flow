'use client';

import { useState } from 'react';
import { Navbar } from '../../components/navigation/navbar';
import { Sidebar } from '../../components/navigation/sidebar';

export default function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col bg-ink-50">
      <Navbar onMenuClick={() => setSidebarOpen(true)} />
      <div className="flex flex-1 flex-col md:flex-row relative">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
