'use client';

import { useEffect, useState } from 'react';
import { fetchCurrentUser, getSavedAccounts, type SavedAccount } from '../../../lib/api';
import { AuthUser } from '../../../lib/types';

export default function SettingsPage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([]);
  const [activeTab, setActiveTab] = useState<'profile' | 'preferences' | 'security'>('profile');
  const [loading, setLoading] = useState(true);

  // Settings mock states
  const [currency, setCurrency] = useState('INR');
  const [notifications, setNotifications] = useState(true);
  const [emailAlerts, setEmailAlerts] = useState(false);
  const [theme, setTheme] = useState('light');

  useEffect(() => {
    async function loadData() {
      try {
        const currentUser = await fetchCurrentUser();
        setUser(currentUser);
      } catch (err) {
        console.error('Failed to load settings data', err);
      } finally {
        setLoading(false);
      }
    }
    void loadData();
    setSavedAccounts(getSavedAccounts());
  }, []);

  const getInitials = () => {
    if (!user || !user.name) return 'U';
    const parts = user.name.split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return user.name.slice(0, 2).toUpperCase();
  };

  if (loading) {
    return (
      <div className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <div className="h-10 w-48 bg-ink-100 rounded animate-pulse" />
          <div className="h-64 bg-white rounded-3xl border border-ink-100 animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-8 sm:px-6 lg:px-8 bg-ink-50">
      <div className="mx-auto max-w-4xl space-y-6">
        
        {/* Header */}
        <header className="space-y-2">
          <h1 className="font-display text-4xl font-semibold tracking-tight text-ink-900">
            Settings
          </h1>
          <p className="text-sm text-ink-500">
            Manage your account profiles, visual preferences, and database configurations.
          </p>
        </header>

        {/* Outer Grid */}
        <div className="grid gap-6 md:grid-cols-[200px_1fr]">
          {/* Tabs Navigation */}
          <aside className="flex flex-row md:flex-col gap-1 overflow-x-auto pb-2 md:pb-0">
            {[
              { id: 'profile', label: 'User Profile' },
              { id: 'preferences', label: 'Preferences' },
              { id: 'security', label: 'Security' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`whitespace-nowrap px-4 py-2 text-sm font-semibold rounded-xl text-left transition ${
                  activeTab === tab.id
                    ? 'bg-brand-900 text-white shadow-sm'
                    : 'text-ink-500 hover:text-ink-900 hover:bg-ink-100/50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </aside>

          {/* Settings Tab Content */}
          <main className="cash-card p-6 sm:p-8 bg-white min-h-[400px]">
            {activeTab === 'profile' && user && (
              <section className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-ink-900 border-b border-ink-100 pb-3">
                    Active Account Profile
                  </h3>
                  <div className="flex items-center gap-4 mt-4">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-100 text-brand-800 text-xl font-bold border border-brand-200 shadow-sm">
                      {getInitials()}
                    </div>
                    <div>
                      <h4 className="font-bold text-ink-900">{user.name}</h4>
                      <p className="text-xs text-ink-500">Active account session</p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 pt-2">
                  <div>
                    <label className="cash-label">Email address</label>
                    <input className="cash-input bg-ink-50/50 cursor-not-allowed" value={user.email} disabled />
                  </div>
                  <div>
                    <label className="cash-label">Phone number</label>
                    <input className="cash-input bg-ink-50/50 cursor-not-allowed" value={user.phoneNumber} disabled />
                  </div>
                  <div>
                    <label className="cash-label">Created at</label>
                    <input className="cash-input bg-ink-50/50 cursor-not-allowed" value={new Date(user.createdAt).toLocaleDateString()} disabled />
                  </div>
                  <div>
                    <label className="cash-label">Session ID</label>
                    <input className="cash-input bg-ink-50/50 cursor-not-allowed font-mono text-xs" value={user.id} disabled />
                  </div>
                </div>

                <div className="pt-4 border-t border-ink-100">
                  <h4 className="text-sm font-semibold text-ink-900">Linked Accounts in this browser</h4>
                  <p className="text-xs text-ink-500 mt-1">
                    You have {savedAccounts.length} saved accounts in your session storage. Use the navbar switcher to toggle.
                  </p>
                  <div className="mt-3 space-y-2">
                    {savedAccounts.map((acc) => (
                      <div key={acc.id} className="flex justify-between items-center p-3 border border-ink-100 rounded-xl bg-ink-50/30 text-xs">
                        <div>
                          <p className="font-semibold text-ink-900">{acc.name} {acc.id === user.id && <span className="text-xxs bg-brand-100 text-brand-800 px-1.5 py-0.5 rounded-full font-bold ml-1.5">Active</span>}</p>
                          <p className="text-ink-500 mt-0.5">{acc.email}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {activeTab === 'preferences' && (
              <section className="space-y-6">
                <h3 className="text-lg font-semibold text-ink-900 border-b border-ink-100 pb-3">
                  Visual & Budgeting Preferences
                </h3>

                <div className="space-y-4 pt-2">
                  <div className="flex items-center justify-between p-4 border border-ink-100 rounded-2xl bg-ink-50/30">
                    <div>
                      <p className="text-sm font-semibold text-ink-900">Primary Currency</p>
                      <p className="text-xs text-ink-500 mt-0.5">Determine currency symbol used on dashboard calculations.</p>
                    </div>
                    <select
                      className="cash-input max-w-[120px]"
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                    >
                      <option value="INR">INR (₹)</option>
                      <option value="USD">USD ($)</option>
                      <option value="EUR">EUR (€)</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between p-4 border border-ink-100 rounded-2xl bg-ink-50/30">
                    <div>
                      <p className="text-sm font-semibold text-ink-900">Push Notifications</p>
                      <p className="text-xs text-ink-500 mt-0.5">Alert me for unusual budget activity or spikes.</p>
                    </div>
                    <input
                      type="checkbox"
                      className="h-5 w-5 rounded border-ink-300 text-brand-700 focus:ring-brand-500"
                      checked={notifications}
                      onChange={(e) => setNotifications(e.target.checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 border border-ink-100 rounded-2xl bg-ink-50/30">
                    <div>
                      <p className="text-sm font-semibold text-ink-900">Email Alerts</p>
                      <p className="text-xs text-ink-500 mt-0.5">Send a weekly summaries of my spending trends.</p>
                    </div>
                    <input
                      type="checkbox"
                      className="h-5 w-5 rounded border-ink-300 text-brand-700 focus:ring-brand-500"
                      checked={emailAlerts}
                      onChange={(e) => setEmailAlerts(e.target.checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 border border-ink-100 rounded-2xl bg-ink-50/30">
                    <div>
                      <p className="text-sm font-semibold text-ink-900">App Theme</p>
                      <p className="text-xs text-ink-500 mt-0.5">Choose layout background color scheme.</p>
                    </div>
                    <div className="flex gap-2">
                      {['light', 'dark'].map((t) => (
                        <button
                          key={t}
                          onClick={() => setTheme(t)}
                          className={`capitalize px-3 py-1.5 text-xs font-semibold rounded-lg border transition ${
                            theme === t
                              ? 'bg-brand-900 text-white border-brand-900'
                              : 'border-ink-200 text-ink-600 hover:bg-ink-100/50'
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            )}

            {activeTab === 'security' && (
              <section className="space-y-6">
                <h3 className="text-lg font-semibold text-ink-900 border-b border-ink-100 pb-3">
                  Security & Access Control
                </h3>

                <div className="space-y-4 pt-2">
                  <div className="p-4 border border-ink-100 rounded-2xl bg-ink-50/30 space-y-1">
                    <p className="text-sm font-semibold text-ink-900">JWT Token Expiry</p>
                    <p className="text-xs text-ink-500">
                      Your current session token expires automatically after 7 days.
                    </p>
                  </div>

                  <div className="p-4 border border-ink-100 rounded-2xl bg-ink-50/30 space-y-2">
                    <p className="text-sm font-semibold text-ink-900">Encryption Method</p>
                    <p className="text-xs text-ink-500 leading-relaxed">
                      Passwords are encrypted using the BCRYPT algorithm with secure salt rounds on the backend.
                    </p>
                  </div>

                  <div className="p-4 border border-red-100 rounded-2xl bg-red-50/30 space-y-3">
                    <div>
                      <p className="text-sm font-semibold text-red-900">Session Clearing</p>
                      <p className="text-xs text-red-700 mt-0.5">
                        Instantly remove all active multi-session logins saved in this web browser.
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        if (confirm('Clear all saved account sessions? You will be signed out.')) {
                          localStorage.clear();
                          window.location.href = '/login';
                        }
                      }}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold text-xs rounded-xl transition"
                    >
                      Clear Storage Sessions
                    </button>
                  </div>
                </div>
              </section>
            )}
          </main>
        </div>

      </div>
    </div>
  );
}
