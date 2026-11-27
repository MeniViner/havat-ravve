// Data access for events, tickets, visits, donations, stalls, settings, notifications and calendar.
import { useList, useDoc, useSwitchesSnapshot, write, newId, push, pull, inc, serverNow } from './db';
import { nowIso } from './firebase';
import { activityOp, logActivity } from './activity';
import type {
  Actor, FarmEvent, Ticket, Visit, VisitStatus, Donation, Vendor, EventVendor, Product, Tab, TabItem, TabStatus, Settings,
  AppNotification, NotificationType, CalendarItem, CalendarKind, Profile, PaymentStatus, ReceiptPreference,
} from './types';
import { DEFAULT_SETTINGS, RECEIPT_PREFERENCE_FIELD } from './types';
import { nowMs } from './clock';
import { needsSignedStallSale, localStallLog, submitStallCart, type CheckoutOptions } from './v2/data/stallCheckout';
import type { SaleLine } from '../../shared/stall-sale';
import { isoFromLocal } from './v2/screens/events/logic';

export const randomSecret = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');
export const fillTemplate = (t: string, vars: Record<string, string | number>) => Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`[${k}]`, String(v)), t);
export const waLink = (phone: string, text = '') => { const p = phone.replace(/\D/g, '').replace(/^0/, '972'); return `https://wa.me/${p}${text ? '?text=' + encodeURIComponent(text) : ''}`; };
export const telLink = (phone: string) => 'tel:' + phone.replace(/[^\d+]/g, '');
export const contactPhoneOk = (phone: string) => /^\+?[\d(). -]+$/.test(phone) && /^\d{9,15}$/.test(phone.replace(/\D/g, ''));
export const receiptDestination = (profile: Pick<Profile, 'phone' | 'email'>, method: ReceiptPreference) =>
  method === 'whatsapp' ? (contactPhoneOk(profile.phone) ? profile.phone : '') : (/^[^\s@?&/#]+@[^\s@?&/#]+\.[^\s@?&/#]+$/.test(profile.email) ? profile.email : '');
export function receiptPreference(profile?: Pick<Profile, 'fields' | 'phone' | 'email'> | null) {
  const value = profile?.fields?.[RECEIPT_PREFERENCE_FIELD];
  return profile && (value === 'whatsapp' || value === 'email') && receiptDestination(profile, value) ? value : undefined;
}

/** A write that settles a payment stamps paidAt, which the Worker's confirmation email follows. */
const paidStamp = (status: string) => (status === 'paid' || status === 'paid_onsite' ? { paidAt: serverNow() } : {});

// ---------- settings ----------
export function useSettings() {
  const { item, loading, error } = useDoc<Settings & { id: string }>('settings/app', true);
  return { settings: { ...DEFAULT_SETTINGS, ...item, payment: { ...DEFAULT_SETTINGS.payment, ...item?.payment }, templates: { ...DEFAULT_SETTINGS.templates, ...item?.templates }, contact: { ...DEFAULT_SETTINGS.contact, ...item?.contact } }, loading, error };
}

/** The owners' switches from the console (switches.ts); written only by the Worker. */
export const useSwitchesDoc = () => useSwitchesSnapshot<{ id: string; maintenance?: boolean; maintenanceText?: string; registrationClosed?: boolean; readOnly?: boolean }>();

/** Merge a section of settings, including when the document has never been saved. */
export async function saveSettingsPart(actor: Actor, patch: Partial<Settings>, what = 'ההגדרות עודכנו') {
  await write.merge('settings', 'app', patch);
  logActivity(actor, 'settings', 'app', 'saved', what);
}

// ---------- events ----------
export const useUpcomingEvents = () => useList<FarmEvent>('events', { where: [['published', '==', true]], orderBy: [['start', 'asc']] }, true);
export const useAllEvents = (enabled: boolean) => useList<FarmEvent>('events', { orderBy: [['start', 'desc']] }, enabled);
export const useEvent = (id: string, enabled = true) => useDoc<FarmEvent>('events/' + (id || '_'), enabled && !!id);
export type EventInput = Omit<FarmEvent, 'id' | 'createdBy' | 'createdAt' | 'updatedAt' | 'publishedAt'>;
/** Old API events may use Jerusalem wall time; current entries carry an explicit time zone. */
function eventMillis(value: string) {
  if (!value) return NaN;
  if (/(Z|[+-]\d\d:\d\d)$/i.test(value)) return Date.parse(value);
  const wall = /^(\d{4}-\d{2}-\d{2})T((?:[01]\d|2[0-3]):[0-5]\d)(?::([0-5]\d)(?:[.](\d{3}))?)?$/.exec(value);
  if (!wall || !Number.isFinite(Date.parse(wall[1] + 'T00:00:00Z'))) return NaN;
  const day = new Date(wall[1] + 'T00:00:00Z');
  if (day.toISOString().slice(0,10) !== wall[1]) return NaN;
  return Date.parse(isoFromLocal(wall[1], wall[2])) + Number(wall[3] || 0) * 1000 + Number(wall[4] || 0);
}
export async function saveEvent(actor: Actor, data: EventInput, existing?: FarmEvent) {
  const now = nowIso();
  const end = eventMillis(data.end), start = eventMillis(data.start);
  if (data.published && (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)) throw new Error('לפרסום צריך מועד סיום אחרי ההתחלה.');
  if (data.published && !existing?.published && end <= nowMs()) throw new Error('מועד הסיום כבר חלף.');
  const publication = data.published && !existing?.published ? { publishedAt: now } : {};
  if (existing) {
    await write.update('events', existing.id, { ...data, ...publication, updatedAt: now });
    logActivity(actor, 'event', existing.id, data.published !== existing.published ? (data.published ? 'published' : 'unpublished') : 'edited', data.title, { eventId: existing.id });
    return existing.id;
  }
  const id = newId('events');
  await write.set('events', id, { ...data, ...publication, createdBy: actor, createdAt: now, updatedAt: now });
  logActivity(actor, 'event', id, 'created', data.title, { eventId: id });
  return id;
}
export async function deleteEvent(actor: Actor, event: FarmEvent) { await write.remove('events', event.id); logActivity(actor, 'event', event.id, 'deleted', event.title, { eventId: event.id }); }

// ---------- tickets ----------
export const useMyTickets = (uid: string, enabled: boolean) => useList<Ticket>('tickets', { where: [['ownerUid', '==', uid]], orderBy: [['createdAt', 'desc']] }, enabled && !!uid);
export const useEventTickets = (eventId: string, enabled: boolean) => useList<Ticket>('tickets', { where: [['eventId', '==', eventId]], orderBy: [['createdAt', 'desc']] }, enabled && !!eventId);
/** Tickets of several events in one listener (the events list). Firestore allows up to 30 ids in one query. */
export const useTicketsOfEvents = (eventIds: string[], enabled: boolean) => useList<Ticket>('tickets', { where: [['eventId', 'in', eventIds.slice(0, 30)]] }, enabled && eventIds.length > 0);
/** Puts every ticket of an order back exactly as it was (undo of "paid" or of a cancellation). */
export async function restoreOrder(actor: Actor, before: Ticket[]) {
  const now = nowIso();
  await write.batch(before.map((t) => ({ op: 'update' as const, col: 'tickets', id: t.id, data: { paymentStatus: t.paymentStatus, status: t.status, ...paidStamp(t.paymentStatus), updatedAt: now } })));
  const t = before[0];
  if (t) logActivity(actor, 'ticket', t.orderId, 'edited', `בוטלה הפעולה האחרונה · ${t.ownerName} · ${t.eventTitle}`, { subjectUid: t.ownerUid, eventId: t.eventId });
}
export const useOpenTickets = (enabled: boolean) => useList<Ticket>('tickets', { where: [['paymentStatus', 'in', ['pending', 'claimed']]], orderBy: [['createdAt', 'desc']], limit: 500 }, enabled);
export async function orderTickets(profile: Profile, event: FarmEvent, count: number, holders: string[], answers: Record<string, string>) {
  const end = eventMillis(event.end);
  if (!event.published || !event.open || (event as FarmEvent & { closed?: unknown }).closed || !Number.isFinite(end) || end <= nowMs()) throw new Error('ההרשמה לאירוע הסתיימה או סגורה.');
  if (!Number.isInteger(count) || count < 1 || count > event.maxPerOrder) throw new Error('כמות הכרטיסים אינה מתאימה להזמנה.');
  const orderId = newId('tickets');
  const now = nowIso();
  const paymentStatus: PaymentStatus = event.price > 0 ? 'pending' : 'free';
  const ids: string[] = [];
  const ops = Array.from({ length: count }, (_, i) => {
    const id = newId('tickets'); ids.push(id);
    const t: Omit<Ticket, 'id'> = {
      eventId: event.id, eventTitle: event.title, orderId, index: i + 1, total: count,
      ownerUid: profile.uid, selfRegistered: true, ownerName: profile.displayName, ownerPhone: profile.phone, holderName: (holders[i] || '').trim(),
      secret: randomSecret(), price: event.price, paymentStatus, status: 'valid', scans: [], entries: 0, answers, createdAt: now, updatedAt: now,
    };
    return { op: 'set' as const, col: 'tickets', id, data: t as unknown as Record<string, unknown> };
  });
  await write.batch(ops);
  logActivity({ uid: profile.uid, name: profile.displayName }, 'ticket', orderId, 'ordered', `${count} ${count === 1 ? 'כרטיס' : 'כרטיסים'} · ${event.title}`, { subjectUid: profile.uid, eventId: event.id });
  await notify('order', `הזמנה חדשה: ${event.title}`, `${profile.displayName} הזמין/ה ${count} ${count === 1 ? 'כרטיס' : 'כרטיסים'}`, `/manage/events/${event.id}/guests`, orderId).catch(() => {});
  return { orderId, ids };
}
export const qrPayload = (t: Ticket) => `HR1|${t.id}|${t.secret}`;
export function parseQr(s: string): { id: string; secret: string } | null {
  const m = /^HR1\|([A-Za-z0-9_-]+)\|([a-f0-9]+)$/.exec(s.trim());
  return m ? { id: m[1], secret: m[2] } : null;
}
export async function recordScan(ticket: Ticket, actor: Actor, paidOnsite = false) {
  const now = nowIso();
  // increments on the server's copy: two gates scanning the same ticket both count, and nothing is refused
  await write.update('tickets', ticket.id, { scans: push({ at: now, by: actor }), entries: inc(1), ...(paidOnsite ? { paymentStatus: 'paid_onsite', paidAt: serverNow() } : {}), updatedAt: now });
  logActivity(actor, 'ticket', ticket.id, 'scanned', `${ticket.holderName || ticket.ownerName} · כניסה ${ticket.entries + 1}${paidOnsite ? ' · שולם במקום' : ''}`, { subjectUid: ticket.ownerUid, eventId: ticket.eventId });
}
export async function setTicketPayment(actor: Actor, ticket: Ticket, paymentStatus: PaymentStatus) {
  await write.update('tickets', ticket.id, { paymentStatus, ...paidStamp(paymentStatus), updatedAt: nowIso() });
  logActivity(actor, 'ticket', ticket.id, paymentStatus === 'cancelled' ? 'cancelled' : 'paid', `${ticket.ownerName} · ${ticket.eventTitle}`, { subjectUid: ticket.ownerUid, eventId: ticket.eventId });
}
/** Marks a whole order (all tickets with the same orderId) with one payment status. */
export async function setOrderPayment(actor: Actor, tickets: Ticket[], paymentStatus: PaymentStatus) {
  const now = nowIso();
  await write.batch(tickets.map((t) => ({ op: 'update' as const, col: 'tickets', id: t.id, data: { paymentStatus, ...paidStamp(paymentStatus), updatedAt: now } })));
  const t = tickets[0];
  if (t) logActivity(actor, 'ticket', t.orderId, 'paid', `${t.ownerName} · ${t.eventTitle} · ${t.price * tickets.length} ₪ · ${tickets.length} כרטיסים`, { subjectUid: t.ownerUid, eventId: t.eventId });
}
/** Paid at the gate or found by name: marks the unpaid tickets of an order as paid on site, without counting an entry.
 *  The rules let a volunteer change exactly this (pending/claimed -> paid_onsite). */
export async function payOrderOnsite(actor: Actor, tickets: Ticket[]) {
  const owing = tickets.filter((t) => t.status === 'valid' && (t.paymentStatus === 'pending' || t.paymentStatus === 'claimed'));
  if (!owing.length) return;
  const now = nowIso();
  await write.batch(owing.map((t) => ({ op: 'update' as const, col: 'tickets', id: t.id, data: { paymentStatus: 'paid_onsite', paidAt: serverNow(), updatedAt: now } })));
  const t = owing[0];
  logActivity(actor, 'ticket', t.orderId, 'paid', `${t.ownerName} · ${t.eventTitle} · ${t.price * owing.length} ₪ · שולם במקום`, { subjectUid: t.ownerUid, eventId: t.eventId });
}
export async function claimOrderPaid(tickets: Ticket[]) {
  const now = nowIso();
  await write.batch(tickets.filter((t) => t.paymentStatus === 'pending').map((t) => ({ op: 'update' as const, col: 'tickets', id: t.id, data: { paymentStatus: 'claimed', updatedAt: now } })));
  const t = tickets[0];
  if (t) logActivity({ uid: t.ownerUid, name: t.ownerName }, 'ticket', t.orderId, 'claimed', `${tickets.length} כרטיסים · ${t.eventTitle}`, { subjectUid: t.ownerUid, eventId: t.eventId });
  if (t) await notify('claim', `תשלום הועבר: ${t.eventTitle}`, `${t.ownerName} סימן/ה שהעביר/ה תשלום על ${tickets.length} כרטיסים`, `/manage/events/${t.eventId}/guests`, t.orderId).catch(() => {});
}
export async function cancelTicket(actor: Actor, ticket: Ticket, reason = '') {
  await write.update('tickets', ticket.id, { status: 'cancelled', paymentStatus: 'cancelled', updatedAt: nowIso() });
  logActivity(actor, 'ticket', ticket.id, 'cancelled', `${ticket.ownerName} · כרטיס ${ticket.index}/${ticket.total} · ${ticket.eventTitle}${reason ? ' · "' + reason + '"' : ''}`, { subjectUid: ticket.ownerUid, eventId: ticket.eventId });
}
/** A guest cancels their own order. The rules allow it only for tickets that were never scanned, and only the status may change. */
export async function cancelOwnOrder(tickets: Ticket[]) {
  const live = tickets.filter((t) => t.status === 'valid'); const t = live[0]; if (!t) return;
  const now = nowIso();
  await write.batch(live.map((x) => ({ op: 'update' as const, col: 'tickets', id: x.id, data: { status: 'cancelled', updatedAt: now } })));
  logActivity({ uid: t.ownerUid, name: t.ownerName }, 'ticket', t.orderId, 'cancelled', `${t.ownerName} ביטל/ה ${live.length} כרטיסים · ${t.eventTitle}`, { subjectUid: t.ownerUid, eventId: t.eventId });
  await notify('order', `הזמנה בוטלה: ${t.eventTitle}`, `${t.ownerName} ביטל/ה ${live.length} ${live.length === 1 ? 'כרטיס' : 'כרטיסים'}`, `/manage/events/${t.eventId}/guests`, t.orderId).catch(() => {});
}
export async function cancelOrder(actor: Actor, tickets: Ticket[], reason = '') {
  const now = nowIso();
  await write.batch(tickets.map((t) => ({ op: 'update' as const, col: 'tickets', id: t.id, data: { status: 'cancelled', paymentStatus: 'cancelled', updatedAt: now } })));
  const t = tickets[0];
  if (t) logActivity(actor, 'ticket', t.orderId, 'cancelled', `${t.ownerName} · ${tickets.length} כרטיסים · ${t.eventTitle}${reason ? ' · "' + reason + '"' : ''}`, { subjectUid: t.ownerUid, eventId: t.eventId });
}

// ---------- visits ----------
export const useMyVisits = (uid: string, enabled: boolean) => useList<Visit>('visits', { where: [['uid', '==', uid]], orderBy: [['createdAt', 'desc']] }, enabled && !!uid);
export const useVisits = (enabled: boolean) => useList<Visit>('visits', { orderBy: [['createdAt', 'desc']], limit: 300 }, enabled);
export const useVisit = (id: string, enabled = true) => useDoc<Visit>('visits/' + (id || '_'), enabled && !!id);
export async function createVisit(profile: Profile, data: { date: string; people: number; type: string; note: string }) {
  const now = nowIso(); const id = newId('visits');
  await write.set('visits', id, { uid: profile.uid, name: profile.displayName, phone: profile.phone, ...data, status: 'new', managerNote: '', handledBy: null, createdAt: now, updatedAt: now });
  logActivity({ uid: profile.uid, name: profile.displayName }, 'visit', id, 'requested', `${data.people} אנשים · ${data.type} · ${data.date}`, { subjectUid: profile.uid });
  await notify('visit', 'בקשת ביקור חדשה', `${profile.displayName} · ${data.people} אנשים · ${new Date(data.date + 'T12:00:00').toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })}`, `/manage/visits/${id}`, id).catch(() => {});
  return id;
}
export async function setVisitStatus(v: Visit, actor: Actor, status: VisitStatus, managerNote: string) {
  await write.update('visits', v.id, { status, managerNote, handledBy: actor, updatedAt: nowIso() });
  logActivity(actor, 'visit', v.id, status, `${v.name} · ${v.date}${managerNote ? ' · ' + managerNote : ''}`, { subjectUid: v.uid });
}
/** A manager's decision on a visit, as one write: the status, the calendar entry and the open "לטיפול" items land together or not at all. */
export async function decideVisit(v: Visit, actor: Actor, status: VisitStatus, managerNote: string, time: string, open: AppNotification[]) {
  const now = nowIso();
  await write.batch([
    { op: 'update', col: 'visits', id: v.id, data: { status, managerNote, handledBy: actor, updatedAt: now } },
    status === 'approved'
      ? { op: 'set', col: 'calendar', id: `visit_${v.id}`, data: { title: `ביקור: ${v.name} · ${v.people}`, date: v.date, time, ownerUid: actor.uid, ownerName: actor.name, audience: 'all', kind: 'visit', refId: v.id, createdAt: now } }
      : { op: 'remove', col: 'calendar', id: `visit_${v.id}` },
    ...open.filter((n) => n.refId === v.id).map((n) => ({ op: 'update' as const, col: 'notifications', id: n.id, data: status === 'new' ? { handled: false, handledBy: null, handledAt: null } : { handled: true, handledBy: actor, handledAt: now } })),
  ]);
  logActivity(actor, 'visit', v.id, status, `${v.name} · ${v.date}${time ? ' · ' + time : ''}${managerNote ? ' · ' + managerNote : ''}`, { subjectUid: v.uid });
}
export async function cancelVisit(v: Visit) {
  await write.update('visits', v.id, { status: 'cancelled', updatedAt: nowIso() });
  logActivity({ uid: v.uid, name: v.name }, 'visit', v.id, 'cancelled', `${v.name} · ${v.date}`, { subjectUid: v.uid });
}

// ---------- donations ----------
export const useMyDonations = (uid: string, enabled: boolean) => useList<Donation>('donations', { where: [['uid', '==', uid]], orderBy: [['createdAt', 'desc']] }, enabled && !!uid);
export const useDonations = (enabled: boolean) => useList<Donation>('donations', { orderBy: [['createdAt', 'desc']], limit: 500 }, enabled);
export const useDonation = (id: string, enabled = true) => useDoc<Donation>('donations/' + (id || '_'), enabled && !!id);
export async function createDonation(profile: Profile, data: { amount: number; label: string; note: string; memorial: string; receiptWanted: boolean; receiptName: string }) {
  const now = nowIso(); const id = newId('donations');
  await write.set('donations', id, { uid: profile.uid, name: profile.displayName, phone: profile.phone, ...data, receiptSent: false, paymentStatus: 'pending', createdAt: now, updatedAt: now });
  logActivity({ uid: profile.uid, name: profile.displayName }, 'donation', id, 'created', `${data.amount} ₪${data.memorial ? ' · לזכר ' + data.memorial : ''}`, { subjectUid: profile.uid });
  await notify('donation', 'תרומה חדשה', `${profile.displayName} · ${data.amount} ₪${data.memorial ? ' · הנצחה' : ''}`, `/manage/donations/${id}`, id).catch(() => {});
  if (data.receiptWanted) await notify('receipt', 'בקשה לקבלה', `${data.receiptName || profile.displayName} · ${data.amount} ₪`, `/manage/donations/${id}`, id).catch(() => {});
  return id;
}
export async function claimDonationPaid(d: Donation) {
  await write.update('donations', d.id, { paymentStatus: 'claimed', updatedAt: nowIso() });
  logActivity({ uid: d.uid, name: d.name }, 'donation', d.id, 'claimed', `${d.amount} ₪`, { subjectUid: d.uid });
  await notify('claim', 'תרומה הועברה', `${d.name} סימן/ה שהעביר/ה ${d.amount} ₪`, `/manage/donations/${d.id}`, d.id).catch(() => {});
}
export async function setDonation(actor: Actor, d: Donation, patch: Partial<Pick<Donation, 'paymentStatus' | 'receiptSent'>>) {
  await write.update('donations', d.id, { ...patch, ...(patch.paymentStatus ? paidStamp(patch.paymentStatus) : {}), updatedAt: nowIso() });
  logActivity(actor, 'donation', d.id, patch.receiptSent ? 'receipt' : patch.paymentStatus === 'paid' ? 'paid' : 'edited', `${d.name} · ${d.amount} ₪`, { subjectUid: d.uid });
}

// ---------- vendors & products ----------
export const useVendors = (enabled: boolean) => useList<Vendor>('vendors', { orderBy: [['name', 'asc']] }, enabled);
export const useVendor = (id: string, enabled = true) => useDoc<Vendor>('vendors/' + (id || '_'), enabled && !!id);
export async function saveVendor(data: Omit<Vendor, 'id' | 'createdAt' | 'updatedAt'>, existing?: Vendor) {
  const now = nowIso();
  if (existing) { await write.update('vendors', existing.id, { ...data, updatedAt: now }); return existing.id; }
  const id = newId('vendors'); await write.set('vendors', id, { ...data, createdAt: now, updatedAt: now }); return id;
}
export const deleteVendor = (id: string) => write.remove('vendors', id);
export const useEventVendors = (eventId: string, enabled: boolean) => useList<EventVendor>(`events/${eventId || '_'}/vendors`, { orderBy: [['name', 'asc']] }, enabled && !!eventId);
export const setEventVendor = (eventId: string, v: Vendor, confirmed: boolean, notes = '') => write.set(`events/${eventId}/vendors`, v.id, { vendorId: v.id, name: v.name, confirmed, notes });
export const removeEventVendor = (eventId: string, vendorId: string) => write.remove(`events/${eventId}/vendors`, vendorId);
export const useProducts = (eventId: string, enabled: boolean) => useList<Product>(`events/${eventId || '_'}/products`, { orderBy: [['sort', 'asc']] }, enabled && !!eventId);
export async function saveProduct(eventId: string, data: Omit<Product, 'id'>, existing?: Product) {
  const id = existing?.id || newId('products');
  await write.set(`events/${eventId}/products`, id, data);
  return id;
}
export const deleteProduct = (eventId: string, id: string) => write.remove(`events/${eventId}/products`, id);
export { copyFarmProducts as copyProducts } from './v2/data/farmCatalogs';
/** Saves the whole order in one write, so two taps can never leave two products with the same place. */
export async function setProductOrder(eventId: string, ordered: Product[]) {
  await write.batch(ordered.map((p, i) => ({ op: 'update' as const, col: `events/${eventId}/products`, id: p.id, data: { sort: i + 1 } })));
}

// ---------- event files (links to documents; managers only, kept out of the public event document) ----------
export type EventFileDoc = import('./types').EventFile & { id: string };
export const useEventFiles = (eventId: string, enabled: boolean) => useList<EventFileDoc>(`events/${eventId || '_'}/files`, {}, enabled && !!eventId);
export async function addEventFile(eventId: string, file: import('./types').EventFile) {
  const id = newId('files'); await write.set(`events/${eventId}/files`, id, { ...file }); return id;
}
export const removeEventFile = (eventId: string, fileId: string) => write.remove(`events/${eventId}/files`, fileId);
/** Older events kept their file links inside the event document, which every guest can read. Moves them out, once. */
export async function migrateEventFiles(actor: Actor, event: FarmEvent) {
  const old = event.files || []; if (!old.length) return;
  await write.batch([
    ...old.map((f) => ({ op: 'set' as const, col: `events/${event.id}/files`, id: newId('files'), data: { ...f } })),
    { op: 'update' as const, col: 'events', id: event.id, data: { files: [], updatedAt: nowIso() } },
  ]);
  logActivity(actor, 'event', event.id, 'edited', `${event.title}: קישורי הקבצים הועברו למקום שרק מנהלים רואים`, { eventId: event.id });
}

// ---------- tabs (open accounts at the farm stall) ----------
export const useEventTabs = (eventId: string, enabled: boolean) => useList<Tab>('tabs', { where: [['eventId', '==', eventId]], orderBy: [['createdAt', 'desc']] }, enabled && !!eventId);
export const useMyTabs = (uid: string, enabled: boolean) => useList<Tab>('tabs', { where: [['guestUid', '==', uid]], orderBy: [['createdAt', 'desc']] }, enabled && !!uid);
export const useOpenTabs = (enabled: boolean) => useList<Tab>('tabs', { where: [['status', 'in', ['open', 'claimed']]], orderBy: [['createdAt', 'desc']], limit: 500 }, enabled);
export const useTab = (id: string, enabled = true) => useDoc<Tab>('tabs/' + (id || '_'), enabled && !!id);
export type StallGuest = { uid: string; name: string; phone: string; ticketId: string };
export const hasTabPurchases = (tab: Tab) => tab.items.length > 0 || tab.total > 0;
export const isOpenTab = (tab: Tab) => tab.status === 'open' && hasTabPurchases(tab);
const sum = (items: TabItem[]) => Math.round(items.reduce((s, i) => s + i.price * i.qty, 0) * 100) / 100;

/** The rules require the empty account to exist before the first item update. */
export async function openTab(actor: Actor, event: FarmEvent, guest: StallGuest): Promise<Tab> {
  const now = nowIso();
  const id = newId('tabs');
  const tab: Omit<Tab, 'id'> = {
    eventId: event.id, eventTitle: event.title, guestUid: guest.uid, guestName: guest.name,
    guestPhone: guest.phone, ticketId: guest.ticketId, items: [], total: 0, status: 'open',
    createdBy: actor, createdAt: now, updatedAt: now,
  };
  await write.set('tabs', id, tab);
  logActivity(actor, 'tab', id, 'opened', `${guest.name} · ${event.title}`, { subjectUid: guest.uid, eventId: event.id });
  return { ...tab, id };
}

/** Catalog sales commit their verified snapshots together. One-off events keep their offline atomic increments. */
export async function addTabItems(actor: Actor, tab: Tab, items: TabItem[], options: CheckoutOptions = {}, snapshotItems?: SaleLine[]) {
  if (!items.length) return 0;
  const lines = snapshotItems || items.map(({productId,qty,price})=>({productId,qty,price}));
  const request = {eventId:tab.eventId,tabId:tab.id,items:lines};
  if (await needsSignedStallSale(actor,request,options)) return (await submitStallCart(actor,request,options)).total;
  // each line gets its own moment, so two identical products added together stay two lines
  const base = nowMs();
  const stamped = items.map((i, k) => ({ ...i, at: new Date(base + k).toISOString(), ...(options.operationId ? {saleOperation:options.operationId.toLowerCase()} : {}) }));
  if (options.operationId) {
    const {id,result}=await localStallLog(actor,options.operationId,{eventId:tab.eventId,tabId:tab.id,items:lines});
    if (result) return result.total;
    const history=activityOp(actor,'tab',tab.id,'item',tab.guestName+': '+items.map(i=>i.name+(i.qty>1?' ×'+i.qty:'')).join(', ')+' · '+sum(stamped)+' ₪',{subjectUid:tab.guestUid,eventId:tab.eventId});
    // This activity is create-only. Replaying the same offline batch cannot increment the account twice.
    await write.batch([{op:'update',col:'tabs',id:tab.id,data:{items:push(...stamped),total:inc(sum(stamped)),updatedAt:nowIso()}},{...history,id}]);
    return sum(stamped);
  }
  await write.update('tabs', tab.id, { items: push(...stamped), total: inc(sum(stamped)), updatedAt: nowIso() });
  logActivity(actor, 'tab', tab.id, 'item', `${tab.guestName}: ${items.map((i) => `${i.name}${i.qty > 1 ? ' ×' + i.qty : ''}`).join(', ')} · ${sum(items)} ₪`, { subjectUid: tab.guestUid, eventId: tab.eventId });
  return sum(stamped);
}
/** Removes exactly that line, whatever the other phones added meanwhile. */
export async function removeTabItem(actor: Actor, tab: Tab, index: number, reason = '') {
  const item = tab.items[index]; if (!item) return;
  await write.update('tabs', tab.id, { items: pull(item), total: inc(-sum([item])), updatedAt: nowIso() });
  logActivity(actor, 'tab', tab.id, 'removed', `${tab.guestName}: ${item.name}${reason ? ' · "' + reason + '"' : ''}`, { subjectUid: tab.guestUid, eventId: tab.eventId });
}
export async function setTabStatus(actor: Actor, tab: Tab, status: TabStatus, note = '') {
  await write.update('tabs', tab.id, { status, ...paidStamp(status), updatedAt: nowIso() });
  logActivity(actor, 'tab', tab.id, status === 'paid' ? 'paid' : status === 'waived' ? 'waived' : 'edited', `${tab.guestName} · ${tab.total} ₪ · ${tab.eventTitle}${note ? ' · "' + note + '"' : ''}`, { subjectUid: tab.guestUid, eventId: tab.eventId });
}
export async function claimTabPaid(tab: Tab) {
  await write.update('tabs', tab.id, { status: 'claimed', updatedAt: nowIso() });
  logActivity({ uid: tab.guestUid, name: tab.guestName }, 'tab', tab.id, 'claimed', `${tab.total} ₪ · ${tab.eventTitle}`, { subjectUid: tab.guestUid, eventId: tab.eventId });
  await notify('tab', `תשלום דוכן הועבר: ${tab.eventTitle}`, `${tab.guestName} · ${tab.total} ₪`, `/manage/events/${tab.eventId}/tabs/${tab.id}`, tab.id).catch(() => {});
}

/** An order has one confirmation, recorded on each of its paid tickets together. */
export async function markPaymentConfirmation(actor: Actor, collection: 'tickets' | 'donations' | 'tabs', ids: string[]) {
  const at = nowIso();
  if (!ids.length) return;
  await write.batch([
    ...ids.map((id) => ({ op: 'update' as const, col: collection, id, data: { paymentConfirmation: { by: actor, at }, updatedAt: at } })),
    activityOp(actor, 'inbox', ids[0], 'saved', 'תיעוד שליחת אישור תשלום'),
  ]);
}

// ---------- notifications (manager queue) ----------
export const useNotifications = (enabled: boolean) => useList<AppNotification>('notifications', { where: [['handled', '==', false]], orderBy: [['createdAt', 'desc']], limit: 200 }, enabled);
export const useHandledNotifications = (enabled: boolean) => useList<AppNotification>('notifications', { where: [['handled', '==', true]], orderBy: [['createdAt', 'desc']], limit: 100 }, enabled);
export function notify(type: NotificationType, title: string, text: string, link: string, refId: string) {
  return write.set('notifications', newId('notifications'), { type, title, text, link, refId, createdAt: nowIso(), handled: false, handledBy: null, handledAt: null });
}
export const handleNotification = (n: AppNotification, actor: Actor, handled = true) => write.batch([
  { op: 'update', col: 'notifications', id: n.id, data: handled ? { handled: true, handledBy: actor, handledAt: nowIso() } : { handled: false, handledBy: null, handledAt: null } },
  activityOp(actor, 'inbox', n.id, 'edited', handled ? 'פריט סומן כטופל' : 'פריט חזר לטיפול'),
]);
/** Closes every open notification that points at a record (after the manager acted on it). */
export async function handleNotificationsFor(open: AppNotification[], refId: string, actor: Actor) {
  const now = nowIso();
  await write.batch(open.filter((n) => n.refId === refId).map((n) => ({ op: 'update' as const, col: 'notifications', id: n.id, data: { handled: true, handledBy: actor, handledAt: now } })));
}

// ---------- calendar ----------
export const useCalendar = (enabled: boolean, fromDate: string, toDate: string) => useList<CalendarItem>('calendar', { where: [['date', '>=', fromDate], ['date', '<=', toDate]], orderBy: [['date', 'asc']] }, enabled);
export const useCalendarItem = (id: string, enabled: boolean) => useDoc<CalendarItem>(`calendar/${id}`, enabled);
export type CalendarDraft = Pick<CalendarItem, 'title' | 'date' | 'time'> & { kind: Exclude<CalendarKind, 'visit' | 'event'> };
export async function saveCalendarItem(owner: Actor, data: CalendarDraft, existing?: CalendarItem) {
  const ownership = { ownerUid: owner.uid, ownerName: owner.name };
  if (existing) {
    const patch = owner.uid === existing.ownerUid ? data : { ...data, ...ownership };
    await write.update('calendar', existing.id, patch);
  } else {
    await write.set('calendar', newId('calendar'), { ...data, ...ownership, refId: '', createdAt: nowIso() });
  }
}
export const deleteCalendarItem = (id: string) => write.remove('calendar', id);
export async function upsertCalendarRef(actor: Actor, kind: 'visit' | 'event', refId: string, data: { title: string; date: string; time: string }) {
  await write.set('calendar', `${kind}_${refId}`, { ...data, ownerUid: actor.uid, ownerName: actor.name, audience:'all', kind, refId, createdAt: nowIso() });
}
export const deleteCalendarRef = (kind: 'visit' | 'event', refId: string) => write.remove('calendar', `${kind}_${refId}`).catch(() => {});

// ---------- export ----------
export function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s; };
  const csv = '﻿' + [headers, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
