// Watching the server for the owners (the console's ניטור and אבטחה screens), all on the free plans:
//  - the site, every 15 minutes: does https://havat-ravve.web.app answer? Two misses in a row open an incident.
//  - the free quota, once an hour: Firestore reads, writes and deletes since midnight Pacific time (when Spark's daily
//    quota starts again), from Cloud Monitoring. That needs the "Monitoring Viewer" role on the Worker's service
//    account; without it the meter says so and shows the one command that grants it.
//  - the morning check, once a day after 07:00 Israel time: site, backup, failures, queues, keys about to expire,
//    quota, storage, scheduled jobs.
//  - alerts: to the inbox in the app of every active owner, plus a phone push outside quiet hours (23:00–07:00);
//    the same alert at most once in 12 hours. Owners can turn them off, or the push part, from the console.
//  - the security log: refused requests, rate limits, and everything done from the console (sign-ins, keys, restores).
// All of it lives in the one KV record the cron already writes every run (console:cron-last), so watching adds no KV
// writes; the alert settings are their own record, written only when an owner changes them.
import { type Env, Firestore, monitoringToken } from './firestore';
import { notifyWrites } from './notify';
import { listBackups, ilDate } from './backup';
import { listKeys } from './keys';
import { emailEnabled } from './email';
import { ApiError, invalid } from './http';

export const CRON_KEY = 'console:cron-last';
const ALERTS_KEY = 'console:alerts';
const SITE = 'https://havat-ravve.web.app/';
export const LIMITS = { reads: 50_000, writes: 20_000, deletes: 20_000, r2Bytes: 10 * 1024 ** 3 };
const KEEP_CHECKS = 96; // 24 hours of 15-minute checks
const SAME_ALERT_MS = 12 * 3600_000;

export type SiteCheck = { at: string; ok: boolean; ms: number; status: number };
export type Uptime = { checks: SiteCheck[]; downSince: string | null; incidents: { from: string; to: string | null }[] };
export type Quota = { at: string; since: string; reads: number; writes: number; deletes: number; error?: undefined } | { at: string; error: 'permission' | 'unavailable' | 'failed'; detail?: string };
export type HealthState = 'ok' | 'warn' | 'bad' | 'unknown';
export type HealthItem = { id: string; he: string; state: HealthState; detail: string };
export type Health = { at: string; date: string; by: string; worst: HealthState; items: HealthItem[]; r2Bytes: number | null };
export type MonitorState = { at?: string; wallMs?: number; uptime?: Uptime; quota?: Quota; health?: Health; sent?: Record<string, string> };
export type AlertSettings = { on: boolean; push: boolean; updatedAt: string | null; updatedBy: string | null };

export async function readMonitor(env: Env): Promise<MonitorState> {
  try { return JSON.parse((await env.TOKEN_KV?.get(CRON_KEY)) || '{}') || {}; } catch { return {}; }
}
/** The last cron run and what it watched (one KV write per run: 288 a day, inside the free 1,000). */
export async function recordCron(env: Env, run: MonitorState) {
  await env.TOKEN_KV?.put(CRON_KEY, JSON.stringify({ ...run, at: new Date().toISOString() }));
}

/** Saves what a console check found without moving the "last cron run" time. */
export async function saveMonitor(env: Env, st: MonitorState) {
  await env.TOKEN_KV?.put(CRON_KEY, JSON.stringify(st));
}

// ---------- the site ----------
async function checkSite(): Promise<SiteCheck> {
  const started = Date.now();
  const at = new Date().toISOString();
  try {
    const res = await fetch(SITE, { headers: { 'user-agent': 'havat-ravve-uptime' }, redirect: 'follow', signal: AbortSignal.timeout(10_000) });
    await res.body?.cancel();
    return { at, ok: res.ok, ms: Date.now() - started, status: res.status };
  } catch { return { at, ok: false, ms: Date.now() - started, status: 0 }; }
}
/** Adds a check; returns 'down' when this is the second miss in a row, 'up' when the site came back. */
export function addCheck(prev: Uptime | undefined, c: SiteCheck): { uptime: Uptime; event: 'down' | 'up' | null } {
  const u: Uptime = { checks: [...(prev?.checks || []), c].slice(-KEEP_CHECKS), downSince: prev?.downSince || null, incidents: [...(prev?.incidents || [])] };
  const last = prev?.checks?.[prev.checks.length - 1];
  let event: 'down' | 'up' | null = null;
  if (!c.ok && last && !last.ok && !u.downSince) { u.downSince = last.at; u.incidents.push({ from: last.at, to: null }); event = 'down'; }
  if (c.ok && u.downSince) {
    const open = u.incidents.find((i) => !i.to);
    if (open) open.to = c.at;
    u.downSince = null; event = 'up';
  }
  u.incidents = u.incidents.slice(-20);
  return { uptime: u, event };
}
export const uptimePct = (u?: Uptime) => (u?.checks.length ? Math.round((u.checks.filter((c) => c.ok).length / u.checks.length) * 1000) / 10 : null);

// ---------- the free quota ----------
/** Midnight in California (Firestore's daily free quota starts again then). */
export function pacificMidnight(now = new Date()): Date {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const p = Object.fromEntries(f.formatToParts(now).map((x) => [x.type, x.value]));
  return new Date(now.getTime() - ((+p.hour * 60 + +p.minute) * 60 + +p.second) * 1000 - now.getMilliseconds());
}
const METRICS = { reads: 'firestore.googleapis.com/document/read_count', writes: 'firestore.googleapis.com/document/write_count', deletes: 'firestore.googleapis.com/document/delete_count' } as const;

export async function readQuota(env: Env): Promise<Quota> {
  const at = new Date().toISOString();
  let token: string | null;
  try { token = await monitoringToken(env); } catch (e) { return { at, error: 'failed', detail: String(e instanceof Error ? e.message : e).slice(0, 200) }; }
  if (!token) return { at, error: 'unavailable' };
  const end = new Date();
  const start = pacificMidnight(end);
  const period = Math.max(60, Math.ceil((end.getTime() - start.getTime()) / 1000));
  const out = { reads: 0, writes: 0, deletes: 0 };
  for (const [k, metric] of Object.entries(METRICS) as [keyof typeof out, string][]) {
    const u = new URL(`https://monitoring.googleapis.com/v3/projects/${env.FIRESTORE_PROJECT_ID}/timeSeries`);
    u.searchParams.set('filter', `metric.type="${metric}"`);
    u.searchParams.set('interval.startTime', start.toISOString());
    u.searchParams.set('interval.endTime', end.toISOString());
    u.searchParams.set('aggregation.alignmentPeriod', `${period}s`);
    u.searchParams.set('aggregation.perSeriesAligner', 'ALIGN_SUM');
    u.searchParams.set('aggregation.crossSeriesReducer', 'REDUCE_SUM');
    let res: Response;
    try { res = await fetch(u, { headers: { authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(8000) }); }
    catch { return { at, error: 'failed', detail: 'Cloud Monitoring did not answer' }; }
    if (res.status === 403) { await res.body?.cancel(); return { at, error: 'permission' }; }
    if (!res.ok) { await res.body?.cancel(); return { at, error: 'failed', detail: `Cloud Monitoring ${res.status}` }; }
    const j = (await res.json()) as { timeSeries?: { points?: { value?: { int64Value?: string } }[] }[] };
    for (const s of j.timeSeries || []) for (const p of s.points || []) out[k] += Number(p.value?.int64Value || 0);
  }
  return { at, since: start.toISOString(), ...out };
}
const share = (q: Quota | undefined) => (q && !q.error ? Math.max(q.reads / LIMITS.reads, q.writes / LIMITS.writes, q.deletes / LIMITS.deletes) : null);

// ---------- the morning check ----------
async function count(fs: Firestore, col: string, filters: [string, string, unknown][]): Promise<number | null> {
  const enc = (v: unknown) => (v === null ? { nullValue: null } : typeof v === 'boolean' ? { booleanValue: v } : { stringValue: String(v) });
  const where = filters.map(([f, op, v]) => ({ fieldFilter: { field: { fieldPath: f }, op, value: enc(v) } }));
  try { return await fs.count({ from: [{ collectionId: col }], ...(where.length ? { where: where.length === 1 ? where[0] : { compositeFilter: { op: 'AND', filters: where } } } : {}) }); }
  catch { return null; }
}
async function r2Size(env: Env): Promise<number | null> {
  if (!env.FILE_BUCKET) return null;
  let total = 0; let cursor: string | undefined;
  for (let i = 0; i < 30; i++) {
    const page = await env.FILE_BUCKET.list({ cursor, limit: 1000 });
    for (const o of page.objects) total += o.size;
    if (!page.truncated) return total;
    cursor = page.cursor;
  }
  return total;
}
const n = (v: number | null) => (v === null ? '—' : v.toLocaleString('he-IL'));
const pct = (v: number) => `${Math.round(v * 100)}%`;

export async function healthCheck(env: Env, fs: Firestore, st: MonitorState, by: string): Promise<Health> {
  const items: HealthItem[] = [];
  const add = (id: string, he: string, state: HealthState, detail: string) => items.push({ id, he, state, detail });
  // the site
  const u = st.uptime; const up = uptimePct(u);
  if (!u?.checks.length) add('site', 'האתר', 'unknown', 'עוד לא נבדק');
  else if (u.downSince) add('site', 'האתר', 'bad', 'לא עונה עכשיו');
  else add('site', 'האתר', up !== null && up < 99 ? 'warn' : 'ok', `עונה · ${up}% מהבדיקות ביממה האחרונה`);
  // the backup
  try {
    const b = await listBackups(env);
    const last = b.items[0];
    const today = ilDate(new Date());
    const age = last ? Date.now() - Date.parse(last.finishedAt) : Infinity;
    if (!last) add('backup', 'גיבוי הלילה', 'bad', 'אין עדיין אף גיבוי');
    else if (last.date === today) add('backup', 'גיבוי הלילה', 'ok', `נשמר · ${n(last.docs)} רשומות`);
    else add('backup', 'גיבוי הלילה', age > 36 * 3600_000 ? 'bad' : 'warn', `האחרון מ־${last.date.slice(8, 10)}.${last.date.slice(5, 7)}`);
  } catch { add('backup', 'גיבוי הלילה', 'unknown', 'לא הצלחנו לקרוא את רשימת הגיבויים'); }
  // failures, queues
  const day = new Date(Date.now() - 24 * 3600_000).toISOString();
  const [failures, mailFailed, pushPending] = await Promise.all([
    count(fs, 'api_failures', [['at', 'GREATER_THAN_OR_EQUAL', day]]),
    count(fs, 'email_outbox', [['status', 'EQUAL', 'failed']]),
    count(fs, 'push_jobs', [['sentAt', 'EQUAL', null]]),
  ]);
  add('failures', 'תקלות שרת ביממה', failures === null ? 'unknown' : failures === 0 ? 'ok' : failures > 20 ? 'bad' : 'warn', failures === 0 ? 'אין' : n(failures));
  if (emailEnabled(env)) add('email', 'מיילים שנכשלו', mailFailed === null ? 'unknown' : mailFailed === 0 ? 'ok' : 'warn', mailFailed === 0 ? 'אין' : n(mailFailed));
  add('push', 'התראות לטלפון בתור', pushPending === null ? 'unknown' : pushPending > 100 ? 'warn' : 'ok', pushPending === 0 ? 'התור ריק' : n(pushPending));
  // keys about to expire
  try {
    const soon = (await listKeys(env)).filter((k) => k.status === 'active' && k.expiresAt && Date.parse(k.expiresAt) - Date.now() < 7 * 86400_000);
    add('keys', 'מפתחות API', soon.length ? 'warn' : 'ok', soon.length ? `${soon.map((k) => k.label).join(', ')}: התוקף נגמר השבוע` : 'אין מפתח שתוקפו נגמר השבוע');
  } catch { add('keys', 'מפתחות API', 'unknown', 'לא הצלחנו לקרוא'); }
  // the free quota
  const q = st.quota; const s = share(q);
  if (!q || q.error) add('quota', 'מכסת Firestore החינמית', 'unknown', q?.error === 'permission' ? 'חסרה הרשאת צפייה (פרטים במסך)' : 'לא נמדדה');
  else add('quota', 'מכסת Firestore החינמית', s! >= 0.9 ? 'bad' : s! >= 0.7 ? 'warn' : 'ok', `${pct(s!)} מהמכסה היומית בשימוש`);
  // storage
  let bytes: number | null = null;
  try { bytes = await r2Size(env); } catch { /* unknown */ }
  if (bytes === null) add('storage', 'אחסון R2', 'unknown', 'לא נמדד');
  else add('storage', 'אחסון R2', bytes / LIMITS.r2Bytes >= 0.8 ? 'warn' : 'ok', `\u2066${(bytes / 1024 ** 2).toFixed(1)} MB\u2069 מתוך \u206610 GB\u2069`);
  // the scheduled jobs (the console's "check now" runs between crons)
  const cronAge = st.at ? Date.now() - Date.parse(st.at) : Infinity;
  add('cron', 'משימות מתוזמנות', by === 'cron' || cronAge < 15 * 60_000 ? 'ok' : 'bad', by === 'cron' || cronAge < 15 * 60_000 ? 'רצות כל 5 דקות' : 'לא רצו ברבע השעה האחרונה');
  const order: HealthState[] = ['ok', 'unknown', 'warn', 'bad'];
  const worst = items.reduce<HealthState>((w, i) => (order.indexOf(i.state) > order.indexOf(w) ? i.state : w), 'ok');
  return { at: new Date().toISOString(), date: ilDate(new Date()), by, worst, items, r2Bytes: bytes };
}

// ---------- alerts ----------
export async function alertSettings(env: Env): Promise<AlertSettings> {
  try { return { on: true, push: true, updatedAt: null, updatedBy: null, ...JSON.parse((await env.TOKEN_KV?.get(ALERTS_KEY)) || '{}') }; }
  catch { return { on: true, push: true, updatedAt: null, updatedBy: null }; }
}
export async function saveAlertSettings(env: Env, b: Record<string, unknown>, by: string): Promise<AlertSettings> {
  for (const k of Object.keys(b)) if (!['on', 'push'].includes(k)) throw invalid(k, `unknown field ${k}`);
  for (const k of ['on', 'push']) if (b[k] !== undefined && typeof b[k] !== 'boolean') throw invalid(k, `${k} must be true or false`);
  if (!env.TOKEN_KV) throw new ApiError('INTERNAL', 'TOKEN_KV is not bound');
  const next = { ...(await alertSettings(env)), ...b, updatedAt: new Date().toISOString(), updatedBy: by };
  await env.TOKEN_KV.put(ALERTS_KEY, JSON.stringify(next));
  return next;
}
const quietNow = () => { const h = +new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', hourCycle: 'h23' }).format(new Date()); return h >= 23 || h < 7; };
const SERVER = { uid: 'server', name: 'השרת' };

async function activeOwners(fs: Firestore): Promise<string[]> {
  const docs = await fs.query({ from: [{ collectionId: 'users' }], where: { fieldFilter: { field: { fieldPath: 'role' }, op: 'EQUAL', value: { stringValue: 'owner' } } }, limit: 20 });
  return docs.filter((d) => d.data.status === 'active').map((d) => d.id);
}

type Alert = { id: string; title: string; sub: string; urgent?: boolean };
/** Sends an alert to every active owner unless it was sent in the last 12 hours or alerts are off. */
async function sendAlert(env: Env, fs: Firestore, st: MonitorState, a: Alert): Promise<boolean> {
  const set = await alertSettings(env);
  if (!set.on) return false;
  const sent = st.sent?.[a.id];
  if (sent && Date.now() - Date.parse(sent) < SAME_ALERT_MS) return false;
  const writes = notifyWrites(fs, await activeOwners(fs), { kind: 'system', title: a.title, sub: a.sub, link: '/admin', by: SERVER, push: set.push && !quietNow(), urgent: !!a.urgent, tag: 'server-' + a.id });
  if (!writes.length) return false;
  await fs.commit(writes);
  st.sent = { ...(st.sent || {}), [a.id]: new Date().toISOString() };
  return true;
}
/** A test alert to the owner who asked, now (quiet hours do not apply to a test). */
export async function testAlert(env: Env, fs: Firestore, uid: string) {
  const set = await alertSettings(env);
  const writes = notifyWrites(fs, [uid], { kind: 'system', title: 'בדיקת התראות מהשרת', sub: 'ככה תיראה התראה כשמשהו לא בסדר. אפשר לכבות מהקונסולה.', link: '/admin', by: SERVER, push: set.push, tag: 'server-test' });
  await fs.commit(writes);
  return { sent: true, push: set.push };
}

const hm = (iso: string) => new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));

/** One cron run of watching: the site every 15 minutes, the quota every hour, the morning check once a day. */
export async function monitorStep(env: Env, prev: MonitorState): Promise<MonitorState> {
  const st: MonitorState = { uptime: prev.uptime, quota: prev.quota, health: prev.health, sent: prev.sent, at: prev.at };
  // the emulator (tests) has no site, no Cloud Monitoring and no owners to wake
  if (env.FIRESTORE_EMULATOR_HOST) return st;
  const fs = new Firestore(env, new Set());
  const now = new Date();
  const lastCheck = st.uptime?.checks[st.uptime.checks.length - 1];
  if (!lastCheck || now.getTime() - Date.parse(lastCheck.at) >= 14 * 60_000) {
    const r = addCheck(st.uptime, await checkSite());
    st.uptime = r.uptime;
    if (r.event === 'down') await sendAlert(env, fs, st, { id: 'site-down', title: 'האתר לא עונה', sub: `מאז ${hm(st.uptime.downSince!)}. בודקים שוב כל רבע שעה ונודיע כשיחזור.`, urgent: true }).catch(() => false);
    if (r.event === 'up' && st.sent?.['site-down']) {
      const inc = st.uptime.incidents[st.uptime.incidents.length - 1];
      const mins = inc?.to ? Math.round((Date.parse(inc.to) - Date.parse(inc.from)) / 60_000) : 0;
      await sendAlert(env, fs, st, { id: 'site-up-' + (inc?.from || ''), title: 'האתר חזר לעבוד', sub: `היה למטה בערך ${mins} דקות.` }).catch(() => false);
      if (st.sent) delete st.sent['site-down'];
    }
  }
  if (!st.quota || now.getTime() - Date.parse(st.quota.at) >= 55 * 60_000) {
    st.quota = await readQuota(env);
    const s = share(st.quota);
    if (s !== null && s >= 0.8) await sendAlert(env, fs, st, { id: 'quota-' + ilDate(now), title: 'המכסה החינמית של Firestore מתקרבת לסוף', sub: `${pct(s)} מהמכסה של היום כבר בשימוש. היא מתחדשת ב־10:00 בבוקר.` }).catch(() => false);
  }
  const ilHour = +new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', hourCycle: 'h23' }).format(now);
  if (ilHour >= 7 && st.health?.date !== ilDate(now)) {
    st.health = await healthCheck(env, fs, st, 'cron');
    const bad = st.health.items.filter((i) => i.state === 'bad');
    if (bad.length) await sendAlert(env, fs, st, { id: 'health-' + st.health.date, title: bad.length === 1 ? `בדיקת הבוקר: ${bad[0].he}` : `בדיקת הבוקר: ${bad.length} דברים לבדוק`, sub: bad.map((i) => `${i.he}: ${i.detail}`).join(' · ') }).catch(() => false);
  }
  // forget alerts older than two days
  if (st.sent) st.sent = Object.fromEntries(Object.entries(st.sent).filter(([, at]) => Date.now() - Date.parse(at) < 2 * 86400_000));
  return st;
}

// ---------- the security log ----------
export type SecurityEvent = { at: string; kind: 'refused' | 'limited' | 'console'; who: string; what: string; detail: string; ok: boolean };
const REFUSED = new Set(['FORBIDDEN', 'UNAUTHENTICATED', 'PERMISSION_DENIED']);
export async function securityLog(fs: Firestore, days: number) {
  const since = new Date(Date.now() - Math.min(30, Math.max(1, days)) * 86400_000).toISOString();
  const atSince = { fieldFilter: { field: { fieldPath: 'at' }, op: 'GREATER_THAN_OR_EQUAL', value: { stringValue: since } } };
  const [failed, limited, console_] = await Promise.all([
    fs.query({ from: [{ collectionId: 'api_log' }], where: { compositeFilter: { op: 'AND', filters: [{ fieldFilter: { field: { fieldPath: 'ok' }, op: 'EQUAL', value: { booleanValue: false } } }, atSince] } }, orderBy: [{ field: { fieldPath: 'at' } }], limit: 300 }),
    fs.query({ from: [{ collectionId: 'api_failures' }], where: atSince, orderBy: [{ field: { fieldPath: 'at' }, direction: 'DESCENDING' }], limit: 200 }),
    fs.query({ from: [{ collectionId: 'api_log' }], where: { fieldFilter: { field: { fieldPath: 'credential' }, op: 'EQUAL', value: { stringValue: 'console' } } }, orderBy: [{ field: { fieldPath: 'at' }, direction: 'DESCENDING' }], limit: 150 }),
  ]);
  const out: SecurityEvent[] = [];
  for (const d of failed) {
    const x = d.data;
    if (!REFUSED.has(String(x.code))) continue;
    out.push({ at: String(x.at), kind: 'refused', who: String(x.keyLabel || x.credential || ''), what: String(x.opHe || x.op || x.path || ''), detail: String(x.message || x.code || ''), ok: false });
  }
  for (const d of limited) {
    const x = d.data;
    if (!['RATE_LIMITED', 'QUOTA_EXCEEDED'].includes(String(x.code))) continue;
    out.push({ at: String(x.at), kind: 'limited', who: String(x.credential || 'כתובת לא מוכרת'), what: String(x.path || ''), detail: x.code === 'RATE_LIMITED' ? 'יותר מדי בקשות בזמן קצר: נחסם לדקה' : 'המכסה היומית נגמרה', ok: false });
  }
  for (const d of console_) {
    const x = d.data;
    if (String(x.at) < since) continue;
    out.push({ at: String(x.at), kind: 'console', who: String(x.actor && typeof x.actor === 'object' ? (x.actor as { name?: string }).name || x.keyLabel : x.keyLabel), what: String(x.opHe || x.op || ''), detail: x.ok ? '' : String(x.message || ''), ok: !!x.ok });
  }
  out.sort((a, b) => (a.at < b.at ? 1 : -1));
  return { since, items: out.slice(0, 400) };
}
