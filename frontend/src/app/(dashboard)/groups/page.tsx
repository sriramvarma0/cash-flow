'use client';

import { useEffect, useState, useMemo } from 'react';
import {
  fetchGroups,
  fetchGroupDetail,
  createGroup,
  inviteToGroup,
  requestToJoinGroup,
  fetchGroupJoinRequests,
  respondToJoinRequest,
  fetchMySentJoinRequests,
  toggleGroupAdmin,
  fetchGroupExpenses,
  fetchCurrentUser,
  type Group,
  type GroupDetail,
  type GroupMember,
  type GroupJoinRequest
} from '../../../lib/api';
import { AuthUser, Expense } from '../../../lib/types';
import { formatCurrency } from '../../../lib/finance';

export default function GroupsPage() {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [joinRequests, setJoinRequests] = useState<GroupJoinRequest[]>([]);
  const [mySentRequests, setMySentRequests] = useState<GroupJoinRequest[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTabFilter, setActiveTabFilter] = useState<'ALL' | 'OWNED' | 'ADMIN' | 'MEMBER' | 'PENDING'>('ALL');

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);

  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [joinGroupIdInput, setJoinGroupIdInput] = useState('');
  const [joiningGroup, setJoiningGroup] = useState(false);

  // Openable Group Detail Modal
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [groupDetail, setGroupDetail] = useState<GroupDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailTab, setDetailTab] = useState<'overview' | 'members' | 'requests' | 'invites' | 'add_people'>('overview');
  const [groupExpenses, setGroupExpenses] = useState<Expense[]>([]);
  const [loadingExpenses, setLoadingExpenses] = useState(false);

  // Add people form inside detail modal
  const [inviteUserId, setInviteUserId] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePhone, setInvitePhone] = useState('');
  const [invitingMember, setInvitingMember] = useState(false);
  const [togglingAdminId, setTogglingAdminId] = useState<string | null>(null);

  async function loadData() {
    try {
      setLoading(true);
      const [userRes, groupsRes, joinReqsRes, mySentReqsRes] = await Promise.all([
        fetchCurrentUser(),
        fetchGroups(),
        fetchGroupJoinRequests().catch(() => []),
        fetchMySentJoinRequests().catch(() => [])
      ]);
      setCurrentUser(userRes);
      setGroups(groupsRes);
      setJoinRequests(joinReqsRes);
      setMySentRequests(mySentReqsRes);
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

  async function openGroupDetail(groupId: string) {
    setSelectedGroupId(groupId);
    setDetailTab('overview');
    setLoadingDetail(true);
    setGroupDetail(null);
    setGroupExpenses([]);
    setError('');
    setSuccessMsg('');

    try {
      const [detail, expenses] = await Promise.all([
        fetchGroupDetail(groupId),
        fetchGroupExpenses(groupId).catch(() => [])
      ]);
      setGroupDetail(detail);
      setGroupExpenses(expenses);
    } catch (err) {
      console.error('Failed to open group detail:', err);
      setError(err instanceof Error ? err.message : 'Failed to load group details.');
    } finally {
      setLoadingDetail(false);
    }
  }

  function closeGroupDetail() {
    setSelectedGroupId(null);
    setGroupDetail(null);
    setInviteUserId('');
    setInviteEmail('');
    setInvitePhone('');
  }

  async function handleCreateGroup(e: React.FormEvent) {
    e.preventDefault();
    if (!newGroupName.trim()) return;

    setCreatingGroup(true);
    setError('');
    setSuccessMsg('');
    try {
      const created = await createGroup(newGroupName.trim());
      setNewGroupName('');
      setIsCreateModalOpen(false);
      setSuccessMsg(`Group "${created.name}" created successfully!`);
      const updated = await fetchGroups();
      setGroups(updated);
      void openGroupDetail(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create group.');
    } finally {
      setCreatingGroup(false);
    }
  }

  async function handleRequestJoinGroup(e: React.FormEvent) {
    e.preventDefault();
    const cleanId = joinGroupIdInput.trim().toUpperCase();
    if (!cleanId) return;

    setJoiningGroup(true);
    setError('');
    setSuccessMsg('');
    try {
      const res = await requestToJoinGroup(cleanId);
      setSuccessMsg(res.message);
      setJoinGroupIdInput('');
      setIsJoinModalOpen(false);
      const [groupsRes, mySentReqsRes] = await Promise.all([
        fetchGroups(),
        fetchMySentJoinRequests().catch(() => [])
      ]);
      setGroups(groupsRes);
      setMySentRequests(mySentReqsRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send join request.');
    } finally {
      setJoiningGroup(false);
    }
  }

  async function handleRespondJoinRequest(requestId: string, accept: boolean) {
    setError('');
    setSuccessMsg('');
    try {
      const res = await respondToJoinRequest(requestId, accept);
      setSuccessMsg(res.message);
      const [groupsRes, joinReqsRes] = await Promise.all([
        fetchGroups(),
        fetchGroupJoinRequests().catch(() => [])
      ]);
      setGroups(groupsRes);
      setJoinRequests(joinReqsRes);

      if (selectedGroupId) {
        const refreshed = await fetchGroupDetail(selectedGroupId);
        setGroupDetail(refreshed);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to respond to join request.');
    }
  }

  async function handleSendInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedGroupId) return;

    const uId = inviteUserId.trim();
    const email = inviteEmail.trim();
    const phone = invitePhone.trim();

    if (!uId && !email && !phone) {
      alert('Please fill in User ID, email, or phone number to invite.');
      return;
    }

    setInvitingMember(true);
    setError('');
    setSuccessMsg('');
    try {
      await inviteToGroup(selectedGroupId, {
        userId: uId || undefined,
        email: email || undefined,
        phoneNumber: phone || undefined
      });
      setSuccessMsg('Invitation sent successfully!');
      setInviteUserId('');
      setInviteEmail('');
      setInvitePhone('');

      const [groupsRes, refreshed] = await Promise.all([
        fetchGroups(),
        fetchGroupDetail(selectedGroupId)
      ]);
      setGroups(groupsRes);
      setGroupDetail(refreshed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send invitation.');
    } finally {
      setInvitingMember(false);
    }
  }

  async function handleToggleAdmin(memberId: string) {
    if (!selectedGroupId) return;

    setTogglingAdminId(memberId);
    setError('');
    setSuccessMsg('');
    try {
      const res = await toggleGroupAdmin(selectedGroupId, memberId);
      setSuccessMsg(res.message);

      const [groupsRes, refreshed] = await Promise.all([
        fetchGroups(),
        fetchGroupDetail(selectedGroupId)
      ]);
      setGroups(groupsRes);
      setGroupDetail(refreshed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update admin role.');
    } finally {
      setTogglingAdminId(null);
    }
  }

  const groupMetrics = useMemo(() => {
    const totalGroups = groups.length;
    const ownedGroups = groups.filter((g) => currentUser && g.ownerId === currentUser.id).length;
    const adminGroups = groups.filter((g) => {
      if (!currentUser) return false;
      if (g.ownerId === currentUser.id) return false;
      try {
        const admins = JSON.parse(g.adminIds || '[]');
        return Array.isArray(admins) && admins.includes(currentUser.id);
      } catch {
        return false;
      }
    }).length;
    const pendingTotal = joinRequests.length + mySentRequests.length;

    return {
      totalGroups,
      ownedGroups,
      adminGroups,
      pendingTotal
    };
  }, [groups, currentUser, joinRequests, mySentRequests]);

  const filteredGroups = useMemo(() => {
    let list = groups;

    if (activeTabFilter === 'OWNED') {
      list = list.filter((g) => currentUser && g.ownerId === currentUser.id);
    } else if (activeTabFilter === 'ADMIN') {
      list = list.filter((g) => {
        if (!currentUser || g.ownerId === currentUser.id) return false;
        try {
          const admins = JSON.parse(g.adminIds || '[]');
          return Array.isArray(admins) && admins.includes(currentUser.id);
        } catch {
          return false;
        }
      });
    } else if (activeTabFilter === 'MEMBER') {
      list = list.filter((g) => {
        if (!currentUser || g.ownerId === currentUser.id) return false;
        try {
          const admins = JSON.parse(g.adminIds || '[]');
          return !admins.includes(currentUser.id);
        } catch {
          return true;
        }
      });
    }

    const q = searchQuery.trim().toLowerCase();
    if (!q) return list;

    return list.filter((g) => {
      const matchName = g.name.toLowerCase().includes(q);
      const matchId = g.id.toLowerCase().includes(q);
      const matchOwner = (g.owner?.name || '').toLowerCase().includes(q);
      const matchMember = g.members?.some(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.id.toLowerCase().includes(q) ||
          m.email.toLowerCase().includes(q)
      );
      return matchName || matchId || matchOwner || matchMember;
    });
  }, [groups, searchQuery, activeTabFilter, currentUser]);

  if (loading) {
    return (
      <div className="min-h-screen px-4 py-8 sm:px-6 lg:px-8 bg-ink-50">
        <div className="mx-auto max-w-7xl space-y-6 text-left">
          <div className="h-10 w-48 bg-ink-150 rounded animate-pulse" />
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="h-28 bg-white rounded-3xl border border-ink-100 animate-pulse" />
            <div className="h-28 bg-white rounded-3xl border border-ink-100 animate-pulse" />
            <div className="h-28 bg-white rounded-3xl border border-ink-100 animate-pulse" />
            <div className="h-28 bg-white rounded-3xl border border-ink-100 animate-pulse" />
          </div>
          <div className="h-80 bg-white rounded-3xl border border-ink-100 animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-8 sm:px-6 lg:px-8 bg-ink-50 text-ink-900 text-left animate-in fade-in duration-200">
      <div className="mx-auto max-w-7xl space-y-6">

        {/* Standard Header */}
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-ink-100 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="font-display text-4xl font-semibold tracking-tight text-ink-900">
                Groups & Shared Expenses
              </h1>
              {currentUser && (
                <div className="flex items-center gap-1.5 bg-brand-50 border border-brand-200 px-3 py-1 rounded-xl text-xs">
                  <span className="text-[10px] uppercase font-bold text-brand-700">Your User ID:</span>
                  <span className="font-mono font-bold text-brand-900">{currentUser.id}</span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(currentUser.id);
                      alert(`Your User ID ${currentUser.id} copied to clipboard!`);
                    }}
                    title="Copy your User ID"
                    className="ml-0.5 text-brand-600 hover:text-brand-900 transition text-xs"
                  >
                    📋
                  </button>
                </div>
              )}
            </div>
            <p className="text-sm text-ink-500">
              Co-manage expenses, coordinate shared balances, promote admins, and invite members by User ID, email, or phone.
            </p>
          </div>

          <div className="flex items-center gap-2.5 self-start sm:self-center">
            <button
              onClick={() => setIsJoinModalOpen(true)}
              className="px-4 py-2.5 bg-white border border-ink-200 hover:bg-ink-100 text-ink-800 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition"
            >
              <span>🙋 Join by Group ID</span>
            </button>
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="cash-button-primary py-2.5 px-4 text-xs font-semibold flex items-center gap-1.5 shadow-sm"
            >
              <span>➕ Create Group</span>
            </button>
          </div>
        </header>

        {/* Global Alerts */}
        {error && (
          <div className="rounded-3xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700 animate-in fade-in duration-150">
            {error}
          </div>
        )}
        {successMsg && (
          <div className="rounded-3xl border border-brand-200 bg-brand-50 px-5 py-4 text-sm text-brand-700 animate-in fade-in duration-150">
            {successMsg}
          </div>
        )}

        {/* Pending Requests Alert Banner for Owners & Admins */}
        {joinRequests.length > 0 && (
          <div className="rounded-3xl border border-amber-300 bg-amber-50/80 p-5 space-y-3 text-left animate-in fade-in duration-150 shadow-2xs">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-amber-900 flex items-center gap-2">
                <span>🔔 Pending Member Join Requests</span>
                <span className="text-xs bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full font-bold">
                  {joinRequests.length}
                </span>
              </h3>
              <span className="text-xs text-amber-700">Review requests from users seeking to join your groups</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {joinRequests.map((req) => (
                <div key={req.id} className="p-3.5 bg-white rounded-2xl border border-amber-200 flex items-center justify-between gap-3 text-xs shadow-2xs">
                  <div>
                    <p className="font-bold text-ink-900 flex items-center gap-1.5">
                      <span>Group: {req.group.name}</span>
                      <span className="font-mono text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded font-bold">
                        {req.group.id}
                      </span>
                    </p>
                    <p className="text-[11px] text-ink-600 mt-0.5">
                      Requester: <strong>{req.inviteeEmail || req.inviteePhone || 'User'}</strong>
                    </p>
                    <p className="text-xxs text-ink-400 mt-0.5">
                      Requested on {new Date(req.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleRespondJoinRequest(req.id, true)}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition shadow-xs"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRespondJoinRequest(req.id, false)}
                      className="px-2.5 py-1.5 border border-ink-200 hover:bg-ink-100 text-ink-600 rounded-xl text-xs font-semibold transition"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Top 4-Card Stats Grid */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-left">
          <article className="cash-card p-5 bg-white border border-ink-150">
            <p className="text-xs font-semibold text-ink-500">Active Groups</p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-ink-900">
              {groupMetrics.totalGroups}
            </p>
            <div className="mt-2 text-xs text-ink-400">Total joint dashboards</div>
          </article>

          <article className="cash-card p-5 bg-white border border-ink-150">
            <p className="text-xs font-semibold text-brand-700">👑 Owned Groups</p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-brand-900">
              {groupMetrics.ownedGroups}
            </p>
            <div className="mt-2 text-xs text-ink-400">You are the primary owner</div>
          </article>

          <article className="cash-card p-5 bg-white border border-ink-150">
            <p className="text-xs font-semibold text-purple-700">🛡️ Admin Roles</p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-purple-900">
              {groupMetrics.adminGroups}
            </p>
            <div className="mt-2 text-xs text-ink-400">Can add members & approve joins</div>
          </article>

          <article className="cash-card p-5 bg-white border border-ink-150">
            <p className="text-xs font-semibold text-amber-700">⏳ Pending Approvals</p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-amber-900">
              {groupMetrics.pendingTotal}
            </p>
            <div className="mt-2 text-xs text-ink-400">
              {joinRequests.length} incoming • {mySentRequests.length} sent
            </div>
          </article>
        </section>

        {/* Search & Filter Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
          {/* Tabs Filter */}
          <div className="flex items-center gap-1.5 p-1 bg-ink-100 rounded-2xl self-start">
            <button
              onClick={() => setActiveTabFilter('ALL')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                activeTabFilter === 'ALL'
                  ? 'bg-white text-ink-900 shadow-2xs'
                  : 'text-ink-600 hover:text-ink-900'
              }`}
            >
              All ({groups.length})
            </button>
            <button
              onClick={() => setActiveTabFilter('OWNED')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                activeTabFilter === 'OWNED'
                  ? 'bg-white text-ink-900 shadow-2xs'
                  : 'text-ink-600 hover:text-ink-900'
              }`}
            >
              👑 Owned ({groupMetrics.ownedGroups})
            </button>
            <button
              onClick={() => setActiveTabFilter('ADMIN')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                activeTabFilter === 'ADMIN'
                  ? 'bg-white text-ink-900 shadow-2xs'
                  : 'text-ink-600 hover:text-ink-900'
              }`}
            >
              🛡️ Admin ({groupMetrics.adminGroups})
            </button>
            <button
              onClick={() => setActiveTabFilter('MEMBER')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                activeTabFilter === 'MEMBER'
                  ? 'bg-white text-ink-900 shadow-2xs'
                  : 'text-ink-600 hover:text-ink-900'
              }`}
            >
              Member ({groups.length - groupMetrics.ownedGroups - groupMetrics.adminGroups})
            </button>
            {mySentRequests.length > 0 && (
              <button
                onClick={() => setActiveTabFilter('PENDING')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                  activeTabFilter === 'PENDING'
                    ? 'bg-white text-amber-900 shadow-2xs'
                    : 'text-amber-700 hover:text-amber-900'
                }`}
              >
                ⏳ Pending ({mySentRequests.length})
              </button>
            )}
          </div>

          {/* Search Box */}
          <div className="flex items-center gap-2 bg-white px-3.5 py-2 rounded-2xl border border-ink-150 shadow-2xs sm:w-72">
            <span className="text-ink-400 text-xs">🔍</span>
            <input
              type="text"
              placeholder="Search by name, ID (G...), or member..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-transparent text-xs text-ink-900 placeholder:text-ink-400 focus:outline-hidden"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-xs text-ink-400 hover:text-ink-700"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Groups Cards Grid (Dashboard Style) */}
        <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">

          {/* "Create New Group" Card (Matching Custom Dashboards pattern) */}
          <div
            onClick={() => setIsCreateModalOpen(true)}
            className="p-6 cursor-pointer rounded-3xl border-2 border-dashed border-ink-200 hover:border-brand-500 bg-white/60 hover:bg-brand-50/20 flex flex-col items-center justify-center text-center gap-3 transition-all duration-300 min-h-[220px] shadow-2xs hover:shadow-sm group"
          >
            <div className="rounded-full bg-brand-50 group-hover:bg-brand-100 p-3 text-brand-600 transition">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold text-ink-900 group-hover:text-brand-900 transition">
                Create New Group
              </p>
              <p className="text-xs text-ink-500 mt-1 max-w-xs">
                Start a joint dashboard to co-manage expenses, split bills, and assign admins.
              </p>
            </div>
            <span className="text-xxs font-semibold text-brand-600 bg-brand-50 border border-brand-200 px-2.5 py-0.5 rounded-full">
              ➕ Add Group
            </span>
          </div>

          {/* Active Groups Cards */}
          {activeTabFilter !== 'PENDING' && filteredGroups.map((group) => {
            const isOwner = currentUser?.id === group.ownerId;
            let isAdmin = false;
            try {
              const admins = JSON.parse(group.adminIds || '[]');
              isAdmin = Array.isArray(admins) && admins.includes(currentUser?.id);
            } catch {
              isAdmin = false;
            }

            return (
              <div
                key={group.id}
                onClick={() => openGroupDetail(group.id)}
                className="cash-card p-6 bg-white border border-ink-150 hover:border-brand-400 hover:shadow-md transition-all duration-200 flex flex-col justify-between cursor-pointer group text-left relative overflow-hidden"
              >
                <div className="space-y-3">
                  {/* Top Bar: Group ID & Role Badge */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="inline-flex items-center gap-1.5 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-lg text-xs font-mono font-bold text-amber-800">
                      <span>{group.id}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(group.id);
                          alert(`Group ID ${group.id} copied!`);
                        }}
                        title="Copy Group ID"
                        className="text-amber-600 hover:text-amber-900 transition text-[10px]"
                      >
                        📋
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {isOwner ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-50 border border-brand-200 text-brand-700">
                          👑 Owner
                        </span>
                      ) : isAdmin ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 border border-purple-200 text-purple-700">
                          🛡️ Admin
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-ink-100 border border-ink-200 text-ink-600">
                          Member
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Group Name & Owner */}
                  <div>
                    <h3 className="font-bold text-ink-900 text-lg group-hover:text-brand-900 transition line-clamp-1">
                      {group.name}
                    </h3>
                    <p className="text-xs text-ink-500 mt-0.5">
                      Owner: <strong>{group.owner?.name || 'Group Owner'}</strong>
                    </p>
                  </div>

                  {/* Member Avatars Pile */}
                  <div className="pt-2">
                    <p className="text-[11px] font-semibold text-ink-400 mb-1.5">
                      {group.members.length} {group.members.length === 1 ? 'Member' : 'Members'}
                    </p>
                    <div className="flex items-center -space-x-2 overflow-hidden">
                      {group.members.slice(0, 5).map((m) => (
                        <div
                          key={m.id}
                          title={`${m.name} (${m.email})`}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-ink-100 border-2 border-white text-[10px] font-bold text-ink-700"
                        >
                          {m.name.charAt(0).toUpperCase()}
                        </div>
                      ))}
                      {group.members.length > 5 && (
                        <div className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-brand-50 border-2 border-white text-[10px] font-bold text-brand-700">
                          +{group.members.length - 5}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Bottom Card Footer */}
                <div className="pt-4 mt-4 border-t border-ink-100 flex items-center justify-between text-xs text-ink-500">
                  <span className="text-xxs text-ink-400">
                    Created {new Date(group.createdAt).toLocaleDateString()}
                  </span>
                  <span className="text-brand-600 font-semibold group-hover:translate-x-1 transition flex items-center gap-1">
                    Open Details ➔
                  </span>
                </div>
              </div>
            );
          })}

          {/* Pending Approval Cards (From sent join requests) */}
          {(activeTabFilter === 'ALL' || activeTabFilter === 'PENDING') && mySentRequests.map((req) => (
            <div
              key={req.id}
              onClick={() => openGroupDetail(req.group.id)}
              className="cash-card p-6 bg-amber-50/40 border border-amber-300 hover:border-amber-400 hover:shadow-md transition-all duration-200 flex flex-col justify-between cursor-pointer group text-left relative overflow-hidden"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-bold bg-amber-100 text-amber-900 px-2 py-0.5 rounded-lg border border-amber-200">
                    {req.group.id}
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 border border-amber-300 animate-pulse">
                    ⏳ Approval Pending
                  </span>
                </div>

                <div>
                  <h3 className="font-bold text-ink-900 text-lg group-hover:text-amber-900 transition line-clamp-1">
                    {req.group.name}
                  </h3>
                  <p className="text-xs text-ink-600 mt-1">
                    Owner: <strong>{req.group.owner?.name || req.group.ownerId}</strong>
                  </p>
                  <p className="text-xs text-amber-800 mt-2 bg-amber-100/60 p-2.5 rounded-xl border border-amber-200 leading-relaxed">
                    Your request to join this group has been submitted. Awaiting approval from the group owner or admins.
                  </p>
                </div>
              </div>

              <div className="pt-4 mt-4 border-t border-amber-200/60 flex items-center justify-between text-xs text-amber-800">
                <span className="text-xxs text-ink-400">
                  Requested on {new Date(req.createdAt).toLocaleDateString()}
                </span>
                <span className="text-amber-800 font-semibold group-hover:translate-x-1 transition">
                  View Info ➔
                </span>
              </div>
            </div>
          ))}

        </section>

        {/* Empty Search Result Message */}
        {filteredGroups.length === 0 && mySentRequests.length === 0 && (
          <div className="cash-card p-12 bg-white text-center border border-ink-150 space-y-3">
            <p className="text-sm font-semibold text-ink-700">No groups match your current filter or search</p>
            <p className="text-xs text-ink-400">Click &quot;Create New Group&quot; above to start a shared expense dashboard.</p>
          </div>
        )}

        {/* ========================================================= */}
        {/* OPENED GROUP DETAIL MODAL */}
        {/* ========================================================= */}
        {selectedGroupId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="cash-card max-w-3xl w-full p-6 bg-white animate-in zoom-in duration-200 max-h-[90vh] flex flex-col overflow-hidden shadow-2xl text-left border border-ink-200">

              {/* Modal Header */}
              <div className="flex items-start justify-between border-b border-ink-100 pb-4 shrink-0">
                <div className="space-y-1">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h2 className="text-2xl font-bold text-ink-900">
                      {groupDetail?.name || 'Group Details'}
                    </h2>
                    <div className="inline-flex items-center gap-1.5 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-lg text-xs font-mono font-bold text-amber-800">
                      <span>ID: {selectedGroupId}</span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(selectedGroupId);
                          alert(`Group ID ${selectedGroupId} copied to clipboard!`);
                        }}
                        title="Copy Group ID"
                        className="text-amber-600 hover:text-amber-900 transition text-[11px]"
                      >
                        📋
                      </button>
                    </div>

                    {groupDetail && (
                      <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                        groupDetail.isOwner
                          ? 'bg-brand-50 border-brand-200 text-brand-700'
                          : groupDetail.isAdmin
                          ? 'bg-purple-50 border-purple-200 text-purple-700'
                          : groupDetail.isMember
                          ? 'bg-ink-100 border-ink-200 text-ink-700'
                          : 'bg-amber-100 border-amber-300 text-amber-900'
                      }`}>
                        {groupDetail.isOwner
                          ? '👑 You are Owner'
                          : groupDetail.isAdmin
                          ? '🛡️ You are Admin'
                          : groupDetail.isMember
                          ? 'Member'
                          : '⏳ Pending Approval'}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-ink-500">
                    Owner: <strong>{groupDetail?.owner?.name || 'Owner'}</strong> • Created on{' '}
                    {groupDetail?.createdAt ? new Date(groupDetail.createdAt).toLocaleDateString() : ''}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeGroupDetail}
                  className="rounded-full p-2 text-ink-400 hover:text-ink-700 hover:bg-ink-100 transition"
                >
                  ✕
                </button>
              </div>

              {/* Modal Tabs Bar */}
              <div className="flex items-center gap-1 border-b border-ink-100 pt-3 pb-2 shrink-0 overflow-x-auto text-xs font-semibold">
                <button
                  onClick={() => setDetailTab('overview')}
                  className={`px-3 py-1.5 rounded-xl transition ${
                    detailTab === 'overview'
                      ? 'bg-brand-50 text-brand-700 font-bold'
                      : 'text-ink-500 hover:text-ink-900'
                  }`}
                >
                  📊 Overview & Expenses
                </button>

                <button
                  onClick={() => setDetailTab('members')}
                  className={`px-3 py-1.5 rounded-xl transition ${
                    detailTab === 'members'
                      ? 'bg-brand-50 text-brand-700 font-bold'
                      : 'text-ink-500 hover:text-ink-900'
                  }`}
                >
                  👥 Members ({groupDetail?.members?.length || 0})
                </button>

                <button
                  onClick={() => setDetailTab('requests')}
                  className={`px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 ${
                    detailTab === 'requests'
                      ? 'bg-brand-50 text-brand-700 font-bold'
                      : 'text-ink-500 hover:text-ink-900'
                  }`}
                >
                  <span>🔔 Join Requests</span>
                  {groupDetail?.joinRequests && groupDetail.joinRequests.length > 0 && (
                    <span className="bg-amber-200 text-amber-900 px-1.5 py-0.2 rounded-full text-xxs font-bold">
                      {groupDetail.joinRequests.length}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => setDetailTab('invites')}
                  className={`px-3 py-1.5 rounded-xl transition ${
                    detailTab === 'invites'
                      ? 'bg-brand-50 text-brand-700 font-bold'
                      : 'text-ink-500 hover:text-ink-900'
                  }`}
                >
                  📨 Sent Invites ({groupDetail?.invitations?.length || 0})
                </button>

                <button
                  onClick={() => setDetailTab('add_people')}
                  className={`px-3 py-1.5 rounded-xl transition ${
                    detailTab === 'add_people'
                      ? 'bg-brand-50 text-brand-700 font-bold'
                      : 'text-ink-500 hover:text-ink-900'
                  }`}
                >
                  ➕ Add People
                </button>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
                {loadingDetail ? (
                  <div className="p-8 text-center text-xs text-ink-400">Loading group information...</div>
                ) : !groupDetail ? (
                  <div className="p-8 text-center text-xs text-red-600">Failed to load group details.</div>
                ) : (
                  <>
                    {/* TAB: OVERVIEW & EXPENSES */}
                    {detailTab === 'overview' && (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          <div className="p-3.5 bg-ink-50/60 rounded-2xl border border-ink-150">
                            <span className="text-[11px] text-ink-400 font-semibold block">Total Shared Spent</span>
                            <span className="text-xl font-bold text-ink-900 mt-1 block">
                              {formatCurrency(groupExpenses.reduce((acc, e) => acc + (e.amount || 0), 0))}
                            </span>
                          </div>
                          <div className="p-3.5 bg-ink-50/60 rounded-2xl border border-ink-150">
                            <span className="text-[11px] text-ink-400 font-semibold block">Total Transactions</span>
                            <span className="text-xl font-bold text-ink-900 mt-1 block">
                              {groupExpenses.length}
                            </span>
                          </div>
                          <div className="p-3.5 bg-ink-50/60 rounded-2xl border border-ink-150 col-span-2 sm:col-span-1">
                            <span className="text-[11px] text-ink-400 font-semibold block">Total Members</span>
                            <span className="text-xl font-bold text-ink-900 mt-1 block">
                              {groupDetail.members.length}
                            </span>
                          </div>
                        </div>

                        {/* Group Expenses List */}
                        <div className="space-y-2">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-ink-500">
                            Recent Shared Transactions
                          </h4>
                          {groupExpenses.length === 0 ? (
                            <p className="text-xs text-ink-400 p-4 bg-ink-50 rounded-2xl border border-ink-150">
                              No expenses recorded in this group yet. Add group expenses from the Transactions page.
                            </p>
                          ) : (
                            <div className="divide-y divide-ink-100 border border-ink-150 rounded-2xl overflow-hidden bg-white">
                              {groupExpenses.slice(0, 8).map((exp) => (
                                <div key={exp.id} className="p-3 flex items-center justify-between text-xs">
                                  <div>
                                    <p className="font-semibold text-ink-900">{exp.description || exp.category || 'Expense'}</p>
                                    <p className="text-xxs text-ink-400">{new Date(exp.date).toLocaleDateString()}</p>
                                  </div>
                                  <span className="font-bold text-ink-900">{formatCurrency(exp.amount)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* TAB: MEMBERS */}
                    {detailTab === 'members' && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-ink-500">
                            Group Members ({groupDetail.members.length})
                          </h4>
                          {groupDetail.isOwner && (
                            <span className="text-[11px] text-purple-700 font-semibold">
                              👑 You can assign or revoke Group Admin status
                            </span>
                          )}
                        </div>

                        <div className="divide-y divide-ink-100 border border-ink-150 rounded-2xl overflow-hidden bg-white">
                          {groupDetail.members.map((member: GroupMember) => {
                            const isOwner = member.id === groupDetail.ownerId;
                            const isAdmin = member.isAdmin || member.role === 'ADMIN';
                            const isToggling = togglingAdminId === member.id;

                            return (
                              <div key={member.id} className="p-3.5 flex items-center justify-between gap-3 text-xs">
                                <div className="flex items-center gap-3">
                                  <div className="h-9 w-9 rounded-full bg-ink-100 flex items-center justify-center font-bold text-ink-700 shrink-0">
                                    {member.name.charAt(0).toUpperCase()}
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <p className="font-bold text-ink-900">{member.name}</p>
                                      {isOwner ? (
                                        <span className="text-[10px] font-bold px-2 py-0.2 rounded-full bg-brand-50 border border-brand-200 text-brand-700">
                                          👑 Owner
                                        </span>
                                      ) : isAdmin ? (
                                        <span className="text-[10px] font-bold px-2 py-0.2 rounded-full bg-purple-50 border border-purple-200 text-purple-700">
                                          🛡️ Admin
                                        </span>
                                      ) : (
                                        <span className="text-[10px] font-bold px-2 py-0.2 rounded-full bg-ink-100 border border-ink-200 text-ink-600">
                                          Member
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-[11px] text-ink-500 mt-0.5">
                                      ID: <span className="font-mono font-semibold">{member.id}</span> • {member.email}
                                    </p>
                                  </div>
                                </div>

                                {/* Owner Admin Controls */}
                                {groupDetail.isOwner && !isOwner && (
                                  <button
                                    type="button"
                                    disabled={isToggling}
                                    onClick={() => handleToggleAdmin(member.id)}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                                      isAdmin
                                        ? 'border border-red-200 text-red-600 hover:bg-red-50'
                                        : 'bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200'
                                    }`}
                                  >
                                    {isToggling ? 'Updating...' : isAdmin ? 'Demote Admin' : '🛡️ Make Admin'}
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* TAB: JOIN REQUESTS */}
                    {detailTab === 'requests' && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-ink-500">
                            Pending Join Requests ({groupDetail.joinRequests.length})
                          </h4>
                          <span className="text-xxs text-ink-400">
                            Requests from users to join this group
                          </span>
                        </div>

                        {groupDetail.joinRequests.length === 0 ? (
                          <div className="p-6 bg-ink-50 rounded-2xl border border-ink-150 text-center text-xs text-ink-400">
                            No pending join requests for this group.
                          </div>
                        ) : (
                          <div className="divide-y divide-ink-100 border border-ink-150 rounded-2xl overflow-hidden bg-white">
                            {groupDetail.joinRequests.map((req) => (
                              <div key={req.id} className="p-3.5 flex items-center justify-between gap-3 text-xs">
                                <div>
                                  <p className="font-bold text-ink-900">
                                    {req.inviteeEmail || req.inviteePhone || 'User'}
                                  </p>
                                  <p className="text-[11px] text-ink-400 mt-0.5">
                                    Requested on {new Date(req.createdAt).toLocaleDateString()}
                                  </p>
                                </div>

                                {groupDetail.canAddMembers ? (
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => handleRespondJoinRequest(req.id, true)}
                                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition"
                                    >
                                      Approve
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleRespondJoinRequest(req.id, false)}
                                      className="px-2.5 py-1.5 border border-ink-200 hover:bg-ink-100 text-ink-600 rounded-xl text-xs font-semibold transition"
                                    >
                                      Decline
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-xxs bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full">
                                    Pending Admin Review
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* TAB: SENT INVITATIONS */}
                    {detailTab === 'invites' && (
                      <div className="space-y-3">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-ink-500">
                          Sent Invitations ({groupDetail.invitations?.length || 0})
                        </h4>

                        {!groupDetail.invitations || groupDetail.invitations.length === 0 ? (
                          <div className="p-6 bg-ink-50 rounded-2xl border border-ink-150 text-center text-xs text-ink-400">
                            No invitations sent yet.
                          </div>
                        ) : (
                          <div className="divide-y divide-ink-100 border border-ink-150 rounded-2xl overflow-hidden bg-white">
                            {groupDetail.invitations.map((inv) => (
                              <div key={inv.id} className="p-3.5 flex items-center justify-between text-xs">
                                <div>
                                  <p className="font-semibold text-ink-900">
                                    {inv.inviteeEmail || inv.inviteePhone || 'Invitee'}
                                  </p>
                                  <p className="text-xxs text-ink-400">
                                    Sent on {new Date(inv.createdAt).toLocaleDateString()}
                                  </p>
                                </div>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  inv.status === 'ACCEPTED'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : inv.status === 'DECLINED'
                                    ? 'bg-red-100 text-red-800'
                                    : 'bg-amber-100 text-amber-800'
                                }`}>
                                  {inv.status}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* TAB: ADD PEOPLE (Owner and Admins only) */}
                    {detailTab === 'add_people' && (
                      <div className="space-y-4">
                        {groupDetail.canAddMembers ? (
                          <div className="p-4 bg-brand-50/40 rounded-2xl border border-brand-200 space-y-3">
                            <div>
                              <h4 className="text-sm font-bold text-ink-900 flex items-center gap-1.5">
                                <span>➕ Invite New Member</span>
                                <span className="text-[10px] bg-brand-100 text-brand-800 px-2 py-0.5 rounded-full font-bold">
                                  Owner & Admin Feature
                                </span>
                              </h4>
                              <p className="text-xs text-ink-500 mt-0.5">
                                Enter a 10-digit User ID, email address, or phone number to invite someone to this group.
                              </p>
                            </div>

                            <form onSubmit={handleSendInvite} className="space-y-3 pt-2">
                              <div>
                                <label className="cash-label text-xs">10-Digit User ID</label>
                                <input
                                  className="cash-input text-xs font-mono"
                                  value={inviteUserId}
                                  onChange={(e) => setInviteUserId(e.target.value)}
                                  placeholder="e.g. 9333003758"
                                  maxLength={10}
                                />
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                  <label className="cash-label text-xs">Email Address (Optional)</label>
                                  <input
                                    className="cash-input text-xs"
                                    type="email"
                                    value={inviteEmail}
                                    onChange={(e) => setInviteEmail(e.target.value)}
                                    placeholder="member@example.com"
                                  />
                                </div>
                                <div>
                                  <label className="cash-label text-xs">Phone Number (Optional)</label>
                                  <input
                                    className="cash-input text-xs"
                                    value={invitePhone}
                                    onChange={(e) => setInvitePhone(e.target.value)}
                                    placeholder="+1 555-0199"
                                  />
                                </div>
                              </div>

                              <button
                                type="submit"
                                disabled={invitingMember || (!inviteUserId.trim() && !inviteEmail.trim() && !invitePhone.trim())}
                                className="cash-button-primary w-full py-2.5 text-xs font-semibold disabled:opacity-50"
                              >
                                {invitingMember ? 'Sending Invite...' : 'Send Invitation'}
                              </button>
                            </form>
                          </div>
                        ) : (
                          <div className="p-6 bg-ink-50 rounded-2xl border border-ink-150 text-center space-y-2">
                            <span className="text-2xl block">🔒</span>
                            <h4 className="text-sm font-bold text-ink-900">Permission Restricted</h4>
                            <p className="text-xs text-ink-500 max-w-md mx-auto leading-relaxed">
                              Only the group owner and designated group administrators can add new members or send invitations. You are currently a regular member.
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                  </>
                )}
              </div>

              {/* Modal Footer */}
              <div className="pt-3 border-t border-ink-100 flex justify-end shrink-0">
                <button
                  type="button"
                  onClick={closeGroupDetail}
                  className="px-4 py-2 border border-ink-200 rounded-xl hover:bg-ink-100 transition text-xs font-semibold text-ink-700"
                >
                  Close
                </button>
              </div>

            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* CREATE GROUP MODAL */}
        {/* ========================================================= */}
        {isCreateModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="cash-card max-w-md w-full p-6 bg-white animate-in zoom-in duration-200 shadow-2xl text-left border border-ink-200 space-y-4">
              <div className="flex items-center justify-between border-b border-ink-100 pb-3">
                <div>
                  <h3 className="text-xl font-bold text-ink-900">Create New Group</h3>
                  <p className="text-xs text-ink-500 mt-0.5">Start a shared expense dashboard with peers</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="rounded-full p-2 text-ink-400 hover:text-ink-700 hover:bg-ink-100 transition"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleCreateGroup} className="space-y-4">
                <div>
                  <label htmlFor="groupNameInput" className="cash-label text-xs">Group Name</label>
                  <input
                    id="groupNameInput"
                    className="cash-input text-xs"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    placeholder="e.g. Shared Apartment, Trip to Tokyo, Project Team"
                    required
                    autoFocus
                  />
                </div>

                <div className="flex gap-2.5 pt-2">
                  <button
                    type="submit"
                    disabled={creatingGroup || !newGroupName.trim()}
                    className="cash-button-primary flex-1 py-2.5 text-xs font-semibold disabled:opacity-50"
                  >
                    {creatingGroup ? 'Creating...' : '➕ Create Group'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsCreateModalOpen(false)}
                    className="px-4 py-2.5 border border-ink-200 rounded-xl hover:bg-ink-100 transition text-xs font-semibold text-ink-700"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* JOIN GROUP BY ID MODAL */}
        {/* ========================================================= */}
        {isJoinModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="cash-card max-w-md w-full p-6 bg-white animate-in zoom-in duration-200 shadow-2xl text-left border border-ink-200 space-y-4">
              <div className="flex items-center justify-between border-b border-ink-100 pb-3">
                <div>
                  <h3 className="text-xl font-bold text-ink-900 flex items-center gap-1.5">
                    <span>🙋 Join a Group</span>
                  </h3>
                  <p className="text-xs text-ink-500 mt-0.5">Enter a 10-character Group ID starting with G</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsJoinModalOpen(false)}
                  className="rounded-full p-2 text-ink-400 hover:text-ink-700 hover:bg-ink-100 transition"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleRequestJoinGroup} className="space-y-4">
                <div>
                  <label htmlFor="joinGroupModalId" className="cash-label text-xs">Group Tracking ID</label>
                  <input
                    id="joinGroupModalId"
                    className="cash-input text-xs font-mono uppercase tracking-wider"
                    value={joinGroupIdInput}
                    onChange={(e) => setJoinGroupIdInput(e.target.value.toUpperCase())}
                    placeholder="e.g. G29FMU3V0Y"
                    maxLength={10}
                    required
                    autoFocus
                  />
                  <p className="text-xxs text-ink-400 mt-1">
                    The group owner or admin will review your request before adding you as a member.
                  </p>
                </div>

                <div className="flex gap-2.5 pt-2">
                  <button
                    type="submit"
                    disabled={joiningGroup || !joinGroupIdInput.trim()}
                    className="cash-button-primary flex-1 py-2.5 text-xs font-semibold disabled:opacity-50"
                  >
                    {joiningGroup ? 'Sending Request...' : 'Send Join Request'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsJoinModalOpen(false)}
                    className="px-4 py-2.5 border border-ink-200 rounded-xl hover:bg-ink-100 transition text-xs font-semibold text-ink-700"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
