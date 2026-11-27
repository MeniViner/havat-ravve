// Events area: pure helpers (no data access), shared by the screens and tests/v2-events.mjs.
import { isFemale as sharedIsFemale } from '../../gender';
import { registeredTickets } from '../manage/calc';
// Numbers here are what the screens show: summary sums (M7), debts (V5, M3, M7), guests (M5), staffing (V4, M4), live (M6).
import type { Activity, FarmEvent, Profile, Ticket, Tab, TabItem, Staffing, CalendarItem, GateScan, Debt, PaymentStatus } from '../../../types';
import { MONTHS, dayName, ddmm, hhmm, inDays, money, firstName, keyOf } from '../../format';

const TZ = 'Asia/Jerusalem';

// ---------- event phase and header ----------
export type Phase = 'before' | 'during' | 'after';
/** Before the start, between start and end, after the end (or closed). */
export function phaseOf(e: Pick<FarmEvent, 'start' | 'end'> & { closed?: unknown }, now: number): Phase {
  const end = eventMillis(e.end);
  if (e.closed || !(end > now)) return 'after';
  if (now < eventMillis(e.start)) return 'before';
  if (now < end) return 'during';
  return 'after';
}
export type EventTab = 'prep' | 'guests' | 'day' | 'summary';
export const EVENT_TABS: { value: EventTab; label: string }[] = [
  { value: 'prep', label: 'הכנה' }, { value: 'guests', label: 'נרשמים' }, { value: 'day', label: 'יום האירוע' }, { value: 'summary', label: 'סיכום' },
];
/** The tab an event opens on: the event day while it runs (or later today), the summary after it, otherwise preparation. */
export function defaultTab(e: Pick<FarmEvent, 'start' | 'end'> & { closed?: unknown }, now: number, today: string): EventTab {
  const p = phaseOf(e, now);
  if (p === 'after') return 'summary';
  if (p === 'during' || keyOf(e.start) === today) return 'day';
  return 'prep';
}
/** M4 "שבת 28.11 · 16:00–21:00 · בעוד 9 ימים", M6 "שבת 28.11 · קורה עכשיו · 17:20", M7 "ראשון 26.10 · הסתיים". */
export function eventSubtitle(e: Pick<FarmEvent, 'start' | 'end'> & { closed?: unknown }, now: number): string {
  const day = `${dayName(e.start)} ${ddmm(e.start)}`;
  const p = phaseOf(e, now);
  if (p === 'during') return `${day} · קורה עכשיו · ${hhmm(new Date(now))}`;
  if (p === 'after') return `${day} · הסתיים`;
  return `${day} · ${hhmm(e.start)}–${hhmm(e.end)} · ${inDays(e.start)}`;
}
/** "נוב׳", "דצמ׳", "אוק׳" for the date box. */
export function monthShort(v: string): string {
  const m = MONTHS[Number(ddmm(v).split('.')[1]) - 1] || '';
  return m.length <= 4 ? m : `${m.slice(0, 3)}׳`;
}
export const dayOfMonth = (v: string) => Number(ddmm(v).split('.')[0]);

// ---------- local date and time <-> ISO (Israel time, summer time included) ----------
function wall(ms: number) {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms));
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value || 0);
  return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'));
}
/** "2026-11-28" + "16:00" (Israel) -> ISO instant. */
export function isoFromLocal(dateKey: string, time: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const target = Date.UTC(y, m - 1, d, h, mi);
  let ms = target - 2 * 3600_000;
  for (let i = 0; i < 2; i++) ms += target - wall(ms);
  return new Date(ms).toISOString();
}
/**
 * Event timestamps without a zone were entered in Israeli local time.
 * Missing or impossible cutoff dates never authorize new registrations.
 */
export function eventMillis(value: string): number {
  if (typeof value !== 'string') return NaN;
  const parts = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})?$/i.exec(value);
  if (!parts) return NaN;
  const [, date, time, seconds = '00', fraction = '', zone] = parts;
  const wallTime = Date.parse(date + 'T' + time + ':' + seconds + 'Z');
  if (!Number.isFinite(wallTime) || new Date(wallTime).toISOString().slice(0, 19) !== date + 'T' + time + ':' + seconds) return NaN;
  if (zone) return Date.parse(value);
  const instant = Date.parse(isoFromLocal(date, time));
  if (wall(instant) !== Date.parse(date + 'T' + time + ':00Z')) return NaN;
  return instant + Number(seconds) * 1000 + Number(fraction.padEnd(3, '0'));
}
/** ISO -> { date: "2026-11-28", time: "16:00" } in Israel. */
export function localOf(iso: string): { date: string; time: string } {
  if (!iso) return { date: '', time: '' };
  return { date: keyOf(iso), time: hhmm(iso) };
}
/** "שבת 28.11.2026" (N11 date field). */
export function dateFieldText(dateKey: string): string {
  if (!dateKey) return '';
  const [y, m, d] = dateKey.split('-').map(Number);
  return `${dayName(dateKey)} ${d}.${m}.${y}`;
}
/** "9:5" / "0930" / "16" -> "09:05" / "09:30" / "16:00"; '' when it is not a time. */
export function normTime(s: string): string {
  const t = s.trim().replace(/[.,]/g, ':');
  let h: number, mi: number;
  const m = /^(\d{1,2})(?::(\d{1,2}))?$/.exec(t) || /^(\d{2})(\d{2})$/.exec(t);
  if (!m) return '';
  h = Number(m[1]); mi = Number(m[2] || 0);
  if (h > 23 || mi > 59) return '';
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
}
/** Start and end from the form: an end not after the start rolls to the next day (an evening into the night).
 *  An end date after the start date (a multi-day event) ends on that day at the end hour. */
export function rangeFromForm(dateKey: string, from: string, to: string, endKey = ''): { start: string; end: string } | null {
  const a = normTime(from), b = normTime(to);
  if (!dateKey || !a || !b) return null;
  const start = isoFromLocal(dateKey, a);
  let end = isoFromLocal(endKey && endKey > dateKey ? endKey : dateKey, b);
  if (Date.parse(end) <= Date.parse(start)) end = new Date(Date.parse(isoFromLocal(dateKey, b)) + 86400_000).toISOString();
  return { start, end };
}
/** The end date the form shows: only when the event ends on a later day than the next morning (an evening into the night is one day). */
export function endDateOf(start: string, end: string): string {
  if (!start || !end) return '';
  const s = keyOf(start), e = keyOf(end);
  if (e <= s) return '';
  const next = keyOf(new Date(Date.parse(isoFromLocal(s, '12:00')) + 86400_000).toISOString());
  // ends the next day before the start hour: an evening into the night, no separate end date
  if (e === next && hhmm(end).padStart(5, '0') <= hhmm(start).padStart(5, '0')) return '';
  return e;
}

// ---------- tickets and orders ----------
export const isPaid = (s: PaymentStatus) => s === 'paid' || s === 'paid_onsite';
export const isOwing = (s: PaymentStatus) => s === 'pending' || s === 'claimed';
export type Order = {
  orderId: string; tickets: Ticket[]; name: string; phone: string; ownerUid: string; count: number;
  /** Price of the tickets still owed (pending or claimed). */
  owed: number; total: number; status: 'claimed' | 'pending' | 'paid' | 'free'; arrived: number; createdAt: string;
  /** Latest change on any of its tickets (when a "transferred" mark arrived). */
  changedAt: string;
  /** Every ticket of the order was cancelled (the "בוטלו" chip); ordersOf never returns these. */
  cancelled?: boolean;
};
/** A link describes the whole order. A manual, unproven or mixed-owner order has no person target. */
export function eventOrderPeople(eventId: string, tickets: Ticket[], activity: Activity[], people: ReadonlyMap<string, Profile>) {
  const registered = new Set(registeredTickets(tickets, activity));
  const result = new Map<string, Profile | undefined>();
  for (const t of tickets) {
    if (t.eventId !== eventId || !t.orderId) continue;
    const person = registered.has(t) ? people.get(t.ownerUid) : undefined;
    if (!result.has(t.orderId)) result.set(t.orderId, person);
    else if (result.get(t.orderId) !== person) result.set(t.orderId, undefined);
  }
  return result;
}

function orderOf(list: Ticket[], cancelled: boolean): Order {
  const t = list[0];
  const owing = cancelled ? [] : list.filter((x) => isOwing(x.paymentStatus));
  const status: Order['status'] = list.some((x) => x.paymentStatus === 'claimed') ? 'claimed' : list.some((x) => x.paymentStatus === 'pending') ? 'pending' : list.every((x) => x.paymentStatus === 'free') ? 'free' : 'paid';
  return {
    orderId: t.orderId, tickets: list, name: t.ownerName, phone: t.ownerPhone, ownerUid: t.ownerUid, count: list.length,
    owed: owing.reduce((s, x) => s + x.price, 0), total: list.reduce((s, x) => s + x.price, 0), status,
    arrived: list.filter((x) => x.entries > 0).length, createdAt: list.reduce((m, x) => (x.createdAt > m ? x.createdAt : m), t.createdAt),
    changedAt: list.reduce((m, x) => ((x.updatedAt || '') > m ? x.updatedAt : m), t.updatedAt || t.createdAt),
    ...(cancelled ? { cancelled: true } : {}),
  };
}
/** Valid tickets grouped by order, newest first. */
export function ordersOf(tickets: Ticket[]): Order[] {
  const by = new Map<string, Ticket[]>();
  for (const t of tickets) if (t.status === 'valid') { const l = by.get(t.orderId) || []; l.push(t); by.set(t.orderId, l); }
  return [...by.values()].map((list) => orderOf(list, false)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
/** Orders with no valid ticket left (cancelled by the guest or a manager), newest first. */
export function cancelledOrdersOf(tickets: Ticket[]): Order[] {
  const by = new Map<string, Ticket[]>();
  for (const t of tickets) { const l = by.get(t.orderId) || []; l.push(t); by.set(t.orderId, l); }
  return [...by.values()].filter((list) => !list.some((t) => t.status === 'valid')).map((list) => orderOf(list, true)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
/** M5 stat tiles: valid tickets, paid tickets, money still waiting. */
export function guestStats(tickets: Ticket[]) {
  const valid = tickets.filter((t) => t.status === 'valid');
  return {
    tickets: valid.length,
    paid: valid.filter((t) => isPaid(t.paymentStatus)).length,
    waiting: valid.filter((t) => isOwing(t.paymentStatus)).reduce((s, t) => s + t.price, 0),
    waitingCount: valid.filter((t) => isOwing(t.paymentStatus)).length,
    arrived: valid.filter((t) => t.entries > 0).length,
  };
}
export type GuestFilter = 'all' | 'claimed' | 'unpaid' | 'arrived' | 'cancelled';
const digits = (s: string) => s.replace(/\D/g, '');
/** The "marked as transferred" filter lists the longest-waiting mark first. */
export function filterOrders(orders: Order[], filter: GuestFilter, q: string): Order[] {
  const s = q.trim().toLowerCase(), d = digits(q);
  const list = filter === 'claimed' ? [...orders].sort((a, b) => a.changedAt.localeCompare(b.changedAt)) : orders;
  return list.filter((o) => (filter === 'cancelled' ? !!o.cancelled : !o.cancelled))
    .filter((o) => (filter === 'all' || filter === 'cancelled' ? true : filter === 'arrived' ? o.arrived > 0 : filter === 'claimed' ? o.status === 'claimed' : o.status === 'pending'))
    .filter((o) => !s || o.name.toLowerCase().includes(s) || (d.length >= 3 && digits(o.phone).includes(d)) || o.tickets.some((t) => t.holderName?.toLowerCase().includes(s)));
}
export const ticketsWord = (n: number) => (n === 1 ? 'כרטיס אחד' : `${n} כרטיסים`);
export const itemsWord = (n: number) => (n === 1 ? 'פריט אחד' : `${n} פריטים`);

// ---------- tabs ----------
export const tabUnits = (t: Pick<Tab, 'items'>) => t.items.reduce((s, i) => s + (i.qty || 1), 0);
export const isOpenDebtTab = (t: Tab) => (t.status === 'open' || t.status === 'claimed') && t.total > 0;
/** One line per product in the tab ("לימונדה ×2", 24). */
export function tabLines(items: TabItem[]): { key: string; name: string; qty: number; amount: number; index: number }[] {
  const out: { key: string; name: string; qty: number; amount: number; index: number }[] = [];
  items.forEach((i, index) => {
    const prev = out.find((x) => x.key === (i.productId || i.name));
    if (prev) { prev.qty += i.qty; prev.amount += i.price * i.qty; }
    else out.push({ key: i.productId || i.name, name: i.name, qty: i.qty, amount: i.price * i.qty, index });
  });
  return out;
}
/** A guess from the first name (shared rule in v2/gender.ts). */
export function looksFeminine(name: string): boolean { return sharedIsFemale(name); }
/** N12 footer "רשמה נועה · 17:05, 17:40". */
export function recordedLine(items: TabItem[]): string {
  if (!items.length) return '';
  const names: string[] = [];
  for (const i of items) { const n = firstName(i.by?.name || ''); if (n && !names.includes(n)) names.push(n); }
  const times = [...new Set(items.map((i) => hhmm(i.at)))].sort();
  const verb = names.length > 1 ? 'רשמו' : looksFeminine(names[0] || '') ? 'רשמה' : 'רשם';
  const who = names.length > 1 ? `${names.slice(0, -1).join(', ')} ו${names[names.length - 1]}` : names[0] || '';
  return `${verb} ${who} · ${times.join(', ')}`;
}

// ---------- summary (M7) ----------
export function eventSummary(tickets: Ticket[], tabs: Tab[]) {
  const valid = tickets.filter((t) => t.status === 'valid');
  const counted = tabs.filter((t) => t.status !== 'waived');
  return {
    registered: valid.length,
    arrived: valid.filter((t) => t.entries > 0).length,
    ticketsIncome: valid.filter((t) => isPaid(t.paymentStatus)).reduce((s, t) => s + t.price, 0),
    stallIncome: counted.reduce((s, t) => s + t.total, 0),
    waived: tabs.filter((t) => t.status === 'waived').reduce((s, t) => s + t.total, 0),
    orders: ordersOf(tickets).length,
  };
}
/** M7 extras (the old event report): arrival %, waived count, what is still open by type. */
export function summaryExtras(tickets: Ticket[], tabs: Tab[]) {
  const valid = tickets.filter((t) => t.status === 'valid');
  const arrived = valid.filter((t) => t.entries > 0).length;
  const openTabs = tabs.filter((t) => t.status === 'open' || t.status === 'claimed');
  const unpaid = valid.filter((t) => isOwing(t.paymentStatus));
  return {
    pct: valid.length ? Math.round((arrived / valid.length) * 100) : 0,
    returned: exitedReturned(valid),
    openTabs: openTabs.length,
    openTabsAmount: openTabs.reduce((s, t) => s + t.total, 0),
    openOrders: new Set(unpaid.map((t) => t.orderId)).size,
    openOrdersAmount: unpaid.reduce((s, t) => s + t.price, 0),
    waivedCount: tabs.filter((t) => t.status === 'waived').length,
  };
}
/** Units and revenue of one product in these tabs (N10 editor). */
export function productSales(tabs: Tab[], product: { id?: string; name: string }) {
  let units = 0, revenue = 0;
  for (const t of tabs) if (t.status !== 'waived') for (const i of t.items) if ((product.id && i.productId === product.id) || i.name === product.name) { units += i.qty; revenue += i.qty * i.price; }
  return { units, revenue };
}
/** Units sold per product (by name), most first. */
export function topSold(tabs: Tab[], limit = 4): { label: string; value: number }[] {
  const m = new Map<string, number>();
  for (const t of tabs) if (t.status !== 'waived') for (const i of t.items) m.set(i.name, (m.get(i.name) || 0) + i.qty);
  return [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label)).slice(0, limit);
}
/** Units of one product sold in these tabs (by id, or by name for products copied between events). */
export function unitsSold(tabs: Tab[], product: { id?: string; name: string }): number {
  let n = 0;
  for (const t of tabs) if (t.status !== 'waived') for (const i of t.items) if ((product.id && i.productId === product.id) || i.name === product.name) n += i.qty;
  return n;
}

// ---------- debts (V5, M3, M7) ----------
export type EventDebt = Debt & { ids: string[]; uid: string; count: number; claimed: boolean };
type Stamped = { reminderSentAt?: string | null };
/** Who still owes after the event: orders that came in without paying (pending or claimed, scanned at least once),
 *  and stall tabs left open or marked as paid by the guest but not confirmed. */
export function debtsOf(eventId: string, tickets: Ticket[], tabs: Tab[]): EventDebt[] {
  const out: EventDebt[] = [];
  for (const o of ordersOf(tickets.filter((t) => t.eventId === eventId))) {
    const owing = o.tickets.filter((t) => isOwing(t.paymentStatus));
    if (!owing.length || !o.tickets.some((t) => t.entries > 0)) continue;
    const sent = owing.map((t) => (t as Ticket & Stamped).reminderSentAt || '').filter(Boolean).sort().pop() || null;
    out.push({
      id: `tickets:${o.orderId}`, kind: 'tickets', refId: o.orderId, eventId, name: o.name, phone: o.phone, uid: o.ownerUid,
      what: ticketsWord(owing.length), amount: owing.reduce((s, t) => s + t.price, 0), reminderSentAt: sent,
      ids: owing.map((t) => t.id), count: owing.length, claimed: owing.some((t) => t.paymentStatus === 'claimed'),
    });
  }
  for (const t of tabs) {
    if (t.eventId !== eventId || !isOpenDebtTab(t)) continue;
    out.push({
      id: `tab:${t.id}`, kind: 'tab', refId: t.id, eventId, name: t.guestName, phone: t.guestPhone, uid: t.guestUid,
      what: `חשבון דוכן · ${itemsWord(tabUnits(t))}`, amount: t.total, reminderSentAt: (t as Tab & Stamped).reminderSentAt || null,
      ids: [t.id], count: tabUnits(t), claimed: t.status === 'claimed',
    });
  }
  return sortDebts(out);
}
/** Not reminded yet first (largest amount first), then the reminded ones in the order they were sent. */
export function sortDebts<T extends Pick<Debt, 'amount' | 'reminderSentAt' | 'name'>>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    if (!a.reminderSentAt !== !b.reminderSentAt) return a.reminderSentAt ? 1 : -1;
    if (!a.reminderSentAt) return b.amount - a.amount || a.name.localeCompare(b.name);
    return a.reminderSentAt.localeCompare(b.reminderSentAt!);
  });
}
export function debtTotals(debts: EventDebt[]) {
  return {
    count: debts.length, amount: debts.reduce((s, d) => s + d.amount, 0),
    tickets: debts.filter((d) => d.kind === 'tickets').length, tabs: debts.filter((d) => d.kind === 'tab').length,
  };
}
/** M7 "2 כרטיסים · 2 חשבונות דוכן". */
export function debtBreakdown(t: { tickets: number; tabs: number }): string {
  const parts: string[] = [];
  if (t.tickets) parts.push(t.tickets === 1 ? 'כרטיסים של הזמנה אחת' : `${t.tickets} כרטיסים`);
  if (t.tabs) parts.push(t.tabs === 1 ? 'חשבון דוכן אחד' : `${t.tabs} חשבונות דוכן`);
  return parts.join(' · ');
}
/** The debt reminder: [שם] first name, [אירוע], [סכום] ("200 ₪", or the number when the template already writes ₪ after it), [ביט], [תאריך]. */
export function fillDebtTemplate(template: string, v: { name: string; event: string; amount: number; bit: string; date?: string }): string {
  return template
    .replace(/\[סכום\](\s?₪)/g, (_m, sh: string) => `${v.amount.toLocaleString('en-US')}${sh}`)
    .replaceAll('[סכום]', money(v.amount))
    .replaceAll('[שם]', firstName(v.name))
    .replaceAll('[אירוע]', v.event)
    .replaceAll('[ביט]', v.bit)
    .replaceAll('[תאריך]', v.date || '');
}

// ---------- the events list (M3) ----------
export type BoardCard = { tag: { tone: 'warm' | 'neutral' | 'waiting'; text: string } | null; meta: string };
/** Meta line and tag of one event card. `next` marks the nearest upcoming published event. */
export function boardCard(e: FarmEvent & { closed?: unknown }, tickets: Ticket[], tabs: Tab[], now: number, next: boolean): BoardCard {
  const s = guestStats(tickets);
  if (!e.published && phaseOf(e, now) !== 'after') return { tag: { tone: 'neutral', text: 'טיוטה' }, meta: 'עוד לא פורסם' };
  if (phaseOf(e, now) !== 'after') {
    const meta = e.price > 0
      ? `${s.tickets} כרטיסים${s.waitingCount ? ` · ${s.waitingCount} ממתינים לתשלום` : ''}`
      : `חינם · ${s.tickets} נרשמו`;
    return { tag: next ? { tone: 'warm', text: inDays(e.start) } : null, meta };
  }
  const d = debtTotals(debtsOf(e.id, tickets, tabs));
  if (d.count) return { tag: { tone: 'waiting', text: money(d.amount) }, meta: `${s.arrived} הגיעו · ${d.count === 1 ? 'חוב פתוח אחד' : `${d.count} חובות פתוחים`}` };
  return { tag: null, meta: `${s.arrived} הגיעו · סגור` };
}

// ---------- staffing (V4, M4) ----------
export type Station = Staffing & { virtual?: boolean };
/** Stations of the event: the saved ones, plus the usual gate / stall / parking when they were never saved. */
export function stationsOf(e: Pick<FarmEvent, 'entry' | 'stall'>, saved: Staffing[]): Station[] {
  const defaults: Station[] = [
    ...(e.entry !== false ? [{ id: 'gate', station: 'שער', people: [], needed: 1, virtual: true }] : []),
    ...(e.stall !== false ? [{ id: 'stall', station: 'דוכן', people: [], needed: 1, virtual: true }] : []),
    { id: 'parking', station: 'חניה', people: [], needed: 1, virtual: true },
  ];
  const out: Station[] = defaults.map((d) => saved.find((s) => s.id === d.id) || d);
  for (const s of saved) if (!out.some((x) => x.id === s.id)) out.push(s);
  return out;
}
export const stationMissing = (s: Staffing) => s.people.length < Math.max(1, s.needed || 0);
/** V4 tiles: assigned people, stations short of people, team members at the farm that day who are not assigned. */
export function staffingStats(stations: Staffing[], presence: CalendarItem[], teamUids: string[]) {
  const assigned = new Set<string>();
  let people = 0;
  for (const s of stations) for (const p of s.people) { people += 1; assigned.add(p.uid); }
  const free = new Set(presence.filter((c) => c.kind === 'presence' && teamUids.includes(c.ownerUid) && !assigned.has(c.ownerUid)).map((c) => c.ownerUid));
  const missing = stations.filter(stationMissing);
  return { assigned: people, missing: missing.length, missingNames: missing.map((s) => s.station), available: free.size, freeUids: [...free] };
}
/** M4 row meta "6 משובצים · בחניה חסר מישהו". */
export function staffingMeta(st: { assigned: number; missing: number; missingNames: string[] }): string {
  const head = `${st.assigned} משובצים`;
  if (!st.missing) return head;
  return st.missing === 1 ? `${head} · ב${st.missingNames[0]} חסר מישהו` : `${head} · ${st.missing} עמדות חסרות`;
}
/** Hours "15:30-18:30" -> "15:30–18:30". */
export const hoursText = (h: string) => h.replace(/\s*-\s*/, '–');

// ---------- scans kept on the tickets (events before the scan log, and offline fallbacks) ----------
/** One scan line per entry recorded on a ticket (ticket.scans[]), newest first: the shape of the scan log (events/{id}/scans).
 *  Events from before the scan log only have these. */
export function scansFromTickets(tickets: Ticket[]): GateScan[] {
  const out: GateScan[] = [];
  for (const t of tickets) {
    if (t.status !== 'valid') continue;
    (t.scans || []).forEach((sc, i) => {
      const n = i + 1;
      const part = t.total > 1 ? `כרטיס ${t.index} מתוך ${t.total}` : 'כרטיס אחד';
      out.push({
        id: `${t.id}-${n}`, eventId: t.eventId, ticketId: t.id, orderId: t.orderId, name: t.holderName || t.ownerName,
        meta: `${part} · כניסה ${n}${n > 1 ? ', יצא וחזר' : ''}`, result: t.paymentStatus === 'paid_onsite' && n === 1 ? 'paidAtGate' : 'ok',
        by: sc.by, at: sc.at,
      });
    });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}
/** Live counters rebuilt from the tickets (no counters/live document): entered, scans, paid at the gate, per half hour (Israel time). */
export function countersFromTickets(tickets: Ticket[]) {
  const valid = tickets.filter((t) => t.status === 'valid');
  const perHalfHour: Record<string, number> = {};
  for (const t of valid) {
    const first = (t.scans || [])[0];
    if (!first) continue;
    const [h, m] = hhmm(first.at).split(':');
    const k = `${h.padStart(2, '0')}:${Number(m) < 30 ? '00' : '30'}`;
    perHalfHour[k] = (perHalfHour[k] || 0) + 1;
  }
  return {
    entered: valid.filter((t) => t.entries > 0).length,
    scans: valid.reduce((s, t) => s + Math.max(t.entries || 0, (t.scans || []).length), 0),
    paidAtGate: valid.filter((t) => t.paymentStatus === 'paid_onsite').length,
    payLater: 0, payLaterAmount: 0, rejected: 0,
    returned: exitedReturned(valid),
    perHalfHour,
  };
}
/** "יצאו וחזרו": valid tickets scanned in more than once. */
export const exitedReturned = (tickets: Ticket[]) => tickets.filter((t) => t.status === 'valid' && (t.entries || 0) > 1).length;

// ---------- live (M6) ----------
// Entered / total / waiting come from the event-day data (data/eventday.ts liveNumbers over counters/live).
/** M6 tiles: paid at the gate (counters/live, else the tickets) and the stall (tabs with something in them). */
export function dayTiles(c: { paidAtGate?: number } | null, tickets: Ticket[], tabs: Tab[]) {
  const open = tabs.filter((t) => t.status !== 'waived' && (t.items.length || t.total));
  return {
    paidAtGate: c?.paidAtGate ?? tickets.filter((t) => t.paymentStatus === 'paid_onsite').length,
    stallTabs: open.length,
    stallSold: open.reduce((x, t) => x + t.total, 0),
  };
}
/** "2/3" for a scan: from the ticket, or from the scan text ("כרטיס 2 מתוך 3", "כרטיס אחד"). */
export function scanPart(scan: Pick<GateScan, 'meta'>, ticket?: Pick<Ticket, 'index' | 'total'> | null): string {
  if (ticket) return `${ticket.index}/${ticket.total}`;
  const m = /כרטיס (\d+) מתוך (\d+)/.exec(scan.meta || '');
  if (m) return `${m[1]}/${m[2]}`;
  if (/^כרטיס אחד/.test(scan.meta || '')) return '1/1';
  return '';
}
/** "שליש מהכרטיסים נכנסו" style label for the hero bar. */
export function shareLabel(share: number): string {
  const p = Math.round(share * 100);
  if (p === 0) return 'עוד אף אחד לא נכנס';
  if (p >= 100) return 'כל הכרטיסים נכנסו';
  const words: [number, string][] = [[25, 'רבע'], [33, 'שליש'], [50, 'חצי'], [67, 'שני שלישים'], [75, 'שלושה רבעים']];
  const near = words.find(([v]) => Math.abs(v - p) <= 2);
  return near ? `${near[1]} מהכרטיסים נכנסו` : `${p}% מהכרטיסים נכנסו`;
}

// ---------- files (V3) ----------
export const FILE_MAX_CHARS = 700_000;
export function fileKindLabel(f: { kind: string; url: string; mime?: string }): string {
  if (f.kind === 'image') return 'תמונה';
  if ((f.mime || '').includes('pdf') || /^data:application\/pdf/.test(f.url) || /\.pdf($|\?)/i.test(f.url)) return 'PDF';
  return /^https?:/.test(f.url) ? 'קישור' : 'מסמך';
}

// ---------- products (N9, N10) ----------
export function productsMeta(products: { active: boolean }[]): string {
  const hidden = products.filter((p) => !p.active).length;
  const head = `${products.length} מוצרים`;
  return hidden ? `${head} · ${hidden === 1 ? 'אחד מוסתר' : `${hidden} מוסתרים`}` : head;
}

// ---------- details row (M4) ----------
export function detailsMeta(e: Pick<FarmEvent, 'price' | 'maxPerOrder' | 'entry' | 'stall'>): string {
  const parts = [e.price > 0 ? `${e.price} ₪ לכרטיס` : 'חינם', `עד ${e.maxPerOrder} בהזמנה`];
  const day = e.entry !== false && e.stall !== false ? 'כניסה ודוכן' : e.entry !== false ? 'כניסה בסריקה' : e.stall !== false ? 'אירוע עם דוכנים' : '';
  if (day) parts.push(day);
  return parts.join(' · ');
}
export function vendorsMeta(list: { status?: string; confirmed?: boolean }[]): string {
  const st = list.map((v) => v.status || (v.confirmed ? 'confirmed' : 'invited'));
  const parts = [`${list.length} הוזמנו`];
  const c = st.filter((s) => s === 'confirmed').length, w = st.filter((s) => s === 'invited').length, d = st.filter((s) => s === 'declined').length;
  if (c) parts.push(`${c} אישרו`);
  if (w) parts.push(`${w} עוד לא ענו`);
  if (d) parts.push(`${d} לא יגיעו`);
  return parts.join(' · ');
}
