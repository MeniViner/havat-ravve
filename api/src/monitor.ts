// Watching the server for the owners (the console's ניטור and אבטחה screens), all on the free plans:
//  - the site, every 15 minutes: does https://havat-ravve.web.app answer? Two misses in a row open an incident.
//  - the free quota, once an hour: Firestore reads, writes and deletes since midnight Pacific time (when Spark's daily
//    quota starts again), from Cloud Monitoring. That needs the "Monitoring Viewer" role on the Worker's service
//    account; without it the meter says so and shows the one command that grants it.
//  - the morning check, once a day after 07:00 Israel time: site, backup, failures, queues, keys about to expire,
//    quota, storage, scheduled jobs.
//  - alerts: to the inbox in the app of every active owner, plus a phone push outside quiet hours (23:00–07:00);
//    the same alert at most once in 12 hours. Owners can turn them off, or the push part, from the console.
//    The morning summary (alerts.daily) says so once a day also when all is well.
//  - the last eight morning checks, what went wrong lately, and the last four hours of five-minute rounds.
//  - the security log: refused requests, rate limits, and everything done from the console (sign-ins, keys, restores).
// All of it lives in the one KV record the cron already writes every run (console:cron-last), so watching adds no KV
// writes; the alert settings are their own record, written only when an owner changes them.
import { type Env, Firestore, monitoringToken } from './firestore';
import { notifyWrites, planNotification } from './notify';
import { pushQueueState } from './push';
import { lastBackup, ilDate } from './backup';
import { listKeys } from './keys';
import { emailEnabled } from './email';
import { ApiError, invalid } from './http';
import { SWITCH_HE, readSwitches } from './control';

export const CRON_KEY = 'console:cron-last';
const ALERTS_KEY = 'console:alerts';
const SITE = 'https://havat-ravve.web.app/';
export const LIMITS = { reads: 50_000, writes: 20_000, deletes: 20_000, r2Bytes: 10 * 1024 ** 3 };
const KEEP_CHECKS = 96; // 24 hours of 15-minute checks
const SAME_ALERT_MS = 12 * 3600_000;
const KEEP_WEEK = 8; // morning checks
const KEEP_EVENTS = 20;
const KEEP_ROUNDS = 48; // four hours
/** The free plan's subrequests per run. */
export const ROUND_LIMIT = 50;
/** More server failures than this in a day is "bad" in the morning check. */
const FAILURES_BAD = 20;
/** The upkeep run comes every 5 minutes; a gap above this is told as "the scheduled jobs did not run". */
const CRON_LATE_MS = 15 * 60_000;

export type SiteCheck = { at: string; ok: boolean; ms: number; status: number };
export type Uptime = { checks: SiteCheck[]; downSince: string | null; incidents: { from: string; to: string | null }[] };
export type Quota = { at: string; since: string; reads: number; writes: number; deletes: number; error?: undefined } | { at: string; error: 'permission' | 'billing' | 'unavailable' | 'failed'; detail?: string };
export type HealthState = 'ok' | 'warn' | 'bad' | 'unknown';
export type HealthItem = { id: string; he: string; state: HealthState; detail: string };
export type Health = { at: string; date: string; by: string; worst: HealthState; items: HealthItem[]; r2Bytes: number | null };
/** One scheduled job's last turn (index.ts scheduled), for the console's scheduled-jobs screen. */
export type JobRun = { at: string; ms: number; ok: boolean; result: Record<string, unknown>; by?: string };
export type MorningStates = { date: string; states: Record<string, HealthState> };
export type MonitorEvent = { at: string; kind: 'site' | 'backup' | 'failures' | 'quota' | 'cron' | 'other'; he: string; minutes: number | null; until?: 'morning' | null; alerted: boolean };
/** open: not over yet (kept in the record only). */
type StoredEvent = MonitorEvent & { open?: boolean };
/** One five-minute round, as the jobs screen shows it. used: subrequests of the upkeep run, or of a busier run this round. */
export type Round = { at: string; ok: boolean; ms: number; used?: number | null; failed?: string; why?: string };
export type MonitorState = {
  at?: string; wallMs?: number; uptime?: Uptime; quota?: Quota; health?: Health; sent?: Record<string, string>; jobs?: Record<string, JobRun>;
  week?: MorningStates[]; events?: StoredEvent[]; rounds?: Round[];
  /** The Israel date of the last morning check the cron made (an owner's "check now" does not count). */
  morning?: string;
};
export type AlertSettings = { on: boolean; push: boolean; daily: boolean; updatedAt: string | null; updatedBy: string | null };

export async function readMonitor(env: Env): Promise<MonitorState> {
  try { return await readMonitorStrict(env); } catch { return {}; }
}
/** For the cron, which writes the record back: a read that fails must not look like an empty record. */
export async function readMonitorStrict(env: Env): Promise<MonitorState> {
  const raw = (await env.TOKEN_KV?.get(CRON_KEY)) || '{}';
  try { return JSON.parse(raw) || {}; } catch { return {}; }
}
/** The three cron runs (wrangler.toml): each is its own invocation, with its own 50 subrequests. */
export const CRON_GROUPS = { send: '*/5 * * * *', people: '1-59/5 * * * *', upkeep: '2-59/5 * * * *' } as const;
export type CronGroup = keyof typeof CRON_GROUPS;
const groupKey = (g: CronGroup) => `console:cron-${g}`;
export type GroupState = { at?: string; used?: number; jobs?: Record<string, JobRun> };
const sameResults = (a: Record<string, JobRun> = {}, b: Record<string, JobRun>) =>
  Object.entries(b).every(([id, j]) => a[id] && a[id].ok === j.ok && JSON.stringify(a[id].result) === JSON.stringify(j.result));
/**
 * The send and people runs keep their jobs' last results in their own KV record, written only when a result changed,
 * a job failed, or an hour passed (KV allows 1,000 writes a day; the upkeep run already writes 288).
 */
export async function saveGroup(env: Env, g: Exclude<CronGroup, 'upkeep'>, ran: Record<string, JobRun>, started: number, used: () => number = () => 0) {
  if (!env.TOKEN_KV || !Object.keys(ran).length) return;
  let prev: GroupState = {};
  try { prev = JSON.parse((await env.TOKEN_KV.get(groupKey(g))) || '{}') || {}; } catch { /* first run */ }
  const stale = !prev.at || started - Date.parse(prev.at) > 55 * 60_000;
  if (!stale && sameResults(prev.jobs, ran) && Object.values(ran).every((j) => j.ok)) return;
  await env.TOKEN_KV.put(groupKey(g), JSON.stringify({ at: new Date().toISOString(), ...(used() ? { used: used() + 1 } : {}), jobs: { ...(prev.jobs || {}), ...ran } }));
}
/** Every job's last result, from the three runs and the console's own "run now", the newest of each. */
export async function readJobs(env: Env, mon?: MonitorState): Promise<Record<string, JobRun>> {
  const base = mon || await readMonitor(env);
  const out: Record<string, JobRun> = { ...(base.jobs || {}) };
  for (const st of await readGroups(env)) {
    for (const [id, j] of Object.entries(st.jobs || {})) if (!out[id] || out[id].at < j.at) out[id] = j;
  }
  return out;
}

/** The send and people runs' own records (two KV reads). */
export async function readGroups(env: Env): Promise<GroupState[]> {
  return Promise.all((['send', 'people'] as const).map(async (g) => {
    try { return (JSON.parse((await env.TOKEN_KV?.get(groupKey(g))) || '{}') || {}) as GroupState; } catch { return {}; }
  }));
}

/** The jobs' names, as the console lists them. */
export const JOB_HE: Record<string, string> = { email: 'מיילים על תשלומים', push: 'התראות לטלפון', monitor: 'בדיקת האתר והמכסה', backup: 'גיבוי לילי', cleanup: 'ניקוי רשומות ישנות', accounts: 'מחיקת חשבונות' };
/** A job's error in a few plain words (the technical one stays in the job's own last result). */
export function whyHe(error: unknown): string {
  const e = String(error ?? '');
  if (/subrequest/i.test(e)) return 'יותר מדי בקשות בסבב אחד';
  if (/RESOURCE_EXHAUSTED|quota|\b429\b/i.test(e)) return 'המכסה היומית נגמרה';
  if (/PERMISSION_DENIED|UNAUTHENTICATED|\b401\b|\b403\b/i.test(e)) return 'חסרה הרשאה';
  if (/DEADLINE|timeout|timed out/i.test(e)) return 'לא הגיעה תשובה בזמן';
  if (/UNAVAILABLE|unreachable|fetch failed|network|\b50\d\b/i.test(e)) return 'השירות לא היה זמין';
  return 'תקלה בשרת';
}
/**
 * This round's line: the upkeep run's jobs, and the send and people runs of the same round (they run two minutes and one
 * minute before; a failed one always leaves its record). Nothing is written here: the caller saves it with its own record.
 */
export function roundOf(ran: Record<string, JobRun>, groups: GroupState[], started: number, used: number): Round {
  const since = started - 4.5 * 60_000;
  const fresh = (at?: string) => !!at && Date.parse(at) >= since;
  const jobs = [...Object.entries(ran), ...groups.flatMap((g) => Object.entries(g.jobs || {}).filter(([, j]) => fresh(j.at)))];
  const bad = jobs.find(([, j]) => !j.ok);
  const most = Math.max(used, ...groups.filter((g) => fresh(g.at)).map((g) => g.used || 0));
  return { at: new Date(started).toISOString(), ok: !bad, ms: Date.now() - started, used: most, ...(bad ? { failed: JOB_HE[bad[0]] || bad[0], why: whyHe(bad[1].result.error) } : {}) };
}
export const addRound = (rounds: Round[] | undefined, r: Round) => [...(rounds || []), r].slice(-KEEP_ROUNDS);

/** The last cron run and what it watched (one KV write per run: 288 a day, inside the free 1,000). */
export async function recordCron(env: Env, run: MonitorState) {
  await env.TOKEN_KV?.put(CRON_KEY, JSON.stringify({ ...run, at: new Date().toISOString() }));
}

/** Saves what a console check found without moving the "last cron run" time. */
export async function saveMonitor(env: Env, st: MonitorState) {
  await env.TOKEN_KV?.put(CRON_KEY, JSON.stringify(st));
}

// ---------- the site ----------
async function checkSite(env: Env): Promise<SiteCheck> {
  const started = Date.now();
  const at = new Date().toISOString();
  try {
    const res = await (env.FETCH || fetch)(SITE, { headers: { 'user-agent': 'havat-ravve-uptime' }, redirect: 'follow', signal: AbortSignal.timeout(10_000) });
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
    try { res = await (env.FETCH || fetch)(u, { headers: { authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(8000) }); }
    catch { return { at, error: 'failed', detail: 'Cloud Monitoring did not answer' }; }
    if (res.status === 403) {
      // Google's own reason (role missing, API off, wrong project): a short message, never a token
      const why = await res.json().then((j: { error?: { message?: string } }) => String(j?.error?.message || ''), () => '');
      // Google serves these numbers only to projects with billing on: the farm's free (Spark) plan never gets them
      return { at, error: /billing/i.test(why) ? 'billing' : 'permission', detail: why.slice(0, 200) };
    }
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
  // at most 10 pages (10,000 files): the morning check shares the free plan's 50 subrequests with the rest of the run
  for (let i = 0; i < 10; i++) {
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
    const last = await lastBackup(env);
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
  add('failures', 'תקלות שרת ביממה', failures === null ? 'unknown' : failures === 0 ? 'ok' : failures > FAILURES_BAD ? 'bad' : 'warn', failures === 0 ? 'אין' : n(failures));
  if (emailEnabled(env)) add('email', 'מיילים שנכשלו', mailFailed === null ? 'unknown' : mailFailed === 0 ? 'ok' : 'warn', mailFailed === 0 ? 'אין' : n(mailFailed));
  add('push', 'התראות לטלפון בתור', pushPending === null ? 'unknown' : pushPending > 100 ? 'warn' : 'ok', pushPending === 0 ? 'התור ריק' : n(pushPending));
  // keys about to expire
  try {
    const soon = (await listKeys(env)).filter((k) => k.status === 'active' && k.expiresAt && Date.parse(k.expiresAt) - Date.now() < 7 * 86400_000);
    add('keys', 'מפתחות API', soon.length ? 'warn' : 'ok', soon.length ? `${soon.map((k) => k.label).join(', ')}: התוקף נגמר השבוע` : 'אין מפתח שתוקפו נגמר השבוע');
  } catch { add('keys', 'מפתחות API', 'unknown', 'לא הצלחנו לקרוא'); }
  // the free quota
  const q = st.quota; const s = share(q);
  if (!q || q.error) add('quota', 'מכסת Firestore החינמית', 'unknown', q?.error === 'billing' ? 'Google לא מציג את המונה בתוכנית החינמית (קישור לשימוש במסך)' : q?.error === 'permission' ? 'חסרה הרשאת צפייה (פרטים במסך)' : 'לא נמדדה');
  else add('quota', 'מכסת Firestore החינמית', s! >= 0.9 ? 'bad' : s! >= 0.7 ? 'warn' : 'ok', `${pct(s!)} מהמכסה היומית בשימוש`);
  // storage
  let bytes: number | null = null;
  try { bytes = await r2Size(env); } catch { /* unknown */ }
  if (bytes === null) add('storage', 'אחסון R2', 'unknown', 'לא נמדד');
  else add('storage', 'אחסון R2', bytes / LIMITS.r2Bytes >= 0.8 ? 'warn' : 'ok', `\u2066${(bytes / 1024 ** 2).toFixed(1)} MB\u2069 מתוך \u206610 GB\u2069`);
  // the scheduled jobs (the console's "check now" runs between crons)
  const cronAge = st.at ? Date.now() - Date.parse(st.at) : Infinity;
  add('cron', 'משימות מתוזמנות', by === 'cron' || cronAge < 15 * 60_000 ? 'ok' : 'bad', by === 'cron' || cronAge < 15 * 60_000 ? 'רצות כל 5 דקות' : 'לא רצו ברבע השעה האחרונה');
  // a switch left on overnight (control.ts): said every morning until someone turns it off
  const sw = await readSwitches(env, true);
  const on = [sw.maintenance && 'מצב תחזוקה', sw.readOnly && 'קריאה בלבד', sw.keysStopped && 'מפתחות ה־API עצורים', sw.registrationClosed && 'ההרשמה סגורה', sw.emailPaused && 'מיילים בהשהיה', sw.pushPaused && 'התראות לטלפון בהשהיה', sw.broadcastEmailPaused && 'מיילים לנרשמים בהשהיה', sw.backupPaused && 'הגיבוי בהשהיה', sw.cleanupPaused && 'הניקוי בהשהיה'].filter(Boolean);
  add('switches', 'מתגים', on.length ? 'warn' : 'ok', on.length ? `דלוק: ${on.join(', ')}` : 'הכל פועל כרגיל');
  const order: HealthState[] = ['ok', 'unknown', 'warn', 'bad'];
  const worst = items.reduce<HealthState>((w, i) => (order.indexOf(i.state) > order.indexOf(w) ? i.state : w), 'ok');
  return { at: new Date().toISOString(), date: ilDate(new Date()), by, worst, items, r2Bytes: bytes };
}

// ---------- what went wrong lately, and the week's morning checks ----------
/** A problem that starts now: one open line per kind (told again only adds "the owners were told"). */
export function openEvent(st: MonitorState, e: { kind: MonitorEvent['kind']; he: string; at: string; alerted?: boolean }) {
  const open = (st.events || []).find((x) => x.open && x.kind === e.kind);
  if (open) { open.alerted = open.alerted || !!e.alerted; return; }
  st.events = [{ at: e.at, kind: e.kind, he: e.he, minutes: null, alerted: !!e.alerted, open: true }, ...(st.events || [])].slice(0, KEEP_EVENTS);
}
/** It is over: how long it took, or, when only the next morning check showed it, until: 'morning'. */
export function closeEvent(st: MonitorState, kind: MonitorEvent['kind'], end: string | 'morning', he?: string) {
  const open = (st.events || []).find((x) => x.open && x.kind === kind);
  if (!open) return;
  delete open.open;
  if (he) open.he = he;
  if (end === 'morning') open.until = 'morning';
  else open.minutes = Math.max(1, Math.round((Date.parse(end) - Date.parse(open.at)) / 60_000));
}
/** The upkeep run came late: the jobs did not run between the two (it is over by now). */
export function cronGap(st: MonitorState, lastAt: string | undefined, now: number) {
  const gap = lastAt ? now - Date.parse(lastAt) : 0;
  if (!(gap > CRON_LATE_MS)) return;
  openEvent(st, { kind: 'cron', he: 'המשימות המתוזמנות לא רצו', at: lastAt! });
  closeEvent(st, 'cron', new Date(now).toISOString());
}
/** The nightly backup's own turn in this run: a failure opens a line, a finished backup closes it. */
export function backupTurn(st: MonitorState, run: JobRun | undefined) {
  if (!run) return;
  if (!run.ok) openEvent(st, { kind: 'backup', he: 'הגיבוי לא הצליח', at: run.at });
  else if (run.result.done === true) closeEvent(st, 'backup', run.at);
}
/** A morning check in the week's table: one column per day, the day's last check. */
export function addMorning(st: MonitorState, h: Health) {
  const row = { date: h.date, states: Object.fromEntries(h.items.map((i) => [i.id, i.state])) };
  st.week = [...(st.week || []).filter((w) => w.date !== h.date), row].sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-KEEP_WEEK);
}
/** What the cron's morning check opens and closes among the events. */
export function morningEvents(st: MonitorState, h: Health, backupPaused: boolean) {
  const item = (id: string) => h.items.find((i) => i.id === id);
  const failures = item('failures');
  if (failures?.state === 'bad') openEvent(st, { kind: 'failures', he: `${failures.detail} תקלות שרת ביממה אחת`, at: h.at });
  else if (failures && failures.state !== 'unknown') closeEvent(st, 'failures', 'morning');
  const backup = item('backup');
  if (backup?.state === 'ok') closeEvent(st, 'backup', 'morning');
  else if (!backupPaused && (backup?.state === 'bad' || backup?.state === 'warn')) openEvent(st, { kind: 'backup', he: 'גיבוי הלילה לא נשמר', at: h.at });
}
/** The stored events as the console gets them. */
export const eventsView = (st: MonitorState): MonitorEvent[] => (st.events || []).map(({ open: _open, ...e }) => e);
/** The week; before the first morning check under this version, the one check there is. */
export const weekView = (st: MonitorState): MorningStates[] => st.week || (st.health ? [{ date: st.health.date, states: Object.fromEntries(st.health.items.map((i) => [i.id, i.state])) }] : []);

// ---------- alerts ----------
export async function alertSettings(env: Env): Promise<AlertSettings> {
  const base: AlertSettings = { on: true, push: true, daily: false, updatedAt: null, updatedBy: null };
  try { return { ...base, ...JSON.parse((await env.TOKEN_KV?.get(ALERTS_KEY)) || '{}') }; } catch { return base; }
}
export async function saveAlertSettings(env: Env, b: Record<string, unknown>, by: string): Promise<AlertSettings> {
  for (const k of Object.keys(b)) if (!['on', 'push', 'daily'].includes(k)) throw invalid(k, `unknown field ${k}`);
  for (const k of ['on', 'push', 'daily']) if (b[k] !== undefined && typeof b[k] !== 'boolean') throw invalid(k, `${k} must be true or false`);
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
  const { writes, receipt } = planNotification(fs, [uid], { kind: 'system', title: 'בדיקת התראות מהשרת', sub: 'ככה תיראה התראה כשמשהו לא בסדר. אפשר לכבות מהקונסולה.', link: '/admin', by: SERVER, push: set.push, tag: 'server-test' });
  const pushState = receipt.queued ? pushQueueState(env, (await readSwitches(env, true)).pushPaused) : undefined;
  await fs.commit(writes);
  return { ...receipt, sent: true, push: !!receipt.queued, ...(pushState ? { pushState } : {}) };
}

const hm = (iso: string) => new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));

/** A site check: the uptime, the owners' alert, and the event's line. */
export async function siteStep(env: Env, fs: Firestore, st: MonitorState, check: SiteCheck) {
  const r = addCheck(st.uptime, check);
  st.uptime = r.uptime;
  if (r.event === 'down') {
    const told = await sendAlert(env, fs, st, { id: 'site-down', title: 'האתר לא עונה', sub: `מאז ${hm(st.uptime.downSince!)}. בודקים שוב כל רבע שעה ונודיע כשיחזור.`, urgent: true }).catch(() => false);
    openEvent(st, { kind: 'site', he: 'האתר לא עונה', at: st.uptime.downSince!, alerted: told });
  }
  if (r.event === 'up') closeEvent(st, 'site', check.at, 'האתר לא ענה');
  if (r.event === 'up' && st.sent?.['site-down']) {
    const inc = st.uptime.incidents[st.uptime.incidents.length - 1];
    const mins = inc?.to ? Math.round((Date.parse(inc.to) - Date.parse(inc.from)) / 60_000) : 0;
    await sendAlert(env, fs, st, { id: 'site-up-' + (inc?.from || ''), title: 'האתר חזר לעבוד', sub: `היה למטה בערך ${mins} דקות.` }).catch(() => false);
    if (st.sent) delete st.sent['site-down'];
  }
}
/** A quota reading that is new: the alert and the event's line. */
export async function quotaStep(env: Env, fs: Firestore, st: MonitorState, now: Date) {
  const s = share(st.quota);
  if (s === null) return;
  if (s < 0.8) { closeEvent(st, 'quota', now.toISOString()); return; }
  const told = await sendAlert(env, fs, st, { id: 'quota-' + ilDate(now), title: 'המכסה החינמית של Firestore מתקרבת לסוף', sub: `${pct(s)} מהמכסה של היום כבר בשימוש. היא מתחדשת ב־10:00 בבוקר.` }).catch(() => false);
  openEvent(st, { kind: 'quota', he: `${pct(s)} מהמכסה היומית של Firestore כבר נוצלו`, at: now.toISOString(), alerted: told });
}
/** The morning check, once a day: the week's column, the events, the alert when something is bad, else the daily summary (if on). */
export async function morningStep(env: Env, fs: Firestore, st: MonitorState, now: Date) {
  const h = await healthCheck(env, fs, st, 'cron');
  st.health = h;
  st.morning = ilDate(now);
  addMorning(st, h);
  morningEvents(st, h, (await readSwitches(env)).backupPaused);
  const bad = h.items.filter((i) => i.state === 'bad');
  const warn = h.items.filter((i) => i.state === 'warn');
  const line = (items: HealthItem[]) => items.map((i) => `${i.he}: ${i.detail}`).join(' · ');
  const id = 'health-' + h.date;
  let told: HealthItem[] = [];
  if (bad.length) {
    if (await sendAlert(env, fs, st, { id, title: bad.length === 1 ? `בדיקת הבוקר: ${bad[0].he}` : `בדיקת הבוקר: ${bad.length} דברים לבדוק`, sub: line(bad) }).catch(() => false)) told = bad;
  } else if ((await alertSettings(env)).daily) {
    const title = !warn.length ? 'סיכום הבוקר: הכל תקין' : warn.length === 1 ? `סיכום הבוקר: ${warn[0].he}` : `סיכום הבוקר: ${warn.length} דברים לשים לב`;
    if (await sendAlert(env, fs, st, { id, title, sub: warn.length ? line(warn) : line(h.items.filter((i) => ['site', 'backup'].includes(i.id))) }).catch(() => false)) told = warn;
  }
  // an open problem the owners were just told about
  for (const e of st.events || []) if (e.open && told.some((i) => i.id === e.kind)) e.alerted = true;
}

/** One cron run of watching: the site every 15 minutes, the quota every hour, the morning check once a day. */
export async function monitorStep(env: Env, prev: MonitorState): Promise<MonitorState> {
  const st: MonitorState = { uptime: prev.uptime, quota: prev.quota, health: prev.health, sent: prev.sent, at: prev.at, week: prev.week, events: prev.events, rounds: prev.rounds, morning: prev.morning };
  // the emulator (tests) has no site, no Cloud Monitoring and no owners to wake
  if (env.FIRESTORE_EMULATOR_HOST) return st;
  const fs = new Firestore(env, new Set());
  const now = new Date();
  const lastCheck = st.uptime?.checks[st.uptime.checks.length - 1];
  if (!lastCheck || now.getTime() - Date.parse(lastCheck.at) >= 14 * 60_000) {
    await siteStep(env, fs, st, await checkSite(env));
  }
  // hourly; every quarter hour while it fails, so a fix (a role granted) shows soon
  // (no billing: once a day, in case the plan changes)
  const every = st.quota?.error === 'billing' ? 24 * 60 : st.quota?.error ? 14 : 55;
  if (!st.quota || now.getTime() - Date.parse(st.quota.at) >= every * 60_000) {
    st.quota = await readQuota(env);
    await quotaStep(env, fs, st, now);
  }
  const ilHour = +new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', hourCycle: 'h23' }).format(now);
  // (a record from before "morning" was kept: the day's check counts as made)
  if (ilHour >= 7 && (st.morning ? st.morning !== ilDate(now) : st.health?.date !== ilDate(now))) await morningStep(env, fs, st, now);
  // forget alerts older than two days
  if (st.sent) st.sent = Object.fromEntries(Object.entries(st.sent).filter(([, at]) => Date.now() - Date.parse(at) < 2 * 86400_000));
  return st;
}

// ---------- the security log ----------
export type SecurityEvent = { at: string; kind: 'refused' | 'limited' | 'console'; who: string; what: string; detail: string; ok: boolean };
const REFUSED = new Set(['FORBIDDEN', 'UNAUTHENTICATED', 'PERMISSION_DENIED']);
/** Which switches a logged change flipped, and the reason: "קריאה בלבד: דלוק · בדיקה". The log keeps the answer as JSON text. */
function switchDetail(result: unknown, body: unknown): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(json(result))) {
    const c = v as { from?: unknown; to?: unknown } | null;
    if (!SWITCH_HE[k] || !c || typeof c !== 'object' || c.from === c.to) continue;
    parts.push(`${SWITCH_HE[k]}: ${typeof c.to === 'boolean' ? (c.to ? 'דלוק' : 'כבוי') : 'שונה'}`);
  }
  const reason = json(body).reason;
  return [parts.join(', '), typeof reason === 'string' ? reason.trim() : ''].filter(Boolean).join(' · ');
}
const ROLE_WORD: Record<string, string> = { guest: 'אורח/ת', staff: 'מתנדב/ת', manager: 'מנהל/ת', owner: 'בעלים', vendor: 'בעל דוכן' };
const json = (v: unknown) => { try { return ((typeof v === 'string' ? JSON.parse(v) : v) || {}) as Record<string, unknown>; } catch { return {}; } };
const ALERT_HE: Record<string, string> = { on: 'התראות לבעלים', push: 'התראה לטלפון', daily: 'סיכום בוקר יומי' };
/** What a console line was about: which switches, whose role and to what, who was blocked or deleted, which job, key, email or alert. */
function consoleDetail(op: string, x: Record<string, unknown>, names: Map<string, string>, keys: Map<string, string>): string {
  if (op === 'console.switches.set') return switchDetail(x.result, x.body);
  const b = json(x.body);
  if (op === 'console.jobs.run') return JOB_HE[String(b.id)] || '';
  if (op === 'invites.setRole') return [String(b.email || ''), b.role === 'guest' ? 'ביטול' : ROLE_WORD[String(b.role)] || ''].filter(Boolean).join(' · ');
  if (op === 'console.monitor.alerts') return Object.keys(ALERT_HE).filter((k) => typeof b[k] === 'boolean').map((k) => `${ALERT_HE[k]}: ${b[k] ? 'דלוק' : 'כבוי'}`).join(', ');
  if (/^console\.keys\./.test(op)) return typeof b.label === 'string' && b.label ? b.label : keys.get(String(b.id || '')) || '';
  if (!/^people\./.test(op)) return '';
  const who = names.get(String(b.uid || '')) || '';
  const what = op === 'people.setRole' ? ROLE_WORD[String(b.role)] || '' : op === 'people.setStatus' ? (b.status === 'blocked' ? 'חסימה' : b.status === 'active' ? 'שחרור' : '') : '';
  return [who, what].filter(Boolean).join(' · ');
}
/** The names of the people the console's lines are about: one batch read, up to 50 people. */
async function namesIn(fs: Firestore, rows: Record<string, unknown>[]): Promise<Map<string, string>> {
  const uids = [...new Set(rows.filter((x) => x.ok && /^people\./.test(String(x.op))).map((x) => String(json(x.body).uid || '')).filter((u) => /^[A-Za-z0-9_-]{1,128}$/.test(u)))].slice(0, 50);
  // a person who was deleted has no profile any more: the line of the deletion keeps the name
  const gone = new Map<string, string>();
  for (const x of rows) {
    const uid = x.op === 'people.delete' ? String(json(x.body).uid || '') : '';
    const name = uid && /"displayName":("(?:[^"\\]|\\.)*")/.exec(String(x.result || ''))?.[1];
    if (name) try { gone.set(uid, String(JSON.parse(name))); } catch { /* cut short: no name */ }
  }
  try { for (const d of await fs.rawGet(uids.map((u) => fs.name('users', u)), ['displayName'])) gone.set(String(d.name).split('/').pop()!, String((d.fields?.displayName as { stringValue?: string } | undefined)?.stringValue || '')); }
  catch { /* the lines stay, without the names */ }
  return gone;
}
export async function securityLog(env: Env, fs: Firestore, days: number) {
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
    if (!REFUSED.has(String(x.code)) || x.credential === 'console') continue; // the console's own come below
    out.push({ at: String(x.at), kind: 'refused', who: String(x.keyLabel || x.credential || ''), what: String(x.opHe || x.op || x.path || ''), detail: String(x.message || x.code || ''), ok: false });
  }
  for (const d of limited) {
    const x = d.data;
    if (!['RATE_LIMITED', 'QUOTA_EXCEEDED'].includes(String(x.code))) continue;
    out.push({ at: String(x.at), kind: 'limited', who: String(x.credential || 'כתובת לא מוכרת'), what: String(x.path || ''), detail: x.code === 'RATE_LIMITED' ? 'יותר מדי בקשות בזמן קצר: נחסם לדקה' : 'המכסה היומית נגמרה', ok: false });
  }
  const mine = console_.map((d) => d.data).filter((x) => String(x.at) >= since);
  const names = await namesIn(fs, mine);
  const keys = new Map(mine.some((x) => /^console\.keys\./.test(String(x.op))) ? (await listKeys(env).catch(() => [])).map((k) => [k.id, k.label]) : []);
  for (const x of mine) {
    out.push({ at: String(x.at), kind: 'console', who: String(x.actor && typeof x.actor === 'object' ? (x.actor as { name?: string }).name || x.keyLabel : x.keyLabel), what: String(x.opHe || x.op || '').replace(/\s*\(.*$/, '').replace(/\. .*$/, ''), detail: x.ok ? consoleDetail(String(x.op || ''), x, names, keys) : String(x.message || ''), ok: !!x.ok });
  }
  out.sort((a, b) => (a.at < b.at ? 1 : -1));
  return { since, items: out.slice(0, 400) };
}
