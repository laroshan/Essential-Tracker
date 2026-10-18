import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Transaction, WealthConfig } from '../types';
import { CATEGORY_EMOJI } from '../constants/categories';
import { spendByCategory, totals } from '../utils/finance';

interface DashboardTabProps {
  transactions: Transaction[];
  config: WealthConfig;
  onNavigateToTab: (tab: string) => void;
}

export default function DashboardTab({ transactions, config, onNavigateToTab }: DashboardTabProps) {
  // Calculations
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  // Filter transactions for this month
  const thisMonthTxns = transactions.filter(t => {
    const d = new Date(t.date);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  });

  const { income: totalIncome, expenses: totalExpenses } = totals(thisMonthTxns);

  // Categorize for Rich Life Budget allocation
  // Fixed Costs: Utilities, Rent, Bills, Transport
  // Investments: Investment category
  // Savings: Savings category
  // Guilt-Free: Food & Drinks, Shopping, Entertainment, Others
  const fixedCosts = thisMonthTxns
    .filter(t => t.type === 'debit' && ['Utilities', 'Transport', 'Rent', 'Bills', 'Loan & EMI', 'Groceries', 'Health', 'Bank Charges'].includes(t.category))
    .reduce((sum, t) => sum + t.amount, 0);

  const investments = thisMonthTxns
    .filter(t => t.type === 'debit' && t.category === 'Investment')
    .reduce((sum, t) => sum + t.amount, 0);

  const savings = thisMonthTxns
    .filter(t => t.type === 'debit' && t.category === 'Savings')
    .reduce((sum, t) => sum + t.amount, 0);

  const guiltFree = thisMonthTxns
    .filter(t => t.type === 'debit' && ['Food & Drinks', 'Shopping', 'Entertainment', 'Travel', 'Subscriptions', 'Others'].includes(t.category))
    .reduce((sum, t) => sum + t.amount, 0);

  const monthlyIncome = config.monthlyIncome || totalIncome || 1; // avoid divide by zero

  // Percentages relative to income
  const fixedPercent = Math.round((fixedCosts / monthlyIncome) * 100);
  const investmentPercent = Math.round((investments / monthlyIncome) * 100);
  const savingsPercent = Math.round((savings / monthlyIncome) * 100);
  const guiltFreePercent = Math.round((guiltFree / monthlyIncome) * 100);

  // Net worth calculation
  const totalAssets = totalIncome + config.emergencyFundSaved - totalExpenses;

  // Previous month calculations
  const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
  const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
  const prevMonthTxns = transactions.filter(t => {
    const d = new Date(t.date);
    return d.getMonth() === prevMonth && d.getFullYear() === prevYear;
  });
  const prevMonthExpenses = totals(prevMonthTxns).expenses;

  // Month-over-month expense change
  const momChange = prevMonthExpenses > 0
    ? Math.round(((totalExpenses - prevMonthExpenses) / prevMonthExpenses) * 100)
    : null;
  const momLabel = momChange === null
    ? 'No prior month data'
    : momChange > 0
      ? `+${momChange}% expenses vs last month`
      : momChange < 0
        ? `${momChange}% expenses vs last month`
        : 'Same as last month';
  const momColor = momChange === null ? '#71717a' : momChange <= 0 ? '#10b981' : '#f43f5e';

  // Top spending category this month
  const catMap = spendByCategory(thisMonthTxns);
  const topCategory = Object.entries(catMap).sort((a, b) => b[1] - a[1])[0];

  const categoryEmojis = CATEGORY_EMOJI;

  // Recommendations and warnings
  const alerts: string[] = [];
  if (fixedPercent > config.fixedCostsPercent) {
    alerts.push(`⚠️ Fixed Costs (${fixedPercent}%) exceed target ${config.fixedCostsPercent}%! Look to prune bills.`);
  }
  if (guiltFreePercent > config.guiltFreePercent) {
    alerts.push(`🚨 Guilt-free spending (${guiltFreePercent}%) exceeds target ${config.guiltFreePercent}%! Slow down.`);
  }
  if (investmentPercent < config.investmentsPercent) {
    alerts.push(`💡 Try to increase Investments (${investmentPercent}%) to reach your ${config.investmentsPercent}% target.`);
  }
  if (topCategory) {
    alerts.push(`${categoryEmojis[topCategory[0]] ?? '📦'} Top spend this month: ${topCategory[0]} — Rs. ${topCategory[1].toLocaleString(undefined, { maximumFractionDigits: 0 })}`);
  }
  if (alerts.length === 0) {
    alerts.push('🎉 Perfect! You are keeping all spending allocations within rich life thresholds.');
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Premium Header */}
      <View style={styles.header}>
        <Text style={styles.headerSubtitle}>WealthAgent</Text>
        <Text style={styles.headerTitle}>Financial Overview</Text>
      </View>

      {/* Net Worth Card */}
      <View style={styles.cardNetWorth}>
        <Text style={styles.netWorthLabel}>ESTIMATED NET ASSETS</Text>
        <Text style={styles.netWorthValue}>Rs. {totalAssets.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
        <View style={styles.netWorthFooter}>
          <Text style={[styles.netWorthChange, { color: momColor }]}>{momLabel}</Text>
          <Text style={styles.netWorthLabelMini}>Incl. emergency savings</Text>
        </View>
      </View>

      {/* Cashflow Mini Cards */}
      <View style={styles.cashFlowRow}>
        <View style={styles.cashFlowCard}>
          <Text style={styles.cashFlowLabel}>INCOME</Text>
          <Text style={[styles.cashFlowValue, styles.textCredit]}>+Rs. {totalIncome.toLocaleString()}</Text>
        </View>
        <View style={styles.cashFlowCard}>
          <Text style={styles.cashFlowLabel}>SPENT</Text>
          <Text style={[styles.cashFlowValue, styles.textDebit]}>-Rs. {totalExpenses.toLocaleString()}</Text>
        </View>
      </View>

      {/* Rich Life Budget Meter */}
      <View style={styles.cardSection}>
        <Text style={styles.sectionTitle}>Rich Life Allocation</Text>
        <Text style={styles.sectionSubtitle}>Allocated against monthly income of Rs. {monthlyIncome.toLocaleString()}</Text>

        {/* Meter 1: Fixed Costs */}
        <View style={styles.meterContainer}>
          <View style={styles.meterHeader}>
            <Text style={styles.meterName}>🏠 Fixed Costs (Rent, Utilities)</Text>
            <Text style={styles.meterStats}>Rs. {fixedCosts.toLocaleString()} / {fixedPercent}%</Text>
          </View>
          <View style={styles.meterBarOuter}>
            <View style={[
              styles.meterBarInner, 
              { width: `${Math.min(fixedPercent, 100)}%` },
              fixedPercent > config.fixedCostsPercent ? styles.bgDanger : styles.bgPrimary
            ]} />
          </View>
          <Text style={styles.meterTarget}>Target: {config.fixedCostsPercent}% (Lower is better)</Text>
        </View>

        {/* Meter 2: Investments */}
        <View style={styles.meterContainer}>
          <View style={styles.meterHeader}>
            <Text style={styles.meterName}>📈 Investments (Stocks, Funds)</Text>
            <Text style={styles.meterStats}>Rs. {investments.toLocaleString()} / {investmentPercent}%</Text>
          </View>
          <View style={styles.meterBarOuter}>
            <View style={[
              styles.meterBarInner, 
              { width: `${Math.min(investmentPercent, 100)}%` },
              styles.bgSuccess
            ]} />
          </View>
          <Text style={styles.meterTarget}>Target: {config.investmentsPercent}% (Higher is better)</Text>
        </View>

        {/* Meter 3: Guilt-Free Spending */}
        <View style={styles.meterContainer}>
          <View style={styles.meterHeader}>
            <Text style={styles.meterName}>🍕 Guilt-Free (Dining, Shopping)</Text>
            <Text style={styles.meterStats}>Rs. {guiltFree.toLocaleString()} / {guiltFreePercent}%</Text>
          </View>
          <View style={styles.meterBarOuter}>
            <View style={[
              styles.meterBarInner, 
              { width: `${Math.min(guiltFreePercent, 100)}%` },
              guiltFreePercent > config.guiltFreePercent ? styles.bgDanger : styles.bgWarning
            ]} />
          </View>
          <Text style={styles.meterTarget}>Target: {config.guiltFreePercent}% (Limit)</Text>
        </View>

        {/* Meter 4: Savings */}
        <View style={styles.meterContainer}>
          <View style={styles.meterHeader}>
            <Text style={styles.meterName}>🏦 Savings (Emergency, Goals)</Text>
            <Text style={styles.meterStats}>Rs. {savings.toLocaleString()} / {savingsPercent}%</Text>
          </View>
          <View style={styles.meterBarOuter}>
            <View style={[
              styles.meterBarInner, 
              { width: `${Math.min(savingsPercent, 100)}%` },
              styles.bgInfo
            ]} />
          </View>
          <Text style={styles.meterTarget}>Target: {config.savingsPercent}%</Text>
        </View>
      </View>

      {/* Agent Alerts Board */}
      <View style={styles.cardAlerts}>
        <Text style={styles.alertsTitle}>🤖 Agent Insights</Text>
        {alerts.map((alert, idx) => (
          <View key={idx} style={styles.alertRow}>
            <Text style={styles.alertText}>{alert}</Text>
          </View>
        ))}
        <TouchableOpacity style={styles.btnAlert} onPress={() => onNavigateToTab('chat')}>
          <Text style={styles.btnAlertText}>Talk to Agent</Text>
        </TouchableOpacity>
      </View>

      {/* Wealth Quick Jump */}
      <View style={styles.pillarsGrid}>
        <TouchableOpacity style={styles.pillarCard} onPress={() => onNavigateToTab('wealth')}>
          <Text style={styles.pillarEmoji}>🛡️</Text>
          <Text style={styles.pillarName}>Emergency Fund</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.pillarCard} onPress={() => onNavigateToTab('wealth')}>
          <Text style={styles.pillarEmoji}>🎯</Text>
          <Text style={styles.pillarName}>Debt Snowball</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.pillarCard} onPress={() => onNavigateToTab('wealth')}>
          <Text style={styles.pillarEmoji}>⚙️</Text>
          <Text style={styles.pillarName}>Compounder</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090b',
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    marginTop: 10,
    marginBottom: 20,
  },
  headerSubtitle: {
    color: '#10b981',
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '800',
    marginTop: 4,
  },
  cardNetWorth: {
    backgroundColor: '#16161a',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#27272a',
    marginBottom: 16,
  },
  netWorthLabel: {
    color: '#a1a1aa',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  netWorthValue: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: '800',
    marginTop: 8,
    fontVariant: ['tabular-nums'],
  },
  netWorthFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#27272a',
    paddingTop: 12,
  },
  netWorthChange: {
    color: '#10b981',
    fontWeight: '700',
    fontSize: 12,
  },
  netWorthLabelMini: {
    color: '#71717a',
    fontSize: 11,
  },
  cashFlowRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  cashFlowCard: {
    backgroundColor: '#16161a',
    borderRadius: 12,
    padding: 16,
    width: '48%',
    borderWidth: 1,
    borderColor: '#27272a',
  },
  cashFlowLabel: {
    color: '#71717a',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
  },
  cashFlowValue: {
    fontSize: 18,
    fontWeight: '800',
    marginTop: 6,
  },
  textCredit: {
    color: '#10b981',
  },
  textDebit: {
    color: '#f43f5e',
  },
  cardSection: {
    backgroundColor: '#16161a',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#27272a',
    marginBottom: 20,
  },
  sectionTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  sectionSubtitle: {
    color: '#71717a',
    fontSize: 12,
    marginTop: 4,
    marginBottom: 16,
  },
  meterContainer: {
    marginBottom: 16,
  },
  meterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  meterName: {
    color: '#e4e4e7',
    fontSize: 13,
    fontWeight: '600',
  },
  meterStats: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  meterBarOuter: {
    height: 8,
    backgroundColor: '#27272a',
    borderRadius: 4,
    overflow: 'hidden',
  },
  meterBarInner: {
    height: '100%',
    borderRadius: 4,
  },
  meterTarget: {
    color: '#71717a',
    fontSize: 11,
    marginTop: 4,
    textAlign: 'right',
  },
  bgPrimary: {
    backgroundColor: '#3b82f6',
  },
  bgSuccess: {
    backgroundColor: '#10b981',
  },
  bgWarning: {
    backgroundColor: '#f59e0b',
  },
  bgDanger: {
    backgroundColor: '#f43f5e',
  },
  bgInfo: {
    backgroundColor: '#a855f7',
  },
  cardAlerts: {
    backgroundColor: '#121214',
    borderColor: '#06b6d4',
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#06b6d4',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 4,
  },
  alertsTitle: {
    color: '#06b6d4',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 12,
  },
  alertRow: {
    marginBottom: 8,
  },
  alertText: {
    color: '#e4e4e7',
    fontSize: 12.5,
    lineHeight: 18,
  },
  btnAlert: {
    backgroundColor: '#06b6d4',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
    marginTop: 12,
  },
  btnAlertText: {
    color: '#09090b',
    fontWeight: '700',
    fontSize: 13,
  },
  pillarsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  pillarCard: {
    backgroundColor: '#16161a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#27272a',
    padding: 12,
    alignItems: 'center',
    width: '30%',
  },
  pillarEmoji: {
    fontSize: 22,
    marginBottom: 6,
  },
  pillarName: {
    color: '#a1a1aa',
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
});
