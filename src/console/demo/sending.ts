// The demo's content: שליחה ותזמון: תור, משימות, מתגים (K11-K13).
import type { Jobs, Queue, Source, Switches } from '../source';
import { ago, DAY, dayKey, wait } from './base';

// ---------- switches, the send queue, scheduled jobs (round 5) ----------
export const demoSwitches: Switches = {
  emailPaused: false, pushPaused: false, keysStopped: false, readOnly: false, maintenance: false, maintenanceText: '', registrationClosed: false,
  backupPaused: false, monitorPaused: false, cleanupPaused: false, updatedAt: ago(3 * DAY), updatedBy: 'מני בעלים',
};
export const demoQueue: Omit<Queue, 'switches'> = {
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
      { collection: 'api_idempotency', he: 'רישום בקשות למניעת כפילויות', days: 7, due: 38 },
      { collection: 'api_log', he: 'יומן הבקשות לשרת', days: 90, due: 0 },
      { collection: 'api_failures', he: 'תקלות שרת', days: 90, due: 3 },
      { collection: 'push_jobs', he: 'התראות לטלפון שנשלחו', days: 30, due: 61 },
      { collection: 'email_outbox', he: 'מיילים שנשלחו', days: 365, due: 0 },
    ],
    last: { date: dayKey(0), archived: 212, deleted: 212, done: true, at: ago(4 * 60 - 20), by: 'cron' },
  },
  archive: { collections: [{ collection: 'api_idempotency', files: 4, bytes: 182_000 }, { collection: 'push_jobs', files: 2, bytes: 64_000 }, { collection: 'api_failures', files: 1, bytes: 3_100 }] },
});
const PAUSE: Record<string, keyof Switches> = { email: 'emailPaused', push: 'pushPaused', monitor: 'monitorPaused', backup: 'backupPaused', cleanup: 'cleanupPaused' };

export const sendingDemo: Pick<Source, 'switches' | 'setSwitches' | 'queue' | 'emailAction' | 'cancelPush' | 'emailPreview' | 'jobs' | 'runJob' | 'queueEmail'> = {
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
  queueEmail: () => wait(null),
};
