import { AuthUser, Expense, Investment, InvestmentTransaction } from './types';

type AuthPayload = {
  name: string;
  email: string;
  phoneNumber: string;
  password: string;
};

async function parseJson<T>(response: Response): Promise<T> {
  const urlPath = response.url ? new URL(response.url).pathname : 'API';

  if (!response.ok) {
    if (
      response.status === 401 &&
      typeof window !== 'undefined' &&
      window.location.pathname !== '/login' &&
      window.location.pathname !== '/register'
    ) {
      localStorage.removeItem('cashflow_accounts');
      void fetch('/api/auth/logout', { method: 'POST' }).finally(() => {
        window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
      });
    }

    let errorMessage = '';
    const text = await response.text().catch(() => '');
    
    try {
      if (text) {
        const body = JSON.parse(text);
        if (body && typeof body === 'object') {
          const msg = body.message ?? body.error;
          if (Array.isArray(msg)) {
            errorMessage = msg.join(', ');
          } else if (typeof msg === 'string') {
            errorMessage = msg;
          }
        }
      }
    } catch {
      if (text && text.length < 200) {
        errorMessage = text;
      }
    }

    const finalMessage = errorMessage
      ? `API error on ${urlPath}: ${errorMessage}`
      : `Request to ${urlPath} failed with status ${response.status} (${response.statusText || 'Unknown'})`;

    throw new Error(finalMessage);
  }

  if (response.status === 204) {
    return {} as T;
  }

  const text = await response.text().catch(() => '');
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    throw new Error(`Failed to parse JSON response from ${urlPath}: ${err instanceof Error ? err.message : 'Invalid JSON'}`);
  }
}

export interface LoginResponse {
  user?: AuthUser;
  accessToken?: string;
  requires2FA?: boolean;
  tempToken?: string;
  message?: string;
}

export interface TwoFactorSetupData {
  secret: string;
  otpauthUri: string;
  qrCode: string;
  qrCodeDataUrl?: string;
  issuer: string;
  accountName: string;
}

export interface TwoFactorStatus {
  enabled: boolean;
  remainingRecoveryCodes: number;
}

export async function login(payload: Omit<AuthPayload, 'name' | 'phoneNumber'>) {
  return parseJson<LoginResponse>(
    await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
  );
}

export async function verify2faLogin(tempToken: string, code: string) {
  return parseJson<{ user: AuthUser; accessToken: string; recoveryCodeUsed?: boolean; remainingRecoveryCodes?: number; message?: string }>(
    await fetch('/api/auth/2fa/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tempToken, code })
    })
  );
}

export async function setup2fa() {
  const response = await fetch('/api/auth/2fa/setup');
  return parseJson<TwoFactorSetupData>(response);
}

export async function enable2fa(code: string) {
  const response = await fetch('/api/auth/2fa/enable', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code })
  });
  return parseJson<{ success: boolean; message: string; recoveryCodes: string[] }>(response);
}

export async function disable2fa(payload: { password?: string; code?: string }) {
  const response = await fetch('/api/auth/2fa/disable', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return parseJson<{ success: boolean; message: string }>(response);
}

export async function get2faStatus() {
  const response = await fetch('/api/auth/2fa/status');
  return parseJson<TwoFactorStatus>(response);
}

export async function regenerateRecoveryCodes(password?: string) {
  const response = await fetch('/api/auth/2fa/recovery-codes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })
  });
  return parseJson<{ success: boolean; recoveryCodes: string[]; message: string }>(response);
}

export async function changePassword(payload: { currentPassword: string; newPassword: string }) {
  const response = await fetch('/api/users/me/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return parseJson<{ success: boolean; message: string }>(response);
}

export async function register(payload: AuthPayload) {
  return parseJson<{ user: AuthUser; accessToken: string }>(
    await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
  );
}

export async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
}

export async function fetchExpenses(filters?: { category?: string; tag?: string; from?: string; to?: string; categoryType?: string }) {
  const searchParams = new URLSearchParams();

  if (filters?.category) searchParams.set('category', filters.category);
  if (filters?.tag) searchParams.set('tag', filters.tag);
  if (filters?.from) searchParams.set('from', filters.from);
  if (filters?.to) searchParams.set('to', filters.to);
  if (filters?.categoryType) searchParams.set('categoryType', filters.categoryType);

  const queryString = searchParams.toString();
  const response = await fetch(`/api/expenses${queryString ? `?${queryString}` : ''}`);
  return parseJson<Expense[]>(response);
}

export async function createExpense(payload: {
  amount: number;
  category?: string;
  description?: string;
  paymentMethod?: string;
  date: string;
  transactionType?: 'EXPENSE' | 'INCOME' | 'TRANSFER' | 'INVESTMENT';
  toUserId?: string;
  categoryType?: string;
  tags?: string[];
}) {
  return parseJson<Expense>(
    await fetch('/api/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
  );
}

export async function updateExpense(
  id: string,
  payload: Partial<{
    amount: number;
    category: string | null;
    description: string | null;
    paymentMethod: string;
    date: string;
    transactionType: 'EXPENSE' | 'INCOME' | 'TRANSFER' | 'INVESTMENT';
    toUserId: string | null;
    categoryType: string | null;
    tags: string[];
  }>
) {
  return parseJson<Expense>(
    await fetch(`/api/expenses/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
  );
}

export async function deleteExpense(id: string) {
  return parseJson<{ deleted: boolean }>(
    await fetch(`/api/expenses/${id}`, { method: 'DELETE' })
  );
}

export async function createExpensesBulk(payload: {
  expenses: {
    amount: number;
    category?: string;
    description?: string;
    paymentMethod?: string;
    date: string;
    transactionType?: 'EXPENSE' | 'INCOME' | 'TRANSFER' | 'INVESTMENT';
    toUserId?: string;
    categoryType?: string;
    tags?: string[];
  }[];
}) {
  return parseJson<Expense[]>(
    await fetch('/api/expenses/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
  );
}

export async function fetchCurrentUser() {
  const response = await fetch('/api/users/me');
  return parseJson<AuthUser>(response);
}

export interface SavedAccount {
  id: string;
  name: string;
  email: string;
  phoneNumber: string;
  accessToken: string;
}

export function getSavedAccounts(): SavedAccount[] {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem('cashflow_accounts');
  if (!stored) return [];
  try {
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

export function saveAccount(user: AuthUser, accessToken: string) {
  if (typeof window === 'undefined') return;
  const accounts = getSavedAccounts();
  const index = accounts.findIndex((a) => a.id === user.id);
  const account: SavedAccount = {
    id: user.id,
    name: user.name,
    email: user.email,
    phoneNumber: user.phoneNumber,
    accessToken
  };
  if (index >= 0) {
    accounts[index] = account;
  } else {
    accounts.push(account);
  }
  localStorage.setItem('cashflow_accounts', JSON.stringify(accounts));
}

export function removeSavedAccount(userId: string) {
  if (typeof window === 'undefined') return;
  const accounts = getSavedAccounts();
  const filtered = accounts.filter((a) => a.id !== userId);
  localStorage.setItem('cashflow_accounts', JSON.stringify(filtered));
}

export function clearAllSavedAccounts() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('cashflow_accounts');
}

export async function switchAccount(accessToken: string) {
  const response = await fetch('/api/auth/switch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken })
  });
  if (!response.ok) {
    throw new Error('Failed to switch account');
  }
  return response.json();
}
export interface GroupMember {
  id: string;
  name: string;
  email: string;
  phoneNumber: string;
  role?: 'OWNER' | 'ADMIN' | 'MEMBER';
  isOwner?: boolean;
  isAdmin?: boolean;
}

export interface Group {
  id: string;
  name: string;
  createdAt: string;
  ownerId: string;
  adminIds?: string;
  owner: { id: string; name: string; email: string; phoneNumber?: string };
  members: GroupMember[];
  invitations?: Array<{
    id: string;
    groupId: string;
    inviteeEmail: string | null;
    inviteePhone: string | null;
    status: string;
    createdAt: string;
  }>;
}

export interface GroupDetail extends Group {
  isMember: boolean;
  isOwner: boolean;
  isAdmin: boolean;
  canAddMembers: boolean;
  joinRequests: Array<{
    id: string;
    groupId: string;
    inviteeEmail: string | null;
    inviteePhone: string | null;
    status: string;
    createdAt: string;
  }>;
}

export interface GroupInvitation {
  id: string;
  groupId: string;
  inviteeEmail: string | null;
  inviteePhone: string | null;
  status: string;
  createdAt: string;
  group: {
    name: string;
    owner: {
      name: string;
      email: string;
    };
  };
}

export async function fetchGroups() {
  const response = await fetch('/api/groups');
  return parseJson<Group[]>(response);
}

export async function fetchGroupDetail(groupId: string) {
  const response = await fetch(`/api/groups/${groupId}`);
  return parseJson<GroupDetail>(response);
}

export async function toggleGroupAdmin(groupId: string, memberId: string) {
  const response = await fetch(`/api/groups/${groupId}/toggle-admin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ memberId })
  });
  return parseJson<{ success: boolean; isNowAdmin: boolean; message: string; adminIds: string }>(response);
}

export async function createGroup(name: string) {
  const response = await fetch('/api/groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  return parseJson<Group>(response);
}

export async function inviteToGroup(
  groupId: string,
  payload: { userId?: string; email?: string; phoneNumber?: string }
) {
  const response = await fetch(`/api/groups/${groupId}/invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return parseJson<{ id: string }>(response);
}

export async function fetchPendingInvitations() {
  const response = await fetch('/api/groups/invitations');
  return parseJson<GroupInvitation[]>(response);
}

export async function respondToInvitation(inviteId: string, accept: boolean) {
  const response = await fetch(`/api/groups/invitations/${inviteId}/respond`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accept })
  });
  return parseJson<{ success: boolean; status: string }>(response);
}

export async function fetchGroupExpenses(groupId: string) {
  const response = await fetch(`/api/groups/${groupId}/expenses`);
  return parseJson<Expense[]>(response);
}

export async function fetchAllUsers() {
  const response = await fetch('/api/users');
  return parseJson<AuthUser[]>(response);
}

export async function fetchInvestments() {
  const response = await fetch('/api/investments');
  return parseJson<Investment[]>(response);
}

export async function createInvestment(payload: {
  code: string;
  type: string;
  units: number;
  buyPrice: number;
  date?: string;
}) {
  const response = await fetch('/api/investments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return parseJson<Investment>(response);
}

export async function fetchInvestmentTransactions(code?: string) {
  const url = code
    ? `/api/investments/${encodeURIComponent(code)}/transactions`
    : '/api/investments/transactions';
  const response = await fetch(url);
  return parseJson<InvestmentTransaction[]>(response);
}

export async function recordInvestmentTransaction(
  code: string,
  payload: {
    type: 'BUY' | 'SELL';
    units: number;
    price: number;
    date?: string;
  }
) {
  const response = await fetch(`/api/investments/${encodeURIComponent(code)}/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return parseJson<{ transaction: InvestmentTransaction; investment: Investment }>(response);
}

export async function updateInvestmentTransaction(
  id: string,
  payload: {
    type?: 'BUY' | 'SELL';
    units?: number;
    price?: number;
    date?: string;
  }
) {
  const response = await fetch(`/api/investments/transactions/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return parseJson<{ transaction: InvestmentTransaction; investment: Investment }>(response);
}

export async function deleteInvestmentTransaction(id: string) {
  const response = await fetch(`/api/investments/transactions/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
  return parseJson<{ deleted: boolean; investment: Investment }>(response);
}

export async function deleteInvestmentAsset(code: string, password: string) {
  const response = await fetch(`/api/investments/${encodeURIComponent(code)}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })
  });
  return parseJson<{ deleted: boolean; code: string; name: string }>(response);
}


export interface AccountExportPayload {
  version: string;
  exportId: string;
  exportedAt: string;
  appName: string;
  user: {
    id: string;
    name: string;
    email: string;
    phoneNumber: string;
    createdAt: string;
  };
  summary: {
    totalTransactions: number;
    totalInvestments: number;
    totalInvestmentTransactions: number;
    totalGroups: number;
    totalTags: number;
  };
  data: {
    transactions: any[];
    investments: any[];
    investmentTransactions: any[];
    groups: any[];
    tags: any[];
    customPreferences?: {
      categories?: string[];
      tags?: string[];
      dashboards?: any[];
    };
  };
}

export interface ImportedExternalGroup {
  id: string;
  name: string;
  ownerId: string;
  ownerName?: string;
  memberCount: number;
  isMember?: boolean;
  canRequestJoin?: boolean;
}

export interface ImportResult {
  success: boolean;
  exportId: string;
  exportedAt: string | null;
  importedAt: string;
  stats: {
    transactions: { total: number; created: number; updated: number; skipped: number };
    investments: { total: number; created: number; updated: number; skipped: number };
    investmentTransactions: { total: number; created: number; updated: number; skipped: number };
    groups: { total: number; created: number; updated: number; skipped: number };
    tags: { total: number; created: number; updated: number; skipped: number };
  };
  externalGroups?: ImportedExternalGroup[];
  message: string;
}

export interface GroupJoinRequest {
  id: string;
  groupId: string;
  inviteeEmail: string | null;
  inviteePhone: string | null;
  status: string;
  createdAt: string;
  group: {
    id: string;
    name: string;
    ownerId: string;
    owner?: {
      id: string;
      name: string;
      email: string;
    };
  };
}

export async function exportAccountData() {
  const response = await fetch('/api/users/me/export');
  return parseJson<AccountExportPayload>(response);
}

export async function importAccountData(payload: any) {
  const response = await fetch('/api/users/me/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return parseJson<ImportResult>(response);
}

export async function requestToJoinGroup(groupId: string) {
  const response = await fetch(`/api/groups/${encodeURIComponent(groupId)}/request-join`, {
    method: 'POST'
  });
  return parseJson<{ success: boolean; status: string; message: string }>(response);
}

export async function fetchGroupJoinRequests() {
  const response = await fetch('/api/groups/join-requests');
  return parseJson<GroupJoinRequest[]>(response);
}

export async function respondToJoinRequest(requestId: string, accept: boolean) {
  const response = await fetch(`/api/groups/join-requests/${encodeURIComponent(requestId)}/respond`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accept })
  });
  return parseJson<{ success: boolean; status: string; message: string }>(response);
}

export async function fetchMySentJoinRequests() {
  const response = await fetch('/api/groups/my-requests');
  return parseJson<GroupJoinRequest[]>(response);
}



