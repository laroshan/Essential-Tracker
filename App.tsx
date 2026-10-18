import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  StatusBar, 
  StyleSheet, 
  View, 
  Text, 
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Alert,
  PermissionsAndroid,
  AppState,
  AppStateStatus
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import {
  Transaction, Message, Debt, Subscription, WealthConfig,
  Task, TodoItem, TodoList, MoodEntry, JournalEntry
} from './src/types';
import { storage } from './src/utils/storage';
import { ingestSms, learnKey, reanalyzeTransactions, reconcileTransactions, recategorize } from './src/utils/sms';
import { totals } from './src/utils/finance';
import SmsModule from './modules/sms-module/src/SmsModule';

// Import existing Money Tracker Tabs
import DashboardTab from './src/components/DashboardTab';
import AgentChatTab from './src/components/AgentChatTab';
import TransactionsTab from './src/components/TransactionsTab';
import WealthTab from './src/components/WealthTab';
import AnalyticsTab from './src/components/AnalyticsTab';

// Import new screens
import HomeScreen, { TrackerScreen } from './src/components/HomeScreen';
import TaskTrackerScreen from './src/components/TaskTrackerScreen';
import TodoScreen from './src/components/TodoScreen';
import MentalHealthScreen from './src/components/MentalHealthScreen';

// ─── Initial Values ───────────────────────────────────────────────────────────

const INITIAL_TRANSACTIONS: Transaction[] = [];
const INITIAL_DEBTS: Debt[] = [];
const INITIAL_SUBSCRIPTIONS: Subscription[] = [];
const INITIAL_CONFIG: WealthConfig = {
  emergencyFundTargetMonths: 6,
  monthlyIncome: 4500,
  fixedCostsPercent: 50,
  savingsPercent: 10,
  investmentsPercent: 20,
  guiltFreePercent: 20,
  emergencyFundSaved: 3500
};
const INITIAL_MESSAGES: Message[] = [
  {
    id: 'm-1',
    sender: 'agent',
    text: '🤖 Hello! I am your intelligent WealthAgent.',
    timestamp: Date.now() - 12 * 60 * 1000
  },
  {
    id: 'm-2',
    sender: 'agent',
    text: "I read bank SMS notification alerts to track your credit/debit card expenses, and help you log cash spent. Try entering: 'Spent Rs. 800 for lunch' or tap 'Sync SMS' above.",
    timestamp: Date.now() - 10 * 60 * 1000
  }
];

const DEFAULT_TODO_LISTS: Omit<TodoList, 'id' | 'createdAt'>[] = [
  { name: 'Personal', color: '#10b981' },
  { name: 'Work',     color: '#3b82f6' },
  { name: 'Shopping', color: '#f59e0b' },
];

// ─── Root ────────────────────────────────────────────────────────────────────

function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor="#09090b" />
      <AppContent />
    </SafeAreaProvider>
  );
}

// ─── Main Content ─────────────────────────────────────────────────────────────

function AppContent() {
  // Top-level screen navigation
  const [activeScreen, setActiveScreen] = useState<'home' | TrackerScreen>('home');
  // Money tracker sub-tab
  const [activeTab, setActiveTab] = useState<'dashboard' | 'history' | 'analytics' | 'chat' | 'wealth'>('dashboard');

  const [isLoading, setIsLoading] = useState(true);

  // ── Money Tracker State ──────────────────────────────────────────────────
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [config, setConfig] = useState<WealthConfig>(INITIAL_CONFIG);

  // SMS Sync States
  const [pendingSms, setPendingSms] = useState<Array<{ address: string; body: string; date: number; parsed: any }>>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [bankSenders, setBankSenders] = useState<string[]>([]);
  const [autoLog, setAutoLog] = useState<boolean>(false);
  const [dismissedSmsDates, setDismissedSmsDates] = useState<number[]>([]);
  const [lastSyncedSmsDates, setLastSyncedSmsDates] = useState<Record<string, number>>({});
  const [syncWindowDays, setSyncWindowDays] = useState<number>(365); // default to 365 days / 1 Year
  const [learnedCategories, setLearnedCategories] = useState<Record<string, string>>({});

  // ── Task Tracker State ───────────────────────────────────────────────────
  const [tasks, setTasks] = useState<Task[]>([]);

  // ── To-Do State ─────────────────────────────────────────────────────────
  const [todoItems, setTodoItems] = useState<TodoItem[]>([]);
  const [todoLists, setTodoLists] = useState<TodoList[]>([]);

  // ── Mental Health State ──────────────────────────────────────────────────
  const [moodEntries, setMoodEntries] = useState<MoodEntry[]>([]);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);

  const unapprovedTransactions = useMemo(() => {
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return transactions.filter(t => t.date >= oneWeekAgo && t.approved !== true);
  }, [transactions]);

  // ── Refs for stale-closure avoidance ────────────────────────────────────
  const transactionsRef = useRef(transactions);
  const bankSendersRef = useRef(bankSenders);
  const dismissedSmsDatesRef = useRef(dismissedSmsDates);
  const pendingSmsRef = useRef(pendingSms);
  const autoLogRef = useRef(autoLog);
  const messagesRef = useRef(messages);
  const lastSyncedSmsDatesRef = useRef(lastSyncedSmsDates);
  const syncWindowDaysRef = useRef(syncWindowDays);
  const learnedCategoriesRef = useRef(learnedCategories);

  useEffect(() => { transactionsRef.current = transactions; }, [transactions]);
  useEffect(() => { bankSendersRef.current = bankSenders; }, [bankSenders]);
  useEffect(() => { dismissedSmsDatesRef.current = dismissedSmsDates; }, [dismissedSmsDates]);
  useEffect(() => { pendingSmsRef.current = pendingSms; }, [pendingSms]);
  useEffect(() => { autoLogRef.current = autoLog; }, [autoLog]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { lastSyncedSmsDatesRef.current = lastSyncedSmsDates; }, [lastSyncedSmsDates]);
  useEffect(() => { syncWindowDaysRef.current = syncWindowDays; }, [syncWindowDays]);
  useEffect(() => { learnedCategoriesRef.current = learnedCategories; }, [learnedCategories]);

  // ── Load all data from storage ───────────────────────────────────────────
  useEffect(() => {
    async function loadData() {
      try {
        // Money tracker
        const storedTxns    = await storage.getObject<Transaction[]>('transactions');
        const storedMsgs    = await storage.getObject<Message[]>('messages');
        const storedDebts   = await storage.getObject<Debt[]>('debts');
        const storedSubs    = await storage.getObject<Subscription[]>('subscriptions');
        const storedConfig  = await storage.getObject<WealthConfig>('wealthConfig');
        const storedSenders = await storage.getObject<string[]>('bankSenders');
         const storedAutoLog = await storage.getObject<boolean>('autoLog');
        const storedPending = await storage.getObject<any[]>('pendingSms');
        const storedDismissed = await storage.getObject<number[]>('dismissedSmsDates');
        const storedLastSyncedSmsDates = await storage.getObject<Record<string, number>>('lastSyncedSmsDates');
        const storedSyncWindowDays = await storage.getObject<number>('syncWindowDays');
        const storedLearned = await storage.getObject<Record<string, string>>('learnedCategories');

        // Task tracker
        const storedTasks   = await storage.getObject<Task[]>('tasks');

        // To-Do
        const storedTodoItems = await storage.getObject<TodoItem[]>('todoItems');
        const storedTodoLists = await storage.getObject<TodoList[]>('todoLists');

        // Mental health
        const storedMoodEntries    = await storage.getObject<MoodEntry[]>('moodEntries');
        const storedJournalEntries = await storage.getObject<JournalEntry[]>('journalEntries');

        // Apply money tracker data
        setTransactions(storedTxns ?? INITIAL_TRANSACTIONS);
        if (!storedTxns) await storage.setObject('transactions', INITIAL_TRANSACTIONS);

        setMessages(storedMsgs ?? INITIAL_MESSAGES);
        if (!storedMsgs) await storage.setObject('messages', INITIAL_MESSAGES);

        setDebts(storedDebts ?? INITIAL_DEBTS);
        if (!storedDebts) await storage.setObject('debts', INITIAL_DEBTS);

        setSubscriptions(storedSubs ?? INITIAL_SUBSCRIPTIONS);
        if (!storedSubs) await storage.setObject('subscriptions', INITIAL_SUBSCRIPTIONS);

        setConfig(storedConfig ?? INITIAL_CONFIG);
        if (!storedConfig) await storage.setObject('wealthConfig', INITIAL_CONFIG);

        // Only real Sri Lankan bank senders as defaults
        const defaultSenders = ['BOC', 'SAMPATHTXN', 'PEOPLESBANK'];
        // Migrate: remove generic demo senders the user never added themselves
        const unwanted = ['CHASE', 'PAYPAL', 'REVOLUT', 'AMEX'];
        if (storedSenders) {
          const cleaned = storedSenders.filter((s: string) => !unwanted.includes(s));
          // Add any missing defaults
          const merged = [...new Set([...cleaned, ...defaultSenders])];
          setBankSenders(merged);
          await storage.setObject('bankSenders', merged);
        } else {
          setBankSenders(defaultSenders);
          await storage.setObject('bankSenders', defaultSenders);
        }
         if (storedAutoLog !== null) setAutoLog(storedAutoLog);
        if (storedPending) setPendingSms(storedPending);
        if (storedDismissed) setDismissedSmsDates(storedDismissed);
        if (storedLastSyncedSmsDates) setLastSyncedSmsDates(storedLastSyncedSmsDates);
        if (storedSyncWindowDays !== null && storedSyncWindowDays !== undefined) setSyncWindowDays(storedSyncWindowDays);
        if (storedLearned) setLearnedCategories(storedLearned);

        // Apply task tracker data
        setTasks(storedTasks ?? []);
        if (!storedTasks) await storage.setObject('tasks', []);

        // Apply to-do data — seed default lists if none
        if (storedTodoLists && storedTodoLists.length > 0) {
          setTodoLists(storedTodoLists);
        } else {
          const seededLists: TodoList[] = DEFAULT_TODO_LISTS.map((l, i) => ({
            ...l,
            id: `list-${Date.now()}-${i}`,
            createdAt: Date.now(),
          }));
          setTodoLists(seededLists);
          await storage.setObject('todoLists', seededLists);
        }
        setTodoItems(storedTodoItems ?? []);
        if (!storedTodoItems) await storage.setObject('todoItems', []);

        // Apply mental health data
        setMoodEntries(storedMoodEntries ?? []);
        if (!storedMoodEntries) await storage.setObject('moodEntries', []);
        setJournalEntries(storedJournalEntries ?? []);
        if (!storedJournalEntries) await storage.setObject('journalEntries', []);

      } catch (err) {
        console.error('Error loading data:', err);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // MONEY TRACKER ACTIONS
  // ─────────────────────────────────────────────────────────────────────────

  const addTransaction = async (txn: Omit<Transaction, 'id'>) => {
    const newTxn: Transaction = { ...txn, id: `txn-${Date.now()}` };
    const updated = [newTxn, ...transactionsRef.current];
    setTransactions(updated);
    await storage.setObject('transactions', updated);
  };

  const saveTransactions = async (list: Transaction[]) => {
    transactionsRef.current = list;
    setTransactions(list);
    await storage.setObject('transactions', list);
  };

  /** Dedupe + pair self-transfers across the whole history, then persist. */
  const reconcileAndSave = async (list: Transaction[]) => {
    const { txns } = reconcileTransactions(list);
    await saveTransactions(txns);
  };

  const learnCategoryPattern = async (txn: Transaction, newCategory: string): Promise<Record<string, string>> => {
    const key = learnKey(txn);
    if (!key) return learnedCategoriesRef.current;
    const updated = { ...learnedCategoriesRef.current, [key]: newCategory };
    learnedCategoriesRef.current = updated;
    setLearnedCategories(updated);
    await storage.setObject('learnedCategories', updated);
    return updated;
  };

  const editTransaction = async (id: string, updates: Partial<Transaction>) => {
    const originalTxn = transactionsRef.current.find(t => t.id === id);
    if (!originalTxn) return;

    const categoryChanged = !!updates.category && updates.category !== originalTxn.category;
    let learned = learnedCategoriesRef.current;
    if (categoryChanged) learned = await learnCategoryPattern(originalTxn, updates.category as string);
    const key = categoryChanged ? learnKey(originalTxn) : '';

    const updated = transactionsRef.current.map(t => {
      if (t.id === id) return { ...t, ...updates, ...(categoryChanged ? { userCategorized: true } : {}) };
      // Apply what was just learned to every other auto-categorised transaction from the same merchant
      if (key && !t.userCategorized && t.category !== 'Transfer' && learnKey(t) === key) {
        return { ...t, category: recategorize(t, learned) };
      }
      return t;
    });
    await saveTransactions(updated);
  };

  const approveTransaction = async (id: string) => {
    const updated = transactionsRef.current.map(t => t.id === id ? { ...t, approved: true } : t);
    setTransactions(updated);
    await storage.setObject('transactions', updated);
  };

  const deleteTransaction = async (id: string) => {
    const updated = transactionsRef.current.filter(t => t.id !== id);
    setTransactions(updated);
    await storage.setObject('transactions', updated);
  };

  const addMessage = async (msg: Omit<Message, 'id' | 'timestamp'>) => {
    const newMsg: Message = { ...msg, id: `msg-${Date.now()}`, timestamp: Date.now() };
    const updated = [...messagesRef.current, newMsg];
    setMessages(updated);
    await storage.setObject('messages', updated);
  };

  const updateConfig = async (newConfig: Partial<WealthConfig>) => {
    const updated = { ...config, ...newConfig };
    setConfig(updated);
    await storage.setObject('wealthConfig', updated);
  };

  const addDebt = async (debt: Omit<Debt, 'id'>) => {
    const newDebt: Debt = { ...debt, id: `debt-${Date.now()}` };
    const updated = [...debts, newDebt];
    setDebts(updated);
    await storage.setObject('debts', updated);
  };

  const deleteDebt = async (id: string) => {
    const updated = debts.filter(d => d.id !== id);
    setDebts(updated);
    await storage.setObject('debts', updated);
  };

  const addSubscription = async (sub: Omit<Subscription, 'id'>) => {
    const newSub: Subscription = { ...sub, id: `sub-${Date.now()}` };
    const updated = [...subscriptions, newSub];
    setSubscriptions(updated);
    await storage.setObject('subscriptions', updated);
  };

  const deleteSubscription = async (id: string) => {
    const updated = subscriptions.filter(s => s.id !== id);
    setSubscriptions(updated);
    await storage.setObject('subscriptions', updated);
  };

  const addSender = async (sender: string) => {
    const clean = sender.trim().toUpperCase();
    if (bankSenders.includes(clean)) return;
    const updated = [...bankSenders, clean];
    setBankSenders(updated);
    await storage.setObject('bankSenders', updated);
  };

   const deleteSender = async (senderToDelete: string) => {
    const updated = bankSenders.filter(s => s !== senderToDelete);
    setBankSenders(updated);
    await storage.setObject('bankSenders', updated);
 
    const updatedDates = { ...lastSyncedSmsDatesRef.current };
    delete updatedDates[senderToDelete];
    setLastSyncedSmsDates(updatedDates);
    await storage.setObject('lastSyncedSmsDates', updatedDates);
  };

  const toggleAutoLog = async (value: boolean) => {
    setAutoLog(value);
    await storage.setObject('autoLog', value);
  };

  const updateSyncWindowDays = async (days: number) => {
    setSyncWindowDays(days);
    await storage.setObject('syncWindowDays', days);
  };

  const resetSyncDates = async () => {
    setLastSyncedSmsDates({});
    await storage.setObject('lastSyncedSmsDates', {});
    Alert.alert(
      'Sync Reset',
      `SMS sync checkpoints have been reset. Clicking "Sync Bank SMS" will now query all messages from the last ${syncWindowDaysRef.current} days.`,
      [{ text: 'OK' }]
    );
  };

  /** Re-run the current SMS engine over every stored SMS transaction. */
  const reanalyzeSmsTransactions = async () => {
    const result = reanalyzeTransactions(transactionsRef.current, learnedCategoriesRef.current);
    const apply = async () => {
      await saveTransactions(result.transactions);
      await addMessage({
        sender: 'agent',
        text: `🔍 **Re-analysis complete**\nRe-parsed ${result.updated} SMS transactions, removed ${result.removed.length} non-transactions/duplicates (OTPs, failed transfers, repeated alerts) and matched ${result.transfersPaired} transfers between your own accounts. Your manual category choices were kept.`,
      });
    };
    if (result.removed.length === 0) { await apply(); return; }
    const sample = result.removed.slice(0, 4).map(t => `• Rs. ${t.amount.toFixed(2)} — ${t.description}`).join('\n');
    Alert.alert(
      'Re-analyze SMS transactions',
      `${result.updated} transactions will be corrected and ${result.removed.length} removed because they were OTPs, failed transfers or duplicate alerts:\n\n${sample}${result.removed.length > 4 ? '\n…' : ''}`,
      [{ text: 'Cancel', style: 'cancel' }, { text: 'Apply', onPress: apply }],
    );
  };

  const logSmsTransaction = async (smsItem: any, index: number) => {
    const { address, body, date } = smsItem;
    // Re-run the engine so items queued by an older version get the full enrichment
    const fresh = ingestSms([{ address, body, date }], learnedCategoriesRef.current).candidates[0]?.txn;
    const parsed: any = fresh ?? smsItem.parsed;
    const newTxn: Transaction = {
      ...(fresh ?? {
        amount: parsed.amount, type: parsed.type, description: parsed.description, category: parsed.category,
        paymentMethod: parsed.paymentMethod, date: parsed.transactionDate ?? date,
        smsSender: address, smsBody: body, smsDate: date,
      }),
      id: `txn-${Date.now()}`,
      approved: true,
    };
    await reconcileAndSave([newTxn, ...transactionsRef.current]);
    await addMessage({
      sender: 'agent',
      text: `✅ Added bank alert: ${parsed.type === 'debit' ? 'spent' : 'received'} Rs. ${parsed.amount.toFixed(2)} — ${parsed.description} (${parsed.category}).`
    });
    const updatedPending = pendingSmsRef.current.filter((_, idx) => idx !== index);
    setPendingSms(updatedPending);
    await storage.setObject('pendingSms', updatedPending);
    const updatedDismissed = [...dismissedSmsDatesRef.current, date];
    setDismissedSmsDates(updatedDismissed);
    await storage.setObject('dismissedSmsDates', updatedDismissed);
  };

  const dismissSmsTransaction = async (index: number) => {
    const item = pendingSmsRef.current[index];
    const updatedPending = pendingSmsRef.current.filter((_, idx) => idx !== index);
    setPendingSms(updatedPending);
    await storage.setObject('pendingSms', updatedPending);
    const updatedDismissed = [...dismissedSmsDatesRef.current, item.date];
    setDismissedSmsDates(updatedDismissed);
    await storage.setObject('dismissedSmsDates', updatedDismissed);
  };

  const syncSmsInbox = async (silent = true) => {
    if (Platform.OS !== 'android') {
      if (!silent) Alert.alert('Platform Not Supported', 'SMS integration is only available on Android devices.');
      return;
    }
    try {
      setIsSyncing(true);
      if (silent) {
        const hasPermission = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS);
        if (!hasPermission) { setIsSyncing(false); return; }
      } else {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.READ_SMS,
          {
            title: 'SMS Permission Required',
            message: 'WealthAgent needs access to your SMS inbox to automatically parse bank transaction alerts.',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          }
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          Alert.alert('Permission Denied', 'Cannot read bank SMS alerts without SMS permissions.');
          setIsSyncing(false); return;
        }
      }
      if (!SmsModule || !SmsModule.getSmsInbox) {
        if (!silent) Alert.alert('Native Module Error', 'SmsModule is not registered correctly in this build.');
        setIsSyncing(false); return;
      }
      const bootstrapDate = Date.now() - syncWindowDaysRef.current * 24 * 60 * 60 * 1000;
      const currentBankSenders = bankSendersRef.current;
      const currentLastSyncedDates = lastSyncedSmsDatesRef.current;

      // Helper: resolve an SMS address to the configured sender name for consistent checkpoint keys
      const resolveToSenderKey = (address: string): string | null => {
        const addrUpper = address.toUpperCase();
        for (const sender of currentBankSenders) {
          const senderUpper = sender.toUpperCase();
          if (addrUpper.includes(senderUpper) || senderUpper.includes(addrUpper)) {
            return senderUpper; // always use the configured sender as the key
          }
        }
        return null;
      };

      // Compute sinceDate as the oldest per-sender checkpoint (using configured sender keys)
      const sinceDate = currentBankSenders.length > 0
        ? Math.min(...currentBankSenders.map(sender => currentLastSyncedDates[sender.toUpperCase()] ?? bootstrapDate))
        : bootstrapDate;
 
      console.log('--- SMS Sync Start ---');
      console.log('Bank Senders:', currentBankSenders);
      console.log('Checkpoints:', currentLastSyncedDates);
      console.log('bootstrapDate:', new Date(bootstrapDate).toLocaleString());
      console.log('sinceDate:', new Date(sinceDate).toLocaleString());

      // Divide the query timeframe from sinceDate to Date.now() into monthly (30-day) chunks
      const chunks: { start: number; end: number }[] = [];
      let tempStart = sinceDate;
      const thirtyDays = 30 * 24 * 60 * 60 * 1000;
      const targetEnd = Date.now();
      
      while (tempStart < targetEnd) {
        const tempEnd = Math.min(tempStart + thirtyDays, targetEnd);
        chunks.push({ start: tempStart, end: tempEnd });
        tempStart = tempEnd;
      }

      console.log(`Syncing in ${chunks.length} monthly chunks...`);

      const inboxList: Array<{ address: string; body: string; date: number }> = [];
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        console.log(`Querying chunk ${i + 1}/${chunks.length}: ${new Date(chunk.start).toLocaleDateString()} to ${new Date(chunk.end).toLocaleDateString()}`);
        
        // Pass start, end (beforeDate), and filters
        const chunkList = await SmsModule.getSmsInbox(10000, Math.floor(chunk.start), Math.floor(chunk.end), currentBankSenders);
        if (chunkList && chunkList.length > 0) {
          inboxList.push(...chunkList);
        }
      }

      console.log('Raw inboxList length:', inboxList.length);
      if (inboxList.length > 0) {
        // Sort inboxList descending so newest comes first
        inboxList.sort((a, b) => b.date - a.date);
        console.log('Newest SMS in inboxList:', new Date(inboxList[0].date).toLocaleString(), 'Address:', inboxList[0].address);
        console.log('Oldest SMS in inboxList:', new Date(inboxList[inboxList.length - 1].date).toLocaleString(), 'Address:', inboxList[inboxList.length - 1].address);
      }

      const currentTransactions = transactionsRef.current;
      const currentDismissed = dismissedSmsDatesRef.current;
      const currentPending = pendingSmsRef.current;
      const currentAutoLog = autoLogRef.current;
      let newPendingAdded = false;
      const detected = [...currentPending];
      const autoLoggedList: Array<{ amount: number; description: string; date: number }> = [];

      // Analyse the whole batch together: OTPs enrich merchant-less card debits,
      // duplicate alerts collapse, and self-transfers pair across banks.
      const fromBanks = inboxList.filter(sms => resolveToSenderKey(sms.address));
      const ingest = ingestSms(fromBanks, learnedCategoriesRef.current);
      console.log('SMS engine stats:', ingest.stats);
      if (ingest.unparsed.length > 0) {
        console.log('Unrecognised financial SMS:', ingest.unparsed.map(s => `${s.address}: ${s.body.slice(0, 80)}`));
      }

      const fresh = ingest.candidates.filter(({ sms, txn }) => {
        const senderKey = resolveToSenderKey(sms.address) as string;
        // Strict < so same-timestamp messages are NOT skipped
        if (sms.date < (currentLastSyncedDates[senderKey] ?? bootstrapDate)) return false;
        const isAlreadyLogged = currentTransactions.some(t =>
          (t.smsDate === sms.date && t.smsBody === sms.body)
          || (!!txn.reference && t.reference === txn.reference && Math.abs(t.amount - txn.amount) < 0.01));
        const isDismissed = currentDismissed.includes(sms.date);
        const isAlreadyPending = currentPending.some(p => p.date === sms.date);
        return !isAlreadyLogged && !isDismissed && !isAlreadyPending;
      });

      if (fresh.length > 0) {
        const stamp = Date.now();
        const newTxns: Transaction[] = fresh.map(({ txn }, i) => ({
          ...txn,
          id: `txn-${stamp}-${i}-${Math.random().toString(36).substring(2, 9)}`,
          approved: false,
        }));
        // Reconcile against history so a new credit can pair with an already-logged debit
        const { txns: merged } = reconcileTransactions([...newTxns, ...currentTransactions]);

        if (currentAutoLog) {
          await saveTransactions(merged);
          const kept = new Set(merged.map(t => t.id));
          newTxns.filter(t => kept.has(t.id)).forEach(t =>
            autoLoggedList.push({ amount: t.amount, description: t.description, date: t.date }));
        } else {
          const byId = new Map(merged.map(t => [t.id, t]));
          fresh.forEach(({ sms }, i) => {
            const reconciled = byId.get(newTxns[i].id);
            if (!reconciled) return; // duplicate of something already logged
            detected.push({ address: sms.address, body: sms.body, date: sms.date, parsed: reconciled });
            newPendingAdded = true;
          });
        }
      }
 
      // Update sender checkpoints with the latest date retrieved in this query
      // Use the configured sender name as key (not raw SMS address) for consistency
      const updatedDates = { ...currentLastSyncedDates };
      let hasUpdates = false;
      inboxList.forEach((sms: { address: string; date: number }) => {
        const senderKey = resolveToSenderKey(sms.address);
        if (senderKey && sms.date > (updatedDates[senderKey] ?? 0)) {
          updatedDates[senderKey] = sms.date;
          hasUpdates = true;
        }
      });
 
      if (hasUpdates) {
        setLastSyncedSmsDates(updatedDates);
        await storage.setObject('lastSyncedSmsDates', updatedDates);
      }

      if (currentAutoLog && autoLoggedList.length > 0) {
        const listText = autoLoggedList.map(item =>
          `• **Rs. ${item.amount.toFixed(2)}** at *${item.description}* on ${new Date(item.date).toLocaleDateString()}`
        ).join('\n');
        addMessage({ sender: 'agent', text: `📥 **Auto-Log Sync Complete**\nI've automatically imported and logged ${autoLoggedList.length} new transactions from your configured bank senders:\n\n${listText}` });
        if (!silent) Alert.alert('Auto-Log Successful', `Auto-logged ${autoLoggedList.length} new transactions!`);
      } else if (!currentAutoLog && newPendingAdded) {
        setPendingSms(detected);
        await storage.setObject('pendingSms', detected);
        addMessage({ sender: 'agent', text: `📥 **New Transaction Alerts Detected**\nI've found ${detected.length - currentPending.length} new bank alerts. Go to the Agent tab to review and log them.` });
        if (!silent) Alert.alert('Sync Successful', `Found ${detected.length - currentPending.length} new bank alert transactions to review!`);
      } else {
        if (!silent) Alert.alert('Sync Complete', 'No new bank SMS alerts found for configured senders.');
      }
    } catch (e: any) {
      console.error('Error syncing SMS:', e);
      if (!silent) Alert.alert('Error Syncing SMS', e.message || 'An error occurred.');
    } finally {
      setIsSyncing(false);
    }
  };

  // SMS sync listeners
  useEffect(() => {
    if (isLoading) return;
    const startupTimeout = setTimeout(() => syncSmsInbox(true), 2000);
    const periodicInterval = setInterval(() => syncSmsInbox(true), 60000);
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') syncSmsInbox(true);
    };
    const appStateSubscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      clearTimeout(startupTimeout);
      clearInterval(periodicInterval);
      appStateSubscription.remove();
    };
  }, [isLoading]);

  // ─────────────────────────────────────────────────────────────────────────
  // TASK TRACKER ACTIONS
  // ─────────────────────────────────────────────────────────────────────────

  const addTask = async (taskData: Omit<Task, 'id' | 'createdAt' | 'completedAt'>) => {
    const newTask: Task = {
      ...taskData,
      id: `task-${Date.now()}`,
      createdAt: Date.now(),
      completedAt: null,
    };
    const updated = [newTask, ...tasks];
    setTasks(updated);
    await storage.setObject('tasks', updated);
  };

  const updateTask = async (id: string, updates: Partial<Task>) => {
    const updated = tasks.map(t => t.id === id ? { ...t, ...updates } : t);
    setTasks(updated);
    await storage.setObject('tasks', updated);
  };

  const deleteTask = async (id: string) => {
    const updated = tasks.filter(t => t.id !== id);
    setTasks(updated);
    await storage.setObject('tasks', updated);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // TO-DO ACTIONS
  // ─────────────────────────────────────────────────────────────────────────

  const addTodoItem = async (itemData: Omit<TodoItem, 'id' | 'createdAt' | 'completedAt'>) => {
    const newItem: TodoItem = {
      ...itemData,
      id: `todo-${Date.now()}`,
      createdAt: Date.now(),
      completedAt: null,
    };
    const updated = [...todoItems, newItem];
    setTodoItems(updated);
    await storage.setObject('todoItems', updated);
  };

  const toggleTodoItem = async (id: string) => {
    const updated = todoItems.map(i =>
      i.id === id
        ? { ...i, completed: !i.completed, completedAt: !i.completed ? Date.now() : null }
        : i
    );
    setTodoItems(updated);
    await storage.setObject('todoItems', updated);
  };

  const deleteTodoItem = async (id: string) => {
    const updated = todoItems.filter(i => i.id !== id);
    setTodoItems(updated);
    await storage.setObject('todoItems', updated);
  };

  const addTodoList = async (listData: Omit<TodoList, 'id' | 'createdAt'>) => {
    const newList: TodoList = {
      ...listData,
      id: `list-${Date.now()}`,
      createdAt: Date.now(),
    };
    const updated = [...todoLists, newList];
    setTodoLists(updated);
    await storage.setObject('todoLists', updated);
  };

  const deleteTodoList = async (id: string) => {
    const updatedLists = todoLists.filter(l => l.id !== id);
    const updatedItems = todoItems.filter(i => i.listId !== id);
    setTodoLists(updatedLists);
    setTodoItems(updatedItems);
    await storage.setObject('todoLists', updatedLists);
    await storage.setObject('todoItems', updatedItems);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // MENTAL HEALTH ACTIONS
  // ─────────────────────────────────────────────────────────────────────────

  const addMoodEntry = async (entryData: Omit<MoodEntry, 'id'>) => {
    const newEntry: MoodEntry = { ...entryData, id: `mood-${Date.now()}` };
    const updated = [newEntry, ...moodEntries];
    setMoodEntries(updated);
    await storage.setObject('moodEntries', updated);
  };

  const deleteMoodEntry = async (id: string) => {
    const updated = moodEntries.filter(e => e.id !== id);
    setMoodEntries(updated);
    await storage.setObject('moodEntries', updated);
  };

  const addJournalEntry = async (entryData: Omit<JournalEntry, 'id' | 'createdAt'>) => {
    const newEntry: JournalEntry = {
      ...entryData,
      id: `journal-${Date.now()}`,
      createdAt: Date.now(),
    };
    const updated = [newEntry, ...journalEntries];
    setJournalEntries(updated);
    await storage.setObject('journalEntries', updated);
  };

  const deleteJournalEntry = async (id: string) => {
    const updated = journalEntries.filter(e => e.id !== id);
    setJournalEntries(updated);
    await storage.setObject('journalEntries', updated);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // DERIVED STATS FOR HOME SCREEN TILES
  // ─────────────────────────────────────────────────────────────────────────

  const now = new Date();
  const thisMonthTxns = transactions.filter(t => {
    const d = new Date(t.date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const thisMonthSpent = totals(thisMonthTxns).expenses;

  const latestMood = [...moodEntries].sort((a, b) => b.date - a.date)[0];

  const moodStreak = (() => {
    let count = 0;
    const d = new Date();
    while (true) {
      d.setHours(0, 0, 0, 0);
      const hasEntry = moodEntries.some(e => new Date(e.date).toDateString() === d.toDateString());
      if (!hasEntry) break;
      count++;
      d.setDate(d.getDate() - 1);
    }
    return count;
  })();

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#10b981" />
        <Text style={styles.loadingText}>Loading Essential Tracker...</Text>
      </View>
    );
  }

  // ── Home Screen ──────────────────────────────────────────────────────────
  if (activeScreen === 'home') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <HomeScreen
          onNavigate={screen => setActiveScreen(screen)}
          moneyStats={{ transactions: transactions.length, thisMonthSpent }}
          taskStats={{ total: tasks.length, done: tasks.filter(t => t.status === 'done').length }}
          todoStats={{ total: todoItems.length, completed: todoItems.filter(i => i.completed).length }}
          moodStats={{ streak: moodStreak, lastMood: latestMood?.mood ?? null }}
        />
      </SafeAreaView>
    );
  }

  // ── Task Tracker ─────────────────────────────────────────────────────────
  if (activeScreen === 'tasks') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <TaskTrackerScreen
          tasks={tasks}
          onAddTask={addTask}
          onUpdateTask={updateTask}
          onDeleteTask={deleteTask}
          onGoHome={() => setActiveScreen('home')}
        />
      </SafeAreaView>
    );
  }

  // ── To-Do ────────────────────────────────────────────────────────────────
  if (activeScreen === 'todo') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <TodoScreen
          todoItems={todoItems}
          todoLists={todoLists}
          onAddItem={addTodoItem}
          onToggleItem={toggleTodoItem}
          onDeleteItem={deleteTodoItem}
          onAddList={addTodoList}
          onDeleteList={deleteTodoList}
          onGoHome={() => setActiveScreen('home')}
        />
      </SafeAreaView>
    );
  }

  // ── Mental Health ─────────────────────────────────────────────────────────
  if (activeScreen === 'mental_health') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <MentalHealthScreen
          moodEntries={moodEntries}
          journalEntries={journalEntries}
          onAddMood={addMoodEntry}
          onAddJournal={addJournalEntry}
          onDeleteMood={deleteMoodEntry}
          onDeleteJournal={deleteJournalEntry}
          onGoHome={() => setActiveScreen('home')}
        />
      </SafeAreaView>
    );
  }

  // ── Money Tracker (existing 4-tab app) ───────────────────────────────────
  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Screen body */}
      <View style={styles.body}>
        {activeTab === 'dashboard' && (
          <DashboardTab
            transactions={transactions}
            config={config}
            onNavigateToTab={(tab) => setActiveTab(tab as any)}
          />
        )}
        {activeTab === 'history' && (
          <TransactionsTab
            transactions={transactions}
            onDeleteTransaction={deleteTransaction}
            onAddTransaction={addTransaction}
            onEditTransaction={editTransaction}
          />
        )}
        {activeTab === 'analytics' && (
          <AnalyticsTab
            transactions={transactions}
          />
        )}
        {activeTab === 'chat' && (
          <AgentChatTab
            messages={messages}
            transactions={transactions}
            onAddTransaction={addTransaction}
            onAddMessage={addMessage}
            pendingSms={pendingSms}
            isSyncing={isSyncing}
            onSyncSms={() => syncSmsInbox(false)}
            onLogSmsTransaction={logSmsTransaction}
            onDismissSmsTransaction={dismissSmsTransaction}
            bankSenders={bankSenders}
            onAddSender={addSender}
            onDeleteSender={deleteSender}
            autoLog={autoLog}
            onToggleAutoLog={toggleAutoLog}
            onResetSyncDates={resetSyncDates}
            onReanalyzeSms={reanalyzeSmsTransactions}
            syncWindowDays={syncWindowDays}
            onUpdateSyncWindowDays={updateSyncWindowDays}
            unapprovedTransactions={unapprovedTransactions}
            onApproveTransaction={approveTransaction}
            onEditTransaction={editTransaction}
            onDeleteTransaction={deleteTransaction}
          />
        )}
        {activeTab === 'wealth' && (
          <WealthTab
            config={config}
            debts={debts}
            subscriptions={subscriptions}
            onUpdateConfig={updateConfig}
            onAddDebt={addDebt}
            onDeleteDebt={deleteDebt}
            onAddSubscription={addSubscription}
            onDeleteSubscription={deleteSubscription}
          />
        )}
      </View>

      {/* Custom Bottom Tab Bar */}
      <View style={styles.tabBar}>
        {/* Back to Home button */}
        <TouchableOpacity
          style={styles.tabItemHome}
          onPress={() => setActiveScreen('home')}
        >
          <Text style={styles.tabIcon}>🏠</Text>
          <Text style={styles.tabLabelHome}>Home</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'dashboard' && styles.tabItemActive]}
          onPress={() => setActiveTab('dashboard')}
        >
          <Text style={styles.tabIcon}>📊</Text>
          <Text style={[styles.tabLabel, activeTab === 'dashboard' && styles.tabLabelActive]}>Overview</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'history' && styles.tabItemActive]}
          onPress={() => setActiveTab('history')}
        >
          <Text style={styles.tabIcon}>📜</Text>
          <Text style={[styles.tabLabel, activeTab === 'history' && styles.tabLabelActive]}>Ledger</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'analytics' && styles.tabItemActive]}
          onPress={() => setActiveTab('analytics')}
        >
          <Text style={styles.tabIcon}>📈</Text>
          <Text style={[styles.tabLabel, activeTab === 'analytics' && styles.tabLabelActive]}>Analytics</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'chat' && styles.tabItemActive]}
          onPress={() => setActiveTab('chat')}
        >
          <Text style={styles.tabIcon}>🤖</Text>
          <Text style={[styles.tabLabel, activeTab === 'chat' && styles.tabLabelActive]}>Agent</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'wealth' && styles.tabItemActive]}
          onPress={() => setActiveTab('wealth')}
        >
          <Text style={styles.tabIcon}>💎</Text>
          <Text style={[styles.tabLabel, activeTab === 'wealth' && styles.tabLabelActive]}>Wealth</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#09090b',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#09090b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#a1a1aa',
    fontSize: 14,
    marginTop: 16,
    fontWeight: '600',
  },
  body: {
    flex: 1,
  },
  tabBar: {
    height: 60,
    backgroundColor: '#16161a',
    borderTopWidth: 1,
    borderTopColor: '#27272a',
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  tabItemHome: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    borderTopWidth: 2,
    borderTopColor: '#6366f1',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  tabItemActive: {
    borderTopWidth: 2,
    borderTopColor: '#10b981',
  },
  tabIcon: {
    fontSize: 16,
    marginBottom: 2,
  },
  tabLabel: {
    color: '#71717a',
    fontSize: 9,
    fontWeight: '700',
  },
  tabLabelActive: {
    color: '#10b981',
  },
  tabLabelHome: {
    color: '#818cf8',
    fontSize: 9,
    fontWeight: '700',
  },
});

export default App;
