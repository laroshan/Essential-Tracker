export interface Transaction {
  id: string;
  amount: number;
  type: 'credit' | 'debit';
  description: string;
  category: string;
  paymentMethod: 'Cash' | 'Credit Card' | 'Debit Card';
  date: number; // timestamp — transaction time (from SMS body if available, else SMS delivery time)
  smsSender?: string;
  smsBody?: string;   // raw SMS body for re-parsing / debugging
  smsDate?: number;  // OS delivery timestamp
  approved?: boolean; // indicates if the transaction has been reviewed and approved
}

export interface Message {
  id: string;
  sender: 'user' | 'agent';
  text: string;
  timestamp: number;
  parsedTransaction?: {
    amount: number;
    type: 'credit' | 'debit';
    description: string;
    paymentMethod: 'Cash' | 'Credit Card' | 'Debit Card';
  };
}

export interface Debt {
  id: string;
  name: string;
  balance: number;
  interestRate: number; // e.g. 18 for 18%
  minPayment: number;
}

export interface Subscription {
  id: string;
  name: string;
  cost: number;
  cycle: 'monthly' | 'yearly';
  nextRenewal: string; // date string YYYY-MM-DD
}

export interface WealthConfig {
  emergencyFundTargetMonths: number;
  monthlyIncome: number;
  fixedCostsPercent: number; // e.g. 50
  savingsPercent: number;    // e.g. 10
  investmentsPercent: number;// e.g. 20
  guiltFreePercent: number;  // e.g. 20
  emergencyFundSaved: number;
}

// ─── Task Tracker ────────────────────────────────────────────────────────────

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskStatus = 'todo' | 'in_progress' | 'done';

export interface Task {
  id: string;
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: number | null; // timestamp
  createdAt: number;
  completedAt: number | null;
  category: string;
}

// ─── To-Do List ──────────────────────────────────────────────────────────────

export interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
  createdAt: number;
  completedAt: number | null;
  listId: string;
}

export interface TodoList {
  id: string;
  name: string;
  color: string;
  createdAt: number;
}

// ─── Mental Health Tracker ───────────────────────────────────────────────────

export type MoodScore = 1 | 2 | 3 | 4 | 5; // 1=terrible → 5=great

export interface MoodEntry {
  id: string;
  mood: MoodScore;
  note: string;
  activities: string[];
  date: number; // timestamp
}

export interface JournalEntry {
  id: string;
  title: string;
  content: string;
  mood: MoodScore;
  createdAt: number;
}
