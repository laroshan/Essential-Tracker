/**
 * Income / expense semantics shared by every screen.
 *
 *  - "Transfer" (money between the user's own accounts) is neither income nor expense.
 *  - "Refund" credits reduce spending instead of counting as income.
 */
import type { Transaction } from '../types';
import { NEUTRAL_CATEGORIES } from '../constants/categories';

export const isTransfer = (t: Transaction) => NEUTRAL_CATEGORIES.includes(t.category);
export const isRefund = (t: Transaction) => t.type === 'credit' && t.category === 'Refund';
export const isIncome = (t: Transaction) => t.type === 'credit' && !isTransfer(t) && !isRefund(t);
export const isExpense = (t: Transaction) => t.type === 'debit' && !isTransfer(t);

export interface Totals {
  income: number;
  /** Spending net of refunds. */
  expenses: number;
  refunds: number;
  /** Volume moved between own accounts (informational). */
  transfers: number;
}

export function totals(txns: Transaction[]): Totals {
  let income = 0, gross = 0, refunds = 0, transfers = 0;
  for (const t of txns) {
    if (isTransfer(t)) { if (t.type === 'debit') transfers += t.amount; }
    else if (isRefund(t)) refunds += t.amount;
    else if (t.type === 'credit') income += t.amount;
    else gross += t.amount;
  }
  return { income, expenses: Math.max(0, gross - refunds), refunds, transfers };
}

/** Spend per category (refunds are not subtracted per-category; transfers excluded). */
export function spendByCategory(txns: Transaction[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const t of txns) if (isExpense(t)) map[t.category] = (map[t.category] ?? 0) + t.amount;
  return map;
}

/**
 * Average monthly spend over the last `months` *complete* calendar months that have any expense.
 * Returns null when there is no history yet, so callers can fall back to an estimate.
 */
export function averageMonthlyExpenses(txns: Transaction[], months = 3, now = new Date()): number | null {
  const buckets: number[] = [];
  for (let i = 1; i <= months; i++) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1).getTime();
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1).getTime();
    const spent = totals(txns.filter(t => t.date >= start && t.date < end)).expenses;
    if (spent > 0) buckets.push(spent);
  }
  if (buckets.length === 0) return null;
  return buckets.reduce((s, v) => s + v, 0) / buckets.length;
}

/**
 * Months to clear a balance paying a fixed amount each month at `annualRatePct` interest.
 * Returns Infinity when the payment doesn't cover the monthly interest.
 */
export function debtPayoffMonths(balance: number, annualRatePct: number, monthlyPayment: number): number {
  if (balance <= 0) return 0;
  if (monthlyPayment <= 0) return Infinity;
  const r = annualRatePct / 100 / 12;
  if (r === 0) return Math.ceil(balance / monthlyPayment);
  if (monthlyPayment <= balance * r) return Infinity;
  return Math.ceil(-Math.log(1 - (r * balance) / monthlyPayment) / Math.log(1 + r));
}
