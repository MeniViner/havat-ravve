// Events management in the redesigned app (M3-M7, N9-N12, V3-V5): src/app/v2/data/events.ts, closeEvent/reopenEvent in
// src/app/v2/data/eventday.ts and the shared writes in src/app/data.ts. Each operation writes what the app's function writes
// (fields, activity, notifications), in one transaction with the idempotency record. events.create/update/saveProduct and the
// payment writes that existed before stay in ../writes.ts.
import { invalid } from '../http';
import type { Param } from '../catalog';
import type { Doc, Write } from '../firestore';
import { type Person, IF_UPDATED_AT, activity, forbidden, fresh, isManager, member, mustGet, notFound, nowIso, project, whereEq } from '../core';
import { type Ctx, bool, def, en, eventIso, isoFromIL, opt, req, str } from '../writes';
import { notifyWrites } from '../notify';
import { autoId } from '../util';

// ---------- shared with eventday.ts and vendors.ts ----------
export const IFU = IF_UPDATED_AT as Param;
export const int = (min: number, max: number, he: string, required = false, dflt?: number): Param => ({ type: 'int', min, max, he, required, ...(dflt === undefined ? {} : { default: dflt }) });
export type Data = Record<string, unknown>;

const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const IL_PARTS = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', weekday: 'short', day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
/** The parts of an instant (or a stored event time in either format) in Israel, as src/app/v2/format.ts reads them. */
export function ilParts(v: unknown) {
  const p = IL_PARTS.formatToParts(new Date(eventIso(v)));
  const g = (t: string) => p.find((x) => x.type === t)?.value || '';
  return { wd: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(g('weekday')), day: Number(g('day')), month: Number(g('month')), year: Number(g('year')), hour: g('hour'), minute: g('minute') };
}
/** format.ts ddmm(): "5.12". */
export const ddmm = (v: unknown) => { const p = ilParts(v); return `${p.day}.${p.month}`; };
/** format.ts hhmm(): "08:15". */
export const hhmmIL = (v: unknown) => { const p = ilParts(v); return `${p.hour}:${p.minute}`; };
/** format.ts keyOf(): the Israeli date "YYYY-MM-DD". */
export const keyIL = (v: unknown) => { const p = ilParts(v); return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`; };
/** vendor.ts dayShort(): "שבת 28.11". */
export const dayShort = (v: unknown) => { const p = ilParts(v); return `${DAY_NAMES[p.wd]} ${p.day}.${p.month}`; };
/** An instant moved by some minutes (vendor.ts shift()). */
export const shiftIso = (v: unknown, min: number) => { const s = eventIso(v); return s ? new Date(Date.parse(s) + min * 60_000).toISOString() : ''; };

/** data.ts randomSecret(): the QR secret of a ticket, 24 hex characters. */
export const randomSecret = () => [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, '0')).join('');
/** A create or set that also stamps fields with the commit's server time (the app's serverNow(), e.g. paidAt). */
export const withServerTime = (w: Write, fields: string[]): Write => (fields.length ? { ...w, updateTransforms: fields.map((fieldPath) => ({ fieldPath, setToServerValue: 'REQUEST_TIME' })) } : w);

export async function eventFor(c: Ctx, id: string) { return mustGet(c.fs, 'events', id, c.tx, 'event'); }
/** handleNotificationsFor() (src/app/data.ts): every open item of the managers' inbox that points at the record, closed (or removed). */
export async function inboxFor(c: Ctx, refId: string, remove = false): Promise<Write[]> {
  const open = await whereEq(c.fs, 'notifications', { refId, handled: false });
  const now = nowIso();
  return open.map((n) => (remove ? c.fs.remove('notifications', n.id) : c.fs.patch('notifications', n.id, { handled: true, handledBy: c.me, handledAt: now })));
}
const managerOnly = (c: Ctx, what: string) => { if (!isManager(c.caller)) throw forbidden(`only managers can ${what}`); };

// ======================= closing (Y5) =======================

/** eventday.ts nextNoon(): noon of the next Israeli day, as an instant. */
export const nextNoon = (fromIso: string) => isoFromIL(keyIL(new Date(Date.parse(fromIso) + 86400_000).toISOString()) + 'T12:00');

// closeEvent()
def('events.close', 'events:write', 'סגירת האירוע בסוף היום: השער והדוכן נעצרים, חובות פתוחים נשארים לגבייה', { ifUpdatedAt: IFU, eventId: req() }, async (c) => {
  const ev = await eventFor(c, c.input.eventId);
  fresh(ev, c.input.ifUpdatedAt);
  if (ev.data.closed) return { writes: [], refs: [{ col: 'events', id: ev.id }], data: { changed: false } };
  const at = nowIso();
  const closed = { at, by: c.me, reopenUntil: nextNoon(at) };
  return {
    writes: [c.fs.patch('events', ev.id, { closed, updatedAt: at }, ev.updateTime), activity(c.fs, c.me, 'event', ev.id, 'closed', `${ev.data.title} נסגר`, { eventId: ev.id })],
    refs: [{ col: 'events', id: ev.id, expected: { closed } }], data: { changed: true },
  };
}, [
  'Ask the user first: after closing, volunteers can no longer scan at the gate or sell at the stall (managers still can, and still settle debts).',
  'Count the cash before (events.saveCash). The app offers reopening until noon the next day (closed.reopenUntil); events.reopen works any time. Already closed: "changed": false.',
]);
// reopenEvent()
def('events.reopen', 'events:write', 'פתיחה מחדש של אירוע שנסגר', { ifUpdatedAt: IFU, eventId: req() }, async (c) => {
  const ev = await eventFor(c, c.input.eventId);
  fresh(ev, c.input.ifUpdatedAt);
  if (!ev.data.closed) return { writes: [], refs: [{ col: 'events', id: ev.id }], data: { changed: false } };
  const at = nowIso();
  return {
    writes: [c.fs.patch('events', ev.id, { closed: null, reopenedAt: at, reopenedBy: c.me, updatedAt: at }, ev.updateTime), activity(c.fs, c.me, 'event', ev.id, 'reopened', `${ev.data.title} נפתח מחדש`, { eventId: ev.id })],
    refs: [{ col: 'events', id: ev.id, expected: { closed: null, reopenedAt: at } }], data: { changed: true },
  };
}, ['An event that is not closed: "changed": false.']);

// ======================= stall products (N9) =======================

const productsOf = async (c: Ctx, eventId: string) => c.fs.query({ from: [{ collectionId: 'products' }], limit: 500 }, `events/${eventId}`);
const bySort = (a: Doc, b: Doc) => (Number(a.data.sort) || 0) - (Number(b.data.sort) || 0);

// reorderProducts()
def('events.reorderProducts', 'events:write', 'סידור מחדש של מוצרי הדוכן', {
  eventId: req(), productIds: { type: 'stringList', maxItems: 200, maxLength: 200, required: true, he: 'המוצרים בסדר החדש; מוצרים שלא נשלחו באים אחריהם בסדר הקיים' },
}, async (c) => {
  const ev = await eventFor(c, c.input.eventId);
  const list = (await productsOf(c, ev.id)).sort(bySort);
  const ids = [...new Set(c.input.productIds as string[])];
  const missing = ids.filter((id) => !list.some((p) => p.id === id));
  if (missing.length) throw notFound(`product ${missing[0]}`);
  const ordered = [...ids.map((id) => list.find((p) => p.id === id)!), ...list.filter((p) => !ids.includes(p.id))];
  const col = `events/${ev.id}/products`;
  // only the products whose place changed are written, as sort 1..n
  const moves = ordered.map((p, i) => ({ p, sort: i + 1 })).filter(({ p, sort }) => Number(p.data.sort) !== sort);
  return {
    writes: moves.map(({ p, sort }) => c.fs.patch(col, p.id, { sort }, p.updateTime)),
    refs: moves.map(({ p, sort }) => ({ col, id: p.id, expected: { sort } })), data: { order: ordered.map((p) => p.id), changed: moves.length },
  };
}, ['No activity line, as in the app (N9 ↑/↓).']);
// copyProducts() + the activity line N9 writes
def('events.copyProducts', 'events:write', 'העתקת מוצרי הדוכן מאירוע קודם', { eventId: req('האירוע שאליו מעתיקים'), fromEventId: req('האירוע שממנו מעתיקים') }, async (c) => {
  const ev = await eventFor(c, c.input.eventId);
  const src = await eventFor(c, c.input.fromEventId);
  if (src.id === ev.id) throw invalid('fromEventId', 'copy from another event');
  const from = (await productsOf(c, src.id)).sort(bySort);
  if (!from.length) throw invalid('fromEventId', 'that event has no products');
  const after = (await productsOf(c, ev.id)).reduce((m, p) => Math.max(m, Number(p.data.sort) || 0), 0);
  const col = `events/${ev.id}/products`;
  const made = from.map((p, i) => ({ id: autoId(), data: { name: p.data.name, price: p.data.price, active: p.data.active, sort: after + i + 1 } }));
  return {
    status: 201,
    writes: [...made.map((m) => c.fs.create(col, m.id, m.data)), activity(c.fs, c.me, 'event', ev.id, 'edited', `הועתקו ${from.length} מוצרים מ${src.data.title}`, { eventId: ev.id })],
    refs: made.map((m) => ({ col, id: m.id, expected: m.data })), data: { productIds: made.map((m) => m.id) },
  };
}, ['New products, placed after the ones the event already has. As in the app, the name, price and availability are copied (not the unit).']);

// ======================= files (V3) =======================

/** V3: links to permits, maps and lists. Managers only (firestore.rules events/*\/files). */
def('events.addFileLink', 'events:write', 'הוספת קישור לקובץ באירוע (היתר, מפה, רשימה)', {
  eventId: req(), name: str(200, 'שם הקובץ', true, 1), url: str(2000, 'קישור https', true, 9), kind: en(['doc', 'image'], 'doc מסמך, image תמונה', false, 'doc'),
}, async (c) => {
  const ev = await eventFor(c, c.input.eventId);
  if (!/^https:\/\/\S+$/.test(c.input.url)) throw invalid('url', 'url must be an https:// link');
  const id = autoId();
  const col = `events/${ev.id}/files`;
  const data = { name: c.input.name, url: c.input.url, kind: c.input.kind, by: c.me, at: nowIso() };
  return {
    status: 201, writes: [c.fs.create(col, id, data), activity(c.fs, c.me, 'event', ev.id, 'edited', `${ev.data.title}: נוסף קובץ "${data.name}"`, { eventId: ev.id })],
    refs: [{ col, id, expected: { name: data.name, url: data.url } }], data: { fileId: id },
  };
}, ['Links only: the API does not upload files (photos and PDFs are added in the app). Only managers see event files.']);
// removeFileV2() / removeLegacyFile()
def('events.removeFile', 'events:write', 'מחיקת קובץ מהאירוע', {
  ifUpdatedAt: IFU, eventId: req(), fileId: opt('מתוך eventFiles.list'), legacyIndex: int(0, 29, 'קישור ישן שנשמר בתוך האירוע: המיקום שלו ב־files של events.get (מ־0)'),
}, async (c) => {
  const ev = await eventFor(c, c.input.eventId);
  if ((c.input.fileId === null) === (c.input.legacyIndex === null)) throw invalid('fileId', 'send fileId or legacyIndex');
  if (c.input.fileId) {
    const col = `events/${ev.id}/files`;
    const f = await mustGet(c.fs, col, c.input.fileId, c.tx, 'file');
    return {
      writes: [c.fs.remove(col, f.id, f.updateTime), activity(c.fs, c.me, 'event', ev.id, 'edited', `${ev.data.title}: נמחק קובץ "${f.data.name}"`, { eventId: ev.id })],
      refs: [{ col, id: f.id, gone: true }], data: { deleted: { id: f.id, name: f.data.name, kind: f.data.kind } },
    };
  }
  fresh(ev, c.input.ifUpdatedAt);
  const files = (ev.data.files as Data[]) || [];
  const old = files[c.input.legacyIndex];
  if (!old) throw invalid('legacyIndex', 'no legacy file at this index');
  const next = files.filter((_, i) => i !== c.input.legacyIndex);
  return {
    writes: [c.fs.patch('events', ev.id, { files: next, updatedAt: nowIso() }, ev.updateTime), activity(c.fs, c.me, 'event', ev.id, 'edited', `${ev.data.title}: נמחק קובץ "${old.name}"`, { eventId: ev.id })],
    refs: [{ col: 'events', id: ev.id }], data: { deleted: { name: old.name, kind: old.kind } },
  };
}, ['Destructive: confirm with the user first.', 'Older events keep their links inside the event (events.get → files); remove one of those with legacyIndex, read just before (ifUpdatedAt guards the index).']);

// ======================= staffing (V4) =======================

type Staff = { uid: string; name: string; hours: string };
/** logic.ts stationsOf(): the usual three stations, shown even before anyone saved them. */
const STATION_NAMES: Record<string, string> = { gate: 'שער', stall: 'דוכן', parking: 'חניה' };
/** logic.ts hoursText(): "16:00-20:00" -> "16:00–20:00". */
const hoursText = (h: string) => h.replace(/\s*-\s*/, '–');
const HOURS = str(40, 'שעות, למשל "16:00-20:00"; ריק = כל האירוע');
function hoursOk(h: string | null) { if (h && !/^\d{1,2}:\d{2}\s*[-–]\s*\d{1,2}:\d{2}$/.test(h)) throw invalid('hours', 'hours must look like "16:00-20:00"'); }
/** changeStation(): read, change and write the station inside the transaction, so two managers never overwrite each other. */
async function station(c: Ctx, eventId: string, sid: string, name: string | null, needed: number | null, mustExist: boolean) {
  const col = `events/${eventId}/staffing`;
  const cur = await c.fs.get(col, sid, c.tx);
  if (!cur && mustExist) throw notFound('station');
  const title = String(cur?.data.station || name || STATION_NAMES[sid] || '');
  if (!title) throw invalid('stationName', 'a new station needs stationName');
  const people = ((cur?.data.people as Staff[]) || []).map((p) => ({ uid: p.uid, name: p.name, hours: p.hours || '' }));
  const write = (next: Staff[]) => {
    if (next.length > 30) throw invalid('uid', 'a station holds at most 30 people');
    return c.fs.set(col, sid, { station: title, people: next, needed: Number(cur?.data.needed ?? needed ?? 1) });
  };
  return { col, title, people, write };
}
// assignToStation()
def('events.assignStation', 'events:write', 'שיבוץ איש צוות לעמדה באירוע (שער, דוכן, חניה או עמדה אחרת)', {
  eventId: req(), station: req('מזהה העמדה: gate שער, stall דוכן, parking חניה, או מזהה של עמדה אחרת מתוך eventStaffing.list'),
  stationName: str(60, 'שם העמדה, רק לעמדה חדשה', false, 1), needed: int(1, 30, 'כמה צריך בעמדה (לעמדה חדשה; ברירת מחדל 1)'),
  uid: req('איש הצוות, מתוך people.search'), hours: HOURS,
}, async (c) => {
  const ev = await eventFor(c, c.input.eventId);
  hoursOk(c.input.hours);
  const who = await member(c.fs, c.input.uid, 'uid', c.tx);
  const st = await station(c, ev.id, c.input.station, c.input.stationName, c.input.needed, false);
  if (st.people.some((p) => p.uid === who.uid)) throw invalid('uid', `${who.name} is already on this station`);
  const hours = c.input.hours || '';
  const person: Staff = { uid: who.uid, name: who.name, hours };
  const h = hours ? ' · ' + hoursText(hours) : '';
  return {
    writes: [st.write([...st.people, person]),
      activity(c.fs, c.me, 'event', ev.id, 'edited', `${ev.data.title}: ${who.name} שובץ/ה ל${st.title}${h}`, { eventId: ev.id, subjectUid: who.uid }),
      ...notifyWrites(c.fs, [who.uid], { kind: 'event', title: `${ev.data.title}: ${st.title}`, sub: `${dayShort(ev.data.start)}${h}`, link: `/farm/events/${ev.id}`, refId: ev.id, by: c.me })],
    refs: [{ col: st.col, id: c.input.station }],
  };
}, ['Adds one in-app notification and queues a phone push for the assignee, including a self-assignment.']);
// updateStationPerson()
def('events.updateStationPerson', 'events:write', 'עדכון שעות של איש צוות בעמדה', { eventId: req(), station: req('מזהה העמדה'), uid: req(), hours: HOURS }, async (c) => {
  const ev = await eventFor(c, c.input.eventId);
  hoursOk(c.input.hours);
  const st = await station(c, ev.id, c.input.station, null, null, true);
  if (!st.people.some((p) => p.uid === c.input.uid)) throw notFound('person on this station');
  return {
    writes: [st.write(st.people.map((p) => (p.uid === c.input.uid ? { ...p, hours: c.input.hours || '' } : p))),
      activity(c.fs, c.me, 'event', ev.id, 'edited', `${ev.data.title}: שעות ב${st.title} עודכנו`, { eventId: ev.id, subjectUid: c.input.uid })],
    refs: [{ col: st.col, id: c.input.station }],
  };
});
// removeFromStation()
def('events.removeFromStation', 'events:write', 'הסרת איש צוות מעמדה באירוע', { eventId: req(), station: req('מזהה העמדה'), uid: req() }, async (c) => {
  const ev = await eventFor(c, c.input.eventId);
  const st = await station(c, ev.id, c.input.station, null, null, true);
  const p = st.people.find((x) => x.uid === c.input.uid);
  if (!p) throw notFound('person on this station');
  return {
    writes: [st.write(st.people.filter((x) => x.uid !== p.uid)), activity(c.fs, c.me, 'event', ev.id, 'edited', `${ev.data.title}: ${p.name} הוסר/ה מ${st.title}`, { eventId: ev.id, subjectUid: p.uid })],
    refs: [{ col: st.col, id: c.input.station }],
  };
});

// ======================= guests and payments (M5, N12, V5) =======================

// addGuestOrder(): a registration a manager adds by hand (phone call, walk-in before the day). The manager owns the tickets
// (the create rule allows only one's own); the guest's name and phone are on them.
def('tickets.addGuestOrder', 'tickets:write', 'הוספת נרשם לאירוע ידנית (טלפון, וואטסאפ)', {
  eventId: req(), name: str(80, 'שם הנרשם', true, 1), phone: str(25, 'טלפון'), count: int(1, 20, 'כמה כרטיסים', false, 1), paid: bool('כבר שילם (רק באירוע בתשלום)', false),
}, async (c) => {
  const e = await eventFor(c, c.input.eventId);
  // firestore.rules tickets create: the event is published and open, and the order is within maxPerOrder
  if (!e.data.published || !e.data.open) throw invalid('eventId', 'the event must be published and open for registration');
  if (c.input.count > Number(e.data.maxPerOrder || 20)) throw invalid('count', `at most ${e.data.maxPerOrder} tickets in one order for this event`);
  const price = Number(e.data.price) || 0;
  const now = nowIso();
  const orderId = autoId();
  const paid = c.input.paid && price > 0;
  const name = c.input.name as string, count = c.input.count as number;
  const ids = Array.from({ length: count }, () => autoId());
  const writes: Write[] = ids.map((id, i) => withServerTime(c.fs.create('tickets', id, {
    eventId: e.id, eventTitle: e.data.title, orderId, index: i + 1, total: count, ownerUid: c.me.uid, selfRegistered: false, ownerName: name, ownerPhone: c.input.phone || '',
    holderName: '', secret: randomSecret(), price, paymentStatus: paid ? 'paid' : price > 0 ? 'pending' : 'free', status: 'valid', scans: [], entries: 0, answers: {}, createdAt: now, updatedAt: now,
  }), paid ? ['paidAt'] : []));
  writes.push(activity(c.fs, c.me, 'ticket', orderId, 'ordered', `${name} · ${count} כרטיסים · ${e.data.title} · נוסף/ה על ידי ${c.me.name}`, { eventId: e.id }));
  if (paid) writes.push(activity(c.fs, c.me, 'ticket', orderId, 'paid', `${name} · ${e.data.title} · ${price * count} ₪ · ${count} כרטיסים`, { eventId: e.id }));
  return { status: 201, writes, refs: ids.map((id) => ({ col: 'tickets', id, expected: { orderId } })), data: { orderId, ticketIds: ids } };
}, ['The tickets belong to you (the app does the same); the guest\'s name and phone are on them. paid=true marks a paid event\'s order paid (paidAt = server time).']);

const ticketsOfOrder = async (c: Ctx, orderId: string) => {
  const all = (await whereEq(c.fs, 'tickets', { orderId })).sort((a, b) => Number(a.data.index) - Number(b.data.index));
  if (!all.length) throw notFound('order');
  return all;
};
// deleteOrder()
def('tickets.deleteOrder', 'tickets:write', 'מחיקת הזמנה לגמרי (לא ביטול): הכרטיסים ופריטי התיבה שלה', { orderId: req('orderId מתוך tickets.list') }, async (c) => {
  const list = await ticketsOfOrder(c, c.input.orderId);
  const t = list[0].data;
  return {
    writes: [...list.map((x) => c.fs.remove('tickets', x.id, x.updateTime)), ...await inboxFor(c, c.input.orderId, true),
      activity(c.fs, c.me, 'ticket', c.input.orderId, 'deleted', `${t.ownerName} · ${list.length} כרטיסים · ${t.eventTitle}`, { subjectUid: String(t.ownerUid), eventId: String(t.eventId) })],
    refs: list.map((x) => ({ col: 'tickets', id: x.id, gone: true })), data: { deleted: list.map((x) => project('tickets', x.id, x.data)) },
  };
}, ['Destructive and final: confirm with the user first. Nothing of the order stays; to keep a record, use tickets.cancelOrder instead.']);
// deleteTab()
def('tabs.delete', 'tabs:settle', 'מחיקת חשבון דוכן ופריטי התיבה שלו', { ifUpdatedAt: IFU, tabId: req() }, async (c) => {
  const tab = await mustGet(c.fs, 'tabs', c.input.tabId, c.tx, 'tab');
  fresh(tab, c.input.ifUpdatedAt);
  const d = tab.data;
  return {
    writes: [c.fs.remove('tabs', tab.id, tab.updateTime), ...await inboxFor(c, tab.id, true),
      activity(c.fs, c.me, 'tab', tab.id, 'deleted', `${d.guestName} · ${d.total} ₪ · ${d.eventTitle}`, { subjectUid: String(d.guestUid), eventId: String(d.eventId) })],
    refs: [{ col: 'tabs', id: tab.id, gone: true }], data: { deleted: project('tabs', tab.id, d) },
  };
}, ['Destructive and final: confirm with the user first. To forgive the debt but keep the record, use tabs.setStatus waived.']);

// stampReminder('tickets'): the owing tickets of the order (M5 "תזכורת בוואטסאפ", V5)
def('tickets.stampReminder', 'tickets:write', 'רישום שנשלחה תזכורת תשלום על הזמנה', { orderId: req() }, async (c) => {
  const owing = (await ticketsOfOrder(c, c.input.orderId)).filter((t) => t.data.status === 'valid' && (t.data.paymentStatus === 'pending' || t.data.paymentStatus === 'claimed'));
  if (!owing.length) throw invalid('orderId', 'nothing of this order is waiting for payment');
  const at = nowIso();
  return { writes: owing.map((t) => c.fs.patch('tickets', t.id, { reminderSentAt: at }, t.updateTime)), refs: owing.map((t) => ({ col: 'tickets', id: t.id, expected: { reminderSentAt: at } })) };
}, ['Only records that a reminder went out (reminderSentAt); it sends nothing. Send the WhatsApp text yourself (settings templates.debtReminder) first.', 'An order with nothing waiting for payment (all paid, free or cancelled) is refused with 400.']);
// stampReminder('tab')
def('tabs.stampReminder', 'tabs:settle', 'רישום שנשלחה תזכורת תשלום על חשבון דוכן', { tabId: req() }, async (c) => {
  const tab = await mustGet(c.fs, 'tabs', c.input.tabId, c.tx, 'tab');
  const at = nowIso();
  return { writes: [c.fs.patch('tabs', tab.id, { reminderSentAt: at }, tab.updateTime)], refs: [{ col: 'tabs', id: tab.id, expected: { reminderSentAt: at } }] };
}, ['Only records that a reminder went out (reminderSentAt); it sends nothing.']);

// markPaymentConfirmation() (src/app/data.ts): "סימון שהאישור נשלח" on a paid order, donation or stall account
def('payments.markConfirmation', 'tickets:write', 'סימון שאישור התשלום נשלח לאורח (הזמנה, תרומה או חשבון דוכן)', {
  collection: en(['tickets', 'donations', 'tabs'], 'tickets הזמנה, donations תרומה, tabs חשבון דוכן', true), id: req('tickets: ה־orderId; donations: מזהה התרומה; tabs: מזהה החשבון'),
}, async (c) => {
  managerOnly(c, 'mark payment confirmations');
  const col = c.input.collection as string;
  // firestore.rules marksConfirmation(): once, and only on what is paid
  let docs: Doc[];
  if (col === 'tickets') {
    const all = await ticketsOfOrder(c, c.input.id);
    docs = all.filter((t) => t.data.status === 'valid' && Number(t.data.price) > 0 && (t.data.paymentStatus === 'paid' || t.data.paymentStatus === 'paid_onsite'));
    if (!docs.length) throw invalid('id', 'no paid ticket in this order');
  } else {
    const d = await mustGet(c.fs, col, c.input.id, c.tx, col === 'tabs' ? 'tab' : 'donation');
    const paid = col === 'tabs' ? d.data.status === 'paid' && Number(d.data.total) > 0 : d.data.paymentStatus === 'paid';
    if (!paid) throw invalid('id', 'only a paid record gets a payment confirmation');
    docs = [d];
  }
  if (docs.some((d) => d.data.paymentConfirmation)) return { writes: [], refs: docs.map((d) => ({ col, id: d.id })), data: { changed: false } };
  const at = nowIso();
  const paymentConfirmation = { by: c.me, at };
  return {
    writes: docs.map((d) => c.fs.patch(col, d.id, { paymentConfirmation, updatedAt: at }, d.updateTime)),
    refs: docs.map((d) => ({ col, id: d.id, expected: { paymentConfirmation } })), data: { changed: true },
  };
}, [
  'Only records that the confirmation was sent (by WhatsApp or by hand); it sends nothing. Already marked: "changed": false.',
  'The Worker also emails a confirmation by itself: its state is emailOutbox.get with id order_<orderId>, donation_<id> or tab_<id>. A marked confirmation stops that email.',
]);

export type { Person };
