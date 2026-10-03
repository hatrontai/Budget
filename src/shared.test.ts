import { describe, expect, it } from 'vitest';
import { formatVndInput, isValidDate, monthBounds, sortDailyCategories, summarize, validateExpense, type Expense } from './shared';

const sample: Expense[] = [
  { id: 'a', spent_on: '2026-09-02', amount_vnd: 50000, description: 'Cà phê', category: 'Ăn uống', created_at: '' },
  { id: 'b', spent_on: '2026-09-02', amount_vnd: 20000, description: 'Bánh', category: 'Ăn uống', created_at: '' },
  { id: 'c', spent_on: '2026-09-03', amount_vnd: 100000, description: 'Xe', category: 'Đi lại', created_at: '' },
  { id: 'd', spent_on: '2026-10-01', amount_vnd: 80000, description: 'Sách', category: 'Mua sắm', created_at: '' },
];

describe('expense data', () => {
  it('formats typed and pasted VND amounts without changing their value', () => {
    expect(formatVndInput('50000')).toBe('50.000');
    expect(formatVndInput('1.250.000')).toBe('1.250.000');
    expect(formatVndInput('0001234')).toBe('1.234');
    expect(formatVndInput('')).toBe('');
  });
  it('rejects impossible dates and amounts', () => {
    expect(isValidDate('2026-02-30')).toBe(false);
    expect(isValidDate('2024-02-29')).toBe(true);
    expect(validateExpense({ spent_on: '2026-09-02', amount_vnd: 1.5, description: 'A', category: 'Khác' })).toBeNull();
    expect(validateExpense({ spent_on: '2026-09-02', amount_vnd: -1, description: 'A', category: 'Khác' })).toBeNull();
  });
  it('uses a half-open month range including year rollover', () => {
    expect(monthBounds('2026-12')).toEqual(['2026-12-01', '2027-01-01']);
    expect(monthBounds('2026-13')).toBeNull();
  });
  it('splits each day by category and keeps the daily total', () => {
    const mixed = [...sample, { id: 'e', spent_on: '2026-09-02', amount_vnd: 30000, description: 'Xe buýt', category: 'Đi lại', created_at: '' }];
    const result = summarize(mixed, '2026-09');
    expect([...result.byDayCategory.get('2026-09-02')!]).toEqual([['Ăn uống', 70000], ['Đi lại', 30000]]);
    expect([...result.byDayCategoryCount.get('2026-09-02')!]).toEqual([['Ăn uống', 2], ['Đi lại', 1]]);
    expect(sortDailyCategories(result.byDayCategory.get('2026-09-02'), result.byDayCategoryCount.get('2026-09-02')).map(group => group.name)).toEqual(['Ăn uống', 'Đi lại']);
    expect(sortDailyCategories(new Map([['A', 100], ['B', 200]]), new Map([['A', 2], ['B', 1]])).map(group => group.name)).toEqual(['A', 'B']);
    expect(sortDailyCategories(new Map([['A', 100], ['B', 200]]), new Map([['A', 1], ['B', 1]])).map(group => group.name)).toEqual(['B', 'A']);
    expect(result.byDayCategory.has('2026-10-01')).toBe(false);
    for (const [day, groups] of result.byDayCategory) {
      expect([...groups.values()].reduce((sum, value) => sum + value, 0)).toBe(result.byDay.get(day));
    }
    expect(summarize([], '2026-09').byDayCategory.size).toBe(0);
  });
  it('aggregates only the selected month by day and category', () => {
    const result = summarize(sample, '2026-09');
    expect(result.total).toBe(170000);
    expect(result.count).toBe(3);
    expect(result.byDay.get('2026-09-02')).toBe(70000);
    expect(result.byCategory.get('Ăn uống')).toBe(70000);
  });
});
