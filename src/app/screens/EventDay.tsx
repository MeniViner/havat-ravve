// Event day for the team: entry scanning and the farm stall. Works offline once the ticket list is on the device.
import { useEffect, useMemo, useRef, useState } from 'react';
import jsQR from 'jsqr';
import type { FarmEvent, Ticket, TabItem } from '../types';
import { PAYMENT_LABELS } from '../types';
import type { TeamCtx } from '../ctx';
import { Top, Ledger, Sec, Row, Pill, Btn, A, Icon, Empty, Field, Input, Avatar, Loading, useToast, fmtTime, fmtDayLong, firstName, relTime, todayISO, money, inText } from '../ui';
import { navigate } from '../router';
import { useEvent, useEventTickets, useEventTabs, useProducts, parseQr, recordScan, openTab, addTabItems, removeTabItem, setTabStatus } from '../data';
import { nowIso } from '../firebase';
import { EventTeaser } from './Today';

const isToday = (e: FarmEvent, today: string) => e.start.slice(0, 10) <= today && e.end.slice(0, 10) >= today;
const useLocal = (key: string) => { const [v, setV] = useState(() => localStorage.getItem(key) || ''); return [v, (n: string) => { setV(n); try { n ? localStorage.setItem(key, n) : localStorage.removeItem(key); } catch {} }] as const; };

// ---------- camera ----------
export function Camera({ onCode, active, hint }: { onCode: (s: string) => void; active: boolean; hint?: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!active) return;
    let stream: MediaStream | null = null; let raf = 0; let last = 0; let stop = false;
    const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
      .then((s) => { if (stop) { s.getTracks().forEach((t) => t.stop()); return; } stream = s; const v = video.current!; v.srcObject = s; v.setAttribute('playsinline', 'true'); v.play().catch(() => {}); tick(); })
      .catch(() => setError('אין גישה למצלמה. אפשרו מצלמה לאתר, או חפשו לפי שם.'));
    const tick = () => {
      if (stop) return;
      const v = video.current; const t = performance.now();
      if (v && v.readyState >= 2 && t - last > 140) {
        last = t;
        const w = 480, h = Math.round(480 * v.videoHeight / Math.max(1, v.videoWidth)) || 360;
        canvas.width = w; canvas.height = h; ctx.drawImage(v, 0, 0, w, h);
        const code = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' });
        if (code?.data) onCode(code.data);
      }
      raf = requestAnimationFrame(tick);
    };
    return () => { stop = true; cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); };
  }, [active]);
  return <div className="camera">{error ? <p style={{ padding: 20, textAlign: 'center', lineHeight: 1.5 }}>{error}</p> : <video ref={video} muted playsInline />}<div className="camera-frame" aria-hidden="true" />{hint && !error && <div className="hintbox">{hint}</div>}</div>;
}

// ---------- event hub for staff ----------
export function StaffEventsScreen({ ctx, events, id }: { ctx: TeamCtx; events: FarmEvent[]; id?: string }) {
  const today = todayISO();
  const published = events.filter((e) => e.published).sort((a, b) => a.start.localeCompare(b.start));
  const live = published.find((e) => isToday(e, today));
  const chosen = (id ? events.find((e) => e.id === id) : null) || live || published.find((e) => e.end >= new Date().toISOString()) || null;
  const tickets = useEventTickets(chosen?.id || '', !!chosen);
  const tabs = useEventTabs(chosen?.id || '', !!chosen);
  const products = useProducts(chosen?.id || '', !!chosen);
  const valid = tickets.items.filter((t) => t.status === 'valid');
  const arrived = valid.filter((t) => t.entries > 0).length;
  const scans = useMemo(() => valid.flatMap((t) => t.scans.map((s, i) => ({ t, s, n: i + 1 }))).sort((a, b) => b.s.at.localeCompare(a.s.at)).slice(0, 6), [valid]);
  const openTabs = tabs.items.filter((t) => t.status === 'open');
  const upcoming = published.filter((e) => e.end >= new Date().toISOString() && e.id !== chosen?.id);
  if (!chosen) return <><Top date={fmtDayLong(today)} title="אירועים" /><Empty title="אין אירוע קרוב" text={ctx.manager ? 'יוצרים אירוע בניהול ← אירועים.' : 'כשמנהל יפרסם אירוע, הכניסה והדוכן יופיעו כאן.'} action={ctx.manager ? <Btn kind="ghost" to="/manage/events">לאירועים</Btn> : undefined} /></>;
  const isLive = isToday(chosen, today);
  return (
    <>
      <Top date={fmtDayLong(chosen.start)} title={isLive ? `היום בחווה: ${chosen.title}` : chosen.title} sub={`${fmtTime(chosen.start)}–${fmtTime(chosen.end)}${isLive ? ' · השער נפתח חצי שעה לפני' : ' · ' + inText(chosen.start)}`} end={!id ? <A to="/more" aria-label="הפרופיל שלי"><Avatar name={ctx.profile.displayName} /></A> : undefined} backTo={id ? '/events-staff' : undefined} backLabel="אירועים" />
      <Ledger items={[{ n: arrived, label: 'נכנסו' }, { n: valid.length, label: 'כרטיסים' }, { n: openTabs.length, label: 'חשבונות פתוחים', tone: openTabs.length ? 'ochre' : undefined }]} />
      <div className="actions row2" style={{ paddingBottom: 0 }}><Btn size="big" icon="qr" to={`/scan/${chosen.id}`}>כניסה</Btn><Btn size="big" kind="ghost" icon="store" to={`/stall/${chosen.id}`}>דוכן</Btn></div>
      <div className="strip ok"><Icon name="download" size={18} />{tickets.loading ? 'מוריד את רשימת הכרטיסים…' : `${valid.length} כרטיסים ו־${products.items.filter((p) => p.active).length} מוצרים במכשיר. הסריקה והדוכן עובדים בלי קליטה.`}</div>
      {scans.length > 0 && <><Sec title="סריקות אחרונות" link="חיפוש אורח" linkTo={`/scan/${chosen.id}/search`} /><div className="list">{scans.map(({ t, s, n }) => <Row key={t.id + s.at} center title={`${t.holderName || t.ownerName} · כרטיס ${t.index}/${t.total}`} meta={<span>כניסה {n}{n > 1 ? ', יצא וחזר' : ''} · {fmtTime(s.at)} · {firstName(s.by.name)}{t.paymentStatus === 'paid_onsite' ? ' · שולם במקום' : ''}</span>} />)}</div></>}
      {upcoming.length > 0 && <><Sec title="אירועים קרובים" />{upcoming.slice(0, 4).map((e) => <EventTeaser key={e.id} e={e} to={`/events-staff/${e.id}`} />)}</>}
    </>
  );
}

// ---------- scanning ----------
type Result = { kind: 'ok' | 'pay' | 'bad'; title: string; name?: string; sub?: string; ticket?: Ticket; order?: Ticket[] };
function useScanner(eventId: string, ctx: TeamCtx) {
  const { item: event } = useEvent(eventId);
  const tickets = useEventTickets(eventId, true);
  const [result, setResult] = useState<Result | null>(null);
  const toast = useToast();
  const recent = useRef<{ code: string; at: number }>({ code: '', at: 0 });
  const valid = tickets.items.filter((t) => t.status === 'valid');
  const stats = { total: valid.length, arrived: valid.filter((t) => t.entries > 0).length, scans: valid.reduce((s, t) => s + t.entries, 0), returned: valid.filter((t) => t.entries > 1).length, onsite: valid.filter((t) => t.paymentStatus === 'paid_onsite').length };
  const admit = async (t: Ticket, paidOnsite = false) => {
    try { await recordScan(t, ctx.actor, paidOnsite); } catch { toast({ text: 'הסריקה לא נשמרה, אבל נספרה מקומית. תסתנכרן כשיש רשת.', kind: 'error' }); }
    setResult({ kind: 'ok', title: 'מאושר', name: t.holderName || t.ownerName, sub: `כרטיס ${t.index} מתוך ${t.total} · ${t.entries === 0 ? 'כניסה ראשונה' : `כניסה ${t.entries + 1}, יצא וחזר`}${t.holderName ? ` · הזמין/ה ${t.ownerName}` : ''} · ${paidOnsite ? 'שולם במקום' : PAYMENT_LABELS[t.paymentStatus]}`, ticket: t });
  };
  const evaluate = (t: Ticket | undefined, secret?: string) => {
    if (!t) return setResult({ kind: 'bad', title: 'לא נמצא', sub: 'הכרטיס לא שייך לאירוע הזה, או שהרשימה עוד לא ירדה למכשיר.' });
    if (secret !== undefined && secret !== t.secret) return setResult({ kind: 'bad', title: 'ברקוד לא תקין', sub: 'הקוד לא תואם את הכרטיס.' });
    if (t.status === 'cancelled') return setResult({ kind: 'bad', title: 'כרטיס בוטל', name: `${t.ownerName} · כרטיס ${t.index}/${t.total}`, sub: 'ההזמנה בוטלה על ידי מנהל. אפשר להציע לרשום אותו מחדש בדוכן.' });
    if (t.paymentStatus === 'pending' || t.paymentStatus === 'claimed') { const order = tickets.items.filter((x) => x.orderId === t.orderId && x.status === 'valid'); return setResult({ kind: 'pay', title: PAYMENT_LABELS[t.paymentStatus], name: t.holderName || t.ownerName, sub: `${order.length} ${order.length === 1 ? 'כרטיס' : 'כרטיסים'} · ${money(t.price * order.length)}`, ticket: t, order }); }
    admit(t);
  };
  const onCode = (code: string) => {
    if (result) return;
    const now = Date.now();
    if (recent.current.code === code && now - recent.current.at < 4000) return;
    recent.current = { code, at: now };
    const p = parseQr(code);
    if (!p) return setResult({ kind: 'bad', title: 'זה לא כרטיס של החווה', sub: 'נסרק ברקוד אחר.' });
    const t = tickets.items.find((x) => x.id === p.id);
    if (t && t.eventId !== eventId) return setResult({ kind: 'bad', title: 'שייך לאירוע אחר', name: t.eventTitle });
    evaluate(t, p.secret);
  };
  return { event, tickets, valid, stats, result, setResult, admit, evaluate, onCode };
}

function ResultOverlay({ r, stats, settings, onPaid, onAdmitAnyway, onClose, onSearch }: { r: Result; stats: { arrived: number; total: number }; settings: TeamCtx['settings']; onPaid: () => void; onAdmitAnyway: () => void; onClose: () => void; onSearch: () => void }) {
  const [left, setLeft] = useState(3);
  useEffect(() => { if (r.kind !== 'ok') return; setLeft(3); const t = setInterval(() => setLeft((n) => { if (n <= 1) { clearInterval(t); onClose(); return 0; } return n - 1; }), 1000); return () => clearInterval(t); }, [r]);
  const pay = settings.payment;
  return (
    <div className={'result ' + r.kind} role="dialog" aria-live="assertive">
      <div style={{ fontSize: 15, opacity: .85 }}>{stats.arrived} מתוך {stats.total}</div>
      <div className="big">{r.title}</div>
      {r.name && <div className="name">{r.name}</div>}
      {r.sub && <div className="sub">{r.sub}</div>}
      {r.kind === 'pay' && <div className="sub">{[pay.bit && `ביט ${pay.bit}`, pay.paybox && 'PayBox', pay.cash && 'מזומן'].filter(Boolean).join(' · ')}</div>}
      <div className="acts">
        {r.kind === 'ok' && <><Btn size="big" onClick={onClose}>הבא</Btn><div style={{ fontSize: 14, opacity: .8 }}>נסגר לבד בעוד {left} שניות וחוזר לסריקה</div></>}
        {r.kind === 'pay' && <><Btn size="big" icon="check" onClick={onPaid}>שולם במקום · להכניס</Btn><Btn kind="ghost" onClick={onAdmitAnyway}>להכניס, ישלמו אחר כך</Btn><Btn kind="ghost" onClick={onClose}>סגירה</Btn></>}
        {r.kind === 'bad' && <><Btn size="big" onClick={onSearch}>לחפש לפי שם</Btn><Btn kind="ghost" onClick={onClose}>לסרוק שוב</Btn></>}
      </div>
    </div>
  );
}

export function ScanScreen({ eventId, ctx }: { eventId: string; ctx: TeamCtx }) {
  const s = useScanner(eventId, ctx);
  if (!s.event) return <Loading />;
  return (
    <>
      <Top backTo={`/events-staff/${eventId}`} backLabel="אירוע" title={`${s.event.title} · כניסה`} sub={`${s.stats.arrived} נכנסו מתוך ${s.stats.total} · ${s.stats.scans} סריקות · עובד בלי קליטה`} end={<Btn kind="quiet" size="sm" icon="store" to={`/stall/${eventId}`}>לדוכן</Btn>} />
      <Camera active={!s.result} onCode={s.onCode} hint="מכוונים את הברקוד למסגרת. הזיהוי אוטומטי." />
      <div className="actions"><Btn kind="ghost" size="big" icon="search" to={`/scan/${eventId}/search`}>חיפוש בשם או טלפון</Btn></div>
      {s.result && <ResultOverlay r={s.result} stats={s.stats} settings={ctx.settings} onClose={() => s.setResult(null)} onPaid={() => s.result?.ticket && s.admit(s.result.ticket, true)} onAdmitAnyway={() => s.result?.ticket && s.admit(s.result.ticket)} onSearch={() => { s.setResult(null); navigate(`/scan/${eventId}/search`); }} />}
    </>
  );
}

export function ScanSearchScreen({ eventId, ctx }: { eventId: string; ctx: TeamCtx }) {
  const s = useScanner(eventId, ctx);
  const [q, setQ] = useState('');
  const orders = useMemo(() => {
    const t = q.trim().toLowerCase(); if (t.length < 2) return [];
    const digits = t.replace(/\D/g, '');
    const m = new Map<string, Ticket[]>();
    for (const x of s.tickets.items) if (x.ownerName.toLowerCase().includes(t) || x.holderName.toLowerCase().includes(t) || (digits.length >= 4 && x.ownerPhone.replace(/\D/g, '').includes(digits))) m.set(x.orderId, [...(m.get(x.orderId) || []), x]);
    return [...m.values()].slice(0, 8);
  }, [q, s.tickets.items]);
  if (!s.event) return <Loading />;
  return (
    <>
      <Top backTo={`/scan/${eventId}`} backLabel="למצלמה" title="מי בכניסה?" sub={`${s.event.title} · ${s.stats.arrived} מתוך ${s.stats.total}`} />
      <Field hint="שם או טלפון. מראים רק התאמות קרובות, לא את כל הרשימה."><Input big autoFocus placeholder="חיפוש" value={q} onChange={(e) => setQ(e.target.value)} /></Field>
      {q.trim().length >= 2 && <Sec title={orders.length ? `${orders.length} התאמות` : 'לא נמצא'} />}
      <div className="list">{orders.map((o) => { const t = o[0]; const valid = o.filter((x) => x.status === 'valid'); const entered = valid.filter((x) => x.entries > 0).length; const nextT = valid.find((x) => x.entries === 0) || valid[0]; const pending = t.paymentStatus === 'pending' || t.paymentStatus === 'claimed';
        return <Row key={t.orderId} center title={t.ownerName} meta={<><span className="ltr">{t.ownerPhone}</span><span>{valid.length} {valid.length === 1 ? 'כרטיס' : 'כרטיסים'}</span>{t.status === 'cancelled' ? <Pill tone="rust">בוטל</Pill> : <Pill tone={pending ? 'ochre' : 'ok'}>{PAYMENT_LABELS[t.paymentStatus]}{pending ? ` · ${money(t.price * valid.length)}` : ''}</Pill>}<span>{entered ? `נכנסו ${entered}` : 'טרם הגיעו'}</span></>}
          end={nextT && <Btn size="sm" kind={pending ? 'ghost' : 'primary'} onClick={() => s.evaluate(nextT)}>{pending ? 'פתיחה' : 'להכניס'}</Btn>} />; })}</div>
      <p className="note">לא ברשימה? אפשר לרשום אותו כאורח חדש בדוכן ("לקוח מזדמן"), או לבקש ממנהל להוסיף כרטיס.</p>
      <div className="actions"><Btn kind="ghost" icon="store" to={`/stall/${eventId}/pick`}>רישום אורח בלי כרטיס</Btn></div>
      {s.result && <ResultOverlay r={s.result} stats={s.stats} settings={ctx.settings} onClose={() => s.setResult(null)} onPaid={() => s.result?.ticket && s.admit(s.result.ticket, true)} onAdmitAnyway={() => s.result?.ticket && s.admit(s.result.ticket)} onSearch={() => s.setResult(null)} />}
    </>
  );
}

// ---------- stall ----------
function useStall(eventId: string) {
  const { item: event } = useEvent(eventId);
  const tabs = useEventTabs(eventId, true);
  const products = useProducts(eventId, true);
  const tickets = useEventTickets(eventId, true);
  const [currentId, setCurrentId] = useLocal('farm-tab-' + eventId);
  const tab = tabs.items.find((t) => t.id === currentId && t.status === 'open') || null;
  const open = tabs.items.filter((t) => t.status === 'open');
  const today = todayISO();
  const soldToday = tabs.items.filter((t) => t.createdAt.slice(0, 10) === today).reduce((s, t) => s + t.total, 0);
  return { event, tabs, products: products.items.filter((p) => p.active), tickets: tickets.items, tab, setCurrentId, open, soldToday };
}
export function StallScreen({ eventId, ctx }: { eventId: string; ctx: TeamCtx }) {
  const st = useStall(eventId);
  const [cart, setCart] = useState<Record<string, number>>({});
  const toast = useToast();
  if (!st.event) return <Loading />;
  if (!st.tab) return <StallPickScreen eventId={eventId} ctx={ctx} inline />;
  const tab = st.tab;
  const total = Object.entries(cart).reduce((s, [id, q]) => s + (st.products.find((p) => p.id === id)?.price || 0) * q, 0);
  const commit = async () => {
    const items: TabItem[] = Object.entries(cart).filter(([, q]) => q > 0).map(([id, qty]) => { const p = st.products.find((x) => x.id === id)!; return { productId: id, name: p.name, price: p.price, qty, at: nowIso(), by: ctx.actor }; });
    if (!items.length) return;
    try { await addTabItems(ctx.actor, tab, items); setCart({}); toast({ text: `נרשם ${money(total)} לחשבון של ${firstName(tab.guestName)}` }, 2500); } catch { toast({ text: 'לא נשמר', kind: 'error' }); }
  };
  return (
    <>
      <Top backTo={`/scan/${eventId}`} backLabel="כניסה" title="דוכן החווה" sub={<A to={`/stall/${eventId}/tabs`} style={{ textDecoration: 'underline', textUnderlineOffset: 3 }}>{st.open.length} חשבונות פתוחים</A>} />
      <div className="row center" style={{ borderTop: '1px solid var(--line2)', marginTop: 8 }}><Avatar name={tab.guestName} /><div className="main"><div className="title">{tab.guestName}</div><div className="meta"><span>בחשבון עד עכשיו: {money(tab.total)} · {tab.items.length} פריטים</span></div></div><Btn kind="ghost" size="sm" onClick={() => st.setCurrentId('')}>החלפה</Btn></div>
      <Sec title="מה לוקחים?" n="לחיצה מוסיפה 1" />
      {!st.products.length && <Empty title="אין מוצרים לאירוע הזה" text="מנהל מגדיר מוצרים ומחירים בניהול ← האירוע ← מוצרי הדוכן." />}
      <div className="products">{st.products.map((p) => <button type="button" key={p.id} className={'product ' + (cart[p.id] ? 'on' : '')} onClick={() => setCart({ ...cart, [p.id]: (cart[p.id] || 0) + 1 })} onContextMenu={(e) => { e.preventDefault(); setCart({ ...cart, [p.id]: Math.max(0, (cart[p.id] || 0) - 1) }); }}><b>{p.name}</b><span>{money(p.price)}</span>{cart[p.id] ? <i>{cart[p.id]}</i> : null}</button>)}</div>
      {tab.items.length > 0 && <><Sec title="בחשבון" n={tab.items.length} /><div className="list">{[...tab.items].reverse().map((i, n) => { const idx = tab.items.length - 1 - n; return <Row key={idx} center title={<>{i.name}{i.qty > 1 ? ` ×${i.qty}` : ''}</>} meta={<span>{fmtTime(i.at)} · {firstName(i.by.name)}</span>} end={<><span className="amount">{money(i.price * i.qty)}</span><button type="button" className="iconbtn" aria-label="הסרה" onClick={() => removeTabItem(ctx.actor, tab, idx)}><Icon name="x" size={18} /></button></>} />; })}</div></>}
      {total > 0 && <div className="cartbar"><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}><div><b>{money(total)}</b><div className="sub">{Object.entries(cart).filter(([, q]) => q).map(([id, q]) => `${st.products.find((p) => p.id === id)?.name} ×${q}`).join(' · ')}</div></div><Btn kind="quiet" size="sm" style={{ color: '#e6dcc0' }} onClick={() => setCart({})}>ניקוי</Btn></div><Btn block size="big" style={{ marginTop: 12 }} onClick={commit}>רישום לחשבון של {firstName(tab.guestName)}</Btn></div>}
    </>
  );
}
export function StallPickScreen({ eventId, ctx, inline }: { eventId: string; ctx: TeamCtx; inline?: boolean }) {
  const st = useStall(eventId);
  const [scanning, setScanning] = useState(false);
  const [q, setQ] = useState('');
  const [walk, setWalk] = useState({ name: '', phone: '' });
  const toast = useToast();
  const matches = useMemo(() => { const t = q.trim().toLowerCase(); if (t.length < 2) return []; const d = t.replace(/\D/g, ''); const seen = new Set<string>(); return st.tickets.filter((x) => x.status === 'valid' && (x.ownerName.toLowerCase().includes(t) || x.holderName.toLowerCase().includes(t) || (d.length >= 4 && x.ownerPhone.replace(/\D/g, '').includes(d)))).filter((x) => { const k = (x.holderName || x.ownerName) + x.ownerUid; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 6); }, [q, st.tickets]);
  const start = async (guest: { uid: string; name: string; phone: string; ticketId: string }) => {
    if (!st.event) return;
    const existing = st.open.find((t) => (guest.uid && t.guestUid === guest.uid) || (!guest.uid && guest.phone && t.guestPhone === guest.phone));
    try { const id = existing?.id || await openTab(ctx.actor, st.event, guest); st.setCurrentId(id); navigate(`/stall/${eventId}`, true); } catch { toast({ text: 'לא הצלחנו לפתוח חשבון', kind: 'error' }); }
  };
  const onCode = (code: string) => { const p = parseQr(code); const t = p && st.tickets.find((x) => x.id === p.id && x.secret === p.secret); if (!t) return; setScanning(false); start({ uid: t.ownerUid, name: t.holderName || t.ownerName, phone: t.ownerPhone, ticketId: t.id }); };
  if (!st.event) return <Loading />;
  return (
    <>
      <Top backTo={inline ? `/scan/${eventId}` : `/stall/${eventId}`} backLabel={inline ? 'כניסה' : 'דוכן'} title="מי קונה?" sub={<A to={`/stall/${eventId}/tabs`} style={{ textDecoration: 'underline', textUnderlineOffset: 3 }}>{st.open.length} חשבונות פתוחים</A>} />
      {scanning ? <><Camera active onCode={onCode} hint="אותו QR של הכניסה. החשבון נפתח על שם בעל הכרטיס." /><div className="actions"><Btn kind="ghost" onClick={() => setScanning(false)}>סגירת המצלמה</Btn></div></>
        : <div className="actions" style={{ paddingBottom: 0 }}><Btn size="big" icon="qr" onClick={() => setScanning(true)}>סריקת הכרטיס של האורח</Btn><p className="lead" style={{ padding: 0, fontSize: 14 }}>אותו QR של הכניסה. החשבון נפתח על שם בעל הכרטיס.</p></div>}
      <Field><Input placeholder="חיפוש בשם או טלפון" value={q} onChange={(e) => setQ(e.target.value)} /></Field>
      {matches.length > 0 && <div className="list" style={{ marginTop: 8 }}>{matches.map((t) => <Row key={t.id} center onClick={() => start({ uid: t.ownerUid, name: t.holderName || t.ownerName, phone: t.ownerPhone, ticketId: t.id })} start={<Avatar name={t.holderName || t.ownerName} />} title={t.holderName || t.ownerName} meta={<><span className="ltr">{t.ownerPhone}</span><span>{t.total} כרטיסים</span></>} chev />)}</div>}
      {st.open.length > 0 && <><Sec title="פתוחים עכשיו" n={st.open.length} link="הכל" linkTo={`/stall/${eventId}/tabs`} /><div className="list">{st.open.map((t) => <Row key={t.id} center onClick={() => { st.setCurrentId(t.id); navigate(`/stall/${eventId}`, true); }} start={<Avatar name={t.guestName} />} title={<>{t.guestName}{!t.guestUid && t.guestPhone && <span className="muted ltr" style={{ fontWeight: 400, fontSize: 14 }}> · {t.guestPhone}</span>}</>} meta={<span>{!t.guestUid ? 'לקוח מזדמן · ' : ''}{t.items.length} פריטים · {relTime(t.updatedAt)}</span>} end={<span className="amount">{money(t.total)}</span>} />)}</div></>}
      <Sec title="בלי כרטיס? לקוח מזדמן" />
      <Field><Input placeholder="שם" value={walk.name} onChange={(e) => setWalk({ ...walk, name: e.target.value })} /></Field>
      <Field><Input placeholder="טלפון" dir="ltr" inputMode="tel" value={walk.phone} onChange={(e) => setWalk({ ...walk, phone: e.target.value })} /></Field>
      <div className="actions"><Btn kind="ghost" disabled={!walk.name.trim()} onClick={() => start({ uid: '', name: walk.name.trim(), phone: walk.phone.trim(), ticketId: '' })}>פתיחת חשבון · נרשם כאורח חדש</Btn></div>
    </>
  );
}
export function StallTabsScreen({ eventId, ctx }: { eventId: string; ctx: TeamCtx }) {
  const st = useStall(eventId);
  const toast = useToast();
  const today = todayISO();
  const closed = st.tabs.items.filter((t) => t.status !== 'open' && t.updatedAt.slice(0, 10) === today);
  if (!st.event) return <Loading />;
  const openTotal = st.open.reduce((s, t) => s + t.total, 0);
  return (
    <>
      <Top backTo={`/stall/${eventId}`} backLabel="דוכן" title="חשבונות הדוכן" sub={`${st.event.title} · על בסיס אמון, משלמים בסוף או בבית`} />
      <Ledger items={[{ n: money(openTotal), label: 'פתוחים', tone: openTotal ? 'ochre' : undefined }, { n: st.open.length, label: 'חשבונות' }, { n: money(st.soldToday), label: 'נמכרו היום' }]} small />
      <Sec title="פתוחים" n={st.open.length} />
      <div className="list">{st.open.map((t) => <div key={t.id} className="row"><Avatar name={t.guestName} /><div className="main"><div className="title">{t.guestName}{!t.guestUid && t.guestPhone && <span className="muted ltr" style={{ fontWeight: 400, fontSize: 14 }}> · {t.guestPhone}</span>}</div><div className="meta"><span>{t.items.map((i) => i.name + (i.qty > 1 ? ` ×${i.qty}` : '')).join(' · ') || 'עוד אין פריטים'} · {relTime(t.updatedAt)}</span></div><div className="inline" style={{ marginTop: 8 }}><Btn size="sm" onClick={() => setTabStatus(ctx.actor, t, 'paid').then(() => toast({ text: `${firstName(t.guestName)} · שולם במקום` }, 2500))}>שילם/ה במקום</Btn><Btn size="sm" kind="ghost" onClick={() => { st.setCurrentId(t.id); navigate(`/stall/${eventId}`); }}>הוספת פריטים</Btn></div></div><span className="amount">{money(t.total)}</span></div>)}{!st.open.length && <p className="lead">אין חשבונות פתוחים.</p>}</div>
      {closed.length > 0 && <><Sec title="נסגרו היום" n={closed.length} /><div className="list">{closed.map((t) => <Row key={t.id} center title={t.guestName} meta={<span>{t.status === 'paid' ? 'שולם במקום' : t.status === 'claimed' ? 'סימן/ה "העברתי"' : t.status === 'waived' ? 'נמחל' : 'ישלמו בבית · תזכורת תישלח'} · {fmtTime(t.updatedAt)}</span>} end={<span className="amount">{money(t.total)}</span>} />)}</div></>}
    </>
  );
}

