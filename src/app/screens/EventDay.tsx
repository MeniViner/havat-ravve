// Event day for the team: the gate and the farm stall. Both answer from what is already on the phone and never wait for the network.
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import jsQR from 'jsqr';
import type { FarmEvent, Ticket, Tab, TabItem } from '../types';
import { PAYMENT_LABELS } from '../types';
import type { TeamCtx } from '../ctx';
import { A, Icon, useDesktop, useToast, fmtTime, fmtDayLong, fmtDateShort, fmtWeekday, firstName, relTime, todayISO, dateKey, money, inText } from '../ui';
import { Head, Sect, Btn, Form, Empty, deferDelete, isHidden, useHiddenVersion } from '../kit';
import { back, navigate } from '../router';
import { useOnline } from '../store';
import { useEvent, useEventTickets, useEventTabs, useProducts, parseQr, recordScan, payOrderOnsite, openTab, addTabItems, removeTabItem, setTabStatus } from '../data';
import { nowIso } from '../firebase';

const dayOf = (iso: string) => dateKey(new Date(iso));
const isToday = (e: FarmEvent, today: string) => dayOf(e.start) <= today && dayOf(e.end) >= today;
const unpaid = (t: Ticket) => t.paymentStatus === 'pending' || t.paymentStatus === 'claimed';
const who = (t: Ticket) => t.holderName || t.ownerName;
const tickets_ = (n: number) => (n === 1 ? 'כרטיס אחד' : `${n} כרטיסים`);
const digits = (s: string) => s.replace(/\D/g, '');
function useStored(key: string) {
  const [v, setV] = useState(() => { try { return localStorage.getItem(key) || ''; } catch { return ''; } });
  return [v, (n: string) => { setV(n); try { if (n) localStorage.setItem(key, n); else localStorage.removeItem(key); } catch { /* private mode */ } }] as const;
}

// ---------- camera ----------
/** Reads QR codes from the back camera. The callback is kept in a ref, so it always sees the current ticket list. */
function Camera({ onCode, onError }: { onCode: (s: string) => void; onError?: (blocked: boolean) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');
  const cb = useRef(onCode); cb.current = onCode;
  useEffect(() => {
    let stream: MediaStream | null = null; let raf = 0; let last = 0; let stop = false;
    const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const fail = () => { setError('אין גישה למצלמה. אפשר לאשר מצלמה לאתר בהגדרות הדפדפן, או לחפש לפי שם.'); onError?.(true); };
    const tick = () => {
      if (stop) return;
      const v = video.current; const t = performance.now();
      if (v && v.readyState >= 2 && t - last > 140) {
        last = t;
        const w = 480, h = Math.round(480 * v.videoHeight / Math.max(1, v.videoWidth)) || 360;
        canvas.width = w; canvas.height = h; ctx.drawImage(v, 0, 0, w, h);
        const code = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' });
        if (code?.data) cb.current(code.data);
      }
      raf = requestAnimationFrame(tick);
    };
    if (!navigator.mediaDevices?.getUserMedia) fail();
    else navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
      .then((s) => { if (stop) { s.getTracks().forEach((t) => t.stop()); return; } stream = s; const v = video.current; if (!v) return; v.srcObject = s; v.setAttribute('playsinline', 'true'); v.play().catch(() => {}); tick(); })
      .catch(fail);
    return () => { stop = true; cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); };
  }, []);
  return <div className="r-ed-cam">{error ? <p role="alert">{error}</p> : <video ref={video} muted playsInline />}</div>;
}

// ---------- the event, for whoever works it ----------
export function StaffEventsScreen({ ctx, events, id }: { ctx: TeamCtx; events: FarmEvent[]; id?: string }) {
  const today = todayISO(); const online = useOnline(); const nowIsoStr = new Date().toISOString();
  const published = events.filter((e) => e.published).sort((a, b) => a.start.localeCompare(b.start));
  const live = published.find((e) => isToday(e, today));
  const chosen = (id ? events.find((e) => e.id === id) : null) || live || published.find((e) => e.end >= nowIsoStr) || null;
  const tickets = useEventTickets(chosen?.id || '', !!chosen);
  const tabs = useEventTabs(chosen?.id || '', !!chosen);
  const products = useProducts(chosen?.id || '', !!chosen);
  const valid = tickets.items.filter((t) => t.status === 'valid');
  const arrived = valid.filter((t) => t.entries > 0).length;
  const scans = useMemo(() => valid.flatMap((t) => t.scans.map((s, i) => ({ t, s, n: i + 1 }))).sort((a, b) => b.s.at.localeCompare(a.s.at)).slice(0, 6), [tickets.items]);
  const openTabs = tabs.items.filter((t) => t.status === 'open');
  const upcoming = published.filter((e) => e.end >= nowIsoStr && e.id !== chosen?.id);
  if (!chosen) return (
    <>
      <Head backTo={id ? '/events-staff' : undefined} backLabel="אירועים" title="אירועים" />
      <Empty title="אין אירוע קרוב">{ctx.manager ? 'יוצרים אירוע בניהול, תחת אירועים.' : 'כשמנהל יפרסם אירוע, הכניסה והדוכן יופיעו כאן.'}</Empty>
      {ctx.manager && <div className="r-actions"><Btn kind="ghost" to="/manage/events">לניהול האירועים</Btn></div>}
    </>
  );
  const isLive = isToday(chosen, today);
  const activeProducts = products.items.filter((p) => p.active).length;
  const ready = !tickets.loading && !tickets.error && valid.length > 0;
  return (
    <>
      <Head backTo={id ? '/events-staff' : undefined} backLabel="אירועים" over={`${isLive ? 'היום' : fmtDayLong(dayOf(chosen.start))} · ${fmtTime(chosen.start)}–${fmtTime(chosen.end)}${isLive ? '' : ' · ' + inText(chosen.start)}`} title={chosen.title} />
      <div className="r-ed-gatebtns">
        <Btn className="r-ed-huge" to={`/scan/${chosen.id}`}>כניסה<small>סריקת כרטיסים</small></Btn>
        <Btn className="r-ed-huge" kind="ghost" to={`/stall/${chosen.id}`}>דוכן<small>רישום לחשבון</small></Btn>
      </div>
      <p className={'r-ed-ready' + (ready ? '' : ' warn')} role="status">
        {tickets.loading ? 'טוען את רשימת הכרטיסים לטלפון…'
          : tickets.error ? `רשימת הכרטיסים לא נטענה: ${tickets.error}. בלי הרשימה הסריקה לא תזהה כרטיסים.`
            : valid.length === 0 ? (online ? 'עדיין אין כרטיסים לאירוע הזה.' : 'אין קליטה, ורשימת הכרטיסים עוד לא ירדה לטלפון הזה. צריך לפתוח את המסך הזה פעם אחת כשיש קליטה.')
              : `${tickets_(valid.length)} ו־${activeProducts} מוצרים שמורים בטלפון הזה. הכניסה והדוכן עובדים גם בלי קליטה.`}
      </p>
      {valid.length > 0 && <div style={{ marginTop: 8 }}>
        <A className="r-linkrow" to={`/scan/${chosen.id}/search`}><div>נכנסו {arrived} מתוך {valid.length} <span>· חיפוש אורח לפי שם</span></div><Icon name="chev" /></A>
        <A className="r-linkrow" to={`/stall/${chosen.id}/tabs`}><div>חשבונות פתוחים בדוכן <span>· {openTabs.length}{openTabs.length ? ` · ${money(openTabs.reduce((s, t) => s + t.total, 0))}` : ''}</span></div><Icon name="chev" /></A>
        {ctx.manager && <A className="r-linkrow" to={`/manage/events/${chosen.id}`}><div>ניהול האירוע <span>· נרשמים, תשלומים, מוצרים</span></div><Icon name="chev" /></A>}
      </div>}
      {scans.length > 0 && <>
        <Sect title="נכנסו לאחרונה" />
        {scans.map(({ t, s, n }) => <div key={t.id + s.at} className="r-doneline"><s style={{ textDecoration: 'none', color: 'var(--r-ink)' }}>{who(t)}{n > 1 ? ` · כניסה ${n}` : ''}</s><b>{firstName(s.by.name)}</b><span>{fmtTime(s.at)}</span></div>)}
      </>}
      {upcoming.length > 0 && <>
        <Sect title="אירועים קרובים" />
        {upcoming.slice(0, 4).map((e) => (
          <A key={e.id} className="r-event" to={`/events-staff/${e.id}`} style={{ borderBlockWidth: '0 1px', borderColor: 'var(--r-line)', marginTop: 0 }}>
            <div className="r-day">{new Date(e.start).getDate()}<small>{fmtDateShort(e.start).replace(/^\d+\s*/, '')}</small></div>
            <div><b>{e.title}</b><span>{fmtWeekday(e.start)} · {inText(e.start)} · {fmtTime(e.start)}</span></div>
            <Icon name="chev" />
          </A>
        ))}
      </>}
    </>
  );
}

// ---------- the gate ----------
type Result =
  | { kind: 'ok'; name: string; line: string; again: number }
  | { kind: 'pay'; name: string; ticket: Ticket; order: Ticket[]; amount: number }
  | { kind: 'bad'; title: string; line: string };

function useGate(eventId: string, ctx: TeamCtx) {
  const { item: event, loading } = useEvent(eventId);
  const tickets = useEventTickets(eventId, true);
  const toast = useToast();
  const valid = tickets.items.filter((t) => t.status === 'valid');
  const stats = { total: valid.length, arrived: valid.filter((t) => t.entries > 0).length };
  const orderOf = (t: Ticket) => tickets.items.filter((x) => x.orderId === t.orderId && x.status === 'valid');
  const late = (e: unknown) => toast({ text: `הכניסה נספרה בטלפון, אבל השרת סירב: ${(e as Error)?.message || ''}`, kind: 'error' }, 7000);
  /** Counts one entry. The result is known before the write: the caller shows it at once. */
  const admit = (t: Ticket, paidOnsite = false) => { recordScan(t, ctx.actor, paidOnsite).catch(late); };
  /** Paid at the gate: the whole order is marked paid, and this ticket goes in. */
  const paidHere = (t: Ticket) => { payOrderOnsite(ctx.actor, orderOf(t).filter((x) => x.id !== t.id)).catch(late); admit(t, true); };
  return { event, loading, tickets, valid, stats, orderOf, admit, paidHere };
}

function ResultScreen({ r, onClose, onPaid, onLater, onSearch }: { r: Result; onClose: () => void; onPaid: () => void; onLater: () => void; onSearch: () => void }) {
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => { if (r.kind !== 'ok') return; const t = setTimeout(() => close.current(), 2600); return () => clearTimeout(t); }, [r]);
  const tone = r.kind === 'ok' ? (r.again > 1 ? 'again' : 'ok') : r.kind;
  return (
    <div className={'r-ed-result ' + tone} role="alertdialog" aria-live="assertive" aria-label="תוצאת הסריקה">
      {r.kind === 'ok' && <>
        <div className="r-ed-verdict">{r.again > 1 ? 'כניסה חוזרת' : 'מאושר'}</div>
        {r.again > 1 && <div className="r-ed-count">מספר {r.again}</div>}
        <div className="r-ed-name">{r.name}</div>
        <div className="r-ed-line">{r.line}</div>
        <div className="r-ed-acts"><Btn className="r-ed-huge" kind="ghost" onClick={onClose} autoFocus>הבא</Btn></div>
      </>}
      {r.kind === 'pay' && <>
        <div className="r-ed-verdict">ממתין לתשלום</div>
        <div className="r-ed-count">{money(r.amount)}</div>
        <div className="r-ed-name">{r.name}</div>
        <div className="r-ed-line">{tickets_(r.order.length)} בהזמנה של {r.ticket.ownerName}{r.ticket.paymentStatus === 'claimed' ? ' · סימן/ה שהעביר/ה, עוד לא אושר' : ''}</div>
        <div className="r-ed-acts">
          <Btn className="r-ed-huge" kind="gold" onClick={onPaid}>שולם כאן · להכניס<small>מסמן את כל ההזמנה כשולמה</small></Btn>
          <Btn kind="ghost" onClick={onLater}>להכניס, ישלמו אחר כך</Btn>
          <Btn kind="quiet" onClick={onClose}>לא להכניס</Btn>
        </div>
      </>}
      {r.kind === 'bad' && <>
        <div className="r-ed-verdict">{r.title}</div>
        <div className="r-ed-line">{r.line}</div>
        <div className="r-ed-acts"><Btn className="r-ed-huge" kind="ghost" onClick={onSearch}>לחפש לפי שם</Btn><Btn kind="quiet" onClick={onClose}>לסרוק שוב</Btn></div>
      </>}
    </div>
  );
}

export function ScanScreen({ eventId, ctx }: { eventId: string; ctx: TeamCtx }) {
  const g = useGate(eventId, ctx); const desktop = useDesktop();
  const [result, setResult] = useState<Result | null>(null);
  // the camera loop outlives renders: it reads the ticket list and the open result through refs
  const live = useRef({ g, result }); live.current = { g, result };
  const recent = useRef({ code: '', at: 0 });
  const okFor = (t: Ticket, paid: boolean): Result => ({ kind: 'ok', name: who(t), again: t.entries + 1, line: `כרטיס ${t.index} מתוך ${t.total}${t.holderName ? ` · הזמין/ה ${t.ownerName}` : ''} · ${paid ? 'שולם במקום' : PAYMENT_LABELS[t.paymentStatus]}` });
  const onCode = (code: string) => {
    const { g: cur, result: open } = live.current;
    if (open) return;
    const now = Date.now();
    if (recent.current.code === code && now - recent.current.at < 4000) return;
    recent.current = { code, at: now };
    const p = parseQr(code);
    if (!p) return setResult({ kind: 'bad', title: 'לא כרטיס של החווה', line: 'נסרק ברקוד אחר.' });
    const t = cur.tickets.items.find((x) => x.id === p.id);
    if (!t) return setResult({ kind: 'bad', title: 'לא נמצא', line: cur.tickets.loading ? 'רשימת הכרטיסים עוד נטענת. רגע, ולנסות שוב.' : 'הכרטיס לא שייך לאירוע הזה, או שהרשימה בטלפון לא מעודכנת.' });
    if (p.secret !== t.secret) return setResult({ kind: 'bad', title: 'ברקוד לא תקין', line: 'הקוד לא תואם את הכרטיס.' });
    if (t.status === 'cancelled') return setResult({ kind: 'bad', title: 'הכרטיס בוטל', line: `${t.ownerName} · כרטיס ${t.index} מתוך ${t.total}. אפשר לרשום אותו כאורח בדוכן.` });
    if (unpaid(t)) { const order = cur.orderOf(t); return setResult({ kind: 'pay', name: who(t), ticket: t, order, amount: t.price * order.filter(unpaid).length }); }
    cur.admit(t); setResult(okFor(t, false));
  };
  if (g.loading) return <><Head backTo={`/events-staff/${eventId}`} backLabel="האירוע" title="" /><div className="r-empty">טוען…</div></>;
  if (!g.event) return <><Head backTo="/events-staff" backLabel="אירועים" title="האירוע לא נמצא" /><Empty title="ייתכן שהוסר מפרסום" /></>;
  const gate = (
    <div className="r-ed-gate">
      <Camera onCode={onCode} />
      <div className="r-ed-gate-top">
        <button type="button" className="r-back" onClick={() => back(`/events-staff/${eventId}`)}><Icon name="back" />האירוע</button>
        <span aria-live="polite"><b>{g.stats.arrived}</b> מתוך {g.stats.total} נכנסו</span>
      </div>
      <div className="r-ed-gate-frame" aria-hidden="true" />
      <div className="r-ed-gate-bottom">
        {g.tickets.loading && <p role="status">טוען את רשימת הכרטיסים…</p>}
        {!g.tickets.loading && g.stats.total === 0 && <p role="alert">אין בטלפון כרטיסים לאירוע הזה. סריקה לא תזהה אף אחד.</p>}
        <Btn className="r-ed-huge" kind="ghost" to={`/scan/${eventId}/search`}>חיפוש בשם או טלפון</Btn>
        <A className="r-ed-gate-link" to={`/stall/${eventId}`}>לדוכן</A>
      </div>
      {result && <ResultScreen r={result} onClose={() => setResult(null)}
        onPaid={() => { if (result.kind !== 'pay') return; g.paidHere(result.ticket); setResult(okFor(result.ticket, true)); }}
        onLater={() => { if (result.kind !== 'pay') return; g.admit(result.ticket); setResult(okFor(result.ticket, false)); }}
        onSearch={() => { setResult(null); navigate(`/scan/${eventId}/search`); }} />}
    </div>
  );
  // On a phone the camera is the whole screen, above the bottom bar. It is mounted on <body>: inside the page it would be
  // trapped by the page's enter animation (an animated transform contains position:fixed).
  return desktop ? gate : createPortal(gate, document.body);
}

export function ScanSearchScreen({ eventId, ctx }: { eventId: string; ctx: TeamCtx }) {
  const g = useGate(eventId, ctx); const toast = useToast();
  const [q, setQ] = useState('');
  const orders = useMemo(() => {
    const t = q.trim().toLowerCase(); if (t.length < 2) return [];
    const d = digits(t);
    const m = new Map<string, Ticket[]>();
    for (const x of g.tickets.items) if (x.ownerName.toLowerCase().includes(t) || x.holderName.toLowerCase().includes(t) || (d.length >= 4 && digits(x.ownerPhone).includes(d))) m.set(x.orderId, []);
    for (const x of g.tickets.items) if (m.has(x.orderId)) m.get(x.orderId)!.push(x);
    return [...m.values()].map((o) => o.sort((a, b) => a.index - b.index));
  }, [q, g.tickets.items]);
  const shown = orders.slice(0, 8);
  const enter = (t: Ticket) => { g.admit(t); toast({ text: t.entries ? `כניסה חוזרת, מספר ${t.entries + 1}: ${who(t)}` : `נכנס/ה: ${who(t)}` }, 2500); };
  const enterAll = (list: Ticket[]) => { list.forEach((t) => g.admit(t)); toast({ text: `נכנסו ${list.length}: ${list[0].ownerName}` }, 3000); };
  if (g.loading) return <><Head backTo={`/scan/${eventId}`} backLabel="למצלמה" title="" /><div className="r-empty">טוען…</div></>;
  if (!g.event) return <><Head backTo="/events-staff" backLabel="אירועים" title="האירוע לא נמצא" /><Empty title="ייתכן שהוסר מפרסום" /></>;
  return (
    <>
      <Head backTo={`/scan/${eventId}`} backLabel="למצלמה" over={`${g.event.title} · נכנסו ${g.stats.arrived} מתוך ${g.stats.total}`} title="מי בכניסה?" />
      <Form onSubmit={() => {}} className="r-addline"><input className="r-input big" type="search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="שם או טלפון" aria-label="חיפוש אורח לפי שם או טלפון" enterKeyHint="search" autoComplete="off" /></Form>
      {q.trim().length >= 2 && <p className="r-hint" role="status">{orders.length === 0 ? 'אין הזמנה על השם הזה.' : orders.length > shown.length ? `${orders.length} הזמנות מתאימות, מוצגות ${shown.length}. כדאי לדייק.` : `${orders.length === 1 ? 'הזמנה אחת' : orders.length + ' הזמנות'}`}</p>}
      {shown.map((o) => {
        const first = o[0]; const valid = o.filter((x) => x.status === 'valid'); const waiting = valid.filter((x) => x.entries === 0); const owing = valid.filter(unpaid);
        return (
          <section key={first.orderId} className="r-ed-order">
            <header><h2>{first.ownerName}</h2><span dir="ltr">{first.ownerPhone}</span></header>
            {valid.length === 0 ? <p className="r-ed-owing">ההזמנה בוטלה. אי אפשר להכניס עם הכרטיסים האלה.</p> : <>
              {owing.length > 0 && <div className="r-ed-owing"><span>{PAYMENT_LABELS[owing[0].paymentStatus]} · <b>{money(first.price * owing.length)}</b></span><Btn small kind="gold" onClick={() => { payOrderOnsite(ctx.actor, owing).then(() => toast({ text: `שולם במקום: ${first.ownerName}` }, 2500)).catch((e) => toast({ text: (e as Error).message || 'לא נשמר', kind: 'error' })); }}>שולם כאן</Btn></div>}
              {valid.map((t) => (
                <div key={t.id} className={'r-ed-tk' + (t.entries ? ' in' : '')}>
                  <div><b>{who(t)}</b><span>כרטיס {t.index} מתוך {t.total}{t.entries ? ` · נכנס/ה${t.entries > 1 ? ' ' + t.entries + ' פעמים' : ''}` : ''}</span></div>
                  <Btn small kind={t.entries ? 'ghost' : 'primary'} onClick={() => enter(t)}>{t.entries ? 'כניסה חוזרת' : 'להכניס'}</Btn>
                </div>
              ))}
              {waiting.length > 1 && <div className="r-actions" style={{ paddingInline: 0, paddingTop: 12 }}><Btn block onClick={() => enterAll(waiting)}>להכניס את כולם ({waiting.length})</Btn></div>}
            </>}
          </section>
        );
      })}
      <div className="r-ed-walkin">
        <p><b>לא ברשימה?</b> אי אפשר להנפיק כרטיס בשער: כרטיס נוצר רק מהחשבון של האורח עצמו. אפשר לרשום אותו כאורח בדוכן, והוא יופיע ברשימות האירוע.</p>
        <Btn kind="ghost" to={`/stall/${eventId}/pick`}>לרשום כאורח בדוכן</Btn>
      </div>
    </>
  );
}

// ---------- the stall ----------
function useStall(eventId: string) {
  const { item: event, loading } = useEvent(eventId);
  const tabs = useEventTabs(eventId, true);
  const products = useProducts(eventId, true);
  const tickets = useEventTickets(eventId, true);
  const [currentId, setCurrentId] = useStored('farm-tab-' + eventId);
  const tab = tabs.items.find((t) => t.id === currentId && t.status === 'open') || null;
  const open = tabs.items.filter((t) => t.status === 'open');
  return { event, loading, tabs, products: products.items.filter((p) => p.active), tickets: tickets.items, tab, setCurrentId, open };
}
const lineKey = (tabId: string, i: TabItem) => `${tabId}|${i.productId}|${i.at}`;

export function StallScreen({ eventId, ctx }: { eventId: string; ctx: TeamCtx }) {
  const st = useStall(eventId); const toast = useToast(); useHiddenVersion();
  const [cart, setCart] = useState<Record<string, number>>({});
  const tabRef = useRef<Tab | null>(null); tabRef.current = st.tab;
  if (st.loading) return <><Head backTo={`/events-staff/${eventId}`} backLabel="האירוע" title="" /><div className="r-empty">טוען…</div></>;
  if (!st.event) return <><Head backTo="/events-staff" backLabel="אירועים" title="האירוע לא נמצא" /><Empty title="ייתכן שהוסר מפרסום" /></>;
  if (!st.tab) return <Pick eventId={eventId} ctx={ctx} st={st} backTo={`/events-staff/${eventId}`} backLabel="האירוע" />;
  const tab = st.tab;
  const step = (id: string, by: number) => setCart((c) => ({ ...c, [id]: Math.max(0, (c[id] || 0) + by) }));
  const picked = st.products.filter((p) => cart[p.id] > 0);
  const total = picked.reduce((s, p) => s + p.price * cart[p.id], 0);
  const lines = tab.items.filter((i) => !isHidden(lineKey(tab.id, i)));
  const owed = Math.round(lines.reduce((s, i) => s + i.price * i.qty, 0) * 100) / 100;
  const commit = () => {
    if (!picked.length) return;
    const items: TabItem[] = picked.map((p) => ({ productId: p.id, name: p.name, price: p.price, qty: cart[p.id], at: nowIso(), by: ctx.actor }));
    setCart({});
    addTabItems(ctx.actor, tab, items).then(() => toast({ text: `נרשמו ${money(total)} לחשבון של ${firstName(tab.guestName)}` }, 2500)).catch((e) => toast({ text: (e as Error).message || 'לא נשמר', kind: 'error' }));
  };
  const removeLine = (item: TabItem) => {
    const undo = deferDelete(lineKey(tab.id, item), () => {
      const cur = tabRef.current && tabRef.current.id === tab.id ? tabRef.current : tab;
      const index = cur.items.findIndex((x) => x.productId === item.productId && x.at === item.at);
      if (index >= 0) removeTabItem(ctx.actor, cur, index).catch(() => {});
    });
    toast({ text: `הוסר: ${item.name}`, actions: [{ label: 'ביטול', onClick: undo }] }, 6000);
  };
  const close = () => {
    setTabStatus(ctx.actor, tab, 'paid').then(() => toast({ text: `${firstName(tab.guestName)}: שולם במקום, ${money(owed)}. החשבון נסגר.` }, 3500)).catch((e) => toast({ text: (e as Error).message || 'לא נשמר', kind: 'error' }));
    st.setCurrentId('');
  };
  return (
    <>
      <Head backTo={`/events-staff/${eventId}`} backLabel="האירוע" over={`דוכן החווה${!tab.guestUid ? ' · לקוח מזדמן' : ''}`} title={tab.guestName} end={<button type="button" className="r-textlink" onClick={() => st.setCurrentId('')}>קונה אחר</button>} />
      {st.products.length === 0 ? <Empty title="אין מוצרים לאירוע הזה">מנהל מגדיר מוצרים ומחירים בניהול האירוע, תחת מוצרי הדוכן.</Empty>
        : <div role="group" aria-label="מה לוקחים">
          {st.products.map((p) => {
            const n = cart[p.id] || 0;
            return (
              <div key={p.id} className={'r-ed-prod' + (n ? ' on' : '')}>
                <button type="button" className="r-ed-prod-main" onClick={() => step(p.id, 1)} aria-label={`להוסיף ${p.name}, ${money(p.price)}`}><b>{p.name}</b><span>{money(p.price)}</span></button>
                <button type="button" className="r-ed-step" onClick={() => step(p.id, -1)} disabled={!n} aria-label={`פחות ${p.name}`}><Icon name="minus" /></button>
                <span className="r-ed-qtyn" aria-live="polite" aria-label={`${n} ${p.name}`}>{n || ''}</span>
                <button type="button" className="r-ed-step" onClick={() => step(p.id, 1)} aria-label={`עוד ${p.name}`}><Icon name="plus" /></button>
              </div>
            );
          })}
        </div>}
      <Sect title="בחשבון" n={lines.length ? money(owed) : undefined} />
      {lines.length === 0 ? <p className="r-hint">עוד לא נרשם כלום.</p>
        : [...lines].reverse().map((i) => (
          <div key={lineKey(tab.id, i)} className="r-ed-tabline">
            <div><b>{i.name}{i.qty > 1 ? ` ×${i.qty}` : ''}</b><span>{fmtTime(i.at)} · {firstName(i.by.name)}</span></div>
            <span className="r-ed-sum">{money(i.price * i.qty)}</span>
            <button type="button" className="r-ed-x" onClick={() => removeLine(i)} aria-label={`להסיר ${i.name}`}><Icon name="x" /></button>
          </div>
        ))}
      {lines.length > 0 && total === 0 && <div className="r-actions"><Btn kind="ghost" onClick={close}>שילם/ה במקום · {money(owed)}</Btn><Btn kind="quiet" onClick={() => st.setCurrentId('')}>ישלמו אחר כך</Btn></div>}
      {total > 0 && <div className="r-dock">
        <Btn onClick={commit}>להוסיף לחשבון · {money(total)}</Btn>
        <Btn kind="ghost" fit onClick={() => setCart({})}>ניקוי</Btn>
      </div>}
    </>
  );
}

export function StallPickScreen({ eventId, ctx }: { eventId: string; ctx: TeamCtx }) {
  const st = useStall(eventId);
  if (st.loading) return <><Head backTo={`/stall/${eventId}`} backLabel="דוכן" title="" /><div className="r-empty">טוען…</div></>;
  if (!st.event) return <><Head backTo="/events-staff" backLabel="אירועים" title="האירוע לא נמצא" /><Empty title="ייתכן שהוסר מפרסום" /></>;
  return <Pick eventId={eventId} ctx={ctx} st={st} backTo={`/events-staff/${eventId}`} backLabel="האירוע" />;
}

type Guest = { uid: string; name: string; phone: string; ticketId: string };
function Pick({ eventId, ctx, st, backTo, backLabel }: { eventId: string; ctx: TeamCtx; st: ReturnType<typeof useStall>; backTo: string; backLabel: string }) {
  const toast = useToast();
  const [scanning, setScanning] = useState(false);
  const [q, setQ] = useState('');
  const [name, setName] = useState(''); const [phone, setPhone] = useState(''); const [err, setErr] = useState('');
  const live = useRef(st); live.current = st;
  const matches = useMemo(() => {
    const t = q.trim().toLowerCase(); if (t.length < 2) return [];
    const d = digits(t); const seen = new Set<string>();
    return st.tickets.filter((x) => x.status === 'valid' && (x.ownerName.toLowerCase().includes(t) || x.holderName.toLowerCase().includes(t) || (d.length >= 4 && digits(x.ownerPhone).includes(d))))
      .filter((x) => { const k = who(x) + x.ownerUid; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 6);
  }, [q, st.tickets]);
  const start = (guest: Guest) => {
    const cur = live.current; if (!cur.event) return;
    const same = (t: Tab) => (guest.uid ? t.guestUid === guest.uid && t.guestName === guest.name : !t.guestUid && t.guestName.trim() === guest.name && digits(t.guestPhone) === digits(guest.phone));
    const existing = cur.open.find(same);
    if (existing) { cur.setCurrentId(existing.id); navigate(`/stall/${eventId}`, true); return; }
    openTab(ctx.actor, cur.event, guest).then((id) => { live.current.setCurrentId(id); navigate(`/stall/${eventId}`, true); }).catch((e) => toast({ text: (e as Error).message || 'לא הצלחנו לפתוח חשבון', kind: 'error' }));
  };
  const onCode = (code: string) => {
    const p = parseQr(code); const t = p && live.current.tickets.find((x) => x.id === p.id);
    if (!p || !t || t.secret !== p.secret) { toast({ text: 'זה לא כרטיס של האירוע הזה', kind: 'error' }, 3000); return; }
    if (t.status !== 'valid') { toast({ text: 'הכרטיס הזה בוטל. אפשר לרשום את האורח כלקוח מזדמן.', kind: 'error' }, 4000); return; }
    setScanning(false); start({ uid: t.ownerUid, name: who(t), phone: t.ownerPhone, ticketId: t.id });
  };
  const lastCode = useRef({ code: '', at: 0 });
  const onCodeOnce = (code: string) => { const now = Date.now(); if (lastCode.current.code === code && now - lastCode.current.at < 3000) return; lastCode.current = { code, at: now }; onCode(code); };
  const walkIn = () => {
    const n = name.trim();
    if (!n) { setErr('צריך שם, כדי לדעת של מי החשבון'); return; }
    start({ uid: '', name: n, phone: phone.trim(), ticketId: '' });
  };
  return (
    <>
      <Head backTo={backTo} backLabel={backLabel} over={`דוכן החווה · ${st.event?.title || ''}`} title="מי קונה?" end={<A className="r-textlink" to={`/stall/${eventId}/tabs`}>חשבונות · {st.open.length}</A>} />
      {scanning ? <div className="r-form" style={{ paddingTop: 0 }}><div className="r-ed-cambox"><Camera onCode={onCodeOnce} /></div><Btn kind="ghost" onClick={() => setScanning(false)}>סגירת המצלמה</Btn></div>
        : <div className="r-form" style={{ paddingTop: 0 }}><Btn className="r-ed-huge" onClick={() => setScanning(true)}>לסרוק את הכרטיס<small>אותו ברקוד של הכניסה</small></Btn></div>}
      <Form onSubmit={() => {}} className="r-addline"><input className="r-input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="או לחפש בשם או טלפון" aria-label="חיפוש קונה לפי שם או טלפון" enterKeyHint="search" autoComplete="off" /></Form>
      {q.trim().length >= 2 && matches.length === 0 && <p className="r-hint">אין כרטיס על השם הזה. אפשר לרשום כלקוח מזדמן, למטה.</p>}
      {matches.map((t) => <button key={t.id} type="button" className="r-ed-pickrow" onClick={() => start({ uid: t.ownerUid, name: who(t), phone: t.ownerPhone, ticketId: t.id })}><div><b>{who(t)}</b><span>{t.holderName ? `בהזמנה של ${t.ownerName} · ` : ''}<span dir="ltr">{t.ownerPhone}</span></span></div><Icon name="chev" /></button>)}
      {st.open.length > 0 && <>
        <Sect title="חשבונות פתוחים" n={st.open.length} more="לכולם" to={`/stall/${eventId}/tabs`} />
        {st.open.slice(0, 6).map((t) => <button key={t.id} type="button" className="r-ed-pickrow" onClick={() => { st.setCurrentId(t.id); navigate(`/stall/${eventId}`, true); }}><div><b>{t.guestName}</b><span>{!t.guestUid ? 'לקוח מזדמן · ' : ''}{t.items.length} פריטים · {relTime(t.updatedAt)}</span></div><span className="r-ed-sum">{money(t.total)}</span></button>)}
      </>}
      <Sect title="בלי כרטיס: לקוח מזדמן" />
      <Form onSubmit={walkIn}>
        <div className="r-field"><label htmlFor="walk-name">שם</label><input id="walk-name" className="r-input" value={name} onChange={(e) => { setName(e.target.value); setErr(''); }} maxLength={80} autoComplete="off" /></div>
        <div className="r-field"><label htmlFor="walk-phone">טלפון</label><input id="walk-phone" className="r-input" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={25} autoComplete="off" style={{ textAlign: 'start' }} /><span className="r-help">לא חובה. עוזר לשלוח תזכורת אם לא שילמו.</span></div>
        {err && <p className="r-err" role="alert">{err}</p>}
        <Btn type="submit" kind="ghost">לפתוח חשבון</Btn>
      </Form>
    </>
  );
}

export function StallTabsScreen({ eventId, ctx }: { eventId: string; ctx: TeamCtx }) {
  const st = useStall(eventId); const toast = useToast();
  const today = todayISO();
  if (st.loading) return <><Head backTo={`/stall/${eventId}`} backLabel="דוכן" title="" /><div className="r-empty">טוען…</div></>;
  if (!st.event) return <><Head backTo="/events-staff" backLabel="אירועים" title="האירוע לא נמצא" /><Empty title="ייתכן שהוסר מפרסום" /></>;
  const closed = st.tabs.items.filter((t) => t.status !== 'open' && dayOf(t.updatedAt) === today);
  const openTotal = st.open.reduce((s, t) => s + t.total, 0);
  const pay = (t: Tab) => setTabStatus(ctx.actor, t, 'paid').then(() => toast({ text: `${firstName(t.guestName)}: שולם במקום, ${money(t.total)}` }, 3000)).catch((e) => toast({ text: (e as Error).message || 'לא נשמר', kind: 'error' }));
  const closedText = (t: Tab) => (t.status === 'paid' ? 'שולם' : t.status === 'claimed' ? 'סימן/ה שהעביר/ה' : 'נמחל');
  return (
    <>
      <Head backTo={`/stall/${eventId}`} backLabel="דוכן" over={st.event.title} title="חשבונות הדוכן" />
      <p className="r-hint" style={{ fontSize: 17, color: 'var(--r-ink)' }}>{st.open.length === 0 ? 'אין חשבונות פתוחים.' : <><b>{st.open.length === 1 ? 'חשבון אחד פתוח' : `${st.open.length} חשבונות פתוחים`}</b>, יחד {money(openTotal)}. מי שלא שילם כאן ישלם אחר כך; החוב נשאר רשום.</>}</p>
      {st.open.map((t) => (
        <section key={t.id} className="r-ed-order">
          <header><h2>{t.guestName}</h2><span className="r-ed-sum">{money(t.total)}</span></header>
          <p className="r-ed-items">{!t.guestUid ? 'לקוח מזדמן · ' : ''}{t.items.map((i) => i.name + (i.qty > 1 ? ` ×${i.qty}` : '')).join(' · ') || 'עוד אין פריטים'} · {relTime(t.updatedAt)}</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
            <Btn small onClick={() => { st.setCurrentId(t.id); navigate(`/stall/${eventId}`); }}>להוסיף פריטים</Btn>
            {t.total > 0 && <Btn small kind="ghost" onClick={() => pay(t)}>שילם/ה במקום</Btn>}
          </div>
        </section>
      ))}
      {closed.length > 0 && <>
        <Sect title="נסגרו היום" n={closed.length} />
        {closed.map((t) => <div key={t.id} className="r-doneline"><s style={{ textDecoration: 'none', color: 'var(--r-ink)' }}>{t.guestName}</s><b>{closedText(t)}</b><span>{money(t.total)}</span></div>)}
      </>}
      <div className="r-actions"><Btn kind="ghost" to={`/stall/${eventId}/pick`}>קונה חדש</Btn></div>
    </>
  );
}
