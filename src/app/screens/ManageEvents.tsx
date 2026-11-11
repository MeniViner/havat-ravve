import { useEffect, useMemo, useState } from 'react';
import type { Actor, FarmEvent, Ticket, Vendor, Product, Tab, Settings, EventQuestion } from '../types';
import { PAYMENT_LABELS, TAB_LABELS } from '../types';
import { useAllEvents, useEvent, saveEvent, deleteEvent, type EventInput, useEventTickets, setTicketPayment, cancelTicket, useVendors, saveVendor, deleteVendor, useEventVendors, setEventVendor, removeEventVendor, useProducts, saveProduct, deleteProduct, copyProducts, useEventTabs, setTabStatus, downloadCsv, fillTemplate, waLink, upsertCalendarRef, deleteCalendarRef } from '../data';
import { PhotoPicker } from './Tasks';
import { useActivityForEvent, ACTION_LABELS } from '../activity';
import { KIND_LABELS } from '../types';
import { Avatar } from '../ui';
import { Icon, Sheet, Button, Empty, Segmented, useToast, fmtDate, fmtTime, relTime } from '../ui';
import { navigate, back } from '../router';

type Ctx = { actor: Actor; settings: Settings };
const dt = (iso: string) => iso ? new Date(iso).toLocaleString('he-IL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' }) : '';
const toLocalInput = (iso: string) => { if (!iso) return ''; const d = new Date(iso); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
const fromLocalInput = (s: string) => s ? new Date(s).toISOString() : '';

// ---------- list ----------
export function EventsListScreen({ ctx }: { ctx: Ctx }) {
  const { items, loading } = useAllEvents(true);
  const [editing, setEditing] = useState(false);
  const now = new Date().toISOString();
  const upcoming = items.filter((e) => e.end >= now).sort((a, b) => a.start.localeCompare(b.start));
  const past = items.filter((e) => e.end < now);
  const Row = ({ e }: { e: FarmEvent }) => (
    <button type="button" className="row" onClick={() => navigate(`/manage/events/${e.id}`)}>
      {e.image ? <img className="row-thumb" src={e.image} alt="" /> : <span className="row-thumb" style={{ display: 'grid', placeItems: 'center', color: 'var(--gold)' }}><Icon name="sparkle" /></span>}
      <div className="row-main"><div className="row-title">{e.title}</div><div className="row-meta"><span>{dt(e.start)}</span><span>{e.price > 0 ? `${e.price} ₪` : 'חינם'}</span>{!e.published && <span className="tag">טיוטה</span>}{e.published && !e.open && <span className="tag warn">הרשמה סגורה</span>}</div></div>
      <span className="row-end"><Icon name="chev" size={18} /></span>
    </button>
  );
  return (
    <>
      <header className="topbar"><div><h1>אירועים</h1><div className="sub">{upcoming.length} קרובים · {past.length} עברו</div></div><div className="topbar-actions"><button type="button" className="icon-btn ghost" onClick={() => back('/manage')} aria-label="חזרה"><Icon name="back" /></button></div></header>
      {loading && !items.length ? <div className="loading">טוען…</div> : !items.length ? <Empty title="עדיין אין אירועים" text="האירוע הראשון: כותרת, תאריך, מחיר. אפשר לפרסם אחר כך." icon="sparkle" /> : (
        <>
          {upcoming.length > 0 && <div className="section"><div className="section-head"><h2>קרובים</h2></div><div className="list">{upcoming.map((e) => <Row key={e.id} e={e} />)}</div></div>}
          {past.length > 0 && <div className="section"><div className="section-head"><h2>עברו</h2></div><div className="list">{past.map((e) => <Row key={e.id} e={e} />)}</div></div>}
        </>
      )}
      <button type="button" className="fab" onClick={() => setEditing(true)}><Icon name="plus" />אירוע</button>
      <EventEditor open={editing} onClose={() => setEditing(false)} ctx={ctx} onSaved={(id) => navigate(`/manage/events/${id}`)} />
    </>
  );
}

// ---------- editor ----------
const blank: EventInput = { title: '', description: '', image: '', location: 'חוות רווה', start: '', end: '', price: 0, maxPerOrder: 5, capacity: 0, open: true, published: false, questions: [] };
function EventEditor({ open, onClose, ctx, existing, onSaved }: { open: boolean; onClose: () => void; ctx: Ctx; existing?: FarmEvent | null; onSaved?: (id: string) => void }) {
  const [f, setF] = useState<EventInput>(blank);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  useEffect(() => { if (open) setF(existing ? { title: existing.title, description: existing.description, image: existing.image, location: existing.location, start: existing.start, end: existing.end, price: existing.price, maxPerOrder: existing.maxPerOrder, capacity: existing.capacity, open: existing.open, published: existing.published, questions: existing.questions } : blank); }, [open, existing?.id]);
  const save = async () => {
    if (!f.title.trim()) return toast({ text: 'חסרה כותרת', kind: 'error' });
    if (!f.start || !f.end) return toast({ text: 'חסרים תאריך התחלה וסיום', kind: 'error' });
    if (f.end < f.start) return toast({ text: 'הסיום לפני ההתחלה', kind: 'error' });
    setBusy(true);
    try {
      const id = await saveEvent(ctx.actor, { ...f, price: Number(f.price) || 0, maxPerOrder: Math.max(1, Math.min(20, Number(f.maxPerOrder) || 1)), capacity: Number(f.capacity) || 0 }, existing || undefined);
      await upsertCalendarRef(ctx.actor, 'event', id, { title: f.title, date: f.start.slice(0, 10), time: new Date(f.start).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' }) }).catch(() => {});
      onClose(); onSaved?.(id); toast({ text: 'נשמר' }, 2000);
    } catch { toast({ text: 'לא נשמר', kind: 'error' }); } finally { setBusy(false); }
  };
  const setQ = (qs: EventQuestion[]) => setF({ ...f, questions: qs });
  return (
    <Sheet open={open} onClose={onClose} title={existing ? 'עריכת אירוע' : 'אירוע חדש'} wide>
      <label className="field"><span>שם האירוע</span><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="למשל: פסטיבל הקיץ" /></label>
      <label className="field"><span>תיאור</span><textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="מה קורה, למי זה מתאים, מה להביא" /></label>
      <PhotoPicker value={f.image} onChange={(image) => setF({ ...f, image })} label="תמונה (לא חובה)" />
      <div className="two"><label className="field"><span>התחלה</span><input type="datetime-local" value={toLocalInput(f.start)} onChange={(e) => setF({ ...f, start: fromLocalInput(e.target.value) })} dir="ltr" /></label><label className="field"><span>סיום</span><input type="datetime-local" value={toLocalInput(f.end)} onChange={(e) => setF({ ...f, end: fromLocalInput(e.target.value) })} dir="ltr" /></label></div>
      <label className="field"><span>מקום</span><input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></label>
      <div className="two"><label className="field"><span>מחיר לכרטיס (0 = חינם)</span><input inputMode="numeric" value={f.price} onChange={(e) => setF({ ...f, price: Number(e.target.value.replace(/\D/g, '')) || 0 })} dir="ltr" /></label><label className="field"><span>מקסימום כרטיסים בהזמנה</span><input inputMode="numeric" value={f.maxPerOrder} onChange={(e) => setF({ ...f, maxPerOrder: Number(e.target.value.replace(/\D/g, '')) || 1 })} dir="ltr" /></label></div>
      <div className="field"><span>שאלות נוספות בהרשמה (לא חובה)</span>
        {f.questions.map((q, i) => <div key={q.id} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}><input style={{ flex: 1 }} value={q.label} onChange={(e) => setQ(f.questions.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} placeholder="נוסח השאלה" /><button type="button" className={'chip ' + (q.required ? 'on' : '')} onClick={() => setQ(f.questions.map((x, j) => j === i ? { ...x, required: !x.required } : x))}>חובה</button><button type="button" className="icon-btn ghost" aria-label="הסרה" onClick={() => setQ(f.questions.filter((_, j) => j !== i))}><Icon name="x" size={18} /></button></div>)}
        <Button kind="quiet" className="sm" onClick={() => setQ([...f.questions, { id: Math.random().toString(36).slice(2, 8), label: '', required: false }])}><Icon name="plus" />שאלה</Button>
      </div>
      <div className="toggle"><div>פתוח להרשמה<small>אורחים יכולים להזמין כרטיסים</small></div><button type="button" role="switch" aria-checked={f.open} className="switch" aria-label="פתוח להרשמה" onClick={() => setF({ ...f, open: !f.open })} /></div>
      <div className="toggle"><div>מפורסם<small>מופיע לאורחים באפליקציה</small></div><button type="button" role="switch" aria-checked={f.published} className="switch" aria-label="מפורסם" onClick={() => setF({ ...f, published: !f.published })} /></div>
      <div className="sheet-foot"><Button kind="primary" disabled={busy} onClick={save}>שמירה</Button><Button kind="quiet" onClick={onClose}>ביטול</Button></div>
    </Sheet>
  );
}

// ---------- hub ----------
type HubTab = 'info' | 'guests' | 'entry' | 'vendors' | 'products' | 'tabs' | 'report' | 'activity';
export function EventHubScreen({ id, ctx, tab = 'info' }: { id: string; ctx: Ctx; tab?: HubTab }) {
  const { item: event, loading } = useEvent(id);
  const setTab = (t: HubTab) => navigate(`/manage/events/${id}/${t}`, true);
  const [editing, setEditing] = useState(false);
  const tickets = useEventTickets(id, true);
  const tabs = useEventTabs(id, true);
  const products = useProducts(id, true);
  const toast = useToast();
  if (loading) return <div className="loading">טוען…</div>;
  if (!event) return <Empty title="האירוע לא נמצא" />;
  const valid = tickets.items.filter((t) => t.status === 'valid');
  const arrived = valid.filter((t) => t.entries > 0).length;
  return (
    <>
      <header className="topbar"><div><h1>{event.title}</h1><div className="sub">{dt(event.start)}{!event.published ? ' · טיוטה' : ''}</div></div><div className="topbar-actions"><button type="button" className="icon-btn ghost" onClick={() => setEditing(true)} aria-label="עריכה"><Icon name="edit" /></button><button type="button" className="icon-btn ghost" onClick={() => back('/manage/events')} aria-label="חזרה"><Icon name="back" /></button></div></header>
      <Segmented value={tab} onChange={setTab} options={[{ value: 'info', label: 'פרטים' }, { value: 'guests', label: 'נרשמים', count: valid.length }, { value: 'entry', label: 'כניסה', count: arrived }, { value: 'vendors', label: 'דוכנים' }, { value: 'products', label: 'מוצרים', count: products.items.length }, { value: 'tabs', label: 'חשבונות', count: tabs.items.filter((t) => t.status === 'open').length }, { value: 'report', label: 'דוח' }, { value: 'activity', label: 'היסטוריה' }]} />
      {tab === 'info' && (
        <>
          {event.image && <img className="event-hero" src={event.image} alt="" />}
          <div className="card" style={{ padding: 16 }}>
            <div className="detail-list">
              <div className="kv"><Icon name="clock" size={18} /><div>{dt(event.start)} עד {dt(event.end)}</div></div>
              <div className="kv"><Icon name="pin" size={18} /><div>{event.location || '—'}</div></div>
              <div className="kv"><Icon name="sparkle" size={18} /><div>{event.price > 0 ? `${event.price} ₪ לכרטיס` : 'כניסה חופשית'} · עד {event.maxPerOrder} בהזמנה</div></div>
              <div className="kv"><Icon name="info" size={18} /><div>{event.published ? 'מפורסם' : 'טיוטה, לא מוצג לאורחים'} · {event.open ? 'פתוח להרשמה' : 'הרשמה סגורה'}</div></div>
            </div>
            {event.description && <p className="note" style={{ marginTop: 14 }}>{event.description}</p>}
            <div className="row-actions" style={{ marginTop: 16 }}>
              <Button kind="secondary" className="sm" onClick={() => navigator.share?.({ title: event.title, url: `https://havat-ravve.web.app/app/events/${event.id}` }).catch(() => navigator.clipboard?.writeText(`https://havat-ravve.web.app/app/events/${event.id}`).then(() => toast({ text: 'הקישור הועתק' })))}>שיתוף הקישור</Button>
              <Button kind="quiet" className="sm" onClick={async () => { if (!confirm('למחוק את האירוע? הכרטיסים יישארו במסד.')) return; await deleteEvent(ctx.actor, event); await deleteCalendarRef('event', event.id); navigate('/manage/events', true); }}><Icon name="trash" />מחיקה</Button>
            </div>
          </div>
        </>
      )}
      {tab === 'guests' && <Guests event={event} tickets={tickets.items} ctx={ctx} />}
      {tab === 'entry' && <Entry tickets={tickets.items} />}
      {tab === 'vendors' && <Vendors event={event} ctx={ctx} />}
      {tab === 'products' && <Products event={event} products={products.items} />}
      {tab === 'tabs' && <Tabs event={event} tabs={tabs.items} ctx={ctx} />}
      {tab === 'report' && <Report event={event} tickets={tickets.items} tabs={tabs.items} />}
      {tab === 'activity' && <EventActivity eventId={event.id} />}
      <EventEditor open={editing} onClose={() => setEditing(false)} ctx={ctx} existing={event} />
    </>
  );
}

function Guests({ event, tickets, ctx }: { event: FarmEvent; tickets: Ticket[]; ctx: Ctx }) {
  const [q, setQ] = useState('');
  const orders = useMemo(() => {
    const m = new Map<string, Ticket[]>();
    for (const t of tickets) (m.get(t.orderId) || m.set(t.orderId, []).get(t.orderId)!).push(t);
    const s = q.trim().toLowerCase();
    return [...m.values()].map((ts) => ts.sort((a, b) => a.index - b.index)).filter((ts) => !s || ts[0].ownerName.toLowerCase().includes(s) || ts[0].ownerPhone.includes(s) || ts.some((t) => t.holderName.toLowerCase().includes(s)));
  }, [tickets, q]);
  const toast = useToast();
  const exportCsv = () => downloadCsv(`${event.title}-נרשמים.csv`, ['שם', 'טלפון', 'כרטיסים', 'שולם', 'הגיעו', 'כניסות', 'תאריך הזמנה', 'תשובות'], orders.map((ts) => { const v = ts.filter((t) => t.status === 'valid'); return [ts[0].ownerName, ts[0].ownerPhone, v.length, v.every((t) => ['paid', 'paid_onsite', 'free'].includes(t.paymentStatus)) ? 'כן' : 'לא', v.filter((t) => t.entries > 0).length, v.reduce((s, t) => s + t.entries, 0), fmtDate(ts[0].createdAt), Object.values(ts[0].answers).join(' | ')]; }));
  return (
    <>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}><label className="field" style={{ flex: 1, margin: 0 }}><span className="sr-only">חיפוש</span><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש לפי שם או טלפון" /></label><Button kind="secondary" className="sm" onClick={exportCsv}><Icon name="download" />אקסל</Button></div>
      {!orders.length ? <Empty title="עדיין אין נרשמים" icon="people" /> : <div className="list">{orders.map((ts) => {
        const v = ts.filter((t) => t.status === 'valid'); const t0 = ts[0];
        const unpaid = v.filter((t) => t.paymentStatus === 'pending' || t.paymentStatus === 'claimed');
        return (
          <div className="row" key={t0.orderId}>
            <div className="row-main">
              <div className="row-title">{t0.ownerName} <span className="hint">· {v.length} {v.length === 1 ? 'כרטיס' : 'כרטיסים'}</span></div>
              <div className="row-meta"><a href={waLink(t0.ownerPhone)} target="_blank" rel="noopener" dir="ltr" style={{ color: 'var(--olive)' }}>{t0.ownerPhone}</a><span>הגיעו {v.filter((t) => t.entries > 0).length} · כניסות {v.reduce((s, t) => s + t.entries, 0)}</span>{event.price > 0 && <span className={'tag ' + (unpaid.length ? (unpaid.some((t) => t.paymentStatus === 'claimed') ? 'warn' : 'bad') : 'ok')}>{unpaid.length ? PAYMENT_LABELS[unpaid[0].paymentStatus] : 'שולם'}</span>}{v.length < ts.length && <span className="tag">{ts.length - v.length} בוטלו</span>}</div>
              {Object.keys(t0.answers).length > 0 && <div className="hint">{event.questions.map((qq) => t0.answers[qq.id] ? `${qq.label}: ${t0.answers[qq.id]}` : '').filter(Boolean).join(' · ')}</div>}
              {unpaid.length > 0 && <div className="row-actions"><Button kind="secondary" className="sm" onClick={async () => { for (const t of unpaid) await setTicketPayment(ctx.actor, t, 'paid'); toast({ text: 'סומן שולם' }, 2000); }}>אישור תשלום</Button><a className="btn quiet sm" href={waLink(t0.ownerPhone, fillTemplate(ctx.settings.templates.debtReminder, { 'שם': t0.ownerName, 'אירוע': event.title, 'סכום': unpaid.length * event.price }))} target="_blank" rel="noopener">תזכורת בוואטסאפ</a></div>}
            </div>
            <button type="button" className="icon-btn ghost" aria-label="ביטול ההזמנה" onClick={async () => { if (!confirm(`לבטל את כל הכרטיסים של ${t0.ownerName}?`)) return; for (const t of v) await cancelTicket(ctx.actor, t); }}><Icon name="x" size={18} /></button>
          </div>
        );
      })}</div>}
    </>
  );
}

function Entry({ tickets }: { tickets: Ticket[] }) {
  const valid = tickets.filter((t) => t.status === 'valid');
  const scans = useMemo(() => valid.flatMap((t) => t.scans.map((s, i) => ({ ...s, t, n: i + 1 }))).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 100), [tickets]);
  return (
    <>
      <div className="hero-card" style={{ marginBottom: 14 }}><div className="eyebrow">בשער</div><h2>{valid.filter((t) => t.entries > 0).length} מתוך {valid.length} הגיעו</h2><div className="hero-stats"><div><b>{scans.length}</b><span>סריקות</span></div><div><b>{valid.filter((t) => t.paymentStatus === 'paid_onsite').length}</b><span>שילמו במקום</span></div><div><b>{valid.filter((t) => t.entries > 1).length}</b><span>יצאו וחזרו</span></div></div></div>
      {!scans.length ? <Empty title="עדיין לא נסרק אף כרטיס" text="הסריקה נעשית במסך 'אירוע' של הצוות." icon="camera" /> : <div className="list">{scans.map((s, i) => <div className="row" key={i}><div className="row-main"><div className="row-title">{s.t.holderName || s.t.ownerName}</div><div className="row-meta"><span>כניסה {s.n}</span><span>{fmtTime(s.at)}</span><span>סרק/ה {s.by.name}</span></div></div></div>)}</div>}
    </>
  );
}

function Vendors({ event, ctx }: { event: FarmEvent; ctx: Ctx }) {
  const all = useVendors(true);
  const inEvent = useEventVendors(event.id, true);
  const [editing, setEditing] = useState<Vendor | 'new' | null>(null);
  const [f, setF] = useState({ name: '', phone: '', product: '', external: true, notes: '' });
  const toast = useToast();
  useEffect(() => { if (editing === 'new') setF({ name: '', phone: '', product: '', external: true, notes: '' }); else if (editing) setF({ name: editing.name, phone: editing.phone, product: editing.product, external: editing.external, notes: editing.notes }); }, [editing]);
  const invite = (v: Vendor) => waLink(v.phone, `שלום ${v.name}, נשמח שתגיעו עם דוכן ${v.product ? `(${v.product}) ` : ''}ל${event.title} ב־${fmtDate(event.start)} בחוות רווה. מתאים?`);
  return (
    <>
      <p className="hint" style={{ marginBottom: 12 }}>רשימת בעלי הדוכנים נשמרת מאירוע לאירוע. מסמנים מי מוזמן לאירוע הזה ומי אישר.</p>
      {!all.items.length ? <Empty title="אין בעלי דוכנים ברשימה" icon="people" /> : <div className="list">{all.items.map((v) => {
        const ev = inEvent.items.find((x) => x.vendorId === v.id);
        return (
          <div className="row" key={v.id}>
            <button type="button" role="checkbox" aria-checked={!!ev} aria-label="מוזמן לאירוע" className={'checkbox ' + (ev ? 'on' : '')} onClick={() => ev ? removeEventVendor(event.id, v.id) : setEventVendor(event.id, v, false)}><Icon name="check" size={18} /></button>
            <div className="row-main"><div className="row-title">{v.name} <span className="hint">· {v.product}</span></div><div className="row-meta">{v.phone && <a href={waLink(v.phone)} target="_blank" rel="noopener" dir="ltr" style={{ color: 'var(--olive)' }}>{v.phone}</a>}<span>{v.external ? 'חיצוני' : 'של החווה'}</span>{ev && <span className={'tag ' + (ev.confirmed ? 'ok' : 'warn')}>{ev.confirmed ? 'אישר הגעה' : 'ממתין'}</span>}</div>
              {ev && <div className="row-actions">{v.phone && <a className="btn secondary sm" href={invite(v)} target="_blank" rel="noopener">הזמנה בוואטסאפ</a>}<Button kind="quiet" className="sm" onClick={() => setEventVendor(event.id, v, !ev.confirmed, ev.notes)}>{ev.confirmed ? 'בטל אישור' : 'סמן שאישר'}</Button></div>}
            </div>
            <button type="button" className="icon-btn ghost" aria-label="עריכה" onClick={() => setEditing(v)}><Icon name="edit" size={18} /></button>
          </div>
        );
      })}</div>}
      <div style={{ marginTop: 12 }}><Button kind="secondary" className="sm" onClick={() => setEditing('new')}><Icon name="plus" />בעל דוכן חדש</Button></div>
      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'בעל דוכן חדש' : 'עריכה'}>
        <label className="field"><span>שם</span><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <label className="field"><span>טלפון</span><input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} dir="ltr" inputMode="tel" /></label>
        <label className="field"><span>מה מוכר</span><input value={f.product} onChange={(e) => setF({ ...f, product: e.target.value })} placeholder="למשל: גבינות, יין, תכשיטים" /></label>
        <div className="toggle"><div>דוכן חיצוני<small>הכסף עובר ישירות למוכר</small></div><button type="button" role="switch" aria-checked={f.external} className="switch" aria-label="חיצוני" onClick={() => setF({ ...f, external: !f.external })} /></div>
        <label className="field"><span>הערות</span><textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></label>
        <div className="sheet-foot"><Button kind="primary" onClick={async () => { if (!f.name.trim()) return; try { await saveVendor(f, editing === 'new' ? undefined : editing!); setEditing(null); } catch { toast({ text: 'לא נשמר', kind: 'error' }); } }}>שמירה</Button>{editing !== 'new' && editing && <Button kind="quiet" onClick={async () => { if (confirm('למחוק מהרשימה?')) { await deleteVendor(editing.id); setEditing(null); } }}><Icon name="trash" />מחיקה</Button>}</div>
      </Sheet>
    </>
  );
}

function Products({ event, products }: { event: FarmEvent; products: Product[] }) {
  const [name, setName] = useState(''); const [price, setPrice] = useState('');
  const all = useAllEvents(true);
  const [copyFrom, setCopyFrom] = useState('');
  const source = useProducts(copyFrom, !!copyFrom);
  const toast = useToast();
  const add = async () => { if (!name.trim() || !price) return; await saveProduct(event.id, { name: name.trim(), price: Number(price), active: true, sort: products.length }); setName(''); setPrice(''); };
  return (
    <>
      <p className="hint" style={{ marginBottom: 12 }}>המוצרים והמחירים של דוכן החווה באירוע הזה. הצוות רושם מהם לחשבון של האורח.</p>
      <div className="card" style={{ padding: 12, marginBottom: 14, display: 'flex', gap: 8 }}>
        <label className="field" style={{ flex: 2, margin: 0 }}><span className="sr-only">מוצר</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="למשל: כוס יין" onKeyDown={(e) => { if (e.key === 'Enter') add(); }} /></label>
        <label className="field" style={{ flex: 1, margin: 0 }}><span className="sr-only">מחיר</span><input value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ''))} placeholder="₪" inputMode="decimal" dir="ltr" onKeyDown={(e) => { if (e.key === 'Enter') add(); }} /></label>
        <Button kind="primary" onClick={add} aria-label="הוספה" disabled={!name.trim() || !price}><Icon name="plus" /></Button>
      </div>
      {!products.length ? (
        <>
          <Empty title="אין מוצרים" icon="cart" />
          {all.items.filter((e) => e.id !== event.id).length > 0 && <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}><select value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)} style={{ flex: 1, minHeight: 44, borderRadius: 10, border: '1px solid var(--line)', padding: '0 10px', background: '#fff' }}><option value="">העתקה מאירוע קודם…</option>{all.items.filter((e) => e.id !== event.id).map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}</select><Button kind="secondary" className="sm" disabled={!copyFrom || !source.items.length} onClick={async () => { await copyProducts(copyFrom, event.id, source.items); toast({ text: 'הועתק' }, 2000); }}>העתקה</Button></div>}
        </>
      ) : <div className="list">{products.map((p) => (
        <div className="row" key={p.id} style={{ alignItems: 'center' }}><div className="row-main"><div className="row-title" style={{ color: p.active ? undefined : 'var(--muted)' }}>{p.name}</div><div className="row-meta"><span>{p.price} ₪</span>{!p.active && <span className="tag">מוסתר</span>}</div></div><Button kind="quiet" className="sm" onClick={() => saveProduct(event.id, { ...p, active: !p.active }, p)}>{p.active ? 'הסתרה' : 'הצגה'}</Button><button type="button" className="icon-btn ghost" aria-label="מחיקה" onClick={() => { if (confirm('למחוק?')) deleteProduct(event.id, p.id); }}><Icon name="x" size={18} /></button></div>
      ))}</div>}
    </>
  );
}

function Tabs({ event, tabs, ctx }: { event: FarmEvent; tabs: Tab[]; ctx: Ctx }) {
  const open = tabs.filter((t) => t.status === 'open' || t.status === 'claimed');
  const done = tabs.filter((t) => t.status === 'paid' || t.status === 'waived');
  const Row = ({ t }: { t: Tab }) => (
    <div className="row" key={t.id}>
      <div className="row-main">
        <div className="row-title">{t.guestName} <span className="hint">· {t.total} ₪</span></div>
        <div className="row-meta">{t.guestPhone && <a href={waLink(t.guestPhone)} target="_blank" rel="noopener" dir="ltr" style={{ color: 'var(--olive)' }}>{t.guestPhone}</a>}<span>{t.items.length} פריטים</span><span className={'tag ' + (t.status === 'paid' ? 'ok' : t.status === 'claimed' ? 'warn' : t.status === 'open' ? 'bad' : '')}>{TAB_LABELS[t.status]}</span><span>{relTime(t.updatedAt)}</span></div>
        <div className="hint">{t.items.map((i) => `${i.name}${i.qty > 1 ? ` ×${i.qty}` : ''}`).join(', ')}</div>
        {(t.status === 'open' || t.status === 'claimed') && <div className="row-actions"><Button kind="secondary" className="sm" onClick={() => setTabStatus(ctx.actor, t, 'paid')}>סימון שולם</Button>{t.guestPhone && <a className="btn quiet sm" href={waLink(t.guestPhone, fillTemplate(ctx.settings.templates.debtReminder, { 'שם': t.guestName, 'אירוע': event.title, 'סכום': t.total }))} target="_blank" rel="noopener">תזכורת בוואטסאפ</a>}<Button kind="quiet" className="sm" onClick={() => { if (confirm('למחול על החוב?')) setTabStatus(ctx.actor, t, 'waived'); }}>מחילה</Button></div>}
      </div>
    </div>
  );
  return (
    <>
      <div className="hero-card" style={{ marginBottom: 14 }}><div className="eyebrow">חשבונות הדוכן</div><h2>{open.reduce((s, t) => s + t.total, 0)} ₪ פתוחים</h2><div className="hero-stats"><div><b>{open.length}</b><span>חשבונות פתוחים</span></div><div><b>{done.filter((t) => t.status === 'paid').reduce((s, t) => s + t.total, 0)}</b><span>₪ שולמו</span></div><div><b>{tabs.reduce((s, t) => s + t.items.reduce((x, i) => x + i.qty, 0), 0)}</b><span>פריטים נמכרו</span></div></div></div>
      {!tabs.length ? <Empty title="אין חשבונות" text="חשבונות נפתחים בדוכן ביום האירוע." icon="cart" /> : (
        <>
          {open.length > 0 && <div className="section"><div className="section-head"><h2>ממתינים לתשלום</h2></div><div className="list">{open.map((t) => <Row key={t.id} t={t} />)}</div></div>}
          {done.length > 0 && <div className="section"><div className="section-head"><h2>נסגרו</h2></div><div className="list">{done.map((t) => <Row key={t.id} t={t} />)}</div></div>}
        </>
      )}
    </>
  );
}

function Report({ event, tickets, tabs }: { event: FarmEvent; tickets: Ticket[]; tabs: Tab[] }) {
  const valid = tickets.filter((t) => t.status === 'valid');
  const paid = valid.filter((t) => ['paid', 'paid_onsite'].includes(t.paymentStatus));
  const byProduct = useMemo(() => { const m = new Map<string, { qty: number; sum: number }>(); for (const t of tabs) for (const i of t.items) { const c = m.get(i.name) || { qty: 0, sum: 0 }; c.qty += i.qty; c.sum += i.qty * i.price; m.set(i.name, c); } return [...m.entries()].sort((a, b) => b[1].qty - a[1].qty); }, [tabs]);
  const debts = tabs.filter((t) => t.status === 'open' || t.status === 'claimed');
  const exportAll = () => downloadCsv(`${event.title}-דוח.csv`, ['סעיף', 'ערך'], [['נרשמו', valid.length], ['הגיעו', valid.filter((t) => t.entries > 0).length], ['כניסות', valid.reduce((s, t) => s + t.entries, 0)], ['הכנסות כרטיסים ששולמו', paid.reduce((s, t) => s + t.price, 0)], ['כרטיסים שלא שולמו', valid.filter((t) => t.paymentStatus === 'pending' || t.paymentStatus === 'claimed').reduce((s, t) => s + t.price, 0)], ['מכירות דוכן', tabs.reduce((s, t) => s + t.total, 0)], ['חובות דוכן פתוחים', debts.reduce((s, t) => s + t.total, 0)], ...byProduct.map(([n, c]) => [`מוצר: ${n}`, `${c.qty} יח׳ · ${c.sum} ₪`])]);
  return (
    <>
      <div className="stats-grid">
        <div className="stat"><b>{valid.length}</b><span>נרשמו</span></div>
        <div className="stat"><b>{valid.filter((t) => t.entries > 0).length}</b><span>הגיעו</span></div>
        <div className="stat"><b>{paid.reduce((s, t) => s + t.price, 0)} ₪</b><span>כרטיסים ששולמו</span></div>
        <div className="stat"><b>{valid.filter((t) => t.paymentStatus === 'pending' || t.paymentStatus === 'claimed').reduce((s, t) => s + t.price, 0)} ₪</b><span>כרטיסים שטרם שולמו</span></div>
        <div className="stat"><b>{tabs.reduce((s, t) => s + t.total, 0)} ₪</b><span>מכירות דוכן</span></div>
        <div className="stat"><b>{debts.reduce((s, t) => s + t.total, 0)} ₪</b><span>חובות דוכן ({debts.length})</span></div>
      </div>
      <div className="section"><div className="section-head"><h2>מה נמכר הכי הרבה</h2><button type="button" onClick={exportAll}>ייצוא לאקסל</button></div>
        {!byProduct.length ? <p className="hint">אין מכירות עדיין.</p> : <div className="list">{byProduct.map(([n, c]) => <div className="row" key={n}><div className="row-main"><div className="row-title">{n}</div><div className="row-meta"><span>{c.qty} יחידות</span></div></div><b>{c.sum} ₪</b></div>)}</div>}
      </div>
    </>
  );
}

function EventActivity({ eventId }: { eventId: string }) {
  const { items, loading } = useActivityForEvent(eventId, true);
  if (loading && !items.length) return <div className="loading">טוען…</div>;
  if (!items.length) return <Empty title="עדיין אין פעילות באירוע" text="הזמנות, סריקות, תשלומים ומכירות בדוכן יופיעו כאן." icon="history" />;
  return <div className="list">{items.map((a) => <div className="row" key={a.id} style={{ alignItems: 'center' }}><Avatar name={a.by.name} size={32} /><div className="row-main"><div className="row-title" style={{ fontSize: 15 }}><b style={{ fontWeight: 600 }}>{a.by.name}</b> · {ACTION_LABELS[a.action] || a.action}{a.text ? ': ' + a.text : ''}</div><div className="row-meta"><span className="tag">{KIND_LABELS[a.kind]}</span><span>{fmtDate(a.at)} · {fmtTime(a.at)}</span></div></div></div>)}</div>;
}
