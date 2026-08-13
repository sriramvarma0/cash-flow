'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { logout, fetchCurrentUser, getSavedAccounts, removeSavedAccount, clearAllSavedAccounts, switchAccount, SavedAccount, fetchPendingInvitations, respondToInvitation, GroupInvitation } from '../../lib/api';
import { AuthUser } from '../../lib/types';

// Hamburger Menu Icon
function MenuIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

// User Profile Avatar icon if user has no initials
function UserIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  );
}

// Settings gear icon SVG
function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

// Notification Bell icon SVG
function BellIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
      />
    </svg>
  );
}

interface NavbarProps {
  onMenuClick: () => void;
}

interface NotificationItem {
  id: string;
  text: string;
  time: string;
  read: boolean;
  type: 'info' | 'warning' | 'success';
}

const mockNotifications: NotificationItem[] = [
  {
    id: '1',
    text: 'Budget warning: "Food & Dining" category has exceeded 80% of its monthly limit.',
    time: '2 hours ago',
    read: false,
    type: 'warning'
  },
  {
    id: '2',
    text: 'Import success: 5 transactions successfully imported via AI Bulk Add.',
    time: '1 day ago',
    read: false,
    type: 'success'
  },
  {
    id: '3',
    text: 'Security alert: A new login session was established on this browser.',
    time: '3 days ago',
    read: true,
    type: 'info'
  }
];

export function Navbar({ onMenuClick }: NavbarProps) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>(mockNotifications);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [invitations, setInvitations] = useState<GroupInvitation[]>([]);

  async function loadInvitations() {
    try {
      const data = await fetchPendingInvitations();
      setInvitations(data);
    } catch (err) {
      console.error('Failed to load pending invitations', err);
    }
  }

  const handleMarkAllRead = () => {
    setNotifications(notifications.map((n) => ({ ...n, read: true })));
  };

  const handleToggleRead = (id: string) => {
    setNotifications(
      notifications.map((n) => (n.id === id ? { ...n, read: !n.read } : n))
    );
  };

  async function handleResponse(inviteId: string, accept: boolean) {
    try {
      await respondToInvitation(inviteId, accept);
      await loadInvitations();
      if (window.location.pathname === '/groups') {
        window.location.reload();
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to respond to invitation');
    }
  }

  useEffect(() => {
    async function loadUser() {
      try {
        const currentUser = await fetchCurrentUser();
        setUser(currentUser);
      } catch (err) {
        console.error('Failed to load user info', err);
      }
    }
    void loadUser();
    setSavedAccounts(getSavedAccounts());
    void loadInvitations();
  }, []);

  async function handleSwitch(account: SavedAccount) {
    try {
      await switchAccount(account.accessToken);
      setIsDropdownOpen(false);
      window.location.reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to switch account');
    }
  }

  function handleRemoveAccount(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    removeSavedAccount(id);
    setSavedAccounts(getSavedAccounts());
  }

  async function handleSingleLogout() {
    if (!user) return;
    removeSavedAccount(user.id);
    const remaining = getSavedAccounts();
    if (remaining.length > 0) {
      try {
        await switchAccount(remaining[0].accessToken);
        window.location.reload();
      } catch {
        await logout();
        clearAllSavedAccounts();
        router.replace('/login');
        router.refresh();
      }
    } else {
      await logout();
      clearAllSavedAccounts();
      router.replace('/login');
      router.refresh();
    }
  }

  async function handleSignOutAll() {
    await logout();
    clearAllSavedAccounts();
    router.replace('/login');
    router.refresh();
  }

  // Get user initials for avatar
  const getInitials = (name?: string) => {
    const activeName = name || user?.name;
    if (!activeName) return '';
    const parts = activeName.trim().split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return activeName.slice(0, 2).toUpperCase();
  };

  const otherAccounts = savedAccounts.filter((acc) => user && acc.id !== user.id);

  return (
    <header className="sticky top-0 z-30 border-b border-white/70 bg-white/80 backdrop-blur-xl h-16 shrink-0">
      <div className="mx-auto flex h-full items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        
        {/* Left Side: Hamburger Menu (Mobile Only) & Brand Logo */}
        <div className="flex items-center gap-3">
          <button
            onClick={onMenuClick}
            className="md:hidden p-2 -ml-2 text-ink-600 hover:text-ink-900 rounded-xl hover:bg-ink-100/50 transition focus:outline-none"
            aria-label="Open Sidebar"
          >
            <MenuIcon className="h-6 w-6" />
          </button>
          
          <Link href="/dashboard" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-900 text-sm font-semibold text-white shadow-glow">
              CF
            </span>
            <div>
              <p className="font-display text-md font-semibold tracking-tight text-ink-900 leading-tight">CashFlow</p>
              <p className="text-xxs text-ink-500 hidden sm:block">Personal finance dashboard</p>
            </div>
          </Link>
        </div>

        {/* Right Side: Account switcher dropdown */}
        <div className="flex items-center gap-4">
          {/* Notification Button & Dropdown */}
          {user && (
            <div className="relative">
              <button
                onClick={() => {
                  setIsNotifOpen(!isNotifOpen);
                  setIsDropdownOpen(false); // Close account dropdown
                }}
                className="relative p-2 rounded-xl text-ink-600 hover:text-ink-900 hover:bg-ink-100/50 transition focus:outline-none"
                aria-label="Notifications"
              >
                <BellIcon className="h-5 w-5" />
                {(invitations.length > 0 || notifications.some((n) => !n.read)) && (
                  <span className="absolute top-1.5 right-1.5 flex h-2 w-2 rounded-full bg-red-600 ring-2 ring-white animate-pulse" />
                )}
              </button>

              {isNotifOpen && (
                <>
                  {/* Invisible backdrop */}
                  <div className="fixed inset-0 z-40" onClick={() => setIsNotifOpen(false)} />
                  
                  {/* Dropdown Card */}
                  <div className="absolute right-0 mt-2.5 w-80 rounded-2xl border border-ink-100 bg-white p-5 shadow-2xl z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                    <div className="flex items-center justify-between pb-3 border-b border-ink-100 mb-3">
                      <h4 className="font-semibold text-ink-900 text-sm">Notifications</h4>
                      {notifications.some((n) => !n.read) && (
                        <button
                          onClick={handleMarkAllRead}
                          className="text-[10px] font-semibold text-brand-700 hover:text-brand-800 transition"
                        >
                          Mark all read
                        </button>
                      )}
                    </div>

                    <div className="space-y-4 max-h-72 overflow-y-auto pr-1">
                      {/* Section 1: Group Invites */}
                      {invitations.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-700 text-left">
                            Group Invitations
                          </p>
                          {invitations.map((invite) => (
                            <div
                              key={invite.id}
                              className="p-3 rounded-xl border border-brand-100 bg-brand-50/20 text-left space-y-2.5 text-ink-800 font-medium"
                            >
                              <p className="text-[11px] leading-relaxed text-left">
                                <span className="font-bold text-brand-900">{invite.group.owner.name}</span> invited you to join group <span className="font-bold text-brand-900">"{invite.group.name}"</span>.
                              </p>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => void handleResponse(invite.id, true)}
                                  className="flex-1 bg-brand-700 hover:bg-brand-800 text-white font-semibold text-[10px] py-1.5 px-2 rounded-lg transition"
                                >
                                  Accept
                                </button>
                                <button
                                  onClick={() => void handleResponse(invite.id, false)}
                                  className="flex-1 bg-white hover:bg-ink-100 border border-ink-200 text-ink-700 font-semibold text-[10px] py-1.5 px-2 rounded-lg transition"
                                >
                                  Decline
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Section 2: Activity Notifications */}
                      <div className="space-y-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-400 text-left">
                          Activity
                        </p>
                        {notifications.map((notif) => (
                          <div
                            key={notif.id}
                            onClick={() => handleToggleRead(notif.id)}
                            className={`p-3 rounded-xl border text-[11px] cursor-pointer transition text-left ${
                              notif.read
                                ? 'bg-white border-ink-50 text-ink-500 hover:bg-ink-50/30'
                                : 'bg-brand-50/20 border-brand-100 text-ink-800 font-medium hover:bg-brand-50/40'
                            }`}
                          >
                            <div className="flex justify-between items-start gap-2">
                              <p className="leading-relaxed text-left">{notif.text}</p>
                              {!notif.read && (
                                <span className="h-1.5 w-1.5 rounded-full bg-brand-600 shrink-0 mt-1" />
                              )}
                            </div>
                            <span className="text-[9px] text-ink-400 mt-1.5 block text-left">{notif.time}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {user ? (
            <div className="relative">
              <button
                onClick={() => {
                  setIsDropdownOpen(!isDropdownOpen);
                  setIsNotifOpen(false); // Close notification dropdown
                }}
                className="flex items-center gap-3 border-r border-ink-100 pr-4 hover:opacity-85 transition focus:outline-none text-left"
              >
                {/* User Avatar with Initials */}
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-100 text-brand-800 text-xs font-bold border border-brand-200">
                  {getInitials() || <UserIcon className="h-4 w-4" />}
                </div>
                
                <div className="hidden sm:block">
                  <p className="text-xs font-semibold text-ink-900">{user.name}</p>
                  <p className="text-xxs text-ink-500">{user.email}</p>
                </div>
              </button>

              {isDropdownOpen && (
                <>
                  {/* Invisible backdrop */}
                  <div className="fixed inset-0 z-40" onClick={() => setIsDropdownOpen(false)} />
                  
                  {/* Dropdown Card */}
                  <div className="absolute right-0 mt-2.5 w-80 rounded-2xl border border-ink-100 bg-white p-5 shadow-2xl z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                    {/* Active Account Info */}
                    <div className="flex flex-col items-center text-center pb-4 border-b border-ink-100">
                      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-100 text-brand-800 text-xl font-bold border border-brand-200 shadow-sm">
                        {getInitials() || <UserIcon className="h-8 w-8" />}
                      </div>
                      <h4 className="mt-3 font-semibold text-ink-900 text-sm leading-snug">{user.name}</h4>
                      <p className="text-xs text-ink-500 leading-normal">{user.email}</p>
                      {user.phoneNumber && (
                        <p className="text-xxs text-ink-400 mt-0.5">{user.phoneNumber}</p>
                      )}
                    </div>

                    {/* Other Accounts List */}
                    {otherAccounts.length > 0 && (
                      <div className="py-3 border-b border-ink-100 max-h-48 overflow-y-auto">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-400 mb-2">
                          Switch Account
                        </p>
                        <div className="space-y-1">
                          {otherAccounts.map((acc) => {
                            const accInitials = getInitials(acc.name);
                            return (
                              <div
                                key={acc.id}
                                onClick={() => void handleSwitch(acc)}
                                className="group flex items-center justify-between p-2 rounded-xl hover:bg-ink-50 cursor-pointer transition"
                              >
                                <div className="flex items-center gap-2.5">
                                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-100 text-ink-700 text-xs font-semibold border border-ink-200">
                                    {accInitials || <UserIcon className="h-3 w-3" />}
                                  </div>
                                  <div className="text-left">
                                    <p className="text-xs font-medium text-ink-900 leading-tight">{acc.name}</p>
                                    <p className="text-xxs text-ink-500 leading-tight">{acc.email}</p>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={(e) => handleRemoveAccount(acc.id, e)}
                                  className="p-1 rounded-md text-ink-400 hover:text-red-600 hover:bg-red-50 transition"
                                  title="Sign out of this account"
                                >
                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Switcher Actions */}
                    <div className="pt-3 space-y-2 flex flex-col">
                      <Link
                        href={`/login?addAccount=true`}
                        onClick={() => setIsDropdownOpen(false)}
                        className="flex items-center justify-center gap-2 rounded-xl border border-ink-200 px-4 py-2 text-xs font-semibold text-ink-700 hover:bg-ink-50 transition-colors"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        <span>Add another account</span>
                      </Link>

                      <div className="flex gap-2">
                        <button
                          onClick={() => void handleSingleLogout()}
                          className="flex-1 rounded-xl border border-red-100 bg-red-50/50 hover:bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition"
                        >
                          Sign out
                        </button>
                        <button
                          onClick={() => void handleSignOutAll()}
                          className="flex-1 rounded-xl border border-ink-200 bg-white hover:bg-ink-50 px-3 py-2 text-xs font-semibold text-ink-700 transition"
                        >
                          Sign out all
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-3 border-r border-ink-100 pr-4">
              <div className="animate-pulse flex h-9 w-9 items-center justify-center rounded-xl bg-ink-100 text-ink-300 border border-ink-200">
                <UserIcon className="h-4 w-4" />
              </div>
              <div className="hidden sm:block space-y-1">
                <div className="h-3 w-16 bg-ink-100 rounded animate-pulse" />
                <div className="h-2 w-24 bg-ink-100 rounded animate-pulse" />
              </div>
            </div>
          )}
          <Link
            href="/settings"
            className="p-2 rounded-xl text-ink-600 hover:text-ink-900 hover:bg-ink-100/50 transition focus:outline-none ml-1"
            aria-label="Settings"
          >
            <SettingsIcon className="h-5 w-5" />
          </Link>
        </div>

      </div>
    </header>
  );
}