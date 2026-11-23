// Event day and live event data (E1-E9, Y1-Y5): tickets at the gate, the scan log, the live counters, stall tabs and closing.
// Everything goes through db.ts, so the same code runs on the demo store and on Firestore, and every write works offline.
// Collections (docs/redesign-data/eventday.md):
//   tickets (existing, + payLater, cancelledAt/By/Note, walkIn)        events/{id}/scans/{sid} (GateScan)
//   events/{id}/counters/live (LiveCounters + per10m)                    events/{id}/counters/cash (cash counted before closing)
//   events/{id}/staffing/{station} (read only here)                      events.closed (EventClose)       tabs (existing)
import { useMemo } from 'react';
import { useList, useDoc, write, newId, push, inc, serverNow, transact, ConflictError, type Tx } from '../../db';
import { nowIso, nowMs, dateKeyOf } from '../../clock';
import { logActivity } from '../../activity';
import { openTab, addTabItems, removeTabItem, setTabStatus, parseQr, qrPayload, randomSecret, hasTabPurchases, type StallGuest } from '../../data';
import { ddmm, hhmm } from '../format';
import type { Actor, Activity, EventClose, FarmEvent, GateScan, LiveCounters, Product, ScanResult, Staffing, Tab, TabItem, Ticket } from '../../types';

// ---------- types (local extensions; every new field is optional) ----------
export type TicketV2 = Ticket & {
  /** Let in at the gate without paying: the order stays unpaid and becomes a debt after the event (Y1, Y5, V5). */
  payLater?: boolean; payLaterAt?: string; payLaterBy?: Actor;
  /** Who cancelled the order and why (E5, Y3). Older tickets fall back to updatedAt and the activity log. */
  cancelledAt?: string; cancelledBy?: Actor; cancelNote?: string;
  /** Created at the gate for a guest without a ticket (E6 "אורח בלי כרטיס"). */
  walkIn?: boolean; createdBy?: Actor;
  reminderSentAt?: string | null;
};
export type ScanV2 = GateScan & { phone?: string; count?: number; keptBy?: Actor | null; keptAt?: string | null };
export type Counters = LiveCounters & { per10m?: Record<string, number>; eventId?: string };
export type EventV2 = FarmEvent & { closed?: EventClose | null; reopenedAt?: string | null; reopenedBy?: Actor | null };
export type CashCount = { amount: number; by: string; at: string; byActor?: Actor };
export type Cash = { id?: string; gate?: CashCount; stall?: CashCount };

// ---------- small helpers ----------
const UNPAID = ['pending'];
export const isUnpaid = (t: Ticket) => t.status === 'valid' && UNPAID.includes(t.paymentStatus) && !(t as TicketV2).payLater;
/** Trust-based: a guest who marked "שילמתי" (claimed) walks in; managers approve the payments in bulk later. */
export const isSettled = (t: Ticket) => t.status === 'valid' && !isUnpaid(t);
export const ticketWord = (n: number) => (n === 1 ? 'כרטיס אחד' : `${n} כרטיסים`);
export const itemsWord = (n: number) => (n === 0 ? 'אין פריטים' : n === 1 ? 'פריט אחד' : `${n} פריטים`);
export const ticketName = (t: Ticket) => t.holderName || t.ownerName;
export const digits = (s: string) => (s || '').replace(/\D/g, '');
const halfKey = (iso: string) => { const [h, m] = hhmm(iso).split(':'); return `${h}:${Number(m) < 30 ? '00' : '30'}`; };
const tenKey = (iso: string) => { const [h, m] = hhmm(iso).split(':'); return `${h}:${String(Math.floor(Number(m) / 10) * 10).padStart(2, '0')}`; };
export const bucketKeys = { halfKey, tenKey };
export const isEventClosed = (e: EventV2 | null | undefined) => !!e?.closed;
/** Initials for list avatars: families ("משפחת לוי") and guests without a ticket show one letter, as in E9 and Y4. */
export function shortInitials(name: string, single = false) {
  const w = name.replace(/^לקוח בלי כרטיס:\s*/, '').trim().split(/\s+/).filter(Boolean);
  if (!w.length) return '';
  if (w[0] === 'משפחת' && w.length > 1) return w[w.length - 1][0];
  if (single || w.length === 1) return w[0][0];
  return w[0][0] + w[w.length - 1][0];
}

// ---------- reads ----------
export const useEventDoc = (id: string) => useDoc<EventV2>('events/' + (id || '_'), !!id);
export const useEventTickets = (eventId: string, enabled = true) =>
  useList<TicketV2>('tickets', { where: [['eventId', '==', eventId]], orderBy: [['createdAt', 'desc']] }, enabled && !!eventId);
export const useEventTabs = (eventId: string, enabled = true) =>
  useList<Tab>('tabs', { where: [['eventId', '==', eventId]], orderBy: [['createdAt', 'desc']] }, enabled && !!eventId);
export const useTab = (id: string) => useDoc<Tab>('tabs/' + (id || '_'), !!id);
export function useStallProducts(eventId: string, enabled = true) {
  const r = useList<Product>(`events/${eventId || '_'}/products`, { orderBy: [['sort', 'asc']] }, enabled && !!eventId);
  return useMemo(() => ({ ...r, items: r.items.filter((p) => p.active !== false) }), [r]);
}
/** The scan log, newest first. Y2 shows it; E2 reads the latest line. */
export const useScans = (eventId: string, max = 300, enabled = true) =>
  useList<ScanV2>(`events/${eventId || '_'}/scans`, { orderBy: [['at', 'desc']], limit: max }, enabled && !!eventId);
/** Rejected scans (Y1 "דורש אותך", Y2 chip). Index: result asc, at desc. */
export const useRejectedScans = (eventId: string, enabled = true) =>
  useList<ScanV2>(`events/${eventId || '_'}/scans`, { where: [['result', '==', 'rejected']], orderBy: [['at', 'desc']], limit: 100 }, enabled && !!eventId);
export const useScan = (eventId: string, sid: string) => useDoc<ScanV2>(`events/${eventId || '_'}/scans/${sid || '_'}`, !!eventId && !!sid);
export const useCounters = (eventId: string, enabled = true) => useDoc<Counters>(`events/${eventId || '_'}/counters/live`, enabled && !!eventId);
export const useCash = (eventId: string) => useDoc<Cash>(`events/${eventId || '_'}/counters/cash`, !!eventId);
export const useStaffing = (eventId: string, enabled = true) => useList<Staffing>(`events/${eventId || '_'}/staffing`, {}, enabled && !!eventId);
/** Managers: the cancel record of an order (Y3 "מי ביטל"), for tickets cancelled before cancelledBy existed. */
export const useOrderActivity = (orderId: string, enabled = true) =>
  useList<Activity>('activity', { where: [['kind', '==', 'ticket'], ['refId', '==', orderId]], orderBy: [['at', 'desc']], limit: 20 }, enabled && !!orderId);

/** Valid tickets grouped by order, each with its counts. */
export type Order = { id: string; tickets: TicketV2[]; valid: TicketV2[]; entered: number; unpaid: TicketV2[]; first: TicketV2; cancelled: boolean };
export function groupOrders(tickets: TicketV2[]): Order[] {
  const map = new Map<string, TicketV2[]>();
  for (const t of tickets) { const g = map.get(t.orderId); if (g) g.push(t); else map.set(t.orderId, [t]); }
  return [...map.entries()].map(([id, list]) => {
    const sorted = [...list].sort((a, b) => a.index - b.index);
    const valid = sorted.filter((t) => t.status === 'valid');
    return { id, tickets: sorted, valid, entered: valid.filter((t) => (t.entries || 0) > 0).length, unpaid: valid.filter(isUnpaid), first: sorted[0], cancelled: !valid.length };
  });
}
export const orderName = (o: Order) => o.first.ownerName || ticketName(o.first);
export function ticketMatcher(query: string) {
  const text = query.trim().toLowerCase();
  const d = digits(text);
  return (t: Ticket) => !!text && (t.ownerName.toLowerCase().includes(text) || (t.holderName || '').toLowerCase().includes(text) || (d.length >= 4 && digits(t.ownerPhone).includes(d)));
}

// ---------- the gate: judging a ticket ----------
export type Verdict =
  | { kind: 'ok'; ticket: TicketV2; order: TicketV2[]; name: string; detail: string }
  | { kind: 'pay'; ticket: TicketV2; order: TicketV2[]; owing: TicketV2[]; amount: number; name: string; detail: string }
  | { kind: 'bad'; headline: string; name?: string; detail?: string; ticket?: TicketV2; reason: string };
function orderedWhen(iso: string) {
  const d = dateKeyOf(new Date(iso)), today = dateKeyOf(new Date(nowMs()));
  const yesterday = dateKeyOf(new Date(nowMs() - 86400_000));
  return `הוזמן ${d === today ? 'היום' : d === yesterday ? 'אתמול' : `ב־${ddmm(iso)}`} ${hhmm(iso)}`;
}
export function cancelDate(t: TicketV2) { return t.cancelledAt || t.updatedAt; }
/** What the gate says about a ticket (E3 ok, E4 pay, E5 bad). Pure: the screen records the scan only when someone acts. */
export function judge(t: TicketV2 | undefined, all: TicketV2[], eventId: string, secret?: string): Verdict {
  if (!t) return { kind: 'bad', headline: 'לא נמצא', detail: 'הכרטיס לא שייך לאירוע הזה, או שהרשימה עוד לא ירדה למכשיר.', reason: 'לא נמצא' };
  if (t.eventId !== eventId) return { kind: 'bad', headline: 'אירוע אחר', name: ticketName(t), detail: `הכרטיס שייך ל${t.eventTitle}`, ticket: t, reason: 'אירוע אחר' };
  if (secret !== undefined && secret !== t.secret) return { kind: 'bad', headline: 'ברקוד לא תקין', name: ticketName(t), detail: 'הקוד לא תואם את הכרטיס.', ticket: t, reason: 'ברקוד לא תקין' };
  if (t.status === 'cancelled') return { kind: 'bad', headline: 'כרטיס בוטל', name: ticketName(t), detail: `ההזמנה בוטלה ב־${ddmm(cancelDate(t))} על ידי מנהל`, ticket: t, reason: 'ההזמנה בוטלה' };
  const order = all.filter((x) => x.orderId === t.orderId && x.status === 'valid').sort((a, b) => a.index - b.index);
  if (isUnpaid(t)) {
    const owing = order.filter(isUnpaid);
    return { kind: 'pay', ticket: t, order, owing, amount: owing.reduce((s, x) => s + (x.price || 0), 0), name: ticketName(t), detail: `${ticketWord(owing.length)} · ${orderedWhen(t.createdAt)}` };
  }
  const n = t.entries || 0;
  const which = t.total === 1 ? 'כרטיס אחד' : `כרטיס ${t.index} מתוך ${t.total}`;
  return { kind: 'ok', ticket: t, order, name: ticketName(t), detail: `${which} · ${n === 0 ? 'כניסה ראשונה' : `כניסה ${n + 1}, יצא וחזר`}` };
}
/** A scanned QR string -> verdict. Non-farm codes and tickets of another event are rejected. */
export function judgeCode(code: string, all: TicketV2[], eventId: string): Verdict {
  const p = parseQr(code);
  if (!p) return { kind: 'bad', headline: 'לא כרטיס של החווה', detail: 'נסרק ברקוד אחר.', reason: 'ברקוד אחר' };
  return judge(all.find((x) => x.id === p.id), all, eventId, p.secret);
}
export { qrPayload };

// ---------- the gate: writes (one transaction each, so two gates never let the same entry in twice) ----------
type Pay = 'none' | 'gate' | 'later';
const countersCol = (eventId: string) => `events/${eventId}/counters`;
/** Adds to the live counters inside the scan's transaction. Totals use increments; the two small time maps are rewritten from the copy read in the same transaction. */
async function bumpCounters(tx: Tx, eventId: string, at: string, d: Partial<Record<'entered' | 'scans' | 'paidAtGate' | 'payLater' | 'payLaterAmount' | 'rejected', number>>) {
  const cur = await tx.get<Counters>(countersCol(eventId), 'live');
  const entered = d.entered || 0;
  const maps = entered ? {
    perHalfHour: { ...(cur?.perHalfHour || {}), [halfKey(at)]: (cur?.perHalfHour?.[halfKey(at)] || 0) + entered },
    per10m: { ...(cur?.per10m || {}), [tenKey(at)]: (cur?.per10m?.[tenKey(at)] || 0) + entered },
  } : {};
  if (!cur) {
    const zero = { entered: 0, scans: 0, paidAtGate: 0, payLater: 0, payLaterAmount: 0, rejected: 0, perHalfHour: {}, per10m: {} };
    tx.set(countersCol(eventId), 'live', { ...zero, ...d, ...maps, eventId });
    return;
  }
  tx.update(countersCol(eventId), 'live', { ...Object.fromEntries(Object.entries(d).filter(([, v]) => v).map(([k, v]) => [k, inc(v!)])), ...maps });
}
/** Creates the counters document once, without touching an existing one (so an offline scan always has a copy to add to). */
export function ensureCounters(eventId: string) { return write.merge(countersCol(eventId), 'live', { eventId }).catch(() => {}); }

export type AdmitResult = {
  entries: number;
  /** What was recorded: 'ok' also when the screen asked for payment but another gate had already taken it for this order. */
  result: ScanResult;
  /** The amount recorded as paid at the gate (or as a debt), from the order as the server had it at that moment. */
  amount: number;
};
/** Lets one ticket in. pay 'gate' marks the unpaid tickets of the order paid at the gate; 'later' lets them in as a debt.
 *  Refused (ConflictError -> X1) when another gate already counted this entry. When the server cannot be reached in time
 *  (weak reception), it is saved on the phone as a queued write and sent when the network is back (db.ts transact `queue`).
 *
 *  One payment per order: `order` is only the screen's copy. Two gates can scan two tickets of the same unpaid order at the
 *  same moment, and each sees the whole order as owing. So every ticket of the order is read again inside the transaction,
 *  and what is owed (which tickets to mark, the amount on the scan, the counters) comes from those fresh copies. Firestore
 *  runs the transaction again if any of them changes before it commits, so the second gate finds the order already paid
 *  and records a plain entry ('ok', no amount). Same rule as the Worker's gate.admit (updateTime preconditions).
 *
 *  Limitation, the offline queue (db.ts `queued`): with no server to ask, "read again" means this phone's cached copy. If
 *  another gate took the payment while this phone was cut off, the queued scan still records the full amount once more.
 *  No phone can know that offline. What stops harm: the rules refuse a volunteer's update of a ticket that is already
 *  paid (crewPaidOnsite: only pending/claimed -> paid_onsite), and both scans keep the same orderId in the scan log, where
 *  the cash count at closing shows the double. Managers' writes are trusted by the rules (managerTicket). */
export async function admit(actor: Actor, event: FarmEvent, ticket: TicketV2, order: TicketV2[], pay: Pay = 'none'): Promise<AdmitResult> {
  const at = nowIso();
  const res = await transact(async (tx) => {
    const cur = await tx.get<TicketV2>('tickets', ticket.id);
    if (!cur || cur.status !== 'valid' || (cur.entries || 0) !== (ticket.entries || 0)) throw new ConflictError();
    // the rest of the order as the server has it now (all reads before the first write, as Firestore requires)
    const others = await Promise.all(order.filter((t) => t.id !== ticket.id).map((t) => tx.get<TicketV2>('tickets', t.id)));
    const fresh = [cur, ...others.filter((t): t is TicketV2 & { id: string } => !!t && t.orderId === ticket.orderId)];
    const owing = fresh.filter(isUnpaid).sort((a, b) => a.index - b.index);
    const amount = pay === 'none' ? 0 : owing.reduce((s, t) => s + (t.price || 0), 0);
    const n = (cur.entries || 0) + 1;
    const sid = `${ticket.id}-${n}`;
    if (await tx.get('events/' + event.id + '/scans', sid)) throw new ConflictError();
    const payPatch = (t: TicketV2) => (pay === 'gate' && isUnpaid(t) ? { paymentStatus: 'paid_onsite', paidAt: serverNow() } : pay === 'later' && isUnpaid(t) ? { payLater: true, payLaterAt: at, payLaterBy: actor } : {});
    for (const t of owing) if (t.id !== ticket.id) tx.update('tickets', t.id, { ...payPatch(t), updatedAt: at });
    tx.update('tickets', ticket.id, { scans: push({ at, by: actor }), entries: inc(1), ...payPatch(cur), updatedAt: at });
    const result: ScanResult = pay === 'gate' && amount ? 'paidAtGate' : pay === 'later' && amount ? 'payLater' : 'ok';
    const which = ticket.total === 1 ? 'כרטיס אחד' : `כרטיס ${ticket.index} מתוך ${ticket.total}`;
    const meta = result === 'ok' ? which : `${ticketWord(owing.length)} · ${amount} ₪`;
    const scan: Omit<ScanV2, 'id'> = { eventId: event.id, ticketId: ticket.id, orderId: ticket.orderId, name: ticketName(ticket), phone: ticket.ownerPhone, meta, result, ...(amount ? { amount, method: '' } : {}), count: result === 'ok' ? 1 : owing.length, by: actor, at, reopenedBy: null, reopenedAt: null };
    tx.set('events/' + event.id + '/scans', sid, scan as unknown as Record<string, unknown>);
    await bumpCounters(tx, event.id, at, { entered: n === 1 ? 1 : 0, scans: 1, ...(result === 'paidAtGate' ? { paidAtGate: owing.length } : {}), ...(result === 'payLater' ? { payLater: owing.length, payLaterAmount: amount } : {}) });
    return { entries: n, result, amount };
  }, { queue: true }); // weak reception: saved on the phone like the old gate, never lost
  const { amount, result } = res;
  logActivity(actor, 'ticket', ticket.id, 'scanned', `${ticketName(ticket)} · כניסה ${res.entries}${result === 'paidAtGate' ? ` · שולם במקום ${amount} ₪` : ''}${result === 'payLater' ? ` · ישלמו אחר כך ${amount} ₪` : ''}`, { subjectUid: ticket.ownerUid, eventId: event.id });
  return res;
}

/** E5 and "לא להכניס": the rejected scan goes to the log (Y2, Y3) and the counters. */
export async function logRejected(actor: Actor, event: FarmEvent, v: { ticket?: TicketV2; name?: string; reason: string; meta?: string }) {
  const at = nowIso();
  const sid = newId(`events/${event.id}/scans`);
  const t = v.ticket;
  const meta = v.meta ?? (v.reason === 'ההזמנה בוטלה' && t ? `ההזמנה בוטלה ב־${ddmm(cancelDate(t))}` : v.reason);
  await transact(async (tx) => {
    const scan: Omit<ScanV2, 'id'> = { eventId: event.id, ticketId: t?.id || '', orderId: t?.orderId || '', name: v.name || (t ? ticketName(t) : 'לא מזוהה'), phone: t?.ownerPhone || '', meta, result: 'rejected', reason: v.reason, by: actor, at, reopenedBy: null, reopenedAt: null, keptBy: null, keptAt: null };
    tx.set(`events/${event.id}/scans`, sid, scan as unknown as Record<string, unknown>);
    await bumpCounters(tx, event.id, at, { scans: 1, rejected: 1 });
  }, { queue: true });
  if (t) logActivity(actor, 'ticket', t.id, 'rejected', `${ticketName(t)} · נדחה בשער · ${v.reason}`, { subjectUid: t.ownerUid, eventId: event.id });
  return sid;
}

/** E6 "אורח בלי כרטיס": tickets created at the gate, already inside. */
export async function admitWalkIn(actor: Actor, event: FarmEvent, guest: { name: string; phone: string; count: number }, pay: 'gate' | 'later') {
  const at = nowIso();
  const orderId = newId('tickets');
  const ids = Array.from({ length: guest.count }, () => newId('tickets'));
  const amount = (event.price || 0) * guest.count;
  await transact(async (tx) => {
    ids.forEach((id, i) => {
      const t: Omit<TicketV2, 'id'> = {
        eventId: event.id, eventTitle: event.title, orderId, index: i + 1, total: guest.count, ownerUid: '', ownerName: guest.name, ownerPhone: guest.phone, holderName: '',
        secret: randomSecret(), price: event.price || 0, paymentStatus: amount && pay === 'later' ? 'pending' : amount ? 'paid_onsite' : 'free', status: 'valid',
        scans: [{ at, by: actor }], entries: 1, answers: {}, createdAt: at, updatedAt: at, walkIn: true, createdBy: actor,
        ...(amount && pay === 'later' ? { payLater: true, payLaterAt: at, payLaterBy: actor } : {}),
      };
      tx.set('tickets', id, t as unknown as Record<string, unknown>);
    });
    const result: ScanResult = !amount ? 'ok' : pay === 'gate' ? 'paidAtGate' : 'payLater';
    const scan: Omit<ScanV2, 'id'> = { eventId: event.id, ticketId: ids[0], orderId, name: guest.name, phone: guest.phone, meta: `${ticketWord(guest.count)} · אורח בלי כרטיס${amount ? ` · ${amount} ₪` : ''}`, result, ...(amount ? { amount, method: '' } : {}), count: guest.count, by: actor, at, reopenedBy: null, reopenedAt: null };
    tx.set(`events/${event.id}/scans`, `${ids[0]}-1`, scan as unknown as Record<string, unknown>);
    await bumpCounters(tx, event.id, at, { entered: guest.count, scans: 1, ...(result === 'paidAtGate' ? { paidAtGate: guest.count } : {}), ...(result === 'payLater' ? { payLater: guest.count, payLaterAmount: amount } : {}) });
  }, { queue: true });
  logActivity(actor, 'ticket', orderId, 'ordered', `${guest.name} · ${ticketWord(guest.count)} בשער · ${event.title}${amount ? ` · ${amount} ₪ ${pay === 'gate' ? 'שולם במקום' : 'ישלמו אחר כך'}` : ''}`, { eventId: event.id });
  return { orderId, ticketId: ids[0] };
}

/** Y3 "לפתוח מחדש ולהכניס": the cancelled order is valid again (unpaid, let in as a debt) and the scanned ticket enters. */
export async function reopenAndAdmit(actor: Actor, event: FarmEvent, scan: ScanV2, order: TicketV2[]) {
  const at = nowIso();
  const ticket = order.find((t) => t.id === scan.ticketId) || order[0];
  if (!ticket) throw new ConflictError();
  await transact(async (tx) => {
    const s = await tx.get<ScanV2>(`events/${event.id}/scans`, scan.id);
    if (!s || s.reopenedAt || s.keptAt) throw new ConflictError();
    const cur = await tx.get<TicketV2>('tickets', ticket.id);
    if (!cur) throw new ConflictError();
    const n = (cur.entries || 0) + 1;
    const amount = order.reduce((sum, t) => sum + (t.price || 0), 0);
    for (const t of order) {
      const base = { status: 'valid', paymentStatus: (t.price || 0) > 0 ? 'pending' : 'free', ...((t.price || 0) > 0 ? { payLater: true, payLaterAt: at, payLaterBy: actor } : {}), updatedAt: at };
      tx.update('tickets', t.id, t.id === ticket.id ? { ...base, scans: push({ at, by: actor }), entries: inc(1) } : base);
    }
    tx.update(`events/${event.id}/scans`, scan.id, { reopenedBy: actor, reopenedAt: at });
    const sid = `${ticket.id}-${n}`;
    const result: ScanResult = amount ? 'payLater' : 'ok';
    tx.set(`events/${event.id}/scans`, sid, { eventId: event.id, ticketId: ticket.id, orderId: ticket.orderId, name: ticketName(ticket), phone: ticket.ownerPhone, meta: amount ? `${ticketWord(order.length)} · ${amount} ₪ · נפתח מחדש` : 'נפתח מחדש', result, ...(amount ? { amount, method: '' } : {}), count: order.length, by: actor, at, reopenedBy: null, reopenedAt: null });
    await bumpCounters(tx, event.id, at, { entered: n === 1 ? 1 : 0, scans: 1, rejected: -1, ...(amount ? { payLater: order.length, payLaterAmount: amount } : {}) });
  });
  logActivity(actor, 'ticket', ticket.orderId, 'reopened', `${ticket.ownerName} · ההזמנה נפתחה מחדש ונכנסו בשער · ${event.title}`, { subjectUid: ticket.ownerUid, eventId: event.id });
}
/** Y3 "נשאר דחוי": the manager saw it; it leaves "דורש אותך". */
export async function keepRejected(actor: Actor, eventId: string, scan: ScanV2) {
  await transact(async (tx) => {
    const s = await tx.get<ScanV2>(`events/${eventId}/scans`, scan.id);
    if (!s || s.reopenedAt) throw new ConflictError();
    tx.update(`events/${eventId}/scans`, scan.id, { keptBy: actor, keptAt: nowIso() });
  });
}

// ---------- stall ----------
export type { StallGuest };
export const tabQty = (tab: Tab) => tab.items.reduce((s, i) => s + (i.qty || 0), 0);
export const tabLast = (tab: Tab) => tab.items.reduce((m, i) => (i.at > m ? i.at : m), '') || tab.updatedAt;
export const isWalkInTab = (tab: Tab) => !tab.guestUid && !tab.ticketId;
export const tabName = (tab: Tab) => (isWalkInTab(tab) ? `לקוח בלי כרטיס: ${tab.guestName}` : tab.guestName);
export const ticketGuest = (t: Ticket): StallGuest => ({ uid: t.ownerUid, name: ticketName(t), phone: t.ownerPhone, ticketId: t.id });
const person = (s: string) => s.trim().toLowerCase();
/** The guest's open account, if they already have one (same ticket owner, or same phone for walk-ins). */
export function findOpenTab(tabs: Tab[], g: StallGuest) {
  const phone = digits(g.phone);
  const matching = tabs.filter((t) => t.status === 'open' && (g.uid ? t.guestUid === g.uid && person(t.guestName) === person(g.name) : g.ticketId ? t.ticketId === g.ticketId || (!!phone && digits(t.guestPhone) === phone && person(t.guestName) === person(g.name)) : !t.guestUid && !!phone && digits(t.guestPhone) === phone));
  return matching.find(hasTabPurchases) || matching[0];
}
/** The guest's open account id, or '' when there is none yet. Picking a buyer creates nothing: the account is opened by the
 *  first "רישום לחשבון" (sellToGuest), as in the old stall, so a guest never sees an empty "0 ₪ · פתוח" account. */
export const tabFor = (tabs: Tab[], g: StallGuest) => findOpenTab(tabs, g)?.id || '';
/** E8 "רישום לחשבון": adds the cart to the account without reading it first (works offline, two phones may add at once). */
export async function sellToTab(actor: Actor, tab: Tab, cart: { product: Product; qty: number }[]) {
  const items: TabItem[] = cart.filter((c) => c.qty > 0).map((c) => ({ productId: c.product.id, name: c.product.name, price: c.product.price, qty: c.qty, at: nowIso(), by: actor }));
  if (!items.length) return 0;
  await addTabItems(actor, tab, items);
  return items.reduce((s, i) => s + i.price * i.qty, 0);
}
/** The first sale to a buyer without an account: opens it (the rules need the empty account before its first item), then adds
 *  the cart. An account another phone opened meanwhile is used instead. */
export async function sellToGuest(actor: Actor, event: FarmEvent, tabs: Tab[], g: StallGuest, cart: { product: Product; qty: number }[]) {
  if (!cart.some((c) => c.qty > 0)) return { tab: null, total: 0 };
  const tab = findOpenTab(tabs, g) || await openTab(actor, event, g);
  const total = await sellToTab(actor, tab, cart);
  return { tab, total };
}
/** The buyer picked on E7 for a first sale, kept on this phone until "רישום לחשבון" opens the account (route /event/stall/new). */
const pendingKey = (eventId: string) => 'farm-stall-buyer-' + eventId;
export function rememberBuyer(eventId: string, g: StallGuest) { try { sessionStorage.setItem(pendingKey(eventId), JSON.stringify(g)); } catch { /* private mode */ } }
export function pendingBuyer(eventId: string): StallGuest | null {
  try { const v = sessionStorage.getItem(pendingKey(eventId)); const g = v ? JSON.parse(v) : null; return g && typeof g.name === 'string' ? g as StallGuest : null; } catch { return null; }
}
export function forgetBuyer(eventId: string) { try { sessionStorage.removeItem(pendingKey(eventId)); } catch { /* private mode */ } }
/** E7 search: one row per ticket holder (owner + holder name), as the old stall, not one per order. */
export function stallPeople(tickets: Ticket[], query: string) {
  const match = ticketMatcher(query);
  const people = new Map<string, Ticket[]>();
  for (const t of tickets) {
    if (t.status !== 'valid') continue;
    const key = JSON.stringify([t.ownerUid, person(ticketName(t))]);
    const g = people.get(key); if (g) g.push(t); else people.set(key, [t]);
  }
  return [...people.entries()].filter(([, g]) => g.some(match)).map(([key, g]) => ({ key, guest: ticketGuest(g[0]), tickets: g }));
}
export { removeTabItem, setTabStatus };
/** My sales today: one per "רישום לחשבון" (lines added together share the same second). */
export function mySales(tabs: Tab[], uid: string, today: string) {
  const keys = new Set<string>();
  for (const t of tabs) for (const i of t.items) if (i.by?.uid === uid && dateKeyOf(new Date(i.at)) === today) keys.add(t.id + i.at.slice(0, 19));
  return keys.size;
}
/** My scans today, from the tickets on this phone. */
export function myScans(tickets: Ticket[], uid: string, today: string) {
  let n = 0;
  for (const t of tickets) for (const s of t.scans || []) if (s.by?.uid === uid && dateKeyOf(new Date(s.at)) === today) n++;
  return n;
}

// ---------- live numbers (Y1, Y5) ----------
/** Entered and sold: the counters document when it exists (cheap to read live), the tickets otherwise. */
export function liveNumbers(tickets: TicketV2[], counters: Counters | null) {
  const valid = tickets.filter((t) => t.status === 'valid');
  const enteredTickets = valid.filter((t) => (t.entries || 0) > 0).length;
  const entered = counters?.entered ?? enteredTickets;
  const later = valid.filter((t) => t.payLater && t.paymentStatus === 'pending');
  return { total: valid.length, entered, waiting: Math.max(0, valid.length - entered), payLaterCount: later.length, payLaterAmount: later.reduce((s, t) => s + (t.price || 0), 0) };
}
/** Who is on a station now (by the hours "15:30-18:30"); everyone on it when nobody's hours cover now. */
export function onShift(st: Staffing | undefined, nowHHMM: string) {
  if (!st) return [];
  const now = st.people.filter((p) => { const m = /(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/.exec(p.hours || ''); if (!m) return false; const pad = (x: string) => x.padStart(5, '0'); return pad(m[1]) <= nowHHMM && nowHHMM < pad(m[2]); });
  return now.length ? now : st.people;
}

// ---------- closing (Y5) ----------
/** Noon of the next Israeli day, as an instant (handles summer time). */
export function nextNoon(fromIso: string) {
  const key = dateKeyOf(new Date(new Date(fromIso).getTime() + 86400_000));
  for (const off of ['+02:00', '+03:00']) {
    const d = new Date(`${key}T12:00:00${off}`);
    if (hhmm(d) === '12:00') return d.toISOString();
  }
  return new Date(`${key}T12:00:00+02:00`).toISOString();
}
export async function saveCash(actor: Actor, eventId: string, which: 'gate' | 'stall', amount: number, by: string) {
  await write.merge(countersCol(eventId), 'cash', { [which]: { amount, by, at: nowIso(), byActor: actor } });
  logActivity(actor, 'event', eventId, 'edited', `${which === 'gate' ? 'מזומן בשער' : 'מזומן בדוכן'} נספר: ${amount} ₪ · ${by}`, { eventId });
}
/** Closes the event: gate and stall stop (the rules refuse scans and tab writes on a closed event), the "אירוע" tab leaves the
 *  phones, open tabs and pay-later orders show as debts (V5 derives them). Reopen until noon the next day. */
export async function closeEvent(actor: Actor, event: FarmEvent, cash: Cash | null) {
  const at = nowIso();
  void cash; // already saved in counters/cash; the event document is public
  const closed: EventClose = { at, by: actor, reopenUntil: nextNoon(at) };
  await write.update('events', event.id, { closed, updatedAt: at });
  logActivity(actor, 'event', event.id, 'closed', `${event.title} נסגר`, { eventId: event.id });
}
export async function reopenEvent(actor: Actor, event: FarmEvent) {
  const at = nowIso();
  await write.update('events', event.id, { closed: null, reopenedAt: at, reopenedBy: actor, updatedAt: at });
  logActivity(actor, 'event', event.id, 'reopened', `${event.title} נפתח מחדש`, { eventId: event.id });
}

/** Demo QR codes (DEMO.md 7): the three sample tickets of the helper row on the demo gate. */
export const DEMO_QR = { ok: 'demo-o-2-2', pay: 'demo-o-19-1', bad: 'demo-o-9-1' } as const;
