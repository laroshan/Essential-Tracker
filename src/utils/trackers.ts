/**
 * Pure helpers shared by the Task, To-Do and Mental Health trackers.
 * Kept free of React Native imports so they can be unit-tested in node.
 */
import type { MoodEntry, MoodScore, Task, TaskPriority } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Collision-safe id — `Date.now()` alone repeats when two items are added in the same millisecond. */
export function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** End of the local day `days` from now (0 = today) — used for due-date presets. */
export function endOfDayIn(days: number, now = Date.now()): number {
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

/**
 * Consecutive days with at least one mood log, ending today.
 * A streak isn't broken just because today hasn't been logged *yet* —
 * if yesterday was logged, counting starts from yesterday.
 */
export function moodStreak(entries: Pick<MoodEntry, 'date'>[], now = Date.now()): number {
  const days = new Set(entries.map(e => startOfDay(e.date)));
  const d = new Date(startOfDay(now));
  if (!days.has(d.getTime())) d.setDate(d.getDate() - 1);
  let count = 0;
  while (days.has(d.getTime())) {
    count++;
    d.setDate(d.getDate() - 1);
  }
  return count;
}

export const PRIORITY_RANK: Record<TaskPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
const STATUS_RANK: Record<Task['status'], number> = { in_progress: 0, todo: 1, done: 2 };

export function isOverdue(task: Pick<Task, 'dueDate' | 'status'>, now = Date.now()): boolean {
  return task.status !== 'done' && task.dueDate !== null && task.dueDate < now;
}

/** Open work first (in progress → to do), then priority, then soonest due; done tasks by most recently completed. */
export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (STATUS_RANK[a.status] !== STATUS_RANK[b.status]) return STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (a.status === 'done') return (b.completedAt ?? 0) - (a.completedAt ?? 0);
    if (PRIORITY_RANK[a.priority] !== PRIORITY_RANK[b.priority]) return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    const ad = a.dueDate ?? Infinity, bd = b.dueDate ?? Infinity;
    if (ad !== bd) return ad - bd;
    return b.createdAt - a.createdAt;
  });
}

/** Human label for a due date relative to today: "Today", "Tomorrow", "2d overdue", "In 5d" or a date. */
export function dueLabel(dueDate: number, now = Date.now()): string {
  const diff = Math.round((startOfDay(dueDate) - startOfDay(now)) / DAY_MS);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff < 0) return `${-diff}d overdue`;
  if (diff <= 7) return `In ${diff}d`;
  return new Date(dueDate).toLocaleDateString();
}

/**
 * Average mood on days each activity was logged, best first.
 * Only activities seen at least `minCount` times are included so one-offs don't dominate.
 */
export function activityMoodInsights(
  entries: Pick<MoodEntry, 'mood' | 'activities'>[],
  minCount = 2,
): { activity: string; avg: number; count: number }[] {
  const acc: Record<string, { sum: number; count: number }> = {};
  for (const e of entries) {
    for (const a of e.activities) {
      const slot = acc[a] ?? (acc[a] = { sum: 0, count: 0 });
      slot.sum += e.mood;
      slot.count++;
    }
  }
  return Object.entries(acc)
    .filter(([, v]) => v.count >= minCount)
    .map(([activity, v]) => ({ activity, avg: v.sum / v.count, count: v.count }))
    .sort((a, b) => b.avg - a.avg || b.count - a.count);
}

export function averageMood(entries: Pick<MoodEntry, 'mood'>[]): MoodScore | null {
  if (entries.length === 0) return null;
  return Math.round(entries.reduce((s, e) => s + e.mood, 0) / entries.length) as MoodScore;
}
