// The console's numbers: the farm (people, tasks, shopping, visits, how busy each day was), the money (what came in,
// what waits, what someone said they paid and an owner still has to confirm, by month), and each event as a funnel
// (orders → tickets → paid → came in). Computed on request from Firestore, reading only the fields it needs (no photos),
// a few hundred reads out of the free 50,000 a day.
import { lastIlDays } from './util';
import type { Firestore } from './firestore';
import { invalid } from './http';

type Row = Record<string, unknown>;
const TZ = 'Asia/Jerusalem';
const dayOf = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(iso));
const monthOf = (iso: string) => dayOf(iso).slice(0, 7);
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const nameOf = (v: unknown) => (v && typeof v === 'object' ? str((v as { name?: unknown }).name) : '');

async function read(fs: Firestore, col: string, fields: string[], where?: Record<string, unknown>): Promise<Row[]> {
  const docs = await fs.query({ from: [{ collectionId: col }], select: { fields: fields.map((f) => ({ fieldPath: f })) }, ...(where ? { where } : {}), limit: 5000 });
  return docs.map((d) => ({ id: d.id, ...d.data }));
}
const since = (field: string, iso: string) => ({ fieldFilter: { field: { fieldPath: field }, op: 'GREATER_THAN_OR_EQUAL', value: { stringValue: iso } } });

const PAID = new Set(['paid', 'paid_onsite']);
const WAITING = new Set(['pending', 'claimed']);
/**
 * When money came in: the paidAt the app and the API stamp when a payment is settled; for older records the confirmation
 * time, else when it was made. Never updatedAt: a gate scan or a deleted account moves that.
 */
const paidAt = (r: Row) => str(r.paidAt) || str((r.paymentConfirmation as { at?: unknown } | undefined)?.at) || str(r.createdAt);

export async function stats(fs: Firestore, daysIn: number) {
  if (![7, 30, 90, 365].includes(daysIn)) throw invalid('days', '7, 30, 90 or 365');
  const now = new Date();
  const from = new Date(now.getTime() - daysIn * 86400_000).toISOString();
  const today = dayOf(now.toISOString());
  const [users, tasks, shopping, visits, donations, tickets, tabs, events, activity] = await Promise.all([
    read(fs, 'users', ['role', 'status', 'createdAt']),
    read(fs, 'tasks', ['createdAt', 'done', 'doneAt', 'doneBy', 'dueDate', 'urgent']),
    read(fs, 'shopping', ['createdAt', 'bought', 'boughtAt']),
    read(fs, 'visits', ['status', 'people', 'date', 'createdAt']),
    read(fs, 'donations', ['name', 'amount', 'label', 'paymentStatus', 'paymentConfirmation', 'paidAt', 'createdAt', 'updatedAt']),
    read(fs, 'tickets', ['eventId', 'eventTitle', 'orderId', 'ownerName', 'price', 'paymentStatus', 'status', 'entries', 'paymentConfirmation', 'paidAt', 'createdAt', 'updatedAt']),
    read(fs, 'tabs', ['eventId', 'eventTitle', 'guestName', 'total', 'status', 'paymentConfirmation', 'paidAt', 'claimedAt', 'createdAt', 'updatedAt']),
    read(fs, 'events', ['title', 'start', 'capacity', 'price', 'published', 'open']),
    read(fs, 'activity', ['at', 'kind'], since('at', from)),
  ]);
  const inPeriod = (iso: unknown) => typeof iso === 'string' && iso >= from;

  // ---------- the farm ----------
  const byRole: Record<string, number> = {};
  for (const u of users) if (u.status !== 'deleted') byRole[str(u.role) || 'guest'] = (byRole[str(u.role) || 'guest'] || 0) + 1;
  const doers: Record<string, number> = {};
  for (const t of tasks) if (t.done && inPeriod(t.doneAt)) { const n = nameOf(t.doneBy) || 'לא ידוע'; doers[n] = (doers[n] || 0) + 1; }
  const perDay: Record<string, number> = {};
  for (const a of activity) { const d = dayOf(str(a.at)); perDay[d] = (perDay[d] || 0) + 1; }
  const days: { day: string; actions: number; tasksDone: number }[] = [];
  const doneByDay: Record<string, number> = {};
  for (const t of tasks) if (t.done && inPeriod(t.doneAt)) { const d = dayOf(str(t.doneAt)); doneByDay[d] = (doneByDay[d] || 0) + 1; }
  for (const d of lastIlDays(Math.min(daysIn, 90), now)) {
    days.push({ day: d, actions: perDay[d] || 0, tasksDone: doneByDay[d] || 0 });
  }
  const weekday = [0, 0, 0, 0, 0, 0, 0];
  for (const a of activity) weekday[new Date(dayOf(str(a.at)) + 'T12:00:00Z').getUTCDay()]++;
  const visitsIn = visits.filter((v) => inPeriod(v.createdAt));
  const farm = {
    people: { total: Object.values(byRole).reduce((a, b) => a + b, 0), byRole, joined: users.filter((u) => inPeriod(u.createdAt)).length, blocked: users.filter((u) => u.status === 'blocked').length },
    tasks: {
      created: tasks.filter((t) => inPeriod(t.createdAt)).length, done: tasks.filter((t) => t.done && inPeriod(t.doneAt)).length,
      open: tasks.filter((t) => !t.done).length, overdue: tasks.filter((t) => !t.done && str(t.dueDate) && str(t.dueDate) < today).length,
      urgentOpen: tasks.filter((t) => !t.done && t.urgent).length,
      doers: Object.entries(doers).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 8),
    },
    shopping: { added: shopping.filter((s) => inPeriod(s.createdAt)).length, bought: shopping.filter((s) => s.bought && inPeriod(s.boughtAt)).length, open: shopping.filter((s) => !s.bought).length },
    visits: {
      requests: visitsIn.length, approved: visitsIn.filter((v) => v.status === 'approved').length, rejected: visitsIn.filter((v) => v.status === 'rejected').length,
      waiting: visits.filter((v) => v.status === 'new').length, people: visitsIn.filter((v) => v.status === 'approved').reduce((a, v) => a + num(v.people), 0),
    },
    activity: { total: activity.length, days, weekday },
  };

  // ---------- the money ----------
  const valid = tickets.filter((t) => t.status !== 'cancelled');
  const sum = (rows: Row[], f: string) => rows.reduce((a, r) => a + num(r[f]), 0);
  const tIn = valid.filter((t) => PAID.has(str(t.paymentStatus)) && inPeriod(paidAt(t)));
  const dIn = donations.filter((d) => PAID.has(str(d.paymentStatus)) && inPeriod(paidAt(d)));
  const bIn = tabs.filter((t) => t.status === 'paid' && inPeriod(paidAt(t)));
  const months: Record<string, { tickets: number; donations: number; tabs: number }> = {};
  for (let i = 11; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 15); months[monthOf(d.toISOString())] = { tickets: 0, donations: 0, tabs: 0 }; }
  const addMonth = (r: Row, k: 'tickets' | 'donations' | 'tabs', amount: number) => { const m = months[monthOf(paidAt(r))]; if (m) m[k] += amount; };
  for (const t of valid) if (PAID.has(str(t.paymentStatus))) addMonth(t, 'tickets', num(t.price));
  for (const d of donations) if (PAID.has(str(d.paymentStatus))) addMonth(d, 'donations', num(d.amount));
  for (const t of tabs) if (t.status === 'paid') addMonth(t, 'tabs', num(t.total));
  type Debt = { kind: 'ticket' | 'donation' | 'tab'; id: string; who: string; what: string; amount: number; since: string; claimed: boolean };
  const debts: Debt[] = [];
  // tickets of one order are paid together: one line per order
  const orders = new Map<string, Debt>();
  for (const t of valid) if (WAITING.has(str(t.paymentStatus)) && num(t.price) > 0) {
    const key = str(t.orderId) || str(t.id);
    const o = orders.get(key);
    if (o) { o.amount += num(t.price); continue; }
    orders.set(key, { kind: 'ticket', id: key, who: str(t.ownerName), what: str(t.eventTitle), amount: num(t.price), since: str(t.createdAt), claimed: t.paymentStatus === 'claimed' });
  }
  debts.push(...orders.values());
  for (const d of donations) if (WAITING.has(str(d.paymentStatus))) debts.push({ kind: 'donation', id: str(d.id), who: str(d.name), what: str(d.label) || 'תרומה', amount: num(d.amount), since: str(d.createdAt), claimed: d.paymentStatus === 'claimed' });
  for (const t of tabs) if ((t.status === 'open' || t.status === 'claimed') && num(t.total) > 0) debts.push({ kind: 'tab', id: str(t.id), who: str(t.guestName), what: str(t.eventTitle), amount: num(t.total), since: str(t.claimedAt) || str(t.createdAt), claimed: t.status === 'claimed' });
  debts.sort((a, b) => Number(b.claimed) - Number(a.claimed) || (a.since < b.since ? -1 : 1));
  const money = {
    received: { tickets: sum(tIn, 'price'), donations: sum(dIn, 'amount'), tabs: sum(bIn, 'total'), total: sum(tIn, 'price') + sum(dIn, 'amount') + sum(bIn, 'total'), donors: new Set(dIn.map((d) => str(d.name))).size },
    waiting: { total: debts.reduce((a, d) => a + d.amount, 0), claimed: debts.filter((d) => d.claimed).reduce((a, d) => a + d.amount, 0), count: debts.length },
    months: Object.entries(months).map(([month, m]) => ({ month, ...m })),
    debts: debts.slice(0, 60),
  };

  // ---------- each event as a funnel ----------
  const tabsBy = new Map<string, Row[]>();
  for (const t of tabs) { const k = str(t.eventId); tabsBy.set(k, [...(tabsBy.get(k) || []), t]); }
  const ticketsBy = new Map<string, Row[]>();
  for (const t of tickets) { const k = str(t.eventId); ticketsBy.set(k, [...(ticketsBy.get(k) || []), t]); }
  const soon = new Date(now.getTime() + 180 * 86400_000).toISOString();
  const evs = events
    .filter((e) => str(e.start) >= from && str(e.start) <= soon)
    .map((e) => {
      const ts = ticketsBy.get(str(e.id)) || [];
      const ok = ts.filter((t) => t.status !== 'cancelled');
      const paidTs = ok.filter((t) => PAID.has(str(t.paymentStatus)) || t.paymentStatus === 'free' || num(t.price) === 0);
      const bs = tabsBy.get(str(e.id)) || [];
      return {
        id: str(e.id), title: str(e.title), start: str(e.start), capacity: num(e.capacity), price: num(e.price), published: !!e.published, open: !!e.open,
        orders: new Set(ts.map((t) => str(t.orderId) || str(t.id))).size, tickets: ok.length, cancelled: ts.length - ok.length,
        paid: paidTs.length, entered: ok.filter((t) => num(t.entries) > 0).length,
        ticketMoney: ok.filter((t) => PAID.has(str(t.paymentStatus))).reduce((a, t) => a + num(t.price), 0),
        stallMoney: bs.filter((t) => t.status === 'paid').reduce((a, t) => a + num(t.total), 0),
        stallOpen: bs.filter((t) => t.status === 'open' || t.status === 'claimed').reduce((a, t) => a + num(t.total), 0),
        upcoming: str(e.start) >= now.toISOString(),
      };
    })
    .sort((a, b) => (a.start < b.start ? 1 : -1));

  return { from, to: now.toISOString(), days: daysIn, farm, money, events: evs };
}
