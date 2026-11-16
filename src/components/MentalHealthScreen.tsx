import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { MoodEntry, MoodScore, JournalEntry } from '../types';
import { activityMoodInsights, averageMood, moodStreak } from '../utils/trackers';

interface MentalHealthScreenProps {
  moodEntries: MoodEntry[];
  journalEntries: JournalEntry[];
  onAddMood: (entry: Omit<MoodEntry, 'id'>) => void;
  onAddJournal: (entry: Omit<JournalEntry, 'id' | 'createdAt'>) => void;
  onUpdateJournal: (id: string, updates: Partial<JournalEntry>) => void;
  onDeleteMood: (id: string) => void;
  onDeleteJournal: (id: string) => void;
  onGoHome: () => void;
}

const MOOD_CONFIG: Record<MoodScore, { emoji: string; label: string; color: string }> = {
  1: { emoji: '😫', label: 'Rough',   color: '#f43f5e' },
  2: { emoji: '😟', label: 'Low',     color: '#f97316' },
  3: { emoji: '😐', label: 'Okay',    color: '#f59e0b' },
  4: { emoji: '😊', label: 'Good',    color: '#10b981' },
  5: { emoji: '🤩', label: 'Great',   color: '#a855f7' },
};

const ACTIVITIES = [
  '🏃 Exercise', '🧘 Meditation', '👫 Social', '📚 Reading',
  '🎮 Gaming', '🎨 Creative', '😴 Rest', '🌿 Nature',
  '🍎 Healthy Eating', '💧 Hydrated', '🎵 Music', '🙏 Grateful',
];

const MOOD_SCORES: MoodScore[] = [1, 2, 3, 4, 5];

type TabKey = 'log' | 'history' | 'journal';

function MoodLogModal({
  visible,
  onClose,
  onAdd,
}: {
  visible: boolean;
  onClose: () => void;
  onAdd: (entry: Omit<MoodEntry, 'id'>) => void;
}) {
  const [mood, setMood] = useState<MoodScore>(3);
  const [note, setNote] = useState('');
  const [activities, setActivities] = useState<string[]>([]);

  const toggleActivity = (a: string) => {
    setActivities(prev =>
      prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a],
    );
  };

  const close = () => {
    setMood(3);
    setNote('');
    setActivities([]);
    onClose();
  };

  const handleAdd = () => {
    onAdd({ mood, note: note.trim(), activities, date: Date.now() });
    close();
  };

  const cfg = MOOD_CONFIG[mood];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView style={styles.modalSheet} contentContainerStyle={styles.modalSheetContent} keyboardShouldPersistTaps="handled">
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>How are you feeling?</Text>

          {/* Mood selector */}
          <View style={styles.moodSelector}>
            {MOOD_SCORES.map(s => {
              const mc = MOOD_CONFIG[s];
              const isSelected = mood === s;
              return (
                <TouchableOpacity
                  key={s}
                  style={[
                    styles.moodOption,
                    isSelected && { backgroundColor: mc.color + '25', borderColor: mc.color },
                  ]}
                  onPress={() => setMood(s)}
                >
                  <Text style={styles.moodOptionEmoji}>{mc.emoji}</Text>
                  <Text style={[styles.moodOptionLabel, isSelected && { color: mc.color }]}>
                    {mc.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Selected mood display */}
          <View style={[styles.moodSelectedBanner, { backgroundColor: cfg.color + '15', borderColor: cfg.color + '40' }]}>
            <Text style={styles.moodSelectedEmoji}>{cfg.emoji}</Text>
            <Text style={[styles.moodSelectedLabel, { color: cfg.color }]}>
              Feeling {cfg.label.toLowerCase()} today
            </Text>
          </View>

          {/* Activities */}
          <Text style={styles.sectionLabel}>What did you do today?</Text>
          <View style={styles.activitiesGrid}>
            {ACTIVITIES.map(a => {
              const active = activities.includes(a);
              return (
                <TouchableOpacity
                  key={a}
                  style={[styles.activityChip, active && styles.activityChipActive]}
                  onPress={() => toggleActivity(a)}
                >
                  <Text style={[styles.activityChipText, active && styles.activityChipTextActive]}>
                    {a}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Note */}
          <Text style={styles.sectionLabel}>Add a note (optional)</Text>
          <TextInput
            style={styles.noteInput}
            placeholder="What's on your mind?"
            placeholderTextColor="#52525b"
            value={note}
            onChangeText={setNote}
            multiline
            numberOfLines={3}
          />

          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.btnCancel} onPress={close}>
              <Text style={styles.btnCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btnAdd, { backgroundColor: cfg.color }]}
              onPress={handleAdd}
            >
              <Text style={styles.btnAddText}>Log Mood</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function JournalModal({
  visible,
  entry,
  onClose,
  onSave,
  onDelete,
}: {
  visible: boolean;
  /** When set, the modal opens this entry for reading / editing. */
  entry: JournalEntry | null;
  onClose: () => void;
  onSave: (entry: Omit<JournalEntry, 'id' | 'createdAt'>) => void;
  onDelete: (id: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [mood, setMood] = useState<MoodScore>(3);

  useEffect(() => {
    if (!visible) return;
    setTitle(entry?.title ?? '');
    setContent(entry?.content ?? '');
    setMood(entry?.mood ?? 3);
  }, [visible, entry]);

  const handleSave = () => {
    if (!title.trim() && !content.trim()) {
      Alert.alert('Empty Entry', 'Please write something.');
      return;
    }
    onSave({ title: title.trim(), content: content.trim(), mood });
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView style={styles.modalSheet} contentContainerStyle={styles.modalSheetContent} keyboardShouldPersistTaps="handled">
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>{entry ? 'Journal Entry' : 'New Journal Entry'}</Text>
          {entry && (
            <Text style={styles.journalDate}>
              {new Date(entry.createdAt).toLocaleString('en', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </Text>
          )}

          <Text style={styles.sectionLabel}>How are you feeling?</Text>
          <View style={styles.moodMiniRow}>
            {MOOD_SCORES.map(s => {
              const mc = MOOD_CONFIG[s];
              return (
                <TouchableOpacity
                  key={s}
                  style={[styles.moodMiniBtn, mood === s && { backgroundColor: mc.color + '25', borderColor: mc.color }]}
                  onPress={() => setMood(s)}
                >
                  <Text style={styles.moodMiniEmoji}>{mc.emoji}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.sectionLabel}>Title</Text>
          <TextInput
            style={styles.input}
            placeholder="What's this entry about?"
            placeholderTextColor="#52525b"
            value={title}
            onChangeText={setTitle}
          />

          <Text style={styles.sectionLabel}>Write freely...</Text>
          <TextInput
            style={[styles.input, styles.journalInput]}
            placeholder="How was your day? What are you grateful for?"
            placeholderTextColor="#52525b"
            value={content}
            onChangeText={setContent}
            multiline
          />

          <View style={styles.modalActions}>
            {entry ? (
              <TouchableOpacity style={styles.btnCancel} onPress={() => onDelete(entry.id)}>
                <Text style={[styles.btnCancelText, styles.colorDanger]}>Delete</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.btnCancel} onPress={onClose}>
                <Text style={styles.btnCancelText}>Cancel</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.btnAdd, { backgroundColor: '#a855f7' }]}
              onPress={handleSave}
            >
              <Text style={styles.btnAddText}>{entry ? 'Save Changes' : 'Save Entry'}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// 7-day mini bar chart
function MoodChart({ entries }: { entries: MoodEntry[] }) {
  const days: { label: string; mood: MoodScore | null; date: Date }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    const dayEntries = entries.filter(e => {
      const ed = new Date(e.date);
      return ed.getDate() === d.getDate() && ed.getMonth() === d.getMonth() && ed.getFullYear() === d.getFullYear();
    });
    const latest = dayEntries.sort((a, b) => b.date - a.date)[0];
    days.push({ label: d.toLocaleDateString('en', { weekday: 'short' }).slice(0, 2), mood: latest?.mood ?? null, date: d });
  }

  const barMaxH = 56;

  return (
    <View style={styles.chartContainer}>
      <Text style={styles.chartTitle}>7-Day Mood</Text>
      <View style={styles.chartBars}>
        {days.map((day, idx) => {
          const cfg = day.mood ? MOOD_CONFIG[day.mood] : null;
          const barH = day.mood ? (day.mood / 5) * barMaxH : 4;
          const isToday = idx === 6;
          return (
            <View key={idx} style={styles.chartBarCol}>
              <View style={styles.chartBarWrapper}>
                <View
                  style={[
                    styles.chartBar,
                    { height: barH, backgroundColor: cfg ? cfg.color : '#27272a' },
                  ]}
                />
              </View>
              {day.mood ? <Text style={styles.chartEmoji}>{cfg?.emoji}</Text> : null}
              <Text style={[styles.chartLabel, isToday && styles.chartLabelToday]}>{day.label}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export default function MentalHealthScreen({
  moodEntries,
  journalEntries,
  onAddMood,
  onAddJournal,
  onUpdateJournal,
  onDeleteMood,
  onDeleteJournal,
  onGoHome,
}: MentalHealthScreenProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('log');
  const [showMoodModal, setShowMoodModal] = useState(false);
  const [showJournalModal, setShowJournalModal] = useState(false);
  const [openJournal, setOpenJournal] = useState<JournalEntry | null>(null);

  const sortedMoods = useMemo(() => [...moodEntries].sort((a, b) => b.date - a.date), [moodEntries]);
  const streak = moodStreak(moodEntries);
  const latestMood = sortedMoods[0];
  const loggedToday = !!latestMood && new Date(latestMood.date).toDateString() === new Date().toDateString();

  const weekEntries = moodEntries.filter(e => Date.now() - e.date < 7 * 24 * 60 * 60 * 1000);
  const avgMood = averageMood(weekEntries);
  const monthEntries = useMemo(
    () => moodEntries.filter(e => Date.now() - e.date < 30 * 24 * 60 * 60 * 1000),
    [moodEntries],
  );
  const insights = useMemo(() => activityMoodInsights(monthEntries), [monthEntries]);
  const avgMonth = monthEntries.length > 0 ? monthEntries.reduce((s, e) => s + e.mood, 0) / monthEntries.length : null;

  const confirmDeleteMood = (id: string) => {
    Alert.alert('Delete Mood Log', 'Remove this mood entry?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => onDeleteMood(id) },
    ]);
  };

  const confirmDeleteJournal = (id: string) => {
    Alert.alert('Delete Journal Entry', 'This entry will be permanently removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          onDeleteJournal(id);
          setShowJournalModal(false);
        },
      },
    ]);
  };

  const openNewJournal = () => { setOpenJournal(null); setShowJournalModal(true); };
  const openExistingJournal = (entry: JournalEntry) => { setOpenJournal(entry); setShowJournalModal(true); };

  const TABS: { key: TabKey; label: string }[] = [
    { key: 'log',     label: '📊 Overview' },
    { key: 'history', label: '📅 History' },
    { key: 'journal', label: '📝 Journal' },
  ];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onGoHome}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.headerSub}>Essential Tracker</Text>
          <Text style={styles.headerTitle}>Mental Health</Text>
        </View>
        <TouchableOpacity style={styles.logMoodBtn} onPress={() => setShowMoodModal(true)}>
          <Text style={styles.logMoodBtnText}>Log Mood</Text>
        </TouchableOpacity>
      </View>

      {/* Sub-tabs */}
      <View style={styles.tabBar}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Overview Tab */}
      {activeTab === 'log' && (
        <ScrollView style={styles.content} contentContainerStyle={styles.contentPad} showsVerticalScrollIndicator={false}>
          {/* Stats Row */}
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statEmoji}>🔥</Text>
              <Text style={styles.statValue}>{streak}</Text>
              <Text style={styles.statLabel}>Day Streak</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statEmoji}>{latestMood ? MOOD_CONFIG[latestMood.mood].emoji : '–'}</Text>
              <Text style={[styles.statValue, latestMood && { color: MOOD_CONFIG[latestMood.mood].color }]}>
                {latestMood ? MOOD_CONFIG[latestMood.mood].label : '–'}
              </Text>
              <Text style={styles.statLabel}>Last Log</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statEmoji}>{avgMood ? MOOD_CONFIG[avgMood].emoji : '–'}</Text>
              <Text style={[styles.statValue, avgMood && { color: MOOD_CONFIG[avgMood].color }]}>
                {avgMood ? MOOD_CONFIG[avgMood].label : '–'}
              </Text>
              <Text style={styles.statLabel}>Avg (7d)</Text>
            </View>
          </View>

          {/* 7-day chart */}
          <MoodChart entries={moodEntries} />

          {/* Log Mood CTA */}
          {moodEntries.length === 0 && (
            <TouchableOpacity style={styles.ctaCard} onPress={() => setShowMoodModal(true)}>
              <Text style={styles.ctaEmoji}>🧠</Text>
              <Text style={styles.ctaTitle}>Log your first mood</Text>
              <Text style={styles.ctaSubtitle}>Takes only 10 seconds. Build your streak!</Text>
            </TouchableOpacity>
          )}

          {/* Today's log check */}
          {moodEntries.length > 0 && !loggedToday && (
            <TouchableOpacity style={styles.todayPrompt} onPress={() => setShowMoodModal(true)}>
              <Text style={styles.todayPromptText}>
                👋 Haven't logged today yet — {streak > 0 ? `check in to keep your ${streak}-day streak!` : 'tap to check in!'}
              </Text>
            </TouchableOpacity>
          )}

          {/* What lifts your mood */}
          {insights.length > 0 && avgMonth !== null && (
            <View style={styles.chartContainer}>
              <Text style={styles.chartTitle}>What lifts your mood (30d)</Text>
              {insights.slice(0, 5).map(i => {
                const diff = i.avg - avgMonth;
                const rounded = Math.min(5, Math.max(1, Math.round(i.avg))) as MoodScore;
                return (
                  <View key={i.activity} style={styles.insightRow}>
                    <Text style={styles.insightActivity}>{i.activity}</Text>
                    <Text style={styles.insightCount}>{i.count}×</Text>
                    <Text style={styles.insightMood}>{MOOD_CONFIG[rounded].emoji} {i.avg.toFixed(1)}</Text>
                    <Text style={[styles.insightDiff, { color: diff >= 0 ? '#10b981' : '#f43f5e' }]}>
                      {diff >= 0 ? '+' : ''}{diff.toFixed(1)}
                    </Text>
                  </View>
                );
              })}
              <Text style={styles.insightFoot}>Average mood on days with each activity vs your 30-day average ({avgMonth.toFixed(1)}).</Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <ScrollView style={styles.content} contentContainerStyle={styles.contentPad} showsVerticalScrollIndicator={false}>
          {moodEntries.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>📅</Text>
              <Text style={styles.emptyTitle}>No mood logs yet</Text>
              <Text style={styles.emptySubtitle}>Start logging your mood to see history here</Text>
            </View>
          ) : (
            sortedMoods.map(entry => {
                const mc = MOOD_CONFIG[entry.mood];
                return (
                  <View key={entry.id} style={styles.historyCard}>
                    <View style={[styles.historyAccent, { backgroundColor: mc.color }]} />
                    <View style={styles.historyBody}>
                      <View style={styles.historyHeader}>
                        <Text style={styles.historyEmoji}>{mc.emoji}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.historyMood, { color: mc.color }]}>{mc.label}</Text>
                          <Text style={styles.historyDate}>{new Date(entry.date).toLocaleString('en', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</Text>
                        </View>
                        <TouchableOpacity onPress={() => confirmDeleteMood(entry.id)} hitSlop={8}>
                          <Text style={styles.deleteIcon}>✕</Text>
                        </TouchableOpacity>
                      </View>
                      {entry.activities.length > 0 && (
                        <View style={styles.activityTagsRow}>
                          {entry.activities.map(a => (
                            <View key={a} style={styles.activityTag}>
                              <Text style={styles.activityTagText}>{a}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                      {!!entry.note && <Text style={styles.historyNote}>{entry.note}</Text>}
                    </View>
                  </View>
                );
              })
          )}
        </ScrollView>
      )}

      {/* Journal Tab */}
      {activeTab === 'journal' && (
        <ScrollView style={styles.content} contentContainerStyle={styles.contentPad} showsVerticalScrollIndicator={false}>
          <TouchableOpacity style={styles.newJournalBtn} onPress={openNewJournal}>
            <Text style={styles.newJournalBtnText}>+ New Journal Entry</Text>
          </TouchableOpacity>

          {journalEntries.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>📝</Text>
              <Text style={styles.emptyTitle}>No journal entries</Text>
              <Text style={styles.emptySubtitle}>Write freely about your thoughts and feelings</Text>
            </View>
          ) : (
            [...journalEntries]
              .sort((a, b) => b.createdAt - a.createdAt)
              .map(entry => {
                const mc = MOOD_CONFIG[entry.mood];
                return (
                  <TouchableOpacity key={entry.id} style={styles.journalCard} onPress={() => openExistingJournal(entry)} activeOpacity={0.8}>
                    <View style={styles.journalCardHeader}>
                      <Text style={styles.journalEmoji}>{mc.emoji}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.journalTitle} numberOfLines={1}>{entry.title || 'Untitled'}</Text>
                        <Text style={styles.journalDate}>{new Date(entry.createdAt).toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })}</Text>
                      </View>
                      <TouchableOpacity onPress={() => confirmDeleteJournal(entry.id)} hitSlop={8}>
                        <Text style={styles.deleteIcon}>✕</Text>
                      </TouchableOpacity>
                    </View>
                    {!!entry.content && (
                      <Text style={styles.journalContent} numberOfLines={3}>{entry.content}</Text>
                    )}
                  </TouchableOpacity>
                );
              })
          )}
        </ScrollView>
      )}

      <MoodLogModal
        visible={showMoodModal}
        onClose={() => setShowMoodModal(false)}
        onAdd={onAddMood}
      />
      <JournalModal
        visible={showJournalModal}
        entry={openJournal}
        onClose={() => setShowJournalModal(false)}
        onSave={draft => (openJournal ? onUpdateJournal(openJournal.id, draft) : onAddJournal(draft))}
        onDelete={confirmDeleteJournal}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#09090b' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1f1f23',
  },
  backBtn: {
    width: 36,
    height: 36,
    backgroundColor: '#1f1f23',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  backIcon: { color: '#ffffff', fontSize: 18, fontWeight: '700' },
  headerText: { flex: 1 },
  headerSub: { color: '#a855f7', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  headerTitle: { color: '#ffffff', fontSize: 20, fontWeight: '800' },
  logMoodBtn: {
    backgroundColor: '#a855f7',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  logMoodBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 13 },

  // Sub-tabs
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#1f1f23',
  },
  tab: {
    flex: 1,
    paddingVertical: 11,
    alignItems: 'center',
  },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#a855f7' },
  tabText: { color: '#52525b', fontSize: 12, fontWeight: '700' },
  tabTextActive: { color: '#a855f7' },

  // Content
  content: { flex: 1 },
  contentPad: { padding: 16, paddingBottom: 40 },

  // Stats
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  statCard: {
    flex: 1,
    backgroundColor: '#111114',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#27272a',
  },
  statEmoji: { fontSize: 22, marginBottom: 6 },
  statValue: { color: '#ffffff', fontSize: 15, fontWeight: '800', marginBottom: 2 },
  statLabel: { color: '#52525b', fontSize: 10, fontWeight: '600' },

  // Chart
  chartContainer: {
    backgroundColor: '#111114',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  chartTitle: { color: '#a1a1aa', fontSize: 12, fontWeight: '700', marginBottom: 14, textTransform: 'uppercase', letterSpacing: 1 },
  chartBars: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  chartBarCol: { alignItems: 'center', flex: 1 },
  chartBarWrapper: {
    height: 60,
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginBottom: 4,
  },
  chartBar: { width: 22, borderRadius: 6, minHeight: 4 },
  chartEmoji: { fontSize: 14, marginBottom: 4 },
  chartLabel: { color: '#52525b', fontSize: 10, fontWeight: '600' },
  chartLabelToday: { color: '#a855f7' },

  // CTA / Today prompt
  ctaCard: {
    backgroundColor: '#1a1025',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#a855f740',
    marginBottom: 16,
  },
  ctaEmoji: { fontSize: 40, marginBottom: 10 },
  ctaTitle: { color: '#ffffff', fontSize: 17, fontWeight: '700', marginBottom: 4 },
  ctaSubtitle: { color: '#71717a', fontSize: 13, textAlign: 'center' },
  todayPrompt: {
    backgroundColor: '#1a1025',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#a855f740',
  },
  todayPromptText: { color: '#d8b4fe', fontSize: 14, fontWeight: '600', textAlign: 'center' },

  // History
  historyCard: {
    flexDirection: 'row',
    backgroundColor: '#111114',
    borderRadius: 14,
    marginBottom: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#27272a',
  },
  historyAccent: { width: 4 },
  historyBody: { flex: 1, padding: 14 },
  historyHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  historyEmoji: { fontSize: 24 },
  historyMood: { fontSize: 15, fontWeight: '800' },
  historyDate: { color: '#52525b', fontSize: 11, marginTop: 1 },
  deleteIcon: { color: '#3f3f46', fontSize: 14, fontWeight: '700', padding: 4 },
  activityTagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  activityTag: { backgroundColor: '#1f1f23', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  activityTagText: { color: '#71717a', fontSize: 11 },
  historyNote: { color: '#a1a1aa', fontSize: 13, lineHeight: 18, marginTop: 4 },

  // Journal
  newJournalBtn: {
    backgroundColor: '#1a1025',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#a855f740',
  },
  newJournalBtnText: { color: '#a855f7', fontWeight: '700', fontSize: 14 },
  journalCard: {
    backgroundColor: '#111114',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  journalCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  journalEmoji: { fontSize: 22 },
  journalTitle: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  journalDate: { color: '#52525b', fontSize: 11, marginTop: 2 },
  journalContent: { color: '#71717a', fontSize: 13, lineHeight: 19 },
  colorDanger: { color: '#f43f5e' },

  // Insights
  insightRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: 8 },
  insightActivity: { flex: 1, color: '#e4e4e7', fontSize: 13, fontWeight: '600' },
  insightCount: { color: '#52525b', fontSize: 11, width: 28, textAlign: 'right' },
  insightMood: { color: '#a1a1aa', fontSize: 12, width: 52, textAlign: 'right' },
  insightDiff: { fontSize: 12, fontWeight: '800', width: 36, textAlign: 'right' },
  insightFoot: { color: '#52525b', fontSize: 10, marginTop: 8, lineHeight: 14 },

  // Empty
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  emptyEmoji: { fontSize: 44, marginBottom: 14 },
  emptyTitle: { color: '#ffffff', fontSize: 18, fontWeight: '700', marginBottom: 6 },
  emptySubtitle: { color: '#52525b', fontSize: 13, textAlign: 'center' },

  // Modal
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  modalSheet: {
    backgroundColor: '#111114',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    borderTopWidth: 1,
    borderColor: '#27272a',
  },
  modalSheetContent: { padding: 24, paddingBottom: 40 },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#27272a',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  modalTitle: { color: '#ffffff', fontSize: 20, fontWeight: '800', marginBottom: 20 },
  sectionLabel: {
    color: '#a1a1aa',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 12,
    marginTop: 16,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  moodSelector: { flexDirection: 'row', justifyContent: 'space-between', gap: 6 },
  moodOption: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#27272a',
    backgroundColor: '#1a1a1e',
  },
  moodOptionEmoji: { fontSize: 22, marginBottom: 4 },
  moodOptionLabel: { color: '#52525b', fontSize: 10, fontWeight: '700' },
  moodSelectedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 12,
  },
  moodSelectedEmoji: { fontSize: 22 },
  moodSelectedLabel: { fontSize: 14, fontWeight: '700' },
  activitiesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  activityChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#1a1a1e',
    borderWidth: 1,
    borderColor: '#27272a',
  },
  activityChipActive: { backgroundColor: '#a855f720', borderColor: '#a855f7' },
  activityChipText: { color: '#71717a', fontSize: 12 },
  activityChipTextActive: { color: '#d8b4fe' },
  noteInput: {
    backgroundColor: '#1a1a1e',
    borderRadius: 10,
    padding: 12,
    color: '#ffffff',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#27272a',
    height: 80,
    textAlignVertical: 'top',
  },
  moodMiniRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  moodMiniBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#1a1a1e',
    borderWidth: 1.5,
    borderColor: '#27272a',
  },
  moodMiniEmoji: { fontSize: 22 },
  input: {
    backgroundColor: '#1a1a1e',
    borderRadius: 10,
    padding: 12,
    color: '#ffffff',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  journalInput: { height: 120, textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 24 },
  btnCancel: {
    flex: 1,
    padding: 14,
    backgroundColor: '#1a1a1e',
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#27272a',
  },
  btnCancelText: { color: '#71717a', fontWeight: '700', fontSize: 14 },
  btnAdd: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnAddText: { color: '#ffffff', fontWeight: '700', fontSize: 14 },
});
