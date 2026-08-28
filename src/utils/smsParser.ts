/**
 * SMS Parser — Robust multi-bank transaction extractor
 * Supported: BOC, Sampath (SAMPATHTXN), People's Bank (PEOPLESBANK / PBCL)
 * Extracts: amount, type, description, paymentMethod, category, transactionDate
 */

// ─── Date extraction from SMS body ───────────────────────────────────────────

function extractDateFromSms(body: string): number | null {
  const datePatterns: { regex: RegExp; parser: (m: RegExpMatchArray) => Date | null }[] = [
    // YYYY-MM-DD HH:MM:SS or YYYY-MM-DD HH:MM (e.g. 2026-07-23 12:33)
    {
      regex: /(\d{4})[-/.](\d{2})[-/.](\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?/,
      parser: m => new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], m[6] ? +m[6] : 0)
    },
    // YYYY-MM-DD
    {
      regex: /(\d{4})[-/.](\d{2})[-/.](\d{2})/,
      parser: m => new Date(+m[1], +m[2] - 1, +m[3])
    },
    // DD/MM/YYYY HH:MM:SS or DD/MM/YYYY HH:MM
    {
      regex: /(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/,
      parser: m => new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], m[6] ? +m[6] : 0)
    },
    // DD-MM-YYYY HH:MM
    {
      regex: /(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})/,
      parser: m => new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5])
    },
    // DD/MM/YYYY
    {
      regex: /(\d{2})\/(\d{2})\/(\d{4})/,
      parser: m => new Date(+m[3], +m[2] - 1, +m[1])
    },
    // DD-MM-YYYY
    {
      regex: /(\d{2})-(\d{2})-(\d{4})/,
      parser: m => new Date(+m[3], +m[2] - 1, +m[1])
    },
    // DD.MM.YYYY
    {
      regex: /(\d{2})\.(\d{2})\.(\d{4})/,
      parser: m => new Date(+m[3], +m[2] - 1, +m[1])
    },
    // DD-MMM-YYYY  e.g. 12-Jul-2026
    {
      regex: /(\d{1,2})[-\s](Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[-\s](\d{4})/i,
      parser: m => {
        const months: Record<string, number> = {
          jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11
        };
        return new Date(+m[3], months[m[2].toLowerCase()], +m[1]);
      }
    },
    // DD/MM/YY
    {
      regex: /(\d{2})\/(\d{2})\/(\d{2})\b/,
      parser: m => new Date(2000 + +m[3], +m[2] - 1, +m[1])
    },
  ];

  for (const { regex, parser } of datePatterns) {
    const match = body.match(regex);
    if (match) {
      const d = parser(match);
      if (d && !isNaN(d.getTime())) {
        const now = Date.now();
        const fiveYearsAgo = now - 5 * 365 * 24 * 60 * 60 * 1000;
        if (d.getTime() > fiveYearsAgo && d.getTime() <= now + 24 * 60 * 60 * 1000) {
          return d.getTime();
        }
      }
    }
  }
  return null;
}

// ─── Amount extraction ────────────────────────────────────────────────────────
// CRITICAL: use [0-9]+ (not [0-9]{1,3}) so "50000.00" is captured fully, not as "500"

function extractAmount(body: string): number | null {
  const amountPatterns: RegExp[] = [
    // Rs.50000.00  or  Rs 50000.00  or  LKR50000  etc.
    /(?:Rs\.?|LKR|INR|USD|EUR|GBP)\s*([0-9]+(?:,[0-9]+)*(?:\.[0-9]{1,2})?)/i,
    // ₹50000  $50000  £50000  €50000
    /[₹$£€₨]\s*([0-9]+(?:,[0-9]+)*(?:\.[0-9]{1,2})?)/,
    // "debited/credited ... Rs. 50000.00" or "amount 50000"
    /(?:debited|credited|charged|paid|spent|amount|amt|value)\s*(?:of\s*|for\s*|by\s*|:\s*)?(?:Rs\.?|LKR|INR)?\s*([0-9]+(?:,[0-9]+)*(?:\.[0-9]{1,2})?)/i,
    // "50000.00 debited" or "50000.00 credited"
    /([0-9]+(?:,[0-9]+)*(?:\.[0-9]{2}))\s*(?:debited|credited|deducted|charged)/i,
    // "amount: 50000" / "Amount = 50000.00"
    /amount\s*[=:]\s*([0-9]+(?:,[0-9]+)*(?:\.[0-9]{1,2})?)/i,
    // "txn amt 50000" or "txn amount 50000"
    /txn\s*(?:amt|amount)\s*[=:.\s]*([0-9]+(?:,[0-9]+)*(?:\.[0-9]{1,2})?)/i,
    // Generic: any number with exactly 2 decimals that's at least 2 digits (e.g. 12.50)
    /\b([0-9]{2,}(?:,[0-9]+)*\.[0-9]{2})\b/,
  ];

  for (const pattern of amountPatterns) {
    const match = body.match(pattern);
    if (match && match[1]) {
      const value = parseFloat(match[1].replace(/,/g, ''));
      if (!isNaN(value) && value > 0 && value < 100_000_000) {
        return value;
      }
    }
  }
  return null;
}

// ─── People's Bank specific parser ───────────────────────────────────────────
// Format: "...has been debited by Rs. 2797.23 (POS @21:23 22/07/2026 at Netflix.com).[Av_Bal:...]"
// Format: "...has been Credited by Rs. 50000.00 (SLIPS Credit Txn at 14:45 22/07/2026)."

function parsePeoplesBankDescription(body: string): string | null {
  // Find ALL parenthesized groups
  const parenMatches = [...body.matchAll(/\(([^)]+)\)/g)];

  for (const pm of parenMatches) {
    const inner = pm[1].trim();

    // Skip account number groups (contain digits and dashes like "186-2002****51")
    if (/^\d{3}-\d{4}/.test(inner) || /\*{2,}/.test(inner.replace(/[A-Za-z ]/g, ''))) {
      continue;
    }

    const innerLower = inner.toLowerCase();

    // POS transaction: "POS @21:23 22/07/2026 at Netflix.com"
    if (innerLower.startsWith('pos')) {
      // Extract merchant after "at " (comes after the timestamp/date)
      // Pattern: "at [MERCHANT]" where MERCHANT is at the end of the string
      const atMatch = inner.match(/\bat\s+([A-Za-z0-9][A-Za-z0-9 .\-&'*,]+?)\s*$/i);
      if (atMatch && atMatch[1]) {
        const merchant = atMatch[1].trim();
        // Make sure it's not a time like "14:45"
        if (!/^\d{1,2}:\d{2}$/.test(merchant) && merchant.length > 1) {
          return merchant.replace(/\b\w/g, c => c.toUpperCase());
        }
      }
      continue;
    }

    // ATM withdrawal: "ATM ... at LOCATION"
    if (innerLower.startsWith('atm')) {
      const atMatch = inner.match(/\bat\s+([A-Za-z0-9][A-Za-z0-9 .\-&'*]+?)\s*$/i);
      if (atMatch && atMatch[1]) {
        const loc = atMatch[1].trim();
        if (!/^\d{1,2}:\d{2}$/.test(loc) && loc.length > 1) {
          return `ATM – ${loc}`;
        }
      }
      return "ATM Cash Withdrawal";
    }

    // SLIPS Credit Txn (bank transfer / salary credit)
    if (innerLower.includes('slips credit')) {
      return "Bank Transfer Credit";
    }

    // Online Transfer / IBFT
    if (innerLower.includes('ibft') || innerLower.includes('online transfer')) {
      return "Online Transfer";
    }

    // RTGS / CEFT credit
    if (innerLower.includes('rtgs') || innerLower.includes('ceft')) {
      return "RTGS/CEFT Transfer";
    }

    // Mobile banking transfer
    if (innerLower.includes('mobile') || innerLower.includes('mbanking')) {
      return "Mobile Banking Transfer";
    }

    // Fee / charge
    if (innerLower.includes('fee') || innerLower.includes('charge')) {
      return "Bank Fee";
    }

    // If none matched but has "at [something]" in middle
    const genericAt = inner.match(/at\s+([A-Za-z][A-Za-z0-9 .\-&'*]{2,40}?)\s*$/i);
    if (genericAt && genericAt[1]) {
      const m = genericAt[1].trim();
      if (!/^\d{1,2}:\d{2}/.test(m)) {
        return m.replace(/\b\w/g, c => c.toUpperCase());
      }
    }

    // Return the inner content if it looks like a description
    if (inner.length > 3 && inner.length < 60 && /[A-Za-z]/.test(inner)) {
      return inner.replace(/\b\w/g, c => c.toUpperCase());
    }
  }

  return null;
}

// ─── Generic description extraction ──────────────────────────────────────────

function extractDescription(body: string, address: string): string {
  // NOTE: [\)\]] added to terminators so "Netflix.com)" stops at the closing paren
  const patterns: RegExp[] = [
    // "at [Merchant]" terminated by space+keyword, closing paren/bracket, comma, or end
    /\bat\s+([A-Za-z0-9][A-Za-z0-9 .\-&'*]{2,40}?)(?:\s+(?:on|using|via|with|ref|avail|bal|card|\d{2}[\/\-])|[\.\,\)\];\[]|$)/i,
    // "paid to [Name]" / "transferred to [Name]" / "sent to [Name]"
    /(?:paid\s+to|pay\s+to|transferred?\s+to|sent\s+to|transfer\s+to)\s+([A-Za-z0-9][A-Za-z0-9 .\-&']{2,40}?)(?:\s+(?:on|using|via|ref|a\/c|ac|\d{2}[\/\-])|[\.\,\)\];\[]|$)/i,
    // "for [reason/merchant]"
    /\bfor\s+([A-Za-z][A-Za-z0-9 .\-&']{2,40}?)(?:\s+(?:on|using|via|ref|a\/c|\d{2}[\/\-])|[Rr]ef|[\.\,\)\];\[]|$)/i,
    // "to [Name] a/c" or "to [Name] account"
    /\bto\s+([A-Za-z][A-Za-z0-9 .\-&']{2,30}?)\s+(?:a\/c|ac\b|account)/i,
    // "re: [reference/reason]" or "ref: [reference]"
    /(?:re:|ref:|reason:)\s*([A-Za-z][A-Za-z0-9 .\-&']{2,40}?)(?:\s|[\,\.\)\];\[]|$)/i,
    // "purchase at [Merchant]" or "charged at [Merchant]"
    /(?:purchase|charged)\s+at\s+([A-Za-z0-9][A-Za-z0-9 .\-&'*]{2,40}?)(?:\s+(?:on|ref)|[\.\,\)\];\[]|$)/i,
    // "from [Name] a/c"
    /\bfrom\s+([A-Za-z][A-Za-z0-9 .\-&']{3,40}?)\s+(?:a\/c|account)/i,
  ];

  const noiseTerms = [
    'your', 'card', 'account', 'credit card', 'debit card', 'a/c', 'ac',
    'transfer', 'online', 'mobile banking', 'purchase', 'payment', 'ref',
    'value date', 'val date', 'date', 'balance', 'bal', 'avail', 'available',
    'linked', 'bank', 'the', 'this', 'sms',
  ];

  for (const pattern of patterns) {
    const match = body.match(pattern);
    if (match && match[1]) {
      let desc = match[1].trim();
      const descLower = desc.toLowerCase();

      if (desc.length < 3) continue;
      if (noiseTerms.some(n => descLower === n)) continue;
      // Skip if it looks like a time (HH:MM)
      if (/^\d{1,2}:\d{2}/.test(desc)) continue;
      // Skip if it's mostly digits
      if (/^\d+$/.test(desc.replace(/[,. ]/g, ''))) continue;

      desc = desc
        .replace(/\b\d{6,}\b/g, '')
        .replace(/\*+\d*/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      if (desc.length >= 3) {
        return desc.replace(/\b\w/g, c => c.toUpperCase());
      }
    }
  }

  // Bank-specific fallbacks
  const addrUpper = address.toUpperCase();
  const textLower = body.toLowerCase();

  if (addrUpper.includes('BOC') || textLower.includes('banking with boc')) {
    if (textLower.includes('online transfer')) return 'BOC Online Transfer';
    if (textLower.includes('transfer credit')) return 'BOC Credit Transfer';
    if (textLower.includes('transfer debit')) return 'BOC Debit Transfer';
    if (textLower.includes('atm') || textLower.includes('pos/atm')) return 'BOC ATM Withdrawal';
    if (textLower.includes('salary')) return 'Salary Credit';
    return 'BOC Transaction';
  }
  if (addrUpper.includes('SAMPATH') || textLower.includes('sampath')) {
    if (textLower.includes('salary')) return 'Salary Credit';
    if (textLower.includes('atm')) return 'Sampath ATM';
    return 'Sampath Bank Transaction';
  }
  if (addrUpper.includes('HNB')) return 'HNB Transaction';
  if (addrUpper.includes('COMBANK') || addrUpper.includes('COMMERCIAL')) return 'Commercial Bank Transaction';
  if (addrUpper.includes('NSB')) return 'NSB Transaction';
  if (addrUpper.includes('DIALOG')) return 'Dialog Finance';

  return address ? `Txn — ${address}` : 'Unknown Transaction';
}

// ─── Transaction type detection ───────────────────────────────────────────────

function detectType(body: string): 'credit' | 'debit' {
  const text = body.toLowerCase();

  const debitSignals = [
    'debited', 'deducted', 'withdrawal', 'withdrawn', 'spent', 'charged',
    'purchase', 'payment made', 'paid from', 'pos txn', 'pos @',
    'from your a/c', 'from your ac', 'from your account',
    'from a/c', 'from ac', 'from account',
    'transferred to', 'transfer to', 'sent to', 'paid to',
  ];
  const creditSignals = [
    'credited', 'received', 'deposited', 'transfer credit', 'added to',
    'refunded', 'cashback', 'dividend', 'inward', 'incoming', 'slips credit',
    'to your a/c', 'to your ac', 'to your account',
    'to a/c', 'to ac', 'to account',
  ];

  let debitScore = 0;
  let creditScore = 0;

  for (const s of debitSignals) if (text.includes(s)) debitScore++;
  for (const s of creditSignals) if (text.includes(s)) creditScore++;

  // "credit card" phrase should NOT count as credit transaction
  if (text.includes('credit card') || text.includes('cc limit')) {
    creditScore = Math.max(0, creditScore - 1);
  }

  return creditScore > debitScore ? 'credit' : 'debit';
}

// ─── Payment method detection ─────────────────────────────────────────────────

function detectPaymentMethod(body: string, address: string): 'Credit Card' | 'Debit Card' | 'Cash' {
  const text = body.toLowerCase();
  const addrUpper = address.toUpperCase();

  if (
    text.includes('credit card') || text.includes('creditcard') ||
    text.includes(' cc ') || text.includes('cc limit') ||
    addrUpper.includes('AMEX') || addrUpper.includes('VISA CC') || addrUpper.includes('MASTERCARD CC')
  ) return 'Credit Card';

  if (
    text.includes('debit card') || text.includes('pos txn') ||
    text.includes('pos/atm') || text.includes('pos @') ||
    text.includes('eftpos')
  ) return 'Debit Card';

  if (text.includes('atm') && text.includes('cash')) return 'Cash';

  return 'Debit Card';
}

// ─── Category assignment ──────────────────────────────────────────────────────

function assignCategory(description: string, type: 'credit' | 'debit', body: string): string {
  const d = description.toLowerCase();
  const b = body.toLowerCase();
  const combined = d + ' ' + b;

  if (type === 'credit') return 'Income';

  if (/atm|cash withdrawal|cash withdraw/i.test(combined)) return 'Cash Withdrawal';
  if (/uber|pickme|ola|grab|taxi|cab|metro|train|rail|bus|ioc|ceypetco|laugfs|fuel|petrol|filling station|tuk|three wheeler/i.test(combined)) return 'Transport';
  if (/starbucks|mcdonald|kfc|pizza|domino|cafe|restaurant|bakery|bakers|bakehouse|food|dining|eats|keells|cargills|spar|arpico|supermarket|groceries|grocery|foodcity|swiggy|zomato|pub|burger|kottu|rice|noodle|chicken|coffee|nature mart|foodcourt/i.test(combined)) return 'Food & Drinks';
  if (/netflix|spotify|youtube premium|google one|icloud|disney|amazon prime|hulu|microsoft|office 365|steam|playstation|xbox|apple\.com|peotv|dialog tv|peo tv/i.test(combined)) return 'Subscriptions';
  if (/daraz|amazon|aliexpress|ebay|clothing|odel|nolimit|fashion|mall|boutique|store|shop|cool planet|fashion bug|retail|walmart|target|costco|glitz|h&m|zara|uniqlo|ikea|computer|electronics|mobile|phone/i.test(combined)) return 'Shopping';
  if (/dialog|mobitel|slt|hutch|lankabell|ceb|leco|water board|electricity|postpaid|broadband|internet|utility|water|gas|telecom|bill|recharge|topup/i.test(combined)) return 'Utilities';
  if (/hospital|clinic|pharmacy|doctor|medical|health|dental|channeling|osu|medicine|nawaloka|lanka hospital|asiri|durdans/i.test(combined)) return 'Health';
  if (/school|university|college|tuition|course|education|exam|library/i.test(combined)) return 'Education';
  if (/rent|landlord|housing|apartment|flat|maintenance|condo/i.test(combined)) return 'Rent';
  if (/invest|mutual fund|crypto|stock|share|broker|cse|nse|binance|savings account|fixed deposit|fd /i.test(combined)) return 'Investment';
  if (/savings|transfer to savings/i.test(combined)) return 'Savings';
  if (/bank fee|fee|service charge|bank charge/i.test(combined)) return 'Bank Charges';

  return 'Others';
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function parseSMS(
  body: string,
  address: string = ''
): {
  amount: number;
  type: 'credit' | 'debit';
  description: string;
  paymentMethod: 'Credit Card' | 'Debit Card' | 'Cash';
  category: string;
  transactionDate: number | null;
} | null {

  const text = body.toLowerCase();

  // ── 1. Quick pre-filter: must look like a financial SMS ──────────────────
  const isFinancial = [
    'debit', 'credit', 'debited', 'credited', 'spent', 'charged', 'paid',
    'txn', 'transaction', 'transfer', 'withdrawal', 'received', 'salary',
    'balance', 'avail bal', 'av_bal', 'rs.', 'rs ', 'lkr', 'amount', 'amt',
    'pos/atm', 'pos @', 'atm', 'inr', 'usd', '₹', '₨', 'slips',
  ].some(keyword => text.includes(keyword));

  if (!isFinancial) return null;

  // ── 2. Extract amount ─────────────────────────────────────────────────────
  const amount = extractAmount(body);
  if (!amount) return null;

  // ── 3. Extract transaction date from SMS body ─────────────────────────────
  const transactionDate = extractDateFromSms(body);

  // ── 4. Determine type ─────────────────────────────────────────────────────
  const type = detectType(body);

  // ── 5. Extract description ────────────────────────────────────────────────
  const addrUpper = address.toUpperCase();
  let description: string;

  // People's Bank has a very specific format — try dedicated parser first
  if (
    addrUpper.includes('PEOPLES') || addrUpper.includes('PEOPLSBANK') ||
    addrUpper.includes('PBCL') || text.includes("people's bank") || text.includes('peoples bank')
  ) {
    const pbDesc = parsePeoplesBankDescription(body) || extractDescription(body, address);
    description = pbDesc ?? (
      text.includes('pos') ? 'POS Purchase' :
      type === 'credit' ? "People's Bank Credit" : "People's Bank Transaction"
    );
  } else {
    description = extractDescription(body, address);
  }

  // ── 6. Payment method ─────────────────────────────────────────────────────
  const paymentMethod = detectPaymentMethod(body, address);

  // ── 7. Category ───────────────────────────────────────────────────────────
  const category = assignCategory(description, type, body);

  return { amount, type, description, paymentMethod, category, transactionDate };
}
