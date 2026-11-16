import React, { useMemo, useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  TextInput, 
  Alert 
} from 'react-native';
import { Debt, Subscription, Transaction, WealthConfig } from '../types';
import { averageMonthlyExpenses, debtPayoffMonths } from '../utils/finance';

interface WealthTabProps {
  config: WealthConfig;
  transactions: Transaction[];
  debts: Debt[];
  subscriptions: Subscription[];
  onUpdateConfig: (newConfig: Partial<WealthConfig>) => void;
  onAddDebt: (debt: Omit<Debt, 'id'>) => void;
  onUpdateDebt: (id: string, updates: Partial<Debt>) => void;
  onDeleteDebt: (id: string) => void;
  onAddSubscription: (sub: Omit<Subscription, 'id'>) => void;
  onDeleteSubscription: (id: string) => void;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Roll a stored renewal date forward by whole cycles until it is today or later. */
function upcomingRenewal(sub: Subscription, now = new Date()): Date {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const [y, m, dd] = sub.nextRenewal.split('-').map(Number);
  const d = new Date(y, (m || 1) - 1, dd || 1);
  if (isNaN(d.getTime())) return today;
  while (d < today) {
    if (sub.cycle === 'yearly') d.setFullYear(d.getFullYear() + 1);
    else d.setMonth(d.getMonth() + 1);
  }
  return d;
}

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatMonths(months: number): string {
  if (!isFinite(months)) return 'never at this payment';
  if (months < 12) return `${months} month${months === 1 ? '' : 's'}`;
  const y = Math.floor(months / 12), m = months % 12;
  return `${y}y${m ? ` ${m}m` : ''}`;
}

export default function WealthTab({
  config,
  transactions,
  debts,
  subscriptions,
  onUpdateConfig,
  onAddDebt,
  onUpdateDebt,
  onDeleteDebt,
  onAddSubscription,
  onDeleteSubscription
}: WealthTabProps) {
  // Navigation inside Wealth Pillars (Emergency Fund, Debt, Compounder, Subs)
  const [activeSection, setActiveSection] = useState<'emergency' | 'debts' | 'compounder' | 'subscriptions'>('emergency');

  // Input states for adding new debts
  const [newDebtName, setNewDebtName] = useState('');
  const [newDebtBalance, setNewDebtBalance] = useState('');
  const [newDebtRate, setNewDebtRate] = useState('');
  const [newDebtMinPay, setNewDebtMinPay] = useState('');

  // Input states for adding new subscriptions
  const [newSubName, setNewSubName] = useState('');
  const [newSubCost, setNewSubCost] = useState('');
  const [newSubCycle, setNewSubCycle] = useState<Subscription['cycle']>('monthly');
  const [savedInput, setSavedInput] = useState('');

  // Compounder state sliders (simulated by simple button changes since React Native sliders require external libs)
  const [compoundMonthly, setCompoundMonthly] = useState(10000); // Rs. 10,000/month
  const [compoundRate, setCompoundRate] = useState(9); // 9% return

  // 1. Emergency Fund Calculations
  // Prefer real spending history; fall back to an estimate of 60% of income
  const actualMonthlyExpense = useMemo(() => averageMonthlyExpenses(transactions), [transactions]);
  const averageMonthlyExpense = actualMonthlyExpense ?? config.monthlyIncome * 0.6;
  const emergencyTarget = averageMonthlyExpense * config.emergencyFundTargetMonths;
  const emergencyPercent = Math.round((config.emergencyFundSaved / (emergencyTarget || 1)) * 100);
  const emergencyRemaining = Math.max(0, emergencyTarget - config.emergencyFundSaved);

  // 2. Debt Calculations
  const totalDebt = debts.reduce((sum, d) => sum + d.balance, 0);
  const totalMinPayment = debts.reduce((sum, d) => sum + d.minPayment, 0);
  // Sort debts for Snowball (smallest balance first)
  const snowballOrder = [...debts].sort((a, b) => a.balance - b.balance);
  // Sort debts for Avalanche (highest interest rate first)
  const avalancheOrder = [...debts].sort((a, b) => b.interestRate - a.interestRate);

  // 3. Subscription Calculations
  const totalSubscriptionMonthly = subscriptions.reduce((sum, s) => {
    return sum + (s.cycle === 'yearly' ? s.cost / 12 : s.cost);
  }, 0);

  // 4. Compound Interest Calculations
  const calculateCompound = (years: number) => {
    const monthlyRate = (compoundRate / 100) / 12;
    const months = years * 12;
    // FV = P * (((1 + r)^n - 1) / r)
    if (monthlyRate === 0) return compoundMonthly * months;
    const fv = compoundMonthly * (((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate));
    return isFinite(fv) ? fv : 0;
  };

  const handleAddDebt = () => {
    const balance = parseFloat(newDebtBalance);
    const rate = parseFloat(newDebtRate);
    const minPay = parseFloat(newDebtMinPay);

    if (!newDebtName.trim() || isNaN(balance) || isNaN(rate) || isNaN(minPay) || balance <= 0 || rate < 0 || minPay < 0) {
      Alert.alert('Invalid Input', 'Please enter valid values for all fields.');
      return;
    }

    onAddDebt({
      name: newDebtName.trim(),
      balance,
      interestRate: rate,
      minPayment: minPay
    });

    setNewDebtName('');
    setNewDebtBalance('');
    setNewDebtRate('');
    setNewDebtMinPay('');
  };

  const handleAddSubscription = () => {
    const cost = parseFloat(newSubCost);
    if (!newSubName.trim() || isNaN(cost) || cost <= 0) {
      Alert.alert('Invalid Input', 'Please enter valid name and cost.');
      return;
    }

    const renewal = new Date();
    if (newSubCycle === 'yearly') renewal.setFullYear(renewal.getFullYear() + 1);
    else renewal.setMonth(renewal.getMonth() + 1);

    onAddSubscription({
      name: newSubName.trim(),
      cost,
      cycle: newSubCycle,
      nextRenewal: toIsoDate(renewal),
    });

    setNewSubName('');
    setNewSubCost('');
  };

  const commitSaved = () => {
    const parsed = parseFloat(savedInput.replace(/,/g, ''));
    if (!isNaN(parsed) && parsed >= 0) onUpdateConfig({ emergencyFundSaved: parsed });
    setSavedInput('');
  };

  const logDebtPayment = (debt: Debt) => {
    const amount = Math.min(debt.minPayment, debt.balance);
    Alert.alert('Log Payment', `Record a payment of Rs. ${amount.toLocaleString()} towards ${debt.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Record', onPress: () => onUpdateDebt(debt.id, { balance: Math.max(0, +(debt.balance - amount).toFixed(2)) }) },
    ]);
  };

  const confirmDelete = (label: string, onConfirm: () => void) => {
    Alert.alert('Remove', `Remove ${label}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: onConfirm },
    ]);
  };

  return (
    <View style={styles.container}>
      {/* Tab Navigation header */}
      <View style={styles.tabNav}>
        <TouchableOpacity 
          style={[styles.tabButton, activeSection === 'emergency' && styles.tabButtonActive]}
          onPress={() => setActiveSection('emergency')}
        >
          <Text style={[styles.tabButtonText, activeSection === 'emergency' && styles.tabButtonTextActive]}>🛡️ Fund</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tabButton, activeSection === 'debts' && styles.tabButtonActive]}
          onPress={() => setActiveSection('debts')}
        >
          <Text style={[styles.tabButtonText, activeSection === 'debts' && styles.tabButtonTextActive]}>🎯 Debts</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tabButton, activeSection === 'compounder' && styles.tabButtonActive]}
          onPress={() => setActiveSection('compounder')}
        >
          <Text style={[styles.tabButtonText, activeSection === 'compounder' && styles.tabButtonTextActive]}>📈 Growth</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tabButton, activeSection === 'subscriptions' && styles.tabButtonActive]}
          onPress={() => setActiveSection('subscriptions')}
        >
          <Text style={[styles.tabButtonText, activeSection === 'subscriptions' && styles.tabButtonTextActive]}>🔌 leaks</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        {/* SECTION 1: EMERGENCY FUND */}
        {activeSection === 'emergency' && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>🛡️ Security & Emergency Fund</Text>
            <Text style={styles.sectionDesc}>
              A rich life starts with security. Having liquid cash for emergencies ensures you never have to take high-interest debt when something goes wrong.
            </Text>

            <View style={styles.statsPanel}>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>SAVED AMOUNT</Text>
                <Text style={[styles.statVal, styles.colorSuccess]}>Rs. {config.emergencyFundSaved.toLocaleString()}</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>TARGET GOAL</Text>
                <Text style={styles.statVal}>Rs. {Math.round(emergencyTarget).toLocaleString()}</Text>
              </View>
            </View>
            <Text style={styles.debtRates}>
              {actualMonthlyExpense !== null
                ? `Based on your average spend of Rs. ${Math.round(actualMonthlyExpense).toLocaleString()}/month over recent months.`
                : `Estimated at 60% of your Rs. ${config.monthlyIncome.toLocaleString()} income — log transactions for a real figure.`}
            </Text>

            {/* Circular/Linear Progress Meter */}
            <View style={styles.progressContainer}>
              <View style={styles.progressBarOuter}>
                <View style={[styles.progressBarInner, { width: `${Math.min(emergencyPercent, 100)}%` }]} />
              </View>
              <Text style={styles.progressText}>{emergencyPercent}% of your goal completed</Text>
            </View>

            <Text style={styles.remainingText}>
              {emergencyRemaining > 0 
                ? `You need Rs. ${Math.round(emergencyRemaining).toLocaleString()} more to secure your target of ${config.emergencyFundTargetMonths} months of expenses.` 
                : '🎉 Congratulations! Your Emergency Fund is fully funded. You have absolute peace of mind!'}
            </Text>

            {/* Controls to adjust fund */}
            <View style={styles.editControls}>
              <Text style={styles.inputTitle}>Adjust Months of Security Target</Text>
              <View style={styles.btnRow}>
                {[3, 6, 9, 12].map(m => (
                  <TouchableOpacity 
                    key={m} 
                    style={[styles.ctrlBtn, config.emergencyFundTargetMonths === m && styles.ctrlBtnActive]}
                    onPress={() => onUpdateConfig({ emergencyFundTargetMonths: m })}
                  >
                    <Text style={[styles.ctrlBtnText, config.emergencyFundTargetMonths === m && styles.ctrlBtnTextActive]}>{m}m</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputTitle}>Update Saved Cash Amount</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.numericInput}
                  keyboardType="numeric"
                  placeholder={`Current saved: Rs. ${config.emergencyFundSaved.toLocaleString()}`}
                  placeholderTextColor="#71717a"
                  value={savedInput}
                  onChangeText={setSavedInput}
                  onSubmitEditing={commitSaved}
                  onEndEditing={commitSaved}
                  returnKeyType="done"
                />
              </View>
            </View>
          </View>
        )}

        {/* SECTION 2: DEBT PAYOFF PLANNER */}
        {activeSection === 'debts' && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>🎯 Debt Payoff Planner</Text>
            <Text style={styles.sectionDesc}>
              High-interest debt is a wealth killer. Track your liabilities and pay them down systematically.
            </Text>

            <View style={styles.statsPanel}>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>TOTAL LIABILITIES</Text>
                <Text style={[styles.statVal, styles.colorDanger]}>Rs. {totalDebt.toLocaleString()}</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>TOTAL MIN MONTHLY</Text>
                <Text style={styles.statVal}>Rs. {totalMinPayment.toLocaleString()}</Text>
              </View>
            </View>

            {/* Debt list */}
            {debts.length > 0 ? (
              <View style={styles.debtList}>
                <Text style={styles.listHeader}>Your Active Debts</Text>
                {debts.map(d => (
                  <View key={d.id} style={styles.debtItem}>
                    <View style={styles.flexShrink}>
                      <Text style={styles.debtName}>{d.name}</Text>
                      <Text style={styles.debtRates}>Interest: {d.interestRate}% | Min Pay: Rs. {d.minPayment.toLocaleString()}</Text>
                      <Text style={styles.debtRates}>
                        {d.balance <= 0 ? '✅ Paid off' : `Paid off in ${formatMonths(debtPayoffMonths(d.balance, d.interestRate, d.minPayment))}`}
                      </Text>
                    </View>
                    <View style={styles.rightDebt}>
                      <Text style={styles.debtBalance}>Rs. {d.balance.toLocaleString()}</Text>
                      {d.balance > 0 && d.minPayment > 0 && (
                        <TouchableOpacity onPress={() => logDebtPayment(d)} style={styles.btnDelDebt}>
                          <Text style={styles.btnPayText}>Pay</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity onPress={() => confirmDelete(d.name, () => onDeleteDebt(d.id))} style={styles.btnDelDebt}>
                        <Text style={styles.btnDelDebtText}>✖</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}

                {/* Recommendations */}
                <View style={styles.recommendationBox}>
                  <Text style={styles.recTitle}>🤖 payoff recommendation</Text>
                  <Text style={styles.recBody}>
                    <Text style={styles.boldText}>Avalanche Strategy (Recommended for math):</Text> Pay off{' '}
                    <Text style={styles.colorAccent}>{avalancheOrder[0]?.name || 'highest'}</Text> first. This saves you maximum interest.
                  </Text>
                  <Text style={styles.recBody}>
                    <Text style={styles.boldText}>Snowball Strategy (Best for behavior):</Text> Pay off{' '}
                    <Text style={styles.colorAccent}>{snowballOrder[0]?.name || 'smallest'}</Text> first to gain quick psychological wins.
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyBoxText}>🎉 Excellent! You have no recorded debts. You are debt-free!</Text>
              </View>
            )}

            {/* Add debt form */}
            <View style={styles.formContainer}>
              <Text style={styles.inputTitle}>Add a Debt Tracker</Text>
              <TextInput
                style={styles.formInput}
                placeholder="Debt Name (e.g. Credit Card A)"
                placeholderTextColor="#71717a"
                value={newDebtName}
                onChangeText={setNewDebtName}
              />
              <View style={styles.formInputRow}>
                <TextInput
                  style={[styles.formInput, { width: '48%' }]}
                  placeholder="Balance (Rs.)"
                  placeholderTextColor="#71717a"
                  keyboardType="numeric"
                  value={newDebtBalance}
                  onChangeText={setNewDebtBalance}
                />
                <TextInput
                  style={[styles.formInput, { width: '48%' }]}
                  placeholder="Interest Rate (%)"
                  placeholderTextColor="#71717a"
                  keyboardType="numeric"
                  value={newDebtRate}
                  onChangeText={setNewDebtRate}
                />
              </View>
              <TextInput
                style={styles.formInput}
                placeholder="Minimum Monthly Payment (Rs.)"
                placeholderTextColor="#71717a"
                keyboardType="numeric"
                value={newDebtMinPay}
                onChangeText={setNewDebtMinPay}
              />
              <TouchableOpacity style={styles.btnSubmit} onPress={handleAddDebt}>
                <Text style={styles.btnSubmitText}>Add Debt</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* SECTION 3: WEALTH COMPOUNDER */}
        {activeSection === 'compounder' && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>📈 Compound Interest Growth</Text>
            <Text style={styles.sectionDesc}>
              Albert Einstein called compound interest the "eighth wonder of the world". Watch how your regular monthly savings grow.
            </Text>

            {/* Interactive controls */}
            <View style={styles.compoundControls}>
              <Text style={styles.inputTitle}>Monthly Contribution: <Text style={styles.colorAccent}>Rs. {compoundMonthly.toLocaleString()}</Text></Text>
              <View style={styles.btnRow}>
                {[1000, 5000, 10000, 25000, 50000].map(amt => (
                  <TouchableOpacity 
                    key={amt} 
                    style={[styles.ctrlBtn, compoundMonthly === amt && styles.ctrlBtnActive]}
                    onPress={() => setCompoundMonthly(amt)}
                  >
                    <Text style={[styles.ctrlBtnText, compoundMonthly === amt && styles.ctrlBtnTextActive]}>Rs. {amt.toLocaleString()}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputTitle}>Expected Annual Return: <Text style={styles.colorAccent}>{compoundRate}%</Text></Text>
              <View style={styles.btnRow}>
                {[6, 8, 10, 12, 14].map(rate => (
                  <TouchableOpacity 
                    key={rate} 
                    style={[styles.ctrlBtn, compoundRate === rate && styles.ctrlBtnActive]}
                    onPress={() => setCompoundRate(rate)}
                  >
                    <Text style={[styles.ctrlBtnText, compoundRate === rate && styles.ctrlBtnTextActive]}>{rate}%</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Results cards */}
            <View style={styles.compoundResults}>
              <View style={styles.compoundCard}>
                <Text style={styles.compoundLabel}>10 YEARS</Text>
                <Text style={styles.compoundValue}>Rs. {Math.round(calculateCompound(10)).toLocaleString()}</Text>
                <Text style={styles.compoundSaved}>Total invested: Rs. {Math.round(compoundMonthly * 12 * 10).toLocaleString()}</Text>
              </View>

              <View style={styles.compoundCard}>
                <Text style={styles.compoundLabel}>20 YEARS</Text>
                <Text style={styles.compoundValue}>Rs. {Math.round(calculateCompound(20)).toLocaleString()}</Text>
                <Text style={styles.compoundSaved}>Total invested: Rs. {Math.round(compoundMonthly * 12 * 20).toLocaleString()}</Text>
              </View>

              <View style={[styles.compoundCard, styles.borderHighlight]}>
                <Text style={styles.compoundLabelHighlight}>✨ 30 YEARS (RETIRING RICH)</Text>
                <Text style={styles.compoundValueHighlight}>Rs. {Math.round(calculateCompound(30)).toLocaleString()}</Text>
                <Text style={styles.compoundSaved}>Total invested: Rs. {Math.round(compoundMonthly * 12 * 30).toLocaleString()}</Text>
              </View>
            </View>

            <Text style={styles.motivationText}>
              💡 Pro Tip: Auto-invest your savings on the 1st of every month before you can spend it. That's the secret of self-made millionaires.
            </Text>
          </View>
        )}

        {/* SECTION 4: SUBSCRIPTION AUDIT */}
        {activeSection === 'subscriptions' && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>🔌 Subscription Audit</Text>
            <Text style={styles.sectionDesc}>
              Small, unnoticed monthly leaks add up. Cancel subscriptions you haven't used in the last 30 days to free up cash.
            </Text>

            <View style={styles.statsPanel}>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>MONTHLY LEAK</Text>
                <Text style={[styles.statVal, styles.colorDanger]}>Rs. {totalSubscriptionMonthly.toFixed(2)}/mo</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>YEARLY LEAK</Text>
                <Text style={styles.statVal}>Rs. {(totalSubscriptionMonthly * 12).toFixed(2)}/yr</Text>
              </View>
            </View>

            {/* List */}
            {subscriptions.length > 0 ? (
              <View style={styles.debtList}>
                {[...subscriptions]
                  .map(s => ({ s, renewal: upcomingRenewal(s) }))
                  .sort((a, b) => a.renewal.getTime() - b.renewal.getTime())
                  .map(({ s, renewal }) => {
                  const daysLeft = Math.round((renewal.getTime() - new Date(new Date().toDateString()).getTime()) / DAY_MS);
                  return (
                  <View key={s.id} style={styles.debtItem}>
                    <View style={styles.flexShrink}>
                      <Text style={styles.debtName}>{s.name}</Text>
                      <Text style={[styles.debtRates, daysLeft <= 3 && styles.colorDanger]}>
                        Renews {daysLeft === 0 ? 'today' : daysLeft === 1 ? 'tomorrow' : `in ${daysLeft} days`} ({renewal.toLocaleDateString()})
                      </Text>
                    </View>
                    <View style={styles.rightDebt}>
                      <Text style={styles.debtBalance}>Rs. {s.cost.toFixed(2)}/{s.cycle === 'yearly' ? 'yr' : 'mo'}</Text>
                      <TouchableOpacity onPress={() => confirmDelete(s.name, () => onDeleteSubscription(s.id))} style={styles.btnDelDebt}>
                        <Text style={styles.btnDelDebtText}>✖</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  );
                })}
              </View>
            ) : (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyBoxText}>No active subscriptions tracked. Add one below.</Text>
              </View>
            )}

            {/* Add subscription */}
            <View style={styles.formContainer}>
              <Text style={styles.inputTitle}>Add Subscription to Auditor</Text>
              <View style={styles.formInputRow}>
                <TextInput
                  style={[styles.formInput, { width: '58%' }]}
                  placeholder="Service Name (e.g. Netflix)"
                  placeholderTextColor="#71717a"
                  value={newSubName}
                  onChangeText={setNewSubName}
                />
                <TextInput
                  style={[styles.formInput, { width: '38%' }]}
                  placeholder={newSubCycle === 'yearly' ? 'Cost (Rs./yr)' : 'Cost (Rs./mo)'}
                  placeholderTextColor="#71717a"
                  keyboardType="numeric"
                  value={newSubCost}
                  onChangeText={setNewSubCost}
                />
              </View>
              <View style={styles.btnRow}>
                {(['monthly', 'yearly'] as const).map(c => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.ctrlBtn, newSubCycle === c && styles.ctrlBtnActive]}
                    onPress={() => setNewSubCycle(c)}
                  >
                    <Text style={[styles.ctrlBtnText, newSubCycle === c && styles.ctrlBtnTextActive]}>
                      {c === 'monthly' ? 'Monthly' : 'Yearly'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity style={styles.btnSubmit} onPress={handleAddSubscription}>
                <Text style={styles.btnSubmitText}>Add Subscription</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flexShrink: { flexShrink: 1, paddingRight: 8 },
  btnPayText: { color: '#10b981', fontSize: 12, fontWeight: '800' },
  container: {
    flex: 1,
    backgroundColor: '#09090b',
  },
  tabNav: {
    flexDirection: 'row',
    backgroundColor: '#16161a',
    borderBottomWidth: 1,
    borderBottomColor: '#27272a',
    padding: 10,
    justifyContent: 'space-between',
  },
  tabButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  tabButtonActive: {
    backgroundColor: '#27272a',
    borderWidth: 1,
    borderColor: '#06b6d4',
  },
  tabButtonText: {
    color: '#71717a',
    fontSize: 12,
    fontWeight: '700',
  },
  tabButtonTextActive: {
    color: '#06b6d4',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  sectionCard: {
    backgroundColor: '#16161a',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  sectionTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
  },
  sectionDesc: {
    color: '#a1a1aa',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 20,
  },
  statsPanel: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#09090b',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#27272a',
    marginBottom: 20,
  },
  statBox: {
    width: '48%',
  },
  statLabel: {
    color: '#71717a',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
  },
  statVal: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800',
    marginTop: 6,
  },
  colorSuccess: {
    color: '#10b981',
  },
  colorDanger: {
    color: '#f43f5e',
  },
  progressContainer: {
    marginBottom: 16,
  },
  progressBarOuter: {
    height: 8,
    backgroundColor: '#27272a',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressBarInner: {
    height: '100%',
    backgroundColor: '#10b981',
    borderRadius: 4,
  },
  progressText: {
    color: '#a1a1aa',
    fontSize: 11,
    fontWeight: '600',
  },
  remainingText: {
    color: '#e4e4e7',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 20,
  },
  editControls: {
    borderTopWidth: 1,
    borderTopColor: '#27272a',
    paddingTop: 16,
  },
  inputTitle: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
  },
  btnRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  ctrlBtn: {
    backgroundColor: '#09090b',
    borderWidth: 1,
    borderColor: '#27272a',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginRight: 8,
  },
  ctrlBtnActive: {
    borderColor: '#06b6d4',
    backgroundColor: '#16161a',
  },
  ctrlBtnText: {
    color: '#71717a',
    fontSize: 11,
    fontWeight: '700',
  },
  ctrlBtnTextActive: {
    color: '#06b6d4',
  },
  inputRow: {
    flexDirection: 'row',
  },
  numericInput: {
    flex: 1,
    backgroundColor: '#09090b',
    borderWidth: 1,
    borderColor: '#27272a',
    borderRadius: 6,
    padding: 8,
    color: '#ffffff',
    fontSize: 12,
  },
  debtList: {
    marginBottom: 20,
  },
  listHeader: {
    color: '#71717a',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  debtItem: {
    backgroundColor: '#09090b',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#27272a',
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  debtName: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  debtRates: {
    color: '#71717a',
    fontSize: 10,
    marginTop: 2,
  },
  rightDebt: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  debtBalance: {
    color: '#f43f5e',
    fontSize: 13,
    fontWeight: '800',
    marginRight: 10,
  },
  btnDelDebt: {
    padding: 4,
  },
  btnDelDebtText: {
    color: '#ef4444',
    fontSize: 12,
  },
  recommendationBox: {
    backgroundColor: '#172554',
    borderWidth: 1,
    borderColor: '#1d4ed8',
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
  },
  recTitle: {
    color: '#93c5fd',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  recBody: {
    color: '#bfdbfe',
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 4,
  },
  boldText: {
    fontWeight: '700',
  },
  colorAccent: {
    color: '#06b6d4',
  },
  emptyBox: {
    backgroundColor: '#064e3b',
    borderWidth: 1,
    borderColor: '#059669',
    borderRadius: 10,
    padding: 12,
    marginBottom: 20,
    alignItems: 'center',
  },
  emptyBoxText: {
    color: '#d1fae5',
    fontSize: 12.5,
    fontWeight: '700',
    textAlign: 'center',
  },
  formContainer: {
    borderTopWidth: 1,
    borderTopColor: '#27272a',
    paddingTop: 16,
  },
  formInput: {
    backgroundColor: '#09090b',
    borderWidth: 1,
    borderColor: '#27272a',
    borderRadius: 6,
    padding: 10,
    color: '#ffffff',
    fontSize: 12,
    marginBottom: 10,
  },
  formInputRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  btnSubmit: {
    backgroundColor: '#06b6d4',
    borderRadius: 6,
    padding: 10,
    alignItems: 'center',
  },
  btnSubmitText: {
    color: '#09090b',
    fontWeight: '700',
    fontSize: 13,
  },
  compoundControls: {
    marginBottom: 20,
  },
  compoundResults: {
    marginTop: 10,
  },
  compoundCard: {
    backgroundColor: '#09090b',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#27272a',
    padding: 12,
    marginBottom: 10,
  },
  borderHighlight: {
    borderColor: '#f59e0b',
    borderWidth: 1.5,
    backgroundColor: '#2d1a00',
  },
  compoundLabel: {
    color: '#71717a',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
  },
  compoundLabelHighlight: {
    color: '#f59e0b',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
  compoundValue: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800',
    marginVertical: 4,
  },
  compoundValueHighlight: {
    color: '#f59e0b',
    fontSize: 24,
    fontWeight: '800',
    marginVertical: 4,
  },
  compoundSaved: {
    color: '#71717a',
    fontSize: 10.5,
  },
  motivationText: {
    color: '#a1a1aa',
    fontSize: 11.5,
    lineHeight: 18,
    marginTop: 16,
    fontStyle: 'italic',
    textAlign: 'center',
  },
});
