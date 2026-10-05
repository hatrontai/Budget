import { useEffect, useState, type FormEvent } from 'react';
import AmountInput from './AmountInput';
import { budgetProgress, effectiveBudget, type Budget } from './budgets';
import { listBudgets, removeBudgetOverride, saveBudget } from './googleDrive';
import { formatVndInput } from './shared';

const money = (value: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value);
export default function BudgetPanel({ month, categories, budgets, spending, loading, error, onChange, onError }: {
  month: string; categories: string[]; budgets: Budget[]; spending: Map<string, number>; loading: boolean; error: string;
  onChange: (budgets: Budget[]) => void; onError: (cause: unknown) => void;
}) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState(categories[0] ?? 'Ăn uống');
  const [mode, setMode] = useState<Budget['mode']>('default');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');
  const [message, setMessage] = useState('');
  const groups = [...new Set([...categories, ...budgets.map(budget => budget.category)])].sort((a, b) => a.localeCompare(b, 'vi'));
  const hasOverride = budgets.some(budget => budget.category === category && budget.month === month && budget.mode === 'override');
  useEffect(() => { setOpen(false); setMessage(''); setLocalError(''); }, [month]);
  function editGroup(name: string) {
    const current = effectiveBudget(budgets, name, month);
    setCategory(name); setMode(current?.mode ?? 'default'); setAmount(current?.limit_vnd ? formatVndInput(String(current.limit_vnd)) : '');
    setOpen(true); setLocalError(''); setMessage('');
  }
  function changeGroup(name: string) {
    const current = effectiveBudget(budgets, name, month);
    setCategory(name); setMode(current?.mode ?? 'default'); setAmount(current?.limit_vnd ? formatVndInput(String(current.limit_vnd)) : '');
  }
  async function persist(action: 'save' | 'remove' | 'inherit') {
    const limit = Number(amount.replaceAll('.', ''));
    if (action === 'save' && (!Number.isSafeInteger(limit) || limit <= 0 || limit > 1_000_000_000_000)) {
      setLocalError('Nhập hạn mức nguyên VND lớn hơn 0, tối đa 1.000.000.000.000 ₫.'); return;
    }
    setBusy(true); setLocalError(''); setMessage('');
    try {
      if (action === 'inherit') await removeBudgetOverride(category, month);
      else await saveBudget({ category, month, mode, limit_vnd: action === 'remove' ? 0 : limit });
      onChange(await listBudgets());
      setMessage(action === 'inherit' ? 'Đã dùng lại mức mặc định.' : action === 'remove' ? 'Đã bỏ hạn mức.' : 'Đã lưu hạn mức.');
      setOpen(false);
    } catch (cause) { setLocalError((cause as Error).message); onError(cause); }
    finally { setBusy(false); }
  }
  function submit(event: FormEvent) { event.preventDefault(); void persist('save'); }
  return <section className="panel budget-panel" id="budgets" aria-busy={loading}>
    <div className="section-head"><div><p className="eyebrow">NGÂN SÁCH THÁNG</p><h2>Hạn mức theo nhóm</h2></div><button type="button" className="button secondary" disabled={loading || busy || Boolean(error)} onClick={() => open ? setOpen(false) : editGroup(category)} aria-expanded={open}>{open ? 'Đóng' : 'Đặt hạn mức'}</button></div>
    <p className="section-subtitle">Theo tháng đang xem · Cảnh báo khi dùng từ 80% hạn mức.</p>
    {error ? <p className="alert error" role="alert">Không tải được hạn mức: {error} Hãy bấm làm mới để thử lại.</p> : loading ? <p className="empty-copy">Đang tải hạn mức…</p> : <div className="budget-grid">{groups.map(name => {
      const current = effectiveBudget(budgets, name, month);
      const spent = spending.get(name) ?? 0;
      const progress = budgetProgress(spent, current?.limit_vnd ?? 0);
      return <article className={'budget-card budget-' + progress.status} key={name}>
        <div className="budget-card-head"><strong>{name}</strong><button type="button" className="text-button" disabled={busy} onClick={() => editGroup(name)}>Sửa</button></div>
        <p>Đã chi <strong>{money(spent)}</strong></p>
        <p>Hạn mức: <strong>{current?.limit_vnd ? money(current.limit_vnd) : 'Chưa đặt'}</strong>{current?.mode === 'override' && <small className="budget-scope">Riêng tháng này</small>}</p>
        {current?.limit_vnd ? <><div className="budget-track" role="progressbar" aria-label={'Hạn mức ' + name} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, progress.percent)} aria-valuetext={Math.round(progress.percent) + '% · ' + progress.label}><div style={{ width: Math.min(100, progress.percent) + '%' }} /></div><p className="budget-status">{progress.label} · {Math.round(progress.percent)}%</p><p>{progress.remaining < 0 ? 'Vượt ' + money(-progress.remaining) : 'Còn ' + money(progress.remaining)}</p></> : <p className="budget-status">{current ? 'Không áp dụng hạn mức' : progress.label}</p>}
      </article>;
    })}</div>}
    {open && <form className="entry-form budget-form" onSubmit={submit}>
      <p className="wide budget-form-title">Đặt hạn mức cho tháng {month.split('-').reverse().join('/')}</p>
      <label>Nhóm chi tiêu<select value={category} onChange={event => changeGroup(event.target.value)} disabled={busy}>{groups.map(name => <option key={name} value={name}>{name}</option>)}</select></label>
      <label>Áp dụng<select value={mode} onChange={event => {
        const nextMode = event.target.value as Budget['mode'];
        setMode(nextMode);
        const current = effectiveBudget(nextMode === 'default' ? budgets.filter(budget => budget.mode === 'default') : budgets, category, month);
        setAmount(current?.limit_vnd ? formatVndInput(String(current.limit_vnd)) : '');
      }} disabled={busy}><option value="default">Từ tháng này trở đi</option><option value="override">Chỉ tháng này</option></select></label>
      <label className="wide">Hạn mức (VND)<AmountInput value={amount} onChange={setAmount} label="Hạn mức (VND)" disabled={busy} /></label>
      {mode === 'default' && hasOverride && <p className="wide budget-hint">Tháng này đang dùng mức riêng. Chọn “Dùng lại mức mặc định” để áp dụng mức mặc định cho tháng này.</p>}
      <div className="form-actions wide"><button type="submit" className="button primary" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu hạn mức'}</button><button type="button" className="button secondary" onClick={() => void persist('remove')} disabled={busy}>Bỏ hạn mức</button>{hasOverride && <button type="button" className="button secondary" onClick={() => void persist('inherit')} disabled={busy}>Dùng lại mức mặc định</button>}</div>
    </form>}
    {localError && <p className="alert error" role="alert">{localError}</p>}
    {message && <p className="alert success" role="status">{message}</p>}
  </section>;
}
