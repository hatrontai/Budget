import { describe, expect, it } from 'vitest';
import { budgetProgress, effectiveBudget, projectedSpend, validateBudget, type Budget } from './budgets';
import type { Expense } from './shared';
const budgets: Budget[] = [
  { category: 'Ăn uống', month: '2026-09', mode: 'default', limit_vnd: 3000000 },
  { category: 'Ăn uống', month: '2026-11', mode: 'default', limit_vnd: 4000000 },
  { category: 'Ăn uống', month: '2026-10', mode: 'override', limit_vnd: 2500000 },
];
describe('monthly budgets', () => {
  it('inherits defaults forward without changing earlier months; overrides only one month', () => {
    expect(effectiveBudget(budgets, 'Ăn uống', '2026-08')).toBeUndefined();
    expect(effectiveBudget(budgets, 'Ăn uống', '2026-09')?.limit_vnd).toBe(3000000);
    expect(effectiveBudget(budgets, 'Ăn uống', '2026-10')?.limit_vnd).toBe(2500000);
    expect(effectiveBudget(budgets, 'Ăn uống', '2027-01')?.limit_vnd).toBe(4000000);
    expect(effectiveBudget(budgets, 'Khác', '2026-10')).toBeUndefined();
    expect(effectiveBudget(budgets.filter(b => b.mode !== 'override'), 'Ăn uống', '2026-10')?.limit_vnd).toBe(3000000);
  });
  it('zero disables a limit while allowing later defaults and temporary overrides', () => {
    const disabled = [...budgets, { category: 'Ăn uống', month: '2026-10', mode: 'override', limit_vnd: 0 } as Budget];
    expect(effectiveBudget(disabled, 'Ăn uống', '2026-10')?.limit_vnd).toBe(0);
    expect(effectiveBudget(disabled, 'Ăn uống', '2026-11')?.limit_vnd).toBe(4000000);
    expect(effectiveBudget([...budgets, { category: 'Ăn uống', month: '2026-12', mode: 'default', limit_vnd: 0 }], 'Ăn uống', '2027-01')?.limit_vnd).toBe(0);
  });
  it('classifies exact thresholds and does not divide by zero', () => {
    expect(budgetProgress(0, 100).status).toBe('normal');
    expect(budgetProgress(79, 100).status).toBe('normal');
    expect(budgetProgress(80, 100).status).toBe('near');
    expect(budgetProgress(100, 100).status).toBe('reached');
    expect(budgetProgress(101, 100)).toMatchObject({ status: 'over', remaining: -1, percent: 101 });
    expect(budgetProgress(500, 0)).toMatchObject({ status: 'none', percent: 0 });
  });
  it('validates amount, month, group and mode', () => {
    const valid = budgets[0];
    expect(validateBudget(valid)).toBe(true);
    for (const limit_vnd of [-1, 0.5, NaN, 1000000000001]) expect(validateBudget({ ...valid, limit_vnd })).toBe(false);
    expect(validateBudget({ ...valid, limit_vnd: 0 })).toBe(true);
    expect(validateBudget({ ...valid, month: '2026-13' })).toBe(false);
    expect(validateBudget({ ...valid, category: ' ' })).toBe(false);
  });
  it('projects new expenses and edits moved between groups or months without double counting', () => {
    const expenses: Expense[] = [
      { id: 'a', spent_on: '2026-09-01', category: 'Ăn uống', amount_vnd: 100, description: 'A', created_at: '' },
      { id: 'b', spent_on: '2026-09-02', category: 'Đi lại', amount_vnd: 200, description: 'B', created_at: '' },
      { id: 'c', spent_on: '2026-10-01', category: 'Ăn uống', amount_vnd: 300, description: 'C', created_at: '' },
    ];
    const input = { spent_on: '2026-09-03', category: 'Ăn uống', amount_vnd: 50, description: 'New' };
    expect(projectedSpend(expenses, input, null)).toBe(150);
    expect(projectedSpend(expenses, input, 'a')).toBe(50);
    expect(projectedSpend(expenses, { ...input, category: 'Đi lại' }, 'a')).toBe(250);
    expect(projectedSpend(expenses, { ...input, spent_on: '2026-10-02' }, 'a')).toBe(350);
    expect(projectedSpend(expenses.filter(item => item.id !== 'a'), input, null)).toBe(50);
  });
});
