import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { CATEGORIES, formatVndInput, sortDailyCategories, summarize, type Expense, type ExpenseInput } from './shared';
import { connectGoogleDrive, disconnectGoogleDrive, listExpenses, addExpense, updateExpense, deleteExpense, DriveAuthError } from './googleDrive';
import './style.css';
import logo from './assets/logo.svg';
import AmountInput from './AmountInput';

const money = (amount: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(amount);
const dateLabel = (value: string) => value.split('-').reverse().join('/');
const PIE_COLORS = ['#e99679', '#8b78a4', '#a7bba6', '#e6ba71', '#8badb8', '#d393ac', '#6f98d3', '#c4a16d', '#73b5aa', '#bc83cf', '#d07c79', '#93a55c'];
const NEW_CATEGORY = '__new_category__';
function todayVietnam(): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const part = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  return part('year') + '-' + part('month') + '-' + part('day');
}
const today = todayVietnam();
const blank = (): ExpenseInput => ({ spent_on: todayVietnam(), amount_vnd: 0, description: '', category: CATEGORIES[0] });
function csvCell(value: string | number): string {
  let safe = String(value);
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(safe)) safe = "'" + safe;
  return '"' + safe.replaceAll('"', '""') + '"';
}
function moveMonth(month: string, by: number): string {
  const [year, number] = month.split('-').map(Number);
  const next = new Date(Date.UTC(year, number - 1 + by, 1));
  return next.getUTCFullYear() + '-' + String(next.getUTCMonth() + 1).padStart(2, '0');
}
function monthLabel(month: string): string {
  const [year, number] = month.split('-').map(Number);
  return 'Tháng ' + number + ' / ' + year;
}
function App() {
  const [unlocked, setUnlocked] = useState(false);
  const [driveUrl, setDriveUrl] = useState('');
  const [month, setMonth] = useState(today.slice(0, 7));
  const [refreshTick, setRefreshTick] = useState(0);
  const [items, setItems] = useState<Expense[]>([]);
  const [form, setForm] = useState<ExpenseInput>(blank);
  const [amountText, setAmountText] = useState('');
  const [customCategory, setCustomCategory] = useState(false);
  const [knownCategories, setKnownCategories] = useState<string[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [mobileSection, setMobileSection] = useState('overview');
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const summary = useMemo(() => summarize(items, month), [items, month]);
  const categories = [...summary.byCategory.entries()].sort((a, b) => b[1] - a[1]);
  const categoryChoices = [...new Set([...CATEGORIES, ...knownCategories, ...(form.category && !customCategory ? [form.category] : [])])];
  const categoryColors = new Map(categories.map(([name], index) => [name, PIE_COLORS[index] ?? `hsl(${(index * 137.5) % 360} 45% 58%)`]));
  let piePosition = 0;
  const pieGradient = categories.map(([name, amount]) => {
    const start = piePosition;
    piePosition += amount / summary.total * 100;
    return `${categoryColors.get(name)} ${start}% ${piePosition}%`;
  }).join(', ');
  const daysInMonth = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const key = month + '-' + String(i + 1).padStart(2, '0');
    const groups = sortDailyCategories(summary.byDayCategory.get(key), summary.byDayCategoryCount.get(key));
    return { day: i + 1, amount: summary.byDay.get(key) ?? 0, groups };
  });
  const maxDay = Math.max(1, ...days.map(d => d.amount));
  const maxCategory = Math.max(1, ...categories.map(c => c[1]));

  function report(cause: unknown) {
    if (cause instanceof DriveAuthError) { disconnectGoogleDrive(); setUnlocked(false); }
    setError((cause as Error).message);
  }
  useEffect(() => {
    if (!unlocked) return;
    let active = true;
    setLoading(true);
    listExpenses()
      .then(result => { if (active) { setItems(result.filter(item => item.spent_on.startsWith(month + '-'))); setKnownCategories([...new Set(result.map(item => item.category))]); setError(''); } })
      .catch(cause => { if (active) report(cause); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [unlocked, month, refreshTick]);
  useEffect(() => {
    if (!unlocked) return;
    const refresh = () => setRefreshTick(value => value + 1);
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [unlocked]);

  useEffect(() => { setSelectedDay(null); }, [month]);
  useEffect(() => {
    if (!unlocked) return;
    let frame = 0;
    const updateSection = () => {
      frame = 0;
      let current = 'overview';
      for (const id of ['overview', 'entry-form', 'charts', 'history']) {
        if ((document.getElementById(id)?.getBoundingClientRect().top ?? Infinity) <= 120) current = id;
      }
      setMobileSection(current);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(updateSection); };
    window.addEventListener('scroll', onScroll, { passive: true });
    updateSection();
    return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(frame); };
  }, [unlocked]);


  async function unlock() {
    setBusy(true); setError('');
    try {
      const url = await connectGoogleDrive();
      setDriveUrl(url);
      setUnlocked(true);
    } catch (cause) { report(cause); }
    finally { setBusy(false); }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setError(''); setMessage('');
    const amount = Number(form.amount_vnd);
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 1_000_000_000_000) { setError('Số tiền phải là số nguyên VND lớn hơn 0.'); return; }
    if (!form.description.trim() || !form.category.trim()) { setError('Vui lòng nhập nội dung và nhóm chi tiêu.'); return; }
    setBusy(true);
    try {
      if (editing) await updateExpense(editing, { ...form, amount_vnd: amount });
      else await addExpense({ ...form, amount_vnd: amount });
      setKnownCategories(current => [...new Set([...current, form.category.trim()])]);
      const targetMonth = form.spent_on.slice(0, 7);
      setEditing(null); setForm(blank()); setAmountText(''); setCustomCategory(false); setMessage(editing ? 'Đã cập nhật khoản chi.' : 'Đã ghi khoản chi.');
      if (targetMonth !== month) setMonth(targetMonth);
      else {
        setItems(await listExpenses(month));
      }
    } catch (e) { report(e); }
    finally { setBusy(false); }
  }
  function startEdit(item: Expense) {
    setEditing(item.id);
    setMobileSection('entry-form');
    setForm({ spent_on: item.spent_on, amount_vnd: item.amount_vnd, description: item.description, category: item.category });
    setAmountText(formatVndInput(String(item.amount_vnd)));
    setCustomCategory(false);
    setMessage(''); setError('');
    document.getElementById('entry-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  async function remove(item: Expense) {
    if (!window.confirm('Xóa khoản chi "' + item.description + '"?')) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await deleteExpense(item.id);
      setItems(current => current.filter(entry => entry.id !== item.id));
      if (editing === item.id) { setEditing(null); setForm(blank()); setAmountText(''); setCustomCategory(false); }
      setMessage('Đã xóa khoản chi.');
    } catch (e) { report(e); }
    finally { setBusy(false); }
  }
  async function exportCsv() {
    setError('');
    try {
      const all = await listExpenses();
      const lines = [['Ngày', 'Số tiền (VND)', 'Nội dung', 'Nhóm', 'Mã khoản chi', 'Ngày tạo'].map(csvCell).join(',')];
      for (const item of all) lines.push([item.spent_on, item.amount_vnd, item.description, item.category, item.id, item.created_at].map(csvCell).join(','));
      const url = URL.createObjectURL(new Blob(['\uFEFF' + lines.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url; link.download = 'so-chi-tieu.csv'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) { report(cause); }
  }
  function logout() {
    disconnectGoogleDrive(); setUnlocked(false); setDriveUrl(''); setItems([]); setKnownCategories([]); setEditing(null); setForm(blank()); setAmountText(''); setCustomCategory(false); setMessage(''); setError('');
  }

  if (!unlocked) return <main className="lock-shell">
    <div className="lock-decor lock-decor-one" /><div className="lock-decor lock-decor-two" />
    <section className="lock-card">
      <img className="brand-mark" src={logo} alt="Logo Sổ chi tiêu" width="48" height="48" />
      <p className="eyebrow">SỔ CHI TIÊU CỦA BẠN</p>
      <h1>Tiền đi đâu,<br /><em>mình biết rõ.</em></h1>
      <p className="lock-copy">Ghi lại từng khoản chi và nhìn toàn cảnh mỗi tháng. Dữ liệu của bạn nằm trong Google Sheets trên Drive.</p>
      {error && <p className="alert error" role="alert">{error}</p>}
      <button className="button primary full" onClick={unlock} disabled={busy}>{busy ? 'Đang kết nối…' : 'Kết nối Google Drive →'}</button>
      <p className="lock-foot">Chọn cùng tài khoản Google trên các thiết bị để xem chung một sổ.</p>
    </section>
  </main>;

  return <div className="app-shell">
    <header className="topbar">
      <div className="topbar-inner">
        <div className="brand"><img className="brand-mark small" src={logo} alt="" width="35" height="35" /><span>Sổ chi tiêu</span></div>
        <div className="top-actions desktop-actions">
          <a className="text-button" href={driveUrl} target="_blank" rel="noreferrer">↗ <span>Mở Drive</span></a>
          <button className="text-button" onClick={exportCsv}>↓ <span>Xuất CSV</span></button>
          <button className="text-button" onClick={logout}>Thoát</button>
        </div>
        <details className="mobile-menu">
          <summary aria-label="Mở menu tài khoản">⋯</summary>
          <div className="mobile-menu-items">
            <a href={driveUrl} target="_blank" rel="noreferrer">↗ Mở bảng tính Drive</a>
            <button onClick={exportCsv}>↓ Xuất dữ liệu CSV</button>
            <button onClick={logout}>Thoát tài khoản</button>
          </div>
        </details>
      </div>
    </header>
    <main className="container">
      <section className="hero" id="overview">
        <div><p className="eyebrow">QUẢN LÝ CHI TIÊU CÁ NHÂN</p><h1>Chi tiêu rõ ràng.<br /><em>Tháng nào cũng vậy.</em></h1><p>Ghi nhanh hôm nay, hiểu thói quen chi tiêu của mình mỗi ngày.</p></div>
        <div className="hero-graphic" aria-hidden="true"><span className="hero-coin">₫</span><span className="hero-spark one">✦</span><span className="hero-spark two">✳</span></div>
      </section>
      <div className="toolbar">
        <div><p className="eyebrow">TỔNG QUAN THÁNG</p><h2>{monthLabel(month)}</h2></div>
        <div className="month-actions"><button className="refresh-button" onClick={() => setRefreshTick(value => value + 1)} disabled={loading} aria-label="Làm mới dữ liệu" title="Làm mới dữ liệu">↻</button><div className="month-controls"><button aria-label="Tháng trước" onClick={() => setMonth(moveMonth(month, -1))}>‹</button><input aria-label="Chọn tháng" type="month" min="2000-01" max="2100-12" value={month} onChange={e => setMonth(e.target.value)} /><button aria-label="Tháng sau" onClick={() => setMonth(moveMonth(month, 1))}>›</button></div></div>
      </div>
      {error && <p className="alert error" role="alert">{error}</p>}
      {message && <p className="alert success" role="status">{message}</p>}
      <div className="summary-grid">
        <article className="total-card"><div className="card-top"><span>Tổng đã chi</span><span className="mini-icon">↗</span></div><strong>{money(summary.total)}</strong><span className="card-caption">trong {monthLabel(month).toLowerCase()}</span><div className="card-pattern" /></article>
        <article className="metric-card"><span className="metric-icon lavender">▤</span><span>Khoản chi</span><strong>{summary.count}</strong><small>lần ghi trong tháng</small></article>
        <article className="metric-card"><span className="metric-icon peach">◴</span><span>Ngày chi nhiều nhất</span><strong>{summary.byDay.size ? dateLabel([...summary.byDay.entries()].sort((a, b) => b[1] - a[1])[0][0]) : '—'}</strong><small>{summary.byDay.size ? money(Math.max(...summary.byDay.values())) : 'Chưa có dữ liệu'}</small></article>
      </div>
      <div className="content-grid">
        <section className="panel entry-panel" id="entry-form">
          <div className="section-head"><div><p className="eyebrow">GHI CHÉP</p><h2>{editing ? 'Sửa khoản chi' : 'Thêm khoản chi'}</h2></div><span className="head-icon">＋</span></div>
          <p className="section-subtitle">Một vài giây để ghi lại điều bạn vừa chi.</p>
          <form onSubmit={save} className="entry-form">
            <label>Ngày chi<input type="date" value={form.spent_on} onChange={e => setForm({ ...form, spent_on: e.target.value })} required /></label>
            <label>Số tiền (VND)<AmountInput value={amountText} onChange={value => { setAmountText(value); setForm(current => ({ ...current, amount_vnd: Number(value.replaceAll('.', '')) })); }} /></label>
            <label className="wide">Đã chi cho việc gì?<input type="text" maxLength={160} placeholder="Ví dụ: Cà phê buổi sáng" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} required /></label>
            <label className="wide">Nhóm chi tiêu<select value={customCategory ? NEW_CATEGORY : form.category} onChange={e => { const value = e.target.value; setCustomCategory(value === NEW_CATEGORY); setForm({ ...form, category: value === NEW_CATEGORY ? '' : value }); }}>{categoryChoices.map(c => <option key={c} value={c}>{c}</option>)}<option value={NEW_CATEGORY}>＋ Nhập nhóm mới…</option></select>{customCategory && <input type="text" maxLength={40} placeholder="Tên nhóm mới" aria-label="Tên nhóm mới" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} required />}</label>
            <div className="form-actions wide"><button type="submit" className="button primary" disabled={busy}>{busy ? 'Đang lưu…' : editing ? 'Lưu thay đổi' : '＋ Ghi khoản chi'}</button>{editing && <button type="button" className="button secondary" onClick={() => { setEditing(null); setForm(blank()); setAmountText(''); setCustomCategory(false); }}>Hủy sửa</button>}</div>
          </form>
        </section>
        <section className="panel chart-panel" id="charts">
          <div className="section-head"><div><p className="eyebrow">PHÂN BỔ CHI TIÊU</p><h2>Chi theo nhóm</h2></div><span className="head-icon">◔</span></div>
          {categories.length ? <div className="category-chart"><div className="pie-wrap"><div className="pie-chart" role="img" aria-label={'Biểu đồ tròn chi tiêu theo nhóm trong ' + monthLabel(month)} style={{ background: `conic-gradient(${pieGradient})` }}><div className="pie-center"><small>Tổng đã chi</small><strong>{money(summary.total)}</strong></div></div></div>{categories.map(([name, amount]) => <div className="category-row" key={name}><div className="category-line"><span><i className="category-dot" style={{ backgroundColor: categoryColors.get(name) }} />{name}</span><strong>{Math.round(amount / summary.total * 100)}% · {money(amount)}</strong></div><div className="bar-track"><div className="bar-fill" style={{ backgroundColor: categoryColors.get(name), width: Math.max(2, amount / maxCategory * 100) + '%' }} /></div></div>)}</div> : <EmptyChart />}
        </section>
      </div>
      <section className="panel daily-panel">
        <div className="section-head"><div><p className="eyebrow">NHỊP CHI TIÊU</p><h2>Chi theo ngày</h2></div><span className="head-icon">▥</span></div>
        {summary.count > 0 && <div className="daily-legend" aria-label="Chú thích nhóm chi tiêu">{categories.map(([name]) => <span key={name}><i className="category-dot" style={{ backgroundColor: categoryColors.get(name) }} />{name}</span>)}</div>}
        {summary.count ? <div className="daily-scroll"><div className="daily-chart" role="group" aria-label={'Biểu đồ chi tiêu theo ngày và nhóm trong ' + monthLabel(month)}>{days.map(d => {
          const label = 'Ngày ' + d.day + ': ' + money(d.amount) + (d.groups.length ? '. ' + d.groups.map(group => group.name + ' (' + group.count + ' lần): ' + money(group.amount)).join(', ') : ' — Không có khoản chi');
          return <button type="button" className={'day-column' + (selectedDay === d.day ? ' selected' : '')} key={d.day} aria-label={label} title={label} aria-pressed={selectedDay === d.day} onClick={() => setSelectedDay(d.day)}><div className="day-bar-space"><div className={'day-bar' + (d.amount ? ' active' : '')} style={{ height: d.amount ? Math.max(8, d.amount / maxDay * 100) + '%' : '3px' }}>{d.groups.map(group => <span key={group.name} className="day-segment" style={{ height: group.amount / d.amount * 100 + '%', backgroundColor: categoryColors.get(group.name) }} />)}</div></div><span>{d.day}</span></button>;
        })}</div></div> : <EmptyChart />}
        {summary.count > 0 && <div className="day-detail" aria-live="polite">{selectedDay ? <><strong>Ngày {selectedDay}: {money(days[selectedDay - 1].amount)}</strong><div className="day-breakdown">{days[selectedDay - 1].groups.length ? days[selectedDay - 1].groups.map(group => <span key={group.name}><i className="category-dot" style={{ backgroundColor: categoryColors.get(group.name) }} />{group.name} · {group.count} lần: <b>{money(group.amount)}</b></span>) : <span>Không có khoản chi trong ngày này.</span>}</div></> : 'Chạm vào cột để xem số tiền theo nhóm của ngày đó.'}</div>}

      </section>
      <section className="panel history-panel" id="history">
        <div className="section-head"><div><p className="eyebrow">LỊCH SỬ</p><h2>Các khoản đã ghi <span className="count-pill">{summary.count}</span></h2></div></div>
        {loading ? <p className="empty-copy">Đang tải dữ liệu…</p> : items.length ? <div className="table-wrap"><table><thead><tr><th>Ngày</th><th>Nội dung</th><th>Nhóm</th><th>Số tiền</th><th aria-label="Thao tác" /></tr></thead><tbody>{items.map(item => <tr key={item.id}><td>{dateLabel(item.spent_on)}</td><td className="description-cell">{item.description}</td><td><span className="tag">{item.category}</span></td><td className="amount-cell">{money(item.amount_vnd)}</td><td className="row-actions"><button onClick={() => startEdit(item)} disabled={busy}>Sửa</button><button className="danger" onClick={() => remove(item)} disabled={busy}>Xóa</button></td></tr>)}</tbody></table></div> : <div className="empty-history"><span>✎</span><strong>Chưa có khoản chi nào</strong><p>Thêm khoản chi đầu tiên để bắt đầu theo dõi {monthLabel(month).toLowerCase()}.</p></div>}
      </section>
      <footer>Ghi chép đều đặn, hiểu tiền của mình hơn mỗi ngày.</footer>
    </main>
    <nav className="mobile-nav" aria-label="Điều hướng sổ chi tiêu">
      {[
        ['overview', 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z', 'Tổng quan'], ['entry-form', 'M12 4v16 M4 12h16', 'Ghi chi'],
        ['charts', 'M12 3v9h9 M9 3.5a9 9 0 1 0 11.5 11.5 M15 3.5a9 9 0 0 1 5.5 5.5H15z', 'Biểu đồ'], ['history', 'M8 5h13 M8 12h13 M8 19h13 M3 5h.01 M3 12h.01 M3 19h.01', 'Lịch sử'],
      ].map(([id, icon, label]) => <a key={id} href={'#' + id} className={mobileSection === id ? 'active' : ''} aria-current={mobileSection === id ? 'location' : undefined} onClick={() => setMobileSection(id)}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={icon}/></svg>{label}</a>)}
    </nav>
  </div>;
}
function EmptyChart() { return <div className="empty-chart"><span>◌</span><p>Chưa có dữ liệu trong tháng này.<br />Hãy thêm khoản chi để xem biểu đồ.</p></div>; }
export default App;
