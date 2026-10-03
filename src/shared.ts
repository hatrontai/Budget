export interface Expense {
  id: string;
  spent_on: string;
  amount_vnd: number;
  description: string;
  category: string;
  created_at: string;
}

export type ExpenseInput = Pick<Expense, 'spent_on' | 'amount_vnd' | 'description' | 'category'>;

export const CATEGORIES = ['Ăn uống', 'Đi lại', 'Mua sắm', 'Nhà cửa', 'Hóa đơn', 'Sức khỏe', 'Giải trí', 'Khác'];

export function formatVndInput(value: string): string {
  const digits = value.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function validateExpense(value: unknown): ExpenseInput | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, unknown>;
  if (typeof input.spent_on !== 'string' || !isValidDate(input.spent_on)) return null;
  if (typeof input.amount_vnd !== 'number' || !Number.isSafeInteger(input.amount_vnd) || input.amount_vnd < 1 || input.amount_vnd > 1_000_000_000_000) return null;
  if (typeof input.description !== 'string' || !input.description.trim() || input.description.trim().length > 160) return null;
  if (typeof input.category !== 'string' || !input.category.trim() || input.category.trim().length > 40) return null;
  return {
    spent_on: input.spent_on,
    amount_vnd: input.amount_vnd,
    description: input.description.trim(),
    category: input.category.trim(),
  };
}

export function monthBounds(month: string): [string, string] | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
  const [year, number] = month.split('-').map(Number);
  if (year < 2000 || year > 2100) return null;
  const next = number === 12 ? `${year + 1}-01` : `${year}-${String(number + 1).padStart(2, '0')}`;
  return [`${month}-01`, `${next}-01`];
}

export function sortDailyCategories(amounts?: Map<string, number>, counts?: Map<string, number>) {
  return [...(amounts ?? new Map<string, number>())]
    .map(([name, amount]) => ({ name, amount, count: counts?.get(name) ?? 0 }))
    .sort((a, b) => b.count - a.count || b.amount - a.amount || a.name.localeCompare(b.name, 'vi'));
}

export function summarize(expenses: Expense[], month: string) {
  const byCategory = new Map<string, number>();
  const byDay = new Map<string, number>();
  const byDayCategory = new Map<string, Map<string, number>>();
  const byDayCategoryCount = new Map<string, Map<string, number>>();
  let total = 0;
  for (const expense of expenses) {
    if (!expense.spent_on.startsWith(`${month}-`)) continue;
    total += expense.amount_vnd;
    byCategory.set(expense.category, (byCategory.get(expense.category) ?? 0) + expense.amount_vnd);
    byDay.set(expense.spent_on, (byDay.get(expense.spent_on) ?? 0) + expense.amount_vnd);
    const dailyGroups = byDayCategory.get(expense.spent_on) ?? new Map<string, number>();
    dailyGroups.set(expense.category, (dailyGroups.get(expense.category) ?? 0) + expense.amount_vnd);
    byDayCategory.set(expense.spent_on, dailyGroups);
    const dailyCounts = byDayCategoryCount.get(expense.spent_on) ?? new Map<string, number>();
    dailyCounts.set(expense.category, (dailyCounts.get(expense.category) ?? 0) + 1);
    byDayCategoryCount.set(expense.spent_on, dailyCounts);
  }
  return { total, byCategory, byDay, byDayCategory, byDayCategoryCount, count: expenses.filter((item) => item.spent_on.startsWith(`${month}-`)).length };
}
