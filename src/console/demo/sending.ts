// The demo's content: שליחה ותזמון: תור, משימות, מתגים (K11-K13).
import type { Job, JobRun, Jobs, Queue, QueueEmailView, QueueSent, Source, SwitchChange, Switches } from '../source';
import { ago, at, DAY, dayKey, wait } from './base';

const today = dayKey(0), yesterday = dayKey(1);

// ---------- switches ----------
export const demoSwitches: Switches = {
  emailPaused: false, pushPaused: false, keysStopped: false, readOnly: false, maintenance: false, maintenanceText: '', registrationClosed: false,
  backupPaused: false, monitorPaused: false, cleanupPaused: false, broadcastEmailPaused: false, updatedAt: at('2026-11-20', '10:12'), updatedBy: 'מני בעלים',
};
let changes: SwitchChange[] = [
  { at: at('2026-11-20', '10:12'), by: 'מני בעלים', key: 'broadcastEmailPaused', to: false, reason: 'אחרי בדיקת המכסה של שירות המייל' },
  { at: at('2026-11-18', '15:55'), by: 'מני בעלים', key: 'emailPaused', to: false, reason: 'נשלח מייל ניסיון אחד' },
  { at: at('2026-11-17', '02:10'), by: 'בני גוטמן', key: 'maintenance', to: false, reason: 'התיקון הסתיים' },
];
const switchesView = () => ({ switches: demoSwitches, history: changes, server: { email: { on: true, configured: true }, push: { mode: 'webpush' } } });

// ---------- the send queue ----------
export const demoQueue: Omit<Queue, 'switches'> = {
  email: { on: true }, push: { mode: 'webpush' },
  emails: [
    { id: 'donation_x81', kind: 'donation', status: 'failed', reason: 'invalid_address', error: 'אין תיבה כזאת', who: 'משפחת לוי', attempts: 3, provider: 'brevo', createdAt: at(today, '13:10'), nextAt: '', updatedAt: at(today, '13:36'), updateTime: at(today, '13:36') },
    { id: 'tab_p02', kind: 'tab', status: 'failed', reason: 'invalid_address', error: 'אין תיבה כזאת', who: 'דוכן הדבש', attempts: 1, provider: 'resend', createdAt: at(yesterday, '18:08'), nextAt: '', updatedAt: at(yesterday, '18:14'), updateTime: at(yesterday, '18:14') },
    { id: 'order_k3h2', kind: 'order', status: 'queued', reason: '', error: '', who: 'מיכל אברהם', attempts: 0, provider: '', createdAt: ago(2), nextAt: ago(-1), updatedAt: ago(2), updateTime: ago(2) },
  ],
  pushes: [
    { id: 'b_77ab', kind: 'broadcast', title: 'מחר יום עבודה בכרם', body: 'נפגשים ב־07:30 ליד המחסן', to: 14, done: 0, createdAt: ago(2), by: 'בני גוטמן', stale: false, updateTime: ago(1) },
  ],
  sentToday: 9, daily: { used: 11, limit: 300 },
};
// what went out: two today and two yesterday as drawn, and the day's seven pushes to one person each
const one = (id: string, kind: string, who: string, what: string, time: string): QueueSent => ({ id, type: 'push', kind, who, what, to: 1, attempts: 1, at: at(today, time) });
const sent: QueueSent[] = [
  one('p_91', 'task', 'יואב פרץ', 'משימה חדשה: לתקן את הברז ליד החממה', '18:33'),
  one('p_90', 'task', 'אורלי כהן', 'משימה חדשה: להשקות את השתילים', '17:05'),
  { id: 'order_n41', type: 'email', kind: 'order', who: 'נגה ברק', what: 'אישור תשלום · כרטיסים', to: 1, attempts: 1, at: at(today, '16:20') },
  { id: 'b_76f0', type: 'push', kind: 'broadcast', who: 'כל הצוות', what: 'מחר מתחילים ב־15:30', to: 12, attempts: 1, at: at(today, '14:10') },
  one('p_88', 'task', 'מתן לוי', 'המשימה בוצעה: לסגור את הגדר', '12:46'),
  one('p_87', 'vendor', 'רז גבינות העמק', 'הדוכן שלך אושר', '11:30'),
  one('p_86', 'trip', 'יואב פרץ', 'הנסיעה לעיר יוצאת ב־11:00', '10:15'),
  one('p_85', 'task', 'אורלי כהן', 'המשימה שלך להיום: למיין ביצים', '08:00'),
  one('p_84', 'event', 'מתן לוי', 'חג האסיף: נשארו 12 מקומות', '07:40'),
  { id: 'donation_t90', type: 'email', kind: 'donation', who: 'נועם אדרי', what: 'קבלה על תרומה', to: 1, attempts: 1, at: at(yesterday, '11:02') },
  { id: 'n_visit3', type: 'push', kind: 'system', who: 'מנהלים', what: 'בקשת ביקור חדשה', to: 5, attempts: 1, at: at(yesterday, '09:48') },
];
const mails: Record<string, QueueEmailView> = {
  donation_x81: { id: 'donation_x81', to: 'levi.fam@demo.invalid', subject: 'קיבלנו את התרומה שלך', text: 'שלום משפחת לוי, קיבלנו 180 ₪, עשר פעמים חי. תודה מכל הלב. חוות רווה', uid: 'd-levi', amount: 180, by: 'בני', createdAt: at(today, '13:10'), lastAttemptAt: at(today, '13:36'), providerSaid: 'אין תיבה כזאת' },
  tab_p02: { id: 'tab_p02', to: 'honey@demo.invalid', subject: 'אישור תשלום מחוות רווה', text: 'שלום דוכן הדבש, קיבלנו את התשלום בסך 340 ₪ עבור חשבון הדוכן. תודה מחוות רווה!', uid: 'd-honey', amount: 340, by: 'מתן', createdAt: at(yesterday, '18:08'), lastAttemptAt: at(yesterday, '18:14'), providerSaid: 'אין תיבה כזאת' },
  order_k3h2: { id: 'order_k3h2', to: 'michal@demo.invalid', subject: 'אישור תשלום מחוות רווה', text: 'שלום מיכל אברהם, קיבלנו את התשלום בסך 120 ₪ עבור 2 כרטיסים לחג האסיף. תודה מחוות רווה!', uid: 'd-michal', amount: 120, by: 'בני', createdAt: ago(2), lastAttemptAt: null, providerSaid: '' },
  order_n41: { id: 'order_n41', to: 'noga@demo.invalid', subject: 'אישור תשלום מחוות רווה', text: 'שלום נגה ברק, קיבלנו את התשלום בסך 240 ₪ עבור 4 כרטיסים לחג האסיף. תודה מחוות רווה!', uid: 'd-noga', amount: 240, by: 'בני', createdAt: at(today, '16:14'), lastAttemptAt: at(today, '16:20'), providerSaid: '' },
  donation_t90: { id: 'donation_t90', to: 'noam@demo.invalid', subject: 'קיבלנו את התרומה שלך', text: 'שלום נועם אדרי, קיבלנו 360 ₪. תודה מכל הלב. חוות רווה', uid: '', amount: 360, by: 'בני', createdAt: at(yesterday, '10:57'), lastAttemptAt: at(yesterday, '11:02'), providerSaid: '' },
};

// ---------- scheduled jobs ----------
const jobs: Omit<Job, 'paused'>[] = [
  { id: 'email', he: 'מיילים על תשלומים', every: 'כל 5 דקות', canPause: true, canRun: true, last: { at: ago(2), ms: 800, ok: true, result: { enabled: true, sent: 1, failed: 0, skipped: 0, waiting: 0 } } },
  { id: 'push', he: 'התראות לטלפון', every: 'כל 5 דקות', canPause: true, canRun: true, last: { at: ago(2), ms: 100, ok: true, result: { mode: 'webpush', jobs: 1, delivered: 9, failed: 0 } } },
  { id: 'monitor', he: 'בדיקת האתר והמכסה', every: 'האתר כל 15 דקות, המכסה כל שעה, בדיקה כללית כל בוקר', canPause: true, canRun: true, last: { at: ago(2), ms: 100, ok: true, result: { site: '{"ok":true,"ms":212}', quota: 'ok', health: 'ok' } } },
  { id: 'backup', he: 'גיבוי לילי', every: 'כל לילה מ־03:00', canPause: true, canRun: true, last: { at: ago(4 * 60), ms: 1300, ok: true, result: { done: true, docs: 1840, parts: 7 } } },
  { id: 'cleanup', he: 'ניקוי רשומות ישנות', every: 'כל לילה אחרי הגיבוי, עד 06:00', canPause: true, canRun: true, last: { at: ago(4 * 60), ms: 1000, ok: true, result: { done: true, archived: 212, deleted: 212 } } },
  { id: 'accounts', he: 'מחיקת חשבונות', every: 'כל 5 דקות, 30 יום אחרי הבקשה', canPause: false, canRun: false, last: { at: ago(2), ms: 100, ok: true, result: { due: 0, deleted: 0 } } },
];
const PAUSE: Record<string, keyof Switches> = { email: 'emailPaused', push: 'pushPaused', monitor: 'monitorPaused', backup: 'backupPaused', cleanup: 'cleanupPaused' };
// the round that failed stands where the design draws it, and says the hour the design says
const BAD = 30;
const rounds: NonNullable<Jobs['rounds']> = {
  limit: 50,
  items: Array.from({ length: 48 }, (_, i) => (i === BAD
    ? { at: at(today, '15:20'), ok: false, ms: 9200, used: 24, failed: 'email', why: 'שירות המייל לא ענה' }
    : { at: ago(2 + 5 * (47 - i)), ok: true, ms: i === 47 ? 1840 : 1400 + ((i * 137) % 900), used: i === 47 ? 31 : 22 + ((i * 7) % 14) })),
};
const rest: Omit<Jobs, 'jobs'> = {
  cronAt: ago(2), cronMs: 1840, rounds,
  cleanup: {
    items: [
      { collection: 'api_idempotency', he: 'רישום בקשות למניעת כפילויות', days: 7, due: 38 },
      { collection: 'api_log', he: 'יומן הבקשות לשרת', days: 90, due: 0 },
      { collection: 'api_failures', he: 'תקלות שרת', days: 90, due: 3 },
      { collection: 'push_jobs', he: 'התראות לטלפון שנשלחו', days: 30, due: 61 },
      { collection: 'email_outbox', he: 'מיילים שנשלחו', days: 365, due: 0 },
    ],
    last: { date: today, archived: 212, deleted: 212, done: true, at: ago(4 * 60), by: 'cron' },
  },
  archive: { collections: [{ collection: 'api_idempotency', files: 4, bytes: 182_000 }, { collection: 'push_jobs', files: 2, bytes: 64_000 }, { collection: 'api_failures', files: 1, bytes: 3_100 }] },
};
/** A whole round run from the screen joins the rounds: the 5-minute jobs that are on, one after the other. */
let inRound: string[] = [];
function roundMoved(id: string) {
  const due = ['email', 'push', 'monitor'].filter((x) => !demoSwitches[PAUSE[x]]);
  if (id === due[0]) inRound = [];
  if (due.includes(id) && !inRound.includes(id)) inRound.push(id);
  if (id !== due[due.length - 1] || inRound.length !== due.length) return;
  const ms = due.reduce((s, x) => s + (jobs.find((j) => j.id === x)!.last?.ms || 0), 0);
  inRound = [];
  rounds.items = [...rounds.items, { at: ago(0), ok: true, ms, used: 18 }].slice(-48);
  Object.assign(rest, { cronAt: ago(0), cronMs: ms });
}
/** What a job answers when it is run from the demo's screen; the queue moves with it. */
function runDemo(id: string): Record<string, unknown> {
  if (id === 'email') {
    const out = demoQueue.emails.filter((e) => e.status === 'queued');
    demoQueue.emails = demoQueue.emails.filter((e) => e.status !== 'queued');
    for (const e of out) {
      sent.unshift({ id: e.id, type: 'email', kind: e.kind, who: e.who, what: `אישור תשלום · ${e.kind === 'donation' ? 'תרומה' : e.kind === 'tab' ? 'חשבון דוכן' : 'כרטיסים'}`, to: 1, attempts: e.attempts + 1, at: ago(0) });
      demoQueue.sentToday = (demoQueue.sentToday || 0) + 1; demoQueue.daily!.used++;
    }
    return { enabled: true, sent: out.length, failed: 0, skipped: 0, waiting: 0 };
  }
  if (id === 'push') {
    const out = demoQueue.pushes;
    demoQueue.pushes = [];
    for (const p of out) { sent.unshift({ id: p.id, type: 'push', kind: p.kind, who: 'כל הצוות', what: p.title, to: p.to, attempts: 1, at: ago(0) }); demoQueue.sentToday = (demoQueue.sentToday || 0) + 1; }
    return { mode: 'webpush', jobs: out.length, delivered: out.reduce((s, p) => s + p.to - p.done, 0), failed: 0 };
  }
  if (id === 'monitor') return { health: 'ok' };
  if (id === 'backup') return { done: true, docs: 1840, parts: 7 };
  if (id === 'cleanup') { const n = rest.cleanup.items.reduce((s, i) => s + (i.due || 0), 0); rest.cleanup.items.forEach((i) => { i.due = 0; }); rest.cleanup.last = { date: today, archived: n, deleted: n, done: true, at: ago(0), by: 'מני בעלים' }; return { done: true, archived: n, deleted: n }; }
  return {};
}

export const sendingDemo: Pick<Source, 'switches' | 'setSwitches' | 'queue' | 'emailAction' | 'cancelPush' | 'emailPreview' | 'jobs' | 'runJob' | 'queueEmail'> = {
  switches: () => wait(switchesView()),
  setSwitches: (b, reason = '') => {
    for (const [key, v] of Object.entries(b)) if (typeof v === 'boolean') changes = [{ at: ago(0), by: 'מני בעלים', key, to: v, reason }, ...changes];
    Object.assign(demoSwitches, b, { updatedAt: ago(0), updatedBy: 'מני בעלים' });
    return wait(switchesView());
  },
  queue: () => wait({ ...demoQueue, sent, switches: demoSwitches }),
  emailAction: (id, action) => {
    const e = demoQueue.emails.find((x) => x.id === id)!;
    if (action === 'cancel') { demoQueue.emails = demoQueue.emails.filter((x) => x.id !== id); return wait({ id, status: 'cancelled' }); }
    Object.assign(e, { status: 'queued', reason: '', error: '', attempts: 0, createdAt: e.createdAt, nextAt: ago(0), updatedAt: ago(0), updateTime: ago(0) });
    if (mails[id]) mails[id] = { ...mails[id], providerSaid: '', lastAttemptAt: null };
    return wait({ id, status: 'queued' });
  },
  cancelPush: (id) => { demoQueue.pushes = demoQueue.pushes.filter((x) => x.id !== id); return wait({ id, cancelled: true }); },
  emailPreview: () => {
    const text = 'שלום דנה לוי, קיבלנו את התשלום בסך 120 ₪ עבור 2 כרטיסים לחג האסיף. תודה מחוות רווה!';
    return wait({ subject: 'אישור תשלום מחוות רווה', from: 'חוות רווה', template: 'שלום [שם], קיבלנו את התשלום בסך [סכום] עבור [עבור]. תודה מחוות רווה!', custom: false, text, html: `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:16px;line-height:1.6;color:#1f2a1f"><p style="margin:0 0 14px">${text}</p></div>` });
  },
  jobs: () => wait({ ...rest, jobs: jobs.map((x) => ({ ...x, paused: PAUSE[x.id] ? !!demoSwitches[PAUSE[x.id]] : false })) }),
  runJob: (id) => {
    const result = runDemo(id);
    const j = jobs.find((x) => x.id === id)!;
    j.last = { at: ago(0), ms: (j.last?.ms || 400) + 60, ok: true, result, by: 'מני בעלים' } satisfies JobRun;
    roundMoved(id);
    return wait({ id, result });
  },
  queueEmail: (id) => wait(mails[id] || null),
};
