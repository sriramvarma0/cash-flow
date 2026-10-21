'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Home icon SVG
function HomeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  );
}

// Transactions icon SVG
function TransactionsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  );
}

// Expense icon SVG
function ExpenseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

// Close Icon SVG
function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

// Users/Groups Icon SVG
function UsersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20H7m0 0v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  );
}

// Income icon SVG
function IncomeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
  );
}

// Grid layout icon SVG
function GridIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
    </svg>
  );
}

// Briefcase icon for Investments
function InvestmentIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  );
}

// Budget icon SVG
function BudgetIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
    </svg>
  );
}

const navItems = [
  { href: '/dashboard', label: 'Dashboards', icon: GridIcon },
  { href: '/expenses', label: 'Expense', icon: ExpenseIcon },
  { href: '/income', label: 'Income', icon: IncomeIcon },
  { href: '/budget', label: 'Budget', icon: BudgetIcon },
  { href: '/investments', label: 'Investments', icon: InvestmentIcon },
  { href: '/transactions', label: 'Transactions', icon: TransactionsIcon },
  { href: '/groups', label: 'Groups', icon: UsersIcon }
];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();

  const renderNavLinks = (onClickCallback?: () => void) => {
    return navItems.map((item) => {
      const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
      const IconComponent = item.icon;

      return (
        <Link
          key={item.href}
          href={item.href as never}
          onClick={onClickCallback}
          className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-medium transition-all duration-200 group ${
            active
              ? 'bg-brand-500 text-white shadow-glow'
              : 'text-ink-300 hover:text-white hover:bg-ink-800'
          }`}
        >
          <IconComponent
            className={`h-5 w-5 transition-transform duration-200 group-hover:scale-110 ${
              active ? 'text-white' : 'text-ink-400 group-hover:text-brand-300'
            }`}
          />
          <span>{item.label}</span>
        </Link>
      );
    });
  };

  return (
    <>
      {/* Mobile Navigation Drawer */}
      {isOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          {/* Drawer Backdrop */}
          <div
            className="fixed inset-0 bg-ink-950/60 backdrop-blur-xs transition-opacity"
            onClick={onClose}
          />

          {/* Drawer Content */}
          <div className="relative flex flex-col w-64 max-w-xs bg-ink-900 text-white h-full p-6 shadow-xl z-50 animate-in slide-in-from-left duration-200">
            {/* Drawer Header (Close button only) */}
            <div className="flex items-center justify-end mb-8">
              <button
                onClick={onClose}
                className="p-1 text-ink-300 hover:text-white transition focus:outline-none"
                aria-label="Close Menu"
              >
                <CloseIcon className="h-6 w-6" />
              </button>
            </div>

            {/* Links */}
            <nav className="flex-1 flex flex-col gap-2">
              {renderNavLinks(onClose)}
            </nav>
          </div>
        </div>
      )}

      {/* Desktop Sticky Left Sidebar (Normal width w-64 with labels, but NO "NAVIGATION" header text) */}
      <aside className="hidden md:flex flex-col w-64 h-[calc(100vh-4rem)] sticky top-16 bg-ink-900 text-white p-6 justify-between border-r border-ink-800 shrink-0">
        <div className="space-y-6">
          <nav className="flex flex-col gap-2">
            {renderNavLinks()}
          </nav>
        </div>
      </aside>
    </>
  );
}
