import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  Dimensions,
} from 'react-native';

const { width } = Dimensions.get('window');
const TILE_WIDTH = (width - 48) / 2; // 2 columns, 16px padding each side + 16px gap

export type TrackerScreen = 'money' | 'tasks' | 'todo' | 'mental_health';

interface TileProps {
  emoji: string;
  title: string;
  subtitle: string;
  stats: string;
  accentColor: string;
  delay: number;
  onPress: () => void;
}

function TrackerTile({ emoji, title, subtitle, stats, accentColor, delay, onPress }: TileProps) {
  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const pressScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        delay,
        useNativeDriver: true,
        tension: 80,
        friction: 8,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 350,
        delay,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handlePressIn = () => {
    Animated.spring(pressScale, { toValue: 0.95, useNativeDriver: true, tension: 200 }).start();
  };

  const handlePressOut = () => {
    Animated.spring(pressScale, { toValue: 1, useNativeDriver: true, tension: 200 }).start();
  };

  return (
    <Animated.View
      style={[
        styles.tile,
        { opacity: opacityAnim, transform: [{ scale: scaleAnim }, { scale: pressScale }] },
      ]}
    >
      <TouchableOpacity
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={1}
        style={styles.tileInner}
      >
        {/* Accent bar at top */}
        <View style={[styles.tileAccentBar, { backgroundColor: accentColor }]} />

        <View style={styles.tileContent}>
          <Text style={styles.tileEmoji}>{emoji}</Text>
          <Text style={styles.tileTitle}>{title}</Text>
          <Text style={styles.tileSubtitle}>{subtitle}</Text>

          <View style={[styles.tileStatPill, { backgroundColor: accentColor + '22' }]}>
            <Text style={[styles.tileStatText, { color: accentColor }]}>{stats}</Text>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

interface HomeScreenProps {
  onNavigate: (screen: TrackerScreen) => void;
  moneyStats: { transactions: number; thisMonthSpent: number };
  taskStats: { total: number; done: number; overdue: number };
  todoStats: { total: number; completed: number };
  moodStats: { streak: number; lastMood: number | null };
}

export default function HomeScreen({
  onNavigate,
  moneyStats,
  taskStats,
  todoStats,
  moodStats,
}: HomeScreenProps) {
  const headerAnim = useRef(new Animated.Value(-30)).current;
  const headerOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(headerAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
      Animated.timing(headerOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
    ]).start();
  }, []);

  const moodEmojis: Record<number, string> = { 1: '😫', 2: '😟', 3: '😐', 4: '😊', 5: '🤩' };

  const tiles: TileProps[] = [
    {
      emoji: '💰',
      title: 'Money Tracker',
      subtitle: 'Transactions & Wealth',
      stats: `Rs. ${moneyStats.thisMonthSpent.toLocaleString(undefined, { maximumFractionDigits: 0 })} spent`,
      accentColor: '#10b981',
      delay: 100,
      onPress: () => onNavigate('money'),
    },
    {
      emoji: '✅',
      title: 'Task Tracker',
      subtitle: 'Projects & Priorities',
      stats:
        taskStats.total === 0
          ? 'No tasks yet'
          : taskStats.overdue > 0
            ? `${taskStats.done}/${taskStats.total} done · ${taskStats.overdue} overdue`
            : `${taskStats.done}/${taskStats.total} done`,
      accentColor: '#3b82f6',
      delay: 200,
      onPress: () => onNavigate('tasks'),
    },
    {
      emoji: '📋',
      title: 'To-Do List',
      subtitle: 'Quick Daily Checklists',
      stats:
        todoStats.total === 0
          ? 'No items yet'
          : `${todoStats.completed}/${todoStats.total} checked`,
      accentColor: '#f59e0b',
      delay: 300,
      onPress: () => onNavigate('todo'),
    },
    {
      emoji: '🧠',
      title: 'Mental Health',
      subtitle: 'Mood & Journal',
      stats:
        moodStats.lastMood != null
          ? `${moodEmojis[moodStats.lastMood]} · ${moodStats.streak}d streak`
          : 'Log your mood',
      accentColor: '#a855f7',
      delay: 400,
      onPress: () => onNavigate('mental_health'),
    },
  ];

  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <Animated.View
        style={[
          styles.header,
          { opacity: headerOpacity, transform: [{ translateY: headerAnim }] },
        ]}
      >
        <Text style={styles.greeting}>{greeting} 👋</Text>
        <Text style={styles.appName}>Essential Tracker</Text>
        <Text style={styles.appTagline}>Everything important, in one place.</Text>
      </Animated.View>

      {/* Tiles Grid */}
      <View style={styles.grid}>
        {tiles.map((tile, idx) => (
          <TrackerTile key={idx} {...tile} />
        ))}
      </View>

      {/* Footer hint */}
      <Animated.View style={[styles.footer, { opacity: headerOpacity }]}>
        <Text style={styles.footerText}>Tap any tile to open that tracker</Text>
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090b',
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    paddingTop: 20,
    paddingBottom: 28,
    paddingHorizontal: 4,
  },
  greeting: {
    color: '#71717a',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  appName: {
    color: '#ffffff',
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  appTagline: {
    color: '#52525b',
    fontSize: 13,
    marginTop: 4,
    fontWeight: '500',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  tile: {
    width: TILE_WIDTH,
    borderRadius: 20,
    backgroundColor: '#111114',
    borderWidth: 1,
    borderColor: '#27272a',
    overflow: 'hidden',
    // shadow
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 6,
  },
  tileInner: {
    flex: 1,
  },
  tileAccentBar: {
    height: 4,
    width: '100%',
  },
  tileContent: {
    padding: 18,
    minHeight: 160,
    justifyContent: 'space-between',
  },
  tileEmoji: {
    fontSize: 32,
    marginBottom: 10,
  },
  tileTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  tileSubtitle: {
    color: '#71717a',
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
    marginBottom: 14,
  },
  tileStatPill: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  tileStatText: {
    fontSize: 11,
    fontWeight: '700',
  },
  footer: {
    alignItems: 'center',
    marginTop: 32,
  },
  footerText: {
    color: '#3f3f46',
    fontSize: 12,
    fontWeight: '500',
  },
});
