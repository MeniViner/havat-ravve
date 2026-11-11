// Data access for events, tickets, visits, donations, stalls, settings, notifications and calendar.
import { useEffect, useState } from 'react';
import {
  collection, doc, onSnapshot, query, where, orderBy, limit, setDoc, updateDoc, deleteDoc, writeBatch, runTransaction,
  type QueryConstraint, type DocumentData,
} from 'firebase/firestore';
import { db, nowIso } from './firebase';
import { logActivity } from './activity';
import type {
  Actor, FarmEvent, Ticket, Visit, VisitStatus, Donation, Vendor, EventVendor, Product, Tab, TabItem, TabStatus, Settings,
  AppNotification, NotificationType, CalendarItem, Profile, PaymentStatus,
} from './types';
import { DEFAULT_SETTINGS } from './types';

function useQuery<T>(path: string, constraints: QueryConstraint[], enabled: boolean, key: string) {
  const [state, setState] = useState<{ items: T[]; loading: boolean; error: string }>({ items: [], loading: enabled, error: '' });
  useEffect(() => {
    if (!enabled) { setState({ items: [], loading: false, error: '' }); return; }
    setState((s) => ({ ...s, loading: true, error: '' }));
    return onSnapshot(query(collection(db, path), ...constraints), (snap) => {
      setState({ items: snap.docs.map((d) => ({ id: d.id, ...(d.data() as DocumentData) }) as T), loading: false, error: '' });
    }, (e) => setState({ items: [], loading: false, error: e.message }));
  }, [path, enabled, key]);
  return state;
}
function useDocument<T>(path: string, enabled: boolean) {
  const [state, setState] = useState<{ item: T | null; loading: boolean }>({ item: null, loading: enabled });
  useEffect(() => {
    if (!enabled) { setState({ item: null, loading: false }); return; }
    return onSnapshot(doc(db, path), (snap) => setState({ item: snap.exists() ? ({ id: snap.id, ...(snap.data() as DocumentData) } as T) : null, loading: false }), () => setState({ item: null, loading: false }));
  }, [path, enabled]);
  return state;
}
const newId = (col: string) => doc(collection(db, col)).id;
export const randomSecret = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');
export const fillTemplate = (t: string, vars: Record<string, string | number>) => Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`[${k}]`, String(v)), t);
export const waLink = (phone: string, text = '') => { const p = phone.replace(/\D/g, '').replace(/^0/, '972'); return `https://wa.me/${p}${text ? '?text=' + encodeURIComponent(text) : ''}`; };

// ---------- settings ----------
export function useSettings() {
  const { item, loading } = useDocument<Settings & { id: string }>('settings/app', true);
  return { settings: { ...DEFAULT_SETTINGS, ...(item || {}), payment: { ...DEFAULT_SETTINGS.payment, ...(item?.payment || {}) }, templates: { ...DEFAULT_SETTINGS.templates, ...(item?.templates || {}) } } as Settings, loading };
}
export async function saveSettings(actor: Actor, s: Settings) { await setDoc(doc(db, 'settings', 'app'), s); logActivity(actor, 'settings', 'app', 'saved', 'ההגדרות עודכנו'); }

// ---------- events ----------
export const useUpcomingEvents = () => useQuery<FarmEvent>('events', [where('published', '==', true), orderBy('start', 'asc')], true, 'upcoming');
export const useAllEvents = (enabled: boolean) => useQuery<FarmEvent>('events', [orderBy('start', 'desc')], enabled, 'all');
export const useEvent = (id: string, enabled = true) => useDocument<FarmEvent>('events/' + (id || '_'), enabled && !!id);
export type EventInput = Omit<FarmEvent, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'>;
export async function saveEvent(actor: Actor, data: EventInput, existing?: FarmEvent) {
  const now = nowIso();
  if (existing) {
    const { id, ...rest } = existing; await setDoc(doc(db, 'events', id), { ...rest, ...data, updatedAt: now });
    logActivity(actor, 'event', id, data.published !== existing.published ? (data.published ? 'published' : 'unpublished') : 'edited', data.title, { eventId: id });
    return id;
  }
  const id = newId('events');
  await setDoc(doc(db, 'events', id), { ...data, createdBy: actor, createdAt: now, updatedAt: now });
  logActivity(actor, 'event', id, 'created', data.title, { eventId: id });
  return id;
}
export async function deleteEvent(actor: Actor, event: FarmEvent) { await deleteDoc(doc(db, 'events', event.id)); logActivity(actor, 'event', event.id, 'deleted', event.title, { eventId: event.id }); }

// ---------- tickets ----------
export const useMyTickets = (uid: string, enabled: boolean) => useQuery<Ticket>('tickets', [where('ownerUid', '==', uid), orderBy('createdAt', 'desc')], enabled, 'my' + uid);
export const useEventTickets = (eventId: string, enabled: boolean) => useQuery<Ticket>('tickets', [where('eventId', '==', eventId), orderBy('createdAt', 'desc')], enabled, 'ev' + eventId);
export async function orderTickets(profile: Profile, event: FarmEvent, count: number, holders: string[], answers: Record<string, string>) {
  const batch = writeBatch(db);
  const orderId = newId('tickets');
  const now = nowIso();
  const paymentStatus: PaymentStatus = event.price > 0 ? 'pending' : 'free';
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const id = newId('tickets'); ids.push(id);
    const t: Omit<Ticket, 'id'> = {
      eventId: event.id, eventTitle: event.title, orderId, index: i + 1, total: count,
      ownerUid: profile.uid, ownerName: profile.displayName, ownerPhone: profile.phone, holderName: (holders[i] || '').trim(),
      secret: randomSecret(), price: event.price, paymentStatus, status: 'valid', scans: [], entries: 0, answers, createdAt: now, updatedAt: now,
    };
    batch.set(doc(db, 'tickets', id), t);
  }
  await batch.commit();
  logActivity({ uid: profile.uid, name: profile.displayName }, 'ticket', orderId, 'ordered', `${count} ${count === 1 ? 'כרטיס' : 'כרטיסים'} · ${event.title}`, { subjectUid: profile.uid, eventId: event.id });
  await notify('order', `הזמנה חדשה: ${event.title}`, `${profile.displayName} הזמין/ה ${count} ${count === 1 ? 'כרטיס' : 'כרטיסים'}`, `/manage/events/${event.id}/guests`, orderId).catch(() => {});
  return { orderId, ids };
}
export const qrPayload = (t: Ticket) => `HR1|${t.id}|${t.secret}`;
export function parseQr(s: string): { id: string; secret: string } | null {
  const m = /^HR1\|([A-Za-z0-9]+)\|([a-f0-9]+)$/.exec(s.trim());
  return m ? { id: m[1], secret: m[2] } : null;
}
export async function recordScan(ticket: Ticket, actor: Actor, paidOnsite = false) {
  const { id, ...rest } = ticket;
  const now = nowIso();
  await setDoc(doc(db, 'tickets', id), { ...rest, scans: [...rest.scans, { at: now, by: actor }], entries: rest.entries + 1, paymentStatus: paidOnsite ? 'paid_onsite' : rest.paymentStatus, updatedAt: now });
  logActivity(actor, 'ticket', id, 'scanned', `${ticket.holderName || ticket.ownerName} · כניסה ${rest.entries + 1}${paidOnsite ? ' · שולם במקום' : ''}`, { subjectUid: ticket.ownerUid, eventId: ticket.eventId });
}
export async function setTicketPayment(actor: Actor, ticket: Ticket, paymentStatus: PaymentStatus) {
  await updateDoc(doc(db, 'tickets', ticket.id), { paymentStatus, updatedAt: nowIso() });
  logActivity(actor, 'ticket', ticket.id, paymentStatus === 'cancelled' ? 'cancelled' : 'paid', `${ticket.ownerName} · ${ticket.eventTitle}`, { subjectUid: ticket.ownerUid, eventId: ticket.eventId });
}
export async function claimOrderPaid(tickets: Ticket[]) {
  const batch = writeBatch(db); const now = nowIso();
  for (const t of tickets) if (t.paymentStatus === 'pending') batch.update(doc(db, 'tickets', t.id), { paymentStatus: 'claimed', updatedAt: now });
  await batch.commit();
  const t = tickets[0];
  if (t) logActivity({ uid: t.ownerUid, name: t.ownerName }, 'ticket', t.orderId, 'claimed', `${tickets.length} כרטיסים · ${t.eventTitle}`, { subjectUid: t.ownerUid, eventId: t.eventId });
  if (t) await notify('claim', `תשלום הועבר: ${t.eventTitle}`, `${t.ownerName} סימן/ה שהעביר/ה תשלום על ${tickets.length} כרטיסים`, `/manage/events/${t.eventId}/guests`, t.orderId).catch(() => {});
}
export async function cancelTicket(actor: Actor, ticket: Ticket) {
  await updateDoc(doc(db, 'tickets', ticket.id), { status: 'cancelled', updatedAt: nowIso() });
  logActivity(actor, 'ticket', ticket.id, 'cancelled', `${ticket.ownerName} · כרטיס ${ticket.index}/${ticket.total} · ${ticket.eventTitle}`, { subjectUid: ticket.ownerUid, eventId: ticket.eventId });
}

// ---------- visits ----------
export const useMyVisits = (uid: string, enabled: boolean) => useQuery<Visit>('visits', [where('uid', '==', uid), orderBy('createdAt', 'desc')], enabled, 'myv' + uid);
export const useVisits = (enabled: boolean) => useQuery<Visit>('visits', [orderBy('createdAt', 'desc'), limit(300)], enabled, 'visits');
export async function createVisit(profile: Profile, data: { date: string; people: number; type: string; note: string }) {
  const now = nowIso(); const id = newId('visits');
  await setDoc(doc(db, 'visits', id), { uid: profile.uid, name: profile.displayName, phone: profile.phone, ...data, status: 'new', managerNote: '', handledBy: null, createdAt: now, updatedAt: now });
  logActivity({ uid: profile.uid, name: profile.displayName }, 'visit', id, 'requested', `${data.people} אנשים · ${data.type} · ${data.date}`, { subjectUid: profile.uid });
  await notify('visit', 'בקשת ביקור חדשה', `${profile.displayName} · ${data.people} אנשים · ${new Date(data.date + 'T12:00:00').toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })}`, '/manage/visits', id).catch(() => {});
  return id;
}
export async function setVisitStatus(v: Visit, actor: Actor, status: VisitStatus, managerNote: string) {
  await updateDoc(doc(db, 'visits', v.id), { status, managerNote, handledBy: actor, updatedAt: nowIso() });
  logActivity(actor, 'visit', v.id, status, `${v.name} · ${v.date}${managerNote ? ' · ' + managerNote : ''}`, { subjectUid: v.uid });
}
export async function cancelVisit(v: Visit) {
  await updateDoc(doc(db, 'visits', v.id), { status: 'cancelled', updatedAt: nowIso() });
  logActivity({ uid: v.uid, name: v.name }, 'visit', v.id, 'cancelled', `${v.name} · ${v.date}`, { subjectUid: v.uid });
}

// ---------- donations ----------
export const useMyDonations = (uid: string, enabled: boolean) => useQuery<Donation>('donations', [where('uid', '==', uid), orderBy('createdAt', 'desc')], enabled, 'myd' + uid);
export const useDonations = (enabled: boolean) => useQuery<Donation>('donations', [orderBy('createdAt', 'desc'), limit(500)], enabled, 'donations');
export async function createDonation(profile: Profile, data: { amount: number; label: string; note: string; memorial: string; receiptWanted: boolean; receiptName: string }) {
  const now = nowIso(); const id = newId('donations');
  await setDoc(doc(db, 'donations', id), { uid: profile.uid, name: profile.displayName, phone: profile.phone, ...data, receiptSent: false, paymentStatus: 'pending', createdAt: now, updatedAt: now });
  logActivity({ uid: profile.uid, name: profile.displayName }, 'donation', id, 'created', `${data.amount} ₪${data.memorial ? ' · לזכר ' + data.memorial : ''}`, { subjectUid: profile.uid });
  await notify('donation', 'תרומה חדשה', `${profile.displayName} · ${data.amount} ₪${data.memorial ? ' · הנצחה' : ''}`, '/manage/donations', id).catch(() => {});
  if (data.receiptWanted) await notify('receipt', 'בקשה לקבלה', `${data.receiptName || profile.displayName} · ${data.amount} ₪`, '/manage/donations', id).catch(() => {});
  return id;
}
export async function claimDonationPaid(d: Donation) {
  await updateDoc(doc(db, 'donations', d.id), { paymentStatus: 'claimed', updatedAt: nowIso() });
  logActivity({ uid: d.uid, name: d.name }, 'donation', d.id, 'claimed', `${d.amount} ₪`, { subjectUid: d.uid });
}
export async function setDonation(actor: Actor, d: Donation, patch: Partial<Pick<Donation, 'paymentStatus' | 'receiptSent'>>) {
  await updateDoc(doc(db, 'donations', d.id), { ...patch, updatedAt: nowIso() });
  logActivity(actor, 'donation', d.id, patch.receiptSent ? 'receipt' : patch.paymentStatus === 'paid' ? 'paid' : 'edited', `${d.name} · ${d.amount} ₪`, { subjectUid: d.uid });
}

// ---------- vendors & products ----------
export const useVendors = (enabled: boolean) => useQuery<Vendor>('vendors', [orderBy('name')], enabled, 'vendors');
export async function saveVendor(data: Omit<Vendor, 'id' | 'createdAt' | 'updatedAt'>, existing?: Vendor) {
  const now = nowIso();
  if (existing) await updateDoc(doc(db, 'vendors', existing.id), { ...data, updatedAt: now });
  else await setDoc(doc(db, 'vendors', newId('vendors')), { ...data, createdAt: now, updatedAt: now });
}
export const deleteVendor = (id: string) => deleteDoc(doc(db, 'vendors', id));
export const useEventVendors = (eventId: string, enabled: boolean) => useQuery<EventVendor>(`events/${eventId || '_'}/vendors`, [orderBy('name')], enabled && !!eventId, 'evv' + eventId);
export const setEventVendor = (eventId: string, v: Vendor, confirmed: boolean, notes = '') => setDoc(doc(db, 'events', eventId, 'vendors', v.id), { vendorId: v.id, name: v.name, confirmed, notes });
export const removeEventVendor = (eventId: string, vendorId: string) => deleteDoc(doc(db, 'events', eventId, 'vendors', vendorId));
export const useProducts = (eventId: string, enabled: boolean) => useQuery<Product>(`events/${eventId || '_'}/products`, [orderBy('sort')], enabled && !!eventId, 'prod' + eventId);
export async function saveProduct(eventId: string, data: Omit<Product, 'id'>, existing?: Product) {
  await setDoc(doc(db, 'events', eventId, 'products', existing?.id || newId('products')), data);
}
export const deleteProduct = (eventId: string, id: string) => deleteDoc(doc(db, 'events', eventId, 'products', id));
export async function copyProducts(fromEventId: string, toEventId: string, products: Product[]) {
  const batch = writeBatch(db);
  for (const p of products) { const { id, ...rest } = p; batch.set(doc(db, 'events', toEventId, 'products', id), rest); }
  await batch.commit();
}

// ---------- tabs (open accounts at the farm stall) ----------
export const useEventTabs = (eventId: string, enabled: boolean) => useQuery<Tab>('tabs', [where('eventId', '==', eventId), orderBy('createdAt', 'desc')], enabled && !!eventId, 'tabs' + eventId);
export const useMyTabs = (uid: string, enabled: boolean) => useQuery<Tab>('tabs', [where('guestUid', '==', uid), orderBy('createdAt', 'desc')], enabled, 'mytabs' + uid);
export const useOpenTabs = (enabled: boolean) => useQuery<Tab>('tabs', [where('status', 'in', ['open', 'claimed']), orderBy('createdAt', 'desc'), limit(500)], enabled, 'opentabs');
export async function openTab(actor: Actor, event: FarmEvent, guest: { uid: string; name: string; phone: string; ticketId: string }) {
  const now = nowIso(); const id = newId('tabs');
  await setDoc(doc(db, 'tabs', id), { eventId: event.id, eventTitle: event.title, guestUid: guest.uid, guestName: guest.name, guestPhone: guest.phone, ticketId: guest.ticketId, items: [], total: 0, status: 'open', createdBy: actor, createdAt: now, updatedAt: now });
  logActivity(actor, 'tab', id, 'opened', `${guest.name} · ${event.title}`, { subjectUid: guest.uid, eventId: event.id });
  return id;
}
export async function addTabItems(actor: Actor, tab: Tab, items: TabItem[]) {
  const tabId = tab.id;
  logActivity(actor, 'tab', tabId, 'item', `${tab.guestName}: ${items.map((i) => `${i.name}${i.qty > 1 ? ' ×' + i.qty : ''}`).join(', ')} · ${items.reduce((s, i) => s + i.price * i.qty, 0)} ₪`, { subjectUid: tab.guestUid, eventId: tab.eventId });
  await runTransaction(db, async (tx) => {
    const ref = doc(db, 'tabs', tabId);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw Error('החשבון לא נמצא');
    const cur = snap.data() as Tab;
    const next = [...cur.items, ...items];
    tx.update(ref, { items: next, total: Math.round(next.reduce((s, i) => s + i.price * i.qty, 0) * 100) / 100, updatedAt: nowIso() });
  });
}
export async function removeTabItem(actor: Actor, tab: Tab, index: number) {
  const next = tab.items.filter((_, i) => i !== index);
  await updateDoc(doc(db, 'tabs', tab.id), { items: next, total: Math.round(next.reduce((s, i) => s + i.price * i.qty, 0) * 100) / 100, updatedAt: nowIso() });
  logActivity(actor, 'tab', tab.id, 'removed', `${tab.guestName}: ${tab.items[index]?.name || ''}`, { subjectUid: tab.guestUid, eventId: tab.eventId });
}
export async function setTabStatus(actor: Actor, tab: Tab, status: TabStatus) {
  await updateDoc(doc(db, 'tabs', tab.id), { status, updatedAt: nowIso() });
  logActivity(actor, 'tab', tab.id, status === 'paid' ? 'paid' : status === 'waived' ? 'waived' : 'edited', `${tab.guestName} · ${tab.total} ₪ · ${tab.eventTitle}`, { subjectUid: tab.guestUid, eventId: tab.eventId });
}
export async function claimTabPaid(tab: Tab) {
  await updateDoc(doc(db, 'tabs', tab.id), { status: 'claimed', updatedAt: nowIso() });
  logActivity({ uid: tab.guestUid, name: tab.guestName }, 'tab', tab.id, 'claimed', `${tab.total} ₪ · ${tab.eventTitle}`, { subjectUid: tab.guestUid, eventId: tab.eventId });
  await notify('tab', `תשלום דוכן הועבר: ${tab.eventTitle}`, `${tab.guestName} · ${tab.total} ₪`, `/manage/events/${tab.eventId}/tabs`, tab.id).catch(() => {});
}

// ---------- notifications (manager queue) ----------
export const useNotifications = (enabled: boolean) => useQuery<AppNotification>('notifications', [where('handled', '==', false), orderBy('createdAt', 'desc'), limit(200)], enabled, 'notif');
export const useHandledNotifications = (enabled: boolean) => useQuery<AppNotification>('notifications', [where('handled', '==', true), orderBy('createdAt', 'desc'), limit(100)], enabled, 'notifh');
export function notify(type: NotificationType, title: string, text: string, link: string, refId: string) {
  return setDoc(doc(db, 'notifications', newId('notifications')), { type, title, text, link, refId, createdAt: nowIso(), handled: false, handledBy: null, handledAt: null });
}
export const handleNotification = (n: AppNotification, actor: Actor, handled = true) => updateDoc(doc(db, 'notifications', n.id), handled ? { handled: true, handledBy: actor, handledAt: nowIso() } : { handled: false, handledBy: null, handledAt: null });

// ---------- calendar ----------
export const useCalendar = (enabled: boolean, fromDate: string, toDate: string) => useQuery<CalendarItem>('calendar', [where('date', '>=', fromDate), where('date', '<=', toDate), orderBy('date')], enabled, 'cal' + fromDate + toDate);
export async function saveCalendarItem(actor: Actor, data: { title: string; date: string; time: string }, existing?: CalendarItem) {
  if (existing) await updateDoc(doc(db, 'calendar', existing.id), data);
  else await setDoc(doc(db, 'calendar', newId('calendar')), { ...data, ownerUid: actor.uid, ownerName: actor.name, kind: 'manual', refId: '', createdAt: nowIso() });
}
export const deleteCalendarItem = (id: string) => deleteDoc(doc(db, 'calendar', id));
export async function upsertCalendarRef(actor: Actor, kind: 'visit' | 'event', refId: string, data: { title: string; date: string; time: string }) {
  await setDoc(doc(db, 'calendar', `${kind}_${refId}`), { ...data, ownerUid: actor.uid, ownerName: actor.name, kind, refId, createdAt: nowIso() });
}
export const deleteCalendarRef = (kind: 'visit' | 'event', refId: string) => deleteDoc(doc(db, 'calendar', `${kind}_${refId}`)).catch(() => {});

// ---------- export ----------
export function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s; };
  const csv = '﻿' + [headers, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
