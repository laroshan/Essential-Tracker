/**
 * Single source of truth for transaction categories.
 * UI pickers, analytics and the SMS categorizer all read from here.
 */

export const CATEGORIES = [
  'Groceries',
  'Food & Drinks',
  'Shopping',
  'Transport',
  'Subscriptions',
  'Utilities',
  'Health',
  'Education',
  'Entertainment',
  'Travel',
  'Rent',
  'Loan & EMI',
  'Bank Charges',
  'Payments',
  'Investment',
  'Savings',
  'Cash Withdrawal',
  'Transfer',
  'Income',
  'Refund',
  'Others',
] as const;

export type Category = typeof CATEGORIES[number];

export const CATEGORY_EMOJI: Record<string, string> = {
  'Groceries': '🛒',
  'Food & Drinks': '🍔',
  'Shopping': '🛍️',
  'Transport': '🚗',
  'Subscriptions': '🎬',
  'Utilities': '🔌',
  'Health': '🏥',
  'Education': '📚',
  'Entertainment': '🎟️',
  'Travel': '✈️',
  'Rent': '🏠',
  'Loan & EMI': '🏦',
  'Bank Charges': '🧾',
  'Payments': '💸',
  'Investment': '📈',
  'Savings': '🐖',
  'Cash Withdrawal': '💵',
  'Transfer': '🔁',
  'Income': '💰',
  'Refund': '↩️',
  'Others': '📦',
};

/** Moving money between the user's own accounts — neither income nor expense. */
export const NEUTRAL_CATEGORIES: readonly string[] = ['Transfer'];
