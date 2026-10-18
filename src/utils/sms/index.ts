/**
 * SMS transaction engine — public API.
 *
 *   analyzeSms()            one message → class + parsed transaction
 *   ingestSms()             a batch from the inbox → transaction candidates (OTP-enriched, deduped)
 *   reconcileTransactions() whole history → duplicates removed, self-transfers paired
 *   reanalyzeTransactions() re-run the current engine over stored SMS transactions
 *   detectRecurring()       recurring merchants / payees
 */
import type { Transaction } from '../../types';
import type { ParsedTxn, SmsClass } from './types';
import { analyzeSms } from './parser';
import { categorize } from './categorizer';
import { enrichWithOtps, reconcileTransactions, type TimedOtp } from './reconcile';

export * from './types';
export { analyzeSms, parseSMS } from './parser';
export { categorize, learnKey, merchantKey, cleanMerchant } from './categorizer';
export { bankName, detectBank } from './banks';
export { detectRecurring, reconcileTransactions, type RecurringPayment } from './reconcile';

export interface RawSms { address: string; body: string; date: number }

export function toTransaction(p: ParsedTxn, sms: RawSms): Omit<Transaction, 'id'> {
  return {
    amount: p.amount,
    type: p.type,
    description: p.description,
    category: p.category,
    paymentMethod: p.paymentMethod,
    date: p.transactionDate ?? sms.date,
    smsSender: sms.address,
    smsBody: sms.body,
    smsDate: sms.date,
    kind: p.kind,
    merchant: p.merchant,
    bank: p.bank,
    account: p.account,
    counterpartyAccount: p.counterpartyAccount,
    toOwnAccount: p.toOwnAccount,
    reference: p.reference,
    balance: p.balance,
    currency: p.currency,
    confidence: p.confidence,
  };
}

export interface IngestResult {
  /** One per transactional SMS (OTP-enriched; duplicates within the batch removed). */
  candidates: Array<{ sms: RawSms; txn: Omit<Transaction, 'id'> }>;
  otps: TimedOtp[];
  stats: Record<SmsClass, number>;
  /** Financial-looking messages no template understood — surface for review. */
  unparsed: RawSms[];
}

export function ingestSms(list: RawSms[], learned?: Record<string, string>): IngestResult {
  const stats: Record<SmsClass, number> = { transaction: 0, otp: 0, failed: 0, promo: 0, info: 0, unparsed: 0 };
  const otps: TimedOtp[] = [];
  const unparsed: RawSms[] = [];
  const raw: Array<{ sms: RawSms; txn: Omit<Transaction, 'id'> & { id: string } }> = [];

  list.forEach((sms, i) => {
    const r = analyzeSms(sms.body, sms.address, { smsDate: sms.date, learned });
    stats[r.cls]++;
    if (r.cls === 'otp' && r.otp) otps.push({ ...r.otp, date: sms.date });
    else if (r.cls === 'unparsed') unparsed.push(sms);
    else if (r.cls === 'transaction' && r.txn) raw.push({ sms, txn: { ...toTransaction(r.txn, sms), id: `cand-${i}` } });
  });

  const txns = raw.map(r => r.txn);
  enrichWithOtps(txns, otps, learned);
  const { txns: kept } = reconcileTransactions(txns);
  const keptById = new Map(kept.map(t => [t.id, t]));

  const candidates = raw
    .filter(r => keptById.has(r.txn.id))
    .map(r => {
      const txn: Omit<Transaction, 'id'> & { id?: string } = { ...keptById.get(r.txn.id)! };
      delete txn.id;
      return { sms: r.sms, txn };
    });
  return { candidates, otps, stats, unparsed };
}

export interface ReanalyzeResult {
  transactions: Transaction[];
  updated: number;
  removed: Transaction[];
  transfersPaired: number;
}

/**
 * Re-run the current engine over every SMS-backed transaction:
 *  - corrects amount/type/description/kind with the latest templates,
 *  - drops records that were never real transactions (OTPs, failed transfers, promos),
 *  - keeps categories the user set by hand,
 *  - then dedupes and pairs self-transfers across the whole history.
 */
export function reanalyzeTransactions(all: Transaction[], learned?: Record<string, string>): ReanalyzeResult {
  const otps: TimedOtp[] = [];
  const notTxn = new Set<string>();
  let updated = 0;

  const next: Transaction[] = all.map(t => {
    if (!t.smsBody) return t;
    const smsDate = t.smsDate ?? t.date;
    const r = analyzeSms(t.smsBody, t.smsSender ?? '', { smsDate, learned });
    if (r.cls === 'otp' && r.otp) otps.push({ ...r.otp, date: smsDate });
    if (r.cls !== 'transaction' || !r.txn) {
      if (r.cls !== 'unparsed') notTxn.add(t.id);
      return t;
    }
    const fresh = toTransaction(r.txn, { address: t.smsSender ?? '', body: t.smsBody, date: smsDate });
    updated++;
    return {
      ...t,
      ...fresh,
      id: t.id,
      approved: t.approved,
      category: t.userCategorized ? t.category : fresh.category,
      userCategorized: t.userCategorized,
      transferGroupId: undefined, // recomputed below
    };
  });

  const kept = next.filter(t => !notTxn.has(t.id));
  const removedNonTxn = next.filter(t => notTxn.has(t.id));
  enrichWithOtps(kept, otps, learned);
  const rec = reconcileTransactions(kept);
  return {
    transactions: rec.txns,
    updated,
    removed: [...removedNonTxn, ...rec.removed],
    transfersPaired: rec.transfersPaired,
  };
}

/** Re-apply rules + learned overrides to a transaction the user hasn't categorised. */
export function recategorize(t: Transaction, learned?: Record<string, string>): string {
  if (t.userCategorized || t.category === 'Transfer') return t.category;
  return categorize(
    { kind: t.kind ?? 'unknown', type: t.type, merchant: t.merchant, description: t.description },
    learned,
  ).category;
}
