/**
 * Merchant normalisation + categorisation.
 *
 * Matching runs on the merchant / counterparty text only — never on the whole
 * SMS body (bank boilerplate like "Do not share OTP" used to trigger "Investment").
 * Phrases match on word boundaries, with light plural stemming so that
 * "NATURE MARTS" ≈ "nature mart" and "SUPER MART" ≈ "supermart".
 */
import type { TxnKind, TxnType } from './types';
import { smartTitle } from './text';

// ─── Merchant cleaning ────────────────────────────────────────────────────────

const LEGAL_SUFFIX = /\b(?:\(?pvt\)?\.?\s*(?:ltd\.?)?|private\s+limited|ltd\.?|limited|plc|inc\.?|llc|co\.?)\s*$/i;
const CARD_NETWORK_TAIL = /\b(?:masterm|mastterm|mastercard|master|visa|amex|upi)\b\s*$/i;
const COUNTRY_TAIL = /[\s-]+(?:mo|ca|us|usa|lk|lkr|sg|ie|gb|uk|in|nl|au|hk)\s*$/i;
const ID_TAIL = /\s+[#\d][\d-]{3,}\s*$/;

export function cleanMerchant(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  let s = raw.trim();

  // URLs → bare host ("https://www.daraz.lk/" → "daraz.lk")
  const url = s.match(/^(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)\/?/i);
  if (url && /^(?:https?:|www\.)/i.test(s)) {
    const host = url[1].toLowerCase();
    // 3-D Secure gateways say nothing about the merchant
    if (/^secure|3ds|acs\b|^(?:www\.)?pay\./.test(host)) return undefined;
    return host;
  }
  if (/^https?:\/\//i.test(s)) return undefined;

  s = s
    .replace(/^(?:ecom|e-com|pos|purchase(?:\s+at)?|payment\s+to)\s+/i, '')
    .replace(/\*+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  for (let i = 0; i < 3; i++) {
    const before = s;
    s = s.replace(ID_TAIL, '').replace(CARD_NETWORK_TAIL, '').replace(LEGAL_SUFFIX, '').replace(COUNTRY_TAIL, '').trim();
    if (s === before) break;
  }
  s = s.replace(/[\s.,;:-]+$/, '').trim();
  // "GOOGLE Google One" → "Google One"
  s = s.replace(/^(\S+)\s+(\S+)/, (all, a: string, b: string) => (a.toLowerCase() === b.toLowerCase() ? b : all));
  if (s.length < 2 || /^\d+$/.test(s)) return undefined;
  return /[a-z]/.test(s) && /[A-Z]/.test(s) ? s : smartTitle(s);
}

/** Stable key for learning: "CARGILLS-TORRINGTON SQ" and "Cargills - Torrington Sq" agree. */
export function merchantKey(s: string | undefined): string {
  if (!s) return '';
  return tokens(s).join(' ');
}

function stem(t: string): string {
  return t.length > 3 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t;
}

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map(stem);
}

// ─── Rules ────────────────────────────────────────────────────────────────────

interface Rule { category: string; phrases: string[] }

// Order matters: first match wins, so more specific brands come first.
const RULES: Rule[] = [
  { category: 'Food & Drinks', phrases: ['uber eats', 'ubereats', 'pickme food', 'foodpanda', 'doordash', 'swiggy', 'zomato'] },
  { category: 'Transport', phrases: [
    'uber', 'pickme', 'pickme ride', 'kangaroo cab', 'yogo', 'grab', 'ola cab', 'lyft', 'taxi', 'cab service',
    'sltb', 'railway', 'rail', 'train', 'expressway', 'highway', 'parking',
    'ceypetco', 'lanka ioc', 'ioc', 'fuel', 'petrol', 'petroleum', 'diesel', 'filling station', 'fill', 'fuel station', 'service station', 'shed',
    'sinopec', 'indian oil', 'rm park', 'united petroleum', 'laugfs petroleum', 'motors', 'auto service', 'tyre', 'tire', 'car wash', 'vehicle',
  ] },
  { category: 'Subscriptions', phrases: [
    'netflix', 'spotify', 'youtube', 'youtube premium', 'google one', 'google storage', 'google play', 'icloud', 'apple com bill', 'apple bill',
    'disney', 'prime video', 'amazon prime', 'hbo', 'chatgpt', 'openai', 'anthropic', 'claude ai', 'microsoft', 'office 365', 'adobe',
    'canva', 'github', 'notion', 'linkedin', 'zoom', 'dropbox', 'peotv', 'dialog tv', 'iflix', 'deezer',
    'google', 'apple', 'tinder', 'bumble',
  ] },
  { category: 'Groceries', phrases: [
    'keells', 'keell super', 'cargills', 'food city', 'arpico', 'glomark', 'spar', 'laugfs super', 'lanka sathosa', 'sathosa',
    'supermarket', 'super market', 'supermart', 'super mart', 'mini mart', 'minimart', 'nature mart', 'grocery', 'groceries',
    'vegetable', 'fruit', 'fish market', 'meat shop', 'bakery and grocery',
  ] },
  { category: 'Health', phrases: [
    'hospital', 'hospitals', 'clinic', 'pharmacy', 'pharmacie', 'medical', 'medicals', 'medi', 'chemist', 'osu sala', 'osusala',
    'asiri', 'nawaloka', 'durdans', 'hemas', 'lanka hospital', 'healthguard', 'union chemist', 'echannelling', 'echanneling',
    'doc lk', 'doc990', 'odoc', 'drug', 'drugs', 'guardian', 'dental', 'lab', 'laboratory', 'optical', 'vision care', 'gym', 'fitness',
  ] },
  { category: 'Travel', phrases: [
    'marriott', 'hilton', 'shangri la', 'cinnamon', 'jetwing', 'amari', 'hyatt', 'taj', 'resort', 'resorts', 'villa', 'paradise',
    'airline', 'airlines', 'airway', 'airways', 'srilankan', 'emirates', 'qatar airways', 'airasia', 'indigo', 'flydubai',
    'booking com', 'agoda', 'airbnb', 'expedia', 'travel', 'travels', 'tours', 'safari',
  ] },
  { category: 'Utilities', phrases: [
    'dialog', 'dialog axiata', 'dialog axi', 'mobitel', 'slt', 'slt mobitel', 'hutch', 'airtel', 'lanka bell', 'lankabell',
    'ceb', 'ceylon electricity', 'leco', 'water board', 'nwsdb', 'litro', 'litro gas', 'laugfs gas', 'electricity',
    'broadband', 'internet', 'postpaid', 'reload', 'top up', 'topup', 'bill payment',
  ] },
  { category: 'Entertainment', phrases: [
    'bookmyshow', 'scope cinema', 'cinema', 'cineplex', 'pvr', 'liberty', 'majestic', 'savoy', 'mytickets', 'ticket', 'tickets',
    'steam', 'playstation', 'xbox', 'nintendo', 'game', 'games', 'event', 'concert', 'club',
  ] },
  { category: 'Education', phrases: [
    'school', 'university', 'college', 'institute', 'academy', 'tuition', 'udemy', 'coursera', 'edx', 'sarasavi',
    'vijitha yapa', 'bookshop', 'book shop', 'exam', 'library', 'campus',
  ] },
  { category: 'Food & Drinks', phrases: [
    'restaurant', 'hotel', 'cafe', 'caffe', 'coffee', 'tea', 'bakery', 'bakers', 'bake house', 'pastry', 'kfc', 'mcdonald',
    'pizza', 'pizza hut', 'domino', 'burger', 'burger king', 'subway', 'starbucks', 'barista', 'java lounge', 'perera and son',
    'eat', 'eat house', 'eatery', 'food', 'foods', 'dining', 'kitchen', 'grill', 'bistro', 'biryani', 'thalappakatti', 'kottu',
    'juice', 'dessert', 'ice cream', 'bar', 'pub', 'tavern', 'canteen', 'bing chun', 'chinese', 'curry', 'rice and curry',
    'res', 'restaurent', 'korean', 'indian', 'thai', 'cuisine', 'diner', 'buffet', 'street food',
  ] },
  { category: 'Shopping', phrases: [
    'daraz', 'kapruka', 'amazon', 'aliexpress', 'temu', 'shein', 'ebay', 'odel', 'nolimit', 'no limit', 'fashion bug',
    'cool planet', 'house of fashion', 'softlogic', 'singer', 'abans', 'damro', 'ikea', 'mall', 'fashion', 'textile', 'textiles',
    'clothing', 'boutique', 'shoe', 'footwear', 'jewel', 'jewellery', 'electronics', 'computer', 'computers', 'mobile shop',
    'havelock city', 'one galle face', 'colombo city centre', 'kcc', 'marino mall', 'e commerce', 'ecommerce', 'store',
  ] },
  { category: 'Rent', phrases: ['rent', 'rental', 'landlord', 'house rent', 'boarding', 'apartment'] },
  { category: 'Investment', phrases: ['cse', 'stock', 'brokers', 'securities', 'unit trust', 'mutual fund', 'binance', 'treasury', 'fixed deposit'] },
  { category: 'Loan & EMI', phrases: ['koko', 'mintpay', 'payzy', 'loan', 'leasing', 'lease', 'emi', 'installment', 'instalment', 'mortgage'] },
  { category: 'Income', phrases: ['salary', 'payroll', 'wages', 'bonus', 'dividend', 'commission'] },
];

const COMPILED = RULES.map(r => ({
  category: r.category,
  phrases: r.phrases.map(p => tokens(p)),
}));

function containsPhrase(hay: string[], phrase: string[]): boolean {
  if (phrase.length === 0) return false;
  outer: for (let i = 0; i + phrase.length <= hay.length; i++) {
    for (let j = 0; j < phrase.length; j++) if (hay[i + j] !== phrase[j]) continue outer;
    return true;
  }
  // "supermart" vs "super mart", "bookmyshow" vs "book my show": compare with spaces removed
  if (phrase.length > 1) {
    const joined = phrase.join('');
    if (hay.includes(joined)) return true;
  } else {
    for (let i = 0; i < hay.length; i++) {
      let acc = hay[i];
      for (let j = i + 1; j < Math.min(hay.length, i + 4); j++) {
        acc += hay[j];
        if (acc === phrase[0]) return true;
        if (!phrase[0].startsWith(acc)) break;
      }
    }
  }
  return false;
}

export function matchRule(text: string | undefined): string | null {
  if (!text) return null;
  const hay = tokens(text);
  if (hay.length === 0) return null;
  for (const r of COMPILED) {
    if (r.phrases.some(p => containsPhrase(hay, p))) return r.category;
  }
  return null;
}

// ─── Categorise ───────────────────────────────────────────────────────────────

const KIND_DEFAULT: Record<TxnKind, string | null> = {
  card_purchase: null,
  online_payment: null,
  atm_withdrawal: 'Cash Withdrawal',
  cash_deposit: 'Transfer',
  transfer_out: 'Payments',
  transfer_in: 'Income',
  interest: 'Income',
  refund: 'Refund',
  fee: 'Bank Charges',
  tax: 'Bank Charges',
  loan_repayment: 'Loan & EMI',
  unknown: null,
};

/** Kinds whose category is fixed by the kind itself (merchant text doesn't change it). */
const KIND_FIXED = new Set<TxnKind>(['atm_withdrawal', 'cash_deposit', 'interest', 'refund', 'fee', 'tax', 'loan_repayment']);

export interface CategorizeInput {
  kind: TxnKind;
  type: TxnType;
  merchant?: string;
  description: string;
}

export interface CategorizeResult {
  category: string;
  /** 0..1 — 1 = learned from the user, ~0.9 = brand rule, lower = fallback. */
  confidence: number;
  source: 'learned' | 'rule' | 'kind' | 'fallback';
}

/** Key under which a user's manual re-categorisation is remembered. */
export function learnKey(input: { merchant?: string; description: string }): string {
  return merchantKey(input.merchant || input.description);
}

export function categorize(input: CategorizeInput, learned?: Record<string, string>): CategorizeResult {
  if (learned) {
    const key = learnKey(input);
    const hit = (key && learned[key]) || learned[input.description.toUpperCase().trim()]; // legacy keys
    if (hit) return { category: hit, confidence: 1, source: 'learned' };
  }

  if (KIND_FIXED.has(input.kind)) {
    return { category: KIND_DEFAULT[input.kind] as string, confidence: 0.9, source: 'kind' };
  }

  const text = input.merchant || input.description;
  const rule = matchRule(text);

  if (input.type === 'credit') {
    // Incoming money: only an explicit income signal or a transfer default — never a merchant category.
    if (rule === 'Income') return { category: 'Income', confidence: 0.9, source: 'rule' };
    return { category: KIND_DEFAULT[input.kind] ?? 'Income', confidence: 0.7, source: 'kind' };
  }

  if (rule && rule !== 'Income') return { category: rule, confidence: 0.85, source: 'rule' };

  const byKind = KIND_DEFAULT[input.kind];
  if (byKind) return { category: byKind, confidence: 0.7, source: 'kind' };
  return { category: 'Others', confidence: 0.4, source: 'fallback' };
}
