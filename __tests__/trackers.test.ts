import {
  activityMoodInsights, averageMood, dueLabel, endOfDayIn, isOverdue, makeId, moodStreak, sortTasks,
} from '../src/utils/trackers';
import { averageMonthlyExpenses, debtPayoffMonths } from '../src/utils/finance';
import type { Task, Transaction } from '../src/types';

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();
const NOW = at(2026, 10, 18, 9);

describe('moodStreak', () => {
  it('counts consecutive days ending today', () => {
    expect(moodStreak([{ date: at(2026, 10, 18) }, { date: at(2026, 10, 17) }, { date: at(2026, 10, 16) }], NOW)).toBe(3);
  });
  it('keeps the streak alive when today is not logged yet', () => {
    expect(moodStreak([{ date: at(2026, 10, 17) }, { date: at(2026, 10, 16) }], NOW)).toBe(2);
  });
  it('breaks on a gap and counts multiple logs per day once', () => {
    expect(moodStreak([{ date: at(2026, 10, 18, 8) }, { date: at(2026, 10, 18, 20) }, { date: at(2026, 10, 16) }], NOW)).toBe(1);
    expect(moodStreak([{ date: at(2026, 10, 15) }], NOW)).toBe(0);
  });
});

const task = (over: Partial<Task>): Task => ({
  id: makeId('task'), title: 't', description: '', priority: 'medium', status: 'todo',
  dueDate: null, createdAt: 0, completedAt: null, category: 'Work', ...over,
});

describe('tasks', () => {
  it('flags only open tasks past their due date', () => {
    expect(isOverdue(task({ dueDate: NOW - 1 }), NOW)).toBe(true);
    expect(isOverdue(task({ dueDate: NOW - 1, status: 'done' }), NOW)).toBe(false);
    expect(isOverdue(task({ dueDate: null }), NOW)).toBe(false);
  });

  it('sorts in-progress, then to-do by priority and due date, then done', () => {
    const list = [
      task({ id: 'done', status: 'done', completedAt: 5 }),
      task({ id: 'low', priority: 'low' }),
      task({ id: 'urgent-late', priority: 'urgent', dueDate: 200 }),
      task({ id: 'urgent-soon', priority: 'urgent', dueDate: 100 }),
      task({ id: 'wip', status: 'in_progress', priority: 'low' }),
    ];
    expect(sortTasks(list).map(t => t.id)).toEqual(['wip', 'urgent-soon', 'urgent-late', 'low', 'done']);
  });

  it('labels due dates relative to today', () => {
    expect(dueLabel(endOfDayIn(0, NOW), NOW)).toBe('Today');
    expect(dueLabel(endOfDayIn(1, NOW), NOW)).toBe('Tomorrow');
    expect(dueLabel(endOfDayIn(-3, NOW), NOW)).toBe('3d overdue');
    expect(dueLabel(endOfDayIn(5, NOW), NOW)).toBe('In 5d');
  });

  it('generates unique ids even within the same millisecond', () => {
    const ids = new Set(Array.from({ length: 200 }, () => makeId('x')));
    expect(ids.size).toBe(200);
  });
});

describe('mood insights', () => {
  it('ranks activities by average mood and ignores one-offs', () => {
    const res = activityMoodInsights([
      { mood: 5, activities: ['Exercise', 'Social'] },
      { mood: 4, activities: ['Exercise'] },
      { mood: 2, activities: ['Gaming'] },
      { mood: 1, activities: ['Gaming', 'Rare'] },
    ]);
    expect(res.map(r => r.activity)).toEqual(['Exercise', 'Gaming']);
    expect(res[0].avg).toBe(4.5);
  });
  it('averages mood', () => {
    expect(averageMood([])).toBeNull();
    expect(averageMood([{ mood: 4 }, { mood: 5 }])).toBe(5);
  });
});

const txn = (amount: number, date: number, over: Partial<Transaction> = {}): Transaction => ({
  id: makeId('t'), amount, type: 'debit', description: '', category: 'Groceries', paymentMethod: 'Debit Card', date, ...over,
});

describe('wealth helpers', () => {
  it('averages spend over complete months, excluding transfers and the current month', () => {
    const now = new Date(2026, 9, 18);
    const list = [
      txn(1000, at(2026, 9, 5)),
      txn(3000, at(2026, 8, 5)),
      txn(9999, at(2026, 8, 6), { category: 'Transfer' }),
      txn(5000, at(2026, 10, 2)), // current month — ignored
    ];
    expect(averageMonthlyExpenses(list, 3, now)).toBe(2000);
    expect(averageMonthlyExpenses([], 3, now)).toBeNull();
  });

  it('estimates debt payoff months', () => {
    expect(debtPayoffMonths(1200, 0, 100)).toBe(12);
    expect(debtPayoffMonths(10000, 24, 100)).toBe(Infinity); // payment below monthly interest
    expect(debtPayoffMonths(10000, 12, 1000)).toBe(11);
    expect(debtPayoffMonths(0, 12, 100)).toBe(0);
  });
});
