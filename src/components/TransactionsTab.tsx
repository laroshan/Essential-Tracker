import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Modal,
  Alert,
  Dimensions,
} from 'react-native';
import { PaymentMethod, Transaction } from '../types';
import { CATEGORIES as ALL_CATEGORIES, CATEGORY_EMOJI } from '../constants/categories';
import { isExpense, isIncome, isRefund } from '../utils/finance';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface TransactionsTabProps {
  transactions: Transaction[];
  onDeleteTransaction: (id: string) => void;
  onAddTransaction: (txn: Omit<Transaction, 'id'>) => void;
  onEditTransaction?: (id: string, updates: Partial<Transaction>) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES: string[] = ['All', ...ALL_CATEGORIES];
const FORM_CATEGORIES: string[] = [...ALL_CATEGORIES];
const FORM_METHODS: PaymentMethod[] = ['Cash', 'Credit Card', 'Debit Card', 'Bank Transfer'];


const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FULL_MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatAmount(amount: number, decimals = 0): string {
  return amount.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} '${String(d.getFullYear()).slice(2)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatDateShort(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ─── Add Transaction Modal ────────────────────────────────────────────────────

function AddTransactionModal({
  visible,
  onClose,
  onSave,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (txn: Omit<Transaction, 'id'>) => void;
}) {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const defaultDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'debit' | 'credit'>('debit');
  const [desc, setDesc] = useState('');
  const [category, setCategory] = useState('Others');
  const [method, setMethod] = useState<PaymentMethod>('Cash');
  const [dateStr, setDateStr] = useState(defaultDate);

  const reset = () => {
    setAmount(''); setType('debit'); setDesc(''); setCategory('Others');
    setMethod('Cash'); setDateStr(defaultDate);
  };

  const handleSave = () => {
    const amt = parseFloat(amount.replace(/,/g, ''));
    if (isNaN(amt) || amt <= 0) { Alert.alert('Error', 'Enter a valid amount.'); return; }
    if (!desc.trim()) { Alert.alert('Error', 'Enter a description.'); return; }
    let timestamp = Date.now();
    const parsed = Date.parse(dateStr.trim().replace(/-/g, '/'));
    if (!isNaN(parsed)) timestamp = parsed;
    onSave({ amount: amt, type, description: desc.trim(), category, paymentMethod: method, date: timestamp });
    reset();
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.modalOverlay}>
        <View style={s.modalSheet}>
          <View style={s.modalHandle} />
          <Text style={s.modalTitle}>Add Transaction</Text>

          {/* Type */}
          <View style={s.typeRow}>
            <TouchableOpacity
              style={[s.typeBtn, type === 'debit' && s.typeBtnDebit]}
              onPress={() => setType('debit')}
            >
              <Text style={[s.typeBtnText, type === 'debit' && { color: '#fff' }]}>💸 Expense</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.typeBtn, type === 'credit' && s.typeBtnCredit]}
              onPress={() => setType('credit')}
            >
              <Text style={[s.typeBtnText, type === 'credit' && { color: '#fff' }]}>💰 Income</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
            <Text style={s.fieldLabel}>AMOUNT (Rs.)</Text>
            <TextInput style={s.fieldInput} placeholder="0.00" placeholderTextColor="#52525b"
              keyboardType="numeric" value={amount} onChangeText={setAmount} />

            <Text style={s.fieldLabel}>DESCRIPTION / REASON</Text>
            <TextInput style={s.fieldInput} placeholder="e.g. Keells Super, Salary" placeholderTextColor="#52525b"
              value={desc} onChangeText={setDesc} />

            <Text style={s.fieldLabel}>CATEGORY</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled={true}>
              <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 4 }}>
                {FORM_CATEGORIES.map(cat => (
                  <TouchableOpacity key={cat}
                    style={[s.chip, category === cat && s.chipActive]}
                    onPress={() => setCategory(cat)}
                  >
                    <Text style={[s.chipText, category === cat && s.chipTextActive]}>
                      {CATEGORY_EMOJI[cat] ?? '📦'} {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <Text style={s.fieldLabel}>PAYMENT METHOD</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
              {FORM_METHODS.map(m => (
                <TouchableOpacity key={m}
                  style={[s.chip, method === m && s.chipActive]}
                  onPress={() => setMethod(m)}
                >
                  <Text style={[s.chipText, method === m && s.chipTextActive]}>{m}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.fieldLabel}>DATE & TIME (YYYY-MM-DD HH:MM)</Text>
            <TextInput style={s.fieldInput} value={dateStr} onChangeText={setDateStr}
              placeholderTextColor="#52525b" />

            <View style={s.modalActions}>
              <TouchableOpacity style={s.btnCancel} onPress={() => { reset(); onClose(); }}>
                <Text style={s.btnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.btnSave} onPress={handleSave}>
                <Text style={s.btnSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function EditTransactionModal({
  visible,
  onClose,
  onSave,
  transaction,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (updates: Partial<Transaction>) => void;
  transaction: Transaction;
}) {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const formatDateForInput = (ts: number) => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'debit' | 'credit'>('debit');
  const [desc, setDesc] = useState('');
  const [category, setCategory] = useState('Others');
  const [method, setMethod] = useState<PaymentMethod>('Cash');
  const [dateStr, setDateStr] = useState('');

  // Update local states when transaction changes or modal opens
  React.useEffect(() => {
    if (transaction) {
      setAmount(transaction.amount.toString());
      setType(transaction.type);
      setDesc(transaction.description);
      setCategory(transaction.category);
      setMethod(transaction.paymentMethod);
      setDateStr(formatDateForInput(transaction.date));
    }
  }, [transaction, visible]);

  const handleSave = () => {
    const amt = parseFloat(amount.replace(/,/g, ''));
    if (isNaN(amt) || amt <= 0) { Alert.alert('Error', 'Enter a valid amount.'); return; }
    if (!desc.trim()) { Alert.alert('Error', 'Enter a description.'); return; }
    let timestamp = transaction.date;
    const parsed = Date.parse(dateStr.trim().replace(/-/g, '/'));
    if (!isNaN(parsed)) timestamp = parsed;
    
    onSave({
      amount: amt,
      type,
      description: desc.trim(),
      category,
      paymentMethod: method,
      date: timestamp
    });
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.modalOverlay}>
        <View style={s.modalSheet}>
          <View style={s.modalHandle} />
          <Text style={s.modalTitle}>Edit Transaction</Text>

          {/* Type */}
          <View style={s.typeRow}>
            <TouchableOpacity
              style={[s.typeBtn, type === 'debit' && s.typeBtnDebit]}
              onPress={() => setType('debit')}
            >
              <Text style={[s.typeBtnText, type === 'debit' && { color: '#fff' }]}>💸 Expense</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.typeBtn, type === 'credit' && s.typeBtnCredit]}
              onPress={() => setType('credit')}
            >
              <Text style={[s.typeBtnText, type === 'credit' && { color: '#fff' }]}>💰 Income</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
            <Text style={s.fieldLabel}>AMOUNT (Rs.)</Text>
            <TextInput style={s.fieldInput} placeholder="0.00" placeholderTextColor="#52525b"
              keyboardType="numeric" value={amount} onChangeText={setAmount} />

            <Text style={s.fieldLabel}>DESCRIPTION / REASON</Text>
            <TextInput style={s.fieldInput} placeholder="e.g. Keells Super, Salary" placeholderTextColor="#52525b"
              value={desc} onChangeText={setDesc} />

            <Text style={s.fieldLabel}>CATEGORY</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled={true}>
              <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 4 }}>
                {FORM_CATEGORIES.map(cat => (
                  <TouchableOpacity key={cat}
                    style={[s.chip, category === cat && s.chipActive]}
                    onPress={() => setCategory(cat)}
                  >
                    <Text style={[s.chipText, category === cat && s.chipTextActive]}>
                      {CATEGORY_EMOJI[cat] ?? '📦'} {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <Text style={s.fieldLabel}>PAYMENT METHOD</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
              {FORM_METHODS.map(m => (
                <TouchableOpacity key={m}
                  style={[s.chip, method === m && s.chipActive]}
                  onPress={() => setMethod(m)}
                >
                  <Text style={[s.chipText, method === m && s.chipTextActive]}>{m}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.fieldLabel}>DATE & TIME (YYYY-MM-DD HH:MM)</Text>
            <TextInput style={s.fieldInput} value={dateStr} onChangeText={setDateStr}
              placeholderTextColor="#52525b" />

            <View style={s.modalActions}>
              <TouchableOpacity style={s.btnCancel} onPress={onClose}>
                <Text style={s.btnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.btnSave} onPress={handleSave}>
                <Text style={s.btnSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── Ledger Table Row ─────────────────────────────────────────────────────────

function LedgerRow({ item, onDelete, onEdit }: { item: Transaction; onDelete: () => void; onEdit: () => void }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <TouchableOpacity
        style={s.tableRow}
        onPress={() => setExpanded(e => !e)}
        activeOpacity={0.7}
      >
        {/* Date */}
        <View style={s.colDate}>
          <Text style={s.cellDateTop}>{formatDateShort(item.date)}</Text>
          <Text style={s.cellDateBot}>{new Date(item.date).getFullYear()}</Text>
        </View>
        {/* Description + category */}
        <View style={s.colDesc}>
          <Text style={s.cellDesc} numberOfLines={1}>{item.description}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
            <Text style={s.cellCategoryBadge}>
              {CATEGORY_EMOJI[item.category] ?? '📦'} {item.category}
            </Text>
          </View>
        </View>
        {/* Amount */}
        <View style={s.colAmount}>
          <Text style={[s.cellAmount, item.type === 'credit' ? s.textCredit : s.textDebit]}>
            {item.type === 'credit' ? '+' : '−'}Rs.{formatAmount(item.amount, 2)}
          </Text>
          <Text style={s.cellMethod}>{item.paymentMethod}</Text>
        </View>
      </TouchableOpacity>

      {/* Expanded: raw SMS info + edit/delete */}
      {expanded && (
        <View style={s.expandedRow}>
          {item.smsBody ? (
            <Text style={s.smsBodyText} numberOfLines={3}>{item.smsBody}</Text>
          ) : null}
          {item.smsSender && (
            <Text style={s.smsSenderText}>From: {item.smsSender}</Text>
          )}
          <View style={s.expandedActions}>
            <TouchableOpacity style={s.editRowBtn} onPress={onEdit}>
              <Text style={s.editRowBtnText}>✏️ Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.deleteRowBtn} onPress={onDelete}>
              <Text style={s.deleteRowBtnText}>🗑️ Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </>
  );
}



// ─── Monthly View ─────────────────────────────────────────────────────────────

function MonthlyView({ transactions }: { transactions: Transaction[] }) {
  const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>({});

  const monthlyStats = useMemo(() => {
    const map: Record<string, {
      label: string; year: number; monthIndex: number;
      income: number; expenses: number;
      categories: Record<string, number>;
    }> = {};

    transactions.forEach(t => {
      const d = new Date(t.date);
      const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
      if (!map[key]) {
        map[key] = {
          label: `${FULL_MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`,
          year: d.getFullYear(), monthIndex: d.getMonth(),
          income: 0, expenses: 0, categories: {},
        };
      }
      if (isIncome(t)) map[key].income += t.amount;
      else if (isRefund(t)) map[key].expenses -= t.amount;
      else if (isExpense(t)) {
        map[key].expenses += t.amount;
        map[key].categories[t.category] = (map[key].categories[t.category] ?? 0) + t.amount;
      }
    });

    return Object.entries(map)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, val]) => ({ key, ...val }));
  }, [transactions]);

  if (monthlyStats.length === 0) {
    return (
      <View style={s.emptyBlock}>
        <Text style={s.emptyText}>No transactions yet</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 80 }} showsVerticalScrollIndicator={false}>
      {monthlyStats.map(m => {
        const net = m.income - m.expenses;
        const savRate = m.income > 0 ? Math.round((net / m.income) * 100) : null;
        const expanded = !!expandedMonths[m.key];
        const catList = Object.entries(m.categories).sort((a, b) => b[1] - a[1]).slice(0, 5);
        const maxCat = catList[0]?.[1] ?? 1;

        return (
          <View key={m.key} style={s.monthCard}>
            <TouchableOpacity onPress={() => setExpandedMonths(prev => ({ ...prev, [m.key]: !prev[m.key] }))} style={s.monthCardHeader}>
              <View>
                <Text style={s.monthCardTitle}>{m.label}</Text>
                {savRate !== null && (
                  <Text style={[s.monthSavRate, { color: savRate >= 0 ? '#10b981' : '#f43f5e' }]}>
                    Savings Rate: {savRate >= 0 ? '+' : ''}{savRate}%
                  </Text>
                )}
              </View>
              <Text style={s.chevron}>{expanded ? '▲' : '▼'}</Text>
            </TouchableOpacity>

            {/* Cashflow row */}
            <View style={s.monthCashRow}>
              <View style={s.monthCashBox}>
                <Text style={s.monthCashLabel}>INCOME</Text>
                <Text style={[s.monthCashVal, s.textCredit]}>
                  {m.income > 0 ? `+Rs.${formatAmount(m.income)}` : '—'}
                </Text>
              </View>
              <View style={s.monthCashDivider} />
              <View style={s.monthCashBox}>
                <Text style={s.monthCashLabel}>SPENT</Text>
                <Text style={[s.monthCashVal, s.textDebit]}>
                  {m.expenses > 0 ? `−Rs.${formatAmount(m.expenses)}` : '—'}
                </Text>
              </View>
              <View style={s.monthCashDivider} />
              <View style={s.monthCashBox}>
                <Text style={s.monthCashLabel}>NET</Text>
                <Text style={[s.monthCashVal, net >= 0 ? s.textCredit : s.textDebit]}>
                  {net >= 0 ? `+Rs.${formatAmount(net)}` : `−Rs.${formatAmount(Math.abs(net))}`}
                </Text>
              </View>
            </View>

            {/* Category breakdown on expand */}
            {expanded && catList.length > 0 && (
              <View style={s.monthCatSection}>
                <Text style={s.monthCatTitle}>Spending Breakdown</Text>
                {catList.map(([cat, amt]) => {
                  const barW = (amt / maxCat) * (SCREEN_WIDTH - 240);
                  return (
                    <View key={cat} style={s.monthCatRow}>
                      <Text style={s.monthCatLabel}>{CATEGORY_EMOJI[cat] ?? '📦'} {cat}</Text>
                      <View style={s.monthCatBarBg}>
                        <View style={[s.monthCatBarFill, { width: barW }]} />
                      </View>
                      <Text style={[s.monthCatAmt, s.textDebit]}>Rs.{formatAmount(amt)}</Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

type ViewMode = 'ledger' | 'monthly';

export default function TransactionsTab({ transactions, onDeleteTransaction, onAddTransaction, onEditTransaction }: TransactionsTabProps) {
  const [view, setView] = useState<ViewMode>('ledger');
  const [search, setSearch] = useState('');
  const [selCategory, setSelCategory] = useState('All');
  const [selType, setSelType] = useState<'All' | 'credit' | 'debit'>('All');
  const [sortBy, setSortBy] = useState<'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc'>('date-desc');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingTxn, setEditingTxn] = useState<Transaction | null>(null);

  const filtered = useMemo(() => {
    return transactions.filter(t => {
      const matchSearch = !search || t.description.toLowerCase().includes(search.toLowerCase()) ||
        t.category.toLowerCase().includes(search.toLowerCase()) ||
        (t.smsBody ?? '').toLowerCase().includes(search.toLowerCase());
      const matchCat = selCategory === 'All' || t.category === selCategory;
      const matchType = selType === 'All' || t.type === selType;
      return matchSearch && matchCat && matchType;
    }).sort((a, b) => {
      if (sortBy === 'date-desc') return b.date - a.date;
      if (sortBy === 'date-asc') return a.date - b.date;
      if (sortBy === 'amount-desc') return b.amount - a.amount;
      return a.amount - b.amount;
    });
  }, [transactions, search, selCategory, selType, sortBy]);

  const totalFiltered = filtered.reduce((s, t) => t.type === 'debit' ? s - t.amount : s + t.amount, 0);

  const TABS: { key: ViewMode; label: string }[] = [
    { key: 'ledger', label: '📋 Ledger' },
    { key: 'monthly', label: '📅 Monthly' },
  ];

  return (
    <View style={s.container}>
      {/* Top view tabs */}
      <View style={s.viewTabBar}>
        {TABS.map(tab => (
          <TouchableOpacity key={tab.key} style={[s.viewTab, view === tab.key && s.viewTabActive]}
            onPress={() => setView(tab.key)}>
            <Text style={[s.viewTabText, view === tab.key && s.viewTabTextActive]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── LEDGER VIEW ─── */}
      {view === 'ledger' && (
        <>
          {/* Filters */}
          <View style={s.filterBar}>
            <TextInput style={s.searchInput} placeholder="🔍  Search description, category, SMS..."
              placeholderTextColor="#52525b" value={search} onChangeText={setSearch} />

            {/* Type + Sort row */}
            <View style={s.filterRow}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
                {(['All', 'debit', 'credit'] as const).map(t => (
                  <TouchableOpacity key={t}
                    style={[s.filterChip,
                      selType === t && t === 'debit' && s.filterChipDebit,
                      selType === t && t === 'credit' && s.filterChipCredit,
                      selType === t && t === 'All' && s.filterChipAll]}
                    onPress={() => setSelType(t)}>
                    <Text style={[s.filterChipText, selType === t && { color: '#fff' }]}>
                      {t === 'All' ? 'All' : t === 'debit' ? '📤 Expense' : '📥 Income'}
                    </Text>
                  </TouchableOpacity>
                ))}
                <View style={s.filterChipDivider} />
                {(['date-desc', 'date-asc', 'amount-desc', 'amount-asc'] as const).map(opt => (
                  <TouchableOpacity key={opt} style={[s.filterChip, sortBy === opt && s.filterChipAll]}
                    onPress={() => setSortBy(opt)}>
                    <Text style={[s.filterChipText, sortBy === opt && { color: '#fff' }]}>
                      {opt === 'date-desc' ? '↓ Newest' : opt === 'date-asc' ? '↑ Oldest' :
                        opt === 'amount-desc' ? '↓ Highest' : '↑ Lowest'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Category filter */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled={true}>
              <View style={{ flexDirection: 'row', gap: 6, paddingVertical: 4 }}>
                {CATEGORIES.map(cat => (
                  <TouchableOpacity key={cat}
                    style={[s.filterChip, selCategory === cat && s.filterChipActive]}
                    onPress={() => setSelCategory(cat)}>
                    <Text style={[s.filterChipText, selCategory === cat && { color: '#fff', fontWeight: '700' }]}>
                      {cat !== 'All' ? (CATEGORY_EMOJI[cat] ?? '') + ' ' : ''}{cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>

          {/* Table header */}
          <View style={s.tableHeader}>
            <Text style={[s.tableHeaderCell, s.colDate]}>DATE</Text>
            <Text style={[s.tableHeaderCell, s.colDesc]}>DESCRIPTION / CATEGORY</Text>
            <Text style={[s.tableHeaderCell, s.colAmount, { textAlign: 'right' }]}>AMOUNT</Text>
          </View>

          {/* Result count + net */}
          <View style={s.resultBar}>
            <Text style={s.resultCount}>{filtered.length} transactions</Text>
            <Text style={[s.resultNet, totalFiltered >= 0 ? s.textCredit : s.textDebit]}>
              Net: {totalFiltered >= 0 ? '+' : ''}Rs.{formatAmount(Math.abs(totalFiltered))}
            </Text>
          </View>

          {/* Transaction rows */}
          <FlatList
            data={filtered}
            keyExtractor={item => item.id}
            contentContainerStyle={{ paddingBottom: 80 }}
            ListEmptyComponent={
              <View style={s.emptyBlock}>
                <Text style={s.emptyText}>No transactions match your filters.</Text>
              </View>
            }
            renderItem={({ item }) => (
              <LedgerRow 
                item={item} 
                onDelete={() => {
                  Alert.alert('Delete', 'Remove this transaction?', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: () => onDeleteTransaction(item.id) },
                  ]);
                }} 
                onEdit={() => setEditingTxn(item)}
              />
            )}
          />
        </>
      )}



      {/* ── MONTHLY VIEW ─── */}
      {view === 'monthly' && <MonthlyView transactions={transactions} />}

      {/* FAB */}
      <TouchableOpacity style={s.fab} onPress={() => setShowAddModal(true)}>
        <Text style={s.fabText}>＋</Text>
      </TouchableOpacity>

      <AddTransactionModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSave={onAddTransaction}
      />

      {editingTxn && (
        <EditTransactionModal
          visible={!!editingTxn}
          onClose={() => setEditingTxn(null)}
          transaction={editingTxn}
          onSave={(updates) => onEditTransaction && onEditTransaction(editingTxn.id, updates)}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#09090b' },

  // View tabs
  viewTabBar: {
    flexDirection: 'row',
    backgroundColor: '#111114',
    borderBottomWidth: 1,
    borderBottomColor: '#27272a',
  },
  viewTab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  viewTabActive: { borderBottomWidth: 2, borderBottomColor: '#10b981' },
  viewTabText: { color: '#52525b', fontSize: 12, fontWeight: '700' },
  viewTabTextActive: { color: '#10b981' },

  // Filter bar
  filterBar: {
    backgroundColor: '#111114',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#1f1f23',
  },
  searchInput: {
    backgroundColor: '#1a1a1e',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#ffffff',
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#27272a',
    marginBottom: 8,
  },
  filterRow: { flexDirection: 'row', marginBottom: 6 },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: '#1a1a1e',
    borderWidth: 1,
    borderColor: '#27272a',
    marginRight: 6,
  },
  filterChipText: { color: '#71717a', fontSize: 11, fontWeight: '600' },
  filterChipDebit: { backgroundColor: '#f43f5e', borderColor: '#f43f5e' },
  filterChipCredit: { backgroundColor: '#10b981', borderColor: '#10b981' },
  filterChipAll: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  filterChipActive: { backgroundColor: '#10b981', borderColor: '#10b981' },
  filterChipDivider: { width: 1, backgroundColor: '#27272a', marginHorizontal: 4 },

  // Table header
  tableHeader: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#0d0d10',
    borderBottomWidth: 1,
    borderBottomColor: '#1f1f23',
  },
  tableHeaderCell: { color: '#52525b', fontSize: 9, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },

  // Column widths
  colDate: { width: 56 },
  colDesc: { flex: 1, paddingHorizontal: 8 },
  colAmount: { width: 110 },

  // Result bar
  resultBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: '#0d0d10',
    borderBottomWidth: 1,
    borderBottomColor: '#1f1f23',
  },
  resultCount: { color: '#52525b', fontSize: 11 },
  resultNet: { fontSize: 11, fontWeight: '700' },

  // Ledger rows
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#141418',
  },
  cellDateTop: { color: '#e4e4e7', fontSize: 12, fontWeight: '700' },
  cellDateBot: { color: '#52525b', fontSize: 10 },
  cellDesc: { color: '#ffffff', fontSize: 13, fontWeight: '600' },
  cellCategoryBadge: { color: '#71717a', fontSize: 10 },
  cellAmount: { fontSize: 13, fontWeight: '800', textAlign: 'right' },
  cellMethod: { color: '#52525b', fontSize: 9, textAlign: 'right', marginTop: 2 },

  // Expanded row
  expandedRow: {
    backgroundColor: '#0d0d10',
    paddingHorizontal: 14,
    paddingBottom: 12,
    paddingTop: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#141418',
  },
  smsBodyText: { color: '#52525b', fontSize: 11, lineHeight: 15, marginBottom: 6, fontFamily: 'monospace' },
  smsSenderText: { color: '#3f3f46', fontSize: 10, marginBottom: 8 },
  deleteRowBtn: { alignSelf: 'flex-start', paddingVertical: 4 },
  deleteRowBtnText: { color: '#f43f5e', fontSize: 12, fontWeight: '700' },

  // Analytics
  analyticsContent: { padding: 16, paddingBottom: 80 },
  sectionHeading: { color: '#a1a1aa', fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', marginTop: 20, marginBottom: 10 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  summaryCard: {
    width: '30%',
    flex: 1,
    backgroundColor: '#111114',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#27272a',
    minWidth: 90,
  },
  summaryLabel: { color: '#52525b', fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  summaryValue: { color: '#ffffff', fontSize: 14, fontWeight: '800' },

  // Chart
  chartCard: {
    backgroundColor: '#111114',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#27272a',
    gap: 12,
  },
  chartRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chartMonthLabel: { color: '#a1a1aa', fontSize: 11, fontWeight: '600', width: 60 },
  chartBarBg: { flex: 1, height: 8, backgroundColor: '#1f1f23', borderRadius: 4, overflow: 'hidden' },
  chartBarFill: { height: '100%', borderRadius: 4 },
  chartBarValue: { fontSize: 11, fontWeight: '700', width: 80, textAlign: 'right' },

  // Table card
  tableCard: {
    backgroundColor: '#111114',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#27272a',
    overflow: 'hidden',
  },
  tableHeaderRow: { backgroundColor: '#0d0d10', flexDirection: 'row' },
  tableDataRow: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10 },
  tableDataCell: { color: '#a1a1aa', fontSize: 12 },
  tableRowBorder: { borderTopWidth: 1, borderTopColor: '#1f1f23' },

  // Category rows
  catRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  catLabel: { color: '#e4e4e7', fontSize: 12, fontWeight: '600', width: 120 },
  catBarBg: { flex: 1, height: 6, backgroundColor: '#1f1f23', borderRadius: 3, overflow: 'hidden' },
  catBarFill: { height: '100%', borderRadius: 3, backgroundColor: '#f43f5e' },
  catAmtBlock: { alignItems: 'flex-end', width: 80 },
  catAmt: { fontSize: 11, fontWeight: '700' },
  catPct: { color: '#52525b', fontSize: 9 },

  // Monthly view
  monthCard: {
    backgroundColor: '#111114',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#27272a',
    marginBottom: 14,
    overflow: 'hidden',
  },
  monthCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1f1f23',
  },
  monthCardTitle: { color: '#ffffff', fontSize: 16, fontWeight: '800' },
  monthSavRate: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  chevron: { color: '#52525b', fontSize: 12 },
  monthCashRow: { flexDirection: 'row', padding: 14 },
  monthCashBox: { flex: 1, alignItems: 'center' },
  monthCashDivider: { width: 1, backgroundColor: '#1f1f23' },
  monthCashLabel: { color: '#52525b', fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  monthCashVal: { fontSize: 14, fontWeight: '800' },
  monthCatSection: {
    borderTopWidth: 1,
    borderTopColor: '#1f1f23',
    padding: 14,
    gap: 10,
  },
  monthCatTitle: { color: '#71717a', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  monthCatRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  monthCatLabel: { color: '#a1a1aa', fontSize: 11, width: 120 },
  monthCatBarBg: { flex: 1, height: 5, backgroundColor: '#1f1f23', borderRadius: 3, overflow: 'hidden' },
  monthCatBarFill: { height: '100%', borderRadius: 3, backgroundColor: '#f97316' },
  monthCatAmt: { fontSize: 11, fontWeight: '700', width: 70, textAlign: 'right' },

  // Empty
  emptyBlock: { padding: 40, alignItems: 'center' },
  emptyText: { color: '#3f3f46', fontSize: 13, textAlign: 'center' },

  // FAB
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#10b981',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#10b981',
    shadowOpacity: 0.4,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
  },
  fabText: { color: '#fff', fontSize: 24, fontWeight: '300', marginTop: -2 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#111114',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '90%',
    borderTopWidth: 1,
    borderColor: '#27272a',
  },
  modalHandle: { width: 40, height: 4, backgroundColor: '#27272a', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '800', marginBottom: 16 },
  typeRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  typeBtn: { flex: 1, padding: 12, borderRadius: 10, backgroundColor: '#1a1a1e', borderWidth: 1, borderColor: '#27272a', alignItems: 'center' },
  typeBtnDebit: { backgroundColor: '#f43f5e', borderColor: '#f43f5e' },
  typeBtnCredit: { backgroundColor: '#10b981', borderColor: '#10b981' },
  typeBtnText: { color: '#71717a', fontWeight: '700', fontSize: 13 },
  fieldLabel: { color: '#71717a', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: 14 },
  fieldInput: {
    backgroundColor: '#1a1a1e', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    color: '#fff', fontSize: 14, borderWidth: 1, borderColor: '#27272a',
  },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#1a1a1e', borderWidth: 1, borderColor: '#27272a' },
  chipActive: { backgroundColor: '#10b981', borderColor: '#10b981' },
  chipText: { color: '#71717a', fontSize: 11, fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  btnCancel: { flex: 1, padding: 13, borderRadius: 12, backgroundColor: '#1a1a1e', alignItems: 'center', borderWidth: 1, borderColor: '#27272a' },
  btnCancelText: { color: '#71717a', fontWeight: '700' },
  btnSave: { flex: 1, padding: 13, borderRadius: 12, backgroundColor: '#10b981', alignItems: 'center' },
  btnSaveText: { color: '#fff', fontWeight: '700' },

  // Colors
  textCredit: { color: '#10b981' },
  textDebit: { color: '#f43f5e' },

  expandedActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
  },
  editRowBtn: {
    backgroundColor: '#0284c7',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  editRowBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
});
