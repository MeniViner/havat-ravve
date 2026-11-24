// The demo's content: מצב: מצב כללי, ניטור, מהירות (K1-K3).
import type { AlertSettings, Health, HealthState, LogEntry, Monitor, MonitorEvent, Overview, Source, Speed } from '../source';
import { ago, at, DAY, dayKey, wait } from './base';
import { demoQueue } from './sending';

const entry = (min: number, credential: string, keyLabel: string, name: string, op: string, opHe: string, verb: string, body: Record<string, unknown> = {}, ok = true): LogEntry =>
  ({ id: 'l' + min, at: ago(min), credential, keyLabel, actor: { id: 'user:x', role: 'owner', uid: 'x', name }, kind: 'write', op, opHe, verb, ok, code: ok ? '' : 'FORBIDDEN', message: '', status: ok ? 200 : 403, body: JSON.stringify(body) });
const recent: LogEntry[] = [
  entry(3, 'cred-assistant', 'האינסטינקט של מני', 'מני בעלים', 'tasks.create', 'יצירת משימה חדשה', 'יצר', { title: 'לתקן את הברז ליד החממה' }),
  entry(11, 'cred-assistant', 'האינסטינקט של מני', 'מני בעלים', 'shopping.add', 'הוספת פריט לרשימת הקניות', 'יצר'),
  entry(42, 'console', 'קונסולה · מני', 'מני בעלים', 'console.keys.rotate', 'החלפת מפתח API', 'ערך'),
  entry(95, 'cred-beni', 'האינסטינקט של בני', 'בני גוטמן', 'broadcasts.send', 'שליחת הודעה לצוות (מגיעה כהתראה באפליקציה ובטלפון)', 'שלח', {}, false),
  entry(130, 'cred-beni', 'האינסטינקט של בני', 'בני גוטמן', 'tasks.complete', 'סימון משימה כבוצעה, בשם מי שקורא', 'ביצע'),
];

const overview = (): Overview => ({
  server: { status: 'ok', catalogVersion: '3.0.0', version: '68a66274-demo', deployedAt: at('2026-11-22', '16:42'), project: 'havat-ravve' },
  last24h: { requests: 412, writes: 57, failed: 3, failures: 0, p50: 230 },
  // the same queue and switches the תור שליחה and מתגים screens show
  queues: { pushPending: demoQueue.pushes.length, email: { pending: demoQueue.emails.filter((e) => e.status === 'queued' || e.status === 'sending').length, sent: 0, failed: demoQueue.emails.filter((e) => e.status === 'failed').length } },
  crons: { at: ago(2), wallMs: 840 },
  switches: { email: { on: demoQueue.email.on, configured: true, brevo: true, resend: false }, push: { mode: demoQueue.push.mode }, files: { r2: true } },
});

// watching: 24 hours of site checks with one short outage, the free quota, this morning's check, alerts, the security log
const checks = Array.from({ length: 96 }, (_, i) => {
  const min = (95 - i) * 15 + 13;
  const down = i === 41 || i === 42;
  return { at: ago(min), ok: !down, ms: down ? 10_000 : 180 + ((i * 37) % 220), status: down ? 0 : 200 };
});
let alerts: AlertSettings = { on: true, push: true, daily: false, updatedAt: null, updatedBy: null };
// "בדיקה עכשיו" moves the check to the demo's now
let checked: { at: string; by: string } = { at: at('2026-11-23', '07:00'), by: 'cron' };
const health = (): Health => ({
  at: checked.at, date: dayKey(0), by: checked.by, worst: 'warn', r2Bytes: 38_400_000,
  items: [
    { id: 'site', he: 'האתר', state: 'ok', detail: 'עונה · 97.9% ביממה' },
    { id: 'backup', he: 'גיבוי הלילה', state: 'ok', detail: '246 רשומות · \u2066147 KB\u2069' },
    { id: 'failures', he: 'תקלות שרת ביממה', state: 'ok', detail: 'אין ביממה' },
    { id: 'push', he: 'התראות לטלפון בתור', state: 'ok', detail: 'התור ריק' },
    { id: 'keys', he: 'מפתחות API', state: 'warn', detail: 'בדיקות אוטומטיות: התוקף נגמר ביום חמישי' },
    { id: 'quota', he: 'מכסת Firestore החינמית', state: 'ok', detail: '18% בשימוש היום' },
    { id: 'storage', he: 'אחסון R2', state: 'ok', detail: '\u206636.6 MB\u2069 מתוך \u206610 GB\u2069' },
    { id: 'cron', he: 'משימות מתוזמנות', state: 'ok', detail: 'רצות כל 5 דקות' },
  ],
});
/** The week's checks: all well, but for what the events below tell. */
const OFF: Record<string, Record<string, HealthState>> = { [dayKey(3)]: { backup: 'bad' }, [dayKey(4)]: { failures: 'warn' }, [dayKey(1)]: { keys: 'warn' }, [dayKey(0)]: { keys: 'warn' } };
const week = (): NonNullable<Monitor['week']> => [6, 5, 4, 3, 2, 1, 0].map((n) => ({ date: dayKey(n), states: Object.fromEntries(health().items.map((i) => [i.id, OFF[dayKey(n)]?.[i.id] || 'ok'])) }));
const events: MonitorEvent[] = [
  { at: checks[41].at, kind: 'site', he: 'האתר לא ענה', minutes: 30, alerted: true },
  { at: at('2026-11-20', '03:00'), kind: 'backup', he: 'גיבוי הלילה לא הסתיים', minutes: null, until: 'morning', alerted: true },
  { at: at('2026-11-19', '14:10'), kind: 'failures', he: '3 תקלות שרת בשעה', minutes: null, alerted: false },
];
const monitor = (): Monitor => ({
  site: { url: 'havat-ravve.web.app', checks, downSince: null, incidents: [{ from: checks[41].at, to: checks[43].at }], uptime: 97.9 },
  quota: { at: ago(12), since: ago(14 * 60), reads: 8_930, writes: 1_210, deletes: 64 },
  limits: { reads: 50_000, writes: 20_000, deletes: 20_000, r2Bytes: 10 * 1024 ** 3 },
  health: health(), alerts, cronAt: ago(2), week: week(), events,
});

// ---------- speed, run any operation (round 7) ----------
const WEEK_P95 = [700, 800, 800, 900, 1000, 1100, 900];
const WEEK_COUNT = [38, 41, 47, 35, 29, 55, 56];
const op = (o: string, he: string, kind: string, count: number, p50: number, p95: number, max: number, errors = 0): Speed['ops'][number] => ({ op: o, he, kind, count, p50, p95, max, errors });
const OPS: Speed['ops'] = [
  op('console.backups.download', 'הורדת גיבוי', 'read', 3, 2100, 3400, 3400), op('console.stats', 'סטטיסטיקות', 'read', 14, 940, 1610, 1640), op('tasks.create', 'יצירת משימה חדשה', 'write', 46, 420, 980, 1350),
  op('shopping.add', 'הוספת פריט לקניות', 'write', 22, 390, 860, 1100), op('overview.get', 'מבט כללי על החווה', 'read', 61, 310, 720, 1200), op('tasks.list', 'רשימת משימות', 'read', 118, 190, 450, 820), op('people.search', 'חיפוש אדם לפי שם', 'read', 37, 160, 380, 510),
];
const MORE: Speed['ops'] = [op('events.list', 'רשימת אירועים', 'read', 34, 240, 610, 900), op('tickets.list', 'הזמנות וכרטיסים', 'read', 28, 280, 590, 870), op('broadcasts.send', 'שליחת הודעה לצוות', 'write', 5, 510, 1100, 1300, 1), op('presence.save', 'רישום נוכחות', 'write', 12, 330, 540, 620)];
const demoSpeed = (days: number): Speed => {
  const far = days > 7;
  const perDay = days > 1 ? Array.from({ length: days }, (_, i) => {
    const w = i - (days - 7);
    return w >= 0 ? { day: dayKey(days - 1 - i), count: WEEK_COUNT[w], p50: 190 + w * 8, p95: WEEK_P95[w] } : { day: dayKey(days - 1 - i), count: 24 + ((i * 11) % 30), p50: 180 + ((i * 37) % 90), p95: 620 + ((i * 53) % 500) };
  }) : [];
  const times = days === 1 ? 0.19 : far ? 3.6 : 1;
  const ops = [...OPS.filter((o) => days > 1 || o.count > 10), ...(far ? MORE : [])].map((o) => ({ ...o, count: Math.max(1, Math.round(o.count * (o.errors ? 1 : times))) })).sort((a, b) => b.p95 - a.p95);
  return {
    days, from: ago(days * DAY), slowMs: 2000, truncated: false,
    total: { count: ops.reduce((a, o) => a + o.count, 0), p50: days === 1 ? 210 : far ? 240 : 230, p95: days === 1 ? 900 : far ? 970 : 910, max: days === 1 ? 1600 : 3400, slow: days === 1 ? 0 : far ? 6 : 2, errors: days === 1 ? 0 : far ? 3 : 1 },
    ops, perDay,
    slowest: [
      ...(days === 1 ? [] : [
        { at: ago(2 * DAY), op: 'console.backups.download', he: 'הורדת גיבוי', ms: 3400, status: 200, key: 'קונסולה' },
        ...(far ? [{ at: ago(16 * DAY), op: 'console.backups.download', he: 'הורדת גיבוי', ms: 2900, status: 200, key: 'קונסולה' }, { at: ago(21 * DAY), op: 'console.stats', he: 'סטטיסטיקות', ms: 2400, status: 200, key: 'קונסולה' }] : []),
        { at: ago(4 * DAY), op: 'console.backups.download', he: 'הורדת גיבוי', ms: 2100, status: 200, key: 'קונסולה' },
      ]),
      { at: '', op: 'console.stats', he: 'סטטיסטיקות', ms: 1640, status: 200, key: 'האינסטינקט של מני' },
      ...(days === 1 ? [{ at: ago(190), op: 'tasks.create', he: 'יצירת משימה חדשה', ms: 1350, status: 200, key: 'האינסטינקט של מני' }] : []),
    ],
    cron: { at: ago(3), wallMs: 2400, jobs: [{ id: 'email', ms: 820, at: ago(3), ok: true }, { id: 'cleanup', ms: 960, at: ago(8 * 60), ok: true }, { id: 'backup', ms: 1310, at: ago(9 * 60), ok: true }, { id: 'accounts', ms: 140, at: ago(3), ok: true }, { id: 'push', ms: 90, at: ago(3), ok: true }] },
    site: { checks: 96, p50: 280, p95: 390 },
  };
};

export const statusDemo: Pick<Source, 'overview' | 'recent' | 'monitor' | 'checkNow' | 'setAlerts' | 'testAlert' | 'speed'> = {
  overview: () => wait(overview()),
  recent: (n) => wait(recent.slice(0, n)),
  monitor: () => wait(monitor()),
  checkNow: () => { checked = { at: ago(0), by: 'מני בעלים' }; return wait(monitor()); },
  setAlerts: (b) => { alerts = { ...alerts, ...b, updatedAt: ago(0), updatedBy: 'מני בעלים' }; return wait(alerts); },
  testAlert: () => wait({ sent: true, push: alerts.push }),
  speed: (days) => wait(demoSpeed(days)),
};
