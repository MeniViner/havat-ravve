import { useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import QRCode from 'qrcode';
import type { Profile, FarmEvent, Ticket, Settings, Visit, Donation, Tab } from '../types';
import { PAYMENT_LABELS, VISIT_LABELS, TAB_LABELS } from '../types';
import { useUpcomingEvents, useEvent, useMyTickets, orderTickets, qrPayload, claimOrderPaid, cancelTicket, useMyVisits, createVisit, cancelVisit, useMyDonations, createDonation, claimDonationPaid, useMyTabs, claimTabPaid } from '../data';
import { signIn, authErrorMessage, todayKey } from '../firebase';
import { Icon, Sheet, Button, Empty, useToast, fmtDate, fmtTime, firstName } from '../ui';
import { navigate, back } from '../router';

export type GuestCtx = { user: User | null; profile: Profile | null; settings: Settings };

// ---------- login gate ----------
export function LoginSheet({ open, onClose, reason }: { open: boolean; onClose: () => void; reason: string }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  return (
    <Sheet open={open} onClose={onClose} title="רגע לפני">
      <p className="hint" style={{ fontSize: 15, marginBottom: 18 }}>{reason} נכנסים פעם אחת עם Google, וזה נשמר בטלפון.</p>
      <Button kind="secondary" className="google-btn block" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await signIn(); onClose(); } catch (e) { setError(authErrorMessage(e)); } finally { setBusy(false); } }}>
        <svg viewBox="0 0 24 24" aria-hidden="true" width="20" height="20"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.7-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.8z"/><path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1C3.3 21.3 7.3 24 12 24z"/><path fill="#FBBC05" d="M5.3 14.3c-.5-1.5-.5-3.1 0-4.6V6.6H1.3c-1.7 3.4-1.7 7.4 0 10.8l4-3.1z"/><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4C17.9 1.2 15.2 0 12 0 7.3 0 3.3 2.7 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z"/></svg>
        המשך עם Google
      </Button>
      {error && <p className="err">{error}</p>}
      <p className="hint" style={{ marginTop: 14 }}>בהמשך נבקש שם וטלפון, וזהו. <a href="/app/terms" onClick={(e) => { e.preventDefault(); onClose(); navigate('/terms'); }}>תנאי שימוש</a></p>
    </Sheet>
  );
}

function useGate(ctx: GuestCtx) {
  const [open, setOpen] = useState(false); const [reason, setReason] = useState('');
  const gate = (why: string, fn: () => void) => { if (ctx.profile) fn(); else { setReason(why); setOpen(true); } };
  const sheet = <LoginSheet open={open} onClose={() => setOpen(false)} reason={reason} />;
  return { gate, sheet };
}

const fmtRange = (e: FarmEvent) => {
  const s = new Date(e.start), en = new Date(e.end);
  const sameDay = s.toDateString() === en.toDateString();
  const d = (x: Date) => x.toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'long', timeZone: 'Asia/Jerusalem' });
  const t = (x: Date) => x.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' });
  return sameDay ? `${d(s)} · ${t(s)}–${t(en)}` : `${d(s)} ${t(s)} – ${d(en)} ${t(en)}`;
};
const priceText = (p: number) => p > 0 ? `${p} ₪` : 'כניסה חופשית';

// ---------- home ----------
export function GuestHome({ ctx }: { ctx: GuestCtx }) {
  const { items, loading } = useUpcomingEvents();
  const now = new Date().toISOString();
  const upcoming = items.filter((e) => e.end >= now);
  const go = (p: string) => (e: React.MouseEvent) => { e.preventDefault(); navigate(p); };
  return (
    <>
      <div className="guest-hero">
        <img src="/assets/rava-sunset.webp" alt="" />
        <div className="guest-hero-text"><span className="eyebrow">ליד טנא עומרים</span><h1>{ctx.profile ? `שלום, ${firstName(ctx.profile.displayName)}` : 'חוות רווה'}</h1><p>{ctx.settings.guestIntro}</p></div>
      </div>
      <div className="quick">
        <a href="/app/visit" onClick={go('/visit')}><Icon name="pin" />תיאום ביקור</a>
        <a href="/app/donate" onClick={go('/donate')}><Icon name="sparkle" />תרומה</a>
      </div>
      <div className="section">
        <div className="section-head"><h2>אירועים קרובים</h2></div>
        {loading && !items.length ? <div className="loading">טוען…</div> : !upcoming.length ? <Empty title="אין אירועים פתוחים כרגע" text="כשיתפרסם אירוע חדש הוא יופיע כאן. אפשר בינתיים לתאם ביקור." icon="clock" /> : (
          <div className="event-grid">{upcoming.map((e) => (
            <a key={e.id} className="event-card" href={`/app/events/${e.id}`} onClick={go(`/events/${e.id}`)}>
              {e.image ? <img src={e.image} alt="" /> : <div className="event-card-ph"><Icon name="sparkle" size={28} /></div>}
              <div className="event-card-body">
                <div className="event-date">{fmtRange(e)}</div>
                <h3>{e.title}</h3>
                <div className="event-meta"><span>{priceText(e.price)}</span>{e.location && <span>· {e.location}</span>}{!e.open && <span className="tag">ההרשמה סגורה</span>}</div>
              </div>
            </a>
          ))}</div>
        )}
      </div>
      {!ctx.profile && <p className="hint" style={{ marginTop: 22 }}>כבר הזמנתם כרטיס? <a href="/app/me" onClick={go('/me')} style={{ color: 'var(--olive)' }}>לאזור האישי</a></p>}
    </>
  );
}

// ---------- event + order ----------
export function EventScreen({ id, ctx }: { id: string; ctx: GuestCtx }) {
  const { item: event, loading } = useEvent(id);
  const { gate, sheet } = useGate(ctx);
  const [ordering, setOrdering] = useState(false);
  const [count, setCount] = useState(1);
  const [holders, setHolders] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const mine = useMyTickets(ctx.profile?.uid || '', !!ctx.profile);
  const myHere = mine.items.filter((t) => t.eventId === id && t.status === 'valid');
  if (loading) return <div className="loading">טוען…</div>;
  if (!event) return <Empty title="האירוע לא נמצא" />;
  const past = event.end < new Date().toISOString();
  const submit = async () => {
    if (!ctx.profile) return;
    for (const q of event.questions) if (q.required && !(answers[q.id] || '').trim()) return toast({ text: `חסר: ${q.label}`, kind: 'error' });
    setBusy(true);
    try { await orderTickets(ctx.profile, event, count, holders, answers); setOrdering(false); toast({ text: 'הכרטיסים מוכנים באזור האישי' }, 4000); navigate('/me'); }
    catch (e: any) { toast({ text: e?.code === 'permission-denied' ? 'ההרשמה לאירוע סגורה' : 'לא הצלחנו להזמין. נסו שוב.', kind: 'error' }); }
    finally { setBusy(false); }
  };
  return (
    <>
      <header className="topbar"><div><h1>{event.title}</h1><div className="sub">{fmtRange(event)}</div></div><div className="topbar-actions"><button type="button" className="icon-btn ghost" onClick={() => back('/')} aria-label="חזרה"><Icon name="back" /></button></div></header>
      {event.image && <img className="event-hero" src={event.image} alt="" />}
      <div className="card" style={{ padding: 18 }}>
        <div className="event-meta" style={{ marginBottom: 10 }}><span className="tag gold">{priceText(event.price)}</span>{event.location && <span><Icon name="pin" size={14} /> {event.location}</span>}</div>
        <p className="note" style={{ fontSize: 15 }}>{event.description}</p>
      </div>
      {myHere.length > 0 && <div className="section"><div className="card" style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}><Icon name="check" /><div style={{ flex: 1 }}>יש לכם {myHere.length} {myHere.length === 1 ? 'כרטיס' : 'כרטיסים'} לאירוע הזה</div><Button kind="secondary" className="sm" onClick={() => navigate('/me')}>לכרטיסים</Button></div></div>}
      <div className="section">
        {past ? <p className="hint">האירוע הסתיים.</p> : !event.open ? <p className="hint">ההרשמה לאירוע הזה סגורה כרגע.</p> : (
          <Button kind="primary" className="block" onClick={() => gate('כדי להזמין כרטיס צריך חשבון, כדי שהכרטיס יהיה שלכם.', () => setOrdering(true))}><Icon name="sparkle" />{event.price > 0 ? 'הזמנת כרטיסים' : 'הרשמה לאירוע'}</Button>
        )}
        <div className="row-actions" style={{ justifyContent: 'center', marginTop: 12 }}>
          <Button kind="quiet" className="sm" onClick={() => downloadIcs(event.title, event)}><Icon name="clock" />הוספה ליומן</Button>
          <Button kind="quiet" className="sm" onClick={() => navigator.share?.({ title: event.title, url: location.href }).catch(() => navigator.clipboard?.writeText(location.href).then(() => toast({ text: 'הקישור הועתק' })))}><Icon name="link" />שיתוף</Button>
        </div>
      </div>
      {sheet}
      <Sheet open={ordering} onClose={() => setOrdering(false)} title={event.title}>
        <div className="field"><span>כמה כרטיסים?</span>
          <div className="stepper"><button type="button" onClick={() => setCount(Math.max(1, count - 1))} aria-label="פחות">−</button><b>{count}</b><button type="button" onClick={() => setCount(Math.min(event.maxPerOrder, count + 1))} aria-label="יותר">+</button><span className="hint">עד {event.maxPerOrder}</span></div>
        </div>
        {count > 1 && <div className="field"><span>שמות הנלווים (לא חובה)</span>{Array.from({ length: count - 1 }, (_, i) => <input key={i} style={{ marginBottom: 8 }} value={holders[i + 1] || ''} onChange={(e) => { const h = [...holders]; h[i + 1] = e.target.value; setHolders(h); }} placeholder={`כרטיס ${i + 2}`} />)}</div>}
        {event.questions.map((q) => <label className="field" key={q.id}><span>{q.label}{q.required ? ' *' : ''}</span><input value={answers[q.id] || ''} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} /></label>)}
        {event.price > 0 && <div className="pay-box"><b>{count * event.price} ₪</b><span>{PaymentInfo(ctx.settings)}</span></div>}
        <div className="sheet-foot"><Button kind="primary" disabled={busy} onClick={submit}>{event.price > 0 ? 'הזמנה' : 'הרשמה'}</Button><Button kind="quiet" onClick={() => setOrdering(false)}>ביטול</Button></div>
      </Sheet>
    </>
  );
}

function PaymentInfo(s: Settings) {
  const parts = [];
  if (s.payment.bit) parts.push(`ביט ${s.payment.bit}`);
  if (s.payment.paybox) parts.push(`PayBox ${s.payment.paybox}`);
  if (s.payment.cash) parts.push('מזומן בכניסה');
  return (parts.length ? 'תשלום: ' + parts.join(' · ') : 'פרטי התשלום יישלחו אליכם') + (s.payment.note ? '. ' + s.payment.note : '');
}

// ---------- my area ----------
export function Qr({ text, size = 240 }: { text: string; size?: number }) {
  const [src, setSrc] = useState('');
  useEffect(() => { QRCode.toDataURL(text, { margin: 1, width: size * 2, color: { dark: '#283a2e', light: '#ffffff' } }).then(setSrc).catch(() => setSrc('')); }, [text, size]);
  return src ? <img className="qr" src={src} alt="ברקוד הכרטיס" style={{ width: size, height: size }} /> : <div className="qr" style={{ width: size, height: size }} />;
}

export function downloadIcs(title: string, event?: FarmEvent | null) {
  if (!event) return;
  const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const esc = (x: string) => x.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, '\\$&');
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Havat Ravve//App//HE', 'BEGIN:VEVENT', `UID:${event.id}@havat-ravve.web.app`, `DTSTAMP:${stamp(new Date().toISOString())}`, `DTSTART:${stamp(event.start)}`, `DTEND:${stamp(event.end)}`, `SUMMARY:${esc(title)}`, `LOCATION:${esc(event.location || 'חוות רווה')}`, `DESCRIPTION:${esc('הכרטיסים באפליקציה: https://havat-ravve.web.app/app/me')}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' })); a.download = 'havat-ravve.ics'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function MyArea({ ctx }: { ctx: GuestCtx }) {
  const { gate, sheet } = useGate(ctx);
  const events = useUpcomingEvents();
  const uid = ctx.profile?.uid || '';
  const tickets = useMyTickets(uid, !!uid);
  const visits = useMyVisits(uid, !!uid);
  const donations = useMyDonations(uid, !!uid);
  const tabs = useMyTabs(uid, !!uid);
  const [open, setOpen] = useState<Ticket | null>(null);
  const toast = useToast();
  useEffect(() => { if (!ctx.profile) gate('האזור האישי מציג את הכרטיסים, הביקורים והתרומות שלכם.', () => {}); }, [ctx.profile]);
  const orders = useMemo(() => {
    const m = new Map<string, Ticket[]>();
    for (const t of tickets.items) (m.get(t.orderId) || m.set(t.orderId, []).get(t.orderId)!).push(t);
    return [...m.values()].map((ts) => ts.sort((a, b) => a.index - b.index));
  }, [tickets.items]);
  const today = todayKey();
  if (!ctx.profile) return <><header className="topbar"><div><h1>האזור שלי</h1></div></header><Empty title="צריך להיכנס" text="הכרטיסים והבקשות שלכם שמורים בחשבון." icon="user" /><div style={{ marginTop: 12 }}><Button kind="primary" onClick={() => gate('', () => {})}>כניסה</Button></div>{sheet}</>;
  const openTabs = tabs.items.filter((t) => t.status !== 'paid' && t.status !== 'waived');
  return (
    <>
      <header className="topbar"><div><h1>האזור שלי</h1><div className="sub">{ctx.profile.displayName}</div></div></header>
      {openTabs.length > 0 && <div className="section"><div className="section-head"><h2>החשבון שלי בדוכן</h2></div>{openTabs.map((t) => <TabCard key={t.id} tab={t} settings={ctx.settings} />)}</div>}
      <div className="section"><div className="section-head"><h2>הכרטיסים שלי</h2></div>
        {!orders.length ? <Empty title="עדיין אין כרטיסים" text="כשתזמינו כרטיס לאירוע הוא יופיע כאן, גם בלי קליטה." icon="sparkle" /> : orders.map((ts) => {
          const t0 = ts[0]; const valid = ts.filter((t) => t.status === 'valid');
          const unpaid = valid.filter((t) => t.paymentStatus === 'pending');
          return (
            <div className="card" key={t0.orderId} style={{ padding: 14, marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}><b style={{ fontSize: 17, fontWeight: 500 }}>{t0.eventTitle}</b><span className="hint">{fmtDate(t0.createdAt)}</span></div>
              <div className="row-meta" style={{ marginBottom: 10 }}><span>{valid.length} {valid.length === 1 ? 'כרטיס' : 'כרטיסים'}</span>{t0.price > 0 && <span className={'tag ' + (unpaid.length ? 'warn' : 'ok')}>{unpaid.length ? PAYMENT_LABELS.pending : PAYMENT_LABELS[valid[0]?.paymentStatus || 'paid']}</span>}</div>
              <div className="ticket-strip">{valid.map((t) => <button type="button" key={t.id} className="ticket-chip" onClick={() => setOpen(t)}><Qr text={qrPayload(t)} size={64} /><span>{t.index}/{t.total}</span>{t.entries > 0 && <small>נכנס {t.entries}</small>}</button>)}</div>
              {unpaid.length > 0 && <div className="pay-box" style={{ marginTop: 12 }}><b>{unpaid.length * t0.price} ₪</b><span>{PaymentInfo(ctx.settings)}</span><Button kind="secondary" className="sm" onClick={async () => { try { await claimOrderPaid(unpaid); toast({ text: 'תודה! המנהלים יאשרו את התשלום.' }); } catch { toast({ text: 'לא נשמר', kind: 'error' }); } }}>העברתי את התשלום</Button></div>}
            </div>
          );
        })}
      </div>
      {visits.items.length > 0 && <div className="section"><div className="section-head"><h2>ביקורים</h2><a href="/app/visit" onClick={(e) => { e.preventDefault(); navigate('/visit'); }}>תיאום חדש</a></div><div className="list">{visits.items.map((v) => (
        <div className="row" key={v.id}><div className="row-main"><div className="row-title">{fmtDate(v.date)} · {v.people} אנשים · {v.type}</div><div className="row-meta"><span className={'tag ' + (v.status === 'approved' ? 'ok' : v.status === 'new' ? 'warn' : '')}>{VISIT_LABELS[v.status]}</span>{v.managerNote && <span>{v.managerNote}</span>}</div></div>{v.status === 'new' && <Button kind="quiet" className="sm" onClick={() => cancelVisit(v)}>ביטול</Button>}</div>
      ))}</div></div>}
      {donations.items.length > 0 && <div className="section"><div className="section-head"><h2>תרומות</h2></div><div className="list">{donations.items.map((d) => (
        <div className="row" key={d.id}><div className="row-main"><div className="row-title">{d.amount} ₪{d.label ? ` · ${d.label}` : ''}</div><div className="row-meta"><span>{fmtDate(d.createdAt)}</span><span className={'tag ' + (d.paymentStatus === 'paid' ? 'ok' : 'warn')}>{PAYMENT_LABELS[d.paymentStatus]}</span>{d.memorial && <span>לזכר {d.memorial}</span>}</div></div>{d.paymentStatus === 'pending' && <Button kind="quiet" className="sm" onClick={() => claimDonationPaid(d).then(() => toast({ text: 'תודה!' }))}>העברתי</Button>}</div>
      ))}</div></div>}
      <Sheet open={!!open} onClose={() => setOpen(null)} title={open?.eventTitle}>
        {open && (
          <div className="ticket-view">
            <Qr text={qrPayload(open)} size={260} />
            <b>{open.holderName || open.ownerName}</b>
            <span className="hint">כרטיס {open.index} מתוך {open.total} · {fmtDate(open.createdAt)}</span>
            <span className={'tag ' + (open.paymentStatus === 'pending' ? 'warn' : 'ok')}>{PAYMENT_LABELS[open.paymentStatus]}</span>
            {open.entries > 0 && <span className="hint">נסרק {open.entries} {open.entries === 1 ? 'פעם' : 'פעמים'}</span>}
            <p className="hint" style={{ textAlign: 'center' }}>מציגים את הברקוד בכניסה. אפשר לשתף כרטיס עם מי שמגיע אתכם.</p>
            <div className="row-actions" style={{ justifyContent: 'center' }}>
              <Button kind="secondary" className="sm" onClick={() => downloadIcs(open.eventTitle, events.items.find((e) => e.id === open.eventId))}><Icon name="clock" />ליומן</Button>
              <Button kind="secondary" className="sm" onClick={() => navigator.share?.({ title: open.eventTitle, text: `הכרטיס שלך ל${open.eventTitle} (${open.index}/${open.total}). קוד: ${qrPayload(open)}` }).catch(() => {})}>שיתוף</Button>
              {open.entries === 0 && <Button kind="quiet" className="sm" onClick={async () => { if (!confirm('לבטל את הכרטיס?')) return; await cancelTicket({ uid: ctx.profile!.uid, name: ctx.profile!.displayName }, open); setOpen(null); }}>ביטול כרטיס</Button>}
            </div>
          </div>
        )}
      </Sheet>
      {sheet}
    </>
  );
}

function TabCard({ tab, settings }: { tab: Tab; settings: Settings }) {
  const toast = useToast();
  return (
    <div className="card" style={{ padding: 14, marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><b style={{ fontWeight: 500 }}>{tab.eventTitle}</b><span className={'tag ' + (tab.status === 'open' ? 'warn' : '')}>{TAB_LABELS[tab.status]}</span></div>
      <div className="list" style={{ margin: '10px 0', boxShadow: 'none' }}>{tab.items.map((i, n) => <div className="row" key={n} style={{ padding: '8px 12px' }}><div className="row-main"><div className="row-title" style={{ fontSize: 15 }}>{i.name}{i.qty > 1 ? ` × ${i.qty}` : ''}</div><div className="row-meta"><span>{fmtTime(i.at)}</span></div></div><b>{i.price * i.qty} ₪</b></div>)}</div>
      <div className="pay-box"><b>{tab.total} ₪</b><span>{PaymentInfo(settings)}</span>{tab.status === 'open' && tab.total > 0 && <Button kind="secondary" className="sm" onClick={async () => { try { await claimTabPaid(tab); toast({ text: 'תודה! המנהלים יאשרו.' }); } catch { toast({ text: 'לא נשמר', kind: 'error' }); } }}>העברתי את התשלום</Button>}</div>
    </div>
  );
}

// ---------- visit request ----------
export function VisitScreen({ ctx }: { ctx: GuestCtx }) {
  const { gate, sheet } = useGate(ctx);
  const [form, setForm] = useState({ date: '', people: 2, type: ctx.settings.visitTypes[0] || 'סיור', note: '' });
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const submit = () => gate('כדי שנוכל לחזור אליכם לגבי הביקור.', async () => {
    if (!form.date) return toast({ text: 'בחרו תאריך', kind: 'error' });
    setBusy(true);
    try { await createVisit(ctx.profile!, { ...form, people: Number(form.people) || 1 }); toast({ text: 'קיבלנו. נחזור אליכם בהקדם.' }, 4000); navigate('/me'); }
    catch { toast({ text: 'לא נשלח. נסו שוב.', kind: 'error' }); } finally { setBusy(false); }
  });
  return (
    <>
      <header className="topbar"><div><h1>תיאום ביקור</h1><div className="sub">ביקורים בחווה בתיאום מראש. ממלאים, ואנחנו מתקשרים.</div></div><div className="topbar-actions"><button type="button" className="icon-btn ghost" onClick={() => back('/')} aria-label="חזרה"><Icon name="back" /></button></div></header>
      <div className="card" style={{ padding: 18 }}>
        <label className="field"><span>תאריך מבוקש</span><input type="date" min={todayKey()} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} dir="ltr" /></label>
        <div className="field"><span>כמה אנשים?</span><div className="stepper"><button type="button" onClick={() => setForm({ ...form, people: Math.max(1, form.people - 1) })} aria-label="פחות">−</button><b>{form.people}</b><button type="button" onClick={() => setForm({ ...form, people: form.people + 1 })} aria-label="יותר">+</button></div></div>
        <div className="field"><span>סוג הביקור</span><div className="chips">{ctx.settings.visitTypes.map((t) => <button key={t} type="button" className={'chip ' + (form.type === t ? 'on' : '')} onClick={() => setForm({ ...form, type: t })}>{t}</button>)}</div></div>
        <label className="field"><span>כמה מילים (לא חובה)</span><textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="מי אתם, מה מעניין אתכם, שעה מועדפת" /></label>
        <Button kind="primary" className="block" disabled={busy} onClick={submit}>שליחת הבקשה</Button>
      </div>
      {sheet}
    </>
  );
}

// ---------- donation ----------
export function DonateScreen({ ctx }: { ctx: GuestCtx }) {
  const { gate, sheet } = useGate(ctx);
  const presets = ctx.settings.donationPresets;
  const [amount, setAmount] = useState<number>(presets[0]?.amount || 0);
  const [custom, setCustom] = useState('');
  const [note, setNote] = useState(''); const [memorial, setMemorial] = useState('');
  const [receipt, setReceipt] = useState(false); const [receiptName, setReceiptName] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const value = custom ? Number(custom) : amount;
  const label = custom ? '' : presets.find((p) => p.amount === amount)?.label || '';
  const submit = () => gate('כדי שנוכל להודות לכם ולשלוח קבלה אם תרצו.', async () => {
    if (!value || value <= 0) return toast({ text: 'בחרו סכום', kind: 'error' });
    setBusy(true);
    try { await createDonation(ctx.profile!, { amount: value, label, note, memorial, receiptWanted: receipt, receiptName: receipt ? (receiptName || ctx.profile!.displayName) : '' }); toast({ text: 'תודה על תרומתך!' }, 4000); navigate('/me'); }
    catch { toast({ text: 'לא נשלח. נסו שוב.', kind: 'error' }); } finally { setBusy(false); }
  });
  return (
    <>
      <header className="topbar"><div><h1>תרומה לחווה</h1><div className="sub">כל תרומה הולכת ישירות לעבודה בשטח.</div></div><div className="topbar-actions"><button type="button" className="icon-btn ghost" onClick={() => back('/')} aria-label="חזרה"><Icon name="back" /></button></div></header>
      <div className="card" style={{ padding: 18 }}>
        <div className="field"><span>סכום</span><div className="amounts">{presets.map((p) => <button key={p.amount} type="button" className={'amount ' + (!custom && amount === p.amount ? 'on' : '')} onClick={() => { setAmount(p.amount); setCustom(''); }}><b>{p.amount} ₪</b><span>{p.label}</span></button>)}</div></div>
        <label className="field"><span>או סכום אחר</span><input inputMode="numeric" value={custom} onChange={(e) => setCustom(e.target.value.replace(/\D/g, ''))} placeholder="₪" dir="ltr" /></label>
        <label className="field"><span>הנצחה (לא חובה)</span><input value={memorial} onChange={(e) => setMemorial(e.target.value)} placeholder="לזכר…" /></label>
        <label className="field"><span>כמה מילים (לא חובה)</span><textarea value={note} onChange={(e) => setNote(e.target.value)} /></label>
        <div className="toggle"><div>אני צריך/ה קבלה<small>הקבלה נשלחת מהעמותה</small></div><button type="button" role="switch" aria-checked={receipt} className="switch" aria-label="קבלה" onClick={() => setReceipt(!receipt)} /></div>
        {receipt && <label className="field"><span>שם מלא לקבלה</span><input value={receiptName} onChange={(e) => setReceiptName(e.target.value)} placeholder={ctx.profile?.displayName || ''} /></label>}
        <div className="pay-box" style={{ marginBottom: 14 }}><b>{value || 0} ₪</b><span>{PaymentInfo(ctx.settings)}</span></div>
        <Button kind="primary" className="block" disabled={busy} onClick={submit}>לתרום</Button>
      </div>
      {sheet}
    </>
  );
}
