import { useEffect, useState, type FormEvent } from 'react';
import AmountInput from './AmountInput';
import { budgetProgress, effectiveBudget, type Budget } from './budgets';
import { listBudgets, removeBudgetOverride, saveBudget } from './googleDrive';
import { formatVndInput } from './shared';

const money = (value: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value);
export default function BudgetPanel({ month, categories, budgets, spending, loading, error, onChange, onError, onCategoryChange, onCategoryEdit }: {
  month: string; categories: string[]; budgets: Budget[]; spending: Map<string, number>; loading: boolean; error: string;
  onCategoryEdit: (original: string, name: string, budget?: Budget) => Promise<void>;
  onCategoryChange: (name: string, active: boolean) => Promise<void>;
  onChange: (budgets: Budget[]) => void; onError: (cause: unknown) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [newGroup, setNewGroup] = useState('');
  const [open, setOpen] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [category, setCategory] = useState(categories[0] ?? 'Ăn uống');
  const [mode, setMode] = useState<Budget['mode']>('default');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');
  const [message, setMessage] = useState('');
  const groups = [...new Set(categories)].sort((a, b) => a.localeCompare(b, 'vi'));
  const totalLimit = groups.reduce((sum, name) => sum + (effectiveBudget(budgets, name, month)?.limit_vnd ?? 0), 0);
  const totalSpent = [...spending.values()].reduce((sum, amount) => sum + amount, 0);
  const totalProgress = budgetProgress(totalSpent, totalLimit);
  const hasOverride = budgets.some(budget => budget.category === category && budget.month === month && budget.mode === 'override');
  useEffect(() => { setOpen(false); setMessage(''); setLocalError(''); }, [month]);
  function editGroup(name: string) {
    const current = effectiveBudget(budgets, name, month);
    setCategory(name); setGroupName(name); setMode(current?.mode ?? 'default'); setAmount(current?.limit_vnd ? formatVndInput(String(current.limit_vnd)) : '');
    setOpen(true); setAdding(false); setLocalError(''); setMessage('');
  }
  async function persist(action: 'save' | 'remove' | 'inherit') {
    const limit = Number(amount.replaceAll('.', ''));
    const name = groupName.trim();
    const renameOnly = action === 'save' && name !== category && !amount && !effectiveBudget(budgets, category, month)?.limit_vnd;
    if (action === 'save' && (!name || name.length > 40)) { setLocalError('Tên nhóm phải có từ 1 đến 40 ký tự.'); return; }
    if (action === 'save' && !renameOnly && (!Number.isSafeInteger(limit) || limit <= 0 || limit > 1_000_000_000_000)) {
      setLocalError('Nhập hạn mức nguyên VND lớn hơn 0, tối đa 1.000.000.000.000 ₫.'); return;
    }
    setBusy(true); setLocalError(''); setMessage('');
    try {
      if (action === 'save') await onCategoryEdit(category, name, renameOnly ? undefined : { category: name, month, mode, limit_vnd: limit });
      else if (action === 'inherit') await removeBudgetOverride(category, month);
      else await saveBudget({ category, month, mode, limit_vnd: action === 'remove' ? 0 : limit });
      if (action !== 'save') onChange(await listBudgets());
      setMessage(action === 'inherit' ? 'Đã dùng lại mức mặc định.' : action === 'remove' ? 'Đã bỏ hạn mức.' : 'Đã lưu nhóm và hạn mức.');
      setOpen(false);
    } catch (cause) { setLocalError((cause as Error).message); onError(cause); }
    finally { setBusy(false); }
  }
  async function manageGroup(name: string, active: boolean) {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 40) { setLocalError('Tên nhóm phải có từ 1 đến 40 ký tự.'); return; }
    if (active && groups.some(group => group.toLocaleLowerCase('vi') === trimmed.toLocaleLowerCase('vi'))) { setLocalError('Nhóm này đã có trong danh sách.'); return; }
    setBusy(true); setLocalError(''); setMessage('');
    try {
      await onCategoryChange(trimmed, active);
      setMessage(active ? 'Đã thêm nhóm ' + trimmed + '.' : 'Đã xóa nhóm ' + trimmed + '. Các giao dịch cũ vẫn giữ trong lịch sử.');
      if (active) { setAdding(false); setNewGroup(''); editGroup(trimmed); }
      else if (category === trimmed) setOpen(false);
    } catch (cause) { setLocalError((cause as Error).message); onError(cause); }
    finally { setBusy(false); }
  }
  function submit(event: FormEvent) { event.preventDefault(); void persist('save'); }
  return <section className="panel budget-panel" id="budgets" aria-busy={loading}>
    <div className="section-head"><div><p className="eyebrow">NGÂN SÁCH THÁNG</p><h2>Hạn mức theo nhóm</h2></div><div className="budget-actions"><button type="button" className="button secondary" disabled={loading || busy || Boolean(error)} onClick={() => { setAdding(value => !value); setOpen(false); setLocalError(''); }} aria-expanded={adding}>＋ Thêm nhóm</button><button type="button" className="button secondary" disabled={loading || busy || Boolean(error) || !groups.length} onClick={() => open ? setOpen(false) : editGroup(groups.includes(category) ? category : groups[0])} aria-expanded={open}>{open ? 'Đóng' : 'Đặt hạn mức'}</button></div></div>
    <p className="section-subtitle">Theo tháng đang xem · Cảnh báo khi dùng từ 80% hạn mức.</p>
    {!loading && !error && <div className={'budget-summary budget-' + totalProgress.status}>
      <div className="budget-summary-metrics"><div><span>Tổng hạn mức</span><strong>{money(totalLimit)}</strong><small>Các nhóm đang hiển thị · tháng {month.split('-').reverse().join('/')}</small></div><div><span>Tổng đã chi</span><strong>{money(totalSpent)}</strong><small>Tất cả khoản chi trong tháng</small></div></div>
      <div className="budget-track" role="progressbar" aria-label="Tổng hạn mức tháng" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, totalProgress.percent)} aria-valuetext={totalLimit ? Math.round(totalProgress.percent) + '%' : 'Chưa đặt hạn mức'}><div style={{ width: Math.min(100, totalProgress.percent) + '%' }} /></div>
      <p className="budget-status">{totalLimit ? Math.round(totalProgress.percent) + '% · ' + (totalProgress.remaining < 0 ? 'Vượt ' + money(-totalProgress.remaining) : 'Còn ' + money(totalProgress.remaining)) : 'Chưa đặt hạn mức'}</p>
    </div>}
    {adding && <form className="entry-form category-form" onSubmit={event => { event.preventDefault(); void manageGroup(newGroup, true); }}><label className="wide">Tên nhóm mới<input value={newGroup} onChange={event => setNewGroup(event.target.value)} maxLength={40} placeholder="Ví dụ: Du lịch" required disabled={busy} autoFocus /></label><div className="form-actions wide"><button className="button primary" type="submit" disabled={busy}>Thêm nhóm</button><button className="button secondary" type="button" disabled={busy} onClick={() => setAdding(false)}>Hủy</button></div></form>}
    {error ? <p className="alert error" role="alert">Không tải được hạn mức: {error} Hãy bấm làm mới để thử lại.</p> : loading ? <p className="empty-copy">Đang tải hạn mức…</p> : <div className="budget-grid">{groups.map(name => {
      const current = effectiveBudget(budgets, name, month);
      const spent = spending.get(name) ?? 0;
      const progress = budgetProgress(spent, current?.limit_vnd ?? 0);
      return <article className={'budget-card budget-' + progress.status} key={name}>
        <div className="budget-card-head"><strong>{name}</strong><button type="button" className="text-button" disabled={busy} onClick={() => open && category === name ? setOpen(false) : editGroup(name)} aria-expanded={open && category === name} aria-label={'Sửa hạn mức nhóm ' + name}>Sửa</button><button type="button" className="text-button danger" disabled={busy} onClick={() => void manageGroup(name, false)} aria-label={'Xóa nhóm ' + name}>Xóa</button></div>
        <div className="budget-amounts"><span>Đã chi <strong>{money(spent)}</strong></span><span>{current?.limit_vnd ? ' / ' + money(current.limit_vnd) : 'Chưa đặt hạn mức'}</span></div>
        <div className="budget-track" role="progressbar" aria-label={'Hạn mức ' + name} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, progress.percent)} aria-valuetext={current?.limit_vnd ? Math.round(progress.percent) + '% · ' + progress.label : 'Chưa đặt hạn mức'}><div style={{ width: Math.min(100, progress.percent) + '%' }} /></div>
        <div className="budget-footer"><p className="budget-status">{current?.limit_vnd ? progress.label + ' · ' + Math.round(progress.percent) + '%' : current ? 'Không áp dụng hạn mức' : progress.label}</p>{current?.limit_vnd ? <p>{progress.remaining < 0 ? 'Vượt ' + money(-progress.remaining) : 'Còn ' + money(progress.remaining)}</p> : <button type="button" className="text-button" disabled={busy} onClick={() => editGroup(name)}>Đặt hạn mức</button>}</div>
        {current?.mode === 'override' && <small className="budget-scope">Riêng tháng này</small>}
        {open && category === name && <form className="entry-form budget-form" onSubmit={submit}>
          <p className="wide budget-form-title">Chỉnh sửa nhóm · tháng {month.split('-').reverse().join('/')}</p>
          <label>Tên nhóm<input type="text" value={groupName} onChange={event => setGroupName(event.target.value)} maxLength={40} required disabled={busy} autoFocus /></label>
          <label>Áp dụng<select value={mode} onChange={event => {
            const nextMode = event.target.value as Budget['mode'];
            setMode(nextMode);
            const current = effectiveBudget(nextMode === 'default' ? budgets.filter(budget => budget.mode === 'default') : budgets, category, month);
            setAmount(current?.limit_vnd ? formatVndInput(String(current.limit_vnd)) : '');
          }} disabled={busy}><option value="default">Từ tháng này trở đi</option><option value="override">Chỉ tháng này</option></select></label>
          <label className="wide">Hạn mức (VND)<AmountInput value={amount} onChange={setAmount} label="Hạn mức (VND)" disabled={busy} required={false} /></label>
          {mode === 'default' && hasOverride && <p className="wide budget-hint">Tháng này đang dùng mức riêng. Chọn “Dùng lại mức mặc định” để áp dụng mức mặc định cho tháng này.</p>}
          <div className="form-actions wide"><button type="submit" className="button primary" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu thay đổi'}</button><button type="button" className="button secondary" onClick={() => setOpen(false)} disabled={busy}>Hủy</button><button type="button" className="button secondary" onClick={() => void persist('remove')} disabled={busy}>Bỏ hạn mức</button>{hasOverride && <button type="button" className="button secondary" onClick={() => void persist('inherit')} disabled={busy}>Dùng lại mức mặc định</button>}</div>
          {localError && <p className="alert error wide" role="alert">{localError}</p>}
        </form>}
      </article>;
    })}{!groups.length && <p className="empty-copy">Chưa có nhóm. Bấm “Thêm nhóm” để bắt đầu.</p>}</div>}
    {localError && !open && <p className="alert error" role="alert">{localError}</p>}
    {message && <p className="alert success" role="status">{message}</p>}
  </section>;
}
