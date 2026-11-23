// /admin?demo: the console over made-up people, keys and numbers, kept in memory only. No Firestore, no Worker.
import type { AlertSettings, Backup, DataDoc, Jobs, Queue, Stats, Switches, Traffic, Health, KeyView, LogEntry, Monitor, Overview, Person, SecurityEvent, Source, TrashItem } from './source';

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const DAY = 24 * 60;

const people: Person[] = [
  { uid: 'd-owner', email: 'owner@demo.invalid', displayName: 'מני בעלים', phone: '050-0000001', role: 'owner', status: 'active', customerNumber: 1, createdAt: ago(400 * DAY), updatedAt: ago(30 * DAY) },
  { uid: 'd-beni', email: 'beni@demo.invalid', displayName: 'בני גוטמן', phone: '050-0000002', role: 'owner', status: 'active', customerNumber: 2, createdAt: ago(390 * DAY), updatedAt: ago(10 * DAY) },
  { uid: 'd-matan', email: 'matan@demo.invalid', displayName: 'מתן לוי', phone: '050-0000003', role: 'manager', status: 'active', customerNumber: 3, createdAt: ago(200 * DAY), updatedAt: ago(4 * DAY) },
  { uid: 'd-orly', email: 'orly@demo.invalid', displayName: 'אורלי כהן', phone: '050-0000004', role: 'staff', status: 'active', customerNumber: 7, notes: 'מגיעה בימי שישי', createdAt: ago(120 * DAY), updatedAt: ago(2 * DAY) },
  { uid: 'd-yoav', email: 'yoav@demo.invalid', displayName: 'יואב פרץ', phone: '050-0000005', role: 'staff', status: 'active', customerNumber: 9, createdAt: ago(90 * DAY), updatedAt: ago(9 * DAY) },
  { uid: 'd-raz', email: 'raz@demo.invalid', displayName: 'רז גבינות העמק', phone: '050-0000006', role: 'vendor', status: 'active', customerNumber: 14, vendorId: 'v1', createdAt: ago(60 * DAY), updatedAt: ago(20 * DAY) },
  { uid: 'd-michal', email: 'michal@demo.invalid', displayName: 'מיכל אברהם', phone: '050-0000007', role: 'guest', status: 'active', customerNumber: 21, createdAt: ago(30 * DAY), updatedAt: ago(30 * DAY) },
  { uid: 'd-tamar', email: 'tamar@demo.invalid', displayName: 'תמר שלו', phone: '050-0000008', role: 'guest', status: 'blocked', customerNumber: 22, createdAt: ago(25 * DAY), updatedAt: ago(5 * DAY) },
  { uid: 'd-noga', email: 'noga@demo.invalid', displayName: 'נוגה ברק', phone: '050-0000009', role: 'guest', status: 'active', customerNumber: 23, createdAt: ago(3 * DAY), updatedAt: ago(3 * DAY) },
];

const keys: KeyView[] = [
  { id: 'cred-assistant', label: 'האינסטינקט של מני', actors: ['user:d-owner'], status: 'active', expiresAt: null, rotating: false, previousUntil: null, source: 'secret', createdAt: null, createdBy: null, updatedAt: null },
  { id: 'cred-beni', label: 'האינסטינקט של בני', actors: ['user:d-beni'], status: 'active', expiresAt: null, rotating: true, previousUntil: ago(-18 * 60), source: 'console', createdAt: ago(12 * DAY), createdBy: 'מני בעלים', updatedAt: ago(6 * 60) },
  { id: 'cred-stageb', label: 'בדיקות אוטומטיות', actors: ['user:d-owner'], status: 'active', expiresAt: ago(-80 * DAY), rotating: false, previousUntil: null, source: 'secret', createdAt: null, createdBy: null, updatedAt: null },
  { id: 'cred-old', label: 'מפתח ישן לניסוי', actors: ['user:d-matan'], status: 'revoked', expiresAt: null, rotating: false, previousUntil: null, source: 'console', createdAt: ago(40 * DAY), createdBy: 'מני בעלים', updatedAt: ago(20 * DAY) },
];
const lastUse: Record<string, string | null> = { 'cred-assistant': ago(3), 'cred-beni': ago(95), 'cred-stageb': ago(2 * DAY), 'cred-old': ago(21 * DAY) };

const entry = (min: number, credential: string, keyLabel: string, name: string, op: string, opHe: string, verb: string, ok = true): LogEntry =>
  ({ id: 'l' + min, at: ago(min), credential, keyLabel, actor: { id: 'user:x', role: 'owner', uid: 'x', name }, kind: 'write', op, opHe, verb, ok, code: ok ? '' : 'FORBIDDEN', message: '', status: ok ? 200 : 403 });
const recent: LogEntry[] = [
  entry(3, 'cred-assistant', 'האינסטינקט של מני', 'מני בעלים', 'tasks.create', 'יצירת משימה', 'יצר'),
  entry(11, 'cred-assistant', 'האינסטינקט של מני', 'מני בעלים', 'shopping.add', 'הוספה לרשימת הקניות', 'יצר'),
  entry(42, 'console', 'קונסולה · מני', 'מני בעלים', 'console.keys.rotate', 'החלפת מפתח API', 'ערך'),
  entry(95, 'cred-beni', 'האינסטינקט של בני', 'בני גוטמן', 'broadcasts.send', 'שליחת הודעה לצוות', 'שלח', false),
  entry(130, 'cred-beni', 'האינסטינקט של בני', 'בני גוטמן', 'tasks.complete', 'סימון משימה כבוצעה', 'ביצע'),
  entry(300, 'cred-assistant', 'האינסטינקט של מני', 'מני בעלים', 'events.update', 'עריכת אירוע', 'ערך'),
];

const overview = (): Overview => ({
  server: { status: 'ok', catalogVersion: '3.0.0', version: '68a66274-demo', deployedAt: ago(26 * 60), project: 'havat-ravve' },
  last24h: { requests: 412, writes: 57, failed: 3, failures: 0 },
  queues: { pushPending: 0, email: { pending: 0, sent: 0, failed: 0 } },
  crons: { at: ago(2), wallMs: 840 },
  switches: { email: { on: false, configured: false, brevo: false, resend: false }, push: { mode: 'webpush' }, files: { r2: true } },
});

const dayKey = (daysAgo: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date(Date.now() - daysAgo * 86400_000));
const COLS = { activity: 168, users: 9, notifications: 18, push_jobs: 14, tasks: 9, tickets: 4, events: 2, 'events/*/vendors': 3, vendors: 3, places: 2, settings: 1, shopping: 6, calendar: 4, visits: 1, donations: 2 };
const backups: Backup[] = Array.from({ length: 12 }, (_, i) => {
  const docs = 246 - i * 3;
  return { date: dayKey(i), startedAt: ago(i * DAY + 180), finishedAt: ago(i * DAY + 175), docs, bytes: docs * 610, parts: 1, collections: COLS, by: 'cron' };
});
const trash: TrashItem[] = [
  { key: 'trash/d/1-aaaaaaaa.json', path: 'tasks/t-fence', collection: 'tasks', title: 'לתקן את הגדר בחלקה הצפונית', by: 'האינסטינקט של מני', who: 'מני בעלים', requestId: 'req_1', deletedAt: ago(35) },
  { key: 'trash/d/2-bbbbbbbb.json', path: 'shopping/s-hay', collection: 'shopping', title: 'חבילות חציר', by: 'האינסטינקט של בני', who: 'בני גוטמן', requestId: 'req_2', deletedAt: ago(5 * 60) },
  { key: 'trash/d/3-cccccccc.json', path: 'places/p-old', collection: 'places', title: 'מחסן ישן', by: 'קונסולה · מני', who: 'מני בעלים', requestId: 'req_3', deletedAt: ago(2 * DAY) },
];
const demoDocs = [
  { path: 'tasks/t-fence', title: 'לתקן את הגדר בחלקה הצפונית' }, { path: 'tasks/t-water', title: 'לבדוק את השוקת' },
  { path: 'tasks/t-feed', title: 'להזמין מזון לעיזים' }, { path: 'users/d-orly', title: 'אורלי כהן' }, { path: 'users/d-yoav', title: 'יואב פרץ' },
];
const restoredDocs = new Set<string>(); // put back in this demo session: "now" matches the backup again

const wait = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(structuredClone(v)), 180));
const fakeKey = () => 'hr_DEMO_' + Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 56]).join('');

// watching: 24 hours of site checks with one short outage, the free quota, this morning's check, alerts, the security log
const checks = Array.from({ length: 96 }, (_, i) => {
  const min = (95 - i) * 15 + 4;
  const down = i === 40 || i === 41;
  return { at: ago(min), ok: !down, ms: down ? 10_000 : 180 + ((i * 37) % 220), status: down ? 0 : 200 };
});
let alerts: AlertSettings = { on: true, push: true, updatedAt: null, updatedBy: null };
const health = (): Health => ({
  at: ago(80), date: dayKey(0), by: 'cron', worst: 'warn', r2Bytes: 38_400_000,
  items: [
    { id: 'site', he: 'האתר', state: 'ok', detail: 'עונה · 97.9% מהבדיקות ביממה האחרונה' },
    { id: 'backup', he: 'גיבוי הלילה', state: 'ok', detail: 'נשמר · 246 רשומות' },
    { id: 'failures', he: 'תקלות שרת ביממה', state: 'ok', detail: 'אין' },
    { id: 'push', he: 'התראות לטלפון בתור', state: 'ok', detail: 'התור ריק' },
    { id: 'keys', he: 'מפתחות API', state: 'warn', detail: 'בדיקות אוטומטיות: התוקף נגמר השבוע' },
    { id: 'quota', he: 'מכסת Firestore החינמית', state: 'ok', detail: '18% מהמכסה היומית בשימוש' },
    { id: 'storage', he: 'אחסון R2', state: 'ok', detail: '\u206636.6 MB\u2069 מתוך \u206610 GB\u2069' },
    { id: 'cron', he: 'משימות מתוזמנות', state: 'ok', detail: 'רצות כל 5 דקות' },
  ],
});
const monitor = (): Monitor => ({
  site: { url: 'havat-ravve.web.app', checks, downSince: null, incidents: [{ from: checks[40].at, to: checks[42].at }], uptime: 97.9 },
  quota: { at: ago(12), since: ago(14 * 60), reads: 8_930, writes: 1_210, deletes: 64 },
  limits: { reads: 50_000, writes: 20_000, deletes: 20_000, r2Bytes: 10 * 1024 ** 3 },
  health: health(), alerts, cronAt: ago(2),
});
const ev = (min: number, kind: SecurityEvent['kind'], who: string, what: string, detail = '', ok = kind === 'console'): SecurityEvent => ({ at: ago(min), kind, who, what, detail, ok });
const security: SecurityEvent[] = [
  ev(8, 'console', 'מני בעלים', 'כניסה לקונסולה'),
  ev(42, 'console', 'מני בעלים', 'החלפת מפתח API'),
  ev(95, 'refused', 'האינסטינקט של בני', 'שליחת הודעה לצוות', 'אין הרשאה: the key may not send broadcasts', false),
  ev(6 * 60, 'limited', 'כתובת לא מוכרת', '/v1/tasks', 'יותר מדי בקשות בזמן קצר: נחסם לדקה', false),
  ev(DAY + 30, 'console', 'בני גוטמן', 'כניסה לקונסולה'),
  ev(2 * DAY, 'console', 'מני בעלים', 'שחזור מסל המחזור'),
  ev(3 * DAY, 'refused', 'מפתח ישן לניסוי', 'רשימת משימות', 'לא מחובר: the key was revoked', false),
];

// the data browser: a few made-up records per collection, editable in memory
const SYS = { api_log: 132, api_idempotency: 203, push_jobs: 14, email_outbox: 0 };
type DemoRec = { path: string; fields: Record<string, unknown>; updateTime: string; createTime: string };
const recs: DemoRec[] = [
  ...people.map((p) => ({ path: `users/${p.uid}`, fields: { displayName: p.displayName, email: p.email, phone: p.phone, role: p.role, status: p.status, customerNumber: p.customerNumber }, updateTime: p.updatedAt!, createTime: p.createdAt! })),
  { path: 'tasks/t-fence', fields: { title: 'לתקן את הגדר בחלקה הצפונית', done: false, urgent: true, place: 'החלקה הצפונית', assignee: { uid: 'd-yoav', name: 'יואב פרץ' }, createdAt: ago(9 * DAY), updatedAt: ago(35) }, updateTime: ago(35), createTime: ago(9 * DAY) },
  { path: 'tasks/t-water', fields: { title: 'לבדוק את השוקת', done: true, urgent: false, place: 'החלקה הצפונית', assignee: { uid: 'd-yoav', name: 'יואב פרץ' }, doneAt: ago(DAY), createdAt: ago(9 * DAY), updatedAt: ago(DAY) }, updateTime: ago(DAY), createTime: ago(9 * DAY) },
  { path: 'tasks/t-feed', fields: { title: 'להזמין מזון לעיזים', done: false, urgent: false, place: '', assignee: null, createdAt: ago(2 * DAY), updatedAt: ago(2 * DAY) }, updateTime: ago(2 * DAY), createTime: ago(2 * DAY) },
  { path: 'places/p-north', fields: { name: 'החלקה הצפונית', lat: 31.52, lng: 34.6, createdAt: ago(200 * DAY) }, updateTime: ago(40 * DAY), createTime: ago(200 * DAY) },
  { path: 'places/p-pen', fields: { name: 'דיר העיזים', lat: 31.521, lng: 34.602, createdAt: ago(190 * DAY) }, updateTime: ago(60 * DAY), createTime: ago(190 * DAY) },
  { path: 'events/e-harvest', fields: { title: 'חג האסיף בחווה', date: dayKey(-12), status: 'published', price: 40, capacity: 300 }, updateTime: ago(3 * DAY), createTime: ago(30 * DAY) },
  { path: 'events/e-harvest/vendors/v1', fields: { name: 'רז גבינות העמק', status: 'approved', fee: 150 }, updateTime: ago(4 * DAY), createTime: ago(20 * DAY) },
  { path: 'events/e-harvest/vendors/v2', fields: { name: 'מאפיית הכפר', status: 'pending', fee: 150 }, updateTime: ago(2 * DAY), createTime: ago(6 * DAY) },
  { path: 'shopping/s-hay', fields: { text: 'חבילות חציר', bought: false, qty: 4, addedBy: { uid: 'd-beni', name: 'בני גוטמן' } }, updateTime: ago(5 * 60), createTime: ago(5 * 60) },
  { path: 'settings/site', fields: { title: 'חוות רווה', email: 'farm@demo.invalid', ticketsOpen: true }, updateTime: ago(20 * DAY), createTime: ago(300 * DAY) },
];
const groupOfPath = (p: string) => p.split('/').filter((_, i) => i % 2 === 0).join('/*/');
const titleOfRec = (f: Record<string, unknown>) => String(f.title || f.name || f.displayName || f.text || f.email || '');
const typeOfVal = (v: unknown) => (v === null ? 'null' : typeof v === 'boolean' ? 'boolean' : typeof v === 'number' ? (Number.isInteger(v) ? 'integer' : 'double') : typeof v === 'string' ? 'string' : Array.isArray(v) ? 'array' : 'map');
const docOfRec = (r: DemoRec): DataDoc => {
  const g = groupOfPath(r.path);
  return {
    path: r.path, id: r.path.split('/').pop()!, group: g, title: titleOfRec(r.fields), fields: structuredClone(r.fields),
    types: Object.fromEntries(Object.entries(r.fields).map(([k, v]) => [k, typeOfVal(v)])), createTime: r.createTime, updateTime: r.updateTime,
    subcollections: recs.some((x) => x.path.startsWith(r.path + '/')) ? [...new Set(recs.filter((x) => x.path.startsWith(r.path + '/')).map((x) => x.path.slice(r.path.length + 1).split('/')[0]))] : [],
    readOnly: ['users', 'api_log', 'api_failures', 'api_idempotency'].includes(g.split('/*/').pop()!),
  };
};

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
  const month = (i: number) => { const d = new Date(); d.setDate(15); d.setMonth(d.getMonth() - (11 - i)); return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(d).slice(0, 7); };
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

// ---------- switches, the send queue, scheduled jobs (round 5) ----------
const demoSwitches: Switches = {
  emailPaused: false, pushPaused: false, keysStopped: false, readOnly: false, maintenance: false, maintenanceText: '', registrationClosed: false,
  backupPaused: false, monitorPaused: false, cleanupPaused: false, updatedAt: ago(3 * DAY), updatedBy: 'מני בעלים',
};
const demoQueue: Omit<Queue, 'switches'> = {
  email: { on: true }, push: { mode: 'webpush' },
  emails: [
    { id: 'order_k3h2', kind: 'order', status: 'queued', reason: '', error: '', who: 'מיכל אברהם', attempts: 0, provider: '', createdAt: ago(2), nextAt: ago(-1), updatedAt: ago(2), updateTime: ago(2) },
    { id: 'donation_x81', kind: 'donation', status: 'failed', reason: 'invalid_address', error: 'הכתובת לא קיימת', who: 'משפחת לוי', attempts: 1, provider: 'brevo', createdAt: ago(5 * 60), nextAt: '', updatedAt: ago(5 * 60 - 4), updateTime: ago(5 * 60 - 4) },
    { id: 'tab_p02', kind: 'tab', status: 'failed', reason: 'expired', error: '', who: 'דוכן הדבש', attempts: 3, provider: 'resend', createdAt: ago(DAY + 40), nextAt: '', updatedAt: ago(DAY + 28), updateTime: ago(DAY + 28) },
  ],
  pushes: [
    { id: 'b_77ab', kind: 'broadcast', title: 'מחר יום עבודה בכרם', body: 'נפגשים ב־07:30 ליד המחסן', to: 14, done: 9, createdAt: ago(3), by: 'בני גוטמן', stale: false, updateTime: ago(1) },
  ],
};
const demoJobs = (): Omit<Jobs, 'jobs'> & { jobs: Omit<Jobs['jobs'][number], 'paused'>[] } => ({
  cronAt: ago(2), cronMs: 1840,
  jobs: [
    { id: 'email', he: 'מיילים על תשלומים', every: 'כל 5 דקות', canPause: true, canRun: true, last: { at: ago(2), ms: 410, ok: true, result: { enabled: true, sent: 1, failed: 0, skipped: 0, waiting: 0 } } },
    { id: 'push', he: 'התראות לטלפון', every: 'כל 5 דקות', canPause: true, canRun: true, last: { at: ago(2), ms: 620, ok: true, result: { mode: 'webpush', jobs: 1, delivered: 9, failed: 0 } } },
    { id: 'monitor', he: 'בדיקת האתר והמכסה', every: 'האתר כל 15 דקות, המכסה כל שעה, בדיקה כללית כל בוקר', canPause: true, canRun: true, last: { at: ago(2), ms: 0, ok: true, result: { site: '{"ok":true,"ms":212}', quota: 'ok', health: 'ok' } } },
    { id: 'backup', he: 'גיבוי לילי', every: 'כל לילה מ־03:00', canPause: true, canRun: true, last: { at: ago(4 * 60), ms: 900, ok: true, result: { done: true, docs: 1840, parts: 7 } } },
    { id: 'cleanup', he: 'ניקוי רשומות ישנות', every: 'כל לילה אחרי הגיבוי, עד 06:00', canPause: true, canRun: true, last: { at: ago(4 * 60 - 20), ms: 380, ok: true, result: { done: true, archived: 212, deleted: 212 } } },
    { id: 'accounts', he: 'מחיקת חשבונות', every: 'כל 5 דקות, 30 יום אחרי הבקשה', canPause: false, canRun: false, last: { at: ago(2), ms: 45, ok: true, result: { due: 0, deleted: 0 } } },
  ],
  cleanup: {
    items: [
      { collection: 'api_idempotency', he: 'זיכרון בקשות חוזרות של ה־API', days: 7, due: 38 },
      { collection: 'api_log', he: 'יומן הבקשות של ה־API', days: 90, due: 0 },
      { collection: 'api_failures', he: 'תקלות שרת', days: 90, due: 3 },
      { collection: 'push_jobs', he: 'התראות לטלפון שנשלחו', days: 30, due: 61 },
      { collection: 'email_outbox', he: 'מיילים שנשלחו', days: 365, due: 0 },
    ],
    last: { date: dayKey(0), archived: 212, deleted: 212, done: true, at: ago(4 * 60 - 20), by: 'cron' },
  },
  archive: { collections: [{ collection: 'api_idempotency', files: 4, bytes: 182_000 }, { collection: 'push_jobs', files: 2, bytes: 64_000 }, { collection: 'api_failures', files: 1, bytes: 3_100 }] },
});
const PAUSE: Record<string, keyof Switches> = { email: 'emailPaused', push: 'pushPaused', monitor: 'monitorPaused', backup: 'backupPaused', cleanup: 'cleanupPaused' };

export const demoSource: Source = {
  demo: true,
  me: () => wait({ uid: 'd-owner', name: 'מני בעלים', role: 'owner' as const }),
  overview: () => wait(overview()),
  keys: () => wait(keys),
  createKey: async ({ label, actor, expiresAt }) => {
    const id = 'cred-demo-' + (keys.length + 1);
    keys.push({ id, label, actors: [actor], status: 'active', expiresAt, rotating: false, previousUntil: null, source: 'console', createdAt: ago(0), createdBy: 'מני בעלים', updatedAt: ago(0) });
    lastUse[id] = null;
    return wait({ id, key: fakeKey() });
  },
  changeKey: async (id, action, body = {}) => {
    const k = keys.find((x) => x.id === id);
    if (!k) throw new Error('no such key');
    k.updatedAt = ago(0);
    k.source = 'console';
    if (action === 'rename') k.label = String(body.label);
    if (action === 'revoke') k.status = 'revoked';
    if (action === 'restore') k.status = k.expiresAt && Date.parse(k.expiresAt) < Date.now() ? 'expired' : 'active';
    if (action === 'expire') { k.expiresAt = (body.expiresAt as string) || null; k.status = k.status === 'revoked' ? 'revoked' : k.expiresAt && Date.parse(k.expiresAt) < Date.now() ? 'expired' : 'active'; }
    if (action === 'rotate') {
      const h = Number(body.graceHours ?? 24);
      k.rotating = h > 0; k.previousUntil = h > 0 ? ago(-h * 60) : null; k.status = 'active';
      return wait({ id, key: fakeKey() });
    }
    return wait({ id });
  },
  people: () => wait(people),
  recent: (n) => wait(recent.slice(0, n)),
  lastUse: (ids) => wait(Object.fromEntries(ids.map((id) => [id, lastUse[id] ?? null]))),
  action: async (op, body) => {
    const p = people.find((x) => x.uid === body.uid);
    if (op === 'people.setRole' && p) p.role = body.role as Person['role'];
    if (op === 'people.setStatus' && p) p.status = body.status as Person['status'];
    if (op === 'people.setNotes' && p) p.notes = String(body.notes);
    if (op === 'people.delete' && p) people.splice(people.indexOf(p), 1);
    if (p) p.updatedAt = ago(0);
    return wait({ changed: true });
  },
  backups: () => wait({ items: backups, running: null }),
  runBackup: async () => {
    const b = { ...backups[0], startedAt: ago(0), finishedAt: ago(0), by: 'מני בעלים' };
    backups[0] = b;
    return wait({ done: true, date: b.date, docs: b.docs });
  },
  downloadBackup: async () => { await wait(null); throw new Error('demo'); },
  backupDocs: (_date, collection) => {
    const items = demoDocs.filter((d) => d.path.startsWith(collection + '/')).map((d) => ({ ...d, updateTime: ago(3 * DAY) }));
    return wait({ items, total: items.length });
  },
  backupDoc: (_date, path) => {
    const d = demoDocs.find((x) => x.path === path);
    const then = { title: d?.title || path, place: 'החלקה הצפונית', done: false, assignee: { uid: 'd-yoav', name: 'יואב פרץ' }, createdAt: ago(9 * DAY) };
    const now = restoredDocs.has(path) ? { ...then } : path === 'tasks/t-fence' ? null : { ...then, done: true, doneAt: ago(DAY) };
    return wait({ path, then, now, thenUpdated: ago(3 * DAY), nowUpdated: now ? ago(DAY) : null });
  },
  restoreBackup: (_date, paths) => { paths.forEach((p) => restoredDocs.add(p)); return wait({ restored: paths.length, missing: 0 }); },
  trash: () => wait(trash),
  restoreTrash: (keys) => {
    const restored = trash.filter((t) => keys.includes(t.key)).map((t) => t.path);
    for (const k of keys) { const i = trash.findIndex((t) => t.key === k); if (i >= 0) trash.splice(i, 1); }
    return wait({ restored, exists: [], gone: [] });
  },
  monitor: () => wait(monitor()),
  checkNow: () => wait(monitor()),
  setAlerts: (b) => { alerts = { ...alerts, ...b, updatedAt: ago(0), updatedBy: 'מני בעלים' }; return wait(alerts); },
  testAlert: () => wait({ sent: true, push: alerts.push }),
  security: (days) => wait({ since: ago(days * DAY), items: security.filter((e) => Date.now() - Date.parse(e.at) < days * DAY * 60_000) }),
  dataCollections: () => {
    const counts: Record<string, number> = { ...COLS, ...SYS, users: people.length };
    for (const r of recs) counts[groupOfPath(r.path)] = Math.max(counts[groupOfPath(r.path)] || 0, recs.filter((x) => groupOfPath(x.path) === groupOfPath(r.path)).length);
    const items = Object.entries(counts).map(([group, count]) => ({ group, count: group.includes('/*/') ? null : count, backupCount: count, readOnly: ['users', 'api_log', 'api_failures', 'api_idempotency'].includes(group) }));
    return wait({ items: items.sort((a, b) => (b.count ?? b.backupCount ?? 0) - (a.count ?? a.backupCount ?? 0)), backupDate: dayKey(0) });
  },
  dataDocs: (group, _after, parent) => wait({ items: recs.filter((r) => groupOfPath(r.path) === group && (!parent || r.path.startsWith(parent + '/'))).map((r) => ({ path: r.path, id: r.path.split('/').pop()!, title: titleOfRec(r.fields), updateTime: r.updateTime })), next: null }),
  dataDoc: async (path) => { const r = recs.find((x) => x.path === path); if (!r) throw new Error('not found'); return wait(docOfRec(r)); },
  dataHistory: (path, days) => {
    const r = recs.find((x) => x.path === path);
    const now = r ? { updateTime: r.updateTime, fields: structuredClone(r.fields) } : null;
    const older: Record<string, unknown> | null = r ? { ...r.fields, ...(typeof r.fields.done === 'boolean' ? { done: !r.fields.done } : {}), ...(typeof r.fields.status === 'string' ? { status: 'draft' } : {}) } : null;
    const versions = r ? [
      { updateTime: r.updateTime, from: dayKey(1), to: dayKey(0), fields: structuredClone(r.fields), changed: Object.keys(r.fields).filter((k) => JSON.stringify(r.fields[k]) !== JSON.stringify(older![k])) },
      { updateTime: ago(8 * DAY), from: dayKey(Math.min(days, 7) - 1), to: dayKey(2), fields: older, changed: [] },
    ] : [];
    const activity = path.startsWith('tasks/') ? [
      { at: ago(35), text: 'סומנה דחוף: ' + titleOfRec(r?.fields || {}), by: 'מני בעלים', action: 'urgent', via: 'האינסטינקט של מני' },
      { at: ago(9 * DAY), text: 'נוצרה: ' + titleOfRec(r?.fields || {}), by: 'בני גוטמן', action: 'created', via: '' },
    ] : [];
    return wait({ path, now, versions, activity, days: Math.min(days, 12) });
  },
  editDoc: (path, set) => { const r = recs.find((x) => x.path === path)!; Object.assign(r.fields, set); r.updateTime = ago(0); return wait({ path, updateTime: r.updateTime }); },
  deleteDoc: (path) => { const i = recs.findIndex((x) => x.path === path); const r = recs[i]; recs.splice(i, 1); trash.unshift({ key: `trash/d/${Date.now()}-dddddddd.json`, path, collection: groupOfPath(path), title: titleOfRec(r.fields), by: 'קונסולה · מני', who: 'מני בעלים', requestId: 'req_demo', deletedAt: ago(0) }); return wait({ path, deleted: true }); },
  exportCsv: async () => { await wait(null); throw new Error('demo'); },
  stats: (days) => wait(demoStats(days)),
  traffic: (days) => wait(demoTraffic(days)),
  switches: () => wait({ switches: demoSwitches, server: { email: { on: true, configured: true }, push: { mode: 'webpush' } } }),
  setSwitches: (b) => { Object.assign(demoSwitches, b, { updatedAt: ago(0), updatedBy: 'מני בעלים' }); return wait({ switches: demoSwitches, server: { email: { on: true, configured: true }, push: { mode: 'webpush' } } }); },
  queue: () => wait({ ...demoQueue, switches: demoSwitches }),
  emailAction: (id, action) => { const e = demoQueue.emails.find((x) => x.id === id)!; e.status = action === 'retry' ? 'queued' : 'cancelled'; e.reason = ''; e.updateTime = ago(0); if (action === 'cancel') demoQueue.emails = demoQueue.emails.filter((x) => x.id !== id); return wait({ id, status: e.status }); },
  cancelPush: (id) => { demoQueue.pushes = demoQueue.pushes.filter((x) => x.id !== id); return wait({ id, cancelled: true }); },
  emailPreview: () => {
    const text = 'שלום דנה לוי, קיבלנו את התשלום בסך 120 ₪ עבור 2 כרטיסים לחג האסיף. תודה מחוות רווה!';
    return wait({ subject: 'אישור תשלום מחוות רווה', from: 'חוות רווה', template: 'שלום [שם], קיבלנו את התשלום בסך [סכום] עבור [עבור]. תודה מחוות רווה!', custom: false, text, html: `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:16px;line-height:1.6;color:#1f2a1f"><p style="margin:0 0 14px">${text}</p></div>` });
  },
  jobs: () => { const j = demoJobs(); return wait({ ...j, jobs: j.jobs.map((x) => ({ ...x, paused: PAUSE[x.id] ? !!demoSwitches[PAUSE[x.id]] : false })) }); },
  runJob: (id) => wait({ id, result: { done: true } }),
};
