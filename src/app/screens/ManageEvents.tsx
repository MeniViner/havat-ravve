// Manager: events list, editor, event hub and its sub-pages (guests, live entry, vendors, products, tabs, report, files, history).
import { useMemo, useState, type ReactNode } from 'react';
import type { FarmEvent, Ticket, Vendor, Product, Tab, EventFile, PaymentStatus } from '../types';
import { PAYMENT_LABELS, TAB_LABELS, KIND_LABELS } from '../types';
import type { TeamCtx } from '../ctx';
import { Top, Ledger, Sec, Row, Pill, Btn, A, Icon, Empty, Field, Input, Textarea, Chips, Chip, SwitchRow, Avatar, Loading, useToast, fmtTime, fmtDate, fmtDateShort, fmtWeekday, fmtDayLong, fmtRange, firstName, relTime, whenText, todayISO, money, useDesktop, useSort, Th } from '../ui';
import { navigate } from '../router';
import { useAllEvents, useEvent, saveEvent, deleteEvent, type EventInput, useEventTickets, setOrderPayment, cancelOrder, useVendors, useVendor, saveVendor, deleteVendor, useEventVendors, setEventVendor, removeEventVendor, useProducts, saveProduct, deleteProduct, copyProducts, useEventTabs, useTab, setTabStatus, removeTabItem, useDonations, downloadCsv, fillTemplate, waLink, telLink, upsertCalendarRef, deleteCalendarRef } from '../data';
import { useActivityForEvent, ACTION_LABELS } from '../activity';
import { PhotoPicker } from './Tasks';
import { nowIso } from '../firebase';

const toLocal = (iso: string) => { if (!iso) return ''; const d = new Date(iso); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
const fromLocal = (s: string) => (s ? new Date(s).toISOString() : '');
const isPaid = (s: PaymentStatus) => s === 'paid' || s === 'paid_onsite' || s === 'free';
const byOrder = (tickets: Ticket[]) => { const m = new Map<string, Ticket[]>(); for (const t of tickets) m.set(t.orderId, [...(m.get(t.orderId) || []), t]); return [...m.values()].map((o) => o.sort((a, b) => a.index - b.index)); };

// ---------- list ----------
export function EventsListScreen({ ctx }: { ctx: TeamCtx }) {
  const { items, loading } = useAllEvents(true);
  const desktop = useDesktop();
  const now = new Date().toISOString();
  const upcoming = items.filter((e) => e.end >= now).sort((a, b) => a.start.localeCompare(b.start));
  const past = items.filter((e) => e.end < now).sort((a, b) => b.start.localeCompare(a.start));
  const drafts = upcoming.filter((e) => !e.published).length;
  return (
    <>
      <Top backTo={desktop ? undefined : '/manage'} backLabel="ניהול" title="אירועים" sub={`${upcoming.length - drafts} קרובים · ${drafts} טיוטה · ${past.length} עברו${desktop ? '. לחיצה על אירוע פותחת את מרכז האירוע.' : ''}`} end={<>{desktop && <Btn kind="ghost" size="sm" icon="store" to="/manage/vendors">בעלי דוכנים</Btn>}<Btn size="sm" icon="plus" to="/manage/events/new">אירוע</Btn></>} />
      {loading && !items.length && <Loading />}
      {!desktop && <Sec title="קרובים" n={upcoming.length} />}
      {!upcoming.length && !loading && <Empty title="אין אירוע קרוב" text="אירוע חדש יוצרים בכפתור למעלה. טיוטה לא מוצגת לאורחים." />}
      <div className={desktop ? 'evgrid' : 'list'}>{upcoming.map((e) => <EventCard key={e.id} e={e} desktop={desktop} />)}</div>
      <Sec title="עברו" n={past.length} link={desktop ? undefined : 'דוחות'} linkTo="/manage/reports" />
      {desktop ? <div className="tablewrap"><table><thead><tr><th>תאריך</th><th>אירוע</th><th>כרטיסים</th><th>מחיר</th><th></th></tr></thead><tbody>{past.map((e) => <tr key={e.id} className="link" onClick={() => navigate(`/manage/events/${e.id}`)}><td className="muted">{fmtDate(e.start)}</td><td style={{ fontWeight: 600 }}>{e.title}</td><td><PastCount e={e} /></td><td className="muted">{e.price ? money(e.price) : 'חינם'}</td><td style={{ textAlign: 'end' }}><Btn size="xs" kind="ghost" to={`/manage/events/${e.id}/report`}>דוח</Btn></td></tr>)}</tbody></table></div>
        : <div className="list">{past.map((e) => <Row key={e.id} to={`/manage/events/${e.id}`} center title={e.title} meta={<><span>{fmtDate(e.start)}</span><PastCount e={e} /></>} chev />)}</div>}
    </>
  );
}
function PastCount({ e }: { e: FarmEvent }) { const t = useEventTickets(e.id, true); const valid = t.items.filter((x) => x.status === 'valid'); return <span>{valid.filter((x) => x.entries > 0).length} הגיעו מתוך {valid.length}</span>; }
function EventCard({ e, desktop }: { e: FarmEvent; desktop: boolean }) {
  const t = useEventTickets(e.id, true);
  const valid = t.items.filter((x) => x.status === 'valid');
  const orders = byOrder(valid).length;
  const unpaid = valid.filter((x) => !isPaid(x.paymentStatus)).length;
  const to = `/manage/events/${e.id}`;
  if (desktop) return (
    <A to={e.published ? to : `${to}/edit`} style={{ display: 'block', borderRadius: 12, overflow: 'hidden', background: e.published ? 'var(--white)' : 'transparent', border: e.published ? '1px solid var(--line)' : '1.5px dashed var(--line)' }}>
      {e.image ? <img src={e.image} alt="" style={{ width: '100%', height: 140, objectFit: 'cover' }} /> : <div style={{ height: 140, background: e.published ? 'var(--line2)' : 'transparent', display: 'grid', placeItems: 'center', textAlign: 'center', lineHeight: 1 }}><div><b className="serif" style={{ fontSize: 44, fontWeight: 500, color: e.published ? 'var(--green)' : 'var(--muted)' }}>{new Date(e.start).getDate()}</b><div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{fmtDateShort(e.start).replace(/^\d+\s*/, '')} · {fmtWeekday(e.start)}</div></div></div>}
      <div style={{ padding: '14px 18px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold-ink)' }}>{fmtRange(e.start, e.end)} · {e.price ? money(e.price) : 'חינם'}</span>{e.published ? <Pill tone="ok">מפורסם</Pill> : <Pill>טיוטה</Pill>}</div>
        <div className="serif" style={{ fontSize: 26, fontWeight: 500, lineHeight: 1.1, marginTop: 4, color: e.published ? 'var(--green)' : 'var(--muted)' }}>{e.title}</div>
        {e.published ? <Ledger small items={[{ n: valid.length, label: e.price ? 'כרטיסים' : 'נרשמו' }, { n: orders, label: 'הזמנות' }, e.price ? { n: unpaid, label: 'לא שולמו', tone: unpaid ? 'ochre' : undefined } : { n: e.capacity || '—', label: 'מקומות' }]} /> : <p className="muted" style={{ fontSize: 14, marginTop: 12 }}>לא מוצג לאורחים. {[!e.description && 'תיאור', !e.image && 'תמונה'].filter(Boolean).length ? `חסרים: ${[!e.description && 'תיאור', !e.image && 'תמונה'].filter(Boolean).join(', ')}.` : ''}</p>}
      </div>
    </A>
  );
  return <A to={to} className="evcard"><div className="date"><div className="d">{new Date(e.start).getDate()}</div><div className="m">{fmtDateShort(e.start).replace(/^\d+\s*/, '')}</div></div><div style={{ flex: 1, minWidth: 0 }}><div className="t">{e.title}</div><div className="muted" style={{ fontSize: 14, marginTop: 4 }}>{fmtWeekday(e.start)} {fmtDate(e.start)} · {fmtTime(e.start)}{e.price ? '' : ' · חינם'} {e.published ? <Pill tone="ok">מפורסם</Pill> : <Pill>טיוטה · לא מוצג לאורחים</Pill>}</div>{e.published && <div className="muted" style={{ fontSize: 14, marginTop: 2 }}>{valid.length} {e.price ? 'כרטיסים' : 'נרשמו'} · {orders} הזמנות{unpaid ? ` · ${unpaid} לא שולמו` : ''}</div>}</div><Icon name="chev" className="chev" size={18} /></A>;
}

// ---------- editor ----------
export function EventEditor({ id, ctx }: { id?: string; ctx: TeamCtx }) {
  const { item: existing, loading } = useEvent(id || '', !!id);
  if (id && loading) return <Loading />;
  if (id && !existing) return <Empty title="האירוע לא נמצא" />;
  return <EventForm ctx={ctx} existing={existing || undefined} />;
}
function EventForm({ ctx, existing }: { ctx: TeamCtx; existing?: FarmEvent }) {
  const toast = useToast();
  const [f, setF] = useState<EventInput>(() => existing ? { title: existing.title, description: existing.description, image: existing.image, location: existing.location, start: existing.start, end: existing.end, price: existing.price, maxPerOrder: existing.maxPerOrder, capacity: existing.capacity, open: existing.open, published: existing.published, questions: existing.questions, files: existing.files || [] }
    : { title: '', description: '', image: '', location: 'חוות רווה, ליד טנא עומרים', start: '', end: '', price: 0, maxPerOrder: 5, capacity: 0, open: true, published: false, questions: [], files: [] });
  const [busy, setBusy] = useState(false); const [confirmDel, setConfirmDel] = useState(false);
  const set = (p: Partial<EventInput>) => setF((s) => ({ ...s, ...p }));
  const ok = f.title.trim() && f.start && f.end && f.end > f.start;
  const save = async () => {
    setBusy(true);
    try { const id = await saveEvent(ctx.actor, f, existing); if (f.published) await upsertCalendarRef(ctx.actor, 'event', id, { title: f.title, date: f.start.slice(0, 10), time: `${fmtTime(f.start)}–${fmtTime(f.end)}` }); else await deleteCalendarRef('event', id); navigate(`/manage/events/${id}`, true); }
    catch { toast({ text: 'לא נשמר', kind: 'error' }); } finally { setBusy(false); }
  };
  const del = async () => { if (!existing) return; await deleteEvent(ctx.actor, existing); await deleteCalendarRef('event', existing.id); navigate('/manage/events', true); toast({ text: 'האירוע נמחק. הכרטיסים נשמרו.' }); };
  const q = f.questions;
  return (
    <>
      <Top back title={existing ? 'עריכת אירוע' : 'אירוע חדש'} end={<Btn kind="quiet" size="sm" onClick={() => navigate(existing ? `/manage/events/${existing.id}` : '/manage/events', true)}>ביטול</Btn>} />
      <Field label="שם האירוע"><Input big value={f.title} onChange={(e) => set({ title: e.target.value })} /></Field>
      <PhotoPicker value={f.image} onChange={(image) => set({ image })} label="תמונה לדף האירוע" />
      <div className="cols">
        <Field label="מתחיל"><Input type="datetime-local" dir="ltr" value={toLocal(f.start)} onChange={(e) => { const start = fromLocal(e.target.value); set({ start, end: f.end && f.end > start ? f.end : start ? new Date(new Date(start).getTime() + 3 * 3600_000).toISOString() : '' }); }} /></Field>
        <Field label="מסתיים"><Input type="datetime-local" dir="ltr" value={toLocal(f.end)} onChange={(e) => set({ end: fromLocal(e.target.value) })} /></Field>
      </div>
      <Field label="מקום"><Input value={f.location} onChange={(e) => set({ location: e.target.value })} /></Field>
      <div className="cols">
        <Field label="מחיר לכרטיס (0 = חינם)"><Input type="number" dir="ltr" inputMode="numeric" min={0} value={f.price} onChange={(e) => set({ price: Math.max(0, Number(e.target.value) || 0) })} /></Field>
        <Field label="מקסימום בהזמנה"><Input type="number" dir="ltr" inputMode="numeric" min={1} value={f.maxPerOrder} onChange={(e) => set({ maxPerOrder: Math.max(1, Number(e.target.value) || 1) })} /></Field>
        <Field label="מקומות (0 = בלי הגבלה)"><Input type="number" dir="ltr" inputMode="numeric" min={0} value={f.capacity} onChange={(e) => set({ capacity: Math.max(0, Number(e.target.value) || 0) })} /></Field>
      </div>
      <Field label="תיאור לאורחים"><Textarea rows={4} value={f.description} onChange={(e) => set({ description: e.target.value })} placeholder="מה יהיה, למי זה מתאים, מה להביא" /></Field>
      <Sec title="שאלות נוספות בהרשמה" n={q.length || 'לא חובה'} link="+ שאלה" onLink={() => set({ questions: [...q, { id: 'q' + Date.now().toString(36), label: '', required: false }] })} />
      {q.map((x, i) => <div key={x.id} className="field" style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}><Input placeholder="שאלה" value={x.label} onChange={(e) => set({ questions: q.map((y) => y.id === x.id ? { ...y, label: e.target.value } : y) })} /><Chip on={x.required} onClick={() => set({ questions: q.map((y) => y.id === x.id ? { ...y, required: !y.required } : y) })}>חובה</Chip><button type="button" className="iconbtn" aria-label="הסרה" onClick={() => set({ questions: q.filter((y) => y.id !== x.id) })}><Icon name="x" size={18} /></button>{i < 0 && null}</div>)}
      <div style={{ marginTop: 18 }}>
        <SwitchRow on={f.open} onChange={(open) => set({ open })} title="פתוח להרשמה" meta="אורחים יכולים להזמין כרטיסים" />
        <SwitchRow on={f.published} onChange={(published) => set({ published })} title="מפורסם" meta="מופיע לאורחים באפליקציה ונכנס ליומן המנהלים" />
      </div>
      <div className="actions sticky"><Btn size="big" disabled={!ok || busy} onClick={save}>שמירה</Btn>{existing && (confirmDel ? <Btn kind="rustfill" onClick={del}>לאשר מחיקה של "{existing.title}"</Btn> : <Btn kind="danger" size="sm" onClick={() => setConfirmDel(true)}>מחיקת האירוע (הכרטיסים נשמרים)</Btn>)}</div>
    </>
  );
}

// ---------- hub + frame ----------
type EventTab = 'hub' | 'guests' | 'entry' | 'vendors' | 'products' | 'tabs' | 'report' | 'files' | 'activity';
const TABS: { key: EventTab; label: string; icon: string }[] = [{ key: 'guests', label: 'נרשמים', icon: 'people' }, { key: 'entry', label: 'כניסה חיה', icon: 'qr' }, { key: 'vendors', label: 'בעלי דוכנים', icon: 'store' }, { key: 'products', label: 'מוצרי הדוכן', icon: 'list' }, { key: 'tabs', label: 'חשבונות וחובות', icon: 'ticket' }, { key: 'report', label: 'דוח האירוע', icon: 'chart' }, { key: 'files', label: 'קבצים', icon: 'file' }, { key: 'activity', label: 'היסטוריה', icon: 'history' }];
function useEventData(id: string) {
  const { item: e, loading } = useEvent(id);
  const tickets = useEventTickets(id, true); const tabs = useEventTabs(id, true); const vendors = useEventVendors(id, true); const products = useProducts(id, true); const acts = useActivityForEvent(id, true);
  const valid = tickets.items.filter((t) => t.status === 'valid');
  const orders = byOrder(valid);
  return { e, loading, tickets: tickets.items, valid, orders, tabs: tabs.items, vendors: vendors.items, products: products.items, acts: acts.items, paid: valid.filter((t) => isPaid(t.paymentStatus)), unpaid: valid.filter((t) => !isPaid(t.paymentStatus)), arrived: valid.filter((t) => t.entries > 0) };
}
export function EventFrame({ id, tab, ctx, children, title, end }: { id: string; tab: EventTab; ctx: TeamCtx; children: ReactNode; title?: ReactNode; end?: ReactNode }) {
  const d = useEventData(id);
  const desktop = useDesktop();
  if (d.loading && !d.e) return <Loading />;
  if (!d.e) return <><Top backTo="/manage/events" title="האירוע לא נמצא" /><Empty title="אולי נמחק" action={<Btn kind="ghost" to="/manage/events">לאירועים</Btn>} /></>;
  const e = d.e;
  const counts: Partial<Record<EventTab, number>> = { guests: d.orders.length, vendors: d.vendors.length, products: d.products.length, files: e.files?.length, activity: d.acts.length };
  const live = e.start.slice(0, 10) <= todayISO() && e.end.slice(0, 10) >= todayISO();
  const head = <Top backTo={desktop ? '/manage/events' : tab === 'hub' ? '/manage/events' : `/manage/events/${id}`} backLabel={desktop || tab === 'hub' ? 'כל האירועים' : e.title} title={title || e.title} sub={tab === 'hub' || desktop ? `${fmtWeekday(e.start)} ${fmtDate(e.start)} · ${fmtRange(e.start, e.end)} · ${e.price ? `${money(e.price)} לכרטיס · עד ${e.maxPerOrder} בהזמנה` : 'חינם'}${live ? ' · מתעדכן בזמן אמת' : e.end < new Date().toISOString() ? ' · הסתיים' : ''}` : undefined} end={end ?? (tab === 'hub' || desktop ? <Btn kind="ghost" size="sm" icon="edit" to={`/manage/events/${id}/edit`}>עריכת האירוע</Btn> : undefined)} />;
  if (!desktop) return <>{head}{children}</>;
  return (
    <>{head}
      <div className="withsub" style={{ padding: '0 20px' }}>
        <nav className="subnav">
          <A to={`/manage/events/${id}`} className={tab === 'hub' ? 'on' : ''}><Icon name="home" size={18} />מרכז האירוע</A>
          {TABS.map((t) => <A key={t.key} to={`/manage/events/${id}/${t.key}`} className={tab === t.key ? 'on' : ''}><Icon name={t.icon} size={18} />{t.label}{counts[t.key] ? <span className="n">{counts[t.key]}</span> : null}</A>)}
        </nav>
        <div className="body">{children}</div>
      </div>
    </>
  );
}
export function EventHubScreen({ id, ctx }: { id: string; ctx: TeamCtx }) {
  const d = useEventData(id);
  const toast = useToast();
  if (!d.e) return <EventFrame id={id} tab="hub" ctx={ctx}>{null}</EventFrame>;
  const e = d.e;
  const unpaidSum = d.unpaid.reduce((s, t) => s + t.price, 0);
  const confirmed = d.vendors.filter((v) => v.confirmed).length;
  const openTabs = d.tabs.filter((t) => t.status === 'open' || t.status === 'claimed');
  const subs: Record<EventTab, string> = {
    hub: '', guests: `${d.valid.length} כרטיסים · ${d.orders.length} הזמנות${e.price ? ` · ${d.unpaid.length} ממתינים לתשלום` : ''}`,
    entry: d.arrived.length ? `${d.arrived.length} נכנסו מתוך ${d.valid.length}` : 'מתחיל ביום האירוע · הצוות סורק מהטלפון',
    vendors: d.vendors.length ? `${d.vendors.length} הוזמנו · ${confirmed} אישרו הגעה${d.vendors.length - confirmed ? ` · ${d.vendors.length - confirmed} עוד לא ענו` : ''}` : 'עוד לא הוזמנו',
    products: d.products.length ? `${d.products.filter((p) => p.active).length} מוצרים${d.products.some((p) => !p.active) ? ` · ${d.products.filter((p) => !p.active).length} מוסתר` : ''}` : 'אין מוצרים · אפשר להעתיק מאירוע קודם',
    tabs: d.tabs.length ? `${d.tabs.length} חשבונות · ${money(d.tabs.reduce((s, t) => s + t.total, 0))} נמכרו${openTabs.length ? ` · ${openTabs.length} פתוחים` : ''}` : 'נפתחים ביום האירוע',
    report: 'נרשמו · הגיעו · הכנסות · מה נמכר', files: e.files?.length ? `${e.files.length} קבצים` : 'אישורים, מפת הצבה, רשימות',
    activity: d.acts.length ? `${d.acts.length} פעולות · אחרונה: ${d.acts[0].text.slice(0, 40)} · ${relTime(d.acts[0].at)}` : 'אין עדיין',
  };
  const share = () => { const url = `${location.origin}/app/events/${id}`; navigator.share?.({ title: e.title, url }).catch(() => {}) || navigator.clipboard?.writeText(url).then(() => toast({ text: 'הקישור הועתק' }, 2500)); };
  const remind = () => { const t = fillTemplate(ctx.settings.templates.ticketReminder, { 'שם': '', 'אירוע': e.title, 'תאריך': fmtDayLong(e.start), 'שעה': fmtTime(e.start) }); navigator.clipboard?.writeText(t).then(() => toast({ text: 'נוסח התזכורת הועתק. שולחים לכל נרשם מהרשימה.' }, 4000)); };
  return (
    <EventFrame id={id} tab="hub" ctx={ctx}>
      <div className="inline pad">{e.published ? <Pill tone="ok">מפורסם</Pill> : <Pill>טיוטה · לא מוצג לאורחים</Pill>}{e.open ? <Pill tone="gold">פתוח להרשמה</Pill> : <Pill>ההרשמה סגורה</Pill>}</div>
      <Ledger items={[{ n: d.valid.length, label: e.price ? 'כרטיסים' : 'נרשמו' }, { n: d.orders.length, label: 'הזמנות' }, ...(e.price ? [{ n: d.paid.length, label: 'שולמו' }, { n: money(unpaidSum), label: 'לא שולם', tone: unpaidSum ? 'ochre' as const : undefined }] : [{ n: d.arrived.length, label: 'הגיעו' }])]} small />
      <div className="list" style={{ marginTop: 14 }}>{TABS.map((t) => <Row key={t.key} to={`/manage/events/${id}/${t.key}`} center start={<span className="iconbtn" style={{ color: 'var(--green2)', width: 36 }}><Icon name={t.icon} /></span>} title={t.label} meta={<span>{subs[t.key]}</span>} chev />)}</div>
      <div className="actions row2"><Btn kind="ghost" icon="share" onClick={share}>שיתוף הקישור</Btn><Btn kind="ghost" icon="whatsapp" onClick={remind}>תזכורת לנרשמים</Btn></div>
    </EventFrame>
  );
}

// ---------- guests ----------
type GuestFilter = 'all' | 'unpaid' | 'claimed' | 'arrived' | 'cancelled';
export function EventGuestsScreen({ id, ctx }: { id: string; ctx: TeamCtx }) {
  const d = useEventData(id);
  const [q, setQ] = useState(''); const [filter, setFilter] = useState<GuestFilter>('all');
  const desktop = useDesktop(); const toast = useToast();
  const { sort, toggle, apply } = useSort<Ticket[]>('createdAt', 'desc');
  const all = byOrder(d.tickets);
  const list = useMemo(() => { const s = q.trim().toLowerCase(); return all.filter((o) => { const t = o[0]; const valid = o.filter((x) => x.status === 'valid'); if (filter === 'unpaid') return valid.length && t.paymentStatus === 'pending'; if (filter === 'claimed') return t.paymentStatus === 'claimed'; if (filter === 'arrived') return o.some((x) => x.entries > 0); if (filter === 'cancelled') return !valid.length; return valid.length > 0; }).filter((o) => !s || o.some((t) => t.ownerName.toLowerCase().includes(s) || t.holderName.toLowerCase().includes(s) || t.ownerPhone.includes(s))); }, [all, q, filter]);
  const sorted = desktop ? apply(list, (o, k) => k === 'name' ? o[0].ownerName : k === 'count' ? o.length : k === 'payment' ? o[0].paymentStatus : o[0].createdAt) : list;
  if (!d.e) return <EventFrame id={id} tab="guests" ctx={ctx}>{null}</EventFrame>;
  const e = d.e;
  const csv = () => downloadCsv(`${e.title} - נרשמים.csv`, ['שם', 'טלפון', 'כרטיסים', 'תשלום', 'הוזמן', 'נכנסו', 'תשובות'], all.map((o) => [o[0].ownerName, o[0].ownerPhone, o.filter((x) => x.status === 'valid').length, PAYMENT_LABELS[o[0].paymentStatus], fmtDate(o[0].createdAt), o.reduce((s, x) => s + (x.entries > 0 ? 1 : 0), 0), Object.values(o[0].answers || {}).join(' / ')]));
  const remind = (o: Ticket[]) => waLink(o[0].ownerPhone, fillTemplate(ctx.settings.templates.debtReminder, { 'שם': firstName(o[0].ownerName), 'אירוע': e.title, 'סכום': o[0].price * o.filter((x) => x.status === 'valid').length }));
  const pay = (o: Ticket[], status: PaymentStatus) => setOrderPayment(ctx.actor, o.filter((x) => x.status === 'valid'), status).then(() => toast({ text: `${o[0].ownerName} · ${PAYMENT_LABELS[status]}`, action: { label: 'ביטול', onClick: () => setOrderPayment(ctx.actor, o, o[0].paymentStatus) } }, 5000));
  const cancel = (o: Ticket[]) => { const reason = prompt('סיבת הביטול (תירשם בהיסטוריה):') ?? null; if (reason === null) return; cancelOrder(ctx.actor, o.filter((x) => x.status === 'valid'), reason).then(() => toast({ text: 'ההזמנה בוטלה' })); };
  const chips = <Chips scroll={!desktop} value={filter} onChange={setFilter} options={[{ value: 'all', label: 'הכל', n: all.filter((o) => o.some((x) => x.status === 'valid')).length }, ...(e.price ? [{ value: 'unpaid' as GuestFilter, label: 'לא שולם', n: all.filter((o) => o[0].paymentStatus === 'pending' && o.some((x) => x.status === 'valid')).length }, { value: 'claimed' as GuestFilter, label: 'סימנו "העברתי"', n: all.filter((o) => o[0].paymentStatus === 'claimed').length }] : []), { value: 'arrived', label: 'הגיעו', n: all.filter((o) => o.some((x) => x.entries > 0)).length || undefined }, { value: 'cancelled', label: 'בוטלו', n: all.filter((o) => !o.some((x) => x.status === 'valid')).length || undefined }]} />;
  const payPill = (t: Ticket, n: number) => t.status === 'cancelled' ? <Pill tone="rust">בוטל</Pill> : <Pill tone={isPaid(t.paymentStatus) ? 'ok' : 'ochre'}>{PAYMENT_LABELS[t.paymentStatus]}{t.paymentStatus === 'pending' || t.paymentStatus === 'claimed' ? ` · ${money(t.price * n)}` : ''}</Pill>;
  const actions = (o: Ticket[]) => { const t = o[0]; const valid = o.filter((x) => x.status === 'valid'); if (!valid.length) return null; return <>{t.paymentStatus === 'claimed' && <Btn size="xs" onClick={() => pay(o, 'paid')}>אישור תשלום</Btn>}{t.paymentStatus === 'pending' && <><a className="btn ghost xs" href={remind(o)} target="_blank" rel="noopener"><Icon name="whatsapp" size={14} />תזכורת</a><Btn size="xs" kind="ghost" onClick={() => pay(o, 'paid')}>סימון שולם</Btn></>}<a className="btn quiet xs" href={telLink(t.ownerPhone)}><Icon name="phone" size={14} /></a><Btn size="xs" kind="quiet" onClick={() => cancel(o)}>ביטול</Btn></>; };
  return (
    <EventFrame id={id} tab="guests" ctx={ctx} title={desktop ? e.title : 'נרשמים'} end={<Btn kind="ghost" size="sm" icon="download" onClick={csv}>אקסל</Btn>}>
      {!desktop && <p className="lead">{d.valid.length} כרטיסים · {d.orders.length} הזמנות{e.price ? ` · ${d.unpaid.length} ממתינים לתשלום` : ''}</p>}
      <div className="inline pad" style={{ paddingTop: 10 }}><Input placeholder="חיפוש נרשמים" value={q} onChange={(ev) => setQ(ev.target.value)} style={{ minHeight: 44, flex: 1, minWidth: 180 }} />{desktop && chips}</div>
      {!desktop && <div style={{ paddingTop: 10 }}>{chips}</div>}
      {!sorted.length && <Empty title="אין נרשמים כאלה" />}
      {desktop ? <div className="tablewrap"><table><thead><tr><Th k="name" sort={sort} onSort={toggle}>שם</Th><th>טלפון</th><Th k="count" sort={sort} onSort={toggle}>כרטיסים</Th><Th k="payment" sort={sort} onSort={toggle}>תשלום</Th><Th k="createdAt" sort={sort} onSort={toggle}>הוזמן</Th><th>הגיעו</th><th>תשובות</th><th></th></tr></thead>
        <tbody>{sorted.map((o) => { const t = o[0]; const valid = o.filter((x) => x.status === 'valid'); return <tr key={t.orderId}><td style={{ fontWeight: 600 }}><A to={`/manage/people/${t.ownerUid}`}>{t.ownerName}</A>{valid.some((x) => x.holderName) && <div className="muted" style={{ fontSize: 13 }}>{valid.filter((x) => x.holderName).map((x) => `כרטיס ${x.index}: ${x.holderName}`).join(' · ')}</div>}</td><td className="ltr">{t.ownerPhone}</td><td>{valid.length}</td><td>{payPill(t, valid.length)}</td><td className="muted">{fmtDate(t.createdAt)}</td><td>{valid.filter((x) => x.entries > 0).length || <span className="muted">—</span>}</td><td className="muted" style={{ fontSize: 13 }}>{Object.values(t.answers || {}).join(' / ') || '—'}</td><td><div className="acts">{actions(o)}</div></td></tr>; })}</tbody></table></div>
        : <div className="list">{sorted.map((o) => { const t = o[0]; const valid = o.filter((x) => x.status === 'valid'); return <div key={t.orderId} className="row"><Avatar name={t.ownerName} /><div className="main"><A to={`/manage/people/${t.ownerUid}`} className="title">{t.ownerName} · {valid.length || o.length} {(valid.length || o.length) === 1 ? 'כרטיס' : 'כרטיסים'}</A><div className="meta"><span className="ltr">{t.ownerPhone}</span>{payPill(t, valid.length)}<span>{relTime(t.createdAt)}</span></div>{valid.some((x) => x.holderName) && <div className="meta">{valid.filter((x) => x.holderName).map((x) => `כרטיס ${x.index}: ${x.holderName}`).join(' · ')}</div>}{Object.entries(t.answers || {}).map(([k, v]) => <div key={k} className="meta">{e.questions.find((qq) => qq.id === k)?.label || k}: "{v}"</div>)}<div className="inline" style={{ marginTop: 8 }}>{actions(o)}</div></div></div>; })}</div>}
    </EventFrame>
  );
}

// ---------- live entry ----------
export function EventEntryScreen({ id, ctx }: { id: string; ctx: TeamCtx }) {
  const d = useEventData(id);
  const desktop = useDesktop();
  if (!d.e) return <EventFrame id={id} tab="entry" ctx={ctx}>{null}</EventFrame>;
  const scans = d.valid.flatMap((t) => t.scans.map((s, i) => ({ t, s, n: i + 1 }))).sort((a, b) => b.s.at.localeCompare(a.s.at));
  const notYet = d.orders.filter((o) => o.every((t) => t.entries === 0));
  const scanners = new Set(scans.map((x) => x.s.by.uid)).size;
  const byHour = useMemo(() => { const m = new Map<string, number>(); for (const x of scans) { const h = fmtTime(x.s.at).slice(0, 2) + ':' + (Number(fmtTime(x.s.at).slice(3, 4)) < 3 ? '00' : '30'); m.set(h, (m.get(h) || 0) + 1); } return [...m.entries()].sort(); }, [scans]);
  const max = Math.max(1, ...byHour.map(([, n]) => n));
  return (
    <EventFrame id={id} tab="entry" ctx={ctx} title={desktop ? d.e.title : 'כניסה חיה'} end={<Btn size="sm" icon="qr" to={`/scan/${id}`}>לסרוק מהטלפון</Btn>}>
      <Ledger items={[{ n: `${d.arrived.length}`, label: `מתוך ${d.valid.length} נכנסו${d.valid.length ? ` · ${Math.round((d.arrived.length / d.valid.length) * 100)}%` : ''}` }, { n: scans.length, label: 'סריקות' }, { n: d.valid.filter((t) => t.entries > 1).length, label: 'יצאו וחזרו' }, { n: d.valid.filter((t) => t.paymentStatus === 'paid_onsite').length, label: 'שילמו במקום' }, ...(desktop ? [{ n: scanners, label: 'סורקים' }] : [])]} small />
      <div className={desktop ? 'cols' : ''}>
        <div>
          <Sec title="סריקות אחרונות" n={scans.length || undefined} />
          {desktop ? <div className="tablewrap"><table><thead><tr><th>שעה</th><th>מי</th><th>כרטיס</th><th>כניסה</th><th>סרק/ה</th><th>תשלום</th></tr></thead><tbody>{scans.slice(0, 30).map(({ t, s, n }) => <tr key={t.id + s.at}><td className="muted">{fmtTime(s.at)}</td><td style={{ fontWeight: 600 }}>{t.holderName || t.ownerName}</td><td>{t.index}/{t.total}</td><td>{n}{n > 1 ? ' · יצא וחזר' : ''}</td><td>{firstName(s.by.name)}</td><td><Pill tone={isPaid(t.paymentStatus) ? 'ok' : 'ochre'}>{PAYMENT_LABELS[t.paymentStatus]}</Pill></td></tr>)}</tbody></table></div>
            : <div className="list">{scans.slice(0, 20).map(({ t, s, n }) => <Row key={t.id + s.at} center title={`${t.holderName || t.ownerName} · ${t.index}/${t.total}`} meta={<span>כניסה {n}{n > 1 ? ', יצא וחזר' : ''} · {fmtTime(s.at)} · {firstName(s.by.name)}{t.paymentStatus === 'paid_onsite' ? ' · שולם במקום' : ''}</span>} />)}{!scans.length && <p className="lead">עוד לא נסרק אף כרטיס. ביום האירוע הצוות סורק מהטלפון וכאן רואים בזמן אמת.</p>}</div>}
        </div>
        <div>
          {desktop && byHour.length > 0 && <><Sec title="לפי שעה" /><div className="bars">{byHour.map(([h, n]) => <div className="bar" key={h}><span className="ltr">{h}</span><i style={{ width: `${(n / max) * 100}%` }} /><b>{n}</b></div>)}</div></>}
          <Sec title="עוד לא הגיעו" n={notYet.length} link="הרשימה המלאה" linkTo={`/manage/events/${id}/guests`} />
          <div className="list">{notYet.slice(0, 8).map((o) => <Row key={o[0].orderId} center title={`${o[0].ownerName} · ${o.length} ${o.length === 1 ? 'כרטיס' : 'כרטיסים'}`} meta={<Pill tone={isPaid(o[0].paymentStatus) ? 'ok' : 'ochre'}>{PAYMENT_LABELS[o[0].paymentStatus]}</Pill>} />)}{notYet.length > 8 && <p className="lead">ועוד {notYet.length - 8} הזמנות</p>}</div>
        </div>
      </div>
    </EventFrame>
  );
}

// ---------- vendors ----------
export function EventVendorsScreen({ id, ctx }: { id: string; ctx: TeamCtx }) {
  const d = useEventData(id); const all = useVendors(true); const desktop = useDesktop(); const toast = useToast();
  if (!d.e) return <EventFrame id={id} tab="vendors" ctx={ctx}>{null}</EventFrame>;
  const e = d.e;
  const invited = d.vendors; const confirmed = invited.filter((v) => v.confirmed).length;
  const rest = all.items.filter((v) => !invited.some((x) => x.vendorId === v.id));
  const invite = (v: Vendor) => { const text = fillTemplate(ctx.settings.templates.vendorInvite || 'שלום [שם], נשמח שתגיעו עם דוכן ל־[אירוע] ב־[תאריך] בחוות רווה. מתאים?', { 'שם': v.name, 'אירוע': e.title, 'תאריך': `${fmtWeekday(e.start)} ${fmtDate(e.start)}` }); setEventVendor(id, v, false, `הוזמנו ${fmtDate(nowIso())}`).then(() => { if (v.phone) window.open(waLink(v.phone, text), '_blank'); }); };
  const vendorOf = (vid: string) => all.items.find((v) => v.id === vid);
  const row = (ev: typeof invited[number]) => { const v = vendorOf(ev.vendorId); return { v, confirm: () => setEventVendor(id, v || { id: ev.vendorId, name: ev.name } as Vendor, true, ev.notes), remove: () => removeEventVendor(id, ev.vendorId).then(() => toast({ text: `${ev.name} הוסר/ה מהאירוע` }, 2500)), again: () => v && invite(v) }; };
  return (
    <EventFrame id={id} tab="vendors" ctx={ctx} title={desktop ? e.title : 'בעלי דוכנים'} end={<><Btn kind="ghost" size="sm" to="/manage/vendors">כל הרשימה · {all.items.length}</Btn><Btn size="sm" icon="plus" to={`/manage/vendors/new?event=${id}`}>בעל דוכן</Btn></>}>
      {!desktop && <p className="lead">הרשימה נשמרת מאירוע לאירוע. מסמנים מי מוזמן ומי אישר.</p>}
      <Ledger small items={[{ n: invited.length, label: 'הוזמנו' }, { n: confirmed, label: 'אישרו' }, { n: invited.length - confirmed, label: 'לא ענו', tone: invited.length - confirmed ? 'ochre' : undefined }, ...(desktop ? [{ n: rest.length, label: 'לא הוזמנו' }] : [])]} />
      <Sec title="מוזמנים לאירוע הזה" n={invited.length} />
      {desktop ? <div className="tablewrap"><table><thead><tr><th>מוזמן</th><th>שם</th><th>מה מוכרים</th><th>טלפון</th><th>מצב</th><th></th></tr></thead><tbody>
        {invited.map((ev) => { const r = row(ev); return <tr key={ev.id}><td><Pill tone="ok">✓</Pill></td><td style={{ fontWeight: 600 }}><A to={`/manage/vendors/${ev.vendorId}`}>{ev.name}</A></td><td className="muted">{r.v?.product}</td><td className="ltr">{r.v?.phone}</td><td>{r.v && !r.v.external ? <Pill tone="gold">של החווה</Pill> : ev.confirmed ? <Pill tone="ok">אישרו הגעה</Pill> : <Pill tone="ochre">לא ענו{ev.notes ? ` · ${ev.notes}` : ''}</Pill>}</td><td><div className="acts">{r.v && !r.v.external ? <Btn size="xs" kind="ghost" to={`/manage/events/${id}/products`}>מוצרים</Btn> : ev.confirmed ? (r.v?.phone && <a className="btn ghost xs" href={waLink(r.v.phone)} target="_blank" rel="noopener">וואטסאפ</a>) : <><Btn size="xs" kind="ghost" onClick={r.again}>הזמנה שוב</Btn><Btn size="xs" onClick={r.confirm}>אישרו</Btn></>}<Btn size="xs" kind="quiet" onClick={r.remove}>הסרה</Btn></div></td></tr>; })}
        {rest.map((v) => <tr key={v.id} className="sub"><td></td><td style={{ fontWeight: 600 }}><A to={`/manage/vendors/${v.id}`}>{v.name}</A></td><td>{v.product}</td><td className="ltr">{v.phone}</td><td>לא מוזמנים</td><td><div className="acts"><Btn size="xs" kind="ghost" onClick={() => invite(v)}>להזמין</Btn></div></td></tr>)}
      </tbody></table></div>
        : <>
          <div className="list">{invited.map((ev) => { const r = row(ev); return <div key={ev.id} className="row"><div className="main"><A to={`/manage/vendors/${ev.vendorId}`} className="title">{ev.name}{r.v?.product && <span className="muted" style={{ fontWeight: 400 }}> · {r.v.product}</span>}</A><div className="meta">{r.v && !r.v.external ? <Pill tone="gold">של החווה</Pill> : ev.confirmed ? <Pill tone="ok">אישרו הגעה</Pill> : <Pill tone="ochre">עוד לא ענו</Pill>}{ev.notes && <span>{ev.notes}</span>}{r.v?.external && <span>חיצוני</span>}</div>{!ev.confirmed && r.v?.external && <div className="inline" style={{ marginTop: 8 }}><Btn size="sm" kind="ghost" icon="whatsapp" onClick={r.again}>הזמנה שוב</Btn><Btn size="sm" onClick={r.confirm}>אישרו</Btn></div>}{r.v && !r.v.external && <div className="inline" style={{ marginTop: 8 }}><Btn size="sm" kind="ghost" to={`/manage/events/${id}/products`}>{d.products.length} מוצרים</Btn></div>}</div><Btn size="xs" kind="quiet" onClick={r.remove}>הסרה</Btn></div>; })}{!invited.length && <p className="lead">עוד לא הוזמן אף אחד. בוחרים מהרשימה למטה.</p>}</div>
          <Sec title="עוד ברשימה, לא מוזמנים" n={rest.length} />
          <div className="list">{rest.map((v) => <Row key={v.id} center title={<>{v.name}<span className="muted" style={{ fontWeight: 400 }}> · {v.product}</span></>} meta={<span className="ltr">{v.phone}</span>} end={<Btn size="sm" kind="ghost" onClick={() => invite(v)}>להזמין</Btn>} />)}</div>
        </>}
      <p className="note">"הזמנה" פותחת וואטסאפ עם הנוסח מההגדרות. הכסף של דוכנים חיצוניים לא עובר דרך המערכת.</p>
    </EventFrame>
  );
}
export function VendorsScreen({ ctx }: { ctx: TeamCtx }) {
  const all = useVendors(true); const [q, setQ] = useState(''); const desktop = useDesktop();
  const list = all.items.filter((v) => !q || v.name.includes(q) || v.product.includes(q) || v.phone.includes(q));
  return (
    <>
      <Top backTo="/manage" backLabel="ניהול" title={<>בעלי דוכנים <span className="muted" style={{ fontWeight: 500 }}>· {all.items.length}</span></>} sub="הרשימה הקבועה, חוזרת מאירוע לאירוע. הכסף שלהם לא עובר דרך המערכת." end={<><Btn kind="ghost" size="sm" icon="download" onClick={() => downloadCsv('בעלי דוכנים.csv', ['שם', 'טלפון', 'מה מוכרים', 'חיצוני', 'הערות'], all.items.map((v) => [v.name, v.phone, v.product, v.external ? 'כן' : 'לא', v.notes]))}>אקסל</Btn><Btn size="sm" icon="plus" to="/manage/vendors/new">בעל דוכן</Btn></>} />
      <Field><Input placeholder="חיפוש" value={q} onChange={(e) => setQ(e.target.value)} /></Field>
      {desktop ? <div className="tablewrap"><table><thead><tr><th>שם</th><th>מה מוכרים</th><th>טלפון</th><th>הערות</th><th></th></tr></thead><tbody>{list.map((v) => <tr key={v.id} className="link" onClick={() => navigate(`/manage/vendors/${v.id}`)}><td style={{ fontWeight: 600 }}>{v.name}{!v.external && <> <Pill tone="gold">של החווה</Pill></>}</td><td>{v.product}</td><td className="ltr">{v.phone}</td><td className="muted">{v.notes}</td><td style={{ textAlign: 'end' }}>{v.phone && <a className="btn ghost xs" href={waLink(v.phone)} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()}>וואטסאפ</a>}</td></tr>)}</tbody></table></div>
        : <div className="list" style={{ marginTop: 10 }}>{list.map((v) => <Row key={v.id} to={`/manage/vendors/${v.id}`} center title={<>{v.name}<span className="muted" style={{ fontWeight: 400 }}> · {v.product}</span></>} meta={<>{v.phone && <span className="ltr">{v.phone}</span>}{!v.external && <Pill tone="gold">של החווה</Pill>}{v.notes && <span>{v.notes}</span>}</>} chev />)}{!list.length && <Empty title="אין בעלי דוכנים ברשימה" />}</div>}
    </>
  );
}
export function VendorEditor({ id, ctx }: { id?: string; ctx: TeamCtx }) {
  const { item: existing, loading } = useVendor(id || '', !!id);
  const eventId = new URLSearchParams(location.search).get('event') || '';
  const [f, setF] = useState({ name: '', phone: '', product: '', external: true, notes: '' });
  const [loaded, setLoaded] = useState(false);
  const toast = useToast(); const [confirmDel, setConfirmDel] = useState(false);
  if (existing && !loaded) { setF({ name: existing.name, phone: existing.phone, product: existing.product, external: existing.external, notes: existing.notes }); setLoaded(true); }
  if (id && loading) return <Loading />;
  const save = async () => { try { const vid = await saveVendor(f, existing || undefined); if (eventId) await setEventVendor(eventId, { ...f, id: vid, createdAt: '', updatedAt: '' }, false); navigate(eventId ? `/manage/events/${eventId}/vendors` : `/manage/vendors`, true); } catch { toast({ text: 'לא נשמר', kind: 'error' }); } };
  return (
    <>
      <Top back title={existing ? existing.name : 'בעל דוכן חדש'} end={<Btn kind="quiet" size="sm" onClick={() => history.back()}>ביטול</Btn>} />
      <Field label="שם"><Input big value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="טלפון"><Input dir="ltr" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
      <Field label="מה מוכרים"><Input value={f.product} onChange={(e) => setF({ ...f, product: e.target.value })} /></Field>
      <div style={{ marginTop: 14 }}><SwitchRow on={f.external} onChange={(external) => setF({ ...f, external })} title="דוכן חיצוני" meta="הכסף עובר ישירות למוכר, לא דרך המערכת" /></div>
      <Field label="הערות (רק מנהלים)"><Textarea rows={3} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="צריכה שולחן וחיבור לחשמל…" /></Field>
      <div className="actions sticky"><Btn size="big" disabled={!f.name.trim()} onClick={save}>שמירה</Btn>{f.phone && <a className="btn ghost" href={waLink(f.phone)} target="_blank" rel="noopener"><Icon name="whatsapp" size={20} />וואטסאפ</a>}{existing && (confirmDel ? <Btn kind="rustfill" onClick={() => deleteVendor(existing.id).then(() => navigate('/manage/vendors', true))}>לאשר הסרה מהרשימה</Btn> : <Btn kind="danger" size="sm" onClick={() => setConfirmDel(true)}>הסרה מהרשימה</Btn>)}</div>
    </>
  );
}

// ---------- products ----------
export function EventProductsScreen({ id, ctx }: { id: string; ctx: TeamCtx }) {
  const d = useEventData(id); const all = useAllEvents(true); const desktop = useDesktop(); const toast = useToast();
  const [copying, setCopying] = useState(false);
  if (!d.e) return <EventFrame id={id} tab="products" ctx={ctx}>{null}</EventFrame>;
  const sold = (pid: string) => d.tabs.reduce((s, t) => s + t.items.filter((i) => i.productId === pid).reduce((x, i) => x + i.qty, 0), 0);
  const move = (p: Product, dir: -1 | 1) => { const list = [...d.products].sort((a, b) => a.sort - b.sort); const i = list.indexOf(p); const j = i + dir; if (j < 0 || j >= list.length) return; const other = list[j]; saveProduct(id, { ...p, sort: other.sort }, p); saveProduct(id, { ...other, sort: p.sort }, other); };
  const toggle = (p: Product) => saveProduct(id, { ...p, active: !p.active }, p);
  const others = all.items.filter((e) => e.id !== id && e.start < d.e!.start).sort((a, b) => b.start.localeCompare(a.start));
  return (
    <EventFrame id={id} tab="products" ctx={ctx} title={desktop ? d.e.title : 'מוצרי דוכן החווה'} end={<><Btn kind="ghost" size="sm" icon="copy" onClick={() => setCopying(!copying)}>העתקה מאירוע קודם</Btn><Btn size="sm" icon="plus" to={`/manage/events/${id}/products/new`}>מוצר</Btn></>}>
      <p className="lead">מה שהצוות רושם לחשבון של האורח. {d.products.filter((p) => p.active).length} מוצרים{d.products.some((p) => !p.active) ? `, ${d.products.filter((p) => !p.active).length} מוסתר` : ''}. הסדר כאן הוא הסדר בטלפון של הצוות.</p>
      {copying && <><Sec title="להעתיק מאירוע קודם" /><div className="list">{others.map((e) => <CopyRow key={e.id} e={e} onCopy={async (prods) => { await copyProducts(e.id, id, prods); setCopying(false); toast({ text: `הועתקו ${prods.length} מוצרים מ${e.title}` }, 3000); }} />)}{!others.length && <p className="lead">אין אירוע קודם עם מוצרים.</p>}</div></>}
      {desktop ? <div className="tablewrap"><table><thead><tr><th></th><th>מוצר</th><th>מחיר</th><th>נמכרו</th><th>מוצג</th><th></th></tr></thead><tbody>{d.products.map((p, i) => <tr key={p.id} className={p.active ? '' : 'sub'}><td><div className="acts" style={{ justifyContent: 'flex-start' }}><Btn size="xs" kind="quiet" disabled={i === 0} onClick={() => move(p, -1)}>↑</Btn><Btn size="xs" kind="quiet" disabled={i === d.products.length - 1} onClick={() => move(p, 1)}>↓</Btn></div></td><td style={{ fontWeight: 600 }}>{p.name}</td><td className="money">{money(p.price)}</td><td>{sold(p.id) || <span className="muted">—</span>}</td><td><button type="button" className={'switch ' + (p.active ? 'on' : '')} role="switch" aria-checked={p.active} aria-label="מוצג" onClick={() => toggle(p)} /></td><td style={{ textAlign: 'end' }}><Btn size="xs" kind="ghost" to={`/manage/events/${id}/products/${p.id}`}>עריכה</Btn></td></tr>)}</tbody></table></div>
        : <div className="list">{d.products.map((p, i) => <div key={p.id} className="row center" style={p.active ? undefined : { color: 'var(--muted)' }}><div style={{ display: 'flex', flexDirection: 'column' }}><button type="button" className="iconbtn" style={{ height: 28 }} disabled={i === 0} onClick={() => move(p, -1)} aria-label="למעלה"><Icon name="down" size={16} className="" /></button><button type="button" className="iconbtn" style={{ height: 28 }} disabled={i === d.products.length - 1} onClick={() => move(p, 1)} aria-label="למטה"><Icon name="down" size={16} /></button></div><A to={`/manage/events/${id}/products/${p.id}`} className="main"><div className="title">{p.name}</div><div className="meta">{!p.active && <Pill>מוסתר</Pill>}{sold(p.id) > 0 && <span>נמכרו {sold(p.id)}</span>}</div></A><span className="amount">{money(p.price)}</span><Btn size="xs" kind="quiet" onClick={() => toggle(p)}>{p.active ? 'הסתרה' : 'הצגה'}</Btn></div>)}{!d.products.length && <Empty title="אין מוצרים לאירוע הזה" text="מוסיפים מוצר, או מעתיקים מאירוע קודם." />}</div>}
      {desktop && d.products.length > 0 && <><Sec title="איך זה נראה בדוכן" /><div className="products" style={{ maxWidth: 420 }}>{d.products.filter((p) => p.active).slice(0, 4).map((p) => <div key={p.id} className="product"><b>{p.name}</b><span>{money(p.price)}</span></div>)}</div></>}
    </EventFrame>
  );
}
function CopyRow({ e, onCopy }: { e: FarmEvent; onCopy: (p: Product[]) => Promise<void> }) {
  const prods = useProducts(e.id, true);
  if (!prods.items.length) return null;
  return <Row center title={e.title} meta={<span>{fmtDate(e.start)} · {prods.items.length} מוצרים</span>} end={<Btn size="sm" kind="ghost" onClick={() => onCopy(prods.items)}>העתקה</Btn>} />;
}
export function ProductEditor({ eventId, pid, ctx }: { eventId: string; pid?: string; ctx: TeamCtx }) {
  const d = useEventData(eventId);
  const existing = d.products.find((p) => p.id === pid);
  const [f, setF] = useState({ name: '', price: 0, active: true });
  const [loaded, setLoaded] = useState(false);
  const toast = useToast(); const [confirmDel, setConfirmDel] = useState(false);
  if (existing && !loaded) { setF({ name: existing.name, price: existing.price, active: existing.active }); setLoaded(true); }
  if (!d.e) return <Loading />;
  const sold = existing ? d.tabs.reduce((s, t) => s + t.items.filter((i) => i.productId === existing.id).reduce((x, i) => x + i.qty, 0), 0) : 0;
  const revenue = existing ? d.tabs.reduce((s, t) => s + t.items.filter((i) => i.productId === existing.id).reduce((x, i) => x + i.qty * i.price, 0), 0) : 0;
  const save = () => saveProduct(eventId, { ...f, name: f.name.trim(), sort: existing?.sort ?? (Math.max(0, ...d.products.map((p) => p.sort)) + 1) }, existing).then(() => navigate(`/manage/events/${eventId}/products`, true)).catch(() => toast({ text: 'לא נשמר', kind: 'error' }));
  return (
    <>
      <Top backTo={`/manage/events/${eventId}/products`} backLabel="מוצרים" title={existing ? existing.name : 'מוצר בדוכן'} sub={`${d.e.title} · דוכן החווה`} />
      <Field label="שם המוצר"><Input big value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="מחיר"><div className="inline"><Input dir="ltr" type="number" inputMode="numeric" min={0} style={{ maxWidth: 160 }} value={f.price} onChange={(e) => setF({ ...f, price: Math.max(0, Number(e.target.value) || 0) })} /><span className="muted">₪</span></div></Field>
      <div style={{ marginTop: 14 }}><SwitchRow on={f.active} onChange={(active) => setF({ ...f, active })} title="מוצג בדוכן" meta="כיבוי כשנגמר המלאי, בלי למחוק" /></div>
      {f.name && <><Sec title="איך זה נראה בדוכן" /><div className="products" style={{ gridTemplateColumns: '1fr', maxWidth: 220 }}><div className="product"><b>{f.name}</b><span>{money(f.price)}</span></div></div></>}
      {existing && <><Sec title="מכירות באירוע הזה" /><Ledger small items={[{ n: sold, label: 'יחידות' }, { n: money(revenue), label: 'הכנסה' }]} /></>}
      <div className="actions sticky"><Btn size="big" disabled={!f.name.trim()} onClick={save}>שמירה</Btn>{existing && (confirmDel ? <Btn kind="rustfill" onClick={() => deleteProduct(eventId, existing.id).then(() => navigate(`/manage/events/${eventId}/products`, true))}>לאשר מחיקה</Btn> : <Btn kind="danger" size="sm" onClick={() => setConfirmDel(true)}>מחיקה</Btn>)}</div>
    </>
  );
}

// ---------- tabs (stall accounts) ----------
type TabFilter = 'all' | 'open' | 'claimed' | 'paid' | 'waived';
export function EventTabsScreen({ id, ctx }: { id: string; ctx: TeamCtx }) {
  const d = useEventData(id); const desktop = useDesktop(); const toast = useToast();
  const [filter, setFilter] = useState<TabFilter>('all');
  if (!d.e) return <EventFrame id={id} tab="tabs" ctx={ctx}>{null}</EventFrame>;
  const e = d.e;
  const sum = (s: Tab['status'][]) => d.tabs.filter((t) => s.includes(t.status)).reduce((x, t) => x + t.total, 0);
  const list = d.tabs.filter((t) => filter === 'all' || t.status === filter).sort((a, b) => (a.status === 'open' || a.status === 'claimed' ? 0 : 1) - (b.status === 'open' || b.status === 'claimed' ? 0 : 1) || b.updatedAt.localeCompare(a.updatedAt));
  const remind = (t: Tab) => waLink(t.guestPhone, fillTemplate(ctx.settings.templates.debtReminder, { 'שם': firstName(t.guestName), 'אירוע': e.title, 'סכום': t.total }));
  const set = (t: Tab, s: Tab['status'], note?: string) => setTabStatus(ctx.actor, t, s, note).then(() => toast({ text: `${t.guestName} · ${TAB_LABELS[s]}`, action: { label: 'ביטול', onClick: () => setTabStatus(ctx.actor, t, t.status) } }, 5000));
  const waive = (t: Tab) => { const r = prompt('סיבת המחילה (לא חובה):'); if (r === null) return; set(t, 'waived', r); };
  const statusPill = (t: Tab) => <Pill tone={t.status === 'paid' ? 'ok' : t.status === 'waived' ? undefined : 'ochre'}>{t.status === 'claimed' ? 'סימן/ה "העברתי"' : t.status === 'open' ? `לא שולם · ${Math.max(0, Math.round((Date.now() - new Date(t.createdAt).getTime()) / 86400_000))} ימים` : TAB_LABELS[t.status]}</Pill>;
  const acts = (t: Tab) => <>{t.status === 'claimed' && <Btn size="xs" onClick={() => set(t, 'paid')}>אישור · שולם</Btn>}{t.status === 'open' && <>{t.guestPhone && <a className="btn ghost xs" href={remind(t)} target="_blank" rel="noopener"><Icon name="whatsapp" size={14} />תזכורת</a>}<Btn size="xs" kind="ghost" onClick={() => set(t, 'paid')}>שולם</Btn></>}{(t.status === 'open' || t.status === 'claimed') && <Btn size="xs" kind="quiet" onClick={() => waive(t)}>מחילה</Btn>}</>;
  return (
    <EventFrame id={id} tab="tabs" ctx={ctx} title={desktop ? e.title : 'חשבונות וחובות'} end={<><Btn kind="ghost" size="sm" icon="download" onClick={() => downloadCsv(`${e.title} - חשבונות.csv`, ['מי', 'טלפון', 'פריטים', 'סכום', 'מצב', 'עדכון'], d.tabs.map((t) => [t.guestName, t.guestPhone, t.items.map((i) => `${i.name}×${i.qty}`).join(' '), t.total, TAB_LABELS[t.status], fmtDate(t.updatedAt)]))}>אקסל</Btn>{d.tabs.some((t) => t.status === 'open' && t.guestPhone) && <Btn kind="ghost" size="sm" icon="whatsapp" onClick={() => toast({ text: 'שולחים תזכורת אחת־אחת מהשורות, כדי שכל אחד יקבל את הסכום שלו.' }, 4000)}>תזכורת לכל החייבים</Btn>}</>}>
      {!desktop && <p className="lead">דוכן החווה · {fmtDate(e.start)} · על בסיס אמון</p>}
      <Ledger small items={[{ n: d.tabs.length, label: 'חשבונות' }, { n: money(sum(['open', 'claimed', 'paid', 'waived'])), label: 'נמכרו' }, { n: money(sum(['paid'])), label: 'שולמו' }, { n: money(sum(['open', 'claimed'])), label: `פתוחים · ${d.tabs.filter((t) => t.status === 'open' || t.status === 'claimed').length}`, tone: sum(['open', 'claimed']) ? 'ochre' : undefined }]} />
      <div style={{ paddingTop: 10 }}><Chips scroll={!desktop} value={filter} onChange={setFilter} options={[{ value: 'all', label: 'הכל', n: d.tabs.length }, { value: 'open', label: 'פתוחים', n: d.tabs.filter((t) => t.status === 'open').length }, { value: 'claimed', label: 'סימנו "העברתי"', n: d.tabs.filter((t) => t.status === 'claimed').length }, { value: 'paid', label: 'שולמו', n: d.tabs.filter((t) => t.status === 'paid').length }, { value: 'waived', label: 'נמחלו', n: d.tabs.filter((t) => t.status === 'waived').length || undefined }]} /></div>
      {!list.length && <Empty title="אין חשבונות" text="חשבונות נפתחים בדוכן ביום האירוע." />}
      {desktop ? <div className="tablewrap"><table><thead><tr><th>מצב</th><th>מי</th><th>מה</th><th>סכום</th><th>עדכון אחרון</th><th></th></tr></thead><tbody>{list.map((t) => <tr key={t.id}><td>{statusPill(t)}</td><td style={{ fontWeight: 600 }}><A to={`/manage/events/${id}/tabs/${t.id}`}>{t.guestName}</A>{!t.guestUid && <span className="muted"> · מזדמן</span>}</td><td className="muted">{t.items.length > 3 ? `${t.items.length} פריטים` : t.items.map((i) => i.name + (i.qty > 1 ? ` ×${i.qty}` : '')).join(' · ')}</td><td className="money">{money(t.total)}</td><td className="muted">{relTime(t.updatedAt)}</td><td><div className="acts">{acts(t)}</div></td></tr>)}</tbody></table></div>
        : <div className="list">{list.map((t) => <div key={t.id} className="row"><Avatar name={t.guestName} /><div className="main"><A to={`/manage/events/${id}/tabs/${t.id}`} className="title">{t.guestName}</A><div className="meta">{statusPill(t)}<span>{relTime(t.updatedAt)}</span></div><div className="meta">{t.items.map((i) => i.name + (i.qty > 1 ? ` ×${i.qty}` : '')).join(' · ')} · {t.items.length} פריטים</div>{(t.status === 'open' || t.status === 'claimed') && <div className="inline" style={{ marginTop: 8 }}>{acts(t)}</div>}</div><span className="amount">{money(t.total)}</span></div>)}</div>}
    </EventFrame>
  );
}
export function TabDetailScreen({ eventId, tid, ctx }: { eventId: string; tid: string; ctx: TeamCtx }) {
  const { item: t, loading } = useTab(tid); const toast = useToast();
  const log = useActivityForEvent(eventId, true);
  if (loading) return <Loading />;
  if (!t) return <Empty title="החשבון לא נמצא" />;
  const mine = log.items.filter((a) => a.refId === t.id);
  const set = (s: Tab['status'], note?: string) => setTabStatus(ctx.actor, t, s, note).then(() => toast({ text: `${t.guestName} · ${TAB_LABELS[s]}` }, 2500));
  const remind = waLink(t.guestPhone, fillTemplate(ctx.settings.templates.debtReminder, { 'שם': firstName(t.guestName), 'אירוע': t.eventTitle, 'סכום': t.total }));
  return (
    <>
      <Top backTo={`/manage/events/${eventId}/tabs`} backLabel="חשבונות" title={t.guestName} sub={`${t.eventTitle} · ${fmtDate(t.createdAt)} · נפתח על ידי ${firstName(t.createdBy.name)}`} end={<Pill tone={t.status === 'paid' ? 'ok' : t.status === 'waived' ? undefined : 'ochre'}>{t.status === 'claimed' ? 'סימן/ה "העברתי"' : TAB_LABELS[t.status]}</Pill>} />
      <div className={'paybox ' + (t.status === 'paid' ? 'ok' : t.status === 'waived' ? '' : '')}><b>{money(t.total)}</b>{t.status === 'open' || t.status === 'claimed' ? 'לתשלום' : TAB_LABELS[t.status]}</div>
      <Sec title="פריטים" n={t.items.length} />
      <div className="list">{t.items.map((i, idx) => <Row key={idx} center title={<>{i.name}{i.qty > 1 ? ` ×${i.qty}` : ''}</>} meta={<span>{fmtTime(i.at)} · {firstName(i.by.name)}</span>} end={<><span className="amount">{money(i.price * i.qty)}</span>{t.status !== 'paid' && <button type="button" className="iconbtn" aria-label="הסרה" onClick={() => { const r = prompt('למה מסירים? (לא חובה)'); if (r !== null) removeTabItem(ctx.actor, t, idx, r); }}><Icon name="x" size={18} /></button>}</>} />)}</div>
      <Sec title="תשלום והיסטוריה" />
      <div className="list">{mine.map((a) => <Row key={a.id} center title={<span style={{ fontSize: 15, fontWeight: 500 }}>{ACTION_LABELS[a.action] || a.action} · {firstName(a.by.name)}</span>} meta={<span>{a.text} · {whenText(a.at)}</span>} />)}{!mine.length && <p className="lead">נפתח {whenText(t.createdAt)}</p>}</div>
      <div className="actions sticky">
        {(t.status === 'open' || t.status === 'claimed') && <Btn size="big" icon="check" onClick={() => set('paid')}>אישור · שולם</Btn>}
        <div className="actions row2" style={{ padding: 0 }}>{t.guestPhone && t.status !== 'paid' && <a className="btn ghost" href={remind} target="_blank" rel="noopener"><Icon name="whatsapp" size={20} />תזכורת</a>}{t.guestUid && <Btn kind="ghost" to={`/manage/people/${t.guestUid}`}>התיק של {firstName(t.guestName)}</Btn>}</div>
        {(t.status === 'open' || t.status === 'claimed') && <Btn kind="quiet" size="sm" onClick={() => { const r = prompt('סיבת המחילה (לא חובה):'); if (r !== null) set('waived', r); }}>מחילה</Btn>}
        {t.status === 'paid' && <Btn kind="quiet" size="sm" onClick={() => set('open')}>להחזיר לפתוח</Btn>}
      </div>
    </>
  );
}

// ---------- report ----------
export function EventReportScreen({ id, ctx }: { id: string; ctx: TeamCtx }) {
  const d = useEventData(id); const donations = useDonations(true); const all = useAllEvents(true); const desktop = useDesktop();
  if (!d.e) return <EventFrame id={id} tab="report" ctx={ctx}>{null}</EventFrame>;
  const e = d.e; const day = e.start.slice(0, 10);
  const ticketsPaid = d.valid.filter((t) => t.paymentStatus === 'paid' || t.paymentStatus === 'paid_onsite');
  const ticketMoney = ticketsPaid.reduce((s, t) => s + t.price, 0);
  const stall = d.tabs.filter((t) => t.status !== 'waived').reduce((s, t) => s + t.total, 0);
  const openSum = d.tabs.filter((t) => t.status === 'open' || t.status === 'claimed').reduce((s, t) => s + t.total, 0) + d.unpaid.reduce((s, t) => s + t.price, 0);
  const waived = d.tabs.filter((t) => t.status === 'waived').reduce((s, t) => s + t.total, 0);
  const dayDon = donations.items.filter((x) => x.createdAt.slice(0, 10) === day && isPaid(x.paymentStatus));
  const donMoney = dayDon.reduce((s, x) => s + x.amount, 0);
  const top = useMemo(() => { const m = new Map<string, { name: string; units: number; rev: number }>(); for (const t of d.tabs) for (const i of t.items) { const c = m.get(i.productId) || { name: i.name, units: 0, rev: 0 }; c.units += i.qty; c.rev += i.qty * i.price; m.set(i.productId, c); } return [...m.values()].sort((a, b) => b.units - a.units); }, [d.tabs]);
  const pct = d.valid.length ? Math.round((d.arrived.length / d.valid.length) * 100) : 0;
  const csv = () => downloadCsv(`${e.title} - דוח.csv`, ['מדד', 'ערך'], [['כרטיסים', d.valid.length], ['הזמנות', d.orders.length], ['הגיעו', d.arrived.length], ['אחוז הגעה', pct + '%'], ['כרטיסים ששולמו ₪', ticketMoney], ['מכירות דוכן ₪', stall], ['תרומות ביום האירוע ₪', donMoney], ['פתוח ₪', openSum], ['נמחל ₪', waived], ...top.map((t) => [t.name, `${t.units} יח׳ · ${t.rev} ₪`])]);
  return (
    <EventFrame id={id} tab="report" ctx={ctx} title={desktop ? `${e.title} · דוח` : 'דוח האירוע'} end={<><Btn kind="ghost" size="sm" icon="download" onClick={csv}>ייצוא לאקסל</Btn>{desktop && <Btn kind="ghost" size="sm" icon="print" onClick={() => window.print()}>הדפסה</Btn>}</>}>
      {!desktop && <p className="lead">{e.title} · {fmtWeekday(e.start)} {fmtDate(e.start)}{e.end < new Date().toISOString() ? ' · הסתיים' : ''}</p>}
      <Sec title="אנשים" />
      <Ledger small items={[{ n: d.valid.length, label: 'כרטיסים' }, { n: d.arrived.length, label: 'הגיעו' }, { n: `${pct}%`, label: 'הגעה' }, { n: d.valid.filter((t) => t.entries > 1).length, label: 'יצאו וחזרו' }]} />
      <Sec title="כסף" />
      <div className="list">
        {e.price > 0 && <Row center title="כרטיסים ששולמו" meta={<span>{ticketsPaid.length} × {money(e.price)}{d.valid.filter((t) => t.paymentStatus === 'free').length ? ` · ${d.valid.filter((t) => t.paymentStatus === 'free').length} חינם` : ''}</span>} end={<span className="amount">{money(ticketMoney)}</span>} />}
        <Row center to={`/manage/events/${id}/tabs`} title="מכירות בדוכן" meta={<span>{d.tabs.length} חשבונות · {d.tabs.reduce((s, t) => s + t.items.reduce((x, i) => x + i.qty, 0), 0)} פריטים</span>} end={<span className="amount">{money(stall)}</span>} />
        <Row center to="/manage/donations" title="תרומות ביום האירוע" meta={<span>{dayDon.length} תורמים</span>} end={<span className="amount">{money(donMoney)}</span>} />
        <Row center title={<span style={{ color: openSum ? 'var(--ochre)' : undefined }}>עדיין לא שולם</span>} meta={<span>{d.tabs.filter((t) => t.status === 'open' || t.status === 'claimed').length} חשבונות דוכן · {byOrder(d.unpaid).length} הזמנות כרטיסים{openSum ? ' · לטיפול' : ''}</span>} end={<span className="amount" style={{ color: openSum ? 'var(--ochre)' : undefined }}>{money(openSum)}</span>} />
        {waived > 0 && <Row center title="נמחל" meta={<span>{d.tabs.filter((t) => t.status === 'waived').length} חשבונות</span>} end={<span className="amount">{money(waived)}</span>} />}
      </div>
      {top.length > 0 && <><Sec title="מה נמכר הכי הרבה" />{desktop ? <div className="tablewrap"><table><thead><tr><th>#</th><th>מוצר</th><th>יחידות</th><th>הכנסה</th></tr></thead><tbody>{top.map((t, i) => <tr key={t.name}><td className="muted">{i + 1}</td><td style={{ fontWeight: 600 }}>{t.name}</td><td>{t.units}</td><td className="money">{money(t.rev)}</td></tr>)}</tbody></table></div> : <div className="list">{top.slice(0, 7).map((t, i) => <Row key={t.name} center title={`${i + 1} ${t.name}`} meta={<span>{t.units} יח׳</span>} end={<span className="amount">{money(t.rev)}</span>} />)}</div>}</>}
      {desktop && <><Sec title="לעומת אירועים קודמים" /><div className="tablewrap"><table><thead><tr><th>אירוע</th><th>כרטיסים</th><th>הגיעו</th></tr></thead><tbody>{all.items.filter((x) => x.end < new Date().toISOString()).slice(0, 5).map((x) => <CompareRow key={x.id} e={x} />)}</tbody></table></div></>}
    </EventFrame>
  );
}
function CompareRow({ e }: { e: FarmEvent }) { const t = useEventTickets(e.id, true); const v = t.items.filter((x) => x.status === 'valid'); const a = v.filter((x) => x.entries > 0).length; return <tr><td style={{ fontWeight: 600 }}><A to={`/manage/events/${e.id}/report`}>{e.title}</A> <span className="muted">{fmtDate(e.start)}</span></td><td>{v.length}</td><td>{v.length ? `${Math.round((a / v.length) * 100)}%` : '—'}</td></tr>; }

// ---------- files (links, since Spark has no file storage) ----------
export function EventFilesScreen({ id, ctx }: { id: string; ctx: TeamCtx }) {
  const d = useEventData(id); const toast = useToast();
  const [f, setF] = useState({ name: '', url: '', kind: 'doc' as EventFile['kind'] });
  if (!d.e) return <EventFrame id={id} tab="files" ctx={ctx}>{null}</EventFrame>;
  const e = d.e; const files = e.files || [];
  const save = (next: EventFile[]) => saveEvent(ctx.actor, { title: e.title, description: e.description, image: e.image, location: e.location, start: e.start, end: e.end, price: e.price, maxPerOrder: e.maxPerOrder, capacity: e.capacity, open: e.open, published: e.published, questions: e.questions, files: next }, e).catch(() => toast({ text: 'לא נשמר', kind: 'error' }));
  const add = () => { if (!f.name.trim() || !/^https?:\/\//.test(f.url.trim())) return; save([...files, { name: f.name.trim(), url: f.url.trim(), kind: f.kind, by: ctx.actor, at: nowIso() }]).then(() => setF({ name: '', url: '', kind: 'doc' })); };
  const group = (k: EventFile['kind']) => files.filter((x) => x.kind === k);
  return (
    <EventFrame id={id} tab="files" ctx={ctx} title="קבצי האירוע">
      <p className="lead">אישורים, מפת הצבה, רשימות. רק מנהלים רואים. הקבצים נשמרים ב־Google Drive או בוואטסאפ, וכאן שומרים את הקישור.</p>
      {(['doc', 'image'] as const).map((k) => <div key={k}><Sec title={k === 'doc' ? 'מסמכים' : 'תמונות'} n={group(k).length} /><div className="list">{group(k).map((x, i) => <Row key={x.url + i} center start={<span className="iconbtn" style={{ color: 'var(--green2)', width: 36 }}><Icon name={k === 'doc' ? 'file' : 'image'} /></span>} title={<a href={x.url} target="_blank" rel="noopener" style={{ textDecoration: 'underline', textUnderlineOffset: 3 }}>{x.name}</a>} meta={<span>{firstName(x.by.name)} · {fmtDate(x.at)}</span>} end={<button type="button" className="iconbtn" aria-label="הסרה" onClick={() => save(files.filter((y) => y !== x))}><Icon name="x" size={18} /></button>} />)}{!group(k).length && <p className="lead">אין עדיין.</p>}</div></div>)}
      <Sec title="הוספת קישור" />
      <Field><Input placeholder="שם הקובץ (אישור משטרה, מפת הצבה…)" value={f.name} onChange={(ev) => setF({ ...f, name: ev.target.value })} /></Field>
      <Field><Input dir="ltr" inputMode="url" placeholder="https://drive.google.com/…" value={f.url} onChange={(ev) => setF({ ...f, url: ev.target.value })} /></Field>
      <Field><div className="chips"><Chip on={f.kind === 'doc'} onClick={() => setF({ ...f, kind: 'doc' })}>מסמך</Chip><Chip on={f.kind === 'image'} onClick={() => setF({ ...f, kind: 'image' })}>תמונה</Chip></div></Field>
      <div className="actions"><Btn disabled={!f.name.trim() || !/^https?:\/\//.test(f.url.trim())} onClick={add}>הוספה</Btn></div>
    </EventFrame>
  );
}

// ---------- activity ----------
export function EventActivityScreen({ id, ctx }: { id: string; ctx: TeamCtx }) {
  const d = useEventData(id);
  const [filter, setFilter] = useState<'all' | 'orders' | 'payments' | 'stall' | 'edits'>('all');
  if (!d.e) return <EventFrame id={id} tab="activity" ctx={ctx}>{null}</EventFrame>;
  const list = d.acts.filter((a) => filter === 'all' ? true : filter === 'orders' ? a.action === 'ordered' || a.action === 'cancelled' : filter === 'payments' ? ['paid', 'claimed'].includes(a.action) : filter === 'stall' ? a.kind === 'tab' : a.kind === 'event');
  const byDay = useMemo(() => { const m = new Map<string, typeof list>(); for (const a of list) m.set(a.at.slice(0, 10), [...(m.get(a.at.slice(0, 10)) || []), a]); return [...m.entries()]; }, [list]);
  return (
    <EventFrame id={id} tab="activity" ctx={ctx} title="היסטוריית האירוע">
      <p className="lead">{d.acts.length} פעולות · כל שינוי, הזמנה וסריקה, לפי זמן</p>
      <div style={{ paddingTop: 8 }}><Chips scroll value={filter} onChange={setFilter} options={[{ value: 'all', label: 'הכל' }, { value: 'orders', label: 'הזמנות' }, { value: 'payments', label: 'תשלומים' }, { value: 'stall', label: 'דוכן' }, { value: 'edits', label: 'עריכות' }]} /></div>
      {byDay.map(([day, items]) => <div key={day}><Sec title={whenText(items[0].at).split(' · ')[0] === 'היום' ? 'היום' : whenText(items[0].at).split(' · ')[0] === 'אתמול' ? 'אתמול' : fmtDayLong(day)} n={items.length} /><div className="list">{items.map((a) => <Row key={a.id} center start={<Avatar name={a.by.name} size="sm" light />} title={<span style={{ fontSize: 15, fontWeight: 500 }}>{firstName(a.by.name)} · {ACTION_LABELS[a.action] || a.action}: {a.text}</span>} meta={<span>{fmtTime(a.at)} · {KIND_LABELS[a.kind]}</span>} />)}</div></div>)}
      {!list.length && <Empty title="אין עדיין" />}
    </EventFrame>
  );
}

