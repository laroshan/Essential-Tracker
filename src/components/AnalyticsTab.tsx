import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { Transaction } from '../types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface AnalyticsTabProps {
  transactions: Transaction[];
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const CATEGORY_EMOJI: Record<string, string> = {
  'Food & Drinks': '🍔', 'Shopping': '🛍️', 'Transport': '🚗',
  'Subscriptions': '🎬', 'Utilities': '🔌', 'Health': '🏥',
  'Education': '📚', 'Investment': '📈', 'Savings': '🏦',
  'Rent': '🏠', 'Cash Withdrawal': '💵', 'Income': '💰', 'Others': '📦',
};

function formatAmount(amount: number, decimals = 0): string {
  return amount.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatDateShort(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function AnalyticsTab({ transactions }: AnalyticsTabProps) {
  type RangeType = '1d' | '1w' | '1m' | '3m' | '6m' | '12m' | 'all';
  const [range, setRange] = useState<RangeType>('6m'); // Default to 6 Months
  const now = useMemo(() => new Date(), []);

  // Build months data dynamically based on the selected range
  const months = useMemo(() => {
    let limit = 6;
    if (range === 'all') limit = 36;
    else if (range === '1d' || range === '1w' || range === '1m') limit = 1;
    else if (range === '3m') limit = 3;
    else if (range === '6m') limit = 6;
    else if (range === '12m') limit = 12;

    const list = [];
    for (let i = 0; i < limit; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      list.push({ year: d.getFullYear(), month: d.getMonth() });
    }
    // If range is All Time/All, filter out months that are older than the oldest transaction
    if (range === 'all' && transactions.length > 0) {
      const oldestTxnDate = new Date(Math.min(...transactions.map(t => t.date)));
      const oldestYear = oldestTxnDate.getFullYear();
      const oldestMonth = oldestTxnDate.getMonth();
      return list.filter(m => (m.year > oldestYear) || (m.year === oldestYear && m.month >= oldestMonth));
    }
    return list;
  }, [range, transactions, now]);

  const monthlyData = useMemo(() => {
    return months.map(({ year, month }) => {
      const txns = transactions.filter(t => {
        const d = new Date(t.date);
        return d.getFullYear() === year && d.getMonth() === month;
      });
      const income = txns.filter(t => t.type === 'credit').reduce((s, t) => s + t.amount, 0);
      const expenses = txns.filter(t => t.type === 'debit').reduce((s, t) => s + t.amount, 0);
      return {
        label: `${MONTH_NAMES[month]} ${year}`,
        income,
        expenses,
        net: income - expenses,
        count: txns.length,
      };
    });
  }, [months, transactions]);

  // Filter transactions in the selected period
  const period = useMemo(() => {
    if (range === 'all') return transactions;
    let limitDate = 0;
    if (range === '1d') {
      limitDate = Date.now() - 24 * 60 * 60 * 1000;
    } else if (range === '1w') {
      limitDate = Date.now() - 7 * 24 * 60 * 60 * 1000;
    } else if (range === '1m') {
      limitDate = Date.now() - 30 * 24 * 60 * 60 * 1000;
    } else {
      const numMonths = range === '3m' ? 3 : range === '6m' ? 6 : 12;
      limitDate = new Date(now.getFullYear(), now.getMonth() - (numMonths - 1), 1).getTime();
    }
    return transactions.filter(t => t.date >= limitDate);
  }, [range, transactions, now]);

  const periodExpenses = useMemo(() => period.filter(t => t.type === 'debit'), [period]);
  const periodIncome = useMemo(() => period.filter(t => t.type === 'credit'), [period]);
  const totalSpent = useMemo(() => periodExpenses.reduce((s, t) => s + t.amount, 0), [periodExpenses]);
  const totalIncome = useMemo(() => periodIncome.reduce((s, t) => s + t.amount, 0), [periodIncome]);

  // Category breakdown (expenses only)
  const catList = useMemo(() => {
    const catMap: Record<string, number> = {};
    periodExpenses.forEach(t => {
      catMap[t.category] = (catMap[t.category] ?? 0) + t.amount;
    });
    return Object.entries(catMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  }, [periodExpenses]);

  const maxCat = useMemo(() => catList[0]?.[1] ?? 1, [catList]);

  // Daily average spend (over days that had expenses)
  const dailyAvg = useMemo(() => {
    const daySet = new Set(periodExpenses.map(t => new Date(t.date).toDateString()));
    return daySet.size > 0 ? totalSpent / daySet.size : 0;
  }, [periodExpenses, totalSpent]);

  // Top 5 biggest transactions
  const biggestTxns = useMemo(() => {
    return [...periodExpenses].sort((a, b) => b.amount - a.amount).slice(0, 5);
  }, [periodExpenses]);

  // Savings rate
  const savingsRate = useMemo(() => {
    return totalIncome > 0 ? Math.round(((totalIncome - totalSpent) / totalIncome) * 100) : 0;
  }, [totalIncome, totalSpent]);

  const maxExpense = useMemo(() => {
    return Math.max(...monthlyData.map(m => m.expenses), 1);
  }, [monthlyData]);

  const periodLabel = useMemo(() => {
    if (range === 'all') return 'All Time';
    if (range === '1d') return '1 Day';
    if (range === '1w') return '1 Week';
    if (range === '1m') return '1 Month';
    if (range === '3m') return '3 Months';
    if (range === '6m') return '6 Months';
    return '12 Months';
  }, [range]);

  return (
    <ScrollView style={s.container} contentContainerStyle={s.analyticsContent} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerSubtitle}>WealthAgent</Text>
        <Text style={s.headerTitle}>Financial Analytics</Text>
      </View>

      {/* Range Selector */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.rangeSelectorScroll} contentContainerStyle={s.rangeSelectorContent}>
        <View style={s.rangeSelector}>
          {(['1d', '1w', '1m', '3m', '6m', '12m', 'all'] as const).map(r => (
            <TouchableOpacity
              key={r}
              style={[s.rangeBtn, range === r && s.rangeBtnActive]}
              onPress={() => setRange(r)}
            >
              <Text style={[s.rangeBtnText, range === r && s.rangeBtnTextActive]}>
                {r === 'all' ? 'All Time' : r.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Period summary */}
      <Text style={s.sectionHeading}>{periodLabel} Summary</Text>
      <View style={s.summaryGrid}>
        <View style={s.summaryCard}>
          <Text style={s.summaryLabel}>Total Income</Text>
          <Text style={[s.summaryValue, s.textCredit]}>Rs. {formatAmount(totalIncome)}</Text>
        </View>
        <View style={s.summaryCard}>
          <Text style={s.summaryLabel}>Total Spent</Text>
          <Text style={[s.summaryValue, s.textDebit]}>Rs. {formatAmount(totalSpent)}</Text>
        </View>
        <View style={s.summaryCard}>
          <Text style={s.summaryLabel}>Net</Text>
          <Text style={[s.summaryValue, totalIncome - totalSpent >= 0 ? s.textCredit : s.textDebit]}>
            Rs. {formatAmount(Math.abs(totalIncome - totalSpent))}
          </Text>
        </View>
        <View style={s.summaryCard}>
          <Text style={s.summaryLabel}>Savings Rate</Text>
          <Text style={[s.summaryValue, { color: savingsRate >= 0 ? '#10b981' : '#f43f5e' }]}>
            {savingsRate}%
          </Text>
        </View>
        <View style={s.summaryCard}>
          <Text style={s.summaryLabel}>Daily Avg Spend</Text>
          <Text style={[s.summaryValue, s.textDebit]}>Rs. {formatAmount(dailyAvg)}</Text>
        </View>
        <View style={s.summaryCard}>
          <Text style={s.summaryLabel}>Transactions</Text>
          <Text style={s.summaryValue}>{period.length}</Text>
        </View>
      </View>

      {/* Month-over-month bar chart */}
      <Text style={s.sectionHeading}>Month-over-Month Expenses</Text>
      <View style={s.chartCard}>
        {[...monthlyData].reverse().map((m, i) => {
          const barW = maxExpense > 0 ? (m.expenses / maxExpense) * (SCREEN_WIDTH - 140) : 0;
          return (
            <View key={i} style={s.chartRow}>
              <Text style={s.chartMonthLabel}>{m.label}</Text>
              <View style={s.chartBarBg}>
                <View style={[s.chartBarFill, { width: barW, backgroundColor: '#f43f5e' }]} />
              </View>
              <Text style={[s.chartBarValue, s.textDebit]}>Rs.{formatAmount(m.expenses)}</Text>
            </View>
          );
        })}
      </View>

      {/* Month-over-month table */}
      <Text style={s.sectionHeading}>Monthly Breakdown</Text>
      <View style={s.tableCard}>
        {/* Header */}
        <View style={[s.tableHeaderRow, { paddingHorizontal: 12, paddingVertical: 8 }]}>
          <Text style={[s.tableHeaderCell, { flex: 1.2 }]}>Month</Text>
          <Text style={[s.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Income</Text>
          <Text style={[s.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Spent</Text>
          <Text style={[s.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Net</Text>
        </View>
        {monthlyData.map((m, i) => (
          <View key={i} style={[s.tableDataRow, i < monthlyData.length - 1 && s.tableRowBorder]}>
            <Text style={[s.tableDataCell, { flex: 1.2, fontWeight: '700', color: '#e4e4e7' }]}>{m.label}</Text>
            <Text style={[s.tableDataCell, { flex: 1, textAlign: 'right' }, s.textCredit]}>
              {m.income > 0 ? `+${formatAmount(m.income)}` : '—'}
            </Text>
            <Text style={[s.tableDataCell, { flex: 1, textAlign: 'right' }, s.textDebit]}>
              {m.expenses > 0 ? `−${formatAmount(m.expenses)}` : '—'}
            </Text>
            <Text style={[s.tableDataCell, { flex: 1, textAlign: 'right' }, m.net >= 0 ? s.textCredit : s.textDebit]}>
              {m.net >= 0 ? `+${formatAmount(m.net)}` : `−${formatAmount(Math.abs(m.net))}`}
            </Text>
          </View>
        ))}
      </View>

      {/* Category breakdown bars */}
      <Text style={s.sectionHeading}>Spending by Category</Text>
      {catList.length === 0 ? (
        <View style={s.emptyBlock}>
          <Text style={s.emptyText}>No expense data for this period</Text>
        </View>
      ) : (
        <View style={s.tableCard}>
          {catList.map(([cat, amt], i) => {
            const barW = (amt / maxCat) * (SCREEN_WIDTH - 190);
            const pct = totalSpent > 0 ? Math.round((amt / totalSpent) * 100) : 0;
            return (
              <View key={cat} style={[s.catRow, i < catList.length - 1 && s.tableRowBorder]}>
                <Text style={s.catLabel}>{CATEGORY_EMOJI[cat] ?? '📦'} {cat}</Text>
                <View style={s.catBarBg}>
                  <View style={[s.catBarFill, { width: barW }]} />
                </View>
                <View style={s.catAmtBlock}>
                  <Text style={[s.catAmt, s.textDebit]}>Rs.{formatAmount(amt)}</Text>
                  <Text style={s.catPct}>{pct}%</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Top biggest transactions */}
      {biggestTxns.length > 0 && (
        <>
          <Text style={s.sectionHeading}>Biggest Expenses ({periodLabel})</Text>
          <View style={s.tableCard}>
            <View style={[s.tableHeaderRow, { paddingHorizontal: 12, paddingVertical: 8 }]}>
              <Text style={[s.tableHeaderCell, { flex: 0.5 }]}>#</Text>
              <Text style={[s.tableHeaderCell, { flex: 2 }]}>Description</Text>
              <Text style={[s.tableHeaderCell, { flex: 1 }]}>Date</Text>
              <Text style={[s.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Amount</Text>
            </View>
            {biggestTxns.map((t, i) => (
              <View key={t.id} style={[s.tableDataRow, i < biggestTxns.length - 1 && s.tableRowBorder]}>
                <Text style={[s.tableDataCell, { flex: 0.5, color: '#52525b' }]}>{i + 1}</Text>
                <Text style={[s.tableDataCell, { flex: 2, color: '#e4e4e7', fontWeight: '600' }]} numberOfLines={1}>{t.description}</Text>
                <Text style={[s.tableDataCell, { flex: 1, color: '#71717a' }]}>{formatDateShort(t.date)}</Text>
                <Text style={[s.tableDataCell, { flex: 1, textAlign: 'right' }, s.textDebit]}>Rs.{formatAmount(t.amount)}</Text>
              </View>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#09090b' },
  analyticsContent: { padding: 20, paddingBottom: 40 },
  header: { marginTop: 10, marginBottom: 20 },
  headerSubtitle: { color: '#10b981', fontWeight: '700', fontSize: 12, letterSpacing: 2, textTransform: 'uppercase' },
  headerTitle: { color: '#ffffff', fontSize: 28, fontWeight: '800', marginTop: 4 },
  
  // Range selector styles
  rangeSelectorScroll: {
    marginBottom: 20,
  },
  rangeSelectorContent: {
    flexGrow: 1,
  },
  rangeSelector: {
    flexDirection: 'row',
    backgroundColor: '#16161a',
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  rangeBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    borderRadius: 8,
  },
  rangeBtnActive: {
    backgroundColor: '#10b981',
  },
  rangeBtnText: {
    color: '#71717a',
    fontSize: 12,
    fontWeight: '700',
  },
  rangeBtnTextActive: {
    color: '#ffffff',
  },

  sectionHeading: { color: '#ffffff', fontSize: 16, fontWeight: '700', marginTop: 24, marginBottom: 12, letterSpacing: 0.3 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 },
  summaryCard: { backgroundColor: '#16161a', borderWidth: 1, borderColor: '#27272a', borderRadius: 12, padding: 14, width: '48%' },
  summaryLabel: { color: '#52525b', fontSize: 10, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  summaryValue: { color: '#ffffff', fontSize: 16, fontWeight: '800', marginTop: 4 },
  chartCard: { backgroundColor: '#16161a', borderWidth: 1, borderColor: '#27272a', borderRadius: 12, padding: 16, gap: 12 },
  chartRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chartMonthLabel: { color: '#e4e4e7', fontSize: 11, width: 64, fontWeight: '600' },
  chartBarBg: { flex: 1, height: 10, backgroundColor: '#1e1e24', borderRadius: 5, overflow: 'hidden', marginHorizontal: 8 },
  chartBarFill: { height: '100%', borderRadius: 5 },
  chartBarValue: { fontSize: 11, fontWeight: '700', width: 85, textAlign: 'right' },
  tableCard: { backgroundColor: '#16161a', borderWidth: 1, borderColor: '#27272a', borderRadius: 12, overflow: 'hidden' },
  tableHeaderRow: { flexDirection: 'row', backgroundColor: '#0d0d10', borderBottomWidth: 1, borderBottomColor: '#1f1f23' },
  tableHeaderCell: { color: '#52525b', fontSize: 9, fontWeight: '800', letterSpacing: 0.5, paddingHorizontal: 12, paddingVertical: 8 },
  tableDataRow: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10, alignItems: 'center' },
  tableRowBorder: { borderBottomWidth: 1, borderBottomColor: '#1a1a1f' },
  tableDataCell: { fontSize: 11, color: '#a1a1aa', paddingHorizontal: 0 },
  emptyBlock: { backgroundColor: '#16161a', borderWidth: 1, borderColor: '#27272a', borderRadius: 12, padding: 30, alignItems: 'center', marginVertical: 10 },
  emptyText: { color: '#52525b', fontSize: 13 },
  catRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12 },
  catLabel: { color: '#e4e4e7', fontSize: 11, width: 110, fontWeight: '600' },
  catBarBg: { flex: 1, height: 8, backgroundColor: '#1e1e24', borderRadius: 4, overflow: 'hidden', marginRight: 8 },
  catBarFill: { height: '100%', backgroundColor: '#f43f5e', borderRadius: 4 },
  catAmtBlock: { width: 95, alignItems: 'flex-end' },
  catAmt: { fontSize: 11, fontWeight: '700' },
  catPct: { color: '#52525b', fontSize: 9, marginTop: 1 },
  textCredit: { color: '#10b981' },
  textDebit: { color: '#f43f5e' },
});
