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
import { Task, TaskPriority, TaskStatus } from '../types';
import { dueLabel, endOfDayIn, isOverdue, sortTasks, startOfDay } from '../utils/trackers';

interface TaskTrackerScreenProps {
  tasks: Task[];
  onAddTask: (task: Omit<Task, 'id' | 'createdAt' | 'completedAt'>) => void;
  onUpdateTask: (id: string, updates: Partial<Task>) => void;
  onDeleteTask: (id: string) => void;
  onGoHome: () => void;
}

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string; bg: string }> = {
  low:    { label: 'Low',    color: '#10b981', bg: '#10b98120' },
  medium: { label: 'Medium', color: '#f59e0b', bg: '#f59e0b20' },
  high:   { label: 'High',   color: '#f97316', bg: '#f9731620' },
  urgent: { label: 'Urgent', color: '#f43f5e', bg: '#f43f5e20' },
};

const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; emoji: string }> = {
  todo:        { label: 'To Do',       color: '#71717a', emoji: '⭕' },
  in_progress: { label: 'In Progress', color: '#3b82f6', emoji: '🔵' },
  done:        { label: 'Done',        color: '#10b981', emoji: '✅' },
};

const STATUS_TABS: { key: TaskStatus | 'all'; label: string }[] = [
  { key: 'all',        label: 'All' },
  { key: 'todo',       label: 'To Do' },
  { key: 'in_progress',label: 'In Progress' },
  { key: 'done',       label: 'Done' },
];

const CATEGORIES = ['Work', 'Personal', 'Health', 'Finance', 'Learning', 'Other'];
const PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];

const DUE_PRESETS: { label: string; days: number | null }[] = [
  { label: 'None',     days: null },
  { label: 'Today',    days: 0 },
  { label: 'Tomorrow', days: 1 },
  { label: '3 days',   days: 3 },
  { label: '1 week',   days: 7 },
  { label: '2 weeks',  days: 14 },
];

type TaskDraft = Omit<Task, 'id' | 'createdAt' | 'completedAt'>;

interface TaskModalProps {
  visible: boolean;
  /** When set, the modal edits this task instead of creating a new one. */
  task: Task | null;
  onClose: () => void;
  onSave: (task: TaskDraft) => void;
}

function TaskModal({ visible, task, onClose, onSave }: TaskModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [category, setCategory] = useState('Work');
  const [dueDate, setDueDate] = useState<number | null>(null);

  // Load the task being edited (or clear the form) each time the sheet opens
  useEffect(() => {
    if (!visible) return;
    setTitle(task?.title ?? '');
    setDescription(task?.description ?? '');
    setPriority(task?.priority ?? 'medium');
    setCategory(task?.category ?? 'Work');
    setDueDate(task?.dueDate ?? null);
  }, [visible, task]);

  const handleSave = () => {
    if (!title.trim()) {
      Alert.alert('Missing Title', 'Please enter a task title.');
      return;
    }
    onSave({
      title: title.trim(),
      description: description.trim(),
      priority,
      status: task?.status ?? 'todo',
      dueDate,
      category,
    });
    onClose();
  };

  const isPresetActive = (days: number | null) =>
    days === null ? dueDate === null : dueDate !== null && startOfDay(dueDate) === startOfDay(endOfDayIn(days));
  const customDue = dueDate !== null && !DUE_PRESETS.some(p => isPresetActive(p.days));

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView style={styles.modalSheet} contentContainerStyle={styles.modalSheetContent} keyboardShouldPersistTaps="handled">
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>{task ? 'Edit Task' : 'New Task'}</Text>

          {/* Title */}
          <Text style={styles.label}>Title *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Finish project report"
            placeholderTextColor="#52525b"
            value={title}
            onChangeText={setTitle}
            autoFocus={!task}
          />

          {/* Description */}
          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            placeholder="Optional details..."
            placeholderTextColor="#52525b"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
          />

          {/* Priority */}
          <Text style={styles.label}>Priority</Text>
          <View style={styles.chipRow}>
            {PRIORITIES.map(p => {
              const cfg = PRIORITY_CONFIG[p];
              const active = priority === p;
              return (
                <TouchableOpacity
                  key={p}
                  style={[styles.chip, active && { backgroundColor: cfg.color, borderColor: cfg.color }]}
                  onPress={() => setPriority(p)}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {cfg.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Due date */}
          <Text style={styles.label}>Due</Text>
          <View style={styles.chipRow}>
            {DUE_PRESETS.map(p => {
              const active = isPresetActive(p.days);
              return (
                <TouchableOpacity
                  key={p.label}
                  style={[styles.chip, active && styles.chipActivePurple]}
                  onPress={() => setDueDate(p.days === null ? null : endOfDayIn(p.days))}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{p.label}</Text>
                </TouchableOpacity>
              );
            })}
            {customDue && (
              <View style={[styles.chip, styles.chipActivePurple]}>
                <Text style={[styles.chipText, styles.chipTextActive]}>{new Date(dueDate as number).toLocaleDateString()}</Text>
              </View>
            )}
          </View>

          {/* Category */}
          <Text style={styles.label}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
            <View style={styles.chipRow}>
              {CATEGORIES.map(cat => {
                const active = category === cat;
                return (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.chip, active && styles.chipActivePurple]}
                    onPress={() => setCategory(cat)}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{cat}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>

          {/* Actions */}
          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.btnCancel} onPress={onClose}>
              <Text style={styles.btnCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnAdd} onPress={handleSave}>
              <Text style={styles.btnAddText}>{task ? 'Save' : 'Add Task'}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

interface TaskCardProps {
  task: Task;
  onCycleStatus: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function TaskCard({ task, onCycleStatus, onEdit, onDelete }: TaskCardProps) {
  const pc = PRIORITY_CONFIG[task.priority];
  const sc = STATUS_CONFIG[task.status];
  const overdue = isOverdue(task);

  return (
    <View style={[styles.taskCard, task.status === 'done' && styles.taskCardDone, overdue && styles.taskCardOverdue]}>
      <TouchableOpacity style={styles.taskStatusBtn} onPress={onCycleStatus} hitSlop={8}>
        <Text style={styles.taskStatusEmoji}>{sc.emoji}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.taskBody} onPress={onEdit} activeOpacity={0.7}>
        <Text style={[styles.taskTitle, task.status === 'done' && styles.taskTitleDone]}>
          {task.title}
        </Text>
        {!!task.description && (
          <Text style={styles.taskDesc} numberOfLines={2}>{task.description}</Text>
        )}
        <View style={styles.taskMeta}>
          <View style={[styles.priorityBadge, { backgroundColor: pc.bg }]}>
            <Text style={[styles.priorityBadgeText, { color: pc.color }]}>{pc.label}</Text>
          </View>
          <Text style={styles.taskCategory}>{task.category}</Text>
          {task.dueDate !== null && (
            <Text style={[styles.taskDue, overdue && styles.taskDueOverdue]}>
              📅 {task.status === 'done' ? new Date(task.dueDate).toLocaleDateString() : dueLabel(task.dueDate)}
            </Text>
          )}
          {task.status === 'done' && task.completedAt !== null && (
            <Text style={styles.taskDue}>✓ {new Date(task.completedAt).toLocaleDateString()}</Text>
          )}
        </View>
      </TouchableOpacity>

      <TouchableOpacity style={styles.taskDeleteBtn} onPress={onDelete} hitSlop={8}>
        <Text style={styles.taskDeleteIcon}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function TaskTrackerScreen({
  tasks,
  onAddTask,
  onUpdateTask,
  onDeleteTask,
  onGoHome,
}: TaskTrackerScreenProps) {
  const [filterStatus, setFilterStatus] = useState<TaskStatus | 'all'>('all');
  const [showModal, setShowModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const filtered = useMemo(
    () => sortTasks(tasks.filter(t => filterStatus === 'all' || t.status === filterStatus)),
    [tasks, filterStatus],
  );

  const openNew = () => { setEditingTask(null); setShowModal(true); };
  const openEdit = (task: Task) => { setEditingTask(task); setShowModal(true); };

  const handleSave = (draft: TaskDraft) => {
    if (editingTask) onUpdateTask(editingTask.id, draft);
    else onAddTask(draft);
  };

  const cycleStatus = (task: Task) => {
    const next: Record<TaskStatus, TaskStatus> = {
      todo: 'in_progress',
      in_progress: 'done',
      done: 'todo',
    };
    onUpdateTask(task.id, {
      status: next[task.status],
      completedAt: next[task.status] === 'done' ? Date.now() : null,
    });
  };

  const handleDelete = (id: string) => {
    const title = tasks.find(t => t.id === id)?.title;
    Alert.alert('Delete Task', title ? `Remove "${title}"?` : 'Remove this task?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => onDeleteTask(id) },
    ]);
  };

  const doneCount = tasks.filter(t => t.status === 'done').length;
  const inProgressCount = tasks.filter(t => t.status === 'in_progress').length;
  const todoCount = tasks.filter(t => t.status === 'todo').length;
  const overdueCount = tasks.filter(t => isOverdue(t)).length;
  const completedDone = tasks.filter(t => t.status === 'done');

  const clearDone = () => {
    const n = completedDone.length;
    Alert.alert('Clear Completed', `Remove ${n} completed task${n === 1 ? '' : 's'}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => completedDone.forEach(t => onDeleteTask(t.id)) },
    ]);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onGoHome}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.headerSub}>Essential Tracker</Text>
          <Text style={styles.headerTitle}>Task Tracker</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={openNew}>
          <Text style={styles.addBtnText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {/* Stats Row */}
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{todoCount}</Text>
          <Text style={styles.statLabel}>To Do</Text>
        </View>
        <View style={[styles.statBox, styles.statBoxMiddle]}>
          <Text style={[styles.statValue, { color: '#3b82f6' }]}>{inProgressCount}</Text>
          <Text style={styles.statLabel}>In Progress</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={[styles.statValue, { color: '#10b981' }]}>{doneCount}</Text>
          <Text style={styles.statLabel}>Done</Text>
        </View>
      </View>

      {overdueCount > 0 && (
        <TouchableOpacity style={styles.overdueBanner} onPress={() => setFilterStatus('all')}>
          <Text style={styles.overdueBannerText}>
            ⏰ {overdueCount} task{overdueCount === 1 ? ' is' : 's are'} overdue
          </Text>
        </TouchableOpacity>
      )}

      {/* Filter Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterBar}
        contentContainerStyle={styles.filterBarContent}
      >
        {STATUS_TABS.map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.filterTab, filterStatus === tab.key && styles.filterTabActive]}
            onPress={() => setFilterStatus(tab.key)}
          >
            <Text style={[styles.filterTabText, filterStatus === tab.key && styles.filterTabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
        {filterStatus === 'done' && completedDone.length > 0 && (
          <TouchableOpacity style={styles.clearDoneBtn} onPress={clearDone}>
            <Text style={styles.clearDoneText}>Clear all</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Task List */}
      <ScrollView
        style={styles.list}
        contentContainerStyle={[styles.listContent, filtered.length === 0 && styles.listEmpty]}
        showsVerticalScrollIndicator={false}
      >
        {filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>✅</Text>
            <Text style={styles.emptyTitle}>
              {filterStatus === 'all' ? 'No tasks yet' : `No ${STATUS_CONFIG[filterStatus as TaskStatus]?.label ?? ''} tasks`}
            </Text>
            <Text style={styles.emptySubtitle}>
              {tasks.length === 0 ? 'Tap "+ Add" to create your first task' : 'Nothing here — try another filter'}
            </Text>
          </View>
        ) : (
          filtered.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              onCycleStatus={() => cycleStatus(task)}
              onEdit={() => openEdit(task)}
              onDelete={() => handleDelete(task.id)}
            />
          ))
        )}
      </ScrollView>

      <TaskModal
        visible={showModal}
        task={editingTask}
        onClose={() => setShowModal(false)}
        onSave={handleSave}
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
  headerSub: { color: '#3b82f6', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  headerTitle: { color: '#ffffff', fontSize: 20, fontWeight: '800' },
  addBtn: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  addBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 13 },

  // Stats
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#111114',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#27272a',
  },
  statBoxMiddle: {},
  statValue: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '800',
  },
  statLabel: {
    color: '#52525b',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },

  // Filter tabs
  filterBar: { maxHeight: 50 },
  filterBarContent: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: 'center',
  },
  filterTab: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#111114',
    borderWidth: 1,
    borderColor: '#27272a',
  },
  filterTabActive: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  filterTabText: { color: '#71717a', fontSize: 12, fontWeight: '700' },
  filterTabTextActive: { color: '#ffffff' },

  // List
  list: { flex: 1 },
  listContent: { padding: 16, gap: 10, paddingBottom: 32 },
  listEmpty: { flex: 1 },

  // Empty state
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyEmoji: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { color: '#ffffff', fontSize: 18, fontWeight: '700', marginBottom: 6 },
  emptySubtitle: { color: '#52525b', fontSize: 13, textAlign: 'center' },

  // Task card
  taskCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#111114',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#27272a',
    gap: 12,
  },
  taskCardDone: { opacity: 0.6 },
  taskCardOverdue: { borderColor: '#f43f5e66' },
  taskStatusBtn: { paddingTop: 2 },
  taskStatusEmoji: { fontSize: 22 },
  taskBody: { flex: 1 },
  taskTitle: { color: '#ffffff', fontSize: 15, fontWeight: '700', marginBottom: 3 },
  taskTitleDone: { textDecorationLine: 'line-through', color: '#52525b' },
  taskDesc: { color: '#71717a', fontSize: 12, lineHeight: 17, marginBottom: 8 },
  taskMeta: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', alignItems: 'center' },
  priorityBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  priorityBadgeText: { fontSize: 10, fontWeight: '700' },
  taskCategory: { color: '#52525b', fontSize: 11 },
  taskDue: { color: '#71717a', fontSize: 11 },
  taskDueOverdue: { color: '#f43f5e', fontWeight: '700' },

  // Overdue banner / clear done
  overdueBanner: {
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#f43f5e15',
    borderWidth: 1,
    borderColor: '#f43f5e40',
  },
  overdueBannerText: { color: '#fda4af', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  clearDoneBtn: { paddingHorizontal: 12, paddingVertical: 7 },
  clearDoneText: { color: '#f43f5e', fontSize: 12, fontWeight: '700' },
  taskDeleteBtn: { padding: 4 },
  taskDeleteIcon: { color: '#3f3f46', fontSize: 14, fontWeight: '700' },

  // Modal
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  modalSheet: {
    backgroundColor: '#111114',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    borderTopWidth: 1,
    borderColor: '#27272a',
  },
  modalSheetContent: { padding: 24, paddingBottom: 36 },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#27272a',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 20,
  },
  label: {
    color: '#a1a1aa',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 14,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: '#1a1a1e',
    borderRadius: 10,
    padding: 12,
    color: '#ffffff',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  inputMultiline: { height: 80, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chipScroll: { marginBottom: 4 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#1a1a1e',
    borderWidth: 1,
    borderColor: '#27272a',
  },
  chipActivePurple: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  chipText: { color: '#71717a', fontSize: 12, fontWeight: '600' },
  chipTextActive: { color: '#ffffff' },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
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
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    alignItems: 'center',
  },
  btnAddText: { color: '#ffffff', fontWeight: '700', fontSize: 14 },
});
