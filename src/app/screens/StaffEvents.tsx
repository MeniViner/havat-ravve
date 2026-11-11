// Staff view of events: pick an event first, then everything for that event lives inside it.
import { useMemo, useState } from 'react';
import type { Actor, FarmEvent, Profile } from '../types';
import { PAYMENT_LABELS } from '../types';
import { useAllEvents, useEvent, useEventTickets, useEventTabs, useProducts } from '../data';
import { ScanScreen, StallScreen } from './Scan';
import { Icon, Empty, Segmented, useToast, fmtDate, fmtTime, relTime, firstName } from '../ui';
import { navigate, back } from '../router';

type Ctx = { actor: Actor; manager: boolean; profile: Profile };
const dt = (iso: string) => new Date(iso).toLocaleString('he-IL', { weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' });
const isToday = (e: FarmEvent) => { const d = new Date(e.start).toDateString(); const n = new Date(); return d === n.toDateString() || (new Date(e.start) <= n && new Date(e.end) >= n); };

export function StaffEventsScreen({ ctx }: { ctx: Ctx }) {
  const { items, loading } = useAllEvents(true);
  const now = Date.now();
  const today = items.filter(isToday);
  const upcoming = items.filter((e) => !isToday(e) && new Date(e.end).getTime() >= now).sort((a, b) => a.start.localeCompare(b.start));
  const past = items.filter((e) => !isToday(e) && new Date(e.end).getTime() < now).slice(0, 6);
  const Row = ({ e, big = false }: { e: FarmEvent; big?: boolean }) => (
    <button type="button" className={big ? 'event-today' : 'row'} onClick={() => navigate(`/events-staff/${e.id}`)}>
      {big ? (
        <>
          {e.image ? <img src={e.image} alt="" /> : null}
          <div className="event-today-body"><span className="eyebrow">היום</span><h2>{e.title}</h2><p>{dt(e.start)}{e.location ? ' · ' + e.location : ''}</p><span className="btn primary sm">לכניסה ולדוכן <Icon name="chev" /></span></div>
        </>
      ) : (
        <>
          <div className="row-main"><div className="row-title">{e.title}</div><div className="row-meta"><span>{dt(e.start)}</span>{!e.published && <span className="tag">טיוטה</span>}</div></div>
          <span className="row-end"><Icon name="chev" size={18} /></span>
        </>
      )}
    </button>
  );
  return (
    <>
      <header className="topbar"><div><h1>אירועים</h1><div className="sub">בוחרים אירוע, ובפנים: כניסה, דוכן ורשימת הנרשמים</div></div></header>
      {loading && !items.length ? <div className="loading">טוען…</div> : !items.length ? <Empty title="עדיין אין אירועים" text="מנהל יוצר אירוע בניהול → אירועים." icon="sparkle" /> : (
        <>
          {today.map((e) => <Row key={e.id} e={e} big />)}
          {upcoming.length > 0 && <div className="section"><div className="section-head"><h2>קרובים</h2></div><div className="list">{upcoming.map((e) => <Row key={e.id} e={e} />)}</div></div>}
          {past.length > 0 && <div className="section"><div className="section-head"><h2>עברו</h2></div><div className="list">{past.map((e) => <Row key={e.id} e={e} />)}</div></div>}
        </>
      )}
    </>
  );
}

type Tab = 'scan' | 'stall' | 'guests' | 'tabs';
export function StaffEventHub({ id, tab = 'scan', ctx }: { id: string; tab?: Tab; ctx: Ctx }) {
  const { item: event, loading } = useEvent(id);
  const tickets = useEventTickets(id, true);
  const tabs = useEventTabs(id, true);
  const products = useProducts(id, true);
  const setTab = (t: Tab) => navigate(`/events-staff/${id}/${t}`, true);
  const [q, setQ] = useState('');
  const stats = useMemo(() => { const v = tickets.items.filter((t) => t.status === 'valid'); return { total: v.length, arrived: v.filter((t) => t.entries > 0).length, open: tabs.items.filter((t) => t.status === 'open').length }; }, [tickets.items, tabs.items]);
  if (loading) return <div className="loading">טוען…</div>;
  if (!event) return <Empty title="האירוע לא נמצא" />;
  const guests = tickets.items.filter((t) => t.status === 'valid' && (!q.trim() || t.ownerName.includes(q) || t.holderName.includes(q) || t.ownerPhone.includes(q.replace(/\D/g, '') || '—')));
  return (
    <>
      <header className="topbar"><div><h1>{event.title}</h1><div className="sub">{dt(event.start)} · {stats.arrived} הגיעו מתוך {stats.total}{stats.open ? ` · ${stats.open} חשבונות פתוחים` : ''}</div></div><div className="topbar-actions">{ctx.manager && <button type="button" className="icon-btn ghost" onClick={() => navigate(`/manage/events/${id}`)} aria-label="ניהול האירוע"><Icon name="edit" /></button>}<button type="button" className="icon-btn ghost" onClick={() => back('/events-staff')} aria-label="חזרה"><Icon name="back" /></button></div></header>
      <Segmented value={tab} onChange={setTab} options={[{ value: 'scan', label: 'כניסה' }, { value: 'stall', label: 'דוכן', count: stats.open }, { value: 'guests', label: 'נרשמים', count: stats.total }, { value: 'tabs', label: 'חשבונות' }]} />
      {tab === 'scan' && <ScanScreen ctx={ctx} embedded eventId={id} />}
      {tab === 'stall' && <StallScreen ctx={ctx} embedded eventId={id} />}
      {tab === 'guests' && (
        <>
          <label className="field"><span className="sr-only">חיפוש</span><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש לפי שם או טלפון" /></label>
          {!guests.length ? <Empty title="אין נרשמים" icon="people" /> : <div className="list">{guests.map((t) => (
            <div className="row" key={t.id}><div className="row-main"><div className="row-title">{t.holderName || t.ownerName}{t.holderName && <span className="hint"> · הזמין/ה {firstName(t.ownerName)}</span>}</div><div className="row-meta"><span>כרטיס {t.index}/{t.total}</span><span className={'tag ' + (['paid', 'paid_onsite', 'free'].includes(t.paymentStatus) ? 'ok' : 'warn')}>{PAYMENT_LABELS[t.paymentStatus]}</span>{t.entries > 0 ? <span className="tag ok">נכנס {t.entries}</span> : <span>טרם הגיע</span>}</div></div></div>
          ))}</div>}
        </>
      )}
      {tab === 'tabs' && (
        !tabs.items.length ? <Empty title="אין חשבונות באירוע" text="חשבון נפתח בדוכן כשסורקים אורח." icon="cart" /> : <div className="list">{tabs.items.map((t) => (
          <div className="row" key={t.id}><div className="row-main"><div className="row-title">{t.guestName} <span className="hint">· {t.total} ₪</span></div><div className="row-meta"><span>{t.items.map((i) => `${i.name}${i.qty > 1 ? ' ×' + i.qty : ''}`).join(', ')}</span><span className={'tag ' + (t.status === 'paid' ? 'ok' : t.status === 'open' ? 'warn' : '')}>{t.status === 'open' ? 'פתוח' : t.status === 'claimed' ? 'הועבר' : t.status === 'paid' ? 'שולם' : 'נמחל'}</span><span>{relTime(t.updatedAt)}</span></div></div></div>
        ))}</div>
      )}
      {tab === 'stall' && !products.items.length && ctx.manager && <p className="hint" style={{ marginTop: 10 }}>אין מוצרים לאירוע. <a href={`/app/manage/events/${id}/products`} onClick={(e) => { e.preventDefault(); navigate(`/manage/events/${id}/products`); }} style={{ color: 'var(--olive)' }}>להגדרת מוצרי הדוכן</a></p>}
    </>
  );
}
