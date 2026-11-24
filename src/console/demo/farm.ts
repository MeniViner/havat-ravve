// The demo's content: החווה במספרים: סטטיסטיקות, ביקורים ושימוש, כסף ואירועים (K4-K6).
import type { Debt, EventFunnel, Source, Stats, Traffic } from '../source';
import { ago, at, DAY, dayKey, wait } from './base';

// ---------- the farm: every day of the last year, so any period's totals are the sums of its own days ----------
/** The month the design shows, from 25.10 to 23.11: what was done each day, and how many of it were tasks done. */
const MONTH: [number, number][] = [
  [9, 1], [10, 1], [11, 1], [12, 2], [13, 1], [22, 4], [4, 0], [10, 1], [11, 1], [12, 1], [14, 1], [15, 2], [16, 3], [5, 0], [11, 1],
  [12, 1], [13, 1], [14, 2], [10, 1], [17, 3], [5, 0], [12, 1], [13, 1], [14, 2], [10, 1], [11, 2], [18, 3], [7, 0], [13, 1], [13, 2],
];
const weekdayOf = (day: string) => new Date(day + 'T12:00:00Z').getUTCDay();
const farmDay = (daysAgo: number) => {
  const day = dayKey(daysAgo);
  if (daysAgo < 30) { const [actions, tasksDone] = MONTH[29 - daysAgo]; return { day, actions, tasksDone }; }
  const wd = weekdayOf(day), i = 4000 - daysAgo;
  const actions = wd === 5 ? 20 + ((i * 3) % 8) : wd === 6 ? 2 + (i % 5) : 5 + ((i * 7) % 6);
  return { day, actions, tasksDone: wd === 5 ? 2 + (i % 3) : wd === 6 ? 0 : 1 + (i % 4 === 0 ? 1 : 0) };
};
/** Splits a total by shares; what rounding leaves goes to the first, so the parts always add up. */
const split = (total: number, shares: number[]) => {
  const all = shares.reduce((a, b) => a + b, 0);
  const out = shares.map((x) => Math.round((total * x) / all));
  out[0] += total - out.reduce((a, b) => a + b, 0);
  return out;
};
const PER: Record<number, { created: number; joined: number; shopping: [number, number]; visits: [number, number, number, number]; donors: number }> = {
  7: { created: 2, joined: 1, shopping: [6, 5], visits: [2, 1, 0, 9], donors: 3 },
  30: { created: 5, joined: 2, shopping: [22, 19], visits: [6, 4, 1, 38], donors: 9 },
  90: { created: 6, joined: 4, shopping: [64, 61], visits: [15, 12, 2, 104], donors: 21 },
  365: { created: 7, joined: 7, shopping: [231, 227], visits: [47, 39, 7, 351], donors: 46 },
};

// ---------- the money: a month's columns are its three kinds; a period's split is the sum of its months ----------
type MonthRow = Stats['money']['months'][number];
const MONTHS: MonthRow[] = ([
  [0, 200, 0], [0, 390, 0], [1200, 690, 420], [0, 300, 0], [0, 1080, 0], [2400, 420, 760],
  [0, 250, 0], [0, 880, 0], [0, 490, 0], [1800, 580, 610], [600, 580, 0], [2640, 1260, 910],
] as const).map(([tickets, donations, tabs], i) => ({ month: new Date(Date.UTC(2025, 11 + i, 15)).toISOString().slice(0, 7), tickets, donations, tabs }));
const received = (days: number) => {
  const rows = days === 7 ? [{ month: '', tickets: 720, donations: 360, tabs: 180 }] : MONTHS.slice(days === 30 ? -1 : days === 90 ? -3 : -12);
  const sum = (k: 'tickets' | 'donations' | 'tabs') => rows.reduce((a, r) => a + r[k], 0);
  const r = { tickets: sum('tickets'), donations: sum('donations'), tabs: sum('tabs') };
  return { ...r, total: r.tickets + r.donations + r.tabs };
};
const debts: Debt[] = [
  { kind: 'ticket', id: 'o-1', who: 'מיכל אברהם', what: 'חג האסיף בחווה', amount: 80, since: at('2026-11-21', '10:20'), claimed: true },
  { kind: 'tab', id: 'tab-1', who: 'נגה ברק', what: 'חג האסיף בחווה', amount: 80, since: at('2026-11-22', '17:05'), claimed: true },
  { kind: 'ticket', id: 'o-2', who: 'תמר שלו', what: 'חג האסיף בחווה', amount: 120, since: at('2026-11-17', '12:40'), claimed: false },
  { kind: 'donation', id: 'don-1', who: 'משפחת לוי', what: 'עשר פעמים חי', amount: 180, since: at('2026-11-14', '20:15'), claimed: false },
  { kind: 'tab', id: 'tab-2', who: 'אורח בלי חשבון', what: 'ערב שירה', amount: 60, since: at('2026-10-14', '21:30'), claimed: false },
];
const events: EventFunnel[] = [
  { id: 'e-harvest', title: 'חג האסיף בחווה', start: at('2026-12-05', '11:00'), capacity: 300, price: 40, published: true, open: true, orders: 41, tickets: 96, cancelled: 3, paid: 81, entered: 0, ticketMoney: 3240, stallMoney: 0, stallOpen: 0, upcoming: true },
  { id: 'e-songs', title: 'ערב שירה', start: at('2026-10-14', '19:00'), capacity: 120, price: 20, published: true, open: false, orders: 31, tickets: 68, cancelled: 4, paid: 62, entered: 62, ticketMoney: 1240, stallMoney: 240, stallOpen: 60, upcoming: false },
  { id: 'e-fair', title: 'יריד אוקטובר', start: at('2026-10-26', '10:00'), capacity: 150, price: 15, published: true, open: false, orders: 37, tickets: 88, cancelled: 2, paid: 84, entered: 81, ticketMoney: 1260, stallMoney: 570, stallOpen: 0, upcoming: false },
  { id: 'e-tour', title: 'סיור ראש השנה', start: at('2026-09-29', '16:00'), capacity: 20, price: 0, published: true, open: false, orders: 6, tickets: 16, cancelled: 0, paid: 16, entered: 14, ticketMoney: 0, stallMoney: 0, stallOpen: 0, upcoming: false },
];

const demoStats = (days: number): Stats => {
  const p = PER[days] || PER[30];
  const all = Array.from({ length: days }, (_, i) => farmDay(days - 1 - i));
  const weekday = [0, 0, 0, 0, 0, 0, 0];
  for (const d of all) weekday[weekdayOf(d.day)] += d.actions;
  // the month is the design's own: its columns, its weekdays and its total as drawn and printed
  const month = days === 30;
  if (month) weekday.splice(0, 7, 38, 43, 41, 47, 43, 112, 34);
  const done = all.reduce((a, d) => a + d.tasksDone, 0);
  const [yoav, orly, matan, beni] = split(done, [17, 13, 8, 3]);
  return {
    from: ago(days * DAY), to: ago(0), days,
    farm: {
      people: { total: 9, byRole: { owner: 2, manager: 1, staff: 2, vendor: 1, guest: 3 }, joined: p.joined, blocked: 1 },
      tasks: { created: done + p.created, done, open: 7, overdue: 2, urgentOpen: 1, doers: [{ name: 'יואב פרץ', count: yoav }, { name: 'אורלי כהן', count: orly }, { name: 'מתן לוי', count: matan }, { name: 'בני גוטמן', count: beni }].filter((d) => d.count > 0) },
      shopping: { added: p.shopping[0], bought: p.shopping[1], open: 4 },
      visits: { requests: p.visits[0], approved: p.visits[1], rejected: p.visits[2], waiting: 1, people: p.visits[3] },
      // like the Worker: the totals over the whole period, the columns over ninety days at most
      activity: { total: month ? 319 : all.reduce((a, d) => a + d.actions, 0), days: all.slice(-90), weekday },
    },
    money: {
      received: { ...received(days), donors: p.donors },
      waiting: { total: debts.reduce((a, d) => a + d.amount, 0), claimed: debts.filter((d) => d.claimed).reduce((a, d) => a + d.amount, 0), count: debts.length },
      months: MONTHS, debts,
    },
    events,
  };
};

// ---------- visits and usage: a small farm site, busier on Fridays and in the week before the event ----------
/** The hours people come to the site in the designed month (1,226 visits), and open the app. */
const SITE_HOURS = [8, 6, 4, 3, 3, 4, 8, 13, 24, 30, 44, 49, 59, 62, 70, 77, 82, 92, 112, 116, 108, 92, 94, 66];
const APP_HOURS = [0, 0, 0, 0, 0, 2, 8, 14, 16, 12, 9, 8, 10, 8, 7, 9, 11, 12, 10, 8, 6, 4, 2, 1];
const demoTraffic = (days: number): Traffic & { maxDays: number } => {
  const perDay = Array.from({ length: days }, (_, n) => {
    const daysAgo = days - 1 - n, day = dayKey(daysAgo), wd = weekdayOf(day), i = 9029 - daysAgo;
    const visitors = (wd === 5 ? 46 : wd === 6 ? 31 : 18) + ((i * 7) % 9) + (daysAgo < 7 ? 12 : 0);
    const users = (wd === 6 ? 4 : 11) + ((i * 5) % 4);
    return { day, views: Math.round(visitors * 1.35), visitors, opens: Math.round(users * 2.6), users };
  });
  const sum = (k: 'views' | 'visitors' | 'opens' | 'users') => perDay.reduce((a, d) => a + d[k], 0);
  const v = sum('visitors'), views = sum('views'), opens = sum('opens'), users = sum('users');
  /** Independent shares (a visit may see many parts), and parts of one whole. */
  const share = (total: number, parts: [string, number][]) => parts.map(([key, p]) => ({ key, count: Math.round(total * p) }));
  const whole = (total: number, parts: [string, number][]) => { const c = split(total, parts.map((x) => x[1])); return parts.map(([key], i) => ({ key, count: c[i] })); };
  const today = perDay[perDay.length - 1];
  return {
    days, from: perDay[0].day, cap: 6000, maxDays: 365,
    today: { ...today, capped: false },
    totals: { views, visitors: v, returning: Math.round(v * 0.28), opens, users, appReturning: Math.round(users * 0.8), hits: views * 2 + opens },
    perDay,
    site: {
      pages: whole(views, [['home', 0.93], ['archive', 0.07]]),
      sources: whole(views, [['direct', 0.34], ['whatsapp', 0.27], ['google', 0.2], ['facebook', 0.11], ['instagram', 0.05], ['qr', 0.02], ['other', 0.01]]),
      sections: share(views, [['home', 0.97], ['story', 0.61], ['experiences', 0.48], ['heritage', 0.39], ['events', 0.36], ['visit', 0.31], ['contact', 0.22]]),
      clicks: share(views, [['app', 0.14], ['whatsapp', 0.09], ['waze', 0.07], ['phone', 0.05], ['calendar', 0.03], ['share', 0.02], ['install', 0.01]]),
      devices: whole(views, [['mobile', 0.78], ['desktop', 0.19], ['installed', 0.03]]),
      depth: whole(views, [['d25', 0.32], ['d50', 0.24], ['d75', 0.18], ['d100', 0.26]]),
      time: whole(views, [['t10', 0.29], ['t60', 0.38], ['t180', 0.21], ['tlong', 0.12]]),
      hours: split(views, SITE_HOURS),
    },
    app: {
      screens: share(opens, [['day', 0.9], ['tasks', 0.82], ['shopping', 0.44], ['home', 0.3], ['people', 0.18], ['event', 0.15], ['manage', 0.12], ['notifications', 0.09], ['me', 0.06]]),
      devices: whole(users, [['installed', 0.55], ['mobile', 0.37], ['desktop', 0.08]]),
      roles: whole(users, [['staff', 0.48], ['guest', 0.22], ['manager', 0.14], ['owner', 0.1], ['vendor', 0.06]]),
      hours: split(opens, APP_HOURS),
    },
  };
};

export const farmDemo: Pick<Source, 'stats' | 'traffic'> = {
  stats: (days) => wait(demoStats(days)),
  traffic: (days) => wait(demoTraffic(days)),
};
