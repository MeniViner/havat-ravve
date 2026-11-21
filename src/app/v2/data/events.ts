// Events area data: listeners and writes for M3-M7, N9-N12, V3-V5. Everything goes through db.ts (offline-first writes,
// transact for read-modify-write) and reuses the shared helpers in data.ts so the guest app and site keep reading the same fields.
// New, optional fields (see docs/redesign-data/events.md): products.unit, tickets.reminderSentAt, tabs.reminderSentAt / claimedAt,
// files.mime / size, events/{id}/staffing/{station}.
import { useMemo } from 'react';
import { useList, useDoc, write, transact, newId, ConflictError, serverNow } from '../../db';
import { nowIso } from '../../clock';
import { logActivity } from '../../activity';
import {
  setOrderPayment, setTabStatus, handleNotificationsFor, randomSecret, saveEvent, deleteEvent, upsertCalendarRef, deleteCalendarRef, type EventInput,
} from '../../data';
import { eventCalendarFields } from '../../calendarRef';
import { notify } from './notify';
import { dayName, ddmm } from '../format';
import type { Actor, AppNotification, CalendarItem, FarmEvent, PaymentStatus, Product, Staffing, Tab, Task, Ticket } from '../../types';
import { hoursText, type EventDebt } from '../screens/events/logic';

// ---------- listeners ----------
const none = <T,>() => ({ items: [] as T[], loading: false, error: '' });
export const useTicketsIn = (ids: string[], enabled = true) => {
  const key = ids.slice(0, 30);
  const r = useList<Ticket>('tickets', { where: [['eventId', 'in', key]] }, enabled && key.length > 0);
  return key.length ? r : none<Ticket>();
};
export const useTabsIn = (ids: string[], enabled = true) => {
  const key = ids.slice(0, 30);
  const r = useList<Tab>('tabs', { where: [['eventId', 'in', key]] }, enabled && key.length > 0);
  return key.length ? r : none<Tab>();
};
export const useEventTasks = (eventId: string, enabled = true) => useList<Task>('tasks', { where: [['eventId', '==', eventId]] }, enabled && !!eventId);
export const useStaffing = (eventId: string, enabled = true) => useList<Staffing>(`events/${eventId || '_'}/staffing`, {}, enabled && !!eventId);
/** Presence entries of one day (V4 "פנויים באותו יום"). */
export function usePresenceOn(dateKey: string, enabled = true) {
  const r = useList<CalendarItem>('calendar', { where: [['date', '==', dateKey]] }, enabled && !!dateKey);
  return useMemo(() => r.items.filter((c) => c.kind === 'presence'), [r.items]);
}
export type EventFileV2 = { id: string; name: string; url: string; kind: 'doc' | 'image'; by: Actor; at: string; mime?: string; size?: number };
export const useFiles = (eventId: string, enabled = true) => useList<EventFileV2>(`events/${eventId || '_'}/files`, {}, enabled && !!eventId);
export type ProductV2 = Product & { unit?: string };

// ---------- event ----------
/** Saves the event (data.ts saveEvent: activity log and publishedAt) and keeps the calendar entry in step. */
export async function saveEventV2(actor: Actor, data: EventInput, existing?: FarmEvent): Promise<string> {
  const id = await saveEvent(actor, data, existing);
  if (data.published) await upsertCalendarRef(actor, 'event', id, eventCalendarFields(data)); else await deleteCalendarRef('event', id);
  return id;
}
export async function deleteEventV2(actor: Actor, e: FarmEvent) {
  await deleteEvent(actor, e);
  await deleteCalendarRef('event', e.id);
}

// ---------- guests (M5) ----------
/** Approves orders as paid (the guest said they transferred). Returns the tickets as they were, for undo. */
export async function approveOrders(actor: Actor, orders: Ticket[][], open: AppNotification[]): Promise<Ticket[][]> {
  const before = orders.map((o) => o.map((t) => ({ ...t })));
  for (const o of orders) {
    const owing = o.filter((t) => t.paymentStatus === 'pending' || t.paymentStatus === 'claimed');
    if (!owing.length) continue;
    await setOrderPayment(actor, owing, 'paid');
    await handleNotificationsFor(open, o[0].orderId, actor);
  }
  return before;
}
/** A manager adds a registration by hand (phone call, walk-in). The rules let a person create only their own tickets,
 *  so the manager is the owner; the guest's name and phone are on the tickets. */
export async function addGuestOrder(actor: Actor, e: FarmEvent, g: { name: string; phone: string; count: number; paid: boolean }) {
  const orderId = newId('tickets');
  const now = nowIso();
  const status: PaymentStatus = e.price > 0 ? 'pending' : 'free';
  const ids: string[] = [];
  const ops = Array.from({ length: g.count }, (_, i) => {
    const id = newId('tickets'); ids.push(id);
    const t: Omit<Ticket, 'id'> = {
      eventId: e.id, eventTitle: e.title, orderId, index: i + 1, total: g.count, ownerUid: actor.uid, ownerName: g.name.trim(), ownerPhone: g.phone.trim(),
      holderName: '', secret: randomSecret(), price: e.price, paymentStatus: status, status: 'valid', scans: [], entries: 0, answers: {}, createdAt: now, updatedAt: now,
    };
    return { op: 'set' as const, col: 'tickets', id, data: t as unknown as Record<string, unknown> };
  });
  await write.batch(ops);
  logActivity(actor, 'ticket', orderId, 'ordered', `${g.name.trim()} · ${g.count} כרטיסים · ${e.title} · נוסף/ה על ידי ${actor.name}`, { eventId: e.id });
  if (g.paid && e.price > 0) {
    await write.batch(ids.map((id) => ({ op: 'update' as const, col: 'tickets', id, data: { paymentStatus: 'paid', paidAt: serverNow(), updatedAt: now } })));
    logActivity(actor, 'ticket', orderId, 'paid', `${g.name.trim()} · ${e.title} · ${e.price * g.count} ₪ · ${g.count} כרטיסים`, { eventId: e.id });
  }
  return orderId;
}

// ---------- reminders (V5, M5, N12) ----------
/** Stamps reminderSentAt on the documents behind a reminder (tickets of an order, or a tab). */
export async function stampReminder(kind: 'tickets' | 'tab', ids: string[]) {
  const at = nowIso();
  await write.batch(ids.map((id) => ({ op: 'update' as const, col: kind === 'tab' ? 'tabs' : 'tickets', id, data: { reminderSentAt: at } })));
}
/** Trust-based approval of debts: tickets become paid, tabs paid; open notifications about them are closed. */
export async function approveDebts(actor: Actor, debts: EventDebt[], tickets: Ticket[], tabs: Tab[], open: AppNotification[]) {
  for (const d of debts) {
    if (d.kind === 'tickets') {
      const list = tickets.filter((t) => d.ids.includes(t.id));
      if (list.length) await setOrderPayment(actor, list, 'paid');
    } else {
      const t = tabs.find((x) => x.id === d.refId);
      if (t) await setTabStatus(actor, t, 'paid');
    }
    await handleNotificationsFor(open, d.refId, actor);
  }
}

// ---------- products (N9, N10) ----------
export async function saveProductV2(eventId: string, data: { name: string; price: number; active: boolean; sort: number; unit?: string }, existing?: ProductV2) {
  const id = existing?.id || newId('products');
  const doc: Record<string, unknown> = { name: data.name.trim(), price: data.price, active: data.active, sort: data.sort };
  if (data.unit?.trim()) doc.unit = data.unit.trim();
  await write.set(`events/${eventId}/products`, id, doc);
  return id;
}
export const setProductActive = (eventId: string, p: ProductV2, active: boolean) => write.update(`events/${eventId}/products`, p.id, { active });

// ---------- files (V3) ----------
export async function addFileV2(eventId: string, f: Omit<EventFileV2, 'id'>) {
  const id = newId('files');
  const doc: Record<string, unknown> = { name: f.name, url: f.url, kind: f.kind, by: f.by, at: f.at };
  if (f.mime) doc.mime = f.mime;
  if (f.size) doc.size = f.size;
  await write.set(`events/${eventId}/files`, id, doc);
  return id;
}
export const removeFileV2 = (eventId: string, id: string) => write.remove(`events/${eventId}/files`, id);

// ---------- staffing (V4) ----------
type Person = Staffing['people'][number];
/** Read-modify-write of one station: two managers assigning at once never overwrite each other. */
async function changeStation(eventId: string, station: { id: string; station: string; needed?: number }, fn: (people: Person[]) => Person[]) {
  const col = `events/${eventId}/staffing`;
  await transact(async (tx) => {
    const cur = await tx.get<Staffing>(col, station.id);
    const people = fn(cur?.people ? [...cur.people] : []);
    tx.set(col, station.id, { station: cur?.station || station.station, people, needed: cur?.needed ?? station.needed ?? 1 });
  });
}
export async function assignToStation(actor: Actor, e: FarmEvent, station: { id: string; station: string; needed?: number }, person: Person) {
  await changeStation(e.id, station, (people) => {
    if (people.some((p) => p.uid === person.uid)) throw new ConflictError('לא נשמר. כבר משובץ בעמדה הזאת.');
    return [...people, person];
  });
  logActivity(actor, 'event', e.id, 'edited', `${e.title}: ${person.name} שובץ/ה ל${station.station}${person.hours ? ' · ' + hoursText(person.hours) : ''}`, { eventId: e.id, subjectUid: person.uid });
  await notify([person.uid], {
    kind: 'event', title: `${e.title}: ${station.station}`, sub: `${dayName(e.start)} ${ddmm(e.start)}${person.hours ? ' · ' + hoursText(person.hours) : ''}`,
    link: `/farm/events/${e.id}`, refId: e.id, by: actor,
  }).catch(() => {});
}
export async function updateStationPerson(actor: Actor, e: FarmEvent, station: { id: string; station: string }, uid: string, hours: string) {
  await changeStation(e.id, station, (people) => people.map((p) => (p.uid === uid ? { ...p, hours } : p)));
  logActivity(actor, 'event', e.id, 'edited', `${e.title}: שעות ב${station.station} עודכנו`, { eventId: e.id, subjectUid: uid });
}
export async function removeFromStation(actor: Actor, e: FarmEvent, station: { id: string; station: string }, person: Person) {
  await changeStation(e.id, station, (people) => people.filter((p) => p.uid !== person.uid));
  logActivity(actor, 'event', e.id, 'edited', `${e.title}: ${person.name} הוסר/ה מ${station.station}`, { eventId: e.id, subjectUid: person.uid });
}

// ---------- tabs (N12) ----------
export const tabClaimedAt = (t: Tab) => (t as Tab & { claimedAt?: string }).claimedAt || t.updatedAt;
export async function approveTab(actor: Actor, t: Tab, open: AppNotification[]) {
  await setTabStatus(actor, t, 'paid');
  await handleNotificationsFor(open, t.id, actor);
}
