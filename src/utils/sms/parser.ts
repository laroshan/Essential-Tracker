/**
 * Single-message analysis: classify → template → date → categorise.
 */
import type { ParsedTxn, SmsAnalysis } from './types';
import { detectBank, isOtpMessage, parseOtp, runTemplates } from './banks';
import { categorize } from './categorizer';
import { normalizeText, pickTransactionAmount, resolveTransactionDate } from './text';

const FAILED_SIGNAL = /\b(unsuccessful|declined|failed|rejected|insufficient\s+(?:funds|balance)|could\s+not\s+be\s+processed|not\s+processed|was\s+not\s+completed)\b/i;
const PROMO_SIGNAL = /\b(offer|discount|%\s*off|win\b|apply\s+now|activate|download|pre-?approved|promo|exclusive|hurry|limited\s+time|T&C|experience\s+digital|#\w+)/i;
const TXN_SIGNAL = /\b(debited|credited|has\s+been\s+(?:debited|credited)|spent|withdrawn|withdrawal|deposit|purchase|transfer|txn|transaction|paid|received|charged|deducted|used)\b/i;

export interface AnalyzeOptions {
  /** OS delivery time — anchors and sanity-checks the body's date. */
  smsDate?: number;
  /** User-taught category overrides keyed by `learnKey`. */
  learned?: Record<string, string>;
}

export function analyzeSms(body: string, address = '', opts: AnalyzeOptions = {}): SmsAnalysis {
  const text = normalizeText(body ?? '');
  const bank = detectBank(address, text);

  if (!text) return { cls: 'info', bank };

  // 1. OTPs announce an attempt; the real debit alert follows separately.
  if (isOtpMessage(text)) return { cls: 'otp', bank, otp: parseOtp(text) };

  // 2. Declined / unsuccessful attempts move no money.
  if (FAILED_SIGNAL.test(text)) return { cls: 'failed', bank };

  // 3. Bank-specific templates, then the scored generic parser.
  const tpl = runTemplates(text, bank);
  if (!tpl) {
    if (PROMO_SIGNAL.test(text) && !TXN_SIGNAL.test(text)) return { cls: 'promo', bank };
    const looksFinancial = TXN_SIGNAL.test(text) && !!pickTransactionAmount(text);
    return { cls: looksFinancial ? 'unparsed' : 'info', bank };
  }

  const transactionDate = tpl.transactionDate ?? resolveTransactionDate(text, opts.smsDate);
  const cat = categorize(
    { kind: tpl.kind, type: tpl.type, merchant: tpl.merchant, description: tpl.description },
    opts.learned,
  );

  const { parseConfidence, ...rest } = tpl;
  const txn: ParsedTxn = {
    ...rest,
    bank,
    transactionDate,
    category: cat.category,
    confidence: Math.round(parseConfidence * cat.confidence * 100) / 100,
  };
  if (txn.currency !== 'LKR') txn.confidence = Math.min(txn.confidence, 0.5);

  return { cls: 'transaction', bank, txn };
}

/** Back-compat convenience: the parsed transaction or null. */
export function parseSMS(body: string, address = '', opts: AnalyzeOptions = {}): ParsedTxn | null {
  const r = analyzeSms(body, address, opts);
  return r.cls === 'transaction' ? r.txn ?? null : null;
}
