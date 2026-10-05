import { monthBounds, type Expense, type ExpenseInput } from './shared';

export interface Budget { category: string; month: string; mode: 'default' | 'override'; limit_vnd: number }
export function validateBudget(value: Budget): boolean {
  return Boolean(value.category.trim() && value.category.trim().length <= 40 && monthBounds(value.month)
    && (value.mode === 'default' || value.mode === 'override') && Number.isSafeInteger(value.limit_vnd)
    && value.limit_vnd >= 0 && value.limit_vnd <= 1_000_000_000_000);
}
export function effectiveBudget(budgets: Budget[], category: string, month: string): Budget | undefined {
  let base: Budget | undefined;
  let override: Budget | undefined;
  for (const budget of budgets) {
    if (budget.category !== category) continue;
    if (budget.mode === 'override' && budget.month === month) override = budget;
    if (budget.mode === 'default' && budget.month <= month && (!base || budget.month >= base.month)) base = budget;
  }
  return override ?? base;
}
export function budgetProgress(spent: number, limit: number) {
  const percent = limit > 0 ? spent / limit * 100 : 0;
  const status = limit <= 0 ? 'none' : spent > limit ? 'over' : spent === limit ? 'reached' : percent >= 80 ? 'near' : 'normal';
  const label = { none: 'Chưa đặt hạn mức', normal: 'Trong hạn mức', near: 'Sắp chạm hạn mức', reached: 'Đã chạm hạn mức', over: 'Vượt hạn mức' }[status];
  return { percent, status, label, remaining: limit - spent };
}
export function projectedSpend(expenses: Expense[], input: ExpenseInput, editing: string | null): number {
  const month = input.spent_on.slice(0, 7);
  return expenses.filter(item => item.id !== editing && item.category === input.category.trim() && item.spent_on.startsWith(month + '-'))
    .reduce((sum, item) => sum + item.amount_vnd, 0) + input.amount_vnd;
}
