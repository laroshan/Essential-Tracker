/**
 * Cross-message analysis. A single SMS can't tell you that:
 *  - two alerts describe the same money (People's sends LankaPay confirmations twice),
 *  - a debit at bank A and a credit at bank B are one self-transfer (not spend + income),
 *  - BOC's merchant-less "POS/ATM Transaction" is the "Dialog Axiata" payment its OTP named,
 *  - a merchant charges you every month.
 * These functions work on the whole transaction history.
 */
import type { OtpInfo, TxnKind, TxnType } from './types';
import { categorize, merchantKey } from './categorizer';
import { accountsMatch } from './text';

export interface ReconTxn {
  id: string;
  amount: number;
  type: TxnType;
  date: number;
  description: string;
  category: string;
  kind?: TxnKind;
  merchant?: string;
  account?: string;
  counterpartyAccount?: string;
  toOwnAccount?: boolean;
  reference?: string;
  bank?: string;
  smsBody?: string;
  smsDate?: number;
  confidence?: number;
  transferGroupId?: string;
  userCategorized?: boolean;
  approved?: boolean;
}

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const near = (a: number, b: number) => Math.abs(a - b) < 0.005;
const when = (t: ReconTxn) => t.smsDate ?? t.date;

// ─── 1. Duplicates ────────────────────────────────────────────────────────────

/** Ids of alerts that repeat a transaction already present in the list. */
export function findDuplicates<T extends ReconTxn>(txns: T[]): Set<string> {
  const dupes = new Set<string>();
  // Prefer keeping entries the user has touched, then the earliest alert.
  const ordered = [...txns].sort((a, b) =>
    Number(!!b.userCategorized || !!b.approved) - Number(!!a.userCategorized || !!a.approved) || when(a) - when(b));
  const byRef = new Map<string, T>();
  const byBody = new Map<string, T[]>();

  for (const t of ordered) {
    if (t.reference) {
      const key = `${t.type}|${t.amount.toFixed(2)}|${t.reference}`;
      if (byRef.has(key)) { dupes.add(t.id); continue; }
      byRef.set(key, t);
    }
    if (t.smsBody) {
      const list = byBody.get(t.smsBody) ?? [];
      if (list.some(o => Math.abs(when(o) - when(t)) < 2 * MIN)) { dupes.add(t.id); continue; }
      list.push(t);
      byBody.set(t.smsBody, list);
    }
  }
  return dupes;
}

// ─── 2. OTP enrichment ────────────────────────────────────────────────────────

export type TimedOtp = OtpInfo & { date: number };

/**
 * Give merchant-less card debits the merchant named in the OTP that preceded them
 * (same amount, within 20 minutes). Returns how many were enriched.
 */
export function enrichWithOtps<T extends ReconTxn>(
  txns: T[], otps: TimedOtp[], learned?: Record<string, string>,
): number {
  let n = 0;
  const used = new Set<TimedOtp>();
  for (const t of txns) {
    if (t.type !== 'debit' || t.merchant) continue;
    if (t.kind !== 'card_purchase' && t.kind !== 'atm_withdrawal' && t.kind !== 'online_payment') continue;
    const otp = otps
      .filter(o => !used.has(o) && o.merchant && o.amount !== undefined && near(o.amount, t.amount)
        && when(t) - o.date > -5 * MIN && when(t) - o.date < 20 * MIN)
      .sort((a, b) => Math.abs(when(t) - a.date) - Math.abs(when(t) - b.date))[0];
    if (!otp) continue;
    used.add(otp);
    t.merchant = otp.merchant;
    t.kind = 'card_purchase';
    t.description = otp.merchant as string;
    if (!t.userCategorized) {
      const c = categorize({ kind: 'card_purchase', type: 'debit', merchant: t.merchant, description: t.description }, learned);
      t.category = c.category;
      t.confidence = Math.max(t.confidence ?? 0, 0.8 * c.confidence);
    }
    n++;
  }
  return n;
}

// ─── 3. Self-transfers across accounts / banks ────────────────────────────────

const OUT_KINDS = new Set<TxnKind | undefined>(['transfer_out', 'unknown', undefined]);
const IN_KINDS = new Set<TxnKind | undefined>(['transfer_in', 'unknown', undefined]);
const MAX_FEE = 100; // CEFT adds Rs 25, other banks up to ~Rs 50-100

function markTransfer(t: ReconTxn, group: string) {
  t.transferGroupId = group;
  if (!t.userCategorized) t.category = 'Transfer';
}

/**
 * Pair debits and credits that are the same money moving between the user's own
 * accounts. Both legs become category "Transfer" (excluded from income/expense).
 * Returns the number of pairs found (plus one-legged own-account transfers).
 */
export function pairSelfTransfers<T extends ReconTxn>(txns: T[]): number {
  const ownAccounts = new Set(txns.map(t => t.account).filter((a): a is string => !!a));
  const credits = txns.filter(t => t.type === 'credit' && !t.transferGroupId && IN_KINDS.has(t.kind));
  const debits = txns
    .filter(t => t.type === 'debit' && !t.transferGroupId && OUT_KINDS.has(t.kind))
    .sort((a, b) => a.date - b.date);
  const taken = new Set<string>();
  let pairs = 0;

  for (const d of debits) {
    let best: { c: T; score: number } | null = null;
    for (const c of credits) {
      if (taken.has(c.id) || c.id === d.id) continue;
      const diff = d.amount - c.amount;
      if (!(near(diff, 0) || (diff > 0 && diff <= MAX_FEE))) continue;
      if (d.account && c.account && d.account === c.account) continue;

      const hint = d.counterpartyAccount && c.account ? accountsMatch(d.counterpartyAccount, c.account) : null;
      if (hint === false) continue; // destination account is known and it's not this one
      const window = hint ? 3 * DAY : d.toOwnAccount ? DAY : 45 * MIN;
      const dt = Math.abs(c.date - d.date);
      if (dt > window) continue;

      const score = (hint ? 1000 : 0) + (near(diff, 0) ? 50 : 0) - dt / MIN;
      if (!best || score > best.score) best = { c, score };
    }
    if (best) {
      const group = `tg-${d.id}`;
      markTransfer(d, group);
      markTransfer(best.c, group);
      taken.add(best.c.id);
      pairs++;
      continue;
    }
    // Only one leg visible, but the destination is provably one of the user's accounts
    const toOwn = d.toOwnAccount
      || (!!d.counterpartyAccount && [...ownAccounts].some(a => a !== d.account && accountsMatch(a, d.counterpartyAccount)));
    if (toOwn) { markTransfer(d, `tg-${d.id}`); pairs++; }
  }
  return pairs;
}

// ─── 4. Full pass ─────────────────────────────────────────────────────────────

export interface ReconcileResult<T> {
  txns: T[];
  removed: T[];
  transfersPaired: number;
}

/** Dedupe + pair. Pure with respect to its input array (items are shallow-copied). */
export function reconcileTransactions<T extends ReconTxn>(input: T[]): ReconcileResult<T> {
  const copies = input.map(t => ({ ...t }));
  const dupes = findDuplicates(copies);
  const kept = copies.filter(t => !dupes.has(t.id));
  const removed = copies.filter(t => dupes.has(t.id));
  const transfersPaired = pairSelfTransfers(kept);
  return { txns: kept, removed, transfersPaired };
}

// ─── 5. Recurring payments ────────────────────────────────────────────────────

export interface RecurringPayment {
  key: string;
  label: string;
  category: string;
  averageAmount: number;
  cadence: 'weekly' | 'monthly' | 'yearly';
  occurrences: number;
  lastDate: number;
  nextExpected: number;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Merchants / payees charged on a regular cadence with a stable amount. */
export function detectRecurring<T extends ReconTxn>(txns: T[]): RecurringPayment[] {
  const groups = new Map<string, T[]>();
  for (const t of txns) {
    if (t.type !== 'debit' || t.category === 'Transfer' || t.kind === 'atm_withdrawal') continue;
    const key = t.merchant ? merchantKey(t.merchant)
      : t.counterpartyAccount ? `acct:${t.counterpartyAccount}`
      : t.kind === 'loan_repayment' ? 'loan' : '';
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(t);
    groups.set(key, list);
  }

  const out: RecurringPayment[] = [];
  for (const [key, list] of groups) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => a.date - b.date);
    const gaps = sorted.slice(1).map((t, i) => (t.date - sorted[i].date) / DAY).filter(g => g > 2);
    if (gaps.length === 0) continue;
    const g = median(gaps);
    const cadence = g >= 5 && g <= 9 ? 'weekly' : g >= 25 && g <= 35 ? 'monthly' : g >= 350 && g <= 380 ? 'yearly' : null;
    if (!cadence) continue;
    if (cadence === 'weekly' && sorted.length < 3) continue;

    const amounts = sorted.map(t => t.amount);
    const avg = amounts.reduce((s, a) => s + a, 0) / amounts.length;
    const spread = (Math.max(...amounts) - Math.min(...amounts)) / avg;
    if (spread > 0.3) continue;

    // Regularity: most gaps close to the median
    const regular = gaps.filter(x => Math.abs(x - g) <= Math.max(4, g * 0.2)).length / gaps.length;
    if (regular < 0.6) continue;

    const last = sorted[sorted.length - 1];
    const period = cadence === 'weekly' ? 7 * DAY : cadence === 'monthly' ? 30.4 * DAY : 365 * DAY;
    out.push({
      key,
      label: last.merchant ?? last.description,
      category: last.category,
      averageAmount: Math.round(avg * 100) / 100,
      cadence,
      occurrences: sorted.length,
      lastDate: last.date,
      nextExpected: last.date + period,
    });
  }
  return out.sort((a, b) => b.averageAmount - a.averageAmount);
}
