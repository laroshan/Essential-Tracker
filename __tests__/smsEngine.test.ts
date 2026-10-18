/**
 * SMS engine regression suite.
 * BOC / People's / Sampath fixtures are real alert formats (masked account numbers as sent by the banks).
 * Other-bank fixtures are representative formats for the generic fallback.
 */
import {
  analyzeSms, detectRecurring, ingestSms, learnKey, reanalyzeTransactions, reconcileTransactions,
} from '../src/utils/sms';
import { totals } from '../src/utils/finance';
import type { Transaction } from '../src/types';

const at = (y: number, mo: number, d: number, h = 0, mi = 0, s = 0) => new Date(y, mo - 1, d, h, mi, s).getTime();

function txnOf(body: string, sender: string, smsDate: number) {
  const r = analyzeSms(body, sender, { smsDate });
  expect(r.cls).toBe('transaction');
  return r.txn!;
}

describe("People's Bank", () => {
  const sms = at(2026, 8, 13, 8, 55, 43);

  it('parses POS purchase with merchant, time, balance', () => {
    const t = txnOf("Dear Sir/Madam, Your A/C 186-2002****51 has been debited by Rs. 910.00 (POS @08:55 13/08/2026 at NATURE MARTS PVT).[Av_Bal: Rs. 79117.76 as of SMS]", 'PeoplesBank', sms);
    expect(t).toMatchObject({ amount: 910, type: 'debit', kind: 'card_purchase', merchant: 'Nature Marts', category: 'Groceries', paymentMethod: 'Debit Card', balance: 79117.76, account: '186-2002*51' });
    expect(t.transactionDate).toBe(at(2026, 8, 13, 8, 55));
  });

  it('treats a credited reversal as a refund, not a debit', () => {
    const t = txnOf("Dear Sir/Madam, Your A/C 186-2002****51 has been Credited (Reversal) by Rs. 2298.31 (POS @19:09 26/06/2026 at UBER EATS).[Av_Bal: Rs. 32381.07 as of SMS]", 'PeoplesBank', at(2026, 6, 26, 19, 10));
    expect(t).toMatchObject({ type: 'credit', kind: 'refund', category: 'Refund', merchant: 'Uber Eats' });
  });

  it('parses ATM withdrawal', () => {
    const t = txnOf("Dear Sir/Madam, Your A/C 186-2002****51 has been debited by Rs. 4530.00 (ATM @20:08 05/08/2026 at WELLAWATTE).[Av_Bal: Rs. 22086.05 as of SMS]", 'PeoplesBank', at(2026, 8, 5, 20, 8, 29));
    expect(t).toMatchObject({ kind: 'atm_withdrawal', category: 'Cash Withdrawal', description: 'ATM Withdrawal · Wellawatte' });
  });

  it('parses SLIPS credit, loan repayment, interest and withholding tax', () => {
    expect(txnOf("Dear Sir/Madam, Your A/C (186-2002******51) has been Credited by Rs. 140320.00 (SLIPS Credit Txn at 11:19 07/08/2026). Thank You-Peoples Bank", 'PeoplesBank', at(2026, 8, 7, 11, 34)))
      .toMatchObject({ type: 'credit', kind: 'transfer_in', category: 'Income', amount: 140320 });
    expect(txnOf("Dear Sir/Madam, Your A/C 186-2002****51 has been debited by Rs. 82440.01(Loan Rec.1868101**294 @00:00 20/07/2026).[Av_Bal: Rs. 54446.99 at SMS generated]", 'PeoplesBank', at(2026, 7, 20, 5, 42)))
      .toMatchObject({ kind: 'loan_repayment', category: 'Loan & EMI', description: 'Loan Repayment', balance: 54446.99 });
    expect(txnOf("Dear Sir/Madam, Your A/C (186-2002******51) has been Credited by Rs. 781.48 (Credit Interest at 23:59 31/05/2026). Thank You for being with us-Peoples Bank", 'PeoplesBank', at(2026, 6, 1, 13, 33)))
      .toMatchObject({ kind: 'interest', category: 'Income' });
    expect(txnOf("Dear Sir/Madam, Your A/C (186-2002******51) has been debited by Rs. 78.14 (Witholding Tax at 23:59 01/06/2026). Thank You for being with us-Peoples Bank", 'PeoplesBank', at(2026, 6, 1, 13, 33)))
      .toMatchObject({ kind: 'tax', category: 'Bank Charges', description: 'Withholding Tax' });
  });

  it('parses outgoing LankaPay transfers as debits (previously mis-read as income)', () => {
    const t = txnOf('LANKAPAY - ONLINE Transfer of LKR 100000.00 to your A/C 2**072 on 2026-07-30 14:12 Ref 2607301140142604 is successful. CallCentre 1961', 'PeoplesBank', at(2026, 7, 30, 14, 12, 46));
    expect(t).toMatchObject({ type: 'debit', kind: 'transfer_out', amount: 100000, counterpartyAccount: '2*072', toOwnAccount: true, reference: '2607301140142604', paymentMethod: 'Bank Transfer' });
    expect(t.transactionDate).toBe(at(2026, 7, 30, 14, 12));
  });

  it('ignores unsuccessful transfers', () => {
    expect(analyzeSms('LANKAPAY - ONLINE Transfer of LKR 15000.00 to A/C 0**776 on 2026-06-19 19:39 Ref 2606190701867009 is unsuccessful. CallCentre 1961.', 'PeoplesBank').cls).toBe('failed');
  });
});

describe('BOC', () => {
  const sms = at(2026, 7, 30, 14, 12, 45);
  it('reads direction from From/To and extracts account + balance', () => {
    expect(txnOf('Transfer Credit Rs 100000.00 To A/C No XXXXXXXXXX072. Balance available Rs 109226.05 - Thank you for banking with BOC', 'BOC', sms))
      .toMatchObject({ type: 'credit', kind: 'transfer_in', amount: 100000, account: '*072', balance: 109226.05 });
    expect(txnOf('CEFT Transfer Debit Rs 30025.00 From A/C No XXXXXXXXXX072. Balance available Rs 54727.45 - Thank you for banking with BOC', 'BOC', sms))
      .toMatchObject({ type: 'debit', kind: 'transfer_out', description: 'CEFT Transfer Out', category: 'Payments' });
    expect(txnOf('ATM Withdrawal Rs 135000.00 From A/C No XXXXXXXXXX072. Balance available Rs 68026.68 - Thank you for banking with BOC', 'BOC', sms))
      .toMatchObject({ kind: 'atm_withdrawal', category: 'Cash Withdrawal' });
  });

  it('does not count cash deposits as income', () => {
    expect(txnOf('ATM Cash Deposit Rs 38000.00 To A/C No XXXXXXXXXX072. Balance available Rs 92727.45 - Thank you for banking with BOC', 'BOC', sms))
      .toMatchObject({ type: 'credit', kind: 'cash_deposit', category: 'Transfer' });
  });

  it('classifies POS/ATM as card purchase, not cash withdrawal', () => {
    expect(txnOf('POS/ATM Transaction Rs 666.00 From A/C No XXXXXXXXXX072. Balance available Rs 19101.05 - Thank you for banking with BOC', 'BOC', sms))
      .toMatchObject({ kind: 'card_purchase', category: 'Others' });
  });

  it('treats BOC OTPs as OTPs and extracts the merchant', () => {
    const r = analyzeSms('135295 is the one-time password (OTP) to your online payment LKR 7546.20 from BOC Card 9405 at Dialog Axi. Thank you. Bank of Ceylon', 'BOC');
    expect(r.cls).toBe('otp');
    expect(r.otp).toMatchObject({ amount: 7546.2, merchant: 'Dialog Axi', card: '9405' });
  });

  it('ignores promotions and security notices', () => {
    expect(analyzeSms('Dear Valued Customer,\n\nExperience digital banking with BOC Flex.\n\nMake fast, secure QR payments anytime, anywhere.\n\nActivate BOC Flex today!\n\n#PayDigital', 'BOC').cls).toBe('promo');
    expect(analyzeSms('BOC will NEVER ask for debit card details, OTPs, passwords or PINs via voice calls related to banking app installations.\nStay Alert - Stay Protected!', 'BOC').cls).not.toBe('transaction');
  });
});

describe('Sampath', () => {
  it('parses e-commerce debit despite the "Do not Share OTP" footer', () => {
    const t = txnOf('LKR 6,425.00 debited from AC **3634 for eCom Google One Mo MASTTERM\n07/08/2026 16:40:52\nTo Inq Call 0112303050\nGet protected -Do not Share OTP', 'SAMPATHTXN', at(2026, 8, 7, 16, 40, 55));
    expect(t).toMatchObject({ amount: 6425, type: 'debit', merchant: 'Google One', category: 'Subscriptions', account: '*3634' });
    expect(t.transactionDate).toBe(at(2026, 8, 7, 16, 40, 52));
  });

  it('uses the transaction timestamp, not the interest period dates', () => {
    const t = txnOf('LKR 14.27 credited to AC **3634 for Interest: 1xxx3634:Int.Pd:20-06-2026 to 19-07-2026\n20/07/2026 03:44:56\nTo Inq Call 0112303050', 'SAMPATHTXN', at(2026, 7, 20, 5, 31));
    expect(t).toMatchObject({ kind: 'interest', category: 'Income' });
    expect(t.transactionDate).toBe(at(2026, 7, 20, 3, 44, 56));
  });
});

describe('People\'s OTPs', () => {
  it('are not transactions', () => {
    const r = analyzeSms("Please don't share this with anyone. use 026582 as OTP. [Amount of 2970.00 LKR for https://www.bookmyshow.com using Peoples Card **4295 ] Didn’t request? Call 1961.", 'PeoplesBank');
    expect(r.cls).toBe('otp');
    expect(r.otp).toMatchObject({ amount: 2970, merchant: 'bookmyshow.com', card: '4295' });
  });
});

describe('generic fallback (other banks)', () => {
  const sms = at(2026, 7, 15, 10, 30);
  it('card purchase with "at MERCHANT for LKR"', () => {
    expect(txnOf('Purchase at KEELLS SUPER - COLOMBO 03 for LKR 2,450.00 on 15/07/26 10:23 AM from Card ending #1234.', 'COMBANK', sms))
      .toMatchObject({ amount: 2450, type: 'debit', category: 'Groceries', transactionDate: at(2026, 7, 15, 10, 23) });
  });
  it('picks the transaction amount, not the balance', () => {
    expect(txnOf('HNB SMS ALERT:Debit, Account:0270***0123, Location:CARGILLS FOOD CITY, Amount(Approx.):1500.00 LKR, Av.Bal:45,000.00 LKR, Date:15.07.26, Time:10:23', 'HNB', sms))
      .toMatchObject({ amount: 1500, balance: 45000, category: 'Groceries' });
    expect(txnOf('Avl Bal LKR 50,000.00. LKR 1,000.00 debited from A/C xxxx5678 on 15-07-2026 for SLT BILL PAYMENT.', 'SEYLAN', sms))
      .toMatchObject({ amount: 1000, category: 'Utilities' });
  });
  it('"credit card" is a product, not a credit', () => {
    expect(txnOf('Your Credit Card ending 4321 was used for LKR 3,200.00 at PIZZA HUT on 15/07/2026 10:20. Available limit LKR 150,000.00', 'NTB', sms))
      .toMatchObject({ type: 'debit', amount: 3200, paymentMethod: 'Credit Card', category: 'Food & Drinks' });
  });
  it('recognises salary credits', () => {
    expect(txnOf('Dear Customer, LKR 85,000.00 has been credited to your A/C ****9012 being SALARY JUL 2026 on 15/07/2026.', 'NDB', sms))
      .toMatchObject({ type: 'credit', description: 'Salary', category: 'Income' });
  });
  it('keeps foreign currency and lowers confidence', () => {
    const t = txnOf('Your transaction of USD 12.99 at SPOTIFY P1234 on 15-Jul-2026 using DFCC card ending 7788 is successful.', 'DFCC', sms);
    expect(t).toMatchObject({ currency: 'USD', amount: 12.99, category: 'Subscriptions' });
    expect(t.confidence).toBeLessThanOrEqual(0.5);
  });
  it('ignores declined transactions', () => {
    expect(analyzeSms('Your card ending 5566 transaction of LKR 4,000.00 at ABANS PLC has been declined due to insufficient funds.', 'HNB').cls).toBe('failed');
  });
});

describe('categorizer', () => {
  it('learned overrides win, keyed by normalised merchant', () => {
    const key = learnKey({ merchant: "Attha's", description: "Attha's" });
    const t = analyzeSms("Dear Sir/Madam, Your A/C 186-2002****51 has been debited by Rs. 700.00 (POS @21:26 10/08/2026 at ATTHA'S).", 'PeoplesBank',
      { smsDate: at(2026, 8, 10, 21, 28), learned: { [key]: 'Food & Drinks' } }).txn!;
    expect(t.category).toBe('Food & Drinks');
    expect(t.confidence).toBeGreaterThan(0.9);
  });
});

// ─── Cross-message ───────────────────────────────────────────────────────────

const batch = [
  { address: 'PeoplesBank', date: at(2026, 7, 30, 14, 12, 45), body: 'LANKAPAY - ONLINE Transfer of LKR 100000.00 to your A/C 2**072 on 2026-07-30 14:12 Ref 2607301140142604 is successful. CallCentre 1961' },
  { address: 'PeoplesBank', date: at(2026, 7, 30, 14, 12, 46), body: 'LANKAPAY - ONLINE Transfer of LKR 100000.00 to A/C 2**072 on 2026-07-30 14:12 Ref 2607301140142604 is successful. CallCentre 1961' },
  { address: 'BOC', date: at(2026, 7, 30, 14, 12, 45), body: 'Transfer Credit Rs 100000.00 To A/C No XXXXXXXXXX072. Balance available Rs 109226.05 - Thank you for banking with BOC' },
  { address: 'BOC', date: at(2026, 7, 6, 18, 43, 50), body: '135295 is the one-time password (OTP) to your online payment LKR 7546.20 from BOC Card 9405 at Dialog Axi. Thank you. Bank of Ceylon' },
  { address: 'BOC', date: at(2026, 7, 6, 18, 44, 30), body: 'POS/ATM Transaction Rs 7546.20 From A/C No XXXXXXXXXX072. Balance available Rs 57875.05 - Thank you for banking with BOC' },
  { address: 'PeoplesBank', date: at(2026, 8, 7, 16, 40, 32), body: 'LANKAPAY - ONLINE Transfer of LKR 30000.00 to A/C 1**634 on 2026-08-07 16:40 Ref 2608071225498507 is successful. CallCentre 1961' },
  { address: 'SAMPATHTXN', date: at(2026, 8, 7, 16, 40, 28), body: 'LKR 30,000.00 credited to AC **3634 for google\n07/08/2026 16:40:24\nTo Inq Call 0112303050\nGet protected -Do not Share OTP' },
  { address: 'PeoplesBank', date: at(2026, 8, 7, 11, 34), body: "Dear Sir/Madam, Your A/C (186-2002******51) has been Credited by Rs. 140320.00 (SLIPS Credit Txn at 11:19 07/08/2026). Thank You-Peoples Bank" },
];

describe('ingestSms', () => {
  const r = ingestSms(batch);
  const txns = r.candidates.map(c => c.txn);

  it('drops the duplicate LankaPay confirmation (same Ref)', () => {
    expect(txns.filter(t => t.reference === '2607301140142604')).toHaveLength(1);
    expect(r.stats.otp).toBe(1);
  });

  it('pairs self-transfers across banks and excludes them from income/expense', () => {
    const transfers = txns.filter(t => t.category === 'Transfer');
    expect(transfers.map(t => `${t.type}:${t.amount}`).sort()).toEqual(['credit:100000', 'credit:30000', 'debit:100000', 'debit:30000']);
    const all = txns.map((t, i) => ({ ...t, id: String(i) })) as Transaction[];
    const sum = totals(all);
    expect(sum.income).toBe(140320); // only the real SLIPS credit
    expect(sum.expenses).toBeCloseTo(7546.2);
  });

  it("gives BOC's merchant-less card debit the merchant from its OTP", () => {
    const boc = txns.find(t => t.amount === 7546.2)!;
    expect(boc).toMatchObject({ merchant: 'Dialog Axi', category: 'Utilities' });
  });
});

describe('reanalyzeTransactions', () => {
  it('fixes legacy records, drops OTPs, keeps manual categories', () => {
    const legacy: Transaction[] = [
      { id: 'a', amount: 100000, type: 'credit', description: 'Txn — PeoplesBank', category: 'Income', paymentMethod: 'Debit Card', date: batch[0].date, smsSender: batch[0].address, smsBody: batch[0].body, smsDate: batch[0].date },
      { id: 'b', amount: 100000, type: 'credit', description: 'Banking With BOC', category: 'Income', paymentMethod: 'Debit Card', date: batch[2].date, smsSender: batch[2].address, smsBody: batch[2].body, smsDate: batch[2].date },
      { id: 'c', amount: 7546.2, type: 'debit', description: 'Dialog Axi', category: 'Utilities', paymentMethod: 'Debit Card', date: batch[3].date, smsSender: batch[3].address, smsBody: batch[3].body, smsDate: batch[3].date },
      { id: 'd', amount: 140320, type: 'credit', description: 'Bank Transfer Credit', category: 'Savings', userCategorized: true, paymentMethod: 'Debit Card', date: batch[7].date, smsSender: batch[7].address, smsBody: batch[7].body, smsDate: batch[7].date },
      { id: 'm', amount: 500, type: 'debit', description: 'Lunch', category: 'Food & Drinks', paymentMethod: 'Cash', date: batch[7].date },
    ];
    const r = reanalyzeTransactions(legacy);
    expect(r.removed.map(t => t.id)).toEqual(['c']); // the OTP
    const byId = Object.fromEntries(r.transactions.map(t => [t.id, t]));
    expect(byId.a).toMatchObject({ type: 'debit', category: 'Transfer' });
    expect(byId.b).toMatchObject({ type: 'credit', category: 'Transfer' });
    expect(byId.d.category).toBe('Savings');
    expect(byId.m).toEqual(legacy[4]);
  });
});

describe('reconcileTransactions', () => {
  it('pairs same-bank standing orders between own accounts', () => {
    const base = { paymentMethod: 'Bank Transfer' as const, description: 'Standing Order', date: at(2026, 7, 20, 23, 59) };
    const { txns } = reconcileTransactions<Transaction>([
      { ...base, id: '1', amount: 3000, type: 'debit', category: 'Payments', kind: 'transfer_out', account: '186-2002*51' },
      { ...base, id: '2', amount: 3000, type: 'credit', category: 'Income', kind: 'transfer_in', account: '186-2003*51' },
    ]);
    expect(txns.every(t => t.category === 'Transfer' && t.transferGroupId === 'tg-1')).toBe(true);
  });

  it('does not pair a transfer whose destination account is known to differ', () => {
    const { txns } = reconcileTransactions<Transaction>([
      { id: '1', amount: 5000, type: 'debit', category: 'Payments', kind: 'transfer_out', counterpartyAccount: '0*776', paymentMethod: 'Bank Transfer', description: 'x', date: at(2026, 7, 1, 10) },
      { id: '2', amount: 5000, type: 'credit', category: 'Income', kind: 'transfer_in', account: '*072', paymentMethod: 'Bank Transfer', description: 'y', date: at(2026, 7, 1, 10, 5) },
    ]);
    expect(txns.map(t => t.category)).toEqual(['Payments', 'Income']);
  });
});

describe('detectRecurring', () => {
  it('finds monthly subscriptions', () => {
    const mk = (id: string, m: number, amount: number): Transaction => ({
      id, amount, type: 'debit', merchant: 'Netflix.com', description: 'Netflix.com', category: 'Subscriptions',
      kind: 'card_purchase', paymentMethod: 'Debit Card', date: at(2026, m, 22),
    });
    const r = detectRecurring([mk('1', 5, 2750), mk('2', 6, 2753.6), mk('3', 7, 2757)]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ cadence: 'monthly', occurrences: 3, category: 'Subscriptions' });
  });
});
