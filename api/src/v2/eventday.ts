// The event day (E2-E6, Y1-Y5): the gate, paying on site and the cash count, as src/app/v2/data/eventday.ts and
// payOrderOnsite() (src/app/data.ts) write them. One transaction each, with the idempotency record: the scanned ticket,
// the scan log entry and the live counters are read and written together, so two gates never count the same entry twice.
// The crew (staff) acts only while the event is open (firestore.rules eventOpen); managers also after it closed.
import { ApiError, invalid } from '../http';
import { type Doc, type Write, encFields } from '../firestore';
import { activity, forbidden, isManager, mustGet, notFound, nowIso, whereEq } from '../core';
import { type Ctx, def, en, eventIso, num, req, str } from '../writes';
import { autoId } from '../util';
import { type Data, ddmm, eventFor, hhmmIL, int, randomSecret } from './events';

// ---------- helpers (eventday.ts) ----------
const isUnpaid = (t: Data) => t.status === 'valid' && t.paymentStatus === 'pending' && !t.payLater;
const ticketWord = (n: number) => (n === 1 ? 'כרטיס אחד' : `${n} כרטיסים`);
const ticketName = (t: Data) => String(t.holderName || t.ownerName || '');
const cancelDate = (t: Data) => String(t.cancelledAt || t.updatedAt || '');
const halfKey = (iso: string) => { const [h, m] = hhmmIL(iso).split(':'); return `${h}:${Number(m) < 30 ? '00' : '30'}`; };
const tenKey = (iso: string) => { const [h, m] = hhmmIL(iso).split(':'); return `${h}:${String(Math.floor(Number(m) / 10) * 10).padStart(2, '0')}`; };
const conflict = (why: string) => new ApiError('STALE_WRITE', why);

/** The crew writes only while the event is open; managers keep writing after it closed (firestore.rules eventOpen). */
export async function dayEvent(c: Ctx, eventId: string) {
  const ev = await eventFor(c, eventId);
  if (ev.data.closed && !isManager(c.caller)) throw forbidden('the event is closed: only managers can still act on it');
  return ev;
}

type Bump = Partial<Record<'entered' | 'scans' | 'paidAtGate' | 'payLater' | 'payLaterAmount' | 'rejected', number>>;
/** bumpCounters(): read in the transaction, written as absolute values (the app adds increments to the same copy). */
async function bumpCounters(c: Ctx, eventId: string, at: string, d: Bump): Promise<Write> {
  const col = `events/${eventId}/counters`;
  const cur = await c.fs.get(col, 'live', c.tx);
  const entered = d.entered || 0;
  const half = (cur?.data.perHalfHour as Record<string, number>) || {}, ten = (cur?.data.per10m as Record<string, number>) || {};
  const maps = entered ? { perHalfHour: { ...half, [halfKey(at)]: (half[halfKey(at)] || 0) + entered }, per10m: { ...ten, [tenKey(at)]: (ten[tenKey(at)] || 0) + entered } } : {};
  if (!cur) {
    const zero = { entered: 0, scans: 0, paidAtGate: 0, payLater: 0, payLaterAmount: 0, rejected: 0, perHalfHour: {}, per10m: {} };
    return c.fs.create(col, 'live', { ...zero, ...d, ...maps, eventId });
  }
  const sums = Object.fromEntries(Object.entries(d).filter(([, v]) => v).map(([k, v]) => [k, (Number(cur.data[k]) || 0) + v!]));
  return c.fs.patch(col, 'live', { ...sums, ...maps }, cur.updateTime);
}
const scanCol = (eventId: string) => `events/${eventId}/scans`;
async function orderOf(c: Ctx, orderId: string) {
  return (await whereEq(c.fs, 'tickets', { orderId })).sort((a, b) => Number(a.data.index) - Number(b.data.index));
}

// ======================= the gate =======================

// admit()
def('gate.admit', 'tabs:write', 'הכנסת כרטיס בשער (סריקה), ואם צריך גם תשלום במקום או "ישלמו אחר כך"', {
  eventId: req(), ticketId: req('הכרטיס מתוך tickets.list'),
  pay: en(['none', 'gate', 'later'], 'none: הכרטיס שולם או חינם; gate: שילמו עכשיו בשער על כל מה שפתוח בהזמנה; later: נכנסים וישלמו אחר כך (חוב)', false, 'none'),
  entries: int(0, 1000, 'מספר הכניסות של הכרטיס כפי שנקרא (entries). אם בינתיים נכנס בשער אחר, הפעולה נדחית ב־409'),
}, async (c) => {
  const ev = await dayEvent(c, c.input.eventId);
  const cur = await mustGet(c.fs, 'tickets', c.input.ticketId, c.tx, 'ticket');
  const t = cur.data;
  if (t.eventId !== ev.id) throw invalid('ticketId', `this ticket belongs to another event (${t.eventTitle})`);
  if (t.status !== 'valid') throw invalid('ticketId', `the order was cancelled${t.cancelledAt || t.updatedAt ? ' on ' + ddmm(cancelDate(t)) : ''}; log it with gate.reject, or a manager reopens it`);
  if (c.input.entries !== null && (Number(t.entries) || 0) !== c.input.entries) throw conflict('this entry was already counted (another gate)');
  const pay = c.input.pay as 'none' | 'gate' | 'later';
  if (isUnpaid(t) && pay === 'none') throw invalid('pay', 'the ticket is not paid: send pay "gate" (paid now) or "later" (a debt)');
  const at = nowIso();
  const order = (await orderOf(c, String(t.orderId))).map((d) => (d.id === cur.id ? cur : d));
  const owing = order.filter((d) => isUnpaid(d.data));
  const amount = pay === 'none' ? 0 : owing.reduce((s, d) => s + (Number(d.data.price) || 0), 0);
  const n = (Number(t.entries) || 0) + 1;
  const sid = `${cur.id}-${n}`;
  if (await c.fs.get(scanCol(ev.id), sid, c.tx)) throw conflict('this entry was already counted (another gate)');
  const payPatch = (d: Data): [Data, string[]] => (pay === 'gate' && isUnpaid(d) ? [{ paymentStatus: 'paid_onsite' }, ['paidAt']] : pay === 'later' && isUnpaid(d) ? [{ payLater: true, payLaterAt: at, payLaterBy: c.me }, []] : [{}, []]);
  const writes: Write[] = [];
  for (const o of owing) if (o.id !== cur.id) { const [p, st] = payPatch(o.data); writes.push(c.fs.patch('tickets', o.id, { ...p, updatedAt: at }, o.updateTime, st)); }
  const [p, st] = payPatch(t);
  writes.push(c.fs.patch('tickets', cur.id, { scans: [...((t.scans as unknown[]) || []), { at, by: c.me }], entries: n, ...p, updatedAt: at }, cur.updateTime, st));
  const result = pay === 'gate' && amount ? 'paidAtGate' : pay === 'later' && amount ? 'payLater' : 'ok';
  const which = t.total === 1 ? 'כרטיס אחד' : `כרטיס ${t.index} מתוך ${t.total}`;
  const meta = result === 'ok' ? which : `${ticketWord(owing.length)} · ${amount} ₪`;
  writes.push(c.fs.create(scanCol(ev.id), sid, {
    eventId: ev.id, ticketId: cur.id, orderId: t.orderId, name: ticketName(t), phone: t.ownerPhone || '', meta, result, ...(amount ? { amount, method: '' } : {}),
    count: result === 'ok' ? 1 : owing.length, by: c.me, at, reopenedBy: null, reopenedAt: null,
  }));
  writes.push(await bumpCounters(c, ev.id, at, { entered: n === 1 ? 1 : 0, scans: 1, ...(result === 'paidAtGate' ? { paidAtGate: owing.length } : {}), ...(result === 'payLater' ? { payLater: owing.length, payLaterAmount: amount } : {}) }));
  writes.push(activity(c.fs, c.me, 'ticket', cur.id, 'scanned', `${ticketName(t)} · כניסה ${n}${pay === 'gate' && amount ? ` · שולם במקום ${amount} ₪` : ''}${pay === 'later' && amount ? ` · ישלמו אחר כך ${amount} ₪` : ''}`, { subjectUid: String(t.ownerUid || ''), eventId: ev.id }));
  return { writes, refs: [{ col: 'tickets', id: cur.id, expected: { entries: n } }, { col: scanCol(ev.id), id: sid, expected: { result } }], data: { entries: n, scanId: sid, result, amount } };
}, [
  'Read the ticket first (tickets.get): a cancelled order or a ticket of another event is refused here; log such a refusal with gate.reject.',
  'An unpaid ticket (paymentStatus pending) needs pay "gate" or "later"; "claimed" (the guest reported paying) walks in, as in the app. pay applies to every unpaid ticket of the order.',
  'Volunteers can scan only while the event is open; after events.close only managers.',
]);

// logRejected()
def('gate.reject', 'tabs:write', 'רישום כרטיס שלא הוכנס בשער (בוטל, לא נמצא, אירוע אחר)', {
  eventId: req(), ticketId: { type: 'id', he: 'הכרטיס, אם זוהה' }, name: str(120, 'שם, אם אין כרטיס'), reason: str(200, 'הסיבה, למשל "ההזמנה בוטלה", "לא נמצא", "אירוע אחר", "ברקוד לא תקין"', true, 1), meta: str(300, 'פירוט (ברירת מחדל: הסיבה)'),
}, async (c) => {
  const ev = await dayEvent(c, c.input.eventId);
  const t = c.input.ticketId ? await mustGet(c.fs, 'tickets', c.input.ticketId, c.tx, 'ticket') : null;
  const at = nowIso();
  const sid = autoId();
  const reason = c.input.reason as string;
  const meta = c.input.meta ?? (reason === 'ההזמנה בוטלה' && t ? `ההזמנה בוטלה ב־${ddmm(cancelDate(t.data))}` : reason);
  const writes: Write[] = [
    c.fs.create(scanCol(ev.id), sid, {
      eventId: ev.id, ticketId: t?.id || '', orderId: t?.data.orderId || '', name: c.input.name || (t ? ticketName(t.data) : 'לא מזוהה'), phone: t?.data.ownerPhone || '',
      meta, result: 'rejected', reason, by: c.me, at, reopenedBy: null, reopenedAt: null, keptBy: null, keptAt: null,
    }),
    await bumpCounters(c, ev.id, at, { scans: 1, rejected: 1 }),
  ];
  if (t) writes.push(activity(c.fs, c.me, 'ticket', t.id, 'rejected', `${ticketName(t.data)} · נדחה בשער · ${reason}`, { subjectUid: String(t.data.ownerUid || ''), eventId: ev.id }));
  return { status: 201, writes, refs: [{ col: scanCol(ev.id), id: sid, expected: { result: 'rejected' } }], data: { scanId: sid } };
}, ['A manager later reopens it (gate.reopenAndAdmit) or leaves it rejected (gate.keepRejected).']);

// admitWalkIn()
def('gate.admitWalkIn', 'tabs:write', 'אורח בלי כרטיס: יצירת כרטיסים בשער, כבר בפנים', {
  eventId: req(), name: str(80, 'שם האורח', true, 1), phone: str(25, 'טלפון', true, 9), count: int(1, 20, 'כמה נכנסים', false, 1),
  pay: en(['gate', 'later'], 'gate שילמו עכשיו, later ישלמו אחר כך (באירוע בתשלום)', false, 'gate'),
}, async (c) => {
  if (!/^\+?[\d(). -]+$/.test(String(c.input.phone)) || !/^\d{9,15}$/.test(String(c.input.phone).replace(/\D/g,''))) throw invalid('phone','valid phone required');
  const ev = await eventFor(c, c.input.eventId);
  // firestore.rules: walk-in tickets only while the event is open, for managers too
  if (ev.data.closed || !(Date.parse(eventIso(ev.data.end)) > Date.now())) throw forbidden('the event has ended for walk-in registration');
  const at = nowIso();
  const orderId = autoId();
  const count = c.input.count as number, name = c.input.name as string, phone = (c.input.phone as string) || '';
  const pay = c.input.pay as 'gate' | 'later';
  const price = Number(ev.data.price) || 0;
  const amount = price * count;
  const ids = Array.from({ length: count }, () => autoId());
  const writes: Write[] = ids.map((id, i) => c.fs.create('tickets', id, {
    eventId: ev.id, eventTitle: ev.data.title, orderId, index: i + 1, total: count, ownerUid: '', ownerName: name, ownerPhone: phone, holderName: '',
    secret: randomSecret(), price, paymentStatus: amount && pay === 'later' ? 'pending' : amount ? 'paid_onsite' : 'free', status: 'valid',
    scans: [{ at, by: c.me }], entries: 1, answers: {}, createdAt: at, updatedAt: at, walkIn: true, createdBy: c.me,
    ...(amount && pay === 'later' ? { payLater: true, payLaterAt: at, payLaterBy: c.me } : {}),
  }));
  const result = !amount ? 'ok' : pay === 'gate' ? 'paidAtGate' : 'payLater';
  const sid = `${ids[0]}-1`;
  writes.push(c.fs.create(scanCol(ev.id), sid, {
    eventId: ev.id, ticketId: ids[0], orderId, name, phone, meta: `${ticketWord(count)} · אורח בלי כרטיס${amount ? ` · ${amount} ₪` : ''}`, result,
    ...(amount ? { amount, method: '' } : {}), count, by: c.me, at, reopenedBy: null, reopenedAt: null,
  }));
  writes.push(await bumpCounters(c, ev.id, at, { entered: count, scans: 1, ...(result === 'paidAtGate' ? { paidAtGate: count } : {}), ...(result === 'payLater' ? { payLater: count, payLaterAmount: amount } : {}) }));
  writes.push(activity(c.fs, c.me, 'ticket', orderId, 'ordered', `${name} · ${ticketWord(count)} בשער · ${ev.data.title}${amount ? ` · ${amount} ₪ ${pay === 'gate' ? 'שולם במקום' : 'ישלמו אחר כך'}` : ''}`, { eventId: ev.id }));
  return { status: 201, writes, refs: ids.map((id) => ({ col: 'tickets', id, expected: { orderId } })), data: { orderId, ticketIds: ids, scanId: sid, result, amount } };
}, ['The event\'s price per person; a free event ignores pay. Not on a closed event (the rules refuse it for everyone).']);

// reopenAndAdmit()
def('gate.reopenAndAdmit', 'tickets:write', 'פתיחה מחדש של הזמנה שבוטלה והכנסה בשער (מתוך כניסה שנדחתה)', { eventId: req(), scanId: req('הכניסה שנדחתה, מתוך eventScans.list') }, async (c) => {
  const ev = await eventFor(c, c.input.eventId);
  const s = await mustGet(c.fs, scanCol(ev.id), c.input.scanId, c.tx, 'scan');
  if (s.data.result !== 'rejected') throw invalid('scanId', 'only a rejected entry can be reopened');
  if (s.data.reopenedAt || s.data.keptAt) throw conflict('this entry was already handled');
  if (!s.data.orderId) throw invalid('scanId', 'this rejected entry has no ticket to reopen');
  const order = await orderOf(c, String(s.data.orderId));
  const first = order.find((t) => t.id === s.data.ticketId) || order[0];
  if (!first) throw notFound('order');
  const cur = await mustGet(c.fs, 'tickets', first.id, c.tx, 'ticket');
  const t = cur.data;
  const at = nowIso();
  const n = (Number(t.entries) || 0) + 1;
  const amount = order.reduce((sum, d) => sum + (Number(d.data.price) || 0), 0);
  const writes: Write[] = order.map((d) => {
    const price = Number(d.data.price) || 0;
    const base = { status: 'valid', paymentStatus: price > 0 ? 'pending' : 'free', ...(price > 0 ? { payLater: true, payLaterAt: at, payLaterBy: c.me } : {}), updatedAt: at };
    return d.id === cur.id
      ? c.fs.patch('tickets', cur.id, { ...base, scans: [...((t.scans as unknown[]) || []), { at, by: c.me }], entries: n }, cur.updateTime)
      : c.fs.patch('tickets', d.id, base, d.updateTime);
  });
  writes.push(c.fs.patch(scanCol(ev.id), s.id, { reopenedBy: c.me, reopenedAt: at }, s.updateTime));
  const sid = `${cur.id}-${n}`;
  if (await c.fs.get(scanCol(ev.id), sid, c.tx)) throw conflict('this entry was already counted (another gate)');
  const result = amount ? 'payLater' : 'ok';
  writes.push(c.fs.create(scanCol(ev.id), sid, {
    eventId: ev.id, ticketId: cur.id, orderId: t.orderId, name: ticketName(t), phone: t.ownerPhone || '', meta: amount ? `${ticketWord(order.length)} · ${amount} ₪ · נפתח מחדש` : 'נפתח מחדש',
    result, ...(amount ? { amount, method: '' } : {}), count: order.length, by: c.me, at, reopenedBy: null, reopenedAt: null,
  }));
  writes.push(await bumpCounters(c, ev.id, at, { entered: n === 1 ? 1 : 0, scans: 1, rejected: -1, ...(amount ? { payLater: order.length, payLaterAmount: amount } : {}) }));
  writes.push(activity(c.fs, c.me, 'ticket', String(t.orderId), 'reopened', `${t.ownerName} · ההזמנה נפתחה מחדש ונכנסו בשער · ${ev.data.title}`, { subjectUid: String(t.ownerUid || ''), eventId: ev.id }));
  return { writes, refs: [{ col: 'tickets', id: cur.id, expected: { status: 'valid', entries: n } }, { col: scanCol(ev.id), id: sid }], data: { scanId: sid, entries: n, amount } };
}, ['Managers only. The whole order is valid again and unpaid (a debt of the paid event, payLater); the scanned ticket enters.']);

// keepRejected()
def('gate.keepRejected', 'tickets:write', 'השארת כניסה שנדחתה כדחויה (המנהל ראה)', { eventId: req(), scanId: req('הכניסה שנדחתה') }, async (c) => {
  const s = await mustGet(c.fs, scanCol(c.input.eventId), c.input.scanId, c.tx, 'scan');
  if (s.data.result !== 'rejected') throw invalid('scanId', 'only a rejected entry can be kept rejected');
  if (s.data.reopenedAt) throw conflict('this entry was already reopened');
  const keptAt = nowIso();
  return { writes: [c.fs.patch(scanCol(c.input.eventId), s.id, { keptBy: c.me, keptAt }, s.updateTime)], refs: [{ col: scanCol(c.input.eventId), id: s.id, expected: { keptAt } }] };
}, ['Managers only. It leaves the "needs you" list; nothing else changes.']);

// ======================= paying on site and the cash count =======================

// payOrderOnsite()
def('tickets.payOnsite', 'tabs:write', 'סימון הזמנה כשולמה במקום (בלי כניסה)', { orderId: req('orderId מתוך tickets.list') }, async (c) => {
  const order = await orderOf(c, c.input.orderId);
  if (!order.length) throw notFound('order');
  await dayEvent(c, String(order[0].data.eventId));
  const owing = order.filter((t) => t.data.status === 'valid' && (t.data.paymentStatus === 'pending' || t.data.paymentStatus === 'claimed'));
  if (!owing.length) return { writes: [], refs: order.map((t) => ({ col: 'tickets', id: t.id })), data: { changed: false } };
  const now = nowIso();
  const t = owing[0].data;
  return {
    writes: [...owing.map((d: Doc) => c.fs.patch('tickets', d.id, { paymentStatus: 'paid_onsite', updatedAt: now }, d.updateTime, ['paidAt'])),
      activity(c.fs, c.me, 'ticket', c.input.orderId, 'paid', `${t.ownerName} · ${t.eventTitle} · ${(Number(t.price) || 0) * owing.length} ₪ · שולם במקום`, { subjectUid: String(t.ownerUid || ''), eventId: String(t.eventId) })],
    refs: owing.map((d) => ({ col: 'tickets', id: d.id, expected: { paymentStatus: 'paid_onsite' } })), data: { changed: true, paid: owing.length },
  };
}, ['The unpaid tickets (pending or claimed) become paid on site; paidAt is the server time. Nothing to pay: "changed": false. Volunteers only while the event is open.']);

// saveCash()
def('events.saveCash', 'events:write', 'רישום ספירת המזומן בסוף האירוע (בשער או בדוכן)', {
  eventId: req(), which: en(['gate', 'stall'], 'gate השער, stall הדוכן', true), amount: num(0, 10000000, 'הסכום שנספר ב־₪', true), by: str(80, 'מי ספר (ברירת מחדל: את/ה)'),
}, async (c) => {
  const ev = await eventFor(c, c.input.eventId);
  const which = c.input.which as 'gate' | 'stall';
  const by = (c.input.by as string) || c.me.name;
  const count = { amount: c.input.amount, by, at: nowIso(), byActor: c.me };
  const col = `events/${ev.id}/counters`;
  // write.merge(): only this count changes, the other one stays; the document is created on the first count
  const merge: Write = { update: { name: c.fs.name(col, 'cash'), fields: encFields({ [which]: count }) }, updateMask: { fieldPaths: [which] } };
  return {
    writes: [merge, activity(c.fs, c.me, 'event', ev.id, 'edited', `${which === 'gate' ? 'מזומן בשער' : 'מזומן בדוכן'} נספר: ${count.amount} ₪ · ${by}`, { eventId: ev.id })],
    refs: [{ col, id: 'cash' }], data: { [which]: count },
  };
}, ['Managers only (the cash count is never shown to volunteers or guests). Read it with eventCounters.get id "cash". Count before events.close.']);
