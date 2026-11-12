// Data access for events, tickets, visits, donations, stalls, settings, notifications and calendar.
import { useList, useDoc, write, newId, push, pull, inc } from './db';
import { nowIso } from './firebase';
import { logActivity } from './activity';
import type {
  Actor, FarmEvent, Ticket, Visit, VisitStatus, Donation, Vendor, EventVendor, Product, Tab, TabItem, TabStatus, Settings,
  AppNotification, NotificationType, CalendarItem, Profile, PaymentStatus,
} from './types';
import { DEFAULT_SETTINGS } from './types';

export const randomSecret = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');
export const fillTemplate = (t: string, vars: Record<string, string | number>) => Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`[${k}]`, String(v)), t);
export const waLink = (phone: string, text = '') => { const p = phone.replace(/\D/g, '').replace(/^0/, '972'); return `https://wa.me/${p}${text ? '?text=' + encodeURIComponent(text) : ''}`; };
export const telLink = (phone: string) => 'tel:' + phone.replace(/[^\d+]/g, '');

// ---------- settings ----------
export function useSettings() {
  const { item, loading } = useDoc<Settings & { id: string }>('settings/app', true);
  return { settings: { ...DEFAULT_SETTINGS, ...(item || {}), payment: { ...DEFAULT_SETTINGS.payment, ...(item?.payment || {}) }, templates: { ...DEFAULT_SETTINGS.templates, ...(item?.templates || {}) } } as Settings, loading };
}
export async function saveSettings(actor: Actor, s: Settings) { const { ...data } = s as Settings & { id?: string }; delete (data as { id?: string }).id; await write.set('settings', 'app', data); logActivity(actor, 'settings', 'app', 'saved', 'ההגדרות עודכנו'); }

/** Saves one part of the settings and nothing else, so a page opened before the settings loaded, or a second manager on
 *  another page, can never overwrite the rest with defaults. `exists` = the settings document is already on the server. */
export async function saveSettingsPart(actor: Actor, patch: Partial<Settings>, exists: boolean, what: string) {
  if (exists) await write.update('settings', 'app', patch as Record<string, unknown>); else await write.set('settings', 'app', patch as Record<string, unknown>);
  logActivity(actor, 'settings', 'app', 'saved', what);
}

// ---------- events ----------
export const useUpcomingEvents = () => useList<FarmEvent>('events', { where: [['published', '==', true]], orderBy: [['start', 'asc']] }, true);
export const useAllEvents = (enabled: boolean) => useList<FarmEvent>('events', { orderBy: [['start', 'desc']] }, enabled);
export const useEvent = (id: string, enabled = true) => useDoc<FarmEvent>('events/' + (id || '_'), enabled && !!id);
export type EventInput = Omit<FarmEvent, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'>;
export async function saveEvent(actor: Actor, data: EventInput, existing?: FarmEvent) {
  const now = nowIso();
  if (existing) {
    await write.update('events', existing.id, { ...data, updatedAt: now });
    logActivity(actor, 'event', existing.id, data.published !== existing.published ? (data.published ? 'published' : 'unpublished') : 'edited', data.title, { eventId: existing.id });
    return existing.id;
  }
  const id = newId('events');
  await write.set('events', id, { ...data, createdBy: actor, createdAt: now, updatedAt: now });
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
  await write.batch(before.map((t) => ({ op: 'update' as const, col: 'tickets', id: t.id, data: { paymentStatus: t.paymentStatus, status: t.status, updatedAt: now } })));
  const t = before[0];
  if (t) logActivity(actor, 'ticket', t.orderId, 'edited', `בוטלה הפעולה האחרונה · ${t.ownerName} · ${t.eventTitle}`, { subjectUid: t.ownerUid, eventId: t.eventId });
}
export const useOpenTickets = (enabled: boolean) => useList<Ticket>('tickets', { where: [['paymentStatus', 'in', ['pending', 'claimed']]], orderBy: [['createdAt', 'desc']], limit: 500 }, enabled);
export async function orderTickets(profile: Profile, event: FarmEvent, count: number, holders: string[], answers: Record<string, string>) {
  const orderId = newId('tickets');
  const now = nowIso();
  const paymentStatus: PaymentStatus = event.price > 0 ? 'pending' : 'free';
  const ids: string[] = [];
  const ops = Array.from({ length: count }, (_, i) => {
    const id = newId('tickets'); ids.push(id);
    const t: Omit<Ticket, 'id'> = {
      eventId: event.id, eventTitle: event.title, orderId, index: i + 1, total: count,
      ownerUid: profile.uid, ownerName: profile.displayName, ownerPhone: profile.phone, holderName: (holders[i] || '').trim(),
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
  await write.update('tickets', ticket.id, { scans: push({ at: now, by: actor }), entries: inc(1), ...(paidOnsite ? { paymentStatus: 'paid_onsite' } : {}), updatedAt: now });
  logActivity(actor, 'ticket', ticket.id, 'scanned', `${ticket.holderName || ticket.ownerName} · כניסה ${ticket.entries + 1}${paidOnsite ? ' · שולם במקום' : ''}`, { subjectUid: ticket.ownerUid, eventId: ticket.eventId });
}
export async function setTicketPayment(actor: Actor, ticket: Ticket, paymentStatus: PaymentStatus) {
  await write.update('tickets', ticket.id, { paymentStatus, updatedAt: nowIso() });
  logActivity(actor, 'ticket', ticket.id, paymentStatus === 'cancelled' ? 'cancelled' : 'paid', `${ticket.ownerName} · ${ticket.eventTitle}`, { subjectUid: ticket.ownerUid, eventId: ticket.eventId });
}
/** Marks a whole order (all tickets with the same orderId) with one payment status. */
export async function setOrderPayment(actor: Actor, tickets: Ticket[], paymentStatus: PaymentStatus) {
  const now = nowIso();
  await write.batch(tickets.map((t) => ({ op: 'update' as const, col: 'tickets', id: t.id, data: { paymentStatus, updatedAt: now } })));
  const t = tickets[0];
  if (t) logActivity(actor, 'ticket', t.orderId, 'paid', `${t.ownerName} · ${t.eventTitle} · ${t.price * tickets.length} ₪ · ${tickets.length} כרטיסים`, { subjectUid: t.ownerUid, eventId: t.eventId });
}
/** Paid at the gate or found by name: marks the unpaid tickets of an order as paid on site, without counting an entry.
 *  The rules let a volunteer change exactly this (pending/claimed -> paid_onsite). */
export async function payOrderOnsite(actor: Actor, tickets: Ticket[]) {
  const owing = tickets.filter((t) => t.status === 'valid' && (t.paymentStatus === 'pending' || t.paymentStatus === 'claimed'));
  if (!owing.length) return;
  const now = nowIso();
  await write.batch(owing.map((t) => ({ op: 'update' as const, col: 'tickets', id: t.id, data: { paymentStatus: 'paid_onsite', updatedAt: now } })));
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
      ? { op: 'set', col: 'calendar', id: `visit_${v.id}`, data: { title: `ביקור: ${v.name} · ${v.people}`, date: v.date, time, ownerUid: actor.uid, ownerName: actor.name, kind: 'visit', refId: v.id, createdAt: now } }
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
  await write.update('donations', d.id, { ...patch, updatedAt: nowIso() });
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
/** Copies products into another event as new documents, placed after the ones that event already has. */
export async function copyProducts(_fromEventId: string, toEventId: string, products: Product[], after = 0) {
  const sorted = [...products].sort((x, y) => x.sort - y.sort);
  await write.batch(sorted.map((p, i) => ({ op: 'set' as const, col: `events/${toEventId}/products`, id: newId('products'), data: { name: p.name, price: p.price, active: p.active, sort: after + i + 1 } })));
}
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
export async function openTab(actor: Actor, event: FarmEvent, guest: { uid: string; name: string; phone: string; ticketId: string }) {
  const now = nowIso(); const id = newId('tabs');
  await write.set('tabs', id, { eventId: event.id, eventTitle: event.title, guestUid: guest.uid, guestName: guest.name, guestPhone: guest.phone, ticketId: guest.ticketId, items: [], total: 0, status: 'open', createdBy: actor, createdAt: now, updatedAt: now });
  logActivity(actor, 'tab', id, 'opened', `${guest.name} · ${event.title}`, { subjectUid: guest.uid, eventId: event.id });
  return id;
}
const sum = (items: TabItem[]) => Math.round(items.reduce((s, i) => s + i.price * i.qty, 0) * 100) / 100;
/** Adds to the tab without reading it first: works without reception, and two volunteers can add to the same tab at once. */
export async function addTabItems(actor: Actor, tab: Tab, items: TabItem[]) {
  // each line gets its own moment, so two identical products added together stay two lines
  const base = Date.now();
  const stamped = items.map((i, k) => ({ ...i, at: new Date(base + k).toISOString() }));
  await write.update('tabs', tab.id, { items: push(...stamped), total: inc(sum(stamped)), updatedAt: nowIso() });
  logActivity(actor, 'tab', tab.id, 'item', `${tab.guestName}: ${items.map((i) => `${i.name}${i.qty > 1 ? ' ×' + i.qty : ''}`).join(', ')} · ${sum(items)} ₪`, { subjectUid: tab.guestUid, eventId: tab.eventId });
}
/** Removes exactly that line, whatever the other phones added meanwhile. */
export async function removeTabItem(actor: Actor, tab: Tab, index: number, reason = '') {
  const item = tab.items[index]; if (!item) return;
  await write.update('tabs', tab.id, { items: pull(item), total: inc(-sum([item])), updatedAt: nowIso() });
  logActivity(actor, 'tab', tab.id, 'removed', `${tab.guestName}: ${item.name}${reason ? ' · "' + reason + '"' : ''}`, { subjectUid: tab.guestUid, eventId: tab.eventId });
}
export async function setTabStatus(actor: Actor, tab: Tab, status: TabStatus, note = '') {
  await write.update('tabs', tab.id, { status, updatedAt: nowIso() });
  logActivity(actor, 'tab', tab.id, status === 'paid' ? 'paid' : status === 'waived' ? 'waived' : 'edited', `${tab.guestName} · ${tab.total} ₪ · ${tab.eventTitle}${note ? ' · "' + note + '"' : ''}`, { subjectUid: tab.guestUid, eventId: tab.eventId });
}
export async function claimTabPaid(tab: Tab) {
  await write.update('tabs', tab.id, { status: 'claimed', updatedAt: nowIso() });
  logActivity({ uid: tab.guestUid, name: tab.guestName }, 'tab', tab.id, 'claimed', `${tab.total} ₪ · ${tab.eventTitle}`, { subjectUid: tab.guestUid, eventId: tab.eventId });
  await notify('tab', `תשלום דוכן הועבר: ${tab.eventTitle}`, `${tab.guestName} · ${tab.total} ₪`, `/manage/events/${tab.eventId}/tabs/${tab.id}`, tab.id).catch(() => {});
}

// ---------- notifications (manager queue) ----------
export const useNotifications = (enabled: boolean) => useList<AppNotification>('notifications', { where: [['handled', '==', false]], orderBy: [['createdAt', 'desc']], limit: 200 }, enabled);
export const useHandledNotifications = (enabled: boolean) => useList<AppNotification>('notifications', { where: [['handled', '==', true]], orderBy: [['createdAt', 'desc']], limit: 100 }, enabled);
export function notify(type: NotificationType, title: string, text: string, link: string, refId: string) {
  return write.set('notifications', newId('notifications'), { type, title, text, link, refId, createdAt: nowIso(), handled: false, handledBy: null, handledAt: null });
}
export const handleNotification = (n: AppNotification, actor: Actor, handled = true) => write.update('notifications', n.id, handled ? { handled: true, handledBy: actor, handledAt: nowIso() } : { handled: false, handledBy: null, handledAt: null });
/** Closes every open notification that points at a record (after the manager acted on it). */
export async function handleNotificationsFor(open: AppNotification[], refId: string, actor: Actor) {
  const now = nowIso();
  await write.batch(open.filter((n) => n.refId === refId).map((n) => ({ op: 'update' as const, col: 'notifications', id: n.id, data: { handled: true, handledBy: actor, handledAt: now } })));
}

// ---------- calendar ----------
export const useCalendar = (enabled: boolean, fromDate: string, toDate: string) => useList<CalendarItem>('calendar', { where: [['date', '>=', fromDate], ['date', '<=', toDate]], orderBy: [['date', 'asc']] }, enabled);
export async function saveCalendarItem(actor: Actor, data: { title: string; date: string; time: string }, existing?: CalendarItem) {
  if (existing) await write.update('calendar', existing.id, data);
  else await write.set('calendar', newId('calendar'), { ...data, ownerUid: actor.uid, ownerName: actor.name, kind: 'manual', refId: '', createdAt: nowIso() });
}
export const deleteCalendarItem = (id: string) => write.remove('calendar', id);
export async function upsertCalendarRef(actor: Actor, kind: 'visit' | 'event', refId: string, data: { title: string; date: string; time: string }) {
  await write.set('calendar', `${kind}_${refId}`, { ...data, ownerUid: actor.uid, ownerName: actor.name, kind, refId, createdAt: nowIso() });
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
