// Manager: events. The list, the editor, and one event with its parts (registered, live entry, vendors, stall products,
// tabs and debts, report, files, history). One set of money helpers feeds every screen, so the numbers always agree.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { FarmEvent, Ticket, Vendor, EventVendor, Product, Tab, EventFile, EventQuestion, Activity } from '../types';
import { KIND_LABELS } from '../types';
import type { TeamCtx } from '../ctx';
import { A, Icon, useDesktop, useToast, fmtTime, fmtDate, fmtDateShort, fmtWeekday, fmtDayLong, fmtRange, firstName, relTime, whenText, todayISO, dateKey, dayLabel, money } from '../ui';
import { Head, Sect, Tabs, Btn, Form, Field, Seg, Tick, Empty, useSticky, deferDelete, pickImage, isHidden, useHiddenVersion } from '../kit';
import { navigate, param } from '../router';
import {
  useAllEvents, useEvent, saveEvent, deleteEvent, type EventInput, useEventTickets, useTicketsOfEvents, setOrderPayment, cancelOrder, restoreOrder,
  useVendors, useVendor, saveVendor, deleteVendor, useEventVendors, setEventVendor, removeEventVendor,
  useProducts, saveProduct, deleteProduct, copyProducts, setProductOrder, useEventTabs, useTab, setTabStatus, removeTabItem, addTabItems,
  useEventFiles, addEventFile, removeEventFile, migrateEventFiles, useDonations, downloadCsv, fillTemplate, waLink, telLink, upsertCalendarRef, deleteCalendarRef,
} from '../data';
import { useActivityFor, useActivityForEvent, ACTION_LABELS } from '../activity';
import { compressPhoto } from '../store';
import { nowIso } from '../firebase';

// ---------- one vocabulary for people and money ----------
// Counts are always tickets. "הזמנה" appears only as the row of the registered list. Money is what was received, what is
// still owed, and what was waived: three columns that never overlap.
const TZ = 'Asia/Jerusalem';
const ticketPaid = (t: Ticket) => t.paymentStatus === 'paid' || t.paymentStatus === 'paid_onsite';
const ticketSettled = (t: Ticket) => ticketPaid(t) || t.paymentStatus === 'free';
const sum = (xs: number[]) => Math.round(xs.reduce((s, x) => s + x, 0) * 100) / 100;
const byOrder = (tickets: Ticket[]) => { const m = new Map<string, Ticket[]>(); for (const t of tickets) m.set(t.orderId, [...(m.get(t.orderId) || []), t]); return [...m.values()].map((o) => o.sort((a, b) => a.index - b.index)); };
type OrderState = 'paid' | 'free' | 'claimed' | 'pending' | 'cancelled';
type Order = { id: string; all: Ticket[]; valid: Ticket[]; head: Ticket; state: OrderState; owed: number; arrived: number };
function orderOf(all: Ticket[]): Order {
  const valid = all.filter((t) => t.status === 'valid'); const open = valid.filter((t) => !ticketSettled(t));
  const state: OrderState = !valid.length ? 'cancelled' : !open.length ? (valid.every((t) => t.paymentStatus === 'free') ? 'free' : 'paid') : open.some((t) => t.paymentStatus === 'pending') ? 'pending' : 'claimed';
  return { id: all[0].orderId, all, valid, head: all[0], state, owed: sum(open.map((t) => t.price)), arrived: valid.filter((t) => t.entries > 0).length };
}
const ORDER_WORD: Record<OrderState, string> = { paid: 'שולם', free: 'חינם', claimed: 'סימנו שהעבירו', pending: 'לא שולם', cancelled: 'בוטלה' };
const ORDER_TONE: Record<OrderState, string> = { paid: 'ok', free: 'off', claimed: 'wait', pending: 'bad', cancelled: 'off' };
const tabOpen = (t: Tab) => t.status === 'open' || t.status === 'claimed';
const TAB_WORD: Record<Tab['status'], string> = { open: 'לא שולם', claimed: 'סימנו שהעבירו', paid: 'שולם', waived: 'נמחל' };
const TAB_TONE: Record<Tab['status'], string> = { open: 'bad', claimed: 'wait', paid: 'ok', waived: 'off' };
function statsOf(tickets: Ticket[], tabs: Tab[]) {
  const orders = byOrder(tickets).map(orderOf);
  const valid = tickets.filter((t) => t.status === 'valid');
  const paid = valid.filter(ticketPaid); const owedT = valid.filter((t) => !ticketSettled(t));
  const stallPaid = sum(tabs.filter((t) => t.status === 'paid').map((t) => t.total));
  const stallOwed = sum(tabs.filter(tabOpen).map((t) => t.total));
  const stallWaived = sum(tabs.filter((t) => t.status === 'waived').map((t) => t.total));
  return {
    orders, liveOrders: orders.filter((o) => o.state !== 'cancelled'), valid,
    arrived: valid.filter((t) => t.entries > 0).length,
    ticketsPaid: paid.length, ticketsFree: valid.filter((t) => t.paymentStatus === 'free').length, ticketsOwed: owedT.length,
    ticketsClaimed: owedT.filter((t) => t.paymentStatus === 'claimed').length,
    ticketMoney: sum(paid.map((t) => t.price)), ticketOwed: sum(owedT.map((t) => t.price)),
    stallPaid, stallOwed, stallWaived, openTabs: tabs.filter(tabOpen).length,
    received: sum([sum(paid.map((t) => t.price)), stallPaid]), owed: sum([sum(owedT.map((t) => t.price)), stallOwed]),
  };
}
const tickets_ = (n: number) => (n === 1 ? 'כרטיס אחד' : `${n} כרטיסים`);
const orders_ = (n: number) => (n === 1 ? 'הזמנה אחת' : `${n} הזמנות`);
const tabs_ = (n: number) => (n === 1 ? 'חשבון אחד' : `${n} חשבונות`);
type Phase = 'before' | 'day' | 'after';
const phaseOf = (e: FarmEvent): Phase => { const t = todayISO(); return dateKey(new Date(e.end)) < t ? 'after' : dateKey(new Date(e.start)) > t ? 'before' : 'day'; };
const digits = (s: string) => s.replace(/\D/g, '');
const dateFull = (iso: string) => new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: TZ });
/** A cell typed by a guest must never run as a formula in Excel; a phone number must keep its leading zero. */
const cell = (v: string) => (/^[=+\-@]/.test(v) ? "'" + v : v);
const telCell = (p: string) => (p ? `="${digits(p)}"` : '');
const Word = ({ tone, children }: { tone: string; children: ReactNode }) => <span className={'r-w ' + tone}>{children}</span>;
const failText = (e: unknown) => (e as Error)?.message || 'לא נשמר';

/** Asks for a reason in place, instead of a browser prompt. */
function Reason({ label, action, onDo, onCancel }: { label: string; action: string; onDo: (reason: string) => void; onCancel: () => void }) {
  const [v, setV] = useState('');
  return (
    <Form className="r-reason" onSubmit={() => onDo(v.trim())}>
      <input className="r-input" autoFocus value={v} onChange={(e) => setV(e.target.value)} placeholder={label} aria-label={label} maxLength={200} />
      <Btn type="submit" small kind="gold">{action}</Btn><Btn small kind="quiet" onClick={onCancel}>לא עכשיו</Btn>
    </Form>
  );
}
function useSortBy<K extends string>(initial: K, dir: 'asc' | 'desc' = 'asc') {
  const [s, setS] = useState<{ key: K; dir: 'asc' | 'desc' }>({ key: initial, dir });
  const th = (key: K, label: string) => <th aria-sort={s.key === key ? (s.dir === 'asc' ? 'ascending' : 'descending') : undefined}><button type="button" className="r-sortbtn" onClick={() => setS((p) => ({ key, dir: p.key === key && p.dir === 'asc' ? 'desc' : 'asc' }))}>{label}{s.key === key ? (s.dir === 'asc' ? ' ↑' : ' ↓') : ''}</button></th>;
  const apply = <T,>(rows: T[], get: (r: T, k: K) => string | number) => [...rows].sort((a, b) => { const x = get(a, s.key), y = get(b, s.key); const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'he'); return s.dir === 'asc' ? c : -c; });
  return { th, apply };
}

// ---------- list ----------
export function EventsListScreen({ ctx }: { ctx: TeamCtx }) {
  const { items, loading } = useAllEvents(true); const desktop = useDesktop(); useHiddenVersion();
  const now = new Date().toISOString();
  const shown = items.filter((e) => !isHidden(e.id));
  const ahead = shown.filter((e) => e.end >= now).sort((a, b) => a.start.localeCompare(b.start));
  const upcoming = ahead.filter((e) => e.published); const drafts = ahead.filter((e) => !e.published);
  const past = shown.filter((e) => e.end < now).sort((a, b) => b.start.localeCompare(a.start));
  const tickets = useTicketsOfEvents(upcoming.map((e) => e.id), true);
  const attention = (e: FarmEvent) => {
    const s = statsOf(tickets.items.filter((t) => t.eventId === e.id), []);
    const out: string[] = [];
    if (s.ticketsOwed) out.push(`${tickets_(s.ticketsOwed)} לא שולמו`);
    if (!e.open) out.push('ההרשמה סגורה');
    if (e.capacity > 0 && s.valid.length >= e.capacity) out.push('אין מקומות');
    return { line: `${tickets_(s.valid.length)}${e.capacity ? ` מתוך ${e.capacity}` : ''}`, attn: out.join(' · ') };
  };
  const dayCell = (e: FarmEvent) => <div className="r-day">{new Date(e.start).toLocaleDateString('he-IL', { day: 'numeric', timeZone: TZ })}<small>{fmtDateShort(e.start).replace(/^\d+\s*/, '')}</small></div>;
  return (
    <>
      <Head backTo={desktop ? undefined : '/manage'} backLabel="ניהול" title="אירועים" end={<Btn small to="/manage/events/new">אירוע חדש</Btn>} />
      {loading && !items.length && <div className="r-empty">טוען…</div>}
      <Sect title="קרובים" n={upcoming.length} />
      {!upcoming.length && !loading && <Empty title="אין אירוע מפורסם">אירוע חדש נשמר כטיוטה עד שמפרסמים אותו.</Empty>}
      {upcoming.map((e) => { const a = attention(e); return (
        <A key={e.id} className="r-evitem" to={`/manage/events/${e.id}`}>
          {dayCell(e)}
          <div><b>{e.title}</b><span>{fmtWeekday(e.start)} · {fmtTime(e.start)} · {e.price ? money(e.price) : 'חינם'} · {a.line}</span>{a.attn && <span className="r-attn">{a.attn}</span>}</div>
          <Icon name="chev" />
        </A>
      ); })}
      {drafts.length > 0 && <>
        <Sect title="טיוטות" n={drafts.length} />
        <p className="r-hint">אורחים לא רואים אותן.</p>
        {drafts.map((e) => <A key={e.id} className="r-evitem draft" to={`/manage/events/${e.id}`}>{dayCell(e)}<div><b>{e.title}</b><span>{fmtWeekday(e.start)} · {fmtTime(e.start)}{[!e.description && 'תיאור', !e.image && 'תמונה'].filter(Boolean).length ? ` · חסרים: ${[!e.description && 'תיאור', !e.image && 'תמונה'].filter(Boolean).join(', ')}` : ''}</span></div><Icon name="chev" /></A>)}
      </>}
      {past.length > 0 && <>
        <Sect title="עברו" n={past.length} />
        {desktop ? (
          <table className="r-table"><thead><tr><th>תאריך</th><th>אירוע</th><th>מחיר</th><th /></tr></thead>
            <tbody>{past.map((e) => <tr key={e.id} tabIndex={0} onClick={() => navigate(`/manage/events/${e.id}`)} onKeyDown={(k) => { if (k.key === 'Enter' && k.target === k.currentTarget) navigate(`/manage/events/${e.id}`); }}><td>{dateFull(e.start)}</td><td><span className="r-t">{e.title}</span></td><td>{e.price ? money(e.price) : 'חינם'}</td><td style={{ textAlign: 'end' }}><A className="r-textlink" to={`/manage/events/${e.id}/report`} onClick={(k) => k.stopPropagation()}>דוח</A></td></tr>)}</tbody></table>
        ) : past.map((e) => <A key={e.id} className="r-line" to={`/manage/events/${e.id}`}><span><span className="r-t">{e.title}</span><span className="r-m">{dateFull(e.start)} · {e.price ? money(e.price) : 'חינם'}</span></span><Icon name="chev" /></A>)}
      </>}
    </>
  );
}

// ---------- editor ----------
const toLocal = (iso: string) => { if (!iso) return ''; const d = new Date(iso); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
const fromLocal = (s: string) => (s && !Number.isNaN(new Date(s).getTime()) ? new Date(s).toISOString() : '');
const num = (s: string) => Number(String(s).replace(',', '.').trim());

export function EventEditor({ id, ctx }: { id?: string; ctx: TeamCtx }) {
  const { item: existing, loading } = useEvent(id || '', !!id);
  const backTo = id ? `/manage/events/${id}` : '/manage/events';
  if (id && loading) return <><Head backTo={backTo} backLabel="ביטול" title="עריכת אירוע" /><div className="r-empty">טוען…</div></>;
  if (id && !existing) return <><Head backTo="/manage/events" backLabel="אירועים" title="האירוע לא נמצא" /><Empty title="ייתכן שנמחק" /></>;
  return <EventForm key={existing?.id || 'new'} ctx={ctx} existing={existing || undefined} />;
}
function EventForm({ ctx, existing }: { ctx: TeamCtx; existing?: FarmEvent }) {
  const toast = useToast();
  const [title, setTitle] = useState(existing?.title || '');
  const [description, setDescription] = useState(existing?.description || '');
  const [image, setImage] = useState(existing?.image || '');
  const [location_, setLocation] = useState(existing?.location ?? 'חוות רווה, ליד טנא עומרים');
  const [start, setStart] = useState(existing?.start || ''); const [end, setEnd] = useState(existing?.end || '');
  const [price, setPrice] = useState(String(existing?.price ?? 0));
  const [maxPerOrder, setMax] = useState(String(existing?.maxPerOrder ?? 5));
  const [capacity, setCapacity] = useState(String(existing?.capacity ?? 0));
  const [open, setOpen] = useState(existing?.open ?? true); const [published, setPublished] = useState(existing?.published ?? false);
  const [questions, setQuestions] = useState<EventQuestion[]>(existing?.questions || []);
  const [busy, setBusy] = useState(false); const [tried, setTried] = useState(false); const [saveErr, setSaveErr] = useState('');
  const saving = useRef(false);
  const backTo = existing ? `/manage/events/${existing.id}` : '/manage/events';

  const errors: Record<string, string> = {};
  if (!title.trim()) errors.title = 'צריך שם לאירוע';
  if (!start) errors.start = 'צריך תאריך ושעת התחלה';
  if (!end) errors.end = 'צריך שעת סיום'; else if (start && end <= start) errors.end = 'הסיום צריך להיות אחרי ההתחלה';
  const p = num(price), m = num(maxPerOrder), c = num(capacity);
  if (!Number.isFinite(p) || p < 0) errors.price = 'מחיר הוא מספר, 0 לאירוע חינם';
  if (!Number.isInteger(m) || m < 1 || m > 20) errors.max = 'מספר שלם בין 1 ל־20';
  if (!Number.isInteger(c) || c < 0) errors.capacity = 'מספר שלם, 0 אם אין הגבלה';
  if (questions.some((q) => !q.label.trim())) errors.questions = 'יש שאלה בלי נוסח. כתבו אותה או הסירו אותה.';
  const firstError = Object.values(errors)[0];
  const show = (k: string) => (tried && errors[k] ? <span className="r-err">{errors[k]}</span> : undefined);

  const pick = async () => { const f = await pickImage(); if (!f) return; setBusy(true); try { setImage(await compressPhoto(f)); } catch (e) { toast({ text: failText(e), kind: 'error' }); } finally { setBusy(false); } };
  const submit = async () => {
    setTried(true); setSaveErr('');
    if (firstError || saving.current) return;
    saving.current = true; setBusy(true);
    const data: EventInput = { title: title.trim(), description: description.trim(), image, location: location_.trim(), start, end, price: p, maxPerOrder: m, capacity: c, open, published, questions: questions.map((q) => ({ ...q, label: q.label.trim() })), files: existing?.files || [] };
    let id = '';
    try { id = await saveEvent(ctx.actor, data, existing); }
    catch (e) { setSaveErr(failText(e)); saving.current = false; setBusy(false); return; }
    // the calendar line is a convenience: if it fails the event itself is still saved, and the manager is told exactly that
    try {
      if (published) await upsertCalendarRef(ctx.actor, 'event', id, { title: data.title, date: dateKey(new Date(start)), time: `${fmtTime(start)}–${fmtTime(end)}` });
      else await deleteCalendarRef('event', id);
      toast({ text: published ? 'נשמר ומפורסם' : 'נשמר כטיוטה' }, 2500);
    } catch { toast({ text: 'האירוע נשמר, אבל לא נכנס ליומן המנהלים. אפשר לשמור שוב מאוחר יותר.', kind: 'error' }, 7000); }
    navigate(`/manage/events/${id}`, true);
  };
  const remove = () => {
    if (!existing) return;
    const undo = deferDelete(existing.id, () => { deleteEvent(ctx.actor, existing).catch(() => {}); deleteCalendarRef('event', existing.id); });
    toast({ text: `נמחק: ${existing.title}`, actions: [{ label: 'ביטול', onClick: undo }] }, 6000);
    navigate('/manage/events', true);
  };
  const setQ = (id: string, patch: Partial<EventQuestion>) => setQuestions((qs) => qs.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  return (
    <>
      <Head backTo={backTo} backLabel="ביטול" title={existing ? 'עריכת אירוע' : 'אירוע חדש'} />
      <Form onSubmit={submit} className="r-form r-evform">
        <Field label="שם האירוע" help={show('title')}>{(id) => <input id={id} className="r-input big" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} autoComplete="off" />}</Field>
        <div className="r-field">
          <span style={{ fontSize: 16, fontWeight: 700 }}>תמונה לדף האירוע</span>
          {image && <div className="r-photo"><img src={image} alt="תמונת האירוע" /><button type="button" onClick={() => setImage('')}>הסרה</button></div>}
          <div className="r-imgpick"><Btn kind="ghost" small onClick={pick} disabled={busy}>{image ? 'להחליף תמונה' : 'לבחור תמונה'}</Btn><span className="r-help">מהגלריה או מהמצלמה. לא חובה.</span></div>
        </div>
        <div className="r-cols2">
          <Field label="מתחיל" help={show('start')}>{(id) => <input id={id} type="datetime-local" dir="ltr" className="r-input" value={toLocal(start)} onChange={(e) => { const s = fromLocal(e.target.value); setStart(s); if (s && (!end || end <= s)) setEnd(new Date(new Date(s).getTime() + 3 * 3600_000).toISOString()); }} />}</Field>
          <Field label="מסתיים" help={show('end')}>{(id) => <input id={id} type="datetime-local" dir="ltr" className="r-input" value={toLocal(end)} onChange={(e) => setEnd(fromLocal(e.target.value))} />}</Field>
        </div>
        <Field label="מקום">{(id) => <input id={id} className="r-input" value={location_} onChange={(e) => setLocation(e.target.value)} maxLength={300} />}</Field>
        <div className="r-cols3">
          <Field label="מחיר לכרטיס, בשקלים" help={show('price') || '0 לאירוע חינם'}>{(id) => <input id={id} className="r-input" dir="ltr" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />}</Field>
          <Field label="כמה כרטיסים בהזמנה אחת" help={show('max') || 'עד 20'}>{(id) => <input id={id} className="r-input" dir="ltr" inputMode="numeric" value={maxPerOrder} onChange={(e) => setMax(e.target.value)} />}</Field>
          <Field label="כמה מקומות יש" help={show('capacity') || '0 אם אין הגבלה'}>{(id) => <input id={id} className="r-input" dir="ltr" inputMode="numeric" value={capacity} onChange={(e) => setCapacity(e.target.value)} />}</Field>
        </div>
        <Field label="תיאור לאורחים">{(id) => <textarea id={id} className="r-input" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={8000} placeholder="מה יהיה, למי זה מתאים, מה להביא" />}</Field>
        <div className="r-field">
          <span style={{ fontSize: 16, fontWeight: 700 }}>שאלות לנרשמים</span>
          <span className="r-help">למשל: מגיעים עם ילדים? כמה ובני כמה. עד 10 שאלות.</span>
          {questions.map((q, i) => (
            <div key={q.id} className="r-qrow">
              <input className="r-input" value={q.label} onChange={(e) => setQ(q.id, { label: e.target.value })} placeholder={`שאלה ${i + 1}`} aria-label={`נוסח שאלה ${i + 1}`} maxLength={200} />
              <Tick on={q.required} onChange={(required) => setQ(q.id, { required })}>חובה</Tick>
              <Btn kind="quiet" small onClick={() => setQuestions((qs) => qs.filter((x) => x.id !== q.id))} aria-label={`להסיר שאלה ${i + 1}`}>הסרה</Btn>
            </div>
          ))}
          {show('questions')}
          {questions.length < 10 && <Btn kind="ghost" small style={{ alignSelf: 'flex-start' }} onClick={() => setQuestions((qs) => [...qs, { id: 'q' + Date.now().toString(36), label: '', required: false }])}>להוסיף שאלה</Btn>}
        </div>
        <Tick on={open} onChange={setOpen} help="כשכבוי, אורחים רואים את האירוע אבל לא יכולים להזמין">פתוח להרשמה</Tick>
        <Tick on={published} onChange={setPublished} help={existing?.published ? 'כיבוי מסתיר את דף האירוע מכולם, גם ממי שכבר הזמין. הכרטיסים שלהם נשארים.' : 'מופיע לאורחים באפליקציה ונכנס ליומן המנהלים'}>מפורסם</Tick>
        {tried && firstError && <p className="r-err" role="alert">לפני השמירה: {firstError}</p>}
        {saveErr && <p className="r-err" role="alert">לא נשמר: {saveErr}</p>}
        <Btn type="submit" disabled={busy}>{busy ? 'שומר…' : 'שמירה'}</Btn>
        {existing && <div className="r-field"><Btn kind="danger" onClick={remove} style={{ alignSelf: 'flex-start' }}>מחיקת האירוע</Btn><span className="r-help">הכרטיסים שכבר הוזמנו נשארים רשומים אצל האורחים, אבל דף האירוע ייעלם. אפשר לבטל את המחיקה בשניות הראשונות.</span></div>}
      </Form>
    </>
  );
}

// ---------- one event: shared data and frame ----------
type EventTab = 'hub' | 'guests' | 'entry' | 'vendors' | 'products' | 'tabs' | 'report' | 'files' | 'activity';
const TAB_LABEL: Record<EventTab, string> = { hub: 'מצב האירוע', guests: 'נרשמים', entry: 'כניסה חיה', vendors: 'בעלי דוכנים', products: 'מוצרי הדוכן', tabs: 'חשבונות וחובות', report: 'דוח', files: 'קבצים', activity: 'היסטוריה' };
const TAB_ORDER: EventTab[] = ['hub', 'guests', 'entry', 'vendors', 'products', 'tabs', 'report', 'files', 'activity'];
function useEventData(id: string) {
  const { item: e, loading } = useEvent(id);
  const tickets = useEventTickets(id, true); const tabs = useEventTabs(id, true); const vendors = useEventVendors(id, true); const products = useProducts(id, true);
  useHiddenVersion();
  return { e, loading, tickets: tickets.items, tabs: tabs.items, vendors: vendors.items.filter((v) => !isHidden(`ev:${id}:${v.vendorId}`)), products: products.items.filter((p) => !isHidden(p.id)), stats: statsOf(tickets.items, tabs.items) };
}
type Data = ReturnType<typeof useEventData>;
type Loaded = Data & { e: FarmEvent };
function Frame({ d, id, tab, end, children }: { d: Data; id: string; tab: EventTab; end?: ReactNode; children: (d: Loaded) => ReactNode }) {
  const desktop = useDesktop();
  if (d.loading && !d.e) return <><Head backTo="/manage/events" backLabel="אירועים" title="" /><div className="r-empty">טוען…</div></>;
  if (!d.e) return <><Head backTo="/manage/events" backLabel="אירועים" title="האירוע לא נמצא" /><Empty title="ייתכן שנמחק" /></>;
  const e = d.e; const top = desktop || tab === 'hub';
  const when = `${fmtWeekday(e.start)} ${fmtDate(e.start)} · ${fmtRange(e.start, e.end)}`;
  const counts: Partial<Record<EventTab, number>> = { guests: d.stats.liveOrders.length, vendors: d.vendors.length, products: d.products.length, tabs: d.stats.openTabs };
  return (
    <>
      <Head backTo={top ? '/manage/events' : `/manage/events/${id}`} backLabel={top ? 'כל האירועים' : e.title} title={top ? e.title : TAB_LABEL[tab]} over={top ? when : undefined} end={end} />
      <div className="r-evframe">
        <nav className="r-evnav r-noprint" aria-label="חלקי האירוע">{TAB_ORDER.map((t) => <A key={t} to={t === 'hub' ? `/manage/events/${id}` : `/manage/events/${id}/${t}`} aria-current={t === tab ? 'page' : undefined} keep>{TAB_LABEL[t]}{counts[t] ? <b>{counts[t]}</b> : null}</A>)}</nav>
        <div className="r-evbody">{desktop && tab !== 'hub' && <h2 className="r-evh">{TAB_LABEL[tab]}</h2>}{children(d as Loaded)}</div>
      </div>
    </>
  );
}

// ---------- hub: what this event needs now ----------
export function EventHubScreen({ id, ctx }: { id: string; ctx: TeamCtx }) {
  const d = useEventData(id);
  return <Frame d={d} id={id} tab="hub" end={<A className="r-textlink" to={`/manage/events/${id}/edit`}>עריכה</A>}>{(x) => <Hub d={x} id={id} ctx={ctx} />}</Frame>;
}
function Hub({ d, id, ctx }: { d: Loaded; id: string; ctx: TeamCtx }) {
  const { e, stats: s } = d; const toast = useToast(); const desktop = useDesktop();
  const phase = phaseOf(e); const base = `/manage/events/${id}`;
  const left = e.capacity > 0 ? e.capacity - s.valid.length : null;
  const unanswered = d.vendors.filter((v) => !v.confirmed).length;
  const closeReg = () => saveEvent(ctx.actor, { title: e.title, description: e.description, image: e.image, location: e.location, start: e.start, end: e.end, price: e.price, maxPerOrder: e.maxPerOrder, capacity: e.capacity, open: false, published: e.published, questions: e.questions, files: e.files || [] }, e).then(() => toast({ text: 'ההרשמה נסגרה' }, 2500)).catch((err) => toast({ text: failText(err), kind: 'error' }));
  const share = () => { const url = `${location.origin}/app/events/${id}`; if (navigator.share) navigator.share({ title: e.title, url }).catch(() => {}); else navigator.clipboard?.writeText(url).then(() => toast({ text: 'הקישור הועתק' }, 2500)); };
  const reminder = () => { const t = fillTemplate(ctx.settings.templates.ticketReminder, { 'שם': 'לכולם', 'אירוע': e.title, 'תאריך': fmtDayLong(e.start), 'שעה': fmtTime(e.start) }); navigator.clipboard?.writeText(t).then(() => toast({ text: 'נוסח התזכורת הועתק. מדביקים בקבוצה, או שולחים אישית מרשימת הנרשמים.' }, 5000)).catch(() => toast({ text: 'לא הצלחנו להעתיק', kind: 'error' })); };
  const todo: { k: string; t: string; s?: string; to?: string; label?: string; act?: () => void }[] = [];
  if (phase !== 'after') {
    if (!e.published) todo.push({ k: 'pub', t: 'האירוע עוד טיוטה', s: 'אורחים לא רואים אותו', to: `${base}/edit`, label: 'לפרסום' });
    else if (!e.open && !(left !== null && left <= 0)) todo.push({ k: 'open', t: 'ההרשמה סגורה', s: 'אורחים רואים את האירוע ולא יכולים להזמין', to: `${base}/edit`, label: 'לפתיחה' });
    if (left !== null && left <= 0 && e.open) todo.push({ k: 'full', t: `כל ${e.capacity} המקומות נתפסו`, s: 'ההרשמה עדיין פתוחה, ואפשר להזמין מעבר למה שיש', label: 'לסגור הרשמה', act: closeReg });
    if (s.ticketsClaimed) todo.push({ k: 'claimed', t: `${tickets_(s.ticketsClaimed)}: האורח סימן שהעביר`, s: 'לבדוק בביט ולאשר', to: `${base}/guests`, label: 'לאישור' });
    if (s.ticketsOwed - s.ticketsClaimed > 0) todo.push({ k: 'owed', t: `${tickets_(s.ticketsOwed - s.ticketsClaimed)} לא שולמו`, s: money(sum(s.valid.filter((t) => t.paymentStatus === 'pending').map((t) => t.price))), to: `${base}/guests`, label: 'לרשימה' });
    if (!d.products.length) todo.push({ k: 'prod', t: 'אין מוצרים לדוכן החווה', s: 'אפשר להעתיק מאירוע קודם', to: `${base}/products`, label: 'למוצרים' });
    if (unanswered) todo.push({ k: 'vend', t: `${unanswered} בעלי דוכנים עוד לא ענו`, to: `${base}/vendors`, label: 'לדוכנים' });
  } else {
    if (s.ticketsOwed) todo.push({ k: 'owed', t: `${tickets_(s.ticketsOwed)} שלא שולמו`, s: money(s.ticketOwed), to: `${base}/guests`, label: 'לרשימה' });
    if (s.openTabs) todo.push({ k: 'tabs', t: `${tabs_(s.openTabs)} בדוכן שלא שולמו`, s: money(s.stallOwed), to: `${base}/tabs`, label: 'לחובות' });
  }
  const fact: Record<Exclude<EventTab, 'hub'>, string> = {
    guests: s.valid.length ? `${tickets_(s.valid.length)}, ${orders_(s.liveOrders.length)}` : 'עוד אין נרשמים',
    entry: s.arrived ? `${s.arrived} נכנסו מתוך ${s.valid.length}` : 'מתעדכן ביום האירוע',
    vendors: d.vendors.length ? `${d.vendors.length} מוזמנים, ${d.vendors.length - unanswered} אישרו` : 'עוד לא הוזמנו',
    products: d.products.length ? `${d.products.filter((p) => p.active).length} מוצגים בדוכן` : 'אין עדיין',
    tabs: d.tabs.length ? `${tabs_(d.tabs.length)}${s.openTabs ? `, ${s.openTabs} לא שולמו` : ', הכל שולם'}` : 'נפתחים בדוכן ביום האירוע',
    report: 'מי הגיע, מה התקבל, מה נמכר', files: 'אישורים, מפת הצבה, רשימות', activity: 'מי עשה מה',
  };
  return (
    <>
      <p className="r-evlead">
        <Word tone={e.published ? 'ok' : 'off'}>{e.published ? 'מפורסם' : 'טיוטה'}</Word><span className="r-sep">·</span>
        <Word tone={e.open ? 'ok' : 'off'}>{e.open ? 'פתוח להרשמה' : 'ההרשמה סגורה'}</Word><span className="r-sep">·</span>
        {e.price ? `${money(e.price)} לכרטיס` : 'חינם'}{left !== null && phase !== 'after' && <><span className="r-sep">·</span>{left > 0 ? `נשארו ${left} מקומות` : <Word tone="bad">אין מקומות</Word>}</>}
      </p>
      {phase === 'day' && (
        <section className="r-daybox">
          <div className="r-over">האירוע היום · {fmtRange(e.start, e.end)}</div>
          <h2>{s.arrived} נכנסו מתוך {s.valid.length}</h2>
          <p>{s.openTabs ? `${tabs_(s.openTabs)} פתוחים בדוכן, ${money(s.stallOwed)}` : 'אין חשבונות פתוחים בדוכן'}</p>
          <div className="r-row"><Btn kind="gold" to={`/scan/${id}`}>לסרוק בכניסה</Btn><Btn kind="ghost" to={`/stall/${id}`}>לדוכן</Btn></div>
        </section>
      )}
      {todo.length > 0 ? (
        <section className="r-todo" aria-label={phase === 'after' ? 'נשאר לסגור' : 'מה עוד צריך'}>
          <h2>{phase === 'after' ? 'נשאר לסגור' : 'מה עוד צריך'}</h2>
          {todo.map((x) => <div key={x.k}><span>{x.t}{x.s && <small>{x.s}</small>}</span>{x.to ? <Btn small kind="ghost" to={x.to}>{x.label}</Btn> : <Btn small kind="ghost" onClick={x.act}>{x.label}</Btn>}</div>)}
        </section>
      ) : <section className="r-todo clear"><p>{phase === 'after' ? 'הכל נסגר: אין חובות פתוחים.' : phase === 'day' ? 'אין מה לסדר כרגע.' : 'הכל מוכן לאירוע.'}</p></section>}
      <dl className="r-nums">
        <div><dd>{s.valid.length}</dd><dt>{e.price ? 'כרטיסים' : 'נרשמו'}</dt></div>
        {phase !== 'before' && <div><dd>{s.arrived}</dd><dt>נכנסו</dt></div>}
        {(s.received > 0 || s.owed > 0) && <div><dd>{money(s.received)}</dd><dt>התקבל</dt></div>}
        {(s.received > 0 || s.owed > 0) && <div><dd className={s.owed ? 'bad' : ''}>{money(s.owed)}</dd><dt>עוד לא שולם</dt></div>}
      </dl>
      {!desktop && <div style={{ marginTop: 18 }}>{TAB_ORDER.filter((t) => t !== 'hub').map((t) => <A key={t} className="r-linkrow" to={`${base}/${t}`}><div>{TAB_LABEL[t]} <span>· {fact[t as Exclude<EventTab, 'hub'>]}</span></div><Icon name="chev" /></A>)}</div>}
      <div className="r-actions"><Btn kind="ghost" small onClick={share}>לשתף את דף האירוע</Btn>{phase !== 'after' && s.valid.length > 0 && <Btn kind="ghost" small onClick={reminder}>להעתיק נוסח תזכורת</Btn>}</div>
    </>
  );
}

// ---------- registered ----------
type GuestFilter = 'all' | 'pending' | 'claimed' | 'arrived' | 'cancelled';
type GuestSort = 'name' | 'count' | 'state' | 'created' | 'arrived';
export function EventGuestsScreen({ id, ctx }: { id: string; ctx: TeamCtx }) {
  const d = useEventData(id);
  return <Frame d={d} id={id} tab="guests">{(x) => <Guests d={x} ctx={ctx} />}</Frame>;
}
function Guests({ d, ctx }: { d: Loaded; ctx: TeamCtx }) {
  const { e, stats: s } = d; const desktop = useDesktop(); const toast = useToast();
  const [q, setQ] = useState(''); const [filter, setFilter] = useSticky<GuestFilter>('ev-guests-filter', 'all');
  const [reasonFor, setReasonFor] = useState('');
  const sort = useSortBy<GuestSort>('created', 'desc');
  const match: Record<GuestFilter, (o: Order) => boolean> = { all: (o) => o.state !== 'cancelled', pending: (o) => o.state === 'pending', claimed: (o) => o.state === 'claimed', arrived: (o) => o.arrived > 0, cancelled: (o) => o.state === 'cancelled' };
  const count = (f: GuestFilter) => s.orders.filter(match[f]).length;
  const text = q.trim().toLowerCase(); const qd = digits(q);
  const found = s.orders.filter(match[filter]).filter((o) => !text || o.all.some((t) => t.ownerName.toLowerCase().includes(text) || t.holderName.toLowerCase().includes(text) || (qd.length >= 3 && digits(t.ownerPhone).includes(qd))));
  const rows = desktop ? sort.apply(found, (o, k) => (k === 'name' ? o.head.ownerName : k === 'count' ? o.valid.length : k === 'state' ? ORDER_WORD[o.state] : k === 'arrived' ? o.arrived : o.head.createdAt)) : [...found].sort((a, b) => b.head.createdAt.localeCompare(a.head.createdAt));
  const fail = (err: unknown) => toast({ text: failText(err), kind: 'error' });
  const undo = (o: Order) => ({ label: 'ביטול', onClick: () => { restoreOrder(ctx.actor, o.all).catch(fail); } });
  const pay = (o: Order) => { setOrderPayment(ctx.actor, o.valid.filter((t) => !ticketSettled(t)), 'paid').catch(fail); toast({ text: `שולם: ${o.head.ownerName}, ${money(o.owed)}`, actions: [undo(o)] }, 6000); };
  const cancel = (o: Order, reason: string) => { setReasonFor(''); cancelOrder(ctx.actor, o.valid, reason).catch(fail); toast({ text: `ההזמנה של ${o.head.ownerName} בוטלה`, actions: [undo(o)] }, 6000); };
  const remind = (o: Order) => waLink(o.head.ownerPhone, fillTemplate(ctx.settings.templates.debtReminder, { 'שם': firstName(o.head.ownerName), 'אירוע': e.title, 'סכום': o.owed }));
  const holders = (o: Order) => o.valid.filter((t) => t.holderName && t.holderName !== o.head.ownerName).map((t) => `כרטיס ${t.index}: ${t.holderName}`).join(' · ');
  const answers = (o: Order) => Object.entries(o.head.answers || {}).filter(([, v]) => v).map(([k, v]) => ({ k, label: e.questions.find((x) => x.id === k)?.label || 'תשובה', v }));
  const csv = () => {
    const sorted = [...s.orders].sort((a, b) => Number(a.state === 'cancelled') - Number(b.state === 'cancelled') || a.head.ownerName.localeCompare(b.head.ownerName, 'he'));
    downloadCsv(`${e.title} - נרשמים.csv`, ['מזמין/ה', 'טלפון', 'כרטיס', 'על שם', 'מצב הכרטיס', 'תשלום', 'מחיר', 'הוזמן', 'כניסות', ...e.questions.map((x) => x.label)],
      sorted.flatMap((o) => o.all.map((t) => [cell(t.ownerName), telCell(t.ownerPhone), `${t.index}/${t.total}`, cell(t.holderName || t.ownerName), t.status === 'valid' ? 'תקף' : 'בוטל', t.status === 'valid' ? (ticketPaid(t) ? 'שולם' : t.paymentStatus === 'free' ? 'חינם' : t.paymentStatus === 'claimed' ? 'סימנו שהעבירו' : 'לא שולם') : 'בוטל', t.price, dateFull(t.createdAt), t.entries, ...e.questions.map((x) => cell(String(t.answers?.[x.id] || '')))])));
  };
  const acts = (o: Order) => o.state === 'cancelled' ? null : (
    <>
      {o.state === 'claimed' && <Btn small onClick={() => pay(o)}>לאשר שהתקבל</Btn>}
      {o.state === 'pending' && <Btn small kind="ghost" onClick={() => pay(o)}>לסמן ששולם</Btn>}
      {o.state === 'pending' && o.head.ownerPhone && <a className="r-btn ghost sm" href={remind(o)} target="_blank" rel="noopener">תזכורת בוואטסאפ</a>}
      {o.head.ownerPhone && <a className="r-btn quiet sm" href={telLink(o.head.ownerPhone)}>להתקשר</a>}
      {o.arrived === 0 && reasonFor !== o.id && <Btn small kind="danger" onClick={() => setReasonFor(o.id)}>לבטל הזמנה</Btn>}
    </>
  );
  const filters: { id: GuestFilter; label: string; n?: number }[] = [{ id: 'all', label: 'כולם', n: count('all') }, ...(e.price ? [{ id: 'pending' as GuestFilter, label: 'לא שילמו', n: count('pending') }, { id: 'claimed' as GuestFilter, label: 'סימנו שהעבירו', n: count('claimed') }] : []), { id: 'arrived', label: 'נכנסו', n: count('arrived') }, { id: 'cancelled', label: 'בוטלו', n: count('cancelled') }];
  return (
    <>
      <p className="r-evlead">{s.valid.length ? `${tickets_(s.valid.length)}, ${orders_(s.liveOrders.length)}` : 'עוד אין נרשמים'}{e.price > 0 && s.valid.length > 0 && <> · התקבל {money(s.ticketMoney)}{s.ticketOwed > 0 && <> · <Word tone="bad">עוד לא שולם {money(s.ticketOwed)}</Word></>}</>}</p>
      <div className="r-toolbar2 r-noprint"><input className="r-input" style={{ flex: '1 1 220px' }} type="search" value={q} onChange={(ev) => setQ(ev.target.value)} placeholder="חיפוש: שם או טלפון" aria-label="חיפוש נרשמים" /><Btn kind="ghost" small onClick={csv}>להוריד לאקסל</Btn></div>
      <div style={{ paddingTop: 6 }}><Tabs label="סינון נרשמים" value={filter} onChange={setFilter} items={filters} /></div>
      {!rows.length && <Empty title={text ? 'לא נמצא' : 'אין הזמנות כאלה'}>{text ? 'נסו שם אחר, או חלק ממספר הטלפון.' : ''}</Empty>}
      {desktop ? rows.length > 0 && (
        <table className="r-table">
          <thead><tr>{sort.th('name', 'מי הזמין')}{sort.th('count', 'כרטיסים')}{sort.th('state', 'תשלום')}{sort.th('created', 'הוזמן')}{sort.th('arrived', 'נכנסו')}<th /></tr></thead>
          <tbody>{rows.map((o) => (
            <tr key={o.id} className={o.state === 'cancelled' ? 'dim' : ''}>
              <td><A className="r-t" to={`/manage/people/${o.head.ownerUid}`} style={{ textDecoration: 'underline', textUnderlineOffset: 4 }}>{o.head.ownerName}</A><small className="r-ltr" style={{ textAlign: 'right' }}>{o.head.ownerPhone}</small>{holders(o) && <small>{holders(o)}</small>}{answers(o).map((a) => <small key={a.k}>{a.label}: {a.v}</small>)}</td>
              <td>{o.state === 'cancelled' ? o.all.length : o.valid.length}</td>
              <td><Word tone={ORDER_TONE[o.state]}>{ORDER_WORD[o.state]}</Word>{o.owed > 0 && <> · {money(o.owed)}</>}</td>
              <td>{dateFull(o.head.createdAt)}</td>
              <td>{o.arrived || '—'}</td>
              <td><div className="r-acts">{acts(o)}</div>{reasonFor === o.id && <Reason label="למה מבטלים? נרשם בהיסטוריה" action="לבטל את ההזמנה" onDo={(r) => cancel(o, r)} onCancel={() => setReasonFor('')} />}</td>
            </tr>
          ))}</tbody>
        </table>
      ) : rows.map((o) => (
        <div key={o.id} className={'r-ord' + (o.state === 'cancelled' ? ' dim' : '')}>
          <div className="r-top"><span className="r-t"><A to={`/manage/people/${o.head.ownerUid}`}>{o.head.ownerName}</A> · {tickets_(o.state === 'cancelled' ? o.all.length : o.valid.length)}</span><Word tone={ORDER_TONE[o.state]}>{ORDER_WORD[o.state]}{o.owed > 0 && ` ${money(o.owed)}`}</Word></div>
          <span className="r-m"><span className="r-ltr">{o.head.ownerPhone}</span> · הוזמן {relTime(o.head.createdAt)}{o.arrived > 0 && ` · נכנסו ${o.arrived}`}</span>
          {holders(o) && <span className="r-m">{holders(o)}</span>}
          {answers(o).map((a) => <span key={a.k} className="r-m">{a.label}: {a.v}</span>)}
          {o.state !== 'cancelled' && <div className="r-acts">{acts(o)}</div>}
          {reasonFor === o.id && <Reason label="למה מבטלים? נרשם בהיסטוריה" action="לבטל את ההזמנה" onDo={(r) => cancel(o, r)} onCancel={() => setReasonFor('')} />}
        </div>
      ))}
    </>
  );
}

// ---------- live entry ----------
export function EventEntryScreen({ id }: { id: string; ctx: TeamCtx }) {
  const d = useEventData(id);
  return <Frame d={d} id={id} tab="entry" end={<Btn small to={`/scan/${id}`}>לסרוק</Btn>}>{(x) => <Entry d={x} id={id} />}</Frame>;
}
function Entry({ d, id }: { d: Loaded; id: string }) {
  const { stats: s } = d; const desktop = useDesktop();
  const scans = s.valid.flatMap((t) => t.scans.map((sc, i) => ({ t, at: sc.at, by: sc.by, n: i + 1 }))).sort((a, b) => b.at.localeCompare(a.at));
  const notYet = s.liveOrders.filter((o) => o.arrived === 0);
  const hours = new Map<string, number>();
  for (const x of scans) { const tm = fmtTime(x.at); const h = `${tm.slice(0, 2)}:${Number(tm.slice(3, 5)) < 30 ? '00' : '30'}`; hours.set(h, (hours.get(h) || 0) + 1); }
  const byHour = [...hours.entries()].sort(); const max = Math.max(1, ...byHour.map(([, n]) => n));
  const pct = s.valid.length ? Math.round((s.arrived / s.valid.length) * 100) : 0;
  const last = (
    <section>
      <Sect title="סריקות אחרונות" n={scans.length || undefined} />
      {!scans.length && <Empty title="עוד לא נסרק אף כרטיס">ביום האירוע הצוות סורק מהטלפון, וכאן רואים את זה מיד.</Empty>}
      {scans.slice(0, desktop ? 40 : 20).map((x) => <div key={x.t.id + x.at} className="r-line"><span><span className="r-t">{x.t.holderName || x.t.ownerName} · כרטיס {x.t.index}/{x.t.total}</span><span className="r-m">{fmtTime(x.at)} · סרק/ה {firstName(x.by.name)}{x.n > 1 ? ` · כניסה ${x.n}, יצא/ה וחזר/ה` : ''}{x.t.paymentStatus === 'paid_onsite' ? ' · שולם בשער' : ''}</span></span></div>)}
    </section>
  );
  const rest = (
    <section>
      {byHour.length > 0 && <><Sect title="מתי נכנסו" /><div className="r-bars">{byHour.map(([h, n]) => <div key={h}><span className="r-ltr">{h}</span><i style={{ width: `${(n / max) * 100}%` }} /><b>{n}</b></div>)}</div></>}
      <Sect title="עוד לא הגיעו" n={notYet.length} more={notYet.length > 8 ? 'לכל הרשימה' : undefined} to={`/manage/events/${id}/guests`} />
      {notYet.slice(0, 8).map((o) => <div key={o.id} className="r-line"><span><span className="r-t">{o.head.ownerName} · {tickets_(o.valid.length)}</span></span><span className="r-end"><Word tone={ORDER_TONE[o.state]}>{ORDER_WORD[o.state]}</Word></span></div>)}
      {!notYet.length && s.valid.length > 0 && <p className="r-hint">כולם הגיעו.</p>}
    </section>
  );
  return (
    <>
      <dl className="r-nums">
        <div><dd>{s.arrived}</dd><dt>נכנסו מתוך {s.valid.length} · {pct}%</dt></div>
        <div><dd>{scans.length}</dd><dt>סריקות</dt></div>
        <div><dd>{s.valid.filter((t) => t.entries > 1).length}</dd><dt>יצאו וחזרו</dt></div>
        <div><dd>{s.valid.filter((t) => t.paymentStatus === 'paid_onsite').length}</dd><dt>שילמו בשער</dt></div>
      </dl>
      {desktop ? <div className="r-evcols">{last}{rest}</div> : <>{last}{rest}</>}
    </>
  );
}

// ---------- vendors of this event ----------
const inviteText = (ctx: TeamCtx, v: { name: string }, e: FarmEvent) => fillTemplate(ctx.settings.templates.vendorInvite || 'שלום [שם], נשמח שתגיעו עם דוכן ל־[אירוע] ב־[תאריך] בחוות רווה. מתאים?', { 'שם': v.name, 'אירוע': e.title, 'תאריך': `${fmtWeekday(e.start)} ${fmtDate(e.start)}` });
export function EventVendorsScreen({ id, ctx }: { id: string; ctx: TeamCtx }) {
  const d = useEventData(id);
  return <Frame d={d} id={id} tab="vendors" end={<Btn small to={`/manage/vendors/new?event=${id}`}>בעל דוכן חדש</Btn>}>{(x) => <EventVendors d={x} id={id} ctx={ctx} />}</Frame>;
}
function EventVendors({ d, id, ctx }: { d: Loaded; id: string; ctx: TeamCtx }) {
  const { e } = d; const all = useVendors(true); const toast = useToast();
  const invited = d.vendors; const confirmed = invited.filter((v) => v.confirmed).length;
  const rest = all.items.filter((v) => !invited.some((x) => x.vendorId === v.id));
  const fail = (err: unknown) => toast({ text: failText(err), kind: 'error' });
  const vendorOf = (ev: EventVendor) => all.items.find((v) => v.id === ev.vendorId);
  const mark = (v: Vendor) => { setEventVendor(id, v, false, `הוזמנו ${fmtDate(nowIso())}`).catch(fail); toast({ text: `${v.name} מסומנים כמוזמנים` }, 2500); };
  const confirm = (ev: EventVendor, yes: boolean) => { setEventVendor(id, { id: ev.vendorId, name: ev.name } as Vendor, yes, ev.notes).catch(fail); toast({ text: yes ? `${ev.name} אישרו הגעה` : `${ev.name}: עוד לא ענו` }, 2500); };
  const remove = (ev: EventVendor) => {
    const undo = deferDelete(`ev:${id}:${ev.vendorId}`, () => { removeEventVendor(id, ev.vendorId).catch(() => {}); });
    toast({ text: `${ev.name} הוסרו מהאירוע`, actions: [{ label: 'ביטול', onClick: undo }] }, 6000);
  };
  // the link itself opens WhatsApp (a direct tap, so no browser blocks it); marking "invited" rides on the same tap
  const invite = (v: Vendor, label: string, kind: 'ghost' | 'primary' = 'ghost') => v.phone
    ? <a className={'r-btn sm' + (kind === 'ghost' ? ' ghost' : '')} href={waLink(v.phone, inviteText(ctx, v, e))} target="_blank" rel="noopener" onClick={() => mark(v)}>{label}</a>
    : <Btn small kind="ghost" onClick={() => mark(v)}>לסמן כמוזמנים</Btn>;
  return (
    <>
      <p className="r-evlead">{invited.length} מוזמנים · {confirmed} אישרו{invited.length - confirmed > 0 && <> · <Word tone="wait">{invited.length - confirmed} עוד לא ענו</Word></>}</p>
      <Sect title="מוזמנים לאירוע הזה" n={invited.length} />
      {!invited.length && <Empty title="עוד לא הוזמן אף אחד">בוחרים מהרשימה למטה. ההזמנה נפתחת בוואטסאפ עם הנוסח מההגדרות.</Empty>}
      {invited.map((ev) => { const v = vendorOf(ev); const own = !!v && !v.external; return (
        <div key={ev.vendorId} className="r-ord">
          <div className="r-top"><span className="r-t"><A to={`/manage/vendors/${ev.vendorId}`}>{ev.name}</A>{v?.product ? ` · ${v.product}` : ''}</span><Word tone={own ? 'off' : ev.confirmed ? 'ok' : 'wait'}>{own ? 'של החווה' : ev.confirmed ? 'אישרו' : 'עוד לא ענו'}</Word></div>
          {(v?.phone || ev.notes) && <span className="r-m">{v?.phone && <span className="r-ltr">{v.phone}</span>}{v?.phone && ev.notes ? ' · ' : ''}{ev.notes}</span>}
          <div className="r-acts">
            {own ? <Btn small kind="ghost" to={`/manage/events/${id}/products`}>למוצרי הדוכן</Btn> : ev.confirmed
              ? <>{v?.phone && <a className="r-btn ghost sm" href={waLink(v.phone)} target="_blank" rel="noopener">וואטסאפ</a>}<Btn small kind="quiet" onClick={() => confirm(ev, false)}>לא אישרו בסוף</Btn></>
              : <><Btn small onClick={() => confirm(ev, true)}>אישרו הגעה</Btn>{v && invite(v, 'להזמין שוב')}</>}
            <Btn small kind="danger" onClick={() => remove(ev)}>להסיר מהאירוע</Btn>
          </div>
        </div>
      ); })}
      <Sect title="עוד ברשימה הקבועה" n={rest.length} more="לכל הרשימה" to="/manage/vendors" />
      {rest.map((v) => <div key={v.id} className="r-line"><span><span className="r-t">{v.name}{v.product ? ` · ${v.product}` : ''}</span>{v.phone && <span className="r-m r-ltr">{v.phone}</span>}</span><span className="r-end">{invite(v, 'להזמין בוואטסאפ')}</span></div>)}
      <p className="r-hint" style={{ paddingTop: 16 }}>הכסף של דוכנים חיצוניים לא עובר דרך המערכת.</p>
    </>
  );
}

// ---------- the vendors registry ----------
export function VendorsScreen(_: { ctx: TeamCtx }) {
  const all = useVendors(true); const [q, setQ] = useState(''); const desktop = useDesktop(); useHiddenVersion();
  const text = q.trim().toLowerCase(); const qd = digits(q);
  const list = all.items.filter((v) => !isHidden(v.id)).filter((v) => !text || v.name.toLowerCase().includes(text) || v.product.toLowerCase().includes(text) || (qd.length >= 3 && digits(v.phone).includes(qd)));
  const csv = () => downloadCsv('בעלי דוכנים.csv', ['שם', 'טלפון', 'מה מוכרים', 'של מי', 'הערות'], all.items.map((v) => [cell(v.name), telCell(v.phone), cell(v.product), v.external ? 'חיצוני' : 'של החווה', cell(v.notes)]));
  const go = (v: Vendor) => navigate(`/manage/vendors/${v.id}`);
  return (
    <>
      <Head backTo={desktop ? undefined : '/manage'} backLabel="ניהול" title="בעלי דוכנים" end={<Btn small to="/manage/vendors/new">בעל דוכן חדש</Btn>} />
      <p className="r-hint">הרשימה הקבועה, חוזרת מאירוע לאירוע. את ההזמנה לאירוע עושים מתוך האירוע.</p>
      <div className="r-toolbar2"><input className="r-input" style={{ flex: '1 1 220px' }} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש: שם, מה מוכרים, טלפון" aria-label="חיפוש בעלי דוכנים" /><Btn kind="ghost" small onClick={csv}>להוריד לאקסל</Btn></div>
      {!list.length && !all.loading && <Empty title={text ? 'לא נמצא' : 'הרשימה ריקה'}>{text ? '' : 'מוסיפים בעל דוכן בכפתור למעלה.'}</Empty>}
      {desktop && list.length > 0 ? (
        <table className="r-table"><thead><tr><th>שם</th><th>מה מוכרים</th><th>טלפון</th><th>הערות</th><th /></tr></thead>
          <tbody>{list.map((v) => <tr key={v.id} tabIndex={0} onClick={() => go(v)} onKeyDown={(k) => { if (k.key === 'Enter' && k.target === k.currentTarget) go(v); }}><td><span className="r-t">{v.name}</span>{!v.external && <small>של החווה</small>}</td><td>{v.product}</td><td className="r-ltr">{v.phone}</td><td>{v.notes}</td><td style={{ textAlign: 'end' }}>{v.phone && <a className="r-btn ghost sm" href={waLink(v.phone)} target="_blank" rel="noopener" onClick={(k) => k.stopPropagation()}>וואטסאפ</a>}</td></tr>)}</tbody></table>
      ) : list.map((v) => <A key={v.id} className="r-line" to={`/manage/vendors/${v.id}`}><span><span className="r-t">{v.name}{v.product ? ` · ${v.product}` : ''}</span><span className="r-m">{[!v.external && 'של החווה', v.phone, v.notes].filter(Boolean).join(' · ')}</span></span><Icon name="chev" /></A>)}
    </>
  );
}
export function VendorEditor({ id, ctx: _ctx }: { id?: string; ctx: TeamCtx }) {
  const { item: existing, loading } = useVendor(id || '', !!id);
  const eventId = param('event');
  const backTo = eventId ? `/manage/events/${eventId}/vendors` : '/manage/vendors';
  if (id && loading) return <><Head backTo={backTo} backLabel="ביטול" title="" /><div className="r-empty">טוען…</div></>;
  if (id && !existing) return <><Head backTo={backTo} backLabel="בעלי דוכנים" title="לא נמצא" /><Empty title="ייתכן שהוסר מהרשימה" /></>;
  return <VendorForm key={existing?.id || 'new'} existing={existing || undefined} eventId={eventId} backTo={backTo} />;
}
function VendorForm({ existing, eventId, backTo }: { existing?: Vendor; eventId: string; backTo: string }) {
  const toast = useToast();
  const [f, setF] = useState({ name: existing?.name || '', phone: existing?.phone || '', product: existing?.product || '', external: existing?.external ?? true, notes: existing?.notes || '' });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const saving = useRef(false);
  const submit = async () => {
    if (!f.name.trim()) { setErr('צריך שם'); return; }
    if (saving.current) return; saving.current = true; setBusy(true); setErr('');
    try {
      const data = { ...f, name: f.name.trim(), phone: f.phone.trim(), product: f.product.trim(), notes: f.notes.trim() };
      const vid = await saveVendor(data, existing);
      if (eventId && !existing) await setEventVendor(eventId, { ...data, id: vid, createdAt: '', updatedAt: '' }, false);
      toast({ text: 'נשמר' }, 2000); navigate(backTo, true);
    } catch (e) { setErr(failText(e)); saving.current = false; setBusy(false); }
  };
  const remove = () => {
    if (!existing) return;
    const undo = deferDelete(existing.id, () => { deleteVendor(existing.id).catch(() => {}); });
    toast({ text: `${existing.name} הוסר/ה מהרשימה`, actions: [{ label: 'ביטול', onClick: undo }] }, 6000);
    navigate('/manage/vendors', true);
  };
  return (
    <>
      <Head backTo={backTo} backLabel="ביטול" title={existing ? existing.name : 'בעל דוכן חדש'} />
      <Form onSubmit={submit} className="r-form r-evform">
        <Field label="שם">{(id) => <input id={id} className="r-input big" value={f.name} onChange={(e) => { setF({ ...f, name: e.target.value }); setErr(''); }} maxLength={200} autoComplete="off" />}</Field>
        <Field label="טלפון">{(id) => <input id={id} className="r-input" dir="ltr" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} maxLength={25} />}</Field>
        <Field label="מה מוכרים">{(id) => <input id={id} className="r-input" value={f.product} onChange={(e) => setF({ ...f, product: e.target.value })} maxLength={300} />}</Field>
        <Tick on={f.external} onChange={(external) => setF({ ...f, external })} help="הכסף עובר ישירות למוכר, לא דרך המערכת. לכבות רק לדוכן של החווה.">דוכן חיצוני</Tick>
        <Field label="הערות" help="רק מנהלים רואים">{(id) => <textarea id={id} className="r-input" rows={3} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} maxLength={2000} placeholder="צריכה שולחן וחיבור לחשמל" />}</Field>
        {err && <p className="r-err" role="alert">{err}</p>}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Btn type="submit" disabled={busy} style={{ flex: 1 }}>{busy ? 'שומר…' : 'שמירה'}</Btn>
          {existing?.phone && <a className="r-btn ghost" href={waLink(existing.phone)} target="_blank" rel="noopener">וואטסאפ</a>}
        </div>
        {existing && <Btn kind="danger" onClick={remove} style={{ alignSelf: 'flex-start' }}>להסיר מהרשימה</Btn>}
      </Form>
    </>
  );
}

// ---------- stall products ----------
const soldOf = (tabs: Tab[], pid: string) => tabs.reduce((s, t) => s + t.items.filter((i) => i.productId === pid).reduce((x, i) => x + i.qty, 0), 0);
export function EventProductsScreen({ id, ctx }: { id: string; ctx: TeamCtx }) {
  const d = useEventData(id);
  return <Frame d={d} id={id} tab="products" end={<Btn small to={`/manage/events/${id}/products/new`}>מוצר חדש</Btn>}>{(x) => <Products d={x} id={id} ctx={ctx} />}</Frame>;
}
function Products({ d, id }: { d: Loaded; id: string; ctx: TeamCtx }) {
  const toast = useToast(); const all = useAllEvents(true); const [copying, setCopying] = useState(false);
  const list = [...d.products].sort((a, b) => a.sort - b.sort);
  const fail = (err: unknown) => toast({ text: failText(err), kind: 'error' });
  const move = (i: number, dir: -1 | 1) => { const j = i + dir; if (j < 0 || j >= list.length) return; const next = [...list]; [next[i], next[j]] = [next[j], next[i]]; setProductOrder(id, next).catch(fail); };
  const toggle = (p: Product) => { saveProduct(id, { name: p.name, price: p.price, active: !p.active, sort: p.sort }, p).catch(fail); toast({ text: p.active ? `${p.name} מוסתר מהדוכן` : `${p.name} חזר לדוכן` }, 2500); };
  const others = all.items.filter((e) => e.id !== id).sort((a, b) => b.start.localeCompare(a.start)).slice(0, 8);
  return (
    <>
      <p className="r-evlead">מה שהצוות רושם לחשבון של אורח בדוכן החווה. הסדר כאן הוא הסדר בטלפון של הצוות.</p>
      {!list.length && <Empty title="אין מוצרים לאירוע הזה">מוסיפים מוצר, או מעתיקים את הרשימה מאירוע קודם.</Empty>}
      {list.map((p, i) => (
        <div key={p.id} className={'r-prod' + (p.active ? '' : ' dim')}>
          <div className="r-move"><button type="button" className="up" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`להעלות את ${p.name}`}><Icon name="down" /></button><button type="button" disabled={i === list.length - 1} onClick={() => move(i, 1)} aria-label={`להוריד את ${p.name}`}><Icon name="down" /></button></div>
          <A to={`/manage/events/${id}/products/${p.id}`}><span className="r-t">{p.name}</span><span className="r-m">{!p.active && 'מוסתר · '}{soldOf(d.tabs, p.id) ? `נמכרו ${soldOf(d.tabs, p.id)}` : 'עריכה'}</span></A>
          <span className="r-sum-n">{money(p.price)}</span>
          <Btn small kind="quiet" onClick={() => toggle(p)}>{p.active ? 'להסתיר' : 'להציג'}</Btn>
        </div>
      ))}
      <div className="r-actions"><Btn kind="ghost" small onClick={() => setCopying(!copying)}>{copying ? 'לסגור' : 'להעתיק מאירוע אחר'}</Btn></div>
      {copying && <>
        <Sect title="מאיזה אירוע להעתיק?" />
        <p className="r-hint">המוצרים יתווספו לסוף הרשימה כאן. המחירים נשמרים, ואפשר לשנות אחר כך.</p>
        {others.map((e) => <CopyRow key={e.id} e={e} onCopy={(prods) => copyProducts(e.id, id, prods, Math.max(0, ...list.map((p) => p.sort))).then(() => { setCopying(false); toast({ text: `הועתקו ${prods.length} מוצרים מ${e.title}` }, 3000); }).catch(fail)} />)}
      </>}
    </>
  );
}
function CopyRow({ e, onCopy }: { e: FarmEvent; onCopy: (p: Product[]) => void }) {
  const prods = useProducts(e.id, true);
  if (!prods.items.length) return null;
  return <div className="r-line"><span><span className="r-t">{e.title}</span><span className="r-m">{dateFull(e.start)} · {prods.items.length} מוצרים</span></span><span className="r-end"><Btn small kind="ghost" onClick={() => onCopy(prods.items)}>להעתיק</Btn></span></div>;
}
export function ProductEditor({ eventId, pid, ctx: _ctx }: { eventId: string; pid?: string; ctx: TeamCtx }) {
  const { item: e } = useEvent(eventId); const products = useProducts(eventId, true); const tabs = useEventTabs(eventId, !!pid);
  const backTo = `/manage/events/${eventId}/products`;
  const existing = products.items.find((p) => p.id === pid);
  if (products.loading) return <><Head backTo={backTo} backLabel="ביטול" title="" /><div className="r-empty">טוען…</div></>;
  if (pid && !existing) return <><Head backTo={backTo} backLabel="מוצרים" title="המוצר לא נמצא" /><Empty title="ייתכן שנמחק" /></>;
  return <ProductForm key={existing?.id || 'new'} eventId={eventId} existing={existing} nextSort={Math.max(0, ...products.items.map((p) => p.sort)) + 1} sold={existing ? soldOf(tabs.items, existing.id) : 0} eventTitle={e?.title || ''} backTo={backTo} />;
}
function ProductForm({ eventId, existing, nextSort, sold, eventTitle, backTo }: { eventId: string; existing?: Product; nextSort: number; sold: number; eventTitle: string; backTo: string }) {
  const toast = useToast();
  const [name, setName] = useState(existing?.name || ''); const [price, setPrice] = useState(existing ? String(existing.price) : '');
  const [active, setActive] = useState(existing?.active ?? true);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const saving = useRef(false);
  const submit = async () => {
    const p = num(price);
    if (!name.trim()) { setErr('צריך שם למוצר'); return; }
    if (price.trim() === '' || !Number.isFinite(p) || p < 0) { setErr('המחיר הוא מספר, למשל 12 או 12.5'); return; }
    if (saving.current) return; saving.current = true; setBusy(true); setErr('');
    try { await saveProduct(eventId, { name: name.trim(), price: Math.round(p * 100) / 100, active, sort: existing?.sort ?? nextSort }, existing); toast({ text: 'נשמר' }, 2000); navigate(backTo, true); }
    catch (e) { setErr(failText(e)); saving.current = false; setBusy(false); }
  };
  const remove = () => {
    if (!existing) return;
    const undo = deferDelete(existing.id, () => { deleteProduct(eventId, existing.id).catch(() => {}); });
    toast({ text: `נמחק: ${existing.name}`, actions: [{ label: 'ביטול', onClick: undo }] }, 6000);
    navigate(backTo, true);
  };
  return (
    <>
      <Head backTo={backTo} backLabel="ביטול" title={existing ? existing.name : 'מוצר חדש'} over={eventTitle ? `דוכן החווה · ${eventTitle}` : undefined} />
      <Form onSubmit={submit} className="r-form r-evform">
        <Field label="שם המוצר">{(id) => <input id={id} className="r-input big" value={name} onChange={(e) => { setName(e.target.value); setErr(''); }} maxLength={200} autoComplete="off" />}</Field>
        <Field label="מחיר, בשקלים" help="אפשר גם אגורות: 12.5">{(id) => <input id={id} className="r-input" dir="ltr" inputMode="decimal" style={{ maxWidth: 200 }} value={price} onChange={(e) => { setPrice(e.target.value); setErr(''); }} />}</Field>
        <Tick on={active} onChange={setActive} help="לכבות כשנגמר המלאי, בלי למחוק">מוצג בדוכן</Tick>
        {existing && sold > 0 && <p style={{ fontSize: 16 }}>באירוע הזה נמכרו {sold} יחידות.</p>}
        {err && <p className="r-err" role="alert">{err}</p>}
        <Btn type="submit" disabled={busy}>{busy ? 'שומר…' : 'שמירה'}</Btn>
        {existing && <Btn kind="danger" onClick={remove} style={{ alignSelf: 'flex-start' }}>מחיקת המוצר</Btn>}
      </Form>
    </>
  );
}

// ---------- tabs and debts ----------
type TabFilter = 'all' | 'open' | 'claimed' | 'paid' | 'waived';
const itemsLine = (t: Tab) => t.items.map((i) => i.name + (i.qty > 1 ? ` ×${i.qty}` : '')).join(' · ');
const daysOpen = (t: Tab) => Math.max(0, Math.round((Date.now() - new Date(t.createdAt).getTime()) / 86400_000));
const tabReminder = (ctx: TeamCtx, t: Tab) => waLink(t.guestPhone, fillTemplate(ctx.settings.templates.debtReminder, { 'שם': firstName(t.guestName), 'אירוע': t.eventTitle, 'סכום': t.total }));
export function EventTabsScreen({ id, ctx }: { id: string; ctx: TeamCtx }) {
  const d = useEventData(id);
  return <Frame d={d} id={id} tab="tabs">{(x) => <TabsList d={x} id={id} ctx={ctx} />}</Frame>;
}
function TabsList({ d, id, ctx }: { d: Loaded; id: string; ctx: TeamCtx }) {
  const { e, stats: s } = d; const desktop = useDesktop(); const toast = useToast();
  const [filter, setFilter] = useSticky<TabFilter>('ev-tabs-filter', 'all'); const [reasonFor, setReasonFor] = useState('');
  const n = (f: TabFilter) => d.tabs.filter((t) => f === 'all' || t.status === f).length;
  const list = d.tabs.filter((t) => filter === 'all' || t.status === filter).sort((a, b) => Number(tabOpen(b)) - Number(tabOpen(a)) || b.updatedAt.localeCompare(a.updatedAt));
  const fail = (err: unknown) => toast({ text: failText(err), kind: 'error' });
  const set = (t: Tab, st: Tab['status'], note = '') => { setReasonFor(''); setTabStatus(ctx.actor, t, st, note).catch(fail); toast({ text: `${t.guestName}: ${TAB_WORD[st]}, ${money(t.total)}`, actions: [{ label: 'ביטול', onClick: () => { setTabStatus(ctx.actor, t, t.status).catch(fail); } }] }, 6000); };
  const csv = () => downloadCsv(`${e.title} - חשבונות דוכן.csv`, ['מי', 'טלפון', 'פריטים', 'סכום', 'מצב', 'נפתח', 'עדכון אחרון'], d.tabs.map((t) => [cell(t.guestName), telCell(t.guestPhone), cell(itemsLine(t)), t.total, TAB_WORD[t.status], dateFull(t.createdAt), dateFull(t.updatedAt)]));
  const state = (t: Tab) => <Word tone={TAB_TONE[t.status]}>{TAB_WORD[t.status]}{t.status === 'open' && daysOpen(t) > 0 ? ` · ${daysOpen(t)} ימים` : ''}</Word>;
  const acts = (t: Tab) => !tabOpen(t) ? null : (
    <>
      <Btn small kind={t.status === 'claimed' ? 'primary' : 'ghost'} onClick={() => set(t, 'paid')}>{t.status === 'claimed' ? 'לאשר שהתקבל' : 'לסמן ששולם'}</Btn>
      {t.status === 'open' && t.guestPhone && <a className="r-btn ghost sm" href={tabReminder(ctx, t)} target="_blank" rel="noopener">תזכורת בוואטסאפ</a>}
      {reasonFor !== t.id && <Btn small kind="quiet" onClick={() => setReasonFor(t.id)}>למחול</Btn>}
    </>
  );
  const reason = (t: Tab) => reasonFor === t.id && <Reason label="למה מוחלים? לא חובה" action="למחול על החוב" onDo={(r) => set(t, 'waived', r)} onCancel={() => setReasonFor('')} />;
  return (
    <>
      <p className="r-evlead">דוכן החווה, על בסיס אמון: לוקחים עכשיו ומשלמים בסוף או מהבית.</p>
      <dl className="r-nums">
        <div><dd>{d.tabs.length}</dd><dt>{d.tabs.length === 1 ? 'חשבון' : 'חשבונות'}</dt></div>
        <div><dd>{money(s.stallPaid)}</dd><dt>התקבל</dt></div>
        <div><dd className={s.stallOwed ? 'bad' : ''}>{money(s.stallOwed)}</dd><dt>עוד לא שולם · {s.openTabs}</dt></div>
        {s.stallWaived > 0 && <div><dd>{money(s.stallWaived)}</dd><dt>נמחל</dt></div>}
      </dl>
      <div className="r-toolbar2 r-noprint"><Btn kind="ghost" small onClick={csv}>להוריד לאקסל</Btn></div>
      <Tabs label="סינון חשבונות" value={filter} onChange={setFilter} items={[{ id: 'all', label: 'הכל', n: n('all') }, { id: 'open', label: 'לא שולמו', n: n('open') }, { id: 'claimed', label: 'סימנו שהעבירו', n: n('claimed') }, { id: 'paid', label: 'שולמו', n: n('paid') }, { id: 'waived', label: 'נמחלו', n: n('waived') }]} />
      {!list.length && <Empty title="אין חשבונות כאלה">חשבון נפתח בדוכן ביום האירוע.</Empty>}
      {desktop && list.length > 0 ? (
        <table className="r-table"><thead><tr><th>מי</th><th>מה לקחו</th><th>סכום</th><th>מצב</th><th>עדכון אחרון</th><th /></tr></thead>
          <tbody>{list.map((t) => <tr key={t.id}><td><A className="r-t" to={`/manage/events/${id}/tabs/${t.id}`} style={{ textDecoration: 'underline', textUnderlineOffset: 4 }}>{t.guestName}</A>{!t.guestUid && <small>לקוח מזדמן</small>}</td><td>{t.items.length > 4 ? `${t.items.length} שורות` : itemsLine(t)}</td><td className="r-sum-n">{money(t.total)}</td><td>{state(t)}</td><td>{relTime(t.updatedAt)}</td><td><div className="r-acts">{acts(t)}</div>{reason(t)}</td></tr>)}</tbody></table>
      ) : list.map((t) => (
        <div key={t.id} className="r-ord">
          <div className="r-top"><span className="r-t"><A to={`/manage/events/${id}/tabs/${t.id}`}>{t.guestName}</A> · <span className="r-sum-n">{money(t.total)}</span></span>{state(t)}</div>
          <span className="r-m">{itemsLine(t) || 'בלי פריטים'}</span>
          {tabOpen(t) && <div className="r-acts">{acts(t)}</div>}
          {reason(t)}
        </div>
      ))}
    </>
  );
}
export function TabDetailScreen({ eventId, tid, ctx }: { eventId: string; tid: string; ctx: TeamCtx }) {
  const { item: t, loading } = useTab(tid);
  const backTo = `/manage/events/${eventId}/tabs`;
  if (loading) return <><Head backTo={backTo} backLabel="חשבונות" title="" /><div className="r-empty">טוען…</div></>;
  if (!t) return <><Head backTo={backTo} backLabel="חשבונות" title="החשבון לא נמצא" /><Empty title="ייתכן שנמחק" /></>;
  return <TabDetail t={t} ctx={ctx} backTo={backTo} />;
}
function TabDetail({ t, ctx, backTo }: { t: Tab; ctx: TeamCtx; backTo: string }) {
  const toast = useToast(); const log = useActivityFor('tab', t.id); const [waiving, setWaiving] = useState(false);
  const fail = (err: unknown) => toast({ text: failText(err), kind: 'error' });
  const set = (st: Tab['status'], note = '') => { setWaiving(false); setTabStatus(ctx.actor, t, st, note).catch(fail); toast({ text: `${TAB_WORD[st]}: ${money(t.total)}`, actions: [{ label: 'ביטול', onClick: () => { setTabStatus(ctx.actor, t, t.status).catch(fail); } }] }, 6000); };
  const removeLine = (i: number) => { const item = t.items[i]; removeTabItem(ctx.actor, t, i).catch(fail); toast({ text: `הוסר: ${item.name}`, actions: [{ label: 'ביטול', onClick: () => { addTabItems(ctx.actor, t, [item]).catch(fail); } }] }, 6000); };
  return (
    <>
      <Head backTo={backTo} backLabel="חשבונות" title={t.guestName} over={`${t.eventTitle} · נפתח ${whenText(t.createdAt)} על ידי ${firstName(t.createdBy.name)}`} />
      <div className="r-bigsum"><b>{money(t.total)}</b><span><Word tone={TAB_TONE[t.status]}>{TAB_WORD[t.status]}</Word>{t.status === 'open' && daysOpen(t) > 0 ? `, כבר ${daysOpen(t)} ימים` : ''}</span></div>
      <Sect title="מה לקחו" n={t.items.length} />
      {!t.items.length && <Empty title="החשבון ריק" />}
      {t.items.map((i, idx) => <div key={i.at + idx} className="r-line"><span><span className="r-t">{i.name}{i.qty > 1 ? ` ×${i.qty}` : ''}</span><span className="r-m">{fmtTime(i.at)} · רשם/ה {firstName(i.by.name)}</span></span><span className="r-end"><span className="r-sum-n">{money(i.price * i.qty)}</span>{tabOpen(t) && <Btn small kind="quiet" onClick={() => removeLine(idx)} aria-label={`להסיר ${i.name}`}>הסרה</Btn>}</span></div>)}
      <div className="r-actions">
        {tabOpen(t) && <Btn onClick={() => set('paid')}>{t.status === 'claimed' ? 'לאשר שהתקבל' : 'לסמן ששולם'}</Btn>}
        {tabOpen(t) && t.guestPhone && <a className="r-btn ghost" href={tabReminder(ctx, t)} target="_blank" rel="noopener">תזכורת בוואטסאפ</a>}
        {t.guestPhone && <a className="r-btn quiet" href={telLink(t.guestPhone)}>להתקשר</a>}
        {t.guestUid && <Btn kind="quiet" to={`/manage/people/${t.guestUid}`}>לתיק של {firstName(t.guestName)}</Btn>}
        {tabOpen(t) && !waiving && <Btn kind="quiet" onClick={() => setWaiving(true)}>למחול על החוב</Btn>}
        {!tabOpen(t) && <Btn kind="quiet" onClick={() => set('open')}>להחזיר ל״לא שולם״</Btn>}
      </div>
      {waiving && <div style={{ padding: '0 20px' }}><Reason label="למה מוחלים? לא חובה" action="למחול על החוב" onDo={(r) => set('waived', r)} onCancel={() => setWaiving(false)} /></div>}
      {log.items.length > 0 && <><Sect title="מה קרה כאן" /><ul className="r-log">{log.items.map((a) => <li key={a.id}>{ACTION_LABELS[a.action] || a.action} · {firstName(a.by.name)}<span>{whenText(a.at)}</span></li>)}</ul></>}
    </>
  );
}

// ---------- report ----------
export function EventReportScreen({ id, ctx }: { id: string; ctx: TeamCtx }) {
  const d = useEventData(id);
  return <Frame d={d} id={id} tab="report">{(x) => <Report d={x} id={id} ctx={ctx} />}</Frame>;
}
function Report({ d, id }: { d: Loaded; id: string; ctx: TeamCtx }) {
  const { e, stats: s } = d; const donations = useDonations(true);
  const day = dateKey(new Date(e.start));
  const dayDon = donations.items.filter((x) => dateKey(new Date(x.createdAt)) === day);
  const donPaid = sum(dayDon.filter((x) => x.paymentStatus === 'paid').map((x) => x.amount));
  const donOwed = sum(dayDon.filter((x) => x.paymentStatus === 'pending' || x.paymentStatus === 'claimed').map((x) => x.amount));
  const sold = new Map<string, { name: string; units: number; rev: number }>();
  for (const t of d.tabs) if (t.status !== 'waived') for (const i of t.items) { const c = sold.get(i.productId) || { name: i.name, units: 0, rev: 0 }; c.units += i.qty; c.rev = sum([c.rev, i.qty * i.price]); sold.set(i.productId, c); }
  const top = [...sold.values()].sort((a, b) => b.units - a.units);
  const pct = s.valid.length ? Math.round((s.arrived / s.valid.length) * 100) : 0;
  const total = { got: s.received, owed: s.owed }; // the same two numbers the event's main page shows
  const csv = () => downloadCsv(`${e.title} - דוח.csv`, ['שורה', 'התקבל ₪', 'עוד לא שולם ₪', 'נמחל ₪'], [
    ['כרטיסים', s.ticketMoney, s.ticketOwed, 0], ['דוכן החווה', s.stallPaid, s.stallOwed, s.stallWaived], ['סך הכל', total.got, total.owed, s.stallWaived], ['בנוסף: תרומות ביום האירוע', donPaid, donOwed, 0],
    ['כרטיסים שהוזמנו', s.valid.length, '', ''], ['נכנסו', s.arrived, '', ''], ['אחוז הגעה', pct + '%', '', ''], ...top.map((t) => [cell(t.name), `${t.units} יחידות`, t.rev, ''] as (string | number)[]),
  ]);
  return (
    <>
      <p className="r-evlead">{fmtDayLong(e.start)}{phaseOf(e) === 'after' ? ' · הסתיים' : phaseOf(e) === 'day' ? ' · מתעדכן עכשיו' : ' · עוד לא התקיים'}</p>
      <div className="r-toolbar2 r-noprint"><Btn kind="ghost" small onClick={csv}>להוריד לאקסל</Btn><Btn kind="ghost" small onClick={() => window.print()}>להדפיס</Btn></div>
      <dl className="r-nums">
        <div><dd>{s.valid.length}</dd><dt>כרטיסים</dt></div>
        <div><dd>{s.arrived}</dd><dt>נכנסו · {pct}%</dt></div>
        <div><dd>{s.valid.filter((t) => t.entries > 1).length}</dd><dt>יצאו וחזרו</dt></div>
      </dl>
      <Sect title="כסף" />
      <table className="r-sum">
        <thead><tr><th>מאיפה</th><th className="n">התקבל</th><th className="n">עוד לא שולם</th><th className="n">נמחל</th></tr></thead>
        <tbody>
          <tr><td>כרטיסים<small>{s.ticketsPaid} שולמו{s.ticketsFree ? ` · ${s.ticketsFree} חינם` : ''}{s.ticketsOwed ? ` · ${s.ticketsOwed} לא שולמו` : ''}</small></td><td className="n">{money(s.ticketMoney)}</td><td className={'n' + (s.ticketOwed ? ' bad' : '')}>{money(s.ticketOwed)}</td><td className="n">—</td></tr>
          <tr><td><A to={`/manage/events/${id}/tabs`} style={{ textDecoration: 'underline', textUnderlineOffset: 4 }}>דוכן החווה</A><small>{tabs_(d.tabs.length)}{s.openTabs ? ` · ${s.openTabs} לא שולמו` : ''}</small></td><td className="n">{money(s.stallPaid)}</td><td className={'n' + (s.stallOwed ? ' bad' : '')}>{money(s.stallOwed)}</td><td className="n">{s.stallWaived ? money(s.stallWaived) : '—'}</td></tr>
          <tr className="total"><td>סך הכל</td><td className="n">{money(total.got)}</td><td className={'n' + (total.owed ? ' bad' : '')}>{money(total.owed)}</td><td className="n">{s.stallWaived ? money(s.stallWaived) : '—'}</td></tr>
        </tbody>
      </table>
      {dayDon.length > 0 && <p className="r-hint" style={{ paddingTop: 14, fontSize: 16, color: 'var(--r-ink)' }}>בנוסף, ביום האירוע נרשמו {dayDon.length === 1 ? 'תרומה אחת' : `${dayDon.length} תרומות`}: התקבלו {money(donPaid)}{donOwed > 0 && `, ועוד ${money(donOwed)} שלא אושרו`}. הן נספרות במסך התרומות, לא כאן.</p>}
      {top.length > 0 && <>
        <Sect title="מה נמכר בדוכן" />
        <table className="r-sum"><thead><tr><th>מוצר</th><th className="n">יחידות</th><th className="n">סכום</th></tr></thead><tbody>{top.map((t) => <tr key={t.name}><td>{t.name}</td><td className="n">{t.units}</td><td className="n">{money(t.rev)}</td></tr>)}</tbody></table>
      </>}
      {donations.items.length >= 500 && <p className="r-hint" style={{ paddingTop: 14 }}>שורת התרומות מחושבת מ־500 התרומות האחרונות בלבד.</p>}
    </>
  );
}

// ---------- files: links only, managers only ----------
export function EventFilesScreen({ id, ctx }: { id: string; ctx: TeamCtx }) {
  const d = useEventData(id);
  return <Frame d={d} id={id} tab="files">{(x) => <Files d={x} id={id} ctx={ctx} />}</Frame>;
}
function Files({ d, id, ctx }: { d: Loaded; id: string; ctx: TeamCtx }) {
  const { e } = d; const toast = useToast(); const files = useEventFiles(id, true); useHiddenVersion();
  const [name, setName] = useState(''); const [url, setUrl] = useState(''); const [kind, setKind] = useState<EventFile['kind']>('doc'); const [err, setErr] = useState('');
  const moved = useRef(false);
  // older events kept these links inside the event document, which guests can read: move them out the first time a manager opens this page
  useEffect(() => { if (!moved.current && e.files?.length) { moved.current = true; migrateEventFiles(ctx.actor, e).catch(() => { moved.current = false; }); } }, [e.files?.length]);
  const list = files.items.filter((f) => !isHidden(f.id)).sort((a, b) => b.at.localeCompare(a.at));
  const add = async () => {
    const n = name.trim(); const u = /^https:\/\//i.test(url.trim()) ? url.trim() : url.trim() ? 'https://' + url.trim().replace(/^http:\/\//i, '') : '';
    if (!n) { setErr('צריך שם לקובץ'); return; }
    if (!u || !/^https:\/\/[^\s]+\.[^\s]+/.test(u)) { setErr('צריך קישור, למשל מ־Google Drive'); return; }
    setErr(''); setName(''); setUrl('');
    try { await addEventFile(id, { name: n, url: u, kind, by: ctx.actor, at: nowIso() }); toast({ text: `נוסף: ${n}` }, 2500); } catch (x) { setName(n); setUrl(u); setErr(failText(x)); }
  };
  const remove = (f: { id: string; name: string }) => { const undo = deferDelete(f.id, () => { removeEventFile(id, f.id).catch(() => {}); }); toast({ text: `הוסר: ${f.name}`, actions: [{ label: 'ביטול', onClick: undo }] }, 6000); };
  return (
    <>
      <p className="r-evlead">אישורים, מפת הצבה, רשימות. הקבצים עצמם נשארים ב־Google Drive, וכאן שומרים את הקישור. רק מנהלים רואים את הרשימה הזו.</p>
      {(['doc', 'image'] as const).map((k) => { const g = list.filter((f) => f.kind === k); return (
        <section key={k}>
          <Sect title={k === 'doc' ? 'מסמכים' : 'תמונות'} n={g.length} />
          {!g.length && <p className="r-hint">אין עדיין.</p>}
          {g.map((f) => <div key={f.id} className="r-line"><span><a className="r-t" href={f.url} target="_blank" rel="noopener" style={{ textDecoration: 'underline', textUnderlineOffset: 4 }}>{f.name}</a><span className="r-m">הוסיף/ה {firstName(f.by.name)} · {dateFull(f.at)}</span></span><span className="r-end"><Btn small kind="quiet" onClick={() => remove(f)} aria-label={`להסיר את ${f.name}`}>הסרה</Btn></span></div>)}
        </section>
      ); })}
      <Sect title="להוסיף קישור" />
      <Form onSubmit={add} className="r-form r-evform">
        <Field label="איך לקרוא לקובץ">{(fid) => <input id={fid} className="r-input" value={name} onChange={(ev) => { setName(ev.target.value); setErr(''); }} maxLength={200} placeholder="אישור משטרה, מפת הצבה" />}</Field>
        <Field label="הקישור">{(fid) => <input id={fid} className="r-input" dir="ltr" inputMode="url" value={url} onChange={(ev) => { setUrl(ev.target.value); setErr(''); }} maxLength={2000} placeholder="https://drive.google.com/…" />}</Field>
        <Seg label="מה זה" value={kind} onChange={setKind} options={[{ value: 'doc', label: 'מסמך' }, { value: 'image', label: 'תמונה' }]} />
        {err && <p className="r-err" role="alert">{err}</p>}
        <Btn type="submit">הוספה</Btn>
      </Form>
    </>
  );
}

// ---------- history ----------
type ActFilter = 'main' | 'stall' | 'edits' | 'scans' | 'all';
export function EventActivityScreen({ id, ctx }: { id: string; ctx: TeamCtx }) {
  const d = useEventData(id);
  return <Frame d={d} id={id} tab="activity">{() => <EventActivity id={id} ctx={ctx} />}</Frame>;
}
function EventActivity({ id }: { id: string; ctx: TeamCtx }) {
  const acts = useActivityForEvent(id, true);
  const [filter, setFilter] = useSticky<ActFilter>('ev-activity-filter', 'main');
  // scans are the bulk of an event day; they get their own tab so that orders and payments stay readable
  const match: Record<ActFilter, (a: Activity) => boolean> = { main: (a) => a.kind === 'ticket' && a.action !== 'scanned', stall: (a) => a.kind === 'tab', edits: (a) => a.kind === 'event', scans: (a) => a.action === 'scanned', all: () => true };
  const list = acts.items.filter(match[filter]);
  const days = new Map<string, Activity[]>();
  for (const a of list) { const k = dateKey(new Date(a.at)); days.set(k, [...(days.get(k) || []), a]); }
  return (
    <>
      <Tabs label="סוג הפעולה" value={filter} onChange={setFilter} items={[{ id: 'main', label: 'הזמנות ותשלומים' }, { id: 'stall', label: 'דוכן' }, { id: 'edits', label: 'עריכות' }, { id: 'scans', label: 'סריקות' }, { id: 'all', label: 'הכל' }]} />
      {acts.loading ? <div className="r-empty">טוען…</div> : !list.length && <Empty title="אין מה להציג" />}
      {[...days.entries()].map(([day, items]) => (
        <section key={day}>
          <Sect title={dayLabel(day)} n={items.length} />
          {items.map((a) => <div key={a.id} className="r-line"><span><span className="r-t" style={{ fontSize: 17 }}>{ACTION_LABELS[a.action] || a.action}: {a.text}</span><span className="r-m">{fmtTime(a.at)} · {firstName(a.by.name)} · {KIND_LABELS[a.kind]}</span></span></div>)}
        </section>
      ))}
      {acts.items.length >= 200 && <p className="r-hint" style={{ paddingTop: 14 }}>מוצגות 200 הפעולות האחרונות של האירוע. להיסטוריה מלאה: ״כל הפעילות״ במסך הניהול.</p>}
    </>
  );
}
