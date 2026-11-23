// Demo seed slice for the events area (M3-M7, N9-N12, V3-V5).
// The festival (demo-e-festival) carries the preparation, guests and event-day screens; the October fair (demo-e-october)
// carries the summary (M7), the stall tab (N12) and the debt reminders (V5). Numbers follow the design canvas.
import { A, E, U, profiles, settings } from '../data';
import type { Slice, Seed, Row } from './types';
import { put, drop, patch } from './types';
import type { Actor, Ticket, Tab, TabItem } from '../../types';

const ANCHOR_MS = new Date('2026-11-19T10:30:00+02:00').getTime();
const ago = (h: number) => new Date(ANCHOR_MS - h * 3600_000).toISOString();
const on = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+02:00`).toISOString();
const OCT = '2026-10-26', FEST = '2026-11-28', ROSH = '2026-09-29';
const pr = (uid: string) => profiles.find((p) => p.uid === uid)!;
const fillers = profiles.filter((p) => p.uid.startsWith('demo-u-g'));
const TINY_PDF = 'data:application/pdf;base64,JVBERi0xLjEKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqIDIgMCBvYmo8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PmVuZG9iaiAzIDAgb2JqPDwvVHlwZS9QYWdlL1BhcmVudCAyIDAgUi9NZWRpYUJveFswIDAgMjAwIDEyMF0+PmVuZG9iagp0cmFpbGVyPDwvUm9vdCAxIDAgUj4+CiUlRU9G';

type Owner = { uid: string; displayName: string; phone: string };
function order(eventId: string, title: string, orderId: string, owner: Owner, n: number, price: number, paymentStatus: Ticket['paymentStatus'], date: string, arrived: number, extra: Partial<Ticket> = {}): Ticket[] {
  return Array.from({ length: n }, (_, i) => {
    const entries = i < arrived ? 1 : 0;
    const at = on(date, `16:${String(10 + ((i * 7) % 45)).padStart(2, '0')}`);
    return {
      id: `${orderId}-${i + 1}`, eventId, eventTitle: title, orderId, index: i + 1, total: n,
      ownerUid: owner.uid, ownerName: owner.displayName, ownerPhone: owner.phone, holderName: '',
      secret: `e${orderId.replace(/\D/g, '').padStart(4, '0')}${String(i + 1).padStart(2, '0')}cafef00d`.slice(0, 24), price, paymentStatus, status: 'valid',
      scans: entries ? [{ at, by: i % 2 ? A.yoav : A.noa }] : [], entries, answers: {}, createdAt: on('2026-10-12', '12:00'), updatedAt: on(date, '21:30'), ...extra,
    };
  });
}

// ---------- the festival ----------
function festival(seed: Seed, scenario: string) {
  const P = `events/${E.fall}/products`;
  drop(seed, P, ['demo-pr-jam']);
  patch(seed, P, 'demo-pr-bread', { active: false });
  patch(seed, P, 'demo-pr-honey', { sort: 6 });
  patch(seed, P, 'demo-pr-oil', { sort: 7 });
  patch(seed, P, 'demo-pr-lemonade', { unit: 'כוס' });

  // M5: David and Roni both marked that they transferred (2 · 350 ₪)
  if (scenario === 'regular') for (let i = 1; i <= 3; i++) patch(seed, 'tickets', `demo-o-1-${i}`, { paymentStatus: 'claimed', updatedAt: ago(1) });

  // M4: 7 preparation tasks, 3 still open (the open ones are in the core data)
  const done = (id: string, title: string, by: Actor, days: number) => ({
    id, title, note: '', photo: '', location: null, dueDate: '2026-11-20', managersOnly: false, templateId: null, dateKey: null, createdBy: A.beni,
    createdAt: ago((days + 6) * 24), done: true, doneBy: by, doneAt: ago(days * 24), donePhoto: '', doneNote: '', assignee: by, urgent: false, eventId: E.fall, updatedAt: ago(days * 24),
  });
  put(seed, 'tasks', [
    done('demo-t-fest-flyer', 'לפרסם את הפסטיבל בקבוצות', A.noa, 6),
    done('demo-t-fest-music', 'לסגור הופעה לשקיעה', A.beni, 5),
    done('demo-t-fest-permit', 'להוציא אישור משטרה', A.beni, 7),
    done('demo-t-fest-map', 'לשרטט מפת הצבה לדוכנים', A.noa, 4),
  ]);

  // V4 staffing builds on the rows the farm slice (all days: 6 people, F6 "6 בצוות האירוע") and the event-day slice
  // (event day and after: the V4 people, parking empty) already seed. On a regular day parking needs a third person,
  // so M4 reads "6 משובצים · בחניה חסר מישהו" and V4 shows the parking card short.
  if (scenario === 'regular') patch(seed, `events/${E.fall}/staffing`, 'parking', { needed: 3 });
  // V4 "4 פנויים באותו יום": team at the farm on the festival day, not assigned (regular day only: the event day has its own presence)
  if (scenario === 'regular') {
    const pres = (id: string, a: Actor, time: string): Row => ({ id, ownerUid: a.uid, ownerName: a.name, title: `${a.name.split(' ')[0]} בחווה`, date: FEST, time, kind: 'presence', refId: '', createdAt: ago(30) });
    put(seed, 'calendar', [
      pres('demo-c-fest-eliya', A.eliya, '15:00–20:00'), pres('demo-c-fest-orly', A.orly, '16:00–21:00'),
      pres('demo-c-fest-omer', A.omer, '14:00–21:00'), pres('demo-c-fest-gil', A.gil, '15:00–19:00'),
    ]);
  }

  // V3 files
  const file = (id: string, name: string, kind: 'doc' | 'image', url: string, by: Actor, date: string, mime: string): Row => ({ id, name, url, kind, by, at: on(date, '12:00'), mime, size: url.length });
  put(seed, `events/${E.fall}/files`, [
    file('demo-f-police', 'אישור משטרה', 'doc', TINY_PDF, A.beni, '2026-11-12', 'application/pdf'),
    file('demo-f-map', 'מפת הצבת הדוכנים', 'image', '/assets/rava-wayfinding.webp', A.noa, '2026-11-15', 'image/webp'),
    file('demo-f-insurance', 'ביטוח צד שלישי', 'doc', TINY_PDF, A.eliya, '2026-11-03', 'application/pdf'),
    file('demo-f-suppliers', 'רשימת ספקים וטלפונים', 'image', '/assets/rava-sunset.webp', A.beni, '2026-11-16', 'image/webp'),
  ]);
  // M6 reads counters/live and the scans seeded by the live slice (event-day area); nothing added here.
}

// ---------- the October fair: 96 registered, 81 came, 650 ₪ tickets, 1,180 ₪ stall, 4 open debts (616 ₪) ----------
function october(seed: Seed, scenario: string) {
  const title = 'יריד אוקטובר';
  patch(seed, 'events', E.oct, { price: 50 });
  const oldIds = (seed.collections.tickets || []).filter((t) => t.eventId === E.oct).map((t) => String(t.id));
  drop(seed, 'tickets', oldIds);
  const T = (id: string, uid: string, n: number, price: number, st: Ticket['paymentStatus'], arrived: number) => order(E.oct, title, id, pr(uid), n, price, st, OCT, arrived);
  const tickets: Ticket[] = [
    ...T('demo-o-12', U.roni, 2, 50, 'paid', 2),
    ...T('demo-o-13', U.david, 4, 50, 'pending', 4),
    ...T('demo-o-14', U.orly, 2, 50, 'paid', 2),
    ...T('demo-o-15', U.michal, 2, 50, 'paid', 2),
    ...T('demo-o-16', U.noam, 1, 50, 'paid', 1),
    ...T('demo-o-17', U.shirak, 1, 50, 'paid', 1),
    ...T('demo-o-18', U.yossi, 6, 52, 'pending', 6),
    ...T('demo-o-oct-ester', U.ester, 3, 50, 'paid', 3),
    ...T('demo-o-oct-rachel', U.rachel, 2, 50, 'paid', 2),
  ];
  // 73 free registrations (children and guests of the vendors), 58 of them came
  const sizes = [2, 3, 1, 4, 2, 3, 2, 1, 3, 2, 4, 2, 3, 1, 2, 3, 2, 4, 3, 2, 3, 2, 4, 3, 2, 3, 2, 3];
  let left = 73, cameLeft = 58, k = 0;
  while (left > 0) {
    const n = Math.min(sizes[k % sizes.length], left);
    const came = Math.min(n, cameLeft);
    tickets.push(...order(E.oct, title, `demo-o-oct-f${k + 1}`, fillers[k % fillers.length], n, 0, 'free', OCT, came));
    left -= n; cameLeft -= came; k += 1;
  }
  if (scenario === 'afterEvent') {
    for (const t of tickets) if (t.orderId === 'demo-o-18') (t as Ticket & { reminderSentAt?: string }).reminderSentAt = on(FEST, '19:30');
  }
  put(seed, 'tickets', tickets as unknown as Row[]);

  // tabs: Roni's (claimed, N12), Shira's (open), and the paid ones that make the stall total and the "what sold" chart
  const price: Record<string, [string, number]> = {
    'demo-pr-lemonade': ['לימונדה', 12], 'demo-pr-tea': ['תה צמחים', 10], 'demo-pr-cheese': ['גבינת עיזים', 32], 'demo-pr-cake': ['עוגת תפוחים', 18],
    'demo-pr-olives': ['זיתים', 20], 'demo-pr-honey': ['דבש', 40],
  };
  const item = (pid: string, qty: number, hhmm: string, by: Actor): TabItem => ({ productId: pid, name: price[pid][0], price: price[pid][1], qty, at: on(OCT, hhmm), by });
  const claimedAt = scenario === 'regular' ? ago(6) : on('2026-11-19', '04:30');
  patch(seed, 'tabs', 'demo-tab-roni-oct', {
    items: [item('demo-pr-lemonade', 2, '17:05', A.noa), item('demo-pr-cake', 1, '17:05', A.noa), item('demo-pr-tea', 1, '17:40', A.noa)],
    total: 46, status: 'claimed', claimedAt, updatedAt: claimedAt,
    ...(scenario === 'afterEvent' ? { reminderSentAt: on(FEST, '18:10') } : {}),
  });
  patch(seed, 'tabs', 'demo-tab-shirak-oct', { items: [item('demo-pr-olives', 2, '18:10', A.yoav), item('demo-pr-cake', 1, '18:12', A.yoav)], total: 58, status: 'open' });
  const plan: [number, number, number, number][] = [ // lemonade, cake, cheese, honey
    [4, 2, 2, 0], [3, 2, 0, 1], [4, 1, 2, 0], [3, 2, 1, 1], [4, 2, 2, 0], [3, 2, 0, 2], [3, 2, 2, 0], [3, 2, 2, 1], [3, 2, 2, 1], [3, 2, 2, 1], [2, 0, 1, 1],
  ];
  const paidTotal = 1180 - 46 - 58 - (seed.collections.tabs || []).filter((t) => t.eventId === E.oct && t.status === 'paid').reduce((s, t) => s + Number(t.total || 0), 0);
  const each = Math.floor(paidTotal / plan.length);
  const tabs: Tab[] = plan.map(([l, c, ch, h], i) => {
    const g = fillers[(i * 3 + 5) % fillers.length];
    const by = i % 2 ? A.yoav : A.noa;
    const hh = `${16 + (i % 4)}:${String(5 + i * 4).padStart(2, '0')}`;
    const items = [l && item('demo-pr-lemonade', l, hh, by), c && item('demo-pr-cake', c, hh, by), ch && item('demo-pr-cheese', ch, hh, by), h && item('demo-pr-honey', h, hh, by)].filter(Boolean) as TabItem[];
    const total = i === plan.length - 1 ? paidTotal - each * (plan.length - 1) : each;
    return { id: `demo-tab-oct-f${i + 1}`, eventId: E.oct, eventTitle: title, guestUid: g.uid, guestName: g.displayName, guestPhone: g.phone, ticketId: '', items, total, status: 'paid', createdBy: by, createdAt: on(OCT, hh), updatedAt: on(OCT, '21:00') };
  });
  put(seed, 'tabs', tabs as unknown as Row[]);
  // Q15 "מזומן 12 ₪": the cash Noa counted at the stall that evening
  put(seed, `events/${E.oct}/counters`, [{ id: 'cash', stall: { amount: 12, by: 'נועה', at: on(OCT, '21:00'), byActor: A.noa } }]);
}

// ---------- the Rosh Hashana tour: 14 came, nothing open ----------
function rosh(seed: Seed) {
  if ((seed.collections.tickets || []).some((t) => t.eventId === E.rosh)) return;
  const title = 'סיור ראש השנה';
  const sizes = [2, 4, 3, 2, 3];
  const list: Ticket[] = [];
  sizes.forEach((n, i) => list.push(...order(E.rosh, title, `demo-o-rosh-${i + 1}`, fillers[(i * 5 + 11) % fillers.length], n, 0, 'free', ROSH, n)));
  put(seed, 'tickets', list as unknown as Row[]);
}

const slice: Slice = (seed, scenario) => {
  festival(seed, scenario);
  october(seed, scenario);
  rosh(seed);
  // V5 wording as designed: "שלום דוד, תודה שהייתם ביריד אוקטובר. נשאר לתשלום 200 ₪. אפשר בביט 050-000-0000."
  const cur = (seed.documents['settings/app'] || settings) as Row & { templates?: Record<string, string> };
  seed.documents['settings/app'] = { ...cur, templates: { ...(cur.templates || {}), debtReminder: 'שלום [שם], תודה שהייתם ב[אירוע]. נשאר לתשלום [סכום]. אפשר בביט [ביט].' } };
};
export default slice;
