import React, { useState, useRef } from 'react';
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
  Animated,
} from 'react-native';
import { TodoItem, TodoList } from '../types';

interface TodoScreenProps {
  todoItems: TodoItem[];
  todoLists: TodoList[];
  onAddItem: (item: Omit<TodoItem, 'id' | 'createdAt' | 'completedAt'>) => void;
  onToggleItem: (id: string) => void;
  onDeleteItem: (id: string) => void;
  onAddList: (list: Omit<TodoList, 'id' | 'createdAt'>) => void;
  onDeleteList: (id: string) => void;
  onGoHome: () => void;
}

const LIST_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#a855f7',
  '#f43f5e', '#06b6d4', '#84cc16', '#ec4899',
];

const DEFAULT_LISTS: Omit<TodoList, 'id' | 'createdAt'>[] = [
  { name: 'Personal', color: '#10b981' },
  { name: 'Work',     color: '#3b82f6' },
  { name: 'Shopping', color: '#f59e0b' },
];

function AddListModal({
  visible,
  onClose,
  onAdd,
}: {
  visible: boolean;
  onClose: () => void;
  onAdd: (list: Omit<TodoList, 'id' | 'createdAt'>) => void;
}) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(LIST_COLORS[0]);

  const handleAdd = () => {
    if (!name.trim()) {
      Alert.alert('Missing Name', 'Please enter a list name.');
      return;
    }
    onAdd({ name: name.trim(), color });
    setName('');
    setColor(LIST_COLORS[0]);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>New List</Text>

          <Text style={styles.label}>List Name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Groceries"
            placeholderTextColor="#52525b"
            value={name}
            onChangeText={setName}
            autoFocus
          />

          <Text style={styles.label}>Color</Text>
          <View style={styles.colorRow}>
            {LIST_COLORS.map(c => (
              <TouchableOpacity
                key={c}
                style={[styles.colorDot, { backgroundColor: c }, color === c && styles.colorDotActive]}
                onPress={() => setColor(c)}
              />
            ))}
          </View>

          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.btnCancel} onPress={onClose}>
              <Text style={styles.btnCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btnAdd, { backgroundColor: color }]} onPress={handleAdd}>
              <Text style={styles.btnAddText}>Create List</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function TodoItemRow({
  item,
  accentColor,
  onToggle,
  onDelete,
}: {
  item: TodoItem;
  accentColor: string;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const handleDelete = () => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => onDelete());
  };

  return (
    <Animated.View style={[styles.itemRow, { opacity: fadeAnim }]}>
      <TouchableOpacity
        style={[styles.checkCircle, item.completed && { backgroundColor: accentColor, borderColor: accentColor }]}
        onPress={onToggle}
      >
        {item.completed && <Text style={styles.checkIcon}>✓</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={styles.itemTextContainer} onPress={onToggle} activeOpacity={0.7}>
        <Text style={[styles.itemText, item.completed && styles.itemTextDone]}>
          {item.text}
        </Text>
        <Text style={styles.itemDate}>
          {new Date(item.createdAt).toLocaleDateString()}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.deleteItemBtn} onPress={handleDelete}>
        <Text style={styles.deleteItemIcon}>✕</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function TodoScreen({
  todoItems,
  todoLists,
  onAddItem,
  onToggleItem,
  onDeleteItem,
  onAddList,
  onDeleteList,
  onGoHome,
}: TodoScreenProps) {
  const [selectedListId, setSelectedListId] = useState<string>(todoLists[0]?.id ?? '');
  const [quickInput, setQuickInput] = useState('');
  const [showAddList, setShowAddList] = useState(false);
  const [showCompleted, setShowCompleted] = useState(true);

  const activeList = todoLists.find(l => l.id === selectedListId);
  const listItems = todoItems.filter(i => i.listId === selectedListId);
  const pendingItems = listItems.filter(i => !i.completed);
  const completedItems = listItems.filter(i => i.completed);

  const handleQuickAdd = () => {
    if (!quickInput.trim()) return;
    if (!selectedListId) {
      Alert.alert('No List', 'Create or select a list first.');
      return;
    }
    onAddItem({
      text: quickInput.trim(),
      completed: false,
      listId: selectedListId,
    });
    setQuickInput('');
  };

  const handleDeleteList = (id: string) => {
    const listName = todoLists.find(l => l.id === id)?.name ?? 'this list';
    Alert.alert(
      'Delete List',
      `Delete "${listName}" and all its items?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            // Switch to another list before deleting
            const others = todoLists.filter(l => l.id !== id);
            if (others.length > 0) setSelectedListId(others[0].id);
            onDeleteList(id);
          },
        },
      ],
    );
  };

  const progressPercent =
    listItems.length === 0 ? 0 : Math.round((completedItems.length / listItems.length) * 100);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onGoHome}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.headerSub}>Essential Tracker</Text>
          <Text style={styles.headerTitle}>To-Do List</Text>
        </View>
        <TouchableOpacity
          style={[styles.addListBtn, { borderColor: activeList?.color ?? '#f59e0b' }]}
          onPress={() => setShowAddList(true)}
        >
          <Text style={[styles.addListBtnText, { color: activeList?.color ?? '#f59e0b' }]}>+ List</Text>
        </TouchableOpacity>
      </View>

      {/* Lists Selector */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.listsBar}
        contentContainerStyle={styles.listsBarContent}
      >
        {todoLists.map(list => {
          const count = todoItems.filter(i => i.listId === list.id && !i.completed).length;
          const isActive = selectedListId === list.id;
          return (
            <TouchableOpacity
              key={list.id}
              style={[
                styles.listPill,
                isActive && { backgroundColor: list.color + '25', borderColor: list.color },
              ]}
              onPress={() => setSelectedListId(list.id)}
              onLongPress={() => todoLists.length > 1 && handleDeleteList(list.id)}
            >
              <View style={[styles.listDot, { backgroundColor: list.color }]} />
              <Text style={[styles.listPillText, isActive && { color: list.color }]}>
                {list.name}
              </Text>
              {count > 0 && (
                <View style={[styles.listBadge, { backgroundColor: list.color }]}>
                  <Text style={styles.listBadgeText}>{count}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Progress Bar */}
      {activeList && listItems.length > 0 && (
        <View style={styles.progressSection}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressLabel}>{completedItems.length} of {listItems.length} completed</Text>
            <Text style={[styles.progressPercent, { color: activeList.color }]}>{progressPercent}%</Text>
          </View>
          <View style={styles.progressBarOuter}>
            <View
              style={[
                styles.progressBarInner,
                { width: `${progressPercent}%`, backgroundColor: activeList.color },
              ]}
            />
          </View>
        </View>
      )}

      {/* Quick Add */}
      <View style={styles.quickAddRow}>
        <TextInput
          style={styles.quickInput}
          placeholder={activeList ? `Add to ${activeList.name}...` : 'Select a list first'}
          placeholderTextColor="#52525b"
          value={quickInput}
          onChangeText={setQuickInput}
          onSubmitEditing={handleQuickAdd}
          returnKeyType="done"
          editable={!!selectedListId}
        />
        <TouchableOpacity
          style={[styles.quickAddBtn, { backgroundColor: activeList?.color ?? '#f59e0b' }]}
          onPress={handleQuickAdd}
        >
          <Text style={styles.quickAddBtnText}>Add</Text>
        </TouchableOpacity>
      </View>

      {/* Items List */}
      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {todoLists.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>📋</Text>
            <Text style={styles.emptyTitle}>No lists yet</Text>
            <Text style={styles.emptySubtitle}>Tap "+ List" to create your first list</Text>
          </View>
        ) : (
          <>
            {/* Pending */}
            {pendingItems.map(item => (
              <TodoItemRow
                key={item.id}
                item={item}
                accentColor={activeList?.color ?? '#f59e0b'}
                onToggle={() => onToggleItem(item.id)}
                onDelete={() => onDeleteItem(item.id)}
              />
            ))}

            {/* Completed section */}
            {completedItems.length > 0 && (
              <>
                <TouchableOpacity
                  style={styles.completedHeader}
                  onPress={() => setShowCompleted(v => !v)}
                >
                  <Text style={styles.completedHeaderText}>
                    {showCompleted ? '▾' : '▸'} Completed ({completedItems.length})
                  </Text>
                </TouchableOpacity>
                {showCompleted &&
                  completedItems.map(item => (
                    <TodoItemRow
                      key={item.id}
                      item={item}
                      accentColor={activeList?.color ?? '#f59e0b'}
                      onToggle={() => onToggleItem(item.id)}
                      onDelete={() => onDeleteItem(item.id)}
                    />
                  ))}
              </>
            )}

            {listItems.length === 0 && (
              <View style={styles.emptyState}>
                <Text style={styles.emptyEmoji}>✨</Text>
                <Text style={styles.emptyTitle}>All clear!</Text>
                <Text style={styles.emptySubtitle}>Add your first item above</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>

      <AddListModal
        visible={showAddList}
        onClose={() => setShowAddList(false)}
        onAdd={list => {
          onAddList(list);
          // We'll select the new list after it's added via side effect in parent
        }}
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
  headerSub: { color: '#f59e0b', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  headerTitle: { color: '#ffffff', fontSize: 20, fontWeight: '800' },
  addListBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  addListBtnText: { fontWeight: '700', fontSize: 13 },

  // Lists bar
  listsBar: { maxHeight: 56, borderBottomWidth: 1, borderBottomColor: '#1f1f23' },
  listsBarContent: { paddingHorizontal: 16, paddingVertical: 10, gap: 8, alignItems: 'center' },
  listPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#111114',
    borderWidth: 1,
    borderColor: '#27272a',
    gap: 6,
  },
  listDot: { width: 7, height: 7, borderRadius: 4 },
  listPillText: { color: '#71717a', fontSize: 13, fontWeight: '600' },
  listBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listBadgeText: { color: '#ffffff', fontSize: 10, fontWeight: '800' },

  // Progress
  progressSection: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressLabel: { color: '#71717a', fontSize: 12, fontWeight: '600' },
  progressPercent: { fontSize: 12, fontWeight: '800' },
  progressBarOuter: {
    height: 6,
    backgroundColor: '#27272a',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarInner: { height: '100%', borderRadius: 3 },

  // Quick add
  quickAddRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  quickInput: {
    flex: 1,
    backgroundColor: '#111114',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: '#ffffff',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  quickAddBtn: {
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 12,
    justifyContent: 'center',
  },
  quickAddBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 14 },

  // List
  list: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingBottom: 40 },

  // Item
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1e',
    gap: 12,
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#3f3f46',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkIcon: { color: '#ffffff', fontSize: 13, fontWeight: '800' },
  itemTextContainer: { flex: 1 },
  itemText: { color: '#e4e4e7', fontSize: 15, fontWeight: '500' },
  itemTextDone: { textDecorationLine: 'line-through', color: '#3f3f46' },
  itemDate: { color: '#3f3f46', fontSize: 11, marginTop: 2 },
  deleteItemBtn: { padding: 6 },
  deleteItemIcon: { color: '#3f3f46', fontSize: 14, fontWeight: '700' },

  // Completed section
  completedHeader: { paddingVertical: 12 },
  completedHeaderText: { color: '#52525b', fontSize: 12, fontWeight: '700' },

  // Empty
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  emptyEmoji: { fontSize: 44, marginBottom: 14 },
  emptyTitle: { color: '#ffffff', fontSize: 18, fontWeight: '700', marginBottom: 6 },
  emptySubtitle: { color: '#52525b', fontSize: 13, textAlign: 'center' },

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
    padding: 24,
    paddingBottom: 36,
    borderTopWidth: 1,
    borderColor: '#27272a',
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#27272a',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  modalTitle: { color: '#ffffff', fontSize: 20, fontWeight: '800', marginBottom: 20 },
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
  colorRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  colorDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorDotActive: { borderColor: '#ffffff', transform: [{ scale: 1.15 }] },
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
