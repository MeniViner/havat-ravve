// Event day for the team: entry scanning and the farm stall. Works offline once the ticket list is on the device.
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import jsQR from 'jsqr';
import type { FarmEvent, Product, Tab, Ticket, TabItem } from '../types';
import { PAYMENT_LABELS } from '../types';
import type { TeamCtx } from '../ctx';
import { Top, Ledger, Sec, Row, Pill, Btn, A, Icon, Empty, Field, Input, Avatar, Loading, useToast, fmtTime, fmtDateShort, fmtDayLong, firstName, relTime, todayISO, money, inText } from '../ui';
import { navigate } from '../router';
import { useEvent, useEventTickets, useEventTabs, useProducts, parseQr, recordScan, openTab, addTabItems, removeTabItem, setTabStatus, hasTabPurchases, isOpenTab, type StallGuest } from '../data';
import { nowIso } from '../firebase';
import { EventTeaser } from './Today';

const isToday = (e: FarmEvent, today: string) => e.start.slice(0, 10) <= today && e.end.slice(0, 10) >= today;
// ---------- camera ----------
function Camera({ onCode, hint }: { onCode: (s: string) => void; hint: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState('');
  const decode = useEffectEvent(onCode);

  useEffect(() => {
    const preview = video.current!;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    let stream: MediaStream | null = null;
    let raf = 0;
    let last = 0;
    let stopped = false;

    const tick = () => {
      if (stopped) return;
      const now = performance.now();
      if (!preview.paused && preview.readyState >= 2 && now - last > 140) {
        last = now;
        const w = 480;
        const h = Math.round(w * preview.videoHeight / Math.max(1, preview.videoWidth)) || 360;
        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(preview, 0, 0, w, h);
        const code = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' });
        if (code?.data) decode(code.data);
      }
      raf = requestAnimationFrame(tick);
    };

    const open = async () => {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      if (stopped) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      const track = stream.getVideoTracks()[0];
      type FocusConstraint = MediaTrackConstraintSet & { focusMode: 'continuous' };
      const capabilities = track?.getCapabilities?.() as (MediaTrackCapabilities & { focusMode?: string[] }) | undefined;
      if (capabilities?.focusMode?.includes('continuous')) {
        const focus: FocusConstraint = { focusMode: 'continuous' };
        const constraints = track.getConstraints?.() || {};
        void track.applyConstraints({ ...constraints, advanced: [...(constraints.advanced || []), focus] }).catch(() => {});
      }

      preview.srcObject = stream;
      await preview.play();
      if (!stopped) raf = requestAnimationFrame(tick);
    };
    const showPreview = () => setPlaying(true);
    preview.addEventListener('playing', showPreview);
    void open().catch(() => {
      if (stopped) return;
      stream?.getTracks().forEach((track) => track.stop());
      setPlaying(false);
      setError('אין גישה למצלמה. אפשרו מצלמה לאתר, או חפשו לפי שם.');
    });

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      preview.removeEventListener('playing', showPreview);
      preview.srcObject = null;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return (
    <div className={'camera' + (playing ? ' ready' : '')}>
      <video ref={video} muted playsInline />
      {playing ? <><div className="camera-frame" aria-hidden="true" /><div className="hintbox">{hint}</div></>
        : <p className="camera-status" role={error ? 'alert' : 'status'}>{error || 'מתחבר למצלמה…'}</p>}
    </div>
  );
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
  const openTabs = tabs.items.filter(isOpenTab);
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
const phoneDigits = (text: string) => text.replace(/\D/g, '');
const ticketName = (ticket: Ticket) => ticket.holderName || ticket.ownerName;
const ticketCount = (n: number) => n === 1 ? 'כרטיס אחד' : `${n} כרטיסים`;
const personName = (name: string) => name.trim().toLowerCase();

function groupEventTickets(tickets: Ticket[]) {
  const orders = new Map<string, Ticket[]>();
  const people = new Map<string, Ticket[]>();
  const add = (groups: Map<string, Ticket[]>, key: string, ticket: Ticket) => {
    const group = groups.get(key);
    if (group) group.push(ticket);
    else groups.set(key, [ticket]);
  };
  for (const ticket of tickets) {
    add(orders, ticket.orderId, ticket);
    if (ticket.status === 'valid') {
      const person = JSON.stringify([ticket.ownerUid, personName(ticketName(ticket))]);
      add(people, person, ticket);
    }
  }
  return { orders: [...orders.values()], people: [...people.values()] };
}

function ticketSearch(query: string) {
  const text = query.trim().toLowerCase();
  const digits = phoneDigits(text);
  return (ticket: Ticket) => !!text && (
    ticket.ownerName.toLowerCase().includes(text) || ticket.holderName.toLowerCase().includes(text)
    || (digits.length >= 4 && phoneDigits(ticket.ownerPhone).includes(digits))
  );
}

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
    if (t.paymentStatus === 'pending' || t.paymentStatus === 'claimed') { const order = tickets.items.filter((x) => x.orderId === t.orderId && x.status === 'valid'); return setResult({ kind: 'pay', title: PAYMENT_LABELS[t.paymentStatus], name: ticketName(t), sub: `${ticketCount(order.length)} · ${money(t.price * order.length)}`, ticket: t, order }); }
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

function ResultOverlay({ r, stats, settings, origin, onPaid, onAdmitAnyway, onClose, onSearch }: { r: Result; stats: { arrived: number; total: number }; settings: TeamCtx['settings']; origin: 'scan' | 'search'; onPaid: () => void; onAdmitAnyway: () => void; onClose: () => void; onSearch: () => void }) {
  const [left, setLeft] = useState(3);
  const close = useEffectEvent(onClose);
  useEffect(() => {
    if (r.kind !== 'ok') return;
    setLeft(3);
    const deadline = performance.now() + 3000;
    const tick = setInterval(() => {
      setLeft(Math.max(1, Math.ceil((deadline - performance.now()) / 1000)));
    }, 250);
    const timeout = setTimeout(() => close(), 3000);
    return () => { clearInterval(tick); clearTimeout(timeout); };
  }, [r]);
  const pay = settings.payment;
  return (
    <div className={'result ' + r.kind} role="dialog" aria-live="assertive">
      <div style={{ fontSize: 15, opacity: .85 }}>{stats.arrived} מתוך {stats.total}</div>
      <div className="big">{r.title}</div>
      {r.name && <div className="name">{r.name}</div>}
      {r.sub && <div className="sub">{r.sub}</div>}
      {r.kind === 'pay' && <div className="sub">{[pay.bit && `ביט ${pay.bit}`, pay.paybox && 'PayBox', pay.cash && 'מזומן'].filter(Boolean).join(' · ')}</div>}
      <div className="acts">
        {r.kind === 'ok' && <><Btn size="big" onClick={onClose}>הבא</Btn><div style={{ fontSize: 14, opacity: .8 }}>נסגר לבד בעוד {left} {left === 1 ? 'שנייה' : 'שניות'} וחוזר {origin === 'scan' ? 'לסריקה' : 'לחיפוש'}</div></>}
        {r.kind === 'pay' && <><Btn size="big" icon="check" onClick={onPaid}>שולם במקום · להכניס</Btn><Btn kind="ghost" onClick={onAdmitAnyway}>להכניס, ישלמו אחר כך</Btn><Btn kind="ghost" onClick={onClose}>סגירה</Btn></>}
        {r.kind === 'bad' && (origin === 'scan' ? <><Btn size="big" onClick={onSearch}>לחפש לפי שם</Btn><Btn kind="ghost" onClick={onClose}>לסרוק שוב</Btn></> : <Btn size="big" onClick={onClose}>חזרה לחיפוש</Btn>)}
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
      {!s.result && <Camera onCode={s.onCode} hint="מכוונים את הברקוד למסגרת. הזיהוי אוטומטי." />}
      <div className="actions"><Btn kind="ghost" size="big" icon="search" to={`/scan/${eventId}/search`}>חיפוש בשם או טלפון</Btn></div>
      {s.result && <ResultOverlay r={s.result} stats={s.stats} settings={ctx.settings} origin="scan" onClose={() => s.setResult(null)} onPaid={() => s.result?.ticket && s.admit(s.result.ticket, true)} onAdmitAnyway={() => s.result?.ticket && s.admit(s.result.ticket)} onSearch={() => { s.setResult(null); navigate(`/scan/${eventId}/search`); }} />}
    </>
  );
}

export function ScanSearchScreen({ eventId, ctx }: { eventId: string; ctx: TeamCtx }) {
  const s = useScanner(eventId, ctx);
  const [q, setQ] = useState('');
  const groupedOrders = useMemo(() => groupEventTickets(s.tickets.items).orders, [s.tickets.items]);
  const matches = ticketSearch(q);
  const orders = groupedOrders.filter((order) => order.some(matches)).slice(0, 8);
  if (!s.event) return <Loading />;
  return (
    <>
      <Top backTo={`/scan/${eventId}`} backLabel="למצלמה" title="מי בכניסה?" sub={`${s.event.title} · ${s.stats.arrived} מתוך ${s.stats.total}`} />
      <Field hint="שם או טלפון. מראים רק התאמות קרובות, לא את כל הרשימה."><Input big autoFocus placeholder="חיפוש" value={q} onChange={(e) => setQ(e.target.value)} /></Field>
      {q.trim() && <Sec title={orders.length ? `${orders.length} התאמות` : 'לא נמצא'} />}
      {orders.length > 0 && <div className="list">{orders.map((order) => {
        const valid = order.filter((t) => t.status === 'valid');
        const entered = valid.filter((t) => t.entries > 0).length;
        const matchingTickets = valid.filter(matches);
        const candidates = matchingTickets.length ? matchingTickets : valid;
        const nextTicket = candidates.find((t) => t.entries === 0) || candidates[0];
        const ticket = nextTicket || order[0];
        const pending = ticket.paymentStatus === 'pending' || ticket.paymentStatus === 'claimed';
        return (
          <Row key={ticket.orderId} center title={ticket.ownerName} meta={<>
            <span className="ltr">{ticket.ownerPhone}</span>
            <span>הזמנה {fmtDateShort(ticket.createdAt)} · {fmtTime(ticket.createdAt)}</span>
            {ticket.holderName && <span>{ticket.holderName}</span>}
            <span>{ticketCount(valid.length)}</span>
            {!valid.length ? <Pill tone="rust">בוטל</Pill> : <Pill tone={pending ? 'ochre' : 'ok'}>{PAYMENT_LABELS[ticket.paymentStatus]}{pending ? ` · ${money(ticket.price * valid.length)}` : ''}</Pill>}
            <span>{entered ? `נכנסו ${entered}` : 'טרם הגיעו'}</span>
          </>} end={nextTicket && <Btn size="sm" kind={pending ? 'ghost' : 'primary'} onClick={() => s.evaluate(nextTicket)}>{pending ? 'פתיחה' : 'להכניס'}</Btn>} />
        );
      })}</div>}
      <p className="note">לא ברשימה? אפשר לרשום אותו כאורח חדש בדוכן ("לקוח מזדמן"), או לבקש ממנהל להוסיף כרטיס.</p>
      <div className="actions"><Btn kind="ghost" icon="store" to={`/stall/${eventId}/pick`}>רישום אורח בלי כרטיס</Btn></div>
      {s.result && <ResultOverlay r={s.result} stats={s.stats} settings={ctx.settings} origin="search" onClose={() => s.setResult(null)} onPaid={() => s.result?.ticket && s.admit(s.result.ticket, true)} onAdmitAnyway={() => s.result?.ticket && s.admit(s.result.ticket)} onSearch={() => s.setResult(null)} />}
    </>
  );
}

// ---------- stall ----------
type StallSelection = { kind: 'tab'; id: string } | { kind: 'guest'; guest: StallGuest };

function ticketGuest(ticket: Ticket): StallGuest {
  return { uid: ticket.ownerUid, name: ticketName(ticket), phone: ticket.ownerPhone, ticketId: ticket.id };
}

function findOpenAccount(tabs: Tab[], guest: StallGuest) {
  const number = phoneDigits(guest.phone);
  const name = personName(guest.name);
  const matching = tabs.filter((tab) => tab.status === 'open' && (
    guest.uid ? tab.guestUid === guest.uid && personName(tab.guestName) === name
      : !tab.guestUid && !!number && phoneDigits(tab.guestPhone) === number
  ));
  return matching.find(hasTabPurchases) || matching[0];
}

export function StallScreen({ eventId, ctx, mode = 'sell' }: { eventId: string; ctx: TeamCtx; mode?: 'sell' | 'pick' | 'tabs' }) {
  const { item: event } = useEvent(eventId);
  const tabs = useEventTabs(eventId, true);
  const products = useProducts(eventId, true);
  const tickets = useEventTickets(eventId, true);
  const toast = useToast();
  const storageKey = 'farm-tab-' + eventId;
  const [selection, setSelection] = useState<StallSelection | null>(() => {
    try {
      const id = localStorage.getItem(storageKey);
      return id ? { kind: 'tab', id } : null;
    } catch {
      return null;
    }
  });
  const [cart, setCart] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const cartVersion = useRef(0);

  const remember = (next: StallSelection | null) => {
    setSelection(next);
    try {
      if (next?.kind === 'tab') localStorage.setItem(storageKey, next.id);
      else localStorage.removeItem(storageKey);
    } catch {}
  };
  const resetCart = () => {
    cartVersion.current++;
    setCart({});
  };
  const select = (next: StallSelection | null) => {
    if (submitting.current) return;
    remember(next);
    resetCart();
    if (mode === 'sell') window.scrollTo(0, 0);
    else navigate(`/stall/${eventId}`, mode === 'pick');
  };
  const chooseAccount = (tab: Tab) => select({ kind: 'tab', id: tab.id });
  const chooseGuest = (guest: StallGuest) => {
    const account = findOpenAccount(tabs.items, guest);
    if (account) chooseAccount(account);
    else select({ kind: 'guest', guest });
  };

  if (!event) return <Loading />;
  const open = tabs.items.filter(isOpenTab);
  if (mode === 'tabs') return <StallAccounts event={event} ctx={ctx} tabs={tabs.items} open={open} onAccount={chooseAccount} saving={saving} />;

  const tab = selection?.kind === 'tab' ? tabs.items.find((t) => t.id === selection.id && t.status === 'open') : undefined;
  const guest = selection?.kind === 'guest' ? selection.guest : undefined;
  if (mode === 'sell' && selection?.kind === 'tab' && !tab && (tabs.loading || saving)) return <Loading />;
  if (mode === 'pick' || (!tab && !guest)) {
    return <StallPicker eventId={eventId} tickets={tickets.items} open={open} inline={mode === 'sell'} onGuest={chooseGuest} onAccount={chooseAccount} />;
  }

  const activeProducts = products.items.filter((product) => product.active);
  const selected = activeProducts.filter((product) => cart[product.id] > 0);
  const total = Math.round(selected.reduce((subtotal, product) => subtotal + product.price * cart[product.id], 0) * 100) / 100;
  const name = tab?.guestName ?? guest!.name;
  const accountsPath = `/stall/${eventId}/tabs`;

  const adjust = (id: string, change: number) => {
    if (submitting.current) return;
    setCart((current) => {
      const qty = (current[id] || 0) + change;
      const next = { ...current };
      if (qty > 0) next[id] = qty;
      else delete next[id];
      return next;
    });
  };
  const clear = () => {
    const before = cart;
    resetCart();
    const version = cartVersion.current;
    toast({ text: 'העגלה נוקתה', action: { label: 'ביטול', onClick: () => {
      if (version !== cartVersion.current || submitting.current) return;
      setCart((current) => {
        const restored = { ...current };
        for (const [id, qty] of Object.entries(before)) restored[id] = (restored[id] || 0) + qty;
        return restored;
      });
    } } }, 5000);
  };
  const commit = async () => {
    if (!selected.length || submitting.current) return;
    submitting.current = true;
    setSaving(true);
    const items = selected.map((product): TabItem => ({
      productId: product.id, name: product.name, price: product.price, qty: cart[product.id], at: nowIso(), by: ctx.actor,
    }));
    try {
      const account = tab || findOpenAccount(tabs.items, guest!) || await openTab(ctx.actor, event, guest!);
      // Keep the account ID and cart together if the first item update has to be retried.
      if (!tab) remember({ kind: 'tab', id: account.id });
      await addTabItems(ctx.actor, account, items);
      resetCart();
      toast({ text: `נרשם ${money(total)} לחשבון של ${firstName(account.guestName)}` }, 2500);
    } catch {
      toast({ text: 'לא נשמר', kind: 'error' });
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  };
  return (
    <>
      <Top backTo={`/scan/${eventId}`} backLabel="כניסה" title="דוכן החווה" sub={<A to={accountsPath} className="stall-account-link">{open.length} חשבונות פתוחים</A>} />
      <div className="row center" style={{ borderTop: '1px solid var(--line2)', marginTop: 8 }}>
        <Avatar name={name} />
        <div className="main"><div className="title">{tab && isOpenTab(tab) ? <A to={accountsPath} className="stall-account-link">{name}</A> : name}</div>
          <div className="meta">{tab && hasTabPurchases(tab) ? <span>בחשבון עד עכשיו: {money(tab.total)} · {tab.items.length} פריטים</span> : <span>חשבון חדש</span>}</div>
        </div>
        <Btn kind="ghost" size="sm" disabled={saving} onClick={() => select(null)}>החלפה</Btn>
      </div>
      <Sec title="מה לוקחים?" n="לחיצה מוסיפה 1" />
      {!activeProducts.length && <Empty title="אין מוצרים לאירוע הזה" text="מנהל מגדיר מוצרים ומחירים בניהול ← האירוע ← מוצרי הדוכן." />}
      <div className="products">{activeProducts.map((product) =>
        <StallProduct key={product.id} product={product} qty={cart[product.id] || 0} disabled={saving} onAdjust={adjust} />
      )}</div>
      {tab && tab.items.length > 0 && <>
        <Sec title="בחשבון" n={tab.items.length} />
        <div className="list">{[...tab.items].reverse().map((item, n) => {
          const index = tab.items.length - 1 - n;
          return <Row key={index} center title={<>{item.name}{item.qty > 1 ? ` ×${item.qty}` : ''}</>}
            meta={<span>{fmtTime(item.at)} · {firstName(item.by.name)}</span>}
            end={<><span className="amount">{money(item.price * item.qty)}</span><button type="button" className="iconbtn" aria-label="הסרה" disabled={saving} onClick={() => removeTabItem(ctx.actor, tab, index)}><Icon name="x" size={18} /></button></>} />;
        })}</div>
      </>}
      {selected.length > 0 && <div className="cartbar">
        <div className="cartbar-summary"><div><b>{money(total)}</b><div className="sub">{selected.map((product) => `${product.name} ×${cart[product.id]}`).join(' · ')}</div></div>
          <Btn kind="quiet" size="sm" className="cartbar-clear" disabled={saving} onClick={clear}>נקה הכל</Btn>
        </div>
        <Btn block size="big" style={{ marginTop: 12 }} disabled={saving} onClick={commit}>{saving ? 'שומר…' : `רישום לחשבון של ${firstName(name)}`}</Btn>
      </div>}
    </>
  );
}

function StallProduct({ product, qty, disabled, onAdjust }: { product: Product; qty: number; disabled: boolean; onAdjust: (id: string, change: number) => void }) {
  const { id, name, price } = product;
  return (
    <div className={'product' + (qty ? ' on' : '')}>
      <button type="button" className="product-add" disabled={disabled} onClick={() => onAdjust(id, 1)}
        onContextMenu={(e) => { if (qty) { e.preventDefault(); onAdjust(id, -1); } }}>
        <b>{name}</b><span>{money(price)}</span>
      </button>
      {qty > 0 && <div className="product-qty">
        <button type="button" aria-label={`הוספת ${name}`} disabled={disabled} onClick={() => onAdjust(id, 1)}>+</button>
        <output aria-label={`כמות ${name}`}>{qty}</output>
        <button type="button" aria-label={`הפחתת ${name}`} disabled={disabled} onClick={() => onAdjust(id, -1)}>−</button>
      </div>}
    </div>
  );
}

function StallPicker({ eventId, tickets, open, inline, onGuest, onAccount }: { eventId: string; tickets: Ticket[]; open: Tab[]; inline: boolean; onGuest: (guest: StallGuest) => void; onAccount: (tab: Tab) => void }) {
  const [scanning, setScanning] = useState(false);
  const [q, setQ] = useState('');
  const [walk, setWalk] = useState({ name: '', phone: '' });
  const people = useMemo(() => groupEventTickets(tickets).people, [tickets]);
  const search = ticketSearch(q);
  const matches = people.filter((group) => group.some(search)).slice(0, 6);
  const onCode = (code: string) => {
    const parsed = parseQr(code);
    const ticket = parsed && tickets.find((t) => t.id === parsed.id && t.secret === parsed.secret && t.status === 'valid');
    if (!ticket) return;
    setScanning(false);
    onGuest(ticketGuest(ticket));
  };
  return (
    <>
      <Top backTo={inline ? `/scan/${eventId}` : `/stall/${eventId}`} backLabel={inline ? 'כניסה' : 'דוכן'} title="מי קונה?" sub={<A to={`/stall/${eventId}/tabs`} className="stall-account-link">{open.length} חשבונות פתוחים</A>} />
      {scanning ? <><Camera onCode={onCode} hint="אותו QR של הכניסה. החשבון נפתח על שם בעל הכרטיס." /><div className="actions"><Btn kind="ghost" onClick={() => setScanning(false)}>סגירת המצלמה</Btn></div></>
        : <div className="actions" style={{ paddingBottom: 0 }}><Btn size="big" icon="qr" onClick={() => setScanning(true)}>סריקת הכרטיס של האורח</Btn><p className="lead" style={{ padding: 0, fontSize: 14 }}>אותו QR של הכניסה. החשבון נפתח על שם בעל הכרטיס.</p></div>}
      <Field><Input placeholder="חיפוש בשם או טלפון" value={q} onChange={(e) => setQ(e.target.value)} /></Field>
      {matches.length > 0 && <div className="list" style={{ marginTop: 8 }}>{matches.map((group) => {
        const guest = ticketGuest(group[0]);
        return <Row key={guest.ticketId} center onClick={() => onGuest(guest)} start={<Avatar name={guest.name} />} title={guest.name}
          meta={<><span className="ltr">{guest.phone}</span><span>{ticketCount(group.length)}</span></>} chev />;
      })}</div>}
      {open.length > 0 && <><Sec title="פתוחים עכשיו" n={open.length} link="הכל" linkTo={`/stall/${eventId}/tabs`} /><div className="list">{open.map((tab) =>
        <Row key={tab.id} center onClick={() => onAccount(tab)} start={<Avatar name={tab.guestName} />}
          title={<>{tab.guestName}{!tab.guestUid && tab.guestPhone && <span className="muted ltr" style={{ fontWeight: 400, fontSize: 14 }}> · {tab.guestPhone}</span>}</>}
          meta={<span>{!tab.guestUid ? 'לקוח מזדמן · ' : ''}{tab.items.length} פריטים · {relTime(tab.updatedAt)}</span>} end={<span className="amount">{money(tab.total)}</span>} />
      )}</div></>}
      <Sec title="בלי כרטיס? לקוח מזדמן" />
      <Field><Input placeholder="שם" value={walk.name} onChange={(e) => setWalk({ ...walk, name: e.target.value })} /></Field>
      <Field><Input placeholder="טלפון" dir="ltr" inputMode="tel" value={walk.phone} onChange={(e) => setWalk({ ...walk, phone: e.target.value })} /></Field>
      <div className="actions"><Btn kind="ghost" disabled={!walk.name.trim()} onClick={() => onGuest({ uid: '', name: walk.name.trim(), phone: walk.phone.trim(), ticketId: '' })}>המשך לדוכן</Btn></div>
    </>
  );
}

function StallAccounts({ event, ctx, tabs, open, onAccount, saving }: { event: FarmEvent; ctx: TeamCtx; tabs: Tab[]; open: Tab[]; onAccount: (tab: Tab) => void; saving: boolean }) {
  const toast = useToast();
  const today = todayISO();
  const closed = tabs.filter((tab) => tab.status !== 'open' && tab.updatedAt.slice(0, 10) === today && hasTabPurchases(tab));
  const openTotal = open.reduce((sum, tab) => sum + tab.total, 0);
  const soldToday = tabs.filter((tab) => tab.createdAt.slice(0, 10) === today).reduce((sum, tab) => sum + tab.total, 0);
  const paid = async (tab: Tab) => {
    try {
      await setTabStatus(ctx.actor, tab, 'paid');
      toast({ text: `${firstName(tab.guestName)} · שולם במקום` }, 2500);
    } catch {
      toast({ text: 'לא נשמר', kind: 'error' });
    }
  };
  return (
    <>
      <Top backTo={`/stall/${event.id}`} backLabel="דוכן" title="חשבונות הדוכן" sub={`${event.title} · על בסיס אמון, משלמים בסוף או בבית`} />
      <Ledger items={[{ n: money(openTotal), label: 'פתוחים', tone: openTotal ? 'ochre' : undefined }, { n: open.length, label: 'חשבונות פתוחים' }, { n: money(soldToday), label: 'נמכרו היום' }]} small />
      <Sec title="פתוחים" n={open.length} />
      <div className="list">{open.map((tab) => <div key={tab.id} className="row">
        <Avatar name={tab.guestName} />
        <div className="main">
          <div className="title">{tab.guestName}{!tab.guestUid && tab.guestPhone && <span className="muted ltr" style={{ fontWeight: 400, fontSize: 14 }}> · {tab.guestPhone}</span>}</div>
          <div className="meta"><span>{tab.items.map((item) => item.name + (item.qty > 1 ? ` ×${item.qty}` : '')).join(' · ') || 'עוד אין פריטים'} · {relTime(tab.updatedAt)}</span></div>
          <div className="inline" style={{ marginTop: 8 }}>
            <Btn size="sm" disabled={saving} onClick={() => paid(tab)}>שילם/ה במקום</Btn>
            <Btn size="sm" kind="ghost" disabled={saving} onClick={() => onAccount(tab)}>הוספת פריטים</Btn>
          </div>
        </div>
        <span className="amount">{money(tab.total)}</span>
      </div>)}{!open.length && <p className="lead">אין חשבונות פתוחים.</p>}</div>
      {closed.length > 0 && <><Sec title="נסגרו היום" n={closed.length} /><div className="list">{closed.map((tab) => <Row key={tab.id} center title={tab.guestName} meta={<span>{tab.status === 'paid' ? 'שולם במקום' : tab.status === 'claimed' ? 'סימן/ה "העברתי"' : 'נמחל'} · {fmtTime(tab.updatedAt)}</span>} end={<span className="amount">{money(tab.total)}</span>} />)}</div></>}
    </>
  );
}

