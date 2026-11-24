// The demo's content: החווה במספרים: סטטיסטיקות, ביקורים ושימוש, כסף ואירועים (K4-K6).
import type { Source, Stats, Traffic } from '../source';
import { ago, DAY, dayKey, wait, DEMO_NOW } from './base';
import { people } from './data';

// the numbers: a quiet farm with one event coming and one behind
const demoStats = (days: number): Stats => {
  const n = Math.min(days, 90);
  const seq = Array.from({ length: n }, (_, i) => {
    const d = dayKey(n - 1 - i);
    const wd = new Date(d + 'T12:00:00Z').getUTCDay();
    const base = wd === 5 ? 14 : wd === 6 ? 3 : 8;
    return { day: d, actions: base + ((i * 7) % 6), tasksDone: Math.max(0, Math.round(base / 3) + ((i * 3) % 3) - 1) };
  });
  const k = days / 30;
  const month = (i: number) => { const d = new Date(DEMO_NOW); d.setDate(15); d.setMonth(d.getMonth() - (11 - i)); return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(d).slice(0, 7); };
  return {
    from: ago(days * DAY), to: ago(0), days,
    farm: {
      people: { total: people.length, byRole: { owner: 2, manager: 1, staff: 2, vendor: 1, guest: 3 }, joined: Math.round(2 * k), blocked: 1 },
      tasks: { created: Math.round(46 * k), done: Math.round(41 * k), open: 7, overdue: 2, urgentOpen: 1, doers: [{ name: 'יואב פרץ', count: Math.round(17 * k) }, { name: 'אורלי כהן', count: Math.round(13 * k) }, { name: 'מתן לוי', count: Math.round(8 * k) }, { name: 'בני גוטמן', count: Math.round(3 * k) }] },
      shopping: { added: Math.round(22 * k), bought: Math.round(19 * k), open: 4 },
      visits: { requests: Math.round(6 * k), approved: Math.round(4 * k), rejected: Math.round(1 * k), waiting: 1, people: Math.round(38 * k) },
      activity: { total: seq.reduce((a, d) => a + d.actions, 0), days: seq, weekday: [52, 61, 58, 66, 70, 112, 21] },
    },
    money: {
      received: { tickets: Math.round(2640 * k), donations: Math.round(1260 * k), tabs: Math.round(910 * k), total: Math.round(4810 * k), donors: Math.round(9 * k) },
      waiting: { total: 520, claimed: 160, count: 5 },
      months: Array.from({ length: 12 }, (_, i) => ({ month: month(i), tickets: [0, 0, 1200, 0, 0, 2400, 0, 0, 0, 1800, 0, 2640][i], donations: [180, 360, 540, 180, 900, 360, 180, 720, 360, 540, 1080, 1260][i], tabs: [0, 0, 420, 0, 0, 760, 0, 0, 0, 610, 0, 910][i] })),
      debts: [
        { kind: 'ticket', id: 'o-1', who: 'מיכל אברהם', what: 'חג האסיף בחווה', amount: 80, since: ago(2 * DAY), claimed: true },
        { kind: 'tab', id: 'tab-1', who: 'נוגה ברק', what: 'חג האסיף בחווה', amount: 80, since: ago(DAY), claimed: true },
        { kind: 'ticket', id: 'o-2', who: 'תמר שלו', what: 'חג האסיף בחווה', amount: 120, since: ago(6 * DAY), claimed: false },
        { kind: 'donation', id: 'don-1', who: 'משפחת לוי', what: 'עשר פעמים חי', amount: 180, since: ago(9 * DAY), claimed: false },
        { kind: 'tab', id: 'tab-2', who: 'אורח בלי חשבון', what: 'ערב שירה', amount: 60, since: ago(40 * DAY), claimed: false },
      ],
    },
    events: [
      { id: 'e-harvest', title: 'חג האסיף בחווה', start: ago(-12 * DAY), capacity: 300, price: 40, published: true, open: true, orders: 41, tickets: 96, cancelled: 3, paid: 81, entered: 0, ticketMoney: 3240, stallMoney: 0, stallOpen: 0, upcoming: true },
      { id: 'e-songs', title: 'ערב שירה', start: ago(40 * DAY), capacity: 120, price: 30, published: true, open: false, orders: 38, tickets: 88, cancelled: 4, paid: 84, entered: 79, ticketMoney: 2520, stallMoney: 610, stallOpen: 60, upcoming: false },
    ].filter((e) => days >= 60 || e.upcoming),
  };
};

// visits and usage (round 6): a small farm site, busier on Fridays and around the coming event
const demoTraffic = (days: number): Traffic => {
  const perDay = Array.from({ length: days }, (_, i) => {
    const day = dayKey(days - 1 - i);
    const wd = new Date(day + 'T12:00:00Z').getUTCDay();
    const visitors = (wd === 5 ? 46 : wd === 6 ? 31 : 18) + ((i * 7) % 9) + (i > days - 8 ? 12 : 0);
    const users = (wd === 6 ? 4 : 11) + ((i * 5) % 4);
    return { day, views: Math.round(visitors * 1.35), visitors, opens: Math.round(users * 2.6), users };
  });
  const sum = (k: 'views' | 'visitors' | 'opens' | 'users') => perDay.reduce((a, d) => a + d[k], 0);
  const v = sum('visitors'), views = sum('views'), opens = sum('opens');
  const share = (total: number, parts: [string, number][]) => parts.map(([key, p]) => ({ key, count: Math.round(total * p) }));
  const today = perDay[perDay.length - 1];
  return {
    days, from: perDay[0].day, cap: 6000,
    today: { ...today, capped: false },
    totals: { views, visitors: v, returning: Math.round(v * 0.28), opens, users: sum('users'), appReturning: Math.round(sum('users') * 0.8), hits: views * 2 + opens },
    perDay,
    site: {
      pages: share(views, [['home', 0.93], ['archive', 0.07]]),
      sources: share(views, [['direct', 0.34], ['whatsapp', 0.27], ['google', 0.2], ['facebook', 0.11], ['instagram', 0.05], ['qr', 0.02], ['other', 0.01]]),
      sections: share(views, [['home', 0.97], ['story', 0.61], ['experiences', 0.48], ['heritage', 0.39], ['events', 0.36], ['visit', 0.31], ['contact', 0.22]]),
      clicks: share(views, [['app', 0.14], ['whatsapp', 0.09], ['waze', 0.07], ['phone', 0.05], ['calendar', 0.03], ['share', 0.02], ['install', 0.01]]),
      devices: share(views, [['mobile', 0.78], ['desktop', 0.19], ['installed', 0.03]]),
      depth: share(views, [['d25', 0.32], ['d50', 0.24], ['d75', 0.18], ['d100', 0.26]]),
      time: share(views, [['t10', 0.29], ['t60', 0.38], ['t180', 0.21], ['tlong', 0.12]]),
      hours: [1, 0, 0, 0, 0, 1, 3, 6, 9, 11, 12, 13, 14, 12, 11, 12, 14, 17, 21, 24, 22, 16, 9, 4].map((x) => Math.round((x * views) / 238)),
    },
    app: {
      screens: share(opens, [['day', 0.9], ['tasks', 0.82], ['shopping', 0.44], ['home', 0.3], ['people', 0.18], ['event', 0.15], ['manage', 0.12], ['notifications', 0.09], ['me', 0.06]]),
      devices: share(sum('users'), [['installed', 0.55], ['mobile', 0.37], ['desktop', 0.08]]),
      roles: share(sum('users'), [['staff', 0.48], ['guest', 0.22], ['manager', 0.14], ['owner', 0.1], ['vendor', 0.06]]),
      hours: [0, 0, 0, 0, 0, 2, 8, 14, 16, 12, 9, 8, 10, 8, 7, 9, 11, 12, 10, 8, 6, 4, 2, 1].map((x) => Math.round((x * opens) / 157)),
    },
  };
};

export const farmDemo: Pick<Source, 'stats' | 'traffic'> = {
  stats: (days) => wait(demoStats(days)),
  traffic: (days) => wait(demoTraffic(days)),
};
