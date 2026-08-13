export type AuthUser = {
  id: string;
  name: string;
  email: string;
  phoneNumber: string;
  createdAt: string;
};

export type Expense = {
  id: string;
  amount: number;
  category: string | null;
  description: string | null;
  paymentMethod: string;
  date: string;
  createdAt: string;
  userId: string;
  transactionType?: 'EXPENSE' | 'INCOME' | 'TRANSFER';
  toUserId?: string | null;
  categoryType?: string | null;
  user?: { id: string; name: string; email: string };
  toUser?: { id: string; name: string; email: string } | null;
  tags?: { id: string; name: string }[];
};

