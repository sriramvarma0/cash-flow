export type AuthUser = {
  id: string;
  name: string;
  email: string;
  phoneNumber: string;
  createdAt: string;
  twoFactorEnabled?: boolean;
};

export type Expense = {
  id: string;
  amount: number;
  category: string | null;
  description: string | null;
  paymentMethod: string;
  paymentAccount?: string | null;
  date: string;
  createdAt: string;
  userId: string;
  transactionType?: 'EXPENSE' | 'INCOME' | 'TRANSFER' | 'INVESTMENT' | 'RECEIVABLE';
  toUserId?: string | null;
  categoryType?: string | null;
  isReceivable?: boolean | null;
  receivableStatus?: 'OUTSTANDING' | 'PARTIALLY_SETTLED' | 'SETTLED' | null;
  reimbursedAmount?: number | null;
  user?: { id: string; name: string; email: string };
  toUser?: { id: string; name: string; email: string } | null;
  tags?: { id: string; name: string }[];
};

export type InvestmentTransaction = {
  id: string; // PB... or PS...
  type: 'BUY' | 'SELL';
  units: number;
  price: number;
  amount: number;
  date: string;
  investmentId: string;
  userId: string;
  createdAt: string;
  investment?: {
    code: string;
    name: string;
    type: string;
  };
};

export type Investment = {
  id: string;
  code: string;
  name: string;
  type: string;
  units: number;
  buyPrice: number;
  currentPrice: number;
  color: string;
  date: string;
  userId: string;
  createdAt: string;
  dividendYield?: number;
  beta?: number;
  transactions?: InvestmentTransaction[];
};

export type CategoryBudget = {
  id: string;
  category: string;
  limit: number;
  period: 'monthly' | 'yearly';
  color?: string;
  notes?: string;
  alertThreshold?: number;
  createdAt?: string;
  updatedAt?: string;
};


