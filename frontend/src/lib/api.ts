import { AuthUser, Expense } from './types';

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

export async function login(payload: Omit<AuthPayload, 'name' | 'phoneNumber'>) {
  return parseJson<{ user: AuthUser; accessToken: string }>(
    await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
  );
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
  transactionType?: 'EXPENSE' | 'INCOME' | 'TRANSFER';
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
    transactionType: 'EXPENSE' | 'INCOME' | 'TRANSFER';
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
    transactionType?: 'EXPENSE' | 'INCOME' | 'TRANSFER';
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
}

export interface Group {
  id: string;
  name: string;
  createdAt: string;
  ownerId: string;
  owner: { id: string; name: string; email: string };
  members: GroupMember[];
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

export async function createGroup(name: string) {
  const response = await fetch('/api/groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  return parseJson<Group>(response);
}

export async function inviteToGroup(groupId: string, payload: { email?: string; phoneNumber?: string }) {
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

