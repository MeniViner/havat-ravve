import { useEffect, useMemo, useRef, useState } from 'react';
import jsQR from 'jsqr';
import type { Actor, FarmEvent, Ticket, Tab, Product, TabItem } from '../types';
import { PAYMENT_LABELS, TAB_LABELS } from '../types';
import { useAllEvents, useEventTickets, parseQr, recordScan, useProducts, useEventTabs, openTab, addTabItems, removeTabItem, setTabStatus } from '../data';
import { Icon, Sheet, Button, Empty, Segmented, useToast, fmtTime, relTime, firstName } from '../ui';
import { nowIso } from '../firebase';

type Ctx = { actor: Actor; manager: boolean };
type ScreenProps = { ctx: Ctx; embedded?: boolean; eventId?: string };

// ---------- event picker (shared by scan + stall) ----------
function useEventChoice(enabled: boolean, fixedId?: string) {
  const { items } = useAllEvents(enabled);
  const now = Date.now();
  const sorted = useMemo(() => [...items].sort((a, b) => Math.abs(new Date(a.start).getTime() - now) - Math.abs(new Date(b.start).getTime() - now)), [items]);
  const [id, setId] = useState(() => fixedId || localStorage.getItem('farm-event') || '');
  useEffect(() => { if (fixedId) setId(fixedId); }, [fixedId]);
  useEffect(() => { if (!id && sorted[0]) setId(sorted[0].id); }, [sorted.length]);
  useEffect(() => { if (id && !fixedId) localStorage.setItem('farm-event', id); }, [id]);
  return { events: sorted, event: sorted.find((e) => e.id === id) || null, setId, fixed: !!fixedId };
}
function EventPicker({ events, event, setId, fixed }: { events: FarmEvent[]; event: FarmEvent | null; setId: (s: string) => void; fixed?: boolean }) {
  if (fixed) return null;
  if (!events.length) return <Empty title="אין אירועים" text="מנהל יוצר אירוע בניהול → אירועים." icon="clock" />;
  return <label className="field"><span>אירוע</span><select value={event?.id || ''} onChange={(e) => setId(e.target.value)}>{events.map((e) => <option key={e.id} value={e.id}>{e.title} · {new Date(e.start).toLocaleDateString('he-IL')}</option>)}</select></label>;
}

// ---------- camera ----------
function Camera({ onCode, active }: { onCode: (s: string) => void; active: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!active) return;
    let stream: MediaStream | null = null; let raf = 0; let last = 0; let stop = false;
    const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
      .then((s) => { if (stop) { s.getTracks().forEach((t) => t.stop()); return; } stream = s; const v = video.current!; v.srcObject = s; v.setAttribute('playsinline', 'true'); v.play().catch(() => {}); tick(); })
      .catch(() => setError('אין גישה למצלמה. אפשרו מצלמה לאתר, או השתמשו בחיפוש ידני.'));
    const tick = () => {
      if (stop) return;
      const v = video.current;
      const t = performance.now();
      if (v && v.readyState >= 2 && t - last > 140) {
        last = t;
        const w = 480, h = Math.round(480 * v.videoHeight / Math.max(1, v.videoWidth)) || 360;
        canvas.width = w; canvas.height = h; ctx.drawImage(v, 0, 0, w, h);
        const img = ctx.getImageData(0, 0, w, h);
        const code = jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' });
        if (code?.data) onCode(code.data);
      }
      raf = requestAnimationFrame(tick);
    };
    return () => { stop = true; cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); };
  }, [active]);
  return <div className="camera">{error ? <p className="hint" style={{ padding: 16 }}>{error}</p> : <video ref={video} muted playsInline />}<div className="camera-frame" aria-hidden="true" /></div>;
}

// ---------- scan result ----------
type Result = { kind: 'ok' | 'pay' | 'bad'; title: string; text: string; ticket?: Ticket };

function ResultCard({ r, onPaid, onClose }: { r: Result; onPaid: () => void; onClose: () => void }) {
  return (
    <div className={'scan-result ' + r.kind}>
      <div className="scan-result-icon"><Icon name={r.kind === 'ok' ? 'check' : r.kind === 'pay' ? 'clock' : 'x'} size={40} /></div>
      <h2>{r.title}</h2>
      <p>{r.text}</p>
      <div className="row-actions" style={{ justifyContent: 'center' }}>
        {r.kind === 'pay' && <Button kind="primary" onClick={onPaid}><Icon name="check" />שולם במקום, להכניס</Button>}
        <Button kind={r.kind === 'pay' ? 'quiet' : 'secondary'} onClick={onClose}>{r.kind === 'ok' ? 'הבא' : 'סגירה'}</Button>
      </div>
    </div>
  );
}

function useTicketLookup(tickets: Ticket[]) {
  const [q, setQ] = useState('');
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase(); if (s.length < 2) return [];
    const digits = s.replace(/\D/g, '');
    return tickets.filter((t) => t.status === 'valid' && (t.ownerName.toLowerCase().includes(s) || t.holderName.toLowerCase().includes(s) || (digits.length >= 4 && t.ownerPhone.replace(/\D/g, '').includes(digits)))).slice(0, 6);
  }, [q, tickets]);
  return { q, setQ, matches };
}

// ---------- entry scanning ----------
export function ScanScreen({ ctx, embedded = false, eventId }: ScreenProps) {
  const { events, event, setId, fixed } = useEventChoice(true, eventId);
  const tickets = useEventTickets(event?.id || '', !!event);
  const [result, setResult] = useState<Result | null>(null);
  const [mode, setMode] = useState<'camera' | 'search'>('camera');
  const lookup = useTicketLookup(tickets.items);
  const toast = useToast();
  const recent = useRef<{ code: string; at: number }>({ code: '', at: 0 });
  const stats = useMemo(() => {
    const valid = tickets.items.filter((t) => t.status === 'valid');
    return { total: valid.length, arrived: valid.filter((t) => t.entries > 0).length, entries: valid.reduce((s, t) => s + t.entries, 0) };
  }, [tickets.items]);
  const admit = async (t: Ticket, paidOnsite = false) => {
    try { await recordScan(t, ctx.actor, paidOnsite); }
    catch { toast({ text: 'הסריקה לא נשמרה, אבל נספרה מקומית. תסתנכרן כשיש רשת.', kind: 'error' }); }
    setResult({ kind: 'ok', title: 'מאושר', text: `${t.holderName || t.ownerName} · כרטיס ${t.index}/${t.total} · כניסה ${t.entries + 1}`, ticket: t });
  };
  const evaluate = (t: Ticket | undefined, secret?: string) => {
    if (!t) return setResult({ kind: 'bad', title: 'לא נמצא', text: 'הכרטיס לא שייך לאירוע הזה, או שהרשימה עוד לא ירדה למכשיר.' });
    if (secret !== undefined && secret !== t.secret) return setResult({ kind: 'bad', title: 'ברקוד לא תקין', text: 'הקוד לא תואם את הכרטיס.' });
    if (t.status === 'cancelled') return setResult({ kind: 'bad', title: 'כרטיס בוטל', text: `${t.ownerName} · כרטיס ${t.index}/${t.total}` });
    if (t.paymentStatus === 'pending' || t.paymentStatus === 'claimed') return setResult({ kind: 'pay', title: 'ממתין לתשלום', text: `${t.holderName || t.ownerName} · ${t.price} ₪ · ${PAYMENT_LABELS[t.paymentStatus]}`, ticket: t });
    admit(t);
  };
  const onCode = (code: string) => {
    if (result) return;
    const now = Date.now();
    if (recent.current.code === code && now - recent.current.at < 4000) return;
    recent.current = { code, at: now };
    const p = parseQr(code);
    if (!p) return setResult({ kind: 'bad', title: 'זה לא כרטיס של החווה', text: 'נסרק ברקוד אחר.' });
    evaluate(tickets.items.find((t) => t.id === p.id), p.secret);
  };
  return (
    <>
      {!embedded && <header className="topbar"><div><h1>כניסה לאירוע</h1></div></header>}
      {event && <div className="hint" style={{ margin: '0 0 10px' }}>{`${stats.arrived} הגיעו מתוך ${stats.total} · ${stats.entries} כניסות`}</div>}
      <EventPicker events={events} event={event} setId={setId} fixed={fixed} />
      {event && (
        <>
          <div className="offline-strip" style={{ background: 'var(--ok-bg)', color: 'var(--ok)' }}><Icon name="download" size={18} />{tickets.loading ? 'מוריד את רשימת הכרטיסים…' : `${tickets.items.length} כרטיסים במכשיר. הסריקה עובדת גם בלי קליטה.`}</div>
          <Segmented value={mode} onChange={setMode} options={[{ value: 'camera', label: 'סריקה' }, { value: 'search', label: 'חיפוש ידני' }]} />
          {mode === 'camera' ? <Camera active={!result} onCode={onCode} /> : (
            <>
              <label className="field"><span className="sr-only">חיפוש</span><input data-autofocus value={lookup.q} onChange={(e) => lookup.setQ(e.target.value)} placeholder="שם או טלפון" /></label>
              {lookup.q.trim().length >= 2 && (lookup.matches.length ? <div className="list">{lookup.matches.map((t) => (
                <button type="button" className="row" key={t.id} onClick={() => evaluate(t)}><div className="row-main"><div className="row-title">{t.holderName || t.ownerName}{t.holderName && <span className="hint"> · הזמין/ה {t.ownerName}</span>}</div><div className="row-meta"><span>כרטיס {t.index}/{t.total}</span><span className={'tag ' + (t.paymentStatus === 'pending' ? 'warn' : 'ok')}>{PAYMENT_LABELS[t.paymentStatus]}</span>{t.entries > 0 && <span>נכנס {t.entries}</span>}</div></div><span className="row-end"><Icon name="chev" size={18} /></span></button>
              ))}</div> : <p className="hint">לא נמצא. מציגים רק התאמות קרובות.</p>)}
            </>
          )}
        </>
      )}
      <Sheet open={!!result} onClose={() => setResult(null)}>{result && <ResultCard r={result} onPaid={() => { if (result.ticket) admit(result.ticket, true); }} onClose={() => setResult(null)} />}</Sheet>
    </>
  );
}

// ---------- farm stall ----------
export function StallScreen({ ctx, embedded = false, eventId }: ScreenProps) {
  const { events, event, setId, fixed } = useEventChoice(true, eventId);
  const tickets = useEventTickets(event?.id || '', !!event);
  const products = useProducts(event?.id || '', !!event);
  const tabs = useEventTabs(event?.id || '', !!event);
  const [current, setCurrent] = useState<string>('');
  const [picking, setPicking] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [walkin, setWalkin] = useState({ name: '', phone: '' });
  const [cart, setCart] = useState<Record<string, number>>({});
  const lookup = useTicketLookup(tickets.items);
  const toast = useToast();
  const tab = tabs.items.find((t) => t.id === current) || null;
  const active = products.items.filter((p) => p.active);
  const openTabs = tabs.items.filter((t) => t.status === 'open');
  const startFor = async (guest: { uid: string; name: string; phone: string; ticketId: string }) => {
    if (!event) return;
    const existing = tabs.items.find((t) => t.status === 'open' && ((guest.uid && t.guestUid === guest.uid) || (!guest.uid && t.guestPhone && t.guestPhone === guest.phone)));
    if (existing) { setCurrent(existing.id); setPicking(false); return; }
    try { const id = await openTab(ctx.actor, event, guest); setCurrent(id); setPicking(false); } catch { toast({ text: 'לא הצלחנו לפתוח חשבון', kind: 'error' }); }
  };
  const onCode = (code: string) => { const p = parseQr(code); const t = p && tickets.items.find((x) => x.id === p.id && x.secret === p.secret); if (!t) return; setScanning(false); startFor({ uid: t.ownerUid, name: t.holderName || t.ownerName, phone: t.ownerPhone, ticketId: t.id }); };
  const cartTotal = Object.entries(cart).reduce((s, [id, q]) => s + (active.find((p) => p.id === id)?.price || 0) * q, 0);
  const commit = async () => {
    if (!tab) return;
    const items: TabItem[] = Object.entries(cart).filter(([, q]) => q > 0).map(([id, qty]) => { const p = active.find((x) => x.id === id)!; return { productId: id, name: p.name, price: p.price, qty, at: nowIso(), by: ctx.actor }; });
    if (!items.length) return;
    try { await addTabItems(ctx.actor, tab, items); setCart({}); toast({ text: `נרשם: ${cartTotal} ₪ לחשבון של ${firstName(tab.guestName)}` }, 2500); }
    catch { toast({ text: 'לא נשמר', kind: 'error' }); }
  };
  return (
    <>
      {!embedded && <header className="topbar"><div><h1>דוכן החווה</h1></div></header>}
      {event && <div className="hint" style={{ margin: '0 0 10px' }}>{`${openTabs.length} חשבונות פתוחים`}</div>}
      <EventPicker events={events} event={event} setId={setId} fixed={fixed} />
      {event && !active.length && <Empty title="אין מוצרים לאירוע הזה" text="מנהל מגדיר מוצרים ומחירים בניהול → אירועים → מוצרי הדוכן." icon="cart" />}
      {event && active.length > 0 && (
        <>
          <div className="card" style={{ padding: 12, marginBottom: 14 }}>
            {tab ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Icon name="user" /><div style={{ flex: 1 }}><b style={{ fontWeight: 500 }}>{tab.guestName}</b><div className="hint">{tab.items.length} פריטים · {tab.total} ₪</div></div><Button kind="quiet" className="sm" onClick={() => { setCurrent(''); setCart({}); }}>החלפה</Button></div>
            ) : (
              <div className="row-actions" style={{ margin: 0 }}><Button kind="primary" onClick={() => setScanning(true)}><Icon name="camera" />סריקת כרטיס</Button><Button kind="secondary" onClick={() => setPicking(true)}><Icon name="user" />חיפוש או לקוח מזדמן</Button></div>
            )}
          </div>
          {tab && (
            <>
              <div className="products">{active.map((p) => <button type="button" key={p.id} className={'product ' + (cart[p.id] ? 'on' : '')} onClick={() => setCart({ ...cart, [p.id]: (cart[p.id] || 0) + 1 })}><b>{p.name}</b><span>{p.price} ₪</span>{cart[p.id] ? <i>{cart[p.id]}</i> : null}</button>)}</div>
              {cartTotal > 0 && <div className="pay-box" style={{ marginTop: 12 }}><b>{cartTotal} ₪</b><span>{Object.entries(cart).filter(([, q]) => q).map(([id, q]) => `${active.find((p) => p.id === id)?.name} × ${q}`).join(', ')}</span><div className="row-actions" style={{ margin: 0 }}><Button kind="primary" onClick={commit}><Icon name="check" />רישום לחשבון</Button><Button kind="quiet" className="sm" onClick={() => setCart({})}>ניקוי</Button></div></div>}
              {tab.items.length > 0 && <div className="section"><div className="section-head"><h2>בחשבון</h2></div><div className="list">{[...tab.items].reverse().map((i, n) => { const idx = tab.items.length - 1 - n; return <div className="row" key={idx}><div className="row-main"><div className="row-title">{i.name}{i.qty > 1 ? ` × ${i.qty}` : ''}</div><div className="row-meta"><span>{fmtTime(i.at)} · {firstName(i.by.name)}</span></div></div><b>{i.price * i.qty} ₪</b><button type="button" className="icon-btn ghost" aria-label="הסרה" onClick={() => removeTabItem(ctx.actor, tab, idx)}><Icon name="x" size={18} /></button></div>; })}</div></div>}
            </>
          )}
          {!tab && openTabs.length > 0 && <div className="section"><div className="section-head"><h2>חשבונות פתוחים</h2></div><div className="list">{openTabs.map((t) => <button type="button" className="row" key={t.id} onClick={() => setCurrent(t.id)}><div className="row-main"><div className="row-title">{t.guestName}</div><div className="row-meta"><span>{t.items.length} פריטים</span><span>{relTime(t.updatedAt)}</span></div></div><b>{t.total} ₪</b></button>)}</div></div>}
        </>
      )}
      <Sheet open={scanning} onClose={() => setScanning(false)} title="סריקת כרטיס"><Camera active={scanning} onCode={onCode} /></Sheet>
      <Sheet open={picking} onClose={() => setPicking(false)} title="מי קונה?">
        <label className="field"><span>חיפוש לפי שם או טלפון</span><input data-autofocus value={lookup.q} onChange={(e) => lookup.setQ(e.target.value)} /></label>
        {lookup.matches.length > 0 && <div className="list" style={{ marginBottom: 16 }}>{lookup.matches.map((t) => <button type="button" className="row" key={t.id} onClick={() => startFor({ uid: t.ownerUid, name: t.holderName || t.ownerName, phone: t.ownerPhone, ticketId: t.id })}><div className="row-main"><div className="row-title">{t.holderName || t.ownerName}</div><div className="row-meta"><span dir="ltr">{t.ownerPhone}</span></div></div></button>)}</div>}
        <div className="section-head"><h2>לקוח מזדמן (בלי כרטיס)</h2></div>
        <label className="field"><span>שם</span><input value={walkin.name} onChange={(e) => setWalkin({ ...walkin, name: e.target.value })} /></label>
        <label className="field"><span>טלפון</span><input value={walkin.phone} onChange={(e) => setWalkin({ ...walkin, phone: e.target.value })} dir="ltr" inputMode="tel" /></label>
        <Button kind="secondary" disabled={!walkin.name.trim()} onClick={() => startFor({ uid: '', name: walkin.name.trim(), phone: walkin.phone.trim(), ticketId: '' })}>פתיחת חשבון</Button>
      </Sheet>
    </>
  );
}

export function TabStatusChip({ tab }: { tab: Tab }) { return <span className={'tag ' + (tab.status === 'paid' ? 'ok' : tab.status === 'open' ? 'warn' : '')}>{TAB_LABELS[tab.status]}</span>; }
export { setTabStatus };
export type { Product };
