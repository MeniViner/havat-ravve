// Demo seed slice for the event-day area (E1-E9): the festival on Sat 28.11 as it runs (eventDay, 17:20) and just before closing
// (afterEvent, 21:04). Tickets: 640 valid, 212 inside at 17:20 (487 at 21:04). Named rows follow the designs (E2, E3, E6 win where
// the artboards disagree: Michal's 3-ticket order has not entered yet, so "QR תקין" shows "כרטיס 2 מתוך 3 · כניסה ראשונה").
import type { Actor, Product, Tab, TabItem, Ticket } from '../../types';
import { A, E, U, profiles, tickets as coreTickets } from '../data';
import { put, patch, drop, type Row, type Slice } from './types';

const T = (hhmm: string, day = '2026-11-28') => new Date(`${day}T${hhmm}:00+02:00`).toISOString();
const FEST = 'פסטיבל הסתיו';
const PRICE = 50;
const mm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

type Entry = { at: string; by: Actor };
function ticketsOf(orderId: string, owner: { uid: string; name: string; phone: string }, count: number, paymentStatus: Ticket['paymentStatus'], createdAt: string, entries: (Entry | null)[] = [], extra: Record<string, unknown> = {}): Row[] {
  return Array.from({ length: count }, (_, i) => {
    const e = entries[i];
    return {
      id: `${orderId}-${i + 1}`, eventId: E.fall, eventTitle: FEST, orderId, index: i + 1, total: count,
      ownerUid: owner.uid, ownerName: owner.name, ownerPhone: owner.phone, holderName: '',
      secret: `f${orderId.replace(/\D/g, '').padStart(5, '0')}${String(i + 1).padStart(2, '0')}c0ffee`.slice(0, 24), price: PRICE, paymentStatus, status: 'valid',
      scans: e ? [{ at: e.at, by: e.by }] : [], entries: e ? 1 : 0, answers: {}, createdAt, updatedAt: e ? e.at : createdAt, ...extra,
    };
  });
}

/** Filler orders (deterministic): who is inside, who is on the way, six unpaid. Shared with the live slice for the scan log. */
export type FillerOrder = { orderId: string; owner: { uid: string; name: string; phone: string }; count: number; entered: number; pending: boolean; createdAt: string };
export function fillerOrders(): FillerOrder[] {
  const guests = profiles.filter((p) => p.uid.startsWith('demo-u-g'));
  const out: FillerOrder[] = [];
  let n = 0;
  const add = (count: number, entered: number, pending = false) => {
    const g = guests[n % guests.length];
    const day = 25 + Math.floor((n * 7) % 16); // 25.10 .. 9.11
    const date = day <= 31 ? `2026-10-${String(day).padStart(2, '0')}` : `2026-11-${String(day - 31).padStart(2, '0')}`;
    out.push({ orderId: `demo-o-f${++n}`, owner: { uid: g.uid, name: g.displayName, phone: g.phone }, count, entered, pending, createdAt: T(mm(9 * 60 + ((n * 37) % 600)), date) });
  };
  for (let i = 0; i < 10; i++) add(4, 2);                      // arrived in part: 40 tickets, 20 inside
  for (let i = 0; i < 46; i++) add(i === 45 ? 3 : 4, i === 45 ? 3 : 4); // everyone inside: 183
  for (let i = 0; i < 114; i++) add(i < 43 ? 4 : 3, 0, i % 19 === 7); // not yet: 385 tickets, 6 unpaid orders
  return out;
}
/** Entry times for the 203 filler entries, all before 16:50; one in six by Yoav (33), the rest by Gil. */
export function fillerEntries(): Entry[] {
  const list: Entry[] = [];
  let yoav = 0;
  for (let i = 0; i < 203; i++) {
    const sec = Math.floor((i * 2990) / 203); // 16:00:00 .. 16:49:50
    const by = i % 6 === 3 && yoav < 33 ? (yoav++, A.yoav) : A.gil;
    list.push({ at: new Date(Date.parse(T('16:00')) + sec * 1000).toISOString(), by });
  }
  while (yoav < 33) { list[list.length - 1 - yoav * 2].by = A.yoav; yoav++; }
  return list;
}

/** Each filler order with who entered when (eventDay: 203 entries before 16:50; afterEvent: 275 more during the evening). */
export function fillerPlan(after: boolean) {
  const entries = fillerEntries();
  let k = 0, late = 0, toAdd = after ? 487 - 212 : 0;
  const lateFrom = Date.parse(T('17:25'));
  const lateEntry = (): Entry => { const e = { at: new Date(lateFrom + ((late * 43_000) % (3.4 * 3600_000))).toISOString(), by: late % 3 ? A.dana : A.yoav }; late++; return e; };
  return fillerOrders().map((o) => {
    const ins: (Entry | null)[] = Array.from({ length: o.count }, (_, i) => (i < o.entered ? entries[k++] : null));
    for (let i = 0; i < o.count && toAdd > 0; i++) if (!ins[i]) { ins[i] = lateEntry(); toAdd--; }
    return { o, ins };
  });
}

const person = (uid: string) => { const p = profiles.find((x) => x.uid === uid)!; return { uid, name: p.displayName, phone: p.phone }; };
const sold = (productId: string, name: string, price: number, qty: number, at: string, by: Actor): TabItem => ({ productId, name, price, qty, at, by });
const L = (qty: number, at: string, by: Actor = A.noa) => sold('demo-pr-lemonade', 'לימונדה', 12, qty, at, by);
const TEA = (qty: number, at: string, by: Actor = A.noa) => sold('demo-pr-tea', 'תה צמחים', 10, qty, at, by);
const CAKE = (qty: number, at: string, by: Actor = A.noa) => sold('demo-pr-cake', 'עוגת תפוחים', 18, qty, at, by);
const OLIVES = (qty: number, at: string, by: Actor = A.noa) => sold('demo-pr-olives', 'זיתים', 20, qty, at, by);
const CHEESE = (qty: number, at: string, by: Actor = A.noa) => sold('demo-pr-cheese', 'גבינת עיזים', 35, qty, at, by);
const HONEY = (qty: number, at: string, by: Actor = A.noa) => sold('demo-pr-honey', 'דבש', 40, qty, at, by);
const OIL = (qty: number, at: string, by: Actor = A.noa) => sold('demo-pr-oil', 'שמן זית 500 מ״ל', 45, qty, at, by);
function tab(id: string, guest: { uid: string; name: string; phone: string }, ticketId: string, items: TabItem[], status: Tab['status'], by: Actor = A.yoav, extra: Partial<Tab> = {}): Row {
  const created = items.length ? items.reduce((m, i) => (i.at < m ? i.at : m), items[0].at) : T('16:00');
  const last = items.reduce((m, i) => (i.at > m ? i.at : m), created);
  return { id, eventId: E.fall, eventTitle: FEST, guestUid: guest.uid, guestName: guest.name, guestPhone: guest.phone, ticketId, items, total: items.reduce((s, i) => s + i.price * i.qty, 0), status, createdBy: by, createdAt: created, updatedAt: last, ...extra };
}

const slice: Slice = (seed, scenario) => {
  if (scenario === 'regular') return;
  const after = scenario === 'afterEvent';
  const Y = A.yoav;

  // ---- named tickets (core orders re-shaped for the day) ----
  const fallCore = coreTickets.filter((t) => t.eventId === E.fall).map((t) => t.id);
  drop(seed, 'tickets', fallCore);
  const roni = person(U.roni), michal = person(U.michal), david = person(U.david), ester = person(U.ester), orly = person(U.orly), noam = person(U.noam);
  const shirak = person(U.shirak), naama = person(U.naama), yossi = person(U.yossi), rachel = person(U.rachel), omer = person(U.omer);
  const levi = { uid: '', name: 'משפחת לוי', phone: '054-000-0391' };
  const cancelNote = 'ביקש לבטל כי לא יגיעו. אם הגיעו בכל זאת, אפשר לפתוח מחדש.';
  put(seed, 'tickets', [
    ...ticketsOf('demo-o-1', roni, 3, 'pending', T('09:48', '2026-11-19'), [{ at: T('17:11'), by: Y }, { at: T('17:11'), by: Y }, { at: T('17:11'), by: Y }], { payLater: true, payLaterAt: T('17:11'), payLaterBy: Y }),
    ...ticketsOf('demo-o-2', michal, 3, 'paid', T('10:12', '2026-11-19')),
    ...ticketsOf('demo-o-3', david, 4, 'claimed', T('18:00', '2026-11-17'), [{ at: T('17:19'), by: Y }]),
    ...ticketsOf('demo-o-4', ester, 8, 'paid', T('20:00', '2026-11-16')),
    ...ticketsOf('demo-o-5', orly, 1, 'paid', T('12:00', '2026-11-11'), [{ at: T('17:07'), by: Y }]),
    ...ticketsOf('demo-o-6', noam, 2, 'paid', T('12:00', '2026-11-14'), [{ at: T('16:55'), by: Y }, { at: T('16:58'), by: Y }]),
    ...ticketsOf('demo-o-7', shirak, 1, 'paid_onsite', T('12:00', '2026-11-18'), [{ at: T('17:18'), by: Y }], { paidAt: T('17:18') }),
    ...ticketsOf('demo-o-8', naama, 1, 'paid', T('12:00', '2026-11-15')),
    ...ticketsOf('demo-o-9', yossi, 6, 'pending', T('12:00', '2026-11-10'), [], { status: 'cancelled', cancelledAt: T('11:20', '2026-11-17'), cancelledBy: A.noa, cancelNote, updatedAt: T('11:20', '2026-11-17') }),
    ...ticketsOf('demo-o-19', michal, 1, 'pending', T('11:07')),
    ...ticketsOf('demo-o-rachel', rachel, 1, 'paid_onsite', T('12:00', '2026-11-20'), [{ at: T('16:51'), by: Y }], { paidAt: T('16:51') }),
    ...ticketsOf('demo-o-omer', omer, 2, 'pending', T('19:30', '2026-11-10')),
    ...ticketsOf('demo-o-levi', levi, 5, 'paid', T('20:15', '2026-11-18')),
  ]);
  // Yossi's cancellation: by Noa on 17.11 with his request as the note (Y3, E5).
  const yossiAct = seed.collections.activity?.find((a) => a.refId === 'demo-o-9' && a.action === 'cancelled');
  if (yossiAct) patch(seed, 'activity', String(yossiAct.id), { by: A.noa, at: T('11:20', '2026-11-17'), text: `יוסי מזרחי · 6 כרטיסים · ${FEST} · "${cancelNote}"` });

  // ---- filler tickets ----
  put(seed, 'tickets', fillerPlan(after).flatMap(({ o, ins }) => ticketsOf(o.orderId, o.owner, o.count, o.pending ? 'pending' : 'paid', o.createdAt, ins)));

  // ---- stall products: the designed grid order (honey before oil), bread not sold today ----
  patch(seed, `events/${E.fall}/products`, 'demo-pr-honey', { sort: 6 } as Partial<Product> as Row);
  patch(seed, `events/${E.fall}/products`, 'demo-pr-oil', { sort: 7 } as Partial<Product> as Row);
  patch(seed, `events/${E.fall}/products`, 'demo-pr-bread', { active: false } as Partial<Product> as Row);

  // ---- tabs: 4 open (E7, E9), 1 marked paid, 13 paid; 18 accounts, 1,240 ₪ at 17:20 ----
  const g = profiles.filter((p) => p.uid.startsWith('demo-u-g')).slice(40, 60).map((p) => ({ uid: p.uid, name: p.displayName, phone: p.phone }));
  const avi = { uid: '', name: 'אבי', phone: '052-000-0412' };
  const paidSpec: [number, TabItem[]][] = [
    [0, [CHEESE(2, T('16:05')), L(1, T('16:05'))]], [1, [HONEY(1, T('16:14')), OLIVES(1, T('16:14'))]], [2, [OIL(1, T('16:20')), CAKE(1, T('16:20'))]],
    [3, [L(3, T('16:22'), Y), TEA(2, T('16:22'), Y)]], [4, [CHEESE(1, T('16:26')), HONEY(1, T('16:26'))]], [5, [CAKE(2, T('16:31')), TEA(1, T('16:31'))]],
    [6, [OIL(2, T('16:35')), HONEY(1, T('16:36')), OIL(1, T('16:36'))]], [7, [OLIVES(2, T('16:38')), L(2, T('16:38'))]], [8, [HONEY(2, T('16:41')), CAKE(1, T('16:41')), CAKE(3, T('16:42'))]],
    [9, [CHEESE(1, T('16:44')), OLIVES(1, T('16:44')), L(1, T('16:44'))]], [10, [TEA(3, T('16:46'), Y), CAKE(1, T('16:46'), Y)]], [11, [OIL(1, T('16:49')), HONEY(1, T('16:49')), L(1, T('16:50'))]],
    [12, [CHEESE(1, T('16:57')), OLIVES(2, T('16:57')), L(1, T('16:57'))]],
  ];
  const roniItems = after ? [L(1, T('16:52'), Y), L(1, T('17:21')), OLIVES(2, T('17:21'))] : [L(1, T('17:05')), TEA(1, T('17:05'))]; // Q29: both by Noa at 17:05
  put(seed, 'tabs', [
    tab('demo-tab-roni-fest', roni, 'demo-o-1-1', roniItems, 'open'),
    tab('demo-tab-shirak-fest', shirak, 'demo-o-7-1', [OLIVES(2, T('16:12')), CAKE(1, T('16:30'))], 'open', A.noa),
    tab('demo-tab-orly-fest', orly, 'demo-o-5-1', [L(1, T('16:48'), Y)], 'open'),
    tab('demo-tab-avi-fest', avi, '', [TEA(1, T('16:10'), Y), OLIVES(1, T('16:10'), Y)], 'open'),
    tab('demo-tab-claimed-fest', g[13], '', [CAKE(2, T('16:18')), TEA(1, T('16:18'))], 'claimed', A.noa),
    ...paidSpec.map(([i, items]) => tab(`demo-tab-paid-fest-${i + 1}`, g[i], '', items, 'paid', items[0].by)),
    ...(after ? [tab('demo-tab-late-fest', g[15], '', [HONEY(1, T('19:40')), TEA(1, T('19:41'))], 'open', A.noa)] : []),
  ]);
  // ---- staffing (read here; edited in V4 by the events area) ----
  put(seed, `events/${E.fall}/staffing`, [
    { id: 'gate', station: 'שער', needed: 2, people: [{ uid: U.yoav, name: 'יואב פרץ', hours: '15:30-18:30' }, { uid: U.dana, name: 'דנה אברהם', hours: '18:30-21:00' }] },
    { id: 'stall', station: 'דוכן', needed: 2, people: [{ uid: U.noa, name: 'נועה שחר', hours: '15:30-21:00' }, { uid: U.orly, name: 'אורלי לוי', hours: '16:00-20:00' }] },
    { id: 'parking', station: 'חניה', needed: 1, people: [] },
  ]);
};
export default slice;
