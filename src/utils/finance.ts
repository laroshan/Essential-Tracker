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
