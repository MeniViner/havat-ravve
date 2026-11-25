// The owners' controls (the console's מתגים, תור שליחה and משימות מתוזמנות screens), all on the free plans:
//  - switches, in one KV record (console:switches), written only when an owner flips one:
//      emailPaused     payment emails wait in the outbox (they are still queued, nothing is lost) until it is off again
//      pushPaused      phone pushes are not sent (the in-app notification always lands; a push older than 6 hours is dropped)
//      keysStopped     every API key is refused at once (the console itself keeps working)
//      readOnly        API keys may only read; the app shows "קריאה בלבד" and refuses changes to everyone but owners
//      maintenance     the app shows a maintenance screen to everyone but owners, with an optional message
//      registration    closed: someone without an account sees "ההרשמה סגורה כרגע" instead of the sign-up questions
//      backupPaused, monitorPaused, cleanupPaused   the scheduled jobs of the same names skip their turn
//      broadcastEmailPaused   "לשלוח גם במייל" messages wait in the outbox (payment emails go as usual)
//    The record also keeps the last 20 changes (who, what, why).
//    What the app needs (maintenance, registration, readOnly) is copied to settings/switches, which the app already may
//    read (settings/* is public) and nobody but this Worker can write (the Rules allow only settings/app to managers).
//  - the send queue: payment emails (email_outbox) and phone pushes (push_jobs) that wait or failed; send again, cancel,
//    and the email as a guest would get it.
//  - scheduled jobs: each part of the 5-minute cron, its last result (kept in the cron's own KV record), run now, pause.
//  - cleanup, at night after the backup: old request logs, failures, finished emails and pushes are copied to R2
//    (archive/<collection>/<date>-<n>.ndjson) and then deleted, a page per run, so Firestore stays small and free.
import { type Env, Firestore, type RawDoc } from './firestore';
import { ApiError, invalid } from './http';
import { ilDate, pathOf } from './backup';
import { OUTBOX, brevoUsed, emailHtml } from './email';
import { JOBS } from './push';
import { todayIL } from './core';
import { isoFromIL } from './writes';

export const SWITCHES_KEY = 'console:switches';
const CLEANUP_KEY = 'console:cleanup';
export const ARCHIVE = 'archive/';

export type Switches = {
  emailPaused: boolean; pushPaused: boolean; keysStopped: boolean; readOnly: boolean;
  maintenance: boolean; maintenanceText: string; registrationClosed: boolean;
  backupPaused: boolean; monitorPaused: boolean; cleanupPaused: boolean; broadcastEmailPaused: boolean;
  updatedAt: string | null; updatedBy: string | null;
};
export type SwitchChange = { at: string; by: string; key: string; to: boolean; reason: string };
const KEEP_CHANGES = 20;
const MAX_REASON = 200;
/** Each switch as the security log names it. */
export const SWITCH_HE: Record<string, string> = {
  emailPaused: 'השהיית מיילים על תשלומים', pushPaused: 'השהיית התראות לטלפון', broadcastEmailPaused: 'השהיית מיילים לנרשמים', keysStopped: 'עצירת מפתחות API',
  readOnly: 'קריאה בלבד', maintenance: 'מצב תחזוקה', registrationClosed: 'סגירת ההרשמה', backupPaused: 'השהיית הגיבוי', monitorPaused: 'השהיית הניטור', cleanupPaused: 'השהיית הניקוי',
  maintenanceText: 'הודעת התחזוקה',
};
const BOOLS = ['emailPaused', 'pushPaused', 'keysStopped', 'readOnly', 'maintenance', 'registrationClosed', 'backupPaused', 'monitorPaused', 'cleanupPaused', 'broadcastEmailPaused'] as const;
export const DEFAULT_SWITCHES: Switches = {
  emailPaused: false, pushPaused: false, keysStopped: false, readOnly: false, maintenance: false, maintenanceText: '', registrationClosed: false,
  backupPaused: false, monitorPaused: false, cleanupPaused: false, broadcastEmailPaused: false, updatedAt: null, updatedBy: null,
};

let cache: { at: number; sw: Switches } | null = null;
/** The switches as they are now. Requests read them through a 20-second cache in the isolate (a KV read is cheap, but
 *  not free on every request); the cron and the console read them fresh. */
export async function readSwitches(env: Env, fresh = false): Promise<Switches> {
  if (!fresh && cache && Date.now() - cache.at < 20_000) return cache.sw;
  return (await readSwitchRecord(env)).switches;
}
/** The whole record, read fresh: the switches and their last changes, newest first. */
export async function readSwitchRecord(env: Env): Promise<{ switches: Switches; history: SwitchChange[] }> {
  let switches = DEFAULT_SWITCHES;
  let history: SwitchChange[] = [];
  try {
    const { history: h, ...sw } = JSON.parse((await env.TOKEN_KV?.get(SWITCHES_KEY)) || '{}') || {};
    switches = { ...DEFAULT_SWITCHES, ...sw };
    if (Array.isArray(h)) history = h;
  } catch { /* keep the defaults */ }
  cache = { at: Date.now(), sw: switches };
  return { switches, history };
}

/** Flip switches: { readOnly: true, reason? } … Returns the record before and after. The app's part goes to settings/switches. */
export async function saveSwitches(env: Env, fs: Firestore, body: Record<string, unknown>, by: string): Promise<{ before: Switches; switches: Switches; history: SwitchChange[] }> {
  if (!env.TOKEN_KV) throw new ApiError('INTERNAL', 'no KV namespace for the switches');
  const { switches: cur, history } = await readSwitchRecord(env);
  const next: Switches = { ...cur };
  let reason = '';
  for (const [k, v] of Object.entries(body)) {
    if (k === 'reason') {
      if (typeof v !== 'string' || v.trim().length > MAX_REASON) throw invalid(k, `text up to ${MAX_REASON} characters`, `הסיבה יכולה להיות עד ${MAX_REASON} תווים`);
      reason = v.trim(); continue;
    }
    if ((BOOLS as readonly string[]).includes(k)) { if (typeof v !== 'boolean') throw invalid(k, 'true or false'); (next as Record<string, unknown>)[k] = v; continue; }
    if (k === 'maintenanceText') { if (typeof v !== 'string' || v.length > 300) throw invalid(k, 'text up to 300 characters'); next.maintenanceText = v.trim(); continue; }
    throw invalid(k, `unknown switch ${k}`);
  }
  next.updatedAt = new Date().toISOString();
  next.updatedBy = by;
  const app = (s: Switches) => JSON.stringify([s.maintenance, s.maintenanceText, s.registrationClosed, s.readOnly]);
  // the app's copy first: if it fails, nothing changed anywhere
  if (app(next) !== app(cur)) {
    await fs.commit([fs.set('settings', 'switches', { maintenance: next.maintenance, maintenanceText: next.maintenanceText, registrationClosed: next.registrationClosed, readOnly: next.readOnly, updatedAt: next.updatedAt })]);
  }
  // one line per switch that really changed (the maintenance text is not a switch)
  const changes = BOOLS.filter((k) => next[k] !== cur[k]).map((key) => ({ at: next.updatedAt!, by, key, to: next[key], reason }));
  const kept = [...changes, ...history].slice(0, KEEP_CHANGES);
  await env.TOKEN_KV.put(SWITCHES_KEY, JSON.stringify({ ...next, history: kept }));
  cache = { at: Date.now(), sw: next };
  return { before: cur, switches: next, history: kept };
}

/** An API key request while a switch says no. The console (Google sign-in) is never stopped. */
export async function guardKeys(env: Env, method: string) {
  const sw = await readSwitches(env);
  if (sw.keysStopped) throw new ApiError('FORBIDDEN', 'API keys are stopped from the owners\' console', { switch: 'keysStopped' });
  if (sw.readOnly && method !== 'GET') throw new ApiError('FORBIDDEN', 'the farm is read-only right now (owners\' console); reads still work', { switch: 'readOnly' });
}

// ---------- the send queue ----------
const ms = (t: unknown) => Date.parse(String(t || '').replace(/(\.\d{3})\d+/, '$1')) || 0;
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const SOURCE: Record<string, string> = { order: 'tickets', donation: 'donations', tab: 'tabs' };
const STALE_PUSH_MS = 6 * 3600_000; // push.ts STALE_MS

/** The mail service's free allowance a day (Brevo). */
const DAILY_LIMIT = 300;
const SENT_ROWS = 30;
const SENT_SCAN = 50;
const ils = (v: unknown) => (typeof v === 'number' ? ` · ${v.toLocaleString('he-IL')} ₪` : '');

/** Reads: at most 50 for each of the five lists, the people they name, and two counts. */
export async function sendQueue(env: Env, fs: Firestore) {
  const midnight = isoFromIL(todayIL());
  const since = (col: string) => fs.count({ from: [{ collectionId: col }], where: { fieldFilter: { field: { fieldPath: 'sentAt' }, op: 'GREATER_THAN_OR_EQUAL', value: { stringValue: midnight } } } }).catch(() => null);
  const latest = (col: string, field: string) => fs.query({ from: [{ collectionId: col }], orderBy: [{ field: { fieldPath: field }, direction: 'DESCENDING' }], limit: SENT_SCAN }).catch(() => []);
  const [emailOpen, emailFailed, pushOpen, emailLast, pushLast, emailsToday, pushesToday, used] = await Promise.all([
    fs.query({ from: [{ collectionId: OUTBOX }], where: { fieldFilter: { field: { fieldPath: 'status' }, op: 'IN', value: { arrayValue: { values: [{ stringValue: 'queued' }, { stringValue: 'sending' }] } } } }, limit: 50 }),
    fs.query({ from: [{ collectionId: OUTBOX }], where: { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'failed' } } }, limit: 50 }),
    fs.query({ from: [{ collectionId: JOBS }], where: { unaryFilter: { op: 'IS_NULL', field: { fieldPath: 'sentAt' } } }, limit: 50 }),
    latest(OUTBOX, 'updatedAt'), latest(JOBS, 'createdAt'), since(OUTBOX), since(JOBS), brevoUsed(env),
  ]);
  // what went out: emails marked sent, pushes whose last recipient was done (not cancelled, refused or too old)
  const sentMail = emailLast.filter((d) => d.id !== '_state' && d.data.status === 'sent');
  const pushOut = (d: { data: Record<string, unknown> }) => !!d.data.sentAt && d.data.outcome === 'sent';
  const sentPush = pushLast.filter(pushOut);
  // who each email is for: the guest's name on the payment (never the address in the list)
  const emails = [...emailOpen, ...emailFailed].filter((d) => d.id !== '_state');
  const onlyOne = (d: { data: Record<string, unknown> }) => (Array.isArray(d.data.to) && d.data.to.length === 1 ? str(d.data.to[0]) : '');
  const uids = [...new Set([...emails, ...sentMail].map((d) => str(d.data.uid)).concat(sentPush.map(onlyOne)).filter(Boolean))].slice(0, 200);
  const refs = new Map<string, string[]>();
  for (const e of emails) { const col = SOURCE[str(e.data.kind)]; if (col) refs.set(col, [...(refs.get(col) || []), str(e.data.refId)]); }
  const names = new Map<string, string>();
  const person = new Map<string, string>();
  await Promise.all([fs.getMany('users', uids, ['displayName']).then((ds) => { for (const d of ds) person.set(d.id, str(d.data.displayName)); }, () => {}), ...[...refs].map(async ([col, ids]) => {
    const docs = await fs.getMany(col, [...new Set(ids.filter(Boolean))].slice(0, 60)).catch(() => []);
    for (const d of docs) names.set(col + '/' + d.id, str(d.data.ownerName) || str(d.data.name) || str(d.data.guestName));
  })]);
  const now = Date.now();
  const sent = [
    ...sentMail.map((e) => ({
      id: e.id, type: 'email' as const, kind: str(e.data.kind), who: person.get(str(e.data.uid)) || '', what: e.data.kind === 'broadcast' ? 'הודעה מחוות רווה' : 'אישור תשלום' + ils(e.data.amount),
      to: 1, attempts: Number(e.data.attempts || 0), at: str(e.data.sentAt) || str(e.data.updatedAt),
    })),
    ...sentPush.map((p) => ({
      id: p.id, type: 'push' as const, kind: str(p.data.kind), who: person.get(onlyOne(p)) || '', what: str(p.data.title),
      to: Array.isArray(p.data.to) ? p.data.to.length : 0, attempts: Number(p.data.attempts || 0), at: str(p.data.sentAt),
    })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, SENT_ROWS);
  // a finished push that never went out (cancelled, too old) also carries sentAt: those of today are taken off the count
  const notOut = pushLast.filter((d) => str(d.data.sentAt) >= midnight && !pushOut(d)).length;
  return {
    sent, sentToday: (emailsToday ?? 0) + Math.max(0, (pushesToday ?? 0) - notOut), daily: { used, limit: DAILY_LIMIT },
    emails: emails.map((e) => ({
      id: e.id, kind: str(e.data.kind), status: str(e.data.status), reason: str(e.data.reason), error: str(e.data.error).slice(0, 200),
      who: names.get(SOURCE[str(e.data.kind)] + '/' + str(e.data.refId)) || person.get(str(e.data.uid)) || '', attempts: Number(e.data.attempts || 0),
      provider: str(e.data.provider), createdAt: str(e.data.createdAt), nextAt: str(e.data.nextAt), updatedAt: str(e.data.updatedAt), updateTime: e.updateTime,
    })).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    pushes: pushOpen.map((p) => ({
      id: p.id, kind: str(p.data.kind), title: str(p.data.title), body: str(p.data.body), to: Array.isArray(p.data.to) ? p.data.to.length : 0,
      done: Number(p.data.cursor || 0), createdAt: str(p.data.createdAt), by: str((p.data.createdBy as { name?: string } | undefined)?.name),
      stale: now - ms(p.data.createdAt) > STALE_PUSH_MS, updateTime: p.updateTime,
    })).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
  };
}

/** Send a failed or waiting email again (a fresh first attempt), or cancel it. */
export async function emailAction(fs: Firestore, id: string, action: 'retry' | 'cancel', updateTime: string, by: string) {
  if (!/^[\w-]{1,120}$/.test(id) || id === '_state') throw invalid('id', 'an email job id');
  const job = await fs.get(OUTBOX, id);
  if (!job) throw new ApiError('NOT_FOUND', 'no such email job');
  if (updateTime && job.updateTime !== updateTime) throw new ApiError('STALE_WRITE', 'the email changed since the list was read', { updateTime: job.updateTime });
  const st = str(job.data.status);
  const now = new Date().toISOString();
  if (action === 'retry') {
    if (!['failed', 'queued'].includes(st)) throw invalid('id', `an email that is ${st} cannot be sent again`);
    await fs.commit([fs.patch(OUTBOX, id, { status: 'queued', attempts: 0, firstAttemptAt: null, nextAt: now, reason: null, error: null, retriedBy: by, retriedAt: now, updatedAt: now }, job.updateTime)]);
    return { id, status: 'queued', was: st };
  }
  if (!['failed', 'queued'].includes(st)) throw invalid('id', `an email that is ${st} cannot be cancelled`);
  await fs.commit([fs.patch(OUTBOX, id, { status: 'cancelled', reason: 'console', nextAt: null, cancelledBy: by, updatedAt: now }, job.updateTime)]);
  return { id, status: 'cancelled', was: st };
}

/** Cancel a phone push that has not gone out (the in-app notification stays). */
export async function cancelPush(fs: Firestore, id: string, updateTime: string, by: string) {
  if (!/^[\w-]{1,120}$/.test(id)) throw invalid('id', 'a push job id');
  const job = await fs.get(JOBS, id);
  if (!job) throw new ApiError('NOT_FOUND', 'no such push');
  if (job.data.sentAt) throw invalid('id', 'this push already went out');
  if (updateTime && job.updateTime !== updateTime) throw new ApiError('STALE_WRITE', 'the push changed since the list was read', { updateTime: job.updateTime });
  const now = new Date().toISOString();
  await fs.commit([fs.patch(JOBS, id, { sentAt: now, cancelledBy: by, result: 'cancelled' }, job.updateTime)]);
  return { id, cancelled: true };
}

const DEFAULT_TEMPLATE = 'שלום [שם], קיבלנו את התשלום בסך [סכום] עבור [עבור]. תודה מחוות רווה!';
/** The payment email as a guest gets it, with sample values (email.ts fills the same template). */
export async function emailPreview(fs: Firestore) {
  const settings = (await fs.get('settings', 'app'))?.data;
  const saved = String((settings?.templates as Record<string, unknown> | undefined)?.paymentConfirmation || '').trim();
  const template = saved || DEFAULT_TEMPLATE;
  const sample: Record<string, string> = { 'שם': 'דנה לוי', 'סכום': '120 ₪', 'עבור': '2 כרטיסים לחג האסיף', 'אירוע': 'חג האסיף' };
  const text = Object.entries(sample).reduce((s, [k, v]) => s.replaceAll(`[${k}]`, v), template);
  return { subject: 'אישור תשלום מחוות רווה', from: 'חוות רווה', template, custom: !!saved, text, html: emailHtml(text) };
}

// ---------- cleanup ----------
type Rule = { col: string; field: string; days: number; he: string; keep?: (d: RawDoc) => boolean };
const FINISHED = new Set(['sent', 'failed', 'skipped', 'cancelled']);
export const CLEANUP_RULES: Rule[] = [
  { col: 'api_idempotency', field: 'createdAt', days: 7, he: 'זיכרון בקשות חוזרות של ה־API' },
  { col: 'api_log', field: 'at', days: 90, he: 'יומן הבקשות של ה־API' },
  { col: 'api_failures', field: 'at', days: 90, he: 'תקלות שרת' },
  { col: JOBS, field: 'createdAt', days: 30, he: 'התראות לטלפון שנשלחו' },
  { col: OUTBOX, field: 'updatedAt', days: 365, he: 'מיילים שנשלחו', keep: (d) => !FINISHED.has(String(d.fields?.status?.stringValue || '')) },
];
const PAGE = 100;
type CleanupState = { date: string; rule: number; parts: number; archived: number; deleted: number; done: boolean; at: string; by: string; failed?: number; error?: string };
const enc = (iso: string) => ({ stringValue: iso });

async function readCleanup(env: Env): Promise<CleanupState | null> {
  try { return JSON.parse((await env.TOKEN_KV?.get(CLEANUP_KEY)) || 'null'); } catch { return null; }
}

/** How much each rule would clean now (counts only). */
export async function cleanupPreview(env: Env, fs: Firestore) {
  const now = Date.now();
  const items = await Promise.all(CLEANUP_RULES.map(async (r) => {
    const cutoff = new Date(now - r.days * 86400_000).toISOString();
    const n = await fs.count({ from: [{ collectionId: r.col }], where: { fieldFilter: { field: { fieldPath: r.field }, op: 'LESS_THAN', value: enc(cutoff) } } }).catch(() => null);
    return { collection: r.col, he: r.he, days: r.days, due: n };
  }));
  return { items, last: await readCleanup(env) };
}

const ARCHIVE_DAYS = 365;
/** Removes archive files older than a year (their names start with the night's date), at most a page per collection. */
async function pruneArchive(env: Env): Promise<number> {
  if (!env.FILE_BUCKET) return 0;
  const cut = ilDate(new Date(Date.now() - ARCHIVE_DAYS * 86400_000));
  let n = 0;
  for (const col of [...new Set(CLEANUP_RULES.map((r) => r.col))]) {
    const old = (await env.FILE_BUCKET.list({ prefix: `${ARCHIVE}${col}/`, limit: 1000 })).objects.map((o) => o.key)
      .filter((k) => (/\/(\d{4}-\d{2}-\d{2})-/.exec(k)?.[1] || '9999') < cut);
    if (old.length) { await env.FILE_BUCKET.delete(old); n += old.length; }
  }
  return n;
}

/** One page of cleanup: at night after today's backup, or when an owner presses "now". Copies the page to R2, then
 *  deletes exactly those documents (each with its updateTime, so a record changed meanwhile is left alone). */
export async function runCleanup(env: Env, opts: { force?: boolean; by?: string } = {}) {
  if (!env.FILE_BUCKET || !env.TOKEN_KV) return null;
  const today = ilDate();
  let st = await readCleanup(env);
  if (st && st.date !== today) st = null;
  if (st?.done && !opts.force) return null;
  if (!opts.force) {
    const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
    // from 03:00 until 23:00, once tonight's backup is done (a big night backup can run past dawn; deletes check each
    // record's version, so a busy day is safe)
    if (hour < 3 || hour >= 23) return null;
    // the backup first: what is cleaned tonight is also in tonight's backup
    const last = JSON.parse((await env.TOKEN_KV.get('console:backup-last')) || 'null') as { date?: string } | null;
    if (last?.date !== today) return null;
  }
  if (!st || st.done) st = { date: today, rule: 0, parts: st?.parts || 0, archived: st?.archived || 0, deleted: st?.deleted || 0, done: false, at: '', by: opts.by || 'cron' };
  const fs = new Firestore(env);
  const now = Date.now();
  // one page of one rule per call: a query, an R2 write and a commit, well inside the free plan's 50 subrequests
  while (st.rule < CLEANUP_RULES.length) {
    const r = CLEANUP_RULES[st.rule];
    const cutoff = new Date(now - r.days * 86400_000).toISOString();
    const page = await fs.rawQuery({
      from: [{ collectionId: r.col }],
      where: { fieldFilter: { field: { fieldPath: r.field }, op: 'LESS_THAN', value: enc(cutoff) } },
      orderBy: [{ field: { fieldPath: r.field }, direction: 'ASCENDING' }],
      limit: PAGE,
    });
    const doomed = page.filter((d) => !r.keep?.(d));
    let moveOn = false;
    if (doomed.length) {
      st.parts++;
      const body = doomed.map((d) => JSON.stringify({ name: d.name, fields: d.fields || {}, createTime: d.createTime, updateTime: d.updateTime })).join('\n') + '\n';
      await env.FILE_BUCKET.put(`${ARCHIVE}${r.col}/${today}-${String(st.parts).padStart(4, '0')}.ndjson`, body, { httpMetadata: { contentType: 'application/x-ndjson' } });
      st.archived += doomed.length;
      const writes = doomed.map((d) => { const p = pathOf(d.name); const i = p.lastIndexOf('/'); return fs.remove(p.slice(0, i), p.slice(i + 1), d.updateTime); });
      try { await fs.commit(writes); st.deleted += doomed.length; st.failed = 0; }
      catch (e) {
        // a record changed meanwhile: the page waits for the next run (it is already archived). Three failures in a row
        // (quota, an outage) move on to the next rule instead of archiving the same page again and again.
        st.failed = (st.failed || 0) + 1;
        st.error = String(e instanceof Error ? e.message : e).slice(0, 120);
        if (st.failed >= 3) { moveOn = true; st.failed = 0; }
      }
    }
    // a full page that was all kept (unfinished emails) cannot move on by date: go to the next rule
    if (moveOn || page.length < PAGE || !doomed.length) st.rule++;
    if (doomed.length) break;
  }
  st.done = st.rule >= CLEANUP_RULES.length;
  st.at = new Date().toISOString();
  await env.TOKEN_KV.put(CLEANUP_KEY, JSON.stringify(st));
  // the night's last step: archive files older than a year go (logs hold personal details; a year is enough to look back)
  let expired = 0;
  if (st.done) expired = await pruneArchive(env).catch(() => 0);
  return { cron: 'cleanup', done: st.done, archived: st.archived, deleted: st.deleted, rule: st.rule, ...(expired ? { expired } : {}) };
}

/** What is in the archive (sizes by collection), for the console. */
export async function archiveSummary(env: Env) {
  if (!env.FILE_BUCKET) return { collections: [] as { collection: string; files: number; bytes: number }[] };
  const by = new Map<string, { files: number; bytes: number }>();
  let cursor: string | undefined;
  for (let i = 0; i < 5; i++) {
    const l = await env.FILE_BUCKET.list({ prefix: ARCHIVE, cursor, limit: 1000 });
    for (const o of l.objects) { const c = o.key.slice(ARCHIVE.length).split('/')[0]; const x = by.get(c) || { files: 0, bytes: 0 }; x.files++; x.bytes += o.size; by.set(c, x); }
    if (!l.truncated) break;
    cursor = l.cursor;
  }
  return { collections: [...by].map(([collection, x]) => ({ collection, ...x })) };
}
