/**
 * Low-level extraction helpers shared by every bank template:
 * text normalisation, money mentions, date/time, masked account numbers.
 */

const NUM = '[0-9][0-9,]*(?:\\.[0-9]{1,2})?';
const CURRENCY = '(?:LKR|SLR|Rs\\.?|INR|USD|EUR|GBP|AUD|SGD|AED|CAD|JPY)';

export function normalizeText(body: string): string {
  return body
    .replace(/\r\n?/g, '\n')
    .replace(/[   ]/g, ' ')
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

export function toNumber(raw: string): number {
  return parseFloat(raw.replace(/,/g, ''));
}

export function normalizeCurrency(raw: string | undefined): string {
  if (!raw) return 'LKR';
  const c = raw.toUpperCase().replace(/\./g, '');
  return c === 'RS' || c === 'SLR' ? 'LKR' : c;
}

// ─── Money ────────────────────────────────────────────────────────────────────

export interface MoneyMention {
  value: number;
  currency: string;
  index: number;
  end: number;
  /** Explicitly labelled as the transaction amount ("Amount: 1,500.00"). */
  labelled: boolean;
}

const PREFIX_MONEY = new RegExp(`(?:^|[^A-Za-z])(${CURRENCY})\\s*(${NUM})`, 'gi');
const SUFFIX_MONEY = new RegExp(`(${NUM})\\s*(${CURRENCY})(?![A-Za-z])`, 'gi');
const LABELLED_MONEY = new RegExp(
  `\\b(?:txn\\s*)?(?:amount|amt)\\s*(?:\\(approx\\.?\\))?\\s*(?:of\\s*)?[:=]?\\s*(${CURRENCY})?\\s*(${NUM})`,
  'gi',
);

export function findMoney(text: string): MoneyMention[] {
  const out: MoneyMention[] = [];
  const push = (value: number, currency: string, index: number, end: number, labelled: boolean) => {
    if (!isFinite(value) || value <= 0) return;
    const dup = out.find(m => Math.abs(m.index - index) < 12 && m.value === value);
    if (dup) { dup.labelled = dup.labelled || labelled; return; }
    out.push({ value, currency, index, end, labelled });
  };

  for (const m of text.matchAll(PREFIX_MONEY)) {
    const start = (m.index ?? 0) + m[0].indexOf(m[1]);
    push(toNumber(m[2]), normalizeCurrency(m[1]), start, (m.index ?? 0) + m[0].length, false);
  }
  for (const m of text.matchAll(SUFFIX_MONEY)) {
    // Skip things like "2026 LKR" where the number is clearly a year glued to text
    if (!/[.,]/.test(m[1]) && m[1].length === 4 && /^20\d\d$/.test(m[1])) continue;
    push(toNumber(m[1]), normalizeCurrency(m[2]), m.index ?? 0, (m.index ?? 0) + m[0].length, false);
  }
  for (const m of text.matchAll(LABELLED_MONEY)) {
    const start = (m.index ?? 0) + m[0].lastIndexOf(m[2]);
    push(toNumber(m[2]), normalizeCurrency(m[1]), start, (m.index ?? 0) + m[0].length, true);
  }
  return out.sort((a, b) => a.index - b.index);
}

const NON_TXN_CONTEXT = /(bal(?:ance)?|avl|avail(?:able)?|limit|outstanding|due|minimum|min\.?\s*(?:amt|amount|pay)|total\s+due|o\/s)\s*[:.\-=]?\s*(?:is\s*)?$/i;
const TXN_VERB = /(debited|credited|spent|purchase|withdrawn|withdrawal|deposit(?:ed)?|paid|payment|charged|deducted|received|transfer(?:red)?|txn|transaction|reversal|refund)/i;

/** Pick the money mention that is the transaction amount (not the balance / limit). */
export function pickTransactionAmount(text: string): MoneyMention | null {
  const mentions = findMoney(text);
  if (mentions.length === 0) return null;

  let best: MoneyMention | null = null;
  let bestScore = -Infinity;
  mentions.forEach((m, i) => {
    const before = text.slice(Math.max(0, m.index - 30), m.index);
    const around = text.slice(Math.max(0, m.index - 40), Math.min(text.length, m.end + 40));
    let score = 0;
    if (NON_TXN_CONTEXT.test(before)) score -= 10;
    else if (/\b(bal|balance|limit|outstanding)\b/i.test(before.slice(-18))) score -= 5;
    if (m.labelled) score += 3;
    if (TXN_VERB.test(around)) score += 2;
    score -= i * 0.5; // the first amount in an alert is usually the transaction
    if (score > bestScore) { bestScore = score; best = m; }
  });
  return bestScore > -5 ? best : null;
}

export function extractBalance(text: string): number | undefined {
  const m = text.match(
    new RegExp(`(?:av(?:l|ail(?:able)?)?[._\\s]*bal(?:ance)?|bal(?:ance)?\\s+available|a\\/c\\s+bal(?:ance)?)\\s*(?:is)?\\s*[:\\-=]?\\s*${CURRENCY}?\\s*(-?${NUM})`, 'i'),
  );
  return m ? toNumber(m[1]) : undefined;
}

// ─── Date / time ──────────────────────────────────────────────────────────────

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

interface DateCandidate { ts: number; hasTime: boolean; index: number }

function year4(y: string): number {
  const n = +y;
  return y.length <= 2 ? 2000 + n : n;
}

function hour24(h: string, ampm?: string): number {
  let n = +h;
  if (ampm) {
    const pm = ampm.toUpperCase() === 'PM';
    if (pm && n < 12) n += 12;
    if (!pm && n === 12) n = 0;
  }
  return n;
}

function mk(y: number, mo: number, d: number, h = 0, mi = 0, s = 0): number | null {
  if (mo < 0 || mo > 11 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null;
  const dt = new Date(y, mo, d, h, mi, s);
  // Reject roll-overs like 31/02
  if (dt.getMonth() !== mo || dt.getDate() !== d) return null;
  return dt.getTime();
}

const DATE_PATTERNS: Array<{ re: RegExp; build: (m: RegExpMatchArray) => number | null; hasTime: boolean }> = [
  // "@08:55 13/08/2026", "at 11:19 07/08/2026" — time before date (People's Bank)
  {
    re: /\b(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?\s+(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/gi,
    build: m => mk(year4(m[7]), +m[6] - 1, +m[5], hour24(m[1], m[4]), +m[2], m[3] ? +m[3] : 0),
    hasTime: true,
  },
  // "2026-08-07 16:40", "2026/08/07 16:40:52"
  {
    re: /\b(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/gi,
    build: m => mk(+m[1], +m[2] - 1, +m[3], hour24(m[4], m[7]), +m[5], m[6] ? +m[6] : 0),
    hasTime: true,
  },
  // "07/08/2026 16:40:52", "15/07/26 10:23 AM", "12.07.26, 10:23"
  {
    re: /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})[ ,]*(?:at|time)?\s*:?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/gi,
    build: m => mk(year4(m[3]), +m[2] - 1, +m[1], hour24(m[4], m[7]), +m[5], m[6] ? +m[6] : 0),
    hasTime: true,
  },
  // "12-Jul-2026 10:23", "12 Jul 26"
  {
    re: /\b(\d{1,2})[-\s]?(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[-\s,]?(\d{4}|\d{2})(?:[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?/gi,
    build: m => mk(year4(m[3]), MONTHS[m[2].slice(0, 3).toLowerCase()], +m[1],
      m[4] ? hour24(m[4], m[7]) : 0, m[5] ? +m[5] : 0, m[6] ? +m[6] : 0),
    hasTime: false, // refined below when a time group matched
  },
  // "2026-08-07"
  {
    re: /\b(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})\b/g,
    build: m => mk(+m[1], +m[2] - 1, +m[3]),
    hasTime: false,
  },
  // "07/08/2026", "07-08-26", "12.07.26"
  {
    re: /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/g,
    build: m => mk(year4(m[3]), +m[2] - 1, +m[1]),
    hasTime: false,
  },
];

function findDates(text: string): DateCandidate[] {
  const out: DateCandidate[] = [];
  for (const p of DATE_PATTERNS) {
    for (const m of text.matchAll(p.re)) {
      const ts = p.build(m);
      if (ts === null) continue;
      const hasTime = p.hasTime || (p.re.source.includes('Jan|Feb') && !!m[4]);
      out.push({ ts, hasTime, index: m.index ?? 0 });
    }
  }
  return out;
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * Transaction timestamp from the SMS body, sanity-checked against the delivery time.
 * - Prefers candidates that carry a time of day.
 * - A date-only match on the same day as delivery uses the delivery time (keeps ordering).
 * - Anything implausibly far from delivery is ignored (e.g. interest period ranges).
 */
export function resolveTransactionDate(text: string, smsDate?: number): number | null {
  const candidates = findDates(text);
  const ref = smsDate ?? Date.now();
  const plausible = candidates.filter(c => c.ts >= ref - 10 * DAY && c.ts <= ref + DAY);
  const pool = smsDate !== undefined ? plausible : candidates.filter(c => c.ts <= Date.now() + DAY);
  if (pool.length === 0) return smsDate ?? null;

  const timed = pool.filter(c => c.hasTime);
  if (timed.length > 0) {
    // Closest to delivery wins (a time-stamped alert is usually seconds/minutes before delivery)
    return timed.sort((a, b) => Math.abs(a.ts - ref) - Math.abs(b.ts - ref))[0].ts;
  }
  const d = pool.sort((a, b) => Math.abs(a.ts - ref) - Math.abs(b.ts - ref))[0];
  if (smsDate !== undefined) {
    const day = new Date(d.ts);
    const sms = new Date(smsDate);
    if (day.toDateString() === sms.toDateString()) return smsDate;
    return d.ts + 12 * 60 * 60 * 1000; // midday — avoids timezone edge flips
  }
  return d.ts;
}

// ─── Accounts ─────────────────────────────────────────────────────────────────

/** "XXXXXXXXXX072" → "*072", "186-2002****51" → "186-2002*51", "**3634" → "*3634". */
export function maskAccount(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const cleaned = raw.replace(/\s+/g, '').replace(/[()]/g, '').replace(/[Xx*•#]+/g, '*').replace(/^[^0-9*]+|[^0-9*]+$/g, '');
  return /\d/.test(cleaned) ? cleaned : undefined;
}

/** Trailing visible digits used for cross-bank matching. */
export function accountTail(acc: string | undefined): string | undefined {
  if (!acc) return undefined;
  const afterMask = acc.split('*').pop() ?? '';
  const digits = afterMask.replace(/\D/g, '');
  if (digits.length >= 2) return digits;
  const all = acc.replace(/\D/g, '');
  return all.length >= 2 ? all.slice(-4) : undefined;
}

/** Two masked accounts could be the same account (tails agree on their overlap). */
export function accountsMatch(a: string | undefined, b: string | undefined): boolean {
  const ta = accountTail(a);
  const tb = accountTail(b);
  if (!ta || !tb) return false;
  const short = ta.length <= tb.length ? ta : tb;
  const long = ta.length <= tb.length ? tb : ta;
  return short.length >= 2 && long.endsWith(short) && short.length >= Math.min(3, long.length);
}

// ─── Casing ───────────────────────────────────────────────────────────────────

const KEEP_LOWER = new Set(['of', 'and', 'de', 'the', 'at', 'to', 'for', 'on', 'in', '&']);
const KEEP_UPPER = new Set(['ATM', 'POS', 'KFC', 'SLT', 'BOC', 'HNB', 'NDB', 'NTB', 'CEB', 'LECO', 'SLTB', 'IOC', 'DFCC', 'NSB', 'CEFT', 'SLIPS', 'RTGS', 'IBFT', 'PVR', 'USD', 'LKR', 'UK', 'USA', 'P&S']);

export function smartTitle(s: string): string {
  return s
    .toLowerCase()
    .split(/(\s+)/)
    .map((w, i) => {
      if (/^\s+$/.test(w)) return w;
      const up = w.toUpperCase();
      if (KEEP_UPPER.has(up.replace(/[^A-Z&]/g, ''))) return up;
      if (i > 0 && KEEP_LOWER.has(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join('');
}
