import React, { useState, useRef, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TextInput, 
  TouchableOpacity, 
  PermissionsAndroid, 
  Platform, 
  Alert,
  Switch
} from 'react-native';
import { Message, Transaction } from '../types';
import { parseSMS } from '../utils/smsParser';
import SmsModule from '../../modules/sms-module/src/SmsModule';
import { storage } from '../utils/storage';
const CATEGORIES = ['Food & Drinks', 'Shopping', 'Transport', 'Subscriptions', 'Utilities',
  'Health', 'Education', 'Investment', 'Savings', 'Rent', 'Cash Withdrawal', 'Income', 'Others'];
const CATEGORY_EMOJI: Record<string, string> = {
  'Food & Drinks': '🍔', 'Shopping': '🛍️', 'Transport': '🚗',
  'Subscriptions': '🎬', 'Utilities': '🔌', 'Health': '🏥',
  'Education': '📚', 'Investment': '📈', 'Savings': '🏦',
  'Rent': '🏠', 'Cash Withdrawal': '💵', 'Income': '💰', 'Others': '📦',
};
interface AgentChatTabProps {
  messages: Message[];
  transactions: Transaction[];
  onAddTransaction: (txn: Omit<Transaction, 'id'>) => void;
  onAddMessage: (msg: Omit<Message, 'id' | 'timestamp'>) => void;
  pendingSms: Array<{ address: string; body: string; date: number; parsed: any }>;
  isSyncing: boolean;
  onSyncSms: () => void;
  onLogSmsTransaction: (smsItem: any, index: number) => void;
  onDismissSmsTransaction: (index: number) => void;
  bankSenders: string[];
  onAddSender: (sender: string) => void;
  onDeleteSender: (sender: string) => void;
  autoLog: boolean;
  onToggleAutoLog: (value: boolean) => void;
  onResetSyncDates: () => void;
  syncWindowDays: number;
  onUpdateSyncWindowDays: (days: number) => void;
  unapprovedTransactions: Transaction[];
  onApproveTransaction: (id: string) => void;
  onEditTransaction: (id: string, updates: Partial<Transaction>) => void;
  onDeleteTransaction: (id: string) => void;
}

export default function AgentChatTab({ 
  messages, 
  transactions, 
  onAddTransaction, 
  onAddMessage,
  pendingSms,
  isSyncing,
  onSyncSms,
  onLogSmsTransaction,
  onDismissSmsTransaction,
  bankSenders,
  onAddSender,
  onDeleteSender,
  autoLog,
  onToggleAutoLog,
  onResetSyncDates,
  syncWindowDays,
  onUpdateSyncWindowDays,
  unapprovedTransactions,
  onApproveTransaction,
  onEditTransaction,
  onDeleteTransaction
}: AgentChatTabProps) {
  const [inputText, setInputText] = useState('');
  const scrollViewRef = useRef<ScrollView>(null);

  // Bank SMS Config States
  const [showConfig, setShowConfig] = useState<boolean>(false);
  const [newSender, setNewSender] = useState<string>('');

  // Helper functions for configuration
  const handleAddSender = () => {
    if (!newSender.trim()) return;
    const cleanSender = newSender.trim().toUpperCase();
    if (bankSenders.includes(cleanSender)) {
      Alert.alert('Duplicate Sender', 'This bank sender is already configured.');
      return;
    }
    onAddSender(cleanSender);
    setNewSender('');
  };

  const handleDeleteSender = (senderToDelete: string) => {
    onDeleteSender(senderToDelete);
  };

  const handleToggleAutoLog = (value: boolean) => {
    onToggleAutoLog(value);
  };

  // Sync SMS from Android device inbox
  const syncAndroidSms = () => {
    onSyncSms();
  };

  // Process and log pending transaction from SMS
  const logSmsTransaction = (smsItem: typeof pendingSms[0], index: number) => {
    onLogSmsTransaction(smsItem, index);
  };

  // Dismiss pending SMS transaction
  const dismissSmsTransaction = (index: number) => {
    onDismissSmsTransaction(index);
  };

  // Natural Language processing for cash & chat logging
  const handleSendMessage = () => {
    if (!inputText.trim()) return;

    const userText = inputText;
    setInputText('');

    // 1. Add user message
    onAddMessage({
      sender: 'user',
      text: userText
    });

    // Scroll to bottom
    setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);

    // 2. Parse text for cash transactions
    // Examples: "spent 12 for coffee", "spent $15 cash on movie", "earned 2500 salary"
    const lowerText = userText.toLowerCase();
    
    // Check if it looks like a logging command
    const isLogIntent = 
      lowerText.includes('spent') || 
      lowerText.includes('bought') || 
      lowerText.includes('paid') || 
      lowerText.includes('logged') || 
      lowerText.includes('received') || 
      lowerText.includes('earned');

    // Parse amounts: look for digits (optionally preceded by $)
    const amountMatch = userText.match(/(?:\$|rs\.?|inr)?\s*([0-9]+(?:\.[0-9]{1,2})?)/i);
    const amount = amountMatch ? parseFloat(amountMatch[1]) : 0;

    if (isLogIntent && amount > 0) {
      const type = (lowerText.includes('received') || lowerText.includes('earned')) ? 'credit' : 'debit';
      
      // Determine description
      let description = 'Cash Item';
      const descKeywords = ['for', 'on', 'at'];
      for (const keyword of descKeywords) {
        const index = lowerText.indexOf(' ' + keyword + ' ');
        if (index !== -1) {
          description = userText.substring(index + keyword.length + 2).trim();
          break;
        }
      }

      // Clean up description if it has category indicators
      if (description.endsWith('cash')) {
        description = description.replace(/cash$/i, '').trim();
      }

      // Determine category
      let category = 'Others';
      const descLower = description.toLowerCase();
      if (descLower.includes('coffee') || descLower.includes('food') || descLower.includes('lunch') || descLower.includes('dinner') || descLower.includes('tea') || descLower.includes('starbucks')) {
        category = 'Food & Drinks';
      } else if (descLower.includes('taxi') || descLower.includes('bus') || descLower.includes('uber') || descLower.includes('fuel')) {
        category = 'Transport';
      } else if (descLower.includes('movie') || descLower.includes('game') || descLower.includes('netflix') || descLower.includes('spotify')) {
        category = 'Subscriptions';
      } else if (descLower.includes('shirt') || descLower.includes('groceries') || descLower.includes('shoes') || descLower.includes('amazon')) {
        category = 'Shopping';
      } else if (descLower.includes('salary') || descLower.includes('allowance')) {
        category = 'Income';
      }

      // Log transaction
      onAddTransaction({
        amount,
        type,
        description,
        category,
        paymentMethod: 'Cash',
        date: Date.now()
      });

      // Agent response
      setTimeout(() => {
        onAddMessage({
          sender: 'agent',
          text: `💰 Expense Logged! I've recorded a Cash expense of Rs. ${amount.toFixed(2)} for "${description}" under "${category}". Your budget is updated!`
        });
        setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
      }, 800);

    } else {
      // General advice or helper responses
      let responseText = "I'm your WealthAgent! You can log daily cash expenses here like 'Spent Rs. 1500 for dinner' or click 'Sync SMS' to auto-import bank credit/debit alerts.";
      
      if (lowerText.includes('budget') || lowerText.includes('rich life')) {
        responseText = "Your Rich Life budget divides your income into Fixed Costs (50%), Investments (20%), Savings (10%), and Guilt-free spending (20%). Log your expenses to see where you stand!";
      } else if (lowerText.includes('rich') || lowerText.includes('invest')) {
        responseText = "To live a rich life financially, focus on automatic investing. Invest 10-20% of your paycheck into index funds every single month. Compound interest will do the rest!";
      } else if (lowerText.includes('sms') || lowerText.includes('bank')) {
        responseText = "Tap the 'Sync Bank SMS Alerts' button at the top to let me automatically scan your text messages for debit/credit alerts from Chase, HDFC, PayPal, and more.";
      }

      setTimeout(() => {
        onAddMessage({
          sender: 'agent',
          text: responseText
        });
        setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
      }, 800);
    }
  };

  return (
    <View style={styles.container}>
      {/* SMS Actions Panel */}
      <View style={styles.syncCard}>
        <View style={styles.syncHeader}>
          <Text style={styles.syncTitle}>Direct SMS Integration</Text>
          <View style={styles.syncHeaderButtons}>
            <TouchableOpacity 
              style={styles.btnConfigToggle} 
              onPress={() => setShowConfig(!showConfig)}
            >
              <Text style={styles.btnConfigToggleText}>{showConfig ? '⚙️ Hide Config' : '⚙️ Configure'}</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.btnSync, isSyncing && styles.btnSyncDisabled]} 
              onPress={syncAndroidSms}
              disabled={isSyncing}
            >
              <Text style={styles.btnSyncText}>{isSyncing ? 'Syncing...' : 'Sync Bank SMS'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Collapsible Config Section */}
        {showConfig && (
          <View style={styles.configContainer}>
            <View style={styles.configRow}>
              <View style={styles.configInfo}>
                <Text style={styles.configLabel}>Auto-log bank transactions</Text>
                <Text style={styles.configDescription}>Immediately log matched alerts directly to ledger</Text>
              </View>
              <Switch 
                value={autoLog} 
                onValueChange={handleToggleAutoLog}
                trackColor={{ false: '#27272a', true: '#059669' }}
                thumbColor={autoLog ? '#10b981' : '#a1a1aa'}
              />
            </View>

            <View style={styles.separator} />

            <View style={styles.configRow}>
              <View style={styles.configInfo}>
                <Text style={styles.configLabel}>History Scan Depth</Text>
                <Text style={styles.configDescription}>How far back in time to scan for bank messages</Text>
              </View>
              <View style={styles.scanDepthOptions}>
                {[
                  { label: '30d', value: 30 },
                  { label: '90d', value: 90 },
                  { label: '180d', value: 180 },
                  { label: '1 yr', value: 365 },
                  { label: '2 yr', value: 730 },
                ].map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.depthPill,
                      syncWindowDays === opt.value && styles.depthPillActive,
                    ]}
                    onPress={() => onUpdateSyncWindowDays(opt.value)}
                  >
                    <Text
                      style={[
                        styles.depthPillText,
                        syncWindowDays === opt.value && styles.depthPillTextActive,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.separator} />

            <View style={styles.configRow}>
              <View style={styles.configInfo}>
                <Text style={styles.configLabel}>Reset Sync Checkpoints</Text>
                <Text style={styles.configDescription}>{`Scan past ${syncWindowDays} days by clearing last-synced dates`}</Text>
              </View>
              <TouchableOpacity style={styles.btnResetSync} onPress={onResetSyncDates}>
                <Text style={styles.btnResetSyncText}>Reset</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.separator} />

            <View style={styles.sendersSection}>
              <Text style={styles.sendersTitle}>Monitored Bank Senders</Text>
              <Text style={styles.configDescription}>Matches incoming SMS headers or sender numbers</Text>
              
              <View style={styles.sendersList}>
                {bankSenders.map(sender => (
                  <View key={sender} style={styles.senderPill}>
                    <Text style={styles.senderPillText}>{sender}</Text>
                    <TouchableOpacity onPress={() => handleDeleteSender(sender)} style={styles.btnDeleteSender}>
                      <Text style={styles.btnDeleteSenderText}>×</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>

              <View style={styles.addSenderRow}>
                <TextInput
                  style={styles.addSenderInput}
                  placeholder="e.g. AMEX, HDFC-BANK, +18005551212"
                  placeholderTextColor="#71717a"
                  value={newSender}
                  onChangeText={setNewSender}
                  autoCapitalize="characters"
                />
                <TouchableOpacity style={styles.btnAddSender} onPress={handleAddSender}>
                  <Text style={styles.btnAddSenderText}>Add</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

      </View>

      {/* Transaction Review/Approval Queue */}
      {unapprovedTransactions && unapprovedTransactions.length > 0 && (
        <View style={styles.reviewContainer}>
          <Text style={styles.reviewTitle}>🔔 Verify Recent Auto-Logged Transactions ({unapprovedTransactions.length})</Text>
          <Text style={styles.reviewSubtitle}>
            Check amount and category pills, then tap Approve:
          </Text>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false} 
            nestedScrollEnabled={true}
            style={styles.reviewScroll}
            contentContainerStyle={styles.reviewScrollContent}
          >
            {unapprovedTransactions.map(txn => (
              <View key={txn.id} style={styles.reviewItem}>
                <View style={styles.reviewItemHeader}>
                  <Text style={styles.reviewItemDate}>
                    {new Date(txn.date).toLocaleDateString()}
                  </Text>
                  <Text style={styles.reviewItemSender} numberOfLines={1}>
                    {txn.smsSender ? `From: ${txn.smsSender}` : 'Direct Entry'}
                  </Text>
                </View>

                <Text style={styles.reviewItemDesc} numberOfLines={1}>
                  {txn.description}
                </Text>

                {/* Amount editing */}
                <View style={styles.reviewInputRow}>
                  <Text style={styles.reviewInputLabel}>Amount (Rs):</Text>
                  <TextInput
                    style={styles.reviewAmountInput}
                    defaultValue={txn.amount.toString()}
                    keyboardType="numeric"
                    placeholder="0.00"
                    placeholderTextColor="#52525b"
                    onEndEditing={(e) => {
                      const val = parseFloat(e.nativeEvent.text);
                      if (!isNaN(val) && val > 0) {
                        onEditTransaction(txn.id, { amount: val });
                      }
                    }}
                  />
                </View>

                {/* Category selector */}
                <Text style={styles.reviewInputLabel}>Category:</Text>
                <View style={styles.inlineCategoryWrapper}>
                  {CATEGORIES.map(cat => (
                    <TouchableOpacity
                      key={cat}
                      style={[
                        styles.inlineCatPill,
                        txn.category === cat && styles.inlineCatPillActive
                      ]}
                      onPress={() => onEditTransaction(txn.id, { category: cat })}
                    >
                      <Text style={[
                        styles.inlineCatPillText,
                        txn.category === cat && styles.inlineCatPillTextActive
                      ]}>
                        {CATEGORY_EMOJI[cat] ?? '📦'} {cat}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={styles.reviewItemActions}>
                  <TouchableOpacity 
                    style={styles.btnApproveTxn} 
                    onPress={() => onApproveTransaction(txn.id)}
                  >
                    <Text style={styles.btnApproveTxnText}>✅ Approve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.btnDeleteTxn} 
                    onPress={() => {
                      Alert.alert('Delete', 'Delete this transaction entirely?', [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Delete', style: 'destructive', onPress: () => onDeleteTransaction(txn.id) }
                      ]);
                    }}
                  >
                    <Text style={styles.btnDeleteTxnText}>🗑️ Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Pending Unlogged SMS Box */}
      {pendingSms.length > 0 && (
        <View style={styles.pendingContainer}>
          <Text style={styles.pendingTitle}>📥 Newly Intercepted Bank Alerts ({pendingSms.length})</Text>
          <ScrollView style={styles.pendingScroll}>
            {pendingSms.map((item, idx) => (
              <View key={idx} style={styles.pendingItem}>
                <View style={styles.pendingInfo}>
                  <Text style={styles.pendingSender}>From: {item.address}</Text>
                  <Text style={styles.pendingBody}>{item.body}</Text>
                  <View style={styles.parsedDetails}>
                    <Text style={styles.parsedText}>
                      Detected: <Text style={styles.parsedBold}>Rs. {item.parsed.amount.toFixed(2)}</Text> ({item.parsed.type}) at <Text style={styles.parsedBold}>{item.parsed.description}</Text>
                    </Text>
                  </View>
                </View>
                <View style={styles.pendingActions}>
                  <TouchableOpacity style={styles.btnLogSms} onPress={() => logSmsTransaction(item, idx)}>
                    <Text style={styles.btnLogSmsText}>Log</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.btnDismissSms} onPress={() => dismissSmsTransaction(idx)}>
                    <Text style={styles.btnDismissSmsText}>✖</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Main Conversation Log */}
      <ScrollView 
        ref={scrollViewRef}
        style={styles.chatScroll}
        contentContainerStyle={styles.chatContent}
        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.map(msg => (
          <View key={msg.id} style={[
            styles.bubbleContainer,
            msg.sender === 'user' ? styles.bubbleRight : styles.bubbleLeft
          ]}>
            <View style={[
              styles.bubble,
              msg.sender === 'user' ? styles.bubbleUser : styles.bubbleAgent
            ]}>
              <Text style={styles.bubbleText}>{msg.text}</Text>
              <Text style={styles.bubbleTime}>
                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Input Message Area */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Log cash: 'Spent 12 on pizza' or ask advice..."
          placeholderTextColor="#71717a"
          value={inputText}
          onChangeText={setInputText}
          onSubmitEditing={handleSendMessage}
        />
        <TouchableOpacity style={styles.btnSend} onPress={handleSendMessage}>
          <Text style={styles.btnSendText}>Log</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090b',
  },
  syncCard: {
    backgroundColor: '#16161a',
    borderBottomWidth: 1,
    borderBottomColor: '#27272a',
    padding: 16,
  },
  syncHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  syncTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  btnSync: {
    backgroundColor: '#10b981',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  btnSyncDisabled: {
    backgroundColor: '#064e3b',
  },
  btnSyncText: {
    color: '#09090b',
    fontWeight: '700',
    fontSize: 12,
  },
  syncHeaderButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  btnConfigToggle: {
    backgroundColor: '#27272a',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#3f3f46',
  },
  btnConfigToggleText: {
    color: '#e4e4e7',
    fontWeight: '600',
    fontSize: 12,
  },
  configContainer: {
    backgroundColor: '#18181b',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#27272a',
    padding: 14,
    marginBottom: 14,
  },
  configRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  configInfo: {
    flex: 1,
    paddingRight: 8,
  },
  configLabel: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  configDescription: {
    color: '#71717a',
    fontSize: 11,
    marginTop: 2,
  },
  separator: {
    height: 1,
    backgroundColor: '#27272a',
    marginVertical: 12,
  },
  sendersSection: {
    marginTop: 2,
  },
  sendersTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  sendersList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 10,
    marginBottom: 10,
  },
  senderPill: {
    backgroundColor: '#27272a',
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 10,
    paddingRight: 6,
    paddingVertical: 4,
    marginRight: 6,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#3f3f46',
  },
  senderPillText: {
    color: '#e4e4e7',
    fontSize: 11,
    fontWeight: '600',
  },
  btnDeleteSender: {
    marginLeft: 6,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#3f3f46',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDeleteSenderText: {
    color: '#ef4444',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 12,
  },
  addSenderRow: {
    flexDirection: 'row',
    marginTop: 6,
  },
  addSenderInput: {
    flex: 1,
    backgroundColor: '#09090b',
    borderWidth: 1,
    borderColor: '#27272a',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    color: '#ffffff',
    fontSize: 12,
    marginRight: 8,
  },
  btnAddSender: {
    backgroundColor: '#10b981',
    borderRadius: 8,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  btnAddSenderText: {
    color: '#09090b',
    fontWeight: '700',
    fontSize: 12,
  },
  sandboxLabel: {
    color: '#71717a',
    fontSize: 9,
    fontWeight: '700',
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  sandboxScroll: {
    flexDirection: 'row',
  },
  btnSandbox: {
    backgroundColor: '#27272a',
    borderRadius: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#3f3f46',
  },
  btnSandboxText: {
    color: '#e4e4e7',
    fontSize: 10,
    fontWeight: '600',
  },
  pendingContainer: {
    backgroundColor: '#1e1b4b',
    borderBottomWidth: 1,
    borderBottomColor: '#312e81',
    padding: 12,
  },
  pendingTitle: {
    color: '#c084fc',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
  },
  pendingScroll: {
    maxHeight: 180,
  },
  pendingItem: {
    backgroundColor: '#17153b',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#4c1d95',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pendingInfo: {
    width: '78%',
  },
  pendingSender: {
    color: '#a78bfa',
    fontSize: 11,
    fontWeight: '700',
  },
  pendingBody: {
    color: '#d8b4fe',
    fontSize: 11,
    marginVertical: 3,
  },
  parsedDetails: {
    backgroundColor: '#2e1065',
    padding: 4,
    borderRadius: 4,
    marginTop: 3,
  },
  parsedText: {
    color: '#f3e8ff',
    fontSize: 10,
  },
  parsedBold: {
    fontWeight: '700',
    color: '#e9d5ff',
  },
  pendingActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  btnLogSms: {
    backgroundColor: '#a78bfa',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginRight: 6,
  },
  btnLogSmsText: {
    color: '#09090b',
    fontSize: 11,
    fontWeight: '700',
  },
  btnDismissSms: {
    padding: 6,
  },
  btnDismissSmsText: {
    color: '#ef4444',
    fontSize: 12,
  },
  chatScroll: {
    flex: 1,
  },
  chatContent: {
    padding: 16,
    paddingBottom: 24,
  },
  bubbleContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    width: '100%',
  },
  bubbleRight: {
    justifyContent: 'flex-end',
  },
  bubbleLeft: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '80%',
    borderRadius: 16,
    padding: 12,
  },
  bubbleUser: {
    backgroundColor: '#3b82f6',
    borderTopRightRadius: 2,
  },
  bubbleAgent: {
    backgroundColor: '#16161a',
    borderWidth: 1,
    borderColor: '#27272a',
    borderTopLeftRadius: 2,
  },
  bubbleText: {
    color: '#ffffff',
    fontSize: 14,
    lineHeight: 20,
  },
  bubbleTime: {
    color: '#a1a1aa',
    fontSize: 9,
    alignSelf: 'flex-end',
    marginTop: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    backgroundColor: '#16161a',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#27272a',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: '#09090b',
    borderWidth: 1,
    borderColor: '#27272a',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 8,
    color: '#ffffff',
    fontSize: 13,
    marginRight: 10,
  },
  btnSend: {
    backgroundColor: '#06b6d4',
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  btnSendText: {
    color: '#09090b',
    fontWeight: '700',
    fontSize: 13,
  },
  btnResetSync: {
    backgroundColor: '#ef4444',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  btnResetSyncText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 11,
  },
  scanDepthOptions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  depthPill: {
    backgroundColor: '#27272a',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginLeft: 4,
    borderWidth: 1,
    borderColor: '#3f3f46',
  },
  depthPillActive: {
    backgroundColor: '#059669',
    borderColor: '#10b981',
  },
  depthPillText: {
    color: '#a1a1aa',
    fontSize: 10,
    fontWeight: '600',
  },
  depthPillTextActive: {
    color: '#ffffff',
  },
  reviewContainer: {
    backgroundColor: '#1c1917',
    borderWidth: 1,
    borderColor: '#78350f',
    borderRadius: 16,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  reviewTitle: {
    color: '#f59e0b',
    fontSize: 13,
    fontWeight: '800',
  },
  reviewSubtitle: {
    color: '#d97706',
    fontSize: 11,
    marginTop: 4,
    marginBottom: 12,
  },
  reviewScroll: {
    flexDirection: 'row',
  },
  reviewScrollContent: {
    gap: 12,
  },
  reviewItem: {
    backgroundColor: '#292524',
    borderWidth: 1,
    borderColor: '#44403c',
    borderRadius: 12,
    padding: 12,
    width: 290,
  },
  reviewItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  reviewItemDate: {
    color: '#a8a29e',
    fontSize: 10,
    fontWeight: '600',
  },
  reviewItemSender: {
    color: '#78716c',
    fontSize: 9,
    maxWidth: 140,
  },
  reviewItemDesc: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 10,
  },
  reviewInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  reviewInputLabel: {
    color: '#a8a29e',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  reviewAmountInput: {
    backgroundColor: '#1c1917',
    borderWidth: 1,
    borderColor: '#44403c',
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 8,
    color: '#ffffff',
    fontSize: 12,
    width: 80,
    marginLeft: 6,
  },
  inlineCategoryWrapper: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
    marginTop: 2,
  },
  inlineCatPill: {
    backgroundColor: '#1c1917',
    borderWidth: 1,
    borderColor: '#44403c',
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  inlineCatPillActive: {
    backgroundColor: '#d97706',
    borderColor: '#f59e0b',
  },
  inlineCatPillText: {
    color: '#a8a29e',
    fontSize: 10,
    fontWeight: '600',
  },
  inlineCatPillTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  reviewItemActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 4,
  },
  btnApproveTxn: {
    flex: 1.3,
    backgroundColor: '#10b981',
    borderRadius: 6,
    paddingVertical: 6,
    alignItems: 'center',
  },
  btnApproveTxnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  btnDeleteTxn: {
    flex: 1,
    backgroundColor: '#ef4444',
    borderRadius: 6,
    paddingVertical: 6,
    alignItems: 'center',
  },
  btnDeleteTxnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
});
