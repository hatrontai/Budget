import { describe, expect, it } from 'vitest';
import { isValidDate, monthBounds, summarize, validateExpense, type Expense } from './shared';

const sample: Expense[] = [
  { id: 'a', spent_on: '2026-09-02', amount_vnd: 50000, description: 'Cà phê', category: 'Ăn uống', created_at: '' },
  { id: 'b', spent_on: '2026-09-02', amount_vnd: 20000, description: 'Bánh', category: 'Ăn uống', created_at: '' },
  { id: 'c', spent_on: '2026-09-03', amount_vnd: 100000, description: 'Xe', category: 'Đi lại', created_at: '' },
  { id: 'd', spent_on: '2026-10-01', amount_vnd: 80000, description: 'Sách', category: 'Mua sắm', created_at: '' },
];

describe('expense data', () => {
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
  it('aggregates only the selected month by day and category', () => {
    const result = summarize(sample, '2026-09');
    expect(result.total).toBe(170000);
    expect(result.count).toBe(3);
    expect(result.byDay.get('2026-09-02')).toBe(70000);
    expect(result.byCategory.get('Ăn uống')).toBe(70000);
  });
});
