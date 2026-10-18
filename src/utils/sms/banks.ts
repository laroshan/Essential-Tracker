/**
 * Bank detection + per-bank SMS templates.
 *
 * Templates for BOC, People's Bank (incl. LankaPay) and Sampath were built from
 * real alerts. Every other bank goes through `genericTemplate`, which scores all
 * money mentions and the verbs around them instead of trusting the first number.
 */
import type { OtpInfo, PaymentMethod, TemplateResult, TxnKind, TxnType } from './types';
import { cleanMerchant } from './categorizer';
import {
  extractBalance, maskAccount, normalizeCurrency, pickTransactionAmount, smartTitle, toNumber,
} from './text';

// ─── Bank detection ───────────────────────────────────────────────────────────

interface BankDef { id: string; name: string; sender: RegExp; body?: RegExp }

export const BANKS: BankDef[] = [
  { id: 'BOC', name: 'Bank of Ceylon', sender: /^BOC|BANKOFCEYLON/i, body: /banking with BOC|Bank of Ceylon|BOC Card/i },
  { id: 'PEOPLES', name: "People's Bank", sender: /PEOPLE|PBCL|PBANK/i, body: /peoples?'?\s*bank|Peoples Card|Call(?:Centre)?\s*1961/i },
  { id: 'SAMPATH', name: 'Sampath Bank', sender: /SAMPATH/i, body: /0112303050|sampath/i },
  { id: 'COMBANK', name: 'Commercial Bank', sender: /COMBANK|COMMERCIAL|CBC/i, body: /commercial bank|combank/i },
  { id: 'HNB', name: 'HNB', sender: /^HNB/i, body: /HNB SMS ALERT|Hatton National/i },
  { id: 'NDB', name: 'NDB Bank', sender: /^NDB/i, body: /\bNDB Bank\b/i },
  { id: 'NTB', name: 'Nations Trust Bank', sender: /NTB|NATIONS|AMEX/i, body: /nations trust|\bNTB\b/i },
  { id: 'SEYLAN', name: 'Seylan Bank', sender: /SEYLAN/i, body: /seylan/i },
  { id: 'DFCC', name: 'DFCC Bank', sender: /DFCC/i, body: /\bDFCC\b/i },
  { id: 'NSB', name: 'NSB', sender: /^NSB/i, body: /national savings bank/i },
  { id: 'PABC', name: 'Pan Asia Bank', sender: /PABC|PANASIA/i, body: /pan asia/i },
  { id: 'UNION', name: 'Union Bank', sender: /UNIONB/i, body: /union bank/i },
  { id: 'CARGILLS', name: 'Cargills Bank', sender: /CARGILLSB/i, body: /cargills bank/i },
  { id: 'AMANA', name: 'Amana Bank', sender: /AMANA/i, body: /amana bank/i },
];

export function detectBank(address: string, text: string): string {
  const addr = address.replace(/[^A-Za-z0-9]/g, '');
  for (const b of BANKS) if (addr && b.sender.test(addr)) return b.id;
  for (const b of BANKS) if (b.body && b.body.test(text)) return b.id;
  return addr ? addr.toUpperCase() : 'UNKNOWN';
}

export function bankName(id: string): string {
  return BANKS.find(b => b.id === id)?.name ?? id;
}

// ─── Shared label → kind mapping ──────────────────────────────────────────────

/**
 * Turn a bank's transaction label ("CEFT Transfer Debit", "SLIPS Credit Txn",
 * "Loan Rec.186…", "POS/ATM Transaction") into a kind.
 */
export function kindFromLabel(label: string, type: TxnType, reversal = false): TxnKind {
  const l = label.toLowerCase();
  if (reversal || /\b(reversal|refund|reversed|chargeback)\b/.test(l)) return type === 'credit' ? 'refund' : 'fee';
  if (/cash\s*dep|\bdeposit/.test(l)) return 'cash_deposit';
  if (/\bpos\b|purchase|e-?com|card\s*txn/.test(l)) return 'card_purchase';
  if (/\batm\b|withdraw/.test(l)) return type === 'debit' ? 'atm_withdrawal' : 'refund';
  if (/loan|lease|leasing|\bemi\b|instal+ment/.test(l)) return type === 'debit' ? 'loan_repayment' : 'transfer_in';
  if (/tax|\bwht\b|stamp\s*duty|levy/.test(l)) return 'tax';
  if (/interest|\bint\.?\s*pd/.test(l)) return type === 'credit' ? 'interest' : 'fee';
  if (/\bfee\b|charge|commission|penalty|annual\s*fee/.test(l)) return 'fee';
  if (/just\s*pay|bill\s*pay|utility|biller/.test(l)) return 'online_payment';
  if (/transfer|tfr|trf|slips|ceft|rtgs|ibft|lpay|lankapay|fund|standing|automatic|salary|payroll|remittance|cheque|chq/.test(l)) {
    return type === 'credit' ? 'transfer_in' : 'transfer_out';
  }
  return 'unknown';
}

function methodFor(kind: TxnKind, text: string): PaymentMethod {
  if (/credit\s*card|\bcc\b|amex|credit\s*card\s*ending/i.test(text)) return 'Credit Card';
  if (kind === 'card_purchase' || kind === 'atm_withdrawal') return 'Debit Card';
  if (kind === 'cash_deposit') return 'Cash';
  if (kind === 'refund' && /\bcard\b|\bpos\b|e-?com/i.test(text)) return 'Debit Card';
  return 'Bank Transfer';
}

const TRANSFER_LABELS: Array<[RegExp, string]> = [
  [/slips/i, 'SLIPS Transfer'],
  [/ceft/i, 'CEFT Transfer'],
  [/rtgs/i, 'RTGS Transfer'],
  [/lpay|lankapay/i, 'LankaPay Transfer'],
  [/automatic|standing/i, 'Standing Order'],
  [/online/i, 'Online Transfer'],
];

function describe(kind: TxnKind, type: TxnType, label: string, merchant?: string, extra?: string): string {
  switch (kind) {
    case 'card_purchase':
    case 'online_payment':
      return merchant ?? smartTitle(label.replace(/\s+(?:transaction|txn)$/i, ''));
    case 'atm_withdrawal':
      return extra ? `ATM Withdrawal · ${smartTitle(extra)}` : 'ATM Withdrawal';
    case 'cash_deposit':
      return 'Cash Deposit';
    case 'refund':
      return merchant ? `Refund · ${merchant}` : 'Refund / Reversal';
    case 'interest':
      return 'Interest Credit';
    case 'tax':
      return /withold|withhold|wht/i.test(label) ? 'Withholding Tax' : 'Tax';
    case 'fee':
      return smartTitle(label) || 'Bank Charge';
    case 'loan_repayment':
      return 'Loan Repayment';
    case 'transfer_in':
    case 'transfer_out': {
      if (/salary|payroll/i.test(label + ' ' + (extra ?? ''))) return 'Salary';
      const base = TRANSFER_LABELS.find(([re]) => re.test(label))?.[1] ?? 'Transfer';
      const dir = type === 'credit' ? 'from' : 'to';
      if (merchant) return `${base} ${dir} ${merchant}`;
      if (extra) return `${base} ${dir} A/C ${extra}`;
      return type === 'credit' ? `${base} In` : `${base} Out`;
    }
    default:
      return merchant ?? (smartTitle(label) || 'Bank Transaction');
  }
}

// ─── OTP ──────────────────────────────────────────────────────────────────────

const OTP_WORD = '(?:OTP|one[-\\s]?time\\s*(?:password|pin|code)|verification\\s*code|passcode|security\\s*code)';
const OTP_DISCLAIMER = new RegExp(`(?:do\\s*not|don'?t|never)\\s+(?:share|disclose|ask\\s+for)\\b[^.]{0,60}?${OTP_WORD}s?`, 'gi');
const OTP_WITH_CODE = new RegExp(`${OTP_WORD}\\D{0,40}\\b\\d{4,8}\\b|\\b\\d{4,8}\\b\\D{0,40}${OTP_WORD}`, 'i');

/** A message that actually carries a one-time code (not just an "never share your OTP" footer). */
export function isOtpMessage(text: string): boolean {
  return OTP_WITH_CODE.test(text.replace(OTP_DISCLAIMER, ' '));
}

export function parseOtp(text: string): OtpInfo {
  // BOC: "135295 is the one-time password (OTP) to your online payment LKR 7546.20 from BOC Card 9405 at Dialog Axi. Thank you."
  let m = text.match(/online\s+payment\s+([A-Z]{3}|Rs\.?)\s*([\d,]+(?:\.\d{1,2})?)\s+from\s+.*?card\s*\*?(\d{3,4})\s+at\s+(.+?)\.\s*(?:Thank|$)/i);
  if (m) return { currency: normalizeCurrency(m[1]), amount: toNumber(m[2]), card: m[3], merchant: cleanMerchant(m[4]) };

  // People's: "[Amount of 2970.00 LKR for https://www.bookmyshow.com using Peoples Card **4295 ]"
  m = text.match(/Amount\s+of\s+([\d,]+(?:\.\d{1,2})?)\s*([A-Z]{3})\s+for\s+(\S+)\s+using\s+.*?card\s*\*+(\d{3,4})/i);
  if (m) return { amount: toNumber(m[1]), currency: normalizeCurrency(m[2]), merchant: cleanMerchant(m[3]), card: m[4] };

  // Generic: "OTP for txn of LKR 1,200.00 at MERCHANT"
  const amt = pickTransactionAmount(text);
  const merch = text.match(/\b(?:at|for|to)\s+([A-Za-z][A-Za-z0-9 .&'*-]{2,40}?)(?:\s+(?:using|with|on|from)\b|[.,\]]|$)/);
  return {
    amount: amt?.value,
    currency: amt?.currency,
    merchant: merch ? cleanMerchant(merch[1]) : undefined,
  };
}

// ─── Templates ────────────────────────────────────────────────────────────────

const AMT = '([0-9][0-9,]*(?:\\.[0-9]{1,2})?)';

type Template = { name: string; bank?: string; parse: (text: string) => TemplateResult | null };

/**
 * BOC:
 *  "Online Transfer Debit Rs 750.00 From A/C No XXXX072. Balance available Rs 91977.45 - Thank you for banking with BOC"
 *  "ATM Cash Deposit Rs 38000.00 To A/C No XXXXXXXXXX072. Balance available Rs 92727.45 - ..."
 *  "POS/ATM Transaction Rs 666.00 From A/C No XXXXXXXXXX072. ..."
 */
const bocTemplate: Template = {
  name: 'boc.account',
  parse(text) {
    const m = text.match(new RegExp(
      `^\\s*([A-Za-z][A-Za-z/ .&-]*?)\\s+(?:Rs\\.?|LKR)\\s*${AMT}\\s+(From|To)\\s+A\\/C\\s*(?:No\\.?)?\\s*([0-9Xx*]+)`, 'i'));
    if (!m) return null;
    const label = m[1].trim();
    const amount = toNumber(m[2]);
    const type: TxnType = m[3].toLowerCase() === 'from' ? 'debit' : 'credit';
    let kind = kindFromLabel(label, type);
    let parseConfidence = 0.95;

    // "POS/ATM Transaction" is ambiguous. Cash withdrawals are round hundreds,
    // optionally plus the Rs 30 other-bank ATM fee (4530 = 4500 + 30).
    if (/pos\s*\/\s*atm/i.test(label)) {
      const cents = Math.round(amount * 100) % 10000;
      const looksLikeCash = amount >= 1000 && (cents === 0 || cents === 3000);
      kind = looksLikeCash ? 'atm_withdrawal' : 'card_purchase';
      parseConfidence = 0.6;
    }

    return {
      amount,
      currency: 'LKR',
      type,
      kind,
      description: kind === 'card_purchase' ? 'BOC Card Payment' : describe(kind, type, label),
      paymentMethod: methodFor(kind, label),
      account: maskAccount(m[4]),
      balance: extractBalance(text),
      template: this.name,
      parseConfidence,
    };
  },
};

/**
 * People's Bank account alerts:
 *  "Your A/C 186-2002****51 has been debited by Rs. 910.00 (POS @08:55 13/08/2026 at NATURE MARTS PVT).[Av_Bal: Rs. 79117.76 as of SMS]"
 *  "Your A/C (186-2002******51) has been Credited by Rs. 140320.00 (SLIPS Credit Txn at 11:19 07/08/2026)."
 *  "Your A/C 186-2002****51 has been Credited (Reversal) by Rs. 2298.31 (POS @19:09 26/06/2026 at UBER EATS)."
 *  "Your A/C 186-2002****51 has been debited by Rs. 82440.01(Loan Rec.1868101**294 @00:00 20/07/2026)."
 */
const peoplesAccountTemplate: Template = {
  name: 'peoples.account',
  parse(text) {
    const m = text.match(new RegExp(
      `A\\/C\\s*\\(?\\s*([0-9Xx*\\-]+)\\s*\\)?\\s+has\\s+been\\s+(debited|credited)\\s*(\\(\\s*reversal\\s*\\))?\\s*by\\s*(?:Rs\\.?|LKR)\\s*${AMT}\\s*\\(([^)]*)\\)`, 'i'));
    if (!m) return null;
    const type: TxnType = m[2].toLowerCase() === 'debited' ? 'debit' : 'credit';
    const reversal = !!m[3];
    const inner = m[5].trim();

    // "<LABEL> @HH:MM DD/MM/YYYY [at <PLACE>]" or "<LABEL> at HH:MM DD/MM/YYYY"
    const parts = inner.match(/^(.*?)\s*(?:@|\bat\b)\s*\d{1,2}:\d{2}\s+\d{1,2}\/\d{1,2}\/\d{2,4}(?:\s+at\s+(.+))?$/i);
    const label = (parts ? parts[1] : inner).trim();
    const place = parts?.[2]?.trim();

    const kind = kindFromLabel(label, type, reversal);
    const merchant = kind === 'card_purchase' || kind === 'refund' || kind === 'online_payment' ? cleanMerchant(place) : undefined;
    const loanAcc = label.match(/loan\s*rec\.?\s*([0-9*]+)/i)?.[1];

    return {
      amount: toNumber(m[4]),
      currency: 'LKR',
      type,
      kind,
      merchant,
      description: describe(kind, type, label, merchant, kind === 'atm_withdrawal' ? place : undefined),
      paymentMethod: methodFor(kind, label),
      account: maskAccount(m[1]),
      counterpartyAccount: maskAccount(loanAcc),
      balance: extractBalance(text),
      template: this.name,
      parseConfidence: 0.95,
    };
  },
};

/**
 * People's Bank / LankaPay outgoing transfer confirmation:
 *  "LANKAPAY - ONLINE Transfer of LKR 30000.00 to A/C 1**634 on 2026-08-07 16:40 Ref 2608071225498507 is successful."
 *  "Fund Transfer of LKR 38000.00 to A/C 1861002**33 on 2026-08-10 08:02 Ref 2608101247071361 is successful."
 */
const lankapayTemplate: Template = {
  name: 'lankapay.transfer',
  parse(text) {
    const m = text.match(new RegExp(
      `(LANKAPAY[\\s-]*(?:ONLINE)?|ONLINE|FUND|CEFT|SLIPS)?\\s*Transfer\\s+of\\s+(LKR|Rs\\.?)\\s*${AMT}\\s+to\\s+(your\\s+)?A\\/C\\s*([0-9Xx*]+)(?:.*?\\bRef\\.?\\s*:?\\s*([A-Za-z0-9]+))?`, 'i'));
    if (!m) return null;
    const label = (m[1] ?? 'Fund').trim();
    const counterparty = maskAccount(m[5]);
    const isLankaPay = /lankapay/i.test(label);
    return {
      amount: toNumber(m[3]),
      currency: normalizeCurrency(m[2]),
      type: 'debit',
      kind: 'transfer_out',
      description: `${isLankaPay ? 'LankaPay Transfer' : 'Fund Transfer'} to A/C ${counterparty ?? ''}`.trim(),
      paymentMethod: 'Bank Transfer',
      counterpartyAccount: counterparty,
      toOwnAccount: !!m[4],
      reference: m[6],
      template: this.name,
      parseConfidence: 0.95,
    };
  },
};

/**
 * Sampath:
 *  "LKR 6,425.00 debited from AC **3634 for eCom Google One Mo MASTTERM\n07/08/2026 16:40:52\n..."
 *  "LKR 30,000.00 credited to AC **3634 for google\n07/08/2026 16:40:24"
 *  "LKR 14.27 credited to AC **3634 for Interest: 1xxx3634:Int.Pd:20-06-2026 to 19-07-2026"
 */
const sampathTemplate: Template = {
  name: 'sampath.account',
  bank: 'SAMPATH',
  parse(text) {
    const m = text.match(new RegExp(
      `(LKR|Rs\\.?|USD|[A-Z]{3})\\s*${AMT}\\s+(debited|credited)\\s+(?:from|to)\\s+(?:your\\s+)?A\\/?C\\s*(?:No\\.?)?\\s*([0-9Xx*]+)(?:\\s+(?:for|at|via)\\s+([^\\n]+))?`, 'i'));
    if (!m) return null;
    const type: TxnType = m[3].toLowerCase() === 'debited' ? 'debit' : 'credit';
    const note = (m[5] ?? '').trim();

    let kind: TxnKind;
    let merchant: string | undefined;
    let reference: string | undefined;
    let extra: string | undefined;
    if (/^(?:e-?com|pos)\b/i.test(note)) {
      kind = type === 'debit' ? 'card_purchase' : 'refund';
      merchant = cleanMerchant(note);
    } else if (/^atm\b/i.test(note)) {
      kind = type === 'debit' ? 'atm_withdrawal' : 'refund';
      extra = note.replace(/^atm\s*/i, '') || undefined;
    } else {
      const labelled = kindFromLabel(note, type);
      kind = labelled === 'unknown' ? (type === 'credit' ? 'transfer_in' : 'transfer_out') : labelled;
      // Only a free-text remark (not a bank label like "Fund Transfer") names a payee
      if (labelled === 'unknown') {
        // Free-text remark on a transfer: a reference code, or a payee/purpose note
        if (/^[A-Z0-9/-]{6,}$/i.test(note) && /\d/.test(note)) reference = note;
        else if (note) merchant = cleanMerchant(note);
      }
    }

    return {
      amount: toNumber(m[2]),
      currency: normalizeCurrency(m[1]),
      type,
      kind,
      merchant: kind === 'transfer_in' ? undefined : merchant,
      description: kind === 'transfer_in' && merchant
        ? `Transfer In · ${merchant}`
        : describe(kind, type, note || 'Transfer', merchant, extra),
      paymentMethod: methodFor(kind, note),
      account: maskAccount(m[4]),
      reference,
      balance: extractBalance(text),
      template: this.name,
      parseConfidence: 0.9,
    };
  },
};

// ─── Generic fallback ─────────────────────────────────────────────────────────

const CREDIT_WORDS = /\b(credited|received|deposited|refund(?:ed)?|reversal|reversed|cashback|credit\s+of|cr\.?)\b/gi;
const DEBIT_WORDS = /\b(debited|spent|withdrawn|withdrawal|purchase[ds]?|paid|payment|charged|deducted|sent|transferred|debit\s+of|dr\.?|(?:txn|transaction)\s+(?:at|of)|(?:was\s+)?used)\b/gi;

function nearestDirection(text: string, at: number): TxnType | null {
  // "credit card" is a product name, not a direction
  const t = text.replace(/credit\s*card/gi, m => '_'.repeat(m.length)).replace(/debit\s*card/gi, m => '_'.repeat(m.length));
  let best: { d: number; type: TxnType } | null = null;
  const scan = (re: RegExp, type: TxnType) => {
    for (const m of t.matchAll(re)) {
      const d = Math.abs((m.index ?? 0) - at);
      if (!best || d < best.d) best = { d, type };
    }
  };
  scan(CREDIT_WORDS, 'credit');
  scan(DEBIT_WORDS, 'debit');
  if (best) return (best as { type: TxnType }).type;
  // Alert headers like "HNB SMS ALERT: Debit," / "Credit Alert"
  if (/\bdebit\b/i.test(t)) return 'debit';
  if (/\bcredit\b/i.test(t)) return 'credit';
  return null;
}

const MERCHANT_PATTERNS: RegExp[] = [
  /\b(?:merchant|location|payee|beneficiary)\s*[:=-]\s*([^,\n;]+)/i,
  /\b(?:purchase|txn|transaction|spent|payment|paid|used)\b[^.]*?\bat\s+([A-Za-z0-9][A-Za-z0-9 .&'*/-]{1,40}?)(?=\s+(?:on|for|using|via|with|from|ref|card|avl|bal)\b|[.,;)\]\n]|\s+\d{1,2}[/-]|$)/i,
  /\bat\s+([A-Za-z][A-Za-z0-9 .&'*/-]{1,40}?)(?=\s+(?:on|for|using|via|with|from|ref|card|avl|bal)\b|[.,;)\]\n]|\s+\d{1,2}[/-]|$)/i,
  /\b(?:paid|sent|transferred)\s+to\s+([A-Za-z][A-Za-z0-9 .&'-]{1,40}?)(?=\s+(?:on|from|via|ref|a\/c|acc)\b|[.,;)\]\n]|$)/i,
  /\b(?:debited|deducted|paid|payment)\b[^.]*?\bfor\s+([A-Za-z][A-Za-z0-9 .&'*/-]{2,40}?)(?=\s+(?:on|at|using|via|ref)\b|[.,;)\]\n]|$)/i,
];

const CARD_OR_ACCOUNT = /(?:card|a\/c|acct?|account)\s*(?:no\.?|number|ending(?:\s+with)?|#)?\s*[:#]?\s*([0-9Xx*]{0,12}[0-9]{2,4})\b/i;

const genericTemplate: Template = {
  name: 'generic',
  parse(text) {
    const money = pickTransactionAmount(text);
    if (!money) return null;
    if (!/(debit|credit|spent|purchase|withdraw|deposit|paid|payment|charged|deducted|received|transfer|txn|transaction|reversal|refund|used)/i.test(text)) return null;

    const type = nearestDirection(text, money.index);
    if (!type) return null;

    let merchant: string | undefined;
    for (const re of MERCHANT_PATTERNS) {
      const mm = text.match(re);
      if (mm) {
        const cand = mm[1].trim();
        if (/^\d{1,2}:\d{2}/.test(cand) || /^(your|the|a\/c|ac|account|card)\b/i.test(cand)) continue;
        merchant = cleanMerchant(cand);
        if (merchant) break;
      }
    }

    const window = text.slice(Math.max(0, money.index - 60), Math.min(text.length, money.end + 120));
    let kind = kindFromLabel(window, type);
    if (kind === 'unknown') {
      if (merchant && type === 'debit') kind = /\bcard\b/i.test(text) ? 'card_purchase' : 'online_payment';
      else if (type === 'credit') kind = 'transfer_in';
    }

    return {
      amount: money.value,
      currency: money.currency,
      type,
      kind,
      merchant: kind === 'atm_withdrawal' ? undefined : merchant,
      description: describe(kind, type, /salary|payroll/i.test(window) ? 'Salary' : '', merchant, kind === 'atm_withdrawal' ? merchant : undefined),
      paymentMethod: methodFor(kind, text),
      account: maskAccount(text.match(CARD_OR_ACCOUNT)?.[1]),
      reference: text.match(/\b(?:ref(?:erence)?|txn\s*id|rrn)\s*(?:no\.?)?\s*[:#-]?\s*([A-Za-z0-9]{6,})/i)?.[1],
      balance: extractBalance(text),
      template: this.name,
      parseConfidence: merchant ? 0.7 : 0.55,
    };
  },
};

/** Specific templates first, generic last. */
export const TEMPLATES: Template[] = [
  peoplesAccountTemplate,
  lankapayTemplate,
  bocTemplate,
  sampathTemplate,
  genericTemplate,
];

export function runTemplates(text: string, bank: string): TemplateResult | null {
  for (const t of TEMPLATES) {
    if (t.bank && t.bank !== bank) continue;
    const r = t.parse(text);
    if (r && r.amount > 0 && r.amount < 1e9) return r;
  }
  return null;
}
