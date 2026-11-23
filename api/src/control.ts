// The owners' controls (the console's מתגים, תור שליחה and משימות מתוזמנות screens), all on the free plans:
//  - switches, in one KV record (console:switches), written only when an owner flips one:
//      emailPaused     payment emails wait in the outbox (they are still queued, nothing is lost) until it is off again
//      pushPaused      phone pushes are not sent (the in-app notification always lands; a push older than 6 hours is dropped)
//      keysStopped     every API key is refused at once (the console itself keeps working)
//      readOnly        API keys may only read; the app shows "קריאה בלבד" and refuses changes to everyone but owners
//      maintenance     the app shows a maintenance screen to everyone but owners, with an optional message
//      registration    closed: someone without an account sees "ההרשמה סגורה כרגע" instead of the sign-up questions
//      backupPaused, monitorPaused, cleanupPaused   the scheduled jobs of the same names skip their turn
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
import { OUTBOX, emailHtml } from './email';
import { JOBS } from './push';

export const SWITCHES_KEY = 'console:switches';
const CLEANUP_KEY = 'console:cleanup';
export const ARCHIVE = 'archive/';

export type Switches = {
  emailPaused: boolean; pushPaused: boolean; keysStopped: boolean; readOnly: boolean;
  maintenance: boolean; maintenanceText: string; registrationClosed: boolean;
  backupPaused: boolean; monitorPaused: boolean; cleanupPaused: boolean;
  updatedAt: string | null; updatedBy: string | null;
};
const BOOLS = ['emailPaused', 'pushPaused', 'keysStopped', 'readOnly', 'maintenance', 'registrationClosed', 'backupPaused', 'monitorPaused', 'cleanupPaused'] as const;
export const DEFAULT_SWITCHES: Switches = {
  emailPaused: false, pushPaused: false, keysStopped: false, readOnly: false, maintenance: false, maintenanceText: '', registrationClosed: false,
  backupPaused: false, monitorPaused: false, cleanupPaused: false, updatedAt: null, updatedBy: null,
};

let cache: { at: number; sw: Switches } | null = null;
/** The switches as they are now. Requests read them through a 20-second cache in the isolate (a KV read is cheap, but
 *  not free on every request); the cron and the console read them fresh. */
export async function readSwitches(env: Env, fresh = false): Promise<Switches> {
  if (!fresh && cache && Date.now() - cache.at < 20_000) return cache.sw;
  let sw = DEFAULT_SWITCHES;
  try { sw = { ...DEFAULT_SWITCHES, ...(JSON.parse((await env.TOKEN_KV?.get(SWITCHES_KEY)) || '{}') || {}) }; } catch { /* keep the defaults */ }
  cache = { at: Date.now(), sw };
  return sw;
}

/** Flip switches: { readOnly: true } … Returns the new switches. The app's part goes to settings/switches. */
export async function saveSwitches(env: Env, fs: Firestore, body: Record<string, unknown>, by: string): Promise<Switches> {
  if (!env.TOKEN_KV) throw new ApiError('INTERNAL', 'no KV namespace for the switches');
  const cur = await readSwitches(env, true);
  const next: Switches = { ...cur };
  for (const [k, v] of Object.entries(body)) {
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
  await env.TOKEN_KV.put(SWITCHES_KEY, JSON.stringify(next));
  cache = { at: Date.now(), sw: next };
  return next;
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

export async function sendQueue(fs: Firestore) {
  const [emailOpen, emailFailed, pushOpen] = await Promise.all([
    fs.query({ from: [{ collectionId: OUTBOX }], where: { fieldFilter: { field: { fieldPath: 'status' }, op: 'IN', value: { arrayValue: { values: [{ stringValue: 'queued' }, { stringValue: 'sending' }] } } } }, limit: 50 }),
    fs.query({ from: [{ collectionId: OUTBOX }], where: { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'failed' } } }, limit: 50 }),
    fs.query({ from: [{ collectionId: JOBS }], where: { unaryFilter: { op: 'IS_NULL', field: { fieldPath: 'sentAt' } } }, limit: 50 }),
  ]);
  // who each email is for: the guest's name on the payment (never the address in the list)
  const emails = [...emailOpen, ...emailFailed].filter((d) => d.id !== '_state');
  const refs = new Map<string, string[]>();
  for (const e of emails) { const col = SOURCE[str(e.data.kind)]; if (col) refs.set(col, [...(refs.get(col) || []), str(e.data.refId)]); }
  const names = new Map<string, string>();
  await Promise.all([...refs].map(async ([col, ids]) => {
    const docs = await fs.getMany(col, [...new Set(ids.filter(Boolean))].slice(0, 60)).catch(() => []);
    for (const d of docs) names.set(col + '/' + d.id, str(d.data.ownerName) || str(d.data.name) || str(d.data.guestName));
  }));
  const now = Date.now();
  return {
    emails: emails.map((e) => ({
      id: e.id, kind: str(e.data.kind), status: str(e.data.status), reason: str(e.data.reason), error: str(e.data.error).slice(0, 200),
      who: names.get(SOURCE[str(e.data.kind)] + '/' + str(e.data.refId)) || '', attempts: Number(e.data.attempts || 0),
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
