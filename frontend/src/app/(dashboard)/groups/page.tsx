'use client';

import { useEffect, useState } from 'react';
import { fetchGroups, createGroup, inviteToGroup, type Group, fetchCurrentUser, fetchGroupExpenses } from '../../../lib/api';
import { AuthUser, Expense } from '../../../lib/types';
import { formatCurrency, totalExpenses, categoryBreakdown } from '../../../lib/finance';

export default function GroupsPage() {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [newGroupName, setNewGroupName] = useState('');
  const [inviteEmails, setInviteEmails] = useState<Record<string, string>>({});
  const [invitePhones, setInvitePhones] = useState<Record<string, string>>({});

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [expandedGroupIds, setExpandedGroupIds] = useState<Record<string, boolean>>({});
  const [groupExpensesData, setGroupExpensesData] = useState<Record<string, Expense[]>>({});
  const [loadingExpenses, setLoadingExpenses] = useState<Record<string, boolean>>({});

  async function toggleGroupAnalytics(groupId: string) {
    const isExpanded = !!expandedGroupIds[groupId];
    setExpandedGroupIds(prev => ({ ...prev, [groupId]: !isExpanded }));

    if (!isExpanded && !groupExpensesData[groupId]) {
      try {
        setLoadingExpenses(prev => ({ ...prev, [groupId]: true }));
        const data = await fetchGroupExpenses(groupId);
        setGroupExpensesData(prev => ({ ...prev, [groupId]: data }));
      } catch (err) {
        console.error('Failed to load group expenses', err);
      } finally {
        setLoadingExpenses(prev => ({ ...prev, [groupId]: false }));
      }
    }
  }

  async function loadData() {
    try {
      setLoading(true);
      const userRes = await fetchCurrentUser();
      setCurrentUser(userRes);
      const groupsRes = await fetchGroups();
      setGroups(groupsRes);
    } catch (err) {
      console.error(err);
      setError('Failed to load groups data.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function handleCreateGroup(e: React.FormEvent) {
    e.preventDefault();
    if (!newGroupName.trim()) return;

    setSubmitting(true);
    setError('');
    setSuccessMsg('');
    try {
      await createGroup(newGroupName);
      setNewGroupName('');
      setSuccessMsg('Group created successfully!');
      const groupsRes = await fetchGroups();
      setGroups(groupsRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create group.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSendInvite(groupId: string, e: React.FormEvent) {
    e.preventDefault();
    const email = inviteEmails[groupId]?.trim();
    const phone = invitePhones[groupId]?.trim();

    if (!email && !phone) {
      alert('Please fill in either email or phone number to invite.');
      return;
    }

    setError('');
    setSuccessMsg('');
    try {
      await inviteToGroup(groupId, { email: email || undefined, phoneNumber: phone || undefined });
      setSuccessMsg('Invitation sent successfully!');
      setInviteEmails(prev => ({ ...prev, [groupId]: '' }));
      setInvitePhones(prev => ({ ...prev, [groupId]: '' }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send invitation.');
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen px-4 py-8 sm:px-6 lg:px-8 bg-ink-50">
        <div className="mx-auto max-w-5xl space-y-6">
          <div className="h-10 w-48 bg-ink-100 rounded animate-pulse" />
          <div className="grid gap-6 md:grid-cols-2">
            <div className="h-64 bg-white rounded-3xl animate-pulse border border-ink-100" />
            <div className="h-64 bg-white rounded-3xl animate-pulse border border-ink-100" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-8 sm:px-6 lg:px-8 bg-ink-50 text-ink-900">
      <div className="mx-auto max-w-5xl space-y-6">
        
        {/* Header */}
        <header className="space-y-2">
          <h1 className="font-display text-4xl font-semibold tracking-tight text-ink-900">
            Groups
          </h1>
          <p className="text-sm text-ink-500">
            Co-manage expenses, coordinate shared balances, and invite your contacts.
          </p>
        </header>

        {/* Global Alert Messages */}
        {error && (
          <div className="rounded-3xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div>
        )}
        {successMsg && (
          <div className="rounded-3xl border border-brand-200 bg-brand-50 px-5 py-4 text-sm text-brand-700">{successMsg}</div>
        )}

        <div className="grid gap-6 md:grid-cols-[1fr_1.8fr]">
          
          {/* Create Group Column */}
          <aside className="space-y-6">
            <div className="cash-card p-6 bg-white space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-ink-900">Create New Group</h3>
                <p className="text-xxs text-ink-500 mt-1">Start a joint dashboard with peers.</p>
              </div>

              <form onSubmit={handleCreateGroup} className="space-y-3">
                <div>
                  <label htmlFor="groupName" className="cash-label">Group Name</label>
                  <input
                    id="groupName"
                    className="cash-input"
                    value={newGroupName}
                    onChange={e => setNewGroupName(e.target.value)}
                    placeholder="e.g. Shared Apartment"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="cash-button-primary w-full text-xs font-semibold py-2.5"
                >
                  {submitting ? 'Creating...' : 'Create Group'}
                </button>
              </form>
            </div>
          </aside>

          {/* Groups List Column */}
          <main className="space-y-6">
            {groups.length === 0 ? (
              <div className="cash-card p-12 bg-white text-center flex flex-col items-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-700 mb-3 border border-brand-100">
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <h4 className="font-semibold text-ink-900 text-sm">No groups yet</h4>
                <p className="text-xs text-ink-500 mt-1 max-w-sm">Create a group on the left to start inviting members.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {groups.map((group) => {
                  const isOwner = currentUser?.id === group.ownerId;
                  return (
                    <article key={group.id} className="cash-card p-6 bg-white space-y-4">
                      {/* Group Header info */}
                      <div className="flex justify-between items-start border-b border-ink-100 pb-3">
                        <div>
                          <h4 className="font-bold text-ink-900 text-base">{group.name}</h4>
                          <p className="text-xxs text-ink-400 mt-0.5">
                            Created on {new Date(group.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          isOwner
                            ? 'bg-brand-50 border-brand-200 text-brand-700'
                            : 'bg-ink-50 border-ink-200 text-ink-600'
                        }`}>
                          {isOwner ? 'Owner' : 'Member'}
                        </span>
                      </div>

                      {/* Group Members */}
                      <div className="space-y-2">
                        <p className="text-xxs font-semibold uppercase tracking-wider text-ink-400">
                          Members ({group.members.length})
                        </p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {group.members.map((member) => (
                            <div key={member.id} className="flex items-center gap-2 p-2 border border-ink-100 rounded-xl bg-ink-50/20 text-xxs">
                              <div className="h-6 w-6 flex items-center justify-center rounded-lg bg-ink-100 text-ink-700 font-bold">
                                {member.name.split(' ').map(n => n[0]).slice(0,2).join('').toUpperCase()}
                              </div>
                              <div className="text-left truncate">
                                <p className="font-semibold text-ink-900 truncate">{member.name}</p>
                                <p className="text-ink-500 truncate mt-0.5">{member.email}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Group Analytics Toggle */}
                      <div className="pt-2 border-t border-ink-100 text-left">
                        <button
                          type="button"
                          onClick={() => void toggleGroupAnalytics(group.id)}
                          className="flex items-center gap-1.5 text-xxs font-semibold uppercase tracking-wider text-brand-700 hover:text-brand-800 transition"
                        >
                          <svg
                            className={`h-3 w-3 transform transition-transform duration-200 ${
                              expandedGroupIds[group.id] ? 'rotate-180' : ''
                            }`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                          {expandedGroupIds[group.id] ? 'Hide Group Reports' : 'Show Group Analytics & Reports'}
                        </button>

                        {expandedGroupIds[group.id] && (
                          <div className="mt-4 p-4 rounded-2xl border border-ink-100 bg-ink-50/30 text-left space-y-4 animate-in fade-in duration-200">
                            {loadingExpenses[group.id] ? (
                              <div className="space-y-2 py-4">
                                <div className="h-6 w-32 bg-ink-100 rounded animate-pulse" />
                                <div className="h-20 bg-white rounded-xl border border-ink-100 animate-pulse" />
                              </div>
                            ) : (() => {
                              const expList = groupExpensesData[group.id] || [];
                              const groupTotal = totalExpenses(expList);
                              const groupCategories = categoryBreakdown(expList);

                              const memberTotals = new Map<string, number>();
                              // Initialize all current group members with 0 spend so they all show up in list
                              group.members.forEach(m => memberTotals.set(m.name, 0));
                              expList.forEach((exp) => {
                                const memberName = exp.user?.name || 'Unknown';
                                memberTotals.set(memberName, (memberTotals.get(memberName) ?? 0) + exp.amount);
                              });
                              const memberBreakdown = Array.from(memberTotals.entries())
                                .map(([name, value]) => ({ name, value }))
                                .sort((a, b) => b.value - a.value);

                              return (
                                <div className="space-y-4">
                                  <div className="flex justify-between items-baseline">
                                    <p className="text-xxs font-semibold uppercase tracking-wider text-ink-400">Total Group Expenses</p>
                                    <p className="text-xl font-bold text-ink-900">{formatCurrency(groupTotal)}</p>
                                  </div>

                                  <div className="grid gap-4 sm:grid-cols-2 pt-2 border-t border-ink-100">
                                    {/* Categories list */}
                                    <div className="space-y-2">
                                      <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">By Category</p>
                                      {groupCategories.length === 0 ? (
                                        <p className="text-xxs text-ink-400 py-2">No expenses recorded.</p>
                                      ) : (
                                        <div className="space-y-1.5">
                                          {groupCategories.map((c) => {
                                            const pct = groupTotal > 0 ? ((c.value / groupTotal) * 100).toFixed(0) : '0';
                                            return (
                                              <div key={c.name} className="flex justify-between text-xxs">
                                                <span className="text-ink-600 font-medium">{c.name}</span>
                                                <span className="text-ink-900 font-semibold">
                                                  {formatCurrency(c.value)} <span className="text-ink-400 font-normal">({pct}%)</span>
                                                </span>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>

                                    {/* Members contribution list */}
                                    <div className="space-y-2">
                                      <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">By Member</p>
                                      <div className="space-y-1.5">
                                        {memberBreakdown.map((m) => {
                                          const pct = groupTotal > 0 ? ((m.value / groupTotal) * 100).toFixed(0) : '0';
                                          return (
                                            <div key={m.name} className="flex justify-between text-xxs">
                                              <span className="text-ink-600 font-medium">{m.name}</span>
                                              <span className="text-ink-900 font-semibold">
                                                {formatCurrency(m.value)} <span className="text-ink-400 font-normal">({pct}%)</span>
                                              </span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        )}
                      </div>

                      {/* Invite members form (Owner Only) */}
                      {isOwner && (
                        <div className="pt-4 border-t border-ink-100 space-y-3">
                          <h5 className="text-xxs font-semibold uppercase tracking-wider text-ink-400">
                            Invite Members
                          </h5>
                          <form onSubmit={(e) => handleSendInvite(group.id, e)} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                            <input
                              className="cash-input text-xs py-2"
                              value={inviteEmails[group.id] || ''}
                              onChange={e => setInviteEmails(prev => ({ ...prev, [group.id]: e.target.value }))}
                              placeholder="Email address"
                              type="email"
                            />
                            <input
                              className="cash-input text-xs py-2"
                              value={invitePhones[group.id] || ''}
                              onChange={e => setInvitePhones(prev => ({ ...prev, [group.id]: e.target.value }))}
                              placeholder="Phone number"
                            />
                            <button
                              type="submit"
                              className="cash-button-primary text-xs py-2 px-4 shrink-0 font-semibold"
                            >
                              Send Invite
                            </button>
                          </form>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </main>
        </div>

      </div>
    </div>
  );
}
