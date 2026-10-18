export type TxnType = 'credit' | 'debit';

export type PaymentMethod = 'Cash' | 'Credit Card' | 'Debit Card' | 'Bank Transfer';

/** What actually happened — drives categorisation and cross-SMS reconciliation. */
export type TxnKind =
  | 'card_purchase'    // POS / e-commerce card spend
  | 'online_payment'   // account-based payment (JustPay, bill pay)
  | 'atm_withdrawal'
  | 'cash_deposit'
  | 'transfer_out'
  | 'transfer_in'
  | 'interest'
  | 'refund'           // reversal / refund of an earlier spend
  | 'fee'
  | 'tax'
  | 'loan_repayment'
  | 'unknown';

/** Why a message was (or wasn't) turned into a transaction. */
export type SmsClass =
  | 'transaction'
  | 'otp'          // one-time password — the real debit arrives separately
  | 'failed'       // declined / unsuccessful
  | 'promo'        // marketing
  | 'info'         // anything else (security notices, balance-only, reminders)
  | 'unparsed';    // looked financial but no template / amount matched

export interface ParsedTxn {
  amount: number;
  currency: string;
  type: TxnType;
  kind: TxnKind;
  /** Human-readable label shown in the UI. */
  description: string;
  /** Normalised merchant / counterparty name, when one exists. */
  merchant?: string;
  category: string;
  paymentMethod: PaymentMethod;
  /** Transaction time from the SMS body (falls back to delivery time). */
  transactionDate: number | null;
  bank: string;
  /** Masked tail of the user's account / card, e.g. "072", "3634". */
  account?: string;
  /** Masked tail of the other account in a transfer. */
  counterpartyAccount?: string;
  /** True when the bank explicitly says the destination is the user's own account. */
  toOwnAccount?: boolean;
  reference?: string;
  /** Available balance after the transaction, if reported. */
  balance?: number;
  /** 0..1 — how sure the engine is about the parse + category. */
  confidence: number;
  /** Which template produced the parse (for diagnostics). */
  template: string;
}

export interface OtpInfo {
  amount?: number;
  currency?: string;
  merchant?: string;
  card?: string;
}

export interface SmsAnalysis {
  cls: SmsClass;
  bank: string;
  txn?: ParsedTxn;
  otp?: OtpInfo;
}

/** A partial produced by a bank template before categorisation. */
export type TemplateResult = Omit<ParsedTxn, 'category' | 'confidence' | 'bank' | 'transactionDate'> & {
  transactionDate?: number | null;
  /** Template-specific confidence in the parse itself. */
  parseConfidence: number;
};
