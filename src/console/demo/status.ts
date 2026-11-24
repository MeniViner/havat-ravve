// The demo's content: מצב: מצב כללי, ניטור, מהירות (K1-K3).
import type { AlertSettings, Health, LogEntry, Monitor, Overview, Source, Speed } from '../source';
import { ago, DAY, dayKey, wait } from './base';
import { demoQueue } from './sending';

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
  // the same queue and switches the תור שליחה and מתגים screens show
  queues: { pushPending: demoQueue.pushes.length, email: { pending: demoQueue.emails.filter((e) => e.status === 'queued' || e.status === 'sending').length, sent: 0, failed: demoQueue.emails.filter((e) => e.status === 'failed').length } },
  crons: { at: ago(2), wallMs: 840 },
  switches: { email: { on: demoQueue.email.on, configured: true, brevo: true, resend: false }, push: { mode: demoQueue.push.mode }, files: { r2: true } },
});

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

// ---------- speed, run any operation (round 7) ----------
const demoSpeed = (days: number): Speed => {
  const perDay = days > 1 ? Array.from({ length: days }, (_, i) => ({ day: dayKey(days - 1 - i), count: 30 + ((i * 11) % 40), p50: 180 + ((i * 37) % 90), p95: 620 + ((i * 53) % 700) })) : [];
  const ops: Speed['ops'] = [
    { op: 'console.backups.download', he: 'הורדת גיבוי', kind: 'read', count: 3, p50: 2100, p95: 3400, max: 3400, errors: 0 },
    { op: 'console.stats', he: 'סטטיסטיקות', kind: 'read', count: 14, p50: 940, p95: 1610, max: 1720, errors: 0 },
    { op: 'tasks.create', he: 'יצירת משימה חדשה', kind: 'write', count: 46, p50: 420, p95: 980, max: 1350, errors: 0 },
    { op: 'shopping.add', he: 'הוספת פריט לרשימת הקניות', kind: 'write', count: 22, p50: 390, p95: 860, max: 1100, errors: 0 },
    { op: 'overview.get', he: 'מבט כללי על החווה', kind: 'read', count: 61, p50: 310, p95: 720, max: 1900, errors: 1 },
    { op: 'tasks.list', he: 'רשימת משימות', kind: 'read', count: 118, p50: 190, p95: 450, max: 820, errors: 0 },
    { op: 'people.search', he: 'חיפוש אדם לפי שם', kind: 'read', count: 37, p50: 160, p95: 380, max: 510, errors: 0 },
  ];
  const total = ops.reduce((a, o) => a + o.count, 0);
  return {
    days, from: ago(days * DAY), slowMs: 2000, truncated: false,
    total: { count: total, p50: 230, p95: 910, max: 3400, slow: 2, errors: 1 },
    ops, perDay,
    slowest: [
      { at: ago(2 * DAY), op: 'console.backups.download', he: 'הורדת גיבוי', ms: 3400, status: 200, key: 'קונסולה · מני' },
      { at: ago(4 * DAY + 300), op: 'console.backups.download', he: 'הורדת גיבוי', ms: 2100, status: 200, key: 'קונסולה · מני' },
    ],
    cron: { at: ago(3), wallMs: 2400, jobs: [{ id: 'email', ms: 820, at: ago(3), ok: true }, { id: 'accounts', ms: 140, at: ago(3), ok: true }, { id: 'push', ms: 0, at: ago(3), ok: true }, { id: 'backup', ms: 1310, at: ago(9 * 60), ok: true }, { id: 'cleanup', ms: 960, at: ago(8 * 60), ok: true }, { id: 'monitor', ms: 0, at: ago(3), ok: true }] },
    site: { checks: 96, p50: 180, p95: 340 },
  };
};

export const statusDemo: Pick<Source, 'overview' | 'recent' | 'monitor' | 'checkNow' | 'setAlerts' | 'testAlert' | 'speed'> = {
  overview: () => wait(overview()),
  recent: (n) => wait(recent.slice(0, n)),
  monitor: () => wait(monitor()),
  checkNow: () => wait(monitor()),
  setAlerts: (b) => { alerts = { ...alerts, ...b, updatedAt: ago(0), updatedBy: 'מני בעלים' }; return wait(alerts); },
  testAlert: () => wait({ sent: true, push: alerts.push }),
  speed: (days) => wait(demoSpeed(days)),
};
