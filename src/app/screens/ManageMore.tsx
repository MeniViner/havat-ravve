import { useEffect, useMemo, useState } from 'react';
import type { Actor, Settings, Visit, Donation, CalendarItem, AppNotification, RegistrationField, Task } from '../types';
import { VISIT_LABELS, PAYMENT_LABELS } from '../types';
import { useVisits, setVisitStatus, useDonations, setDonation, useCalendar, saveCalendarItem, deleteCalendarItem, upsertCalendarRef, deleteCalendarRef, useNotifications, useHandledNotifications, handleNotification, saveSettings, useOpenTabs, downloadCsv, fillTemplate, waLink } from '../data';
import { useHistoryTasks } from '../store';
import { Icon, Sheet, Button, Empty, Segmented, Avatar, useToast, fmtDate, fmtDayLong, relTime } from '../ui';
import { navigate, back } from '../router';
import { ActivityList } from './History';
import { todayKey, dateKeyOf } from '../firebase';

type Ctx = { actor: Actor; manager: boolean; settings: Settings };
const Back = ({ to = '/manage' }: { to?: string }) => <div className="topbar-actions"><button type="button" className="icon-btn ghost" onClick={() => back(to)} aria-label="חזרה"><Icon name="back" /></button></div>;

// ---------- inbox ----------
const typeIcon: Record<string, string> = { visit: 'pin', donation: 'sparkle', join: 'people', order: 'list', receipt: 'info', tab: 'cart', claim: 'check' };
const typeLabel: Record<string, string> = { visit: 'ביקורים', donation: 'תרומות', join: 'הצטרפות', order: 'הזמנות', receipt: 'קבלות', tab: 'דוכן', claim: 'תשלומים' };
export function InboxScreen({ ctx }: { ctx: Ctx }) {
  const openAll = useNotifications(true);
  const handled = useHandledNotifications(true);
  const [showHandled, setShowHandled] = useState(false);
  const [type, setType] = useState<string>('all');
  const types = useMemo(() => [...new Set(openAll.items.map((n) => n.type))], [openAll.items]);
  const open = { ...openAll, items: openAll.items.filter((n) => type === 'all' || n.type === type) };
  const Row = ({ n }: { n: AppNotification }) => (
    <div className="row">
      <span className="icon-btn ghost" style={{ width: 34, height: 34, color: n.handled ? 'var(--faint)' : 'var(--olive)' }}><Icon name={typeIcon[n.type] || 'info'} size={20} /></span>
      <div className="row-main"><div className="row-title" style={{ color: n.handled ? 'var(--muted)' : undefined }}>{n.title}</div><div className="row-meta"><span>{n.text}</span><span>{relTime(n.createdAt)}</span>{n.handled && n.handledBy && <span>טופל · {n.handledBy.name}</span>}</div>
        <div className="row-actions">{n.link && <Button kind="secondary" className="sm" onClick={() => navigate(n.link)}>פתיחה</Button>}<Button kind="quiet" className="sm" onClick={() => handleNotification(n, ctx.actor, !n.handled)}>{n.handled ? 'החזרה לתור' : 'טופל'}</Button></div></div>
    </div>
  );
  return (
    <>
      <header className="topbar"><div><h1>התראות</h1><div className="sub">{openAll.items.length ? `${openAll.items.length} ממתינות לטיפול` : 'הכל טופל'}</div></div><Back /></header>
      {types.length > 1 && <div className="chips" style={{ marginBottom: 12 }}><button type="button" className={'chip ' + (type === 'all' ? 'on' : '')} onClick={() => setType('all')}>הכל · {openAll.items.length}</button>{types.map((t) => <button key={t} type="button" className={'chip ' + (type === t ? 'on' : '')} onClick={() => setType(t)}>{typeLabel[t] || t} · {openAll.items.filter((n) => n.type === t).length}</button>)}</div>}
      {!open.items.length ? <Empty title="אין מה לטפל" text="בקשות ביקור, תרומות, הזמנות ומתנדבים חדשים יופיעו כאן." icon="check" /> : <div className="list">{open.items.map((n) => <Row key={n.id} n={n} />)}</div>}
      <div className="section"><div className="section-head"><h2>טופלו</h2><button type="button" onClick={() => setShowHandled(!showHandled)}>{showHandled ? 'הסתרה' : 'הצגה'}</button></div>{showHandled && (handled.items.length ? <div className="list">{handled.items.map((n) => <Row key={n.id} n={n} />)}</div> : <p className="hint">עדיין לא.</p>)}</div>
    </>
  );
}

// ---------- visits ----------
export function VisitsScreen({ ctx }: { ctx: Ctx }) {
  const { items, loading } = useVisits(true);
  const [filter, setFilter] = useState<'new' | 'approved' | 'all'>('new');
  const [sel, setSel] = useState<Visit | null>(null);
  const [note, setNote] = useState('');
  const toast = useToast();
  useEffect(() => { setNote(sel?.managerNote || ''); }, [sel?.id]);
  const list = items.filter((v) => filter === 'all' || v.status === filter);
  const live = sel ? items.find((v) => v.id === sel.id) || sel : null;
  const decide = async (v: Visit, status: 'approved' | 'rejected') => {
    try {
      await setVisitStatus(v, ctx.actor, status, note);
      if (status === 'approved') await upsertCalendarRef(ctx.actor, 'visit', v.id, { title: `ביקור: ${v.name} (${v.people})`, date: v.date, time: '' }); else await deleteCalendarRef('visit', v.id);
      toast({ text: status === 'approved' ? 'אושר ונכנס ליומן' : 'סומן: לא מתאים' }, 2500);
    } catch { toast({ text: 'לא נשמר', kind: 'error' }); }
  };
  return (
    <>
      <header className="topbar"><div><h1>ביקורים</h1><div className="sub">{items.filter((v) => v.status === 'new').length} בקשות חדשות</div></div><Back /></header>
      <Segmented value={filter} onChange={setFilter} options={[{ value: 'new', label: 'חדשות', count: items.filter((v) => v.status === 'new').length }, { value: 'approved', label: 'מאושרים' }, { value: 'all', label: 'הכל' }]} />
      {loading && !items.length ? <div className="loading">טוען…</div> : !list.length ? <Empty title="אין בקשות" icon="pin" /> : <div className="list">{list.map((v) => (
        <button type="button" className="row" key={v.id} onClick={() => setSel(v)}><Avatar name={v.name} size={38} /><div className="row-main"><div className="row-title">{v.name} <span className="hint">· {v.people} אנשים</span></div><div className="row-meta"><span>{fmtDate(v.date)}</span><span>{v.type}</span><span className={'tag ' + (v.status === 'approved' ? 'ok' : v.status === 'new' ? 'warn' : '')}>{VISIT_LABELS[v.status]}</span></div>{v.note && <div className="hint">{v.note}</div>}</div><span className="row-end"><Icon name="chev" size={18} /></span></button>
      ))}</div>}
      <Sheet open={!!live} onClose={() => setSel(null)} title={live?.name}>
        {live && (
          <>
            <div className="detail-list">
              <div className="kv"><Icon name="clock" size={18} /><div>{fmtDayLong(live.date)} · {live.people} אנשים · {live.type}</div></div>
              {live.note && <div className="kv"><Icon name="info" size={18} /><div className="note">{live.note}</div></div>}
              <div className="kv"><Icon name="phone" size={18} /><div dir="ltr" style={{ textAlign: 'end' }}>{live.phone || '—'}</div></div>
              <div className="kv"><Icon name="check" size={18} /><div><span className={'tag ' + (live.status === 'approved' ? 'ok' : live.status === 'new' ? 'warn' : '')}>{VISIT_LABELS[live.status]}</span>{live.handledBy && <span className="hint"> · {live.handledBy.name}</span>}</div></div>
            </div>
            <div className="row-actions" style={{ marginTop: 14 }}>
              {live.phone && <a className="btn secondary sm" href={`tel:${live.phone}`}>התקשרות</a>}
              {live.phone && <a className="btn secondary sm" href={waLink(live.phone, live.status === 'approved' ? fillTemplate(ctx.settings.templates.visitApproved, { 'שם': live.name, 'תאריך': fmtDate(live.date) }) : `שלום ${live.name}, לגבי הביקור בחוות רווה ב־${fmtDate(live.date)}:`)} target="_blank" rel="noopener">{live.status === 'approved' ? 'אשר בוואטסאפ' : 'וואטסאפ'}</a>}
            </div>
            <label className="field" style={{ marginTop: 16 }}><span>הערה (האורח רואה)</span><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="למשל: נפגשים בשער ב־10:00" /></label>
            <div className="sheet-foot"><Button kind="primary" onClick={() => decide(live, 'approved')}><Icon name="check" />אישור</Button><Button kind="quiet" onClick={() => decide(live, 'rejected')}>לא מתאים</Button></div>
          </>
        )}
      </Sheet>
    </>
  );
}

// ---------- donations ----------
export function DonationsScreen({ ctx }: { ctx: Ctx }) {
  const { items, loading } = useDonations(true);
  const [filter, setFilter] = useState<'pending' | 'receipt' | 'all'>('pending');
  const today = todayKey();
  const sums = useMemo(() => {
    const paid = items.filter((d) => d.paymentStatus === 'paid');
    return { month: paid.filter((d) => d.createdAt.slice(0, 7) === today.slice(0, 7)).reduce((s, d) => s + d.amount, 0), year: paid.filter((d) => d.createdAt.slice(0, 4) === today.slice(0, 4)).reduce((s, d) => s + d.amount, 0), pending: items.filter((d) => d.paymentStatus === 'pending' || d.paymentStatus === 'claimed').reduce((s, d) => s + d.amount, 0) };
  }, [items]);
  const list = items.filter((d) => filter === 'all' || (filter === 'pending' ? d.paymentStatus === 'pending' || d.paymentStatus === 'claimed' : d.receiptWanted && !d.receiptSent));
  const exportCsv = () => downloadCsv('תרומות.csv', ['תאריך', 'שם', 'טלפון', 'סכום', 'כותרת', 'הנצחה', 'הערה', 'מצב', 'קבלה'], items.map((d) => [fmtDate(d.createdAt), d.name, d.phone, d.amount, d.label, d.memorial, d.note, PAYMENT_LABELS[d.paymentStatus], d.receiptWanted ? (d.receiptSent ? 'נשלחה' : `ממתין: ${d.receiptName}`) : '']));
  return (
    <>
      <header className="topbar"><div><h1>תרומות</h1><div className="sub">החודש {sums.month} ₪ · השנה {sums.year} ₪</div></div><Back /></header>
      <div className="stats-grid"><div className="stat"><b>{sums.month} ₪</b><span>החודש</span></div><div className="stat"><b>{sums.year} ₪</b><span>השנה</span></div><div className="stat"><b>{sums.pending} ₪</b><span>ממתין לאישור</span></div></div>
      <Segmented value={filter} onChange={setFilter} options={[{ value: 'pending', label: 'ממתינות', count: items.filter((d) => d.paymentStatus === 'pending' || d.paymentStatus === 'claimed').length }, { value: 'receipt', label: 'צריך קבלה', count: items.filter((d) => d.receiptWanted && !d.receiptSent).length }, { value: 'all', label: 'הכל' }]} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}><Button kind="quiet" className="sm" onClick={exportCsv}><Icon name="download" />אקסל</Button></div>
      {loading && !items.length ? <div className="loading">טוען…</div> : !list.length ? <Empty title="אין תרומות ברשימה" icon="sparkle" /> : <div className="list">{list.map((d) => (
        <div className="row" key={d.id}><div className="row-main">
          <div className="row-title">{d.name} <span className="hint">· {d.amount} ₪{d.label ? ` · ${d.label}` : ''}</span></div>
          <div className="row-meta"><span>{fmtDate(d.createdAt)}</span><span className={'tag ' + (d.paymentStatus === 'paid' ? 'ok' : d.paymentStatus === 'claimed' ? 'warn' : 'bad')}>{PAYMENT_LABELS[d.paymentStatus]}</span>{d.memorial && <span>לזכר {d.memorial}</span>}{d.receiptWanted && <span className={'tag ' + (d.receiptSent ? 'ok' : 'warn')}>{d.receiptSent ? 'קבלה נשלחה' : `קבלה: ${d.receiptName}`}</span>}</div>
          {d.note && <div className="hint">{d.note}</div>}
          <div className="row-actions">
            {(d.paymentStatus === 'pending' || d.paymentStatus === 'claimed') && <Button kind="secondary" className="sm" onClick={() => setDonation(ctx.actor, d, { paymentStatus: 'paid' })}>אישור תשלום</Button>}
            {d.receiptWanted && !d.receiptSent && <Button kind="secondary" className="sm" onClick={() => setDonation(ctx.actor, d, { receiptSent: true })}>הקבלה נשלחה</Button>}
            {d.phone && <a className="btn quiet sm" href={waLink(d.phone, fillTemplate(ctx.settings.templates.donationThanks, { 'שם': d.name }))} target="_blank" rel="noopener">תודה בוואטסאפ</a>}
          </div>
        </div></div>
      ))}</div>}
    </>
  );
}

// ---------- calendar ----------
export function CalendarScreen({ ctx }: { ctx: Ctx }) {
  const [month, setMonth] = useState(todayKey().slice(0, 7));
  const from = month + '-01', to = month + '-31';
  const { items } = useCalendar(true, from, to);
  const [editing, setEditing] = useState<CalendarItem | 'new' | null>(null);
  const [f, setF] = useState({ title: '', date: todayKey(), time: '' });
  const toast = useToast();
  useEffect(() => { if (editing === 'new') setF({ title: '', date: todayKey(), time: '' }); else if (editing) setF({ title: editing.title, date: editing.date, time: editing.time }); }, [editing]);
  const days = useMemo(() => { const m = new Map<string, CalendarItem[]>(); for (const i of [...items].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))) (m.get(i.date) || m.set(i.date, []).get(i.date)!).push(i); return [...m.entries()]; }, [items]);
  const shift = (n: number) => { const d = new Date(month + '-01T12:00:00'); d.setMonth(d.getMonth() + n); setMonth(dateKeyOf(d).slice(0, 7)); };
  const color = (uid: string) => { let h = 0; for (const c of uid) h = (h * 31 + c.charCodeAt(0)) % 360; return `oklch(0.75 0.09 ${h})`; };
  return (
    <>
      <header className="topbar"><div><h1>יומן</h1><div className="sub">מי בחווה ומתי. כל מנהל בצבע שלו.</div></div><Back /></header>
      <div className="month-nav"><button type="button" className="icon-btn ghost" onClick={() => shift(1)} aria-label="חודש הבא"><span style={{ display: 'inline-flex', transform: 'scaleX(-1)' }}><Icon name="back" /></span></button><b>{new Date(month + '-01T12:00:00').toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })}</b><button type="button" className="icon-btn ghost" onClick={() => shift(-1)} aria-label="חודש קודם"><Icon name="back" /></button></div>
      {!days.length ? <Empty title="אין פריטים בחודש הזה" text="ביקורים מאושרים ואירועים נכנסים לבד. אפשר להוסיף פגישות ולו״ז." icon="clock" /> : days.map(([day, list]) => (
        <div className="day-group" key={day}><h3 style={{ color: day === todayKey() ? 'var(--gold-2)' : undefined }}>{fmtDayLong(day)}</h3><div className="list">{list.map((i) => (
          <button type="button" className="row" key={i.id} onClick={() => i.kind === 'manual' ? setEditing(i) : navigate(i.kind === 'visit' ? '/manage/visits' : `/manage/events/${i.refId}`)}><span className="cal-dot" style={{ background: color(i.ownerUid) }} /><div className="row-main"><div className="row-title">{i.title}</div><div className="row-meta">{i.time && <span>{i.time}</span>}<span>{i.ownerName}</span><span>{i.kind === 'visit' ? 'ביקור' : i.kind === 'event' ? 'אירוע' : ''}</span></div></div></button>
        ))}</div></div>
      ))}
      <button type="button" className="fab" onClick={() => setEditing('new')}><Icon name="plus" />ליומן</button>
      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'פריט ביומן' : 'עריכה'}>
        <label className="field"><span>מה</span><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="למשל: פגישת צוות, אני בחווה" /></label>
        <div className="two"><label className="field"><span>תאריך</span><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} dir="ltr" /></label><label className="field"><span>שעה (לא חובה)</span><input type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} dir="ltr" /></label></div>
        <div className="sheet-foot"><Button kind="primary" onClick={async () => { if (!f.title.trim() || !f.date) return; try { await saveCalendarItem(ctx.actor, f, editing === 'new' ? undefined : editing!); setEditing(null); } catch { toast({ text: 'לא נשמר', kind: 'error' }); } }}>שמירה</Button>{editing !== 'new' && editing && <Button kind="quiet" onClick={async () => { await deleteCalendarItem(editing.id); setEditing(null); }}><Icon name="trash" />מחיקה</Button>}</div>
      </Sheet>
    </>
  );
}

// ---------- reports ----------
export function ReportsScreen({ ctx }: { ctx: Ctx }) {
  const [days, setDays] = useState<'30' | '90' | '365'>('30');
  const from = useMemo(() => new Date(Date.now() - Number(days) * 86400_000).toISOString(), [days]);
  const to = useMemo(() => new Date(Date.now() + 86400_000).toISOString(), [days]);
  const tasks = useHistoryTasks(true, true, from, to);
  const donations = useDonations(true);
  const tabs = useOpenTabs(true);
  const byPerson = useMemo(() => { const m = new Map<string, number>(); for (const t of tasks.items) if (t.doneBy) m.set(t.doneBy.name, (m.get(t.doneBy.name) || 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]); }, [tasks.items]);
  const dSum = donations.items.filter((d) => d.paymentStatus === 'paid' && d.createdAt >= from).reduce((s, d) => s + d.amount, 0);
  const debts = tabs.items;
  return (
    <>
      <header className="topbar"><div><h1>דוחות</h1></div><Back /></header>
      <Segmented value={days} onChange={setDays} options={[{ value: '30', label: 'חודש' }, { value: '90', label: '3 חודשים' }, { value: '365', label: 'שנה' }]} />
      <div className="stats-grid"><div className="stat"><b>{tasks.items.length}</b><span>משימות בוצעו</span></div><div className="stat"><b>{dSum} ₪</b><span>תרומות ששולמו</span></div><div className="stat"><b>{debts.reduce((s, t) => s + t.total, 0)} ₪</b><span>חובות דוכן פתוחים</span></div></div>
      <div className="section"><div className="section-head"><h2>מי ביצע</h2><button type="button" onClick={() => downloadCsv('משימות.csv', ['תאריך', 'משימה', 'מי ביצע', 'מי יצר', 'מיקום'], tasks.items.map((t: Task) => [fmtDate(t.doneAt), t.title, t.doneBy?.name || '', t.createdBy.name, t.location?.placeName || '']))}>ייצוא</button></div>
        {!byPerson.length ? <p className="hint">אין משימות בתקופה.</p> : <div className="list">{byPerson.map(([n, c]) => <div className="row" key={n}><Avatar name={n} size={34} /><div className="row-main"><div className="row-title">{n}</div></div><b>{c}</b></div>)}</div>}
      </div>
      <div className="section"><div className="section-head"><h2>חובות דוכן פתוחים, כל האירועים</h2></div>
        {!debts.length ? <p className="hint">אין חובות פתוחים.</p> : <div className="list">{debts.map((t) => <div className="row" key={t.id}><div className="row-main"><div className="row-title">{t.guestName} <span className="hint">· {t.eventTitle}</span></div><div className="row-meta"><span>{relTime(t.updatedAt)}</span></div></div><b>{t.total} ₪</b>{t.guestPhone && <a className="btn quiet sm" href={waLink(t.guestPhone, fillTemplate(ctx.settings.templates.debtReminder, { 'שם': t.guestName, 'אירוע': t.eventTitle, 'סכום': t.total }))} target="_blank" rel="noopener">תזכורת</a>}</div>)}</div>}
      </div>
    </>
  );
}

// ---------- settings ----------
export function SettingsScreen({ ctx }: { ctx: Ctx }) {
  const [s, setS] = useState<Settings>(ctx.settings);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  useEffect(() => setS(ctx.settings), [ctx.settings]);
  const save = async () => { setBusy(true); try { await saveSettings(ctx.actor, { ...s, donationPresets: s.donationPresets.filter((p) => p.amount > 0), visitTypes: s.visitTypes.filter(Boolean), registrationFields: s.registrationFields.filter((f) => f.label.trim()) }); toast({ text: 'נשמר' }, 2000); } catch { toast({ text: 'לא נשמר', kind: 'error' }); } finally { setBusy(false); } };
  const setField = (i: number, patch: Partial<RegistrationField>) => setS({ ...s, registrationFields: s.registrationFields.map((f, j) => j === i ? { ...f, ...patch } : f) });
  return (
    <>
      <header className="topbar"><div><h1>הגדרות</h1></div><Back /></header>
      <div className="card" style={{ padding: 16 }}>
        <h3 className="h3">מה אורח רואה בכניסה</h3>
        <label className="field"><span>משפט פתיחה</span><textarea value={s.guestIntro} onChange={(e) => setS({ ...s, guestIntro: e.target.value })} /></label>
        <h3 className="h3">תשלומים</h3>
        <p className="hint" style={{ marginBottom: 10 }}>מה שמוצג לאורח כשצריך לשלם. סליקת אשראי תחובר בהמשך.</p>
        <div className="two"><label className="field"><span>מספר ביט</span><input value={s.payment.bit} onChange={(e) => setS({ ...s, payment: { ...s.payment, bit: e.target.value } })} dir="ltr" inputMode="tel" /></label><label className="field"><span>PayBox</span><input value={s.payment.paybox} onChange={(e) => setS({ ...s, payment: { ...s.payment, paybox: e.target.value } })} dir="ltr" /></label></div>
        <div className="toggle"><div>מזומן בכניסה</div><button type="button" role="switch" aria-checked={s.payment.cash} className="switch" aria-label="מזומן" onClick={() => setS({ ...s, payment: { ...s.payment, cash: !s.payment.cash } })} /></div>
        <label className="field"><span>הערה לתשלום (לא חובה)</span><input value={s.payment.note} onChange={(e) => setS({ ...s, payment: { ...s.payment, note: e.target.value } })} placeholder="למשל: לציין את שם האירוע בהעברה" /></label>
        <h3 className="h3">סכומי תרומה</h3>
        {s.donationPresets.map((p, i) => <div key={i} className="two" style={{ alignItems: 'center' }}><input value={p.amount || ''} onChange={(e) => setS({ ...s, donationPresets: s.donationPresets.map((x, j) => j === i ? { ...x, amount: Number(e.target.value.replace(/\D/g, '')) || 0 } : x) })} inputMode="numeric" dir="ltr" placeholder="₪" /><div style={{ display: 'flex', gap: 6 }}><input value={p.label} onChange={(e) => setS({ ...s, donationPresets: s.donationPresets.map((x, j) => j === i ? { ...x, label: e.target.value } : x) })} placeholder="כותרת" /><button type="button" className="icon-btn ghost" aria-label="הסרה" onClick={() => setS({ ...s, donationPresets: s.donationPresets.filter((_, j) => j !== i) })}><Icon name="x" size={18} /></button></div></div>)}
        <Button kind="quiet" className="sm" onClick={() => setS({ ...s, donationPresets: [...s.donationPresets, { amount: 0, label: '' }] })}><Icon name="plus" />סכום</Button>
        <h3 className="h3">סוגי ביקור</h3>
        {s.visitTypes.map((t, i) => <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 8 }}><input value={t} onChange={(e) => setS({ ...s, visitTypes: s.visitTypes.map((x, j) => j === i ? e.target.value : x) })} /><button type="button" className="icon-btn ghost" aria-label="הסרה" onClick={() => setS({ ...s, visitTypes: s.visitTypes.filter((_, j) => j !== i) })}><Icon name="x" size={18} /></button></div>)}
        <Button kind="quiet" className="sm" onClick={() => setS({ ...s, visitTypes: [...s.visitTypes, ''] })}><Icon name="plus" />סוג</Button>
        <h3 className="h3">שאלות הרשמה נוספות</h3>
        <p className="hint" style={{ marginBottom: 10 }}>נשאלות בכניסה הבאה של כל משתמש, ואפשר לדחות. למשל: יישוב, "איך שמעתם עלינו".</p>
        {s.registrationFields.map((f, i) => <div key={f.id} className="card" style={{ padding: 10, marginBottom: 8 }}><input value={f.label} onChange={(e) => setField(i, { label: e.target.value })} placeholder="נוסח השאלה" style={{ marginBottom: 8 }} /><div className="chips">{(['text', 'date', 'choice'] as const).map((t) => <button key={t} type="button" className={'chip ' + (f.type === t ? 'on' : '')} onClick={() => setField(i, { type: t })}>{{ text: 'טקסט', date: 'תאריך', choice: 'בחירה' }[t]}</button>)}<button type="button" className={'chip ' + (f.required ? 'on' : '')} onClick={() => setField(i, { required: !f.required })}>חובה</button><button type="button" className="chip" onClick={() => setS({ ...s, registrationFields: s.registrationFields.filter((_, j) => j !== i) })}><Icon name="x" />הסרה</button></div>{f.type === 'choice' && <input style={{ marginTop: 8 }} value={f.options.join(', ')} onChange={(e) => setField(i, { options: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} placeholder="אפשרויות, מופרדות בפסיק" />}</div>)}
        <Button kind="quiet" className="sm" onClick={() => setS({ ...s, registrationFields: [...s.registrationFields, { id: Math.random().toString(36).slice(2, 8), label: '', type: 'text', options: [], required: false }] })}><Icon name="plus" />שאלה</Button>
        <h3 className="h3">הודעות מוכנות לוואטסאפ</h3>
        <p className="hint" style={{ marginBottom: 10 }}>אפשר להשתמש ב־[שם], [תאריך], [אירוע], [סכום].</p>
        {(Object.keys(s.templates) as (keyof Settings['templates'])[]).map((k) => <label className="field" key={k}><span>{{ visitApproved: 'אישור ביקור', donationThanks: 'תודה על תרומה', debtReminder: 'תזכורת חוב', ticketReminder: 'תזכורת לאירוע' }[k]}</span><textarea value={s.templates[k]} onChange={(e) => setS({ ...s, templates: { ...s.templates, [k]: e.target.value } })} /></label>)}
        <Button kind="primary" className="block" disabled={busy} onClick={save}>שמירת ההגדרות</Button>
      </div>
    </>
  );
}

export function ActivityFeedScreen({ ctx }: { ctx: Ctx }) {
  return (
    <>
      <header className="topbar"><div><h1>פעילות</h1><div className="sub">כל מה שקרה בחווה, לפי זמן. נשמר לתמיד.</div></div><Back /></header>
      <ActivityList manager={ctx.manager} />
    </>
  );
}
