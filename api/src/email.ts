// Automatic payment-confirmation email through Brevo, run by a Cron Trigger (Workers Free plan).
//
// Each run is bounded (well under the 50 subrequests a free invocation may make):
//  1. scan:  tickets, donations and stall accounts whose paidAt is after the cursor. paidAt is the server's
//            commit time of the settle (app and Worker both stamp it), so a gate that was offline and syncs
//            an hour later still lands after the cursor. One job per payment, under a stable id
//            (order_<orderId>, donation_<id>, tab_<id>) created with an exists:false precondition.
//  2. send:  up to BATCH due jobs. Each job is claimed with an updateTime precondition (the lease), checked
//            again at send time (still paid, no manual confirmation, the guest's current preference is email
//            with a valid address), sent with an idempotency key derived from the job id, and its outcome
//            and Brevo's message id recorded. Rate limits and outages retry with bounded backoff that stays
//            inside Brevo's idempotency window.
//  3. fallback: Resend (RESEND_API_KEY + RESEND_SENDER_EMAIL) takes a send when Brevo's daily allowance is used up
//            (counted in TOKEN_KV, BREVO_DAILY_LIMIT, default 290 of the free 300), when Brevo refuses it for any
//            reason that is not a bad address (rate limit, credits, account, outage), or when Brevo cannot be reached
//            on the last attempt. Once a job moved to Resend it stays there, under the same idempotency key, so a
//            retry never reaches the guest twice through two providers. With only Resend configured, it sends alone.
//  4. broadcast lane: the app's "לשלוח גם במייל" jobs (bc_<broadcastId>_<uid>), only on runs with no confirmation due, through
//            Brevo only, at most BROADCAST_DAILY a day and never into the share kept for confirmations (see the lane below).
// Nothing runs, and nothing is read, while EMAIL_ENABLED is not "true" or neither provider is configured.
import { type Doc, type Env, Firestore, type Write } from './firestore';
import { whereEq } from './core';
import { sha256hex } from './util';

export const OUTBOX = 'email_outbox';
const STATE = '_state';
const BATCH = 4; // about 8 subrequests a send: 4 stay well inside the free 50 per run
const SCAN_LIMIT = 50;
/** Re-read the last two minutes on every scan: a commit can become visible just after a later one. */
const OVERLAP_MS = 2 * 60_000;
/** After 20 minutes without a run (the switch was off, or an outage) start from now instead of mailing a backlog.
 *  While the switch is off no run records anything, so turning it back on always starts fresh. */
const GAP_MS = 20 * 60_000;
/** Time for an undo, or for a manager who confirms by hand, before the email goes. */
const GRACE_MS = 3 * 60_000;
/** An order paid ticket by ticket at the gate waits this long for the rest before confirming what was paid. */
const ORDER_WAIT_MS = 30 * 60_000;
const LEASE_MS = 2 * 60_000;
/** Attempts 2 and 3 go on the next runs (the cron is every 5 minutes). No attempt starts later than SEND_WINDOW_MS
 *  after the first one, so a resend after a lost answer stays inside Brevo's idempotency window (15–30 minutes). */
const RETRY_S = 4 * 60;
const MAX_ATTEMPTS = 3;
const SEND_WINDOW_MS = 12 * 60_000;
const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';
const RESEND_URL = 'https://api.resend.com/emails';
const BREVO_DAILY_DEFAULT = 290;
const SENDER_NAME = 'חוות רווה';
const SUBJECT = 'אישור תשלום מחוות רווה';
const DEFAULT_TEMPLATE = 'שלום [שם], קיבלנו את התשלום בסך [סכום] עבור [עבור]. תודה מחוות רווה!';
/** The same check the app uses for an email destination (data.ts receiptDestination). */
const EMAIL_RE = /^[^\s@?&/#]+@[^\s@?&/#]+\.[^\s@?&/#]+$/;
const SELF_TEST_KEY = 'email-self-test-v1';

export type JobKind = 'order' | 'donation' | 'tab';
export type JobStatus = 'queued' | 'sending' | 'sent' | 'failed' | 'skipped' | 'cancelled';
const SOURCE: Record<JobKind, 'tickets' | 'donations' | 'tabs'> = { order: 'tickets', donation: 'donations', tab: 'tabs' };

const brevoReady = (env: Env) => !!env.BREVO_API_KEY && !!env.BREVO_SENDER_EMAIL;
const resendReady = (env: Env) => !!env.RESEND_API_KEY && !!env.RESEND_SENDER_EMAIL;
export const emailEnabled = (env: Env) => env.EMAIL_ENABLED === 'true' && (brevoReady(env) || resendReady(env));
const testMode = (env: Env) => !!env.FIRESTORE_EMULATOR_HOST && env.TEST_FAULTS === '1';
const brevoUrl = (env: Env) => (testMode(env) && env.BREVO_API_URL ? env.BREVO_API_URL : BREVO_URL);
const resendUrl = (env: Env) => (testMode(env) && env.RESEND_API_URL ? env.RESEND_API_URL : RESEND_URL);
const fast = (env: Env) => testMode(env) && env.EMAIL_TEST_FAST === '1';
const iso = (ms: number) => new Date(ms).toISOString();
/** Firestore timestamps carry microseconds; compare them as milliseconds. */
const ms = (t: unknown) => Date.parse(String(t || '').replace(/(\.\d{3})\d+/, '$1'));
const money = (n: number) => `${n.toLocaleString('he-IL')} ₪`;
const PAID = new Set(['paid', 'paid_onsite']);

/** A UUID-shaped key (Brevo asks for one) that is the same for every attempt of one job. */
export async function idempotencyKey(jobId: string) {
  const h = await sha256hex('havat-ravve/payment-confirmation/' + jobId);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

type Stats = { enqueued: number; sent: number; failed: number; skipped: number; cancelled: number; retried: number; waiting: number; viaResend: number };

/** paused (the console's switch): payments are still queued, nothing is sent until the switch is off again. */
export async function runEmail(env: Env, nowMs = Date.now(), paused = false): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = { cron: 'email' };
  if (env.EMAIL_SELF_TEST === 'once') out.selfTest = await selfTest(env).catch((e) => 'error: ' + (e instanceof Error ? e.message : String(e)).slice(0, 120));
  if (env.EMAIL_SELF_TEST === 'resend-once') out.selfTest = await selfTestResend(env).catch((e) => 'error: ' + (e instanceof Error ? e.message : String(e)).slice(0, 120));
  if (!emailEnabled(env)) return { ...out, enabled: false };
  const fs = new Firestore(env);
  const stats: Stats = { enqueued: 0, sent: 0, failed: 0, skipped: 0, cancelled: 0, retried: 0, waiting: 0, viaResend: 0 };
  out.enabled = true;
  out.scan = await scan(fs, nowMs, stats);
  if (paused) return { ...out, paused: true, ...stats };
  const due = await sendDue(fs, env, nowMs, stats);
  // 4. broadcast lane, only on a run that had no payment confirmation to send: confirmations always go first and keep
  //    this run's subrequests; a failure here never touches them. The console's pause stops this lane too (above).
  if (!due) out.broadcasts = await sendBroadcastMail(fs, env, nowMs).catch((e) => ({ error: (e instanceof Error ? e.message : String(e)).slice(0, 120) }));
  return { ...out, ...stats };
}

// ---------- 1. scan settled payments ----------
type Cursors = { tickets: string; donations: string; tabs: string };
/** Where a full page ended, exactly: many payments can share one commit time (one order, a rush at the gate). */
type Page = { at: string; name: string };
type Candidate = { id: string; kind: JobKind; refId: string; uid: string; paidAt: string };

/** Settled after `since`; or, continuing a full page, strictly after the exact (paidAt, document) where it ended. */
async function paidSince(fs: Firestore, col: string, since: string, page?: Page): Promise<Doc[]> {
  return fs.query({
    from: [{ collectionId: col }],
    ...(page ? {} : { where: { fieldFilter: { field: { fieldPath: 'paidAt' }, op: 'GREATER_THAN', value: { timestampValue: since } } } }),
    orderBy: [{ field: { fieldPath: 'paidAt' }, direction: 'ASCENDING' }, { field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
    ...(page ? { startAt: { values: [{ timestampValue: page.at }, { referenceValue: page.name }], before: false } } : {}),
    limit: SCAN_LIMIT,
  });
}

async function scan(fs: Firestore, nowMs: number, stats: Stats): Promise<string> {
  const state = await fs.get(OUTBOX, STATE);
  const now = iso(nowMs);
  const last = state ? ms(state.data.lastRunAt) : NaN;
  if (!state || !(nowMs - last < GAP_MS)) {
    // first run, or a run after a long pause: payments settled before now are history and are never mailed
    const cursors: Cursors = { tickets: now, donations: now, tabs: now };
    const w = state ? fs.patch(OUTBOX, STATE, { cursors, pages: {}, lastRunAt: now, resetAt: now }, state.updateTime) : fs.create(OUTBOX, STATE, { cursors, pages: {}, lastRunAt: now, resetAt: now });
    await fs.commit([w]);
    return state ? 'reset after a pause' : 'started';
  }
  const cur = state.data.cursors as Cursors;
  const pages = (state.data.pages || {}) as Partial<Record<keyof Cursors, Page | null>>;
  const nextPages: Partial<Record<keyof Cursors, Page | null>> = {};
  // the overlap never reaches back past the moment mailing started: what was paid before that is history
  const floor = ms(state.data.resetAt) || 0;
  const next: Cursors = { ...cur };
  const found: Candidate[] = [];
  for (const col of ['tickets', 'donations', 'tabs'] as const) {
    const page = pages[col] || undefined;
    const docs = await paidSince(fs, col, iso(Math.max(ms(cur[col]) - OVERLAP_MS, floor)), page);
    // a full page continues next run right after its last document (no overlap, so it always moves forward);
    // a short page means everything up to (now - overlap) was seen
    const lastDoc = docs[docs.length - 1];
    nextPages[col] = docs.length === SCAN_LIMIT ? { at: String(lastDoc.data.paidAt), name: lastDoc.name } : null;
    next[col] = iso(docs.length === SCAN_LIMIT ? ms(lastDoc.data.paidAt) : Math.max(ms(cur[col]), nowMs - OVERLAP_MS));
    for (const d of docs) {
      const x = d.data;
      const paidAt = String(x.paidAt);
      if (col === 'tickets' && x.status === 'valid' && Number(x.price) > 0 && PAID.has(String(x.paymentStatus)) && x.orderId) found.push({ id: 'order_' + x.orderId, kind: 'order', refId: String(x.orderId), uid: String(x.ownerUid), paidAt });
      if (col === 'donations' && x.paymentStatus === 'paid' && Number(x.amount) > 0) found.push({ id: 'donation_' + d.id, kind: 'donation', refId: d.id, uid: String(x.uid), paidAt });
      if (col === 'tabs' && x.status === 'paid' && Number(x.total) > 0) found.push({ id: 'tab_' + d.id, kind: 'tab', refId: d.id, uid: String(x.guestUid), paidAt });
    }
  }
  const byId = new Map<string, Candidate>();
  for (const c of found) if (!byId.has(c.id) || ms(byId.get(c.id)!.paidAt) < ms(c.paidAt)) byId.set(c.id, c);
  const existing = new Map((byId.size ? await fs.getMany(OUTBOX, [...byId.keys()]) : []).map((d) => [d.id, d]));
  const writes: Write[] = [];
  for (const c of byId.values()) {
    const job = existing.get(c.id);
    if (!job) {
      writes.push(fs.create(OUTBOX, c.id, { kind: c.kind, col: SOURCE[c.kind], refId: c.refId, uid: c.uid, paidAt: c.paidAt, status: 'queued', attempts: 0, nextAt: iso(nowMs + GRACE_MS), createdAt: now, updatedAt: now }));
      stats.enqueued++;
    } else if (job.data.status === 'skipped' && job.data.reason === 'not_paid' && ms(c.paidAt) > ms(job.data.paidAt)) {
      // undone within the grace time, then settled again: confirm the new settle
      writes.push(fs.patch(OUTBOX, c.id, { paidAt: c.paidAt, status: 'queued', reason: null, attempts: 0, firstAttemptAt: null, nextAt: iso(nowMs + GRACE_MS), createdAt: now, updatedAt: now }, job.updateTime));
      stats.enqueued++;
    }
  }
  // jobs and the cursor move together: if another run raced this one, neither moves and the next run redoes it
  writes.push(fs.patch(OUTBOX, STATE, { cursors: next, pages: nextPages, lastRunAt: now }, state.updateTime));
  try { await fs.commit(writes); } catch (e) { stats.enqueued = 0; return 'scan raced: ' + (e instanceof Error ? e.message.slice(0, 80) : 'error'); }
  return 'ok';
}

// ---------- 2. send due jobs ----------
type Settlement = { status: 'send'; amount: number; purpose: string; event: string; name: string } | { status: 'manual' | 'not_paid' | 'wait' };

async function settlement(fs: Firestore, job: Doc, nowMs: number): Promise<Settlement> {
  const j = job.data;
  if (j.kind === 'order') {
    const tickets = (await whereEq(fs, 'tickets', { orderId: j.refId }, 50)).filter((t) => t.data.status === 'valid' && Number(t.data.price) > 0);
    if (tickets.some((t) => t.data.paymentConfirmation)) return { status: 'manual' };
    const paid = tickets.filter((t) => PAID.has(String(t.data.paymentStatus)));
    if (!paid.length) return { status: 'not_paid' };
    if (paid.length < tickets.length && nowMs - ms(j.createdAt) < ORDER_WAIT_MS) return { status: 'wait' };
    const t = paid[0].data;
    return { status: 'send', amount: paid.reduce((s, x) => s + Number(x.data.price), 0), purpose: `כרטיסים לאירוע ${t.eventTitle}`, event: String(t.eventTitle || ''), name: String(t.ownerName || '') };
  }
  const d = await fs.get(SOURCE[j.kind as JobKind], String(j.refId));
  if (!d) return { status: 'not_paid' };
  if (d.data.paymentConfirmation) return { status: 'manual' };
  if (j.kind === 'donation') return d.data.paymentStatus === 'paid' ? { status: 'send', amount: Number(d.data.amount), purpose: 'תרומה לחווה', event: '', name: String(d.data.name || '') } : { status: 'not_paid' };
  return d.data.status === 'paid' && Number(d.data.total) > 0
    ? { status: 'send', amount: Number(d.data.total), purpose: `חשבון הדוכן באירוע ${d.data.eventTitle}`, event: String(d.data.eventTitle || ''), name: String(d.data.guestName || '') }
    : { status: 'not_paid' };
}

/** Sends the due payment confirmations; returns how many were due (the broadcast lane waits for a run with none). */
async function sendDue(fs: Firestore, env: Env, nowMs: number, stats: Stats): Promise<number> {
  const now = iso(nowMs);
  const due = await fs.query({
    from: [{ collectionId: OUTBOX }],
    where: { compositeFilter: { op: 'AND', filters: [
      { fieldFilter: { field: { fieldPath: 'status' }, op: 'IN', value: { arrayValue: { values: [{ stringValue: 'queued' }, { stringValue: 'sending' }] } } } },
      { fieldFilter: { field: { fieldPath: 'nextAt' }, op: 'LESS_THAN_OR_EQUAL', value: { stringValue: fast(env) ? iso(nowMs + GRACE_MS) : now } } },
    ] } },
    orderBy: [{ field: { fieldPath: 'nextAt' }, direction: 'ASCENDING' }],
    limit: BATCH,
  });
  if (!due.length) return 0;
  const settings = (await fs.get('settings', 'app'))?.data;
  const template = String((settings?.templates as Record<string, unknown> | undefined)?.paymentConfirmation || '').trim() || DEFAULT_TEMPLATE;
  for (const job of due) {
    const attempts = Number(job.data.attempts || 0) + 1;
    const claimedAt = Date.now();
    const firstAttemptAt = String(job.data.firstAttemptAt || '') || iso(claimedAt);
    // the lease: only the run whose precondition holds may send this job, and only it may record the outcome
    let lease: string | undefined;
    try {
      const r = await fs.commit([fs.patch(OUTBOX, job.id, { status: 'sending', attempts, firstAttemptAt, nextAt: iso(claimedAt + LEASE_MS), updatedAt: iso(claimedAt) }, job.updateTime)]) as { writeResults?: { updateTime?: string }[] };
      lease = r?.writeResults?.[0]?.updateTime;
    } catch { continue; }
    const finish = (data: Record<string, unknown>) => fs.commit([fs.patch(OUTBOX, job.id, { ...data, updatedAt: iso(Date.now()) }, lease)]);
    try {
      // a lease that ran out (a run that died mid-send), or attempts that drifted past Brevo's deduplication
      // window: a resend could reach the guest twice, so the job goes to the managers instead
      if (attempts > MAX_ATTEMPTS || claimedAt - ms(firstAttemptAt) > SEND_WINDOW_MS) { await finish({ status: 'failed', reason: 'expired', nextAt: null }); stats.failed++; continue; }
      const s = await settlement(fs, job, nowMs);
      if (s.status === 'manual') { await finish({ status: 'cancelled', reason: 'manual', nextAt: null }); stats.cancelled++; continue; }
      if (s.status === 'not_paid') { await finish({ status: 'skipped', reason: 'not_paid', nextAt: null }); stats.skipped++; continue; }
      if (s.status !== 'send') { await finish({ status: 'queued', attempts: attempts - 1, firstAttemptAt: null, nextAt: iso(nowMs + (fast(env) ? 0 : 5 * 60_000)) }); stats.waiting++; continue; }
      // the guest's preference and address as they are now, not as they were at payment time
      const profile = (await fs.get('users', String(job.data.uid)))?.data;
      const pref = (profile?.fields as Record<string, unknown> | undefined)?.receiptPreference;
      const to = String(profile?.email || '').trim();
      if (pref !== 'email') { await finish({ status: 'skipped', reason: pref === 'whatsapp' ? 'whatsapp' : 'no_preference', nextAt: null }); stats.skipped++; continue; }
      if (!EMAIL_RE.test(to)) { await finish({ status: 'skipped', reason: 'no_address', nextAt: null }); stats.skipped++; continue; }
      const name = String(profile?.displayName || s.name);
      // no event (a donation): [אירוע] reads as the purpose, as in the app's preview, so "על [אירוע]" never reads "על ."
      const text = fill(template, { 'שם': name, 'סכום': money(s.amount), 'עבור': s.purpose, 'אירוע': s.event || s.purpose });
      const r = await deliver(env, job, attempts >= MAX_ATTEMPTS, { to, name, subject: SUBJECT, text, key: await idempotencyKey(job.id) });
      const via = { provider: r.provider, ...(r.failover ? { failover: r.failover } : {}) };
      if (r.ok) { await finish({ status: 'sent', to, messageId: r.messageId, amount: s.amount, sentAt: iso(Date.now()), nextAt: null, reason: r.duplicate ? 'duplicate_key' : null, ...via }); stats.sent++; if (r.provider === 'resend') stats.viaResend++; continue; }
      if (r.retry && attempts < MAX_ATTEMPTS) {
        const wait = fast(env) ? 0 : Math.max(RETRY_S, Math.min(r.retryAfter, RETRY_S)) * 1000;
        await finish({ status: 'queued', reason: r.reason, nextAt: iso(nowMs + wait), ...via }); stats.retried++; continue;
      }
      await finish({ status: 'failed', reason: r.reason, error: r.error, to, nextAt: null, ...via }); stats.failed++;
    } catch (e) {
      // our own read or write failed: the lease expires and a later run tries again (a sent mail is deduplicated by its key)
      console.log(JSON.stringify({ cron: 'email', job: job.id, internal: (e instanceof Error ? e.message : String(e)).slice(0, 200) }));
    }
  }
  return due.length;
}

// ---------- 4. broadcast lane: "לשלוח גם במייל" (app Q26) ----------
// The app queues email_outbox/bc_<broadcastId>_<uid> (kind 'broadcast', status 'queued', no nextAt, firestore.rules checks the
// shape and that the person is a recipient of the manager's own broadcast). This lane reads only those jobs, the broadcast
// they name and the recipient's profile, and sends the broadcast's text from the farm's sender through Brevo only:
//  - payment confirmations first: the lane runs only on a run that had none due, and those jobs never match its query
//    (the payment query needs nextAt, which these jobs never get);
//  - at most BROADCAST_DAILY mails a UTC day (counted in TOKEN_KV), and only while Brevo's own count stays under
//    brevoLimit - PAYMENT_RESERVE, so confirmations keep Brevo sends for the rest of the day and Resend (100 a day) untouched;
//    the app caps one message at the same 100 (src/app/v2/data/broadcast.ts EMAIL_CAP);
//  - a deleted broadcast, a person no longer a recipient, an opted-out person (for "all users"), or a job older than
//    BROADCAST_STALE_MS is skipped, never sent; a send is claimed once (lease) and never repeated after a crash.
const BROADCAST_DAILY = 100;
const PAYMENT_RESERVE = 100;
const BROADCAST_BATCH = 15;
const BROADCAST_STALE_MS = 12 * 3600_000;
const BROADCAST_SUBJECT = 'הודעה מחוות רווה';
const APP_URL = 'https://havat-ravve.web.app/app';
const bcDayKey = () => 'email-broadcast-count:' + new Date().toISOString().slice(0, 10);
async function kvCount(env: Env, key: string): Promise<number> {
  try { return env.TOKEN_KV ? Number(await env.TOKEN_KV.get(key)) || 0 : 0; } catch { return 0; }
}
async function kvAdd(env: Env, key: string, n: number) {
  try { if (env.TOKEN_KV && n > 0) await env.TOKEN_KV.put(key, String((await kvCount(env, key)) + n), { expirationTtl: 2 * 86400 }); } catch { /* KV unavailable */ }
}
/** How many broadcast mails this run may send now (0 when the day's share or Brevo's headroom is used up). */
export async function broadcastRoom(env: Env): Promise<number> {
  if (!brevoReady(env)) return 0;
  const left = Math.min(BROADCAST_DAILY - (await kvCount(env, bcDayKey())), brevoLimit(env) - PAYMENT_RESERVE - (await brevoUsed(env)));
  return Math.max(0, Math.min(BROADCAST_BATCH, left));
}
async function broadcastKey(jobId: string) {
  const h = await sha256hex('havat-ravve/broadcast/' + jobId);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
const firstWord = (s: string) => s.trim().split(/\s+/)[0] || s;
/** The mail: the message, who wrote it, and why the person got it (an update says how to stop). */
export function broadcastText(b: Record<string, unknown>) {
  const by = firstWord(String((b.by as Record<string, unknown> | undefined)?.name || ''));
  const why = b.audience === 'everyone' ? `קיבלת את המייל כי ביקשת לקבל עדכונים מהחווה. אפשר להפסיק בכל עת בפרטים שלך באפליקציה: ${APP_URL}`
    : b.audience === 'registrants' ? 'קיבלת את המייל כי נרשמת לאירוע בחווה.'
    : b.audience === 'vendors' ? 'קיבלת את המייל כי יש לך דוכן באירוע בחווה.' : 'זו הודעה לצוות החווה.';
  return `${String(b.text || '').trim()}\n\n${by ? by + ', ' : ''}${SENDER_NAME}\n\n${why}`;
}

async function sendBroadcastMail(fs: Firestore, env: Env, nowMs: number): Promise<Record<string, unknown>> {
  const room = await broadcastRoom(env);
  if (!room) return { room: 0 };
  const jobs = await fs.query({
    from: [{ collectionId: OUTBOX }],
    where: { compositeFilter: { op: 'AND', filters: [
      { fieldFilter: { field: { fieldPath: 'kind' }, op: 'EQUAL', value: { stringValue: 'broadcast' } } },
      { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'queued' } } },
    ] } },
    limit: room,
  });
  if (!jobs.length) return { room, jobs: 0 };
  // claim them all in one commit: if another run got any of them first, this run sends nothing
  const claimedAt = iso(Date.now());
  let leases: string[] = [];
  try {
    const r = await fs.commit(jobs.map((j) => fs.patch(OUTBOX, j.id, { status: 'sending', attempts: Number(j.data.attempts || 0) + 1, claimedAt }, j.updateTime))) as { writeResults?: { updateTime?: string }[] };
    leases = (r?.writeResults || []).map((w) => String(w.updateTime || ''));
  } catch { return { room, jobs: jobs.length, claimed: false }; }
  const broadcasts = new Map((await fs.getMany('broadcasts', [...new Set(jobs.map((j) => String(j.data.broadcastId || '')))].filter(Boolean))).map((d) => [d.id, d.data]));
  const people = new Map((await fs.getMany('users', [...new Set(jobs.map((j) => String(j.data.uid || '')))].filter(Boolean))).map((d) => [d.id, d.data]));
  const st = { sent: 0, skipped: 0, failed: 0, retried: 0 };
  const outcome: Write[] = [];
  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    const end = (data: Record<string, unknown>) => outcome.push(fs.patch(OUTBOX, job.id, { ...data, updatedAt: iso(Date.now()) }, leases[i] || undefined));
    const skip = (reason: string) => { end({ status: 'skipped', reason }); st.skipped++; };
    const b = broadcasts.get(String(job.data.broadcastId));
    const p = people.get(String(job.data.uid));
    const to = String(p?.email || '').trim();
    if (!b) { skip('deleted'); continue; }
    if (!(Array.isArray(b.recipients) && b.recipients.includes(job.data.uid))) { skip('not_recipient'); continue; }
    if (!(nowMs - ms(b.createdAt) < BROADCAST_STALE_MS)) { skip('stale'); continue; }
    if (!p || p.status !== 'active') { skip('no_profile'); continue; }
    if (b.audience === 'everyone' && p.updatesOptIn !== true) { skip('opted_out'); continue; }
    if (!EMAIL_RE.test(to)) { skip('no_address'); continue; }
    const attempts = Number(job.data.attempts || 0) + 1;
    const r = await brevoSend(env, { to, name: String(p.displayName || ''), subject: BROADCAST_SUBJECT, text: broadcastText(b), key: await broadcastKey(job.id), tag: 'broadcast' });
    if (r.ok) { end({ status: 'sent', to, messageId: r.messageId, sentAt: iso(Date.now()), reason: r.duplicate ? 'duplicate_key' : null, provider: 'brevo' }); st.sent++; continue; }
    if (r.retry && attempts < MAX_ATTEMPTS) { end({ status: 'queued', reason: r.reason }); st.retried++; continue; }
    end({ status: 'failed', reason: r.reason, error: r.error, to }); st.failed++;
  }
  // counted before the outcome commit: a lost commit leaves the jobs at 'sending' (never sent twice) and the count high (safe)
  if (st.sent) { await kvAdd(env, bcDayKey(), st.sent); await kvAdd(env, dayKey(), st.sent); }
  try { await fs.commit(outcome); } catch (e) { console.log(JSON.stringify({ cron: 'email', lane: 'broadcast', internal: (e instanceof Error ? e.message : String(e)).slice(0, 200) })); }
  return { room, jobs: jobs.length, ...st };
}

const fill =(t: string, vars: Record<string, string>) => Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`[${k}]`, v), t);
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function emailHtml(text: string) {
  const body = text.split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px">${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>`
    + `<body style="margin:0;padding:0;background:#f5f1e8"><div dir="rtl" lang="he" style="max-width:560px;margin:0 auto;padding:28px 20px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#2b2a26;text-align:right">`
    + body + `<p style="margin:24px 0 0;color:#7a7468;font-size:13px">${esc(SENDER_NAME)}</p></div></body></html>`;
}

type SendResult = { ok: true; messageId: string | null; duplicate: boolean } | { ok: false; retry: boolean; reason: string; error: string; retryAfter: number; quota?: boolean };
type Mail = { to: string; name: string; subject: string; text: string; key: string; /** Brevo tag; default payment-confirmation */ tag?: string };
type Delivered = SendResult & { provider: 'brevo' | 'resend'; failover?: string };

// ---------- which provider sends ----------
const dayKey = () => 'email-brevo-count:' + new Date().toISOString().slice(0, 10);
const brevoLimit = (env: Env) => Number(env.BREVO_DAILY_LIMIT) > 0 ? Number(env.BREVO_DAILY_LIMIT) : BREVO_DAILY_DEFAULT;
async function brevoUsed(env: Env): Promise<number> {
  try { return env.TOKEN_KV ? Number(await env.TOKEN_KV.get(dayKey())) || 0 : 0; } catch { return 0; }
}
async function countBrevo(env: Env) {
  // best effort: a lost count only means Brevo's own refusal moves the next send to Resend
  try { if (env.TOKEN_KV) await env.TOKEN_KV.put(dayKey(), String((await brevoUsed(env)) + 1), { expirationTtl: 2 * 86400 }); } catch { /* KV unavailable */ }
}

/**
 * Brevo first; Resend when Brevo is not configured, its daily allowance is used up, the job already moved to
 * Resend, or Brevo did not accept this send. A bad address is never retried elsewhere. An unanswered request
 * (Brevo may have accepted it) moves to Resend only on the last attempt, when the alternative is no email at all.
 */
async function deliver(env: Env, job: Doc, last: boolean, m: Mail): Promise<Delivered> {
  const resend = resendReady(env);
  // the last Brevo request went unanswered (it may have been accepted): stay on Brevo, whose key deduplicates, until the last attempt
  const pending = job.data.provider === 'brevo' && job.data.reason === 'provider_unreachable' && !last;
  if (resend && (job.data.provider === 'resend' || !brevoReady(env) || (!pending && (await brevoUsed(env)) >= brevoLimit(env)))) {
    return { ...(await resendSend(env, m)), provider: 'resend', ...(job.data.provider === 'resend' ? {} : { failover: brevoReady(env) ? 'brevo_daily_limit' : 'brevo_not_configured' }) };
  }
  const r = await brevoSend(env, m);
  if (r.ok) { await countBrevo(env); return { ...r, provider: 'brevo' }; }
  const refused = r.reason !== 'provider_unreachable' && (r.reason !== 'rejected' || !!r.quota);
  if (resend && (refused || (r.reason === 'provider_unreachable' && last))) return { ...(await resendSend(env, m)), provider: 'resend', failover: 'brevo_' + r.reason };
  return { ...r, provider: 'brevo' };
}

async function brevoSend(env: Env, m: Mail): Promise<SendResult> {
  let res: Response;
  try {
    res = await fetch(brevoUrl(env), {
      method: 'POST',
      headers: { 'api-key': env.BREVO_API_KEY!, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { name: SENDER_NAME, email: env.BREVO_SENDER_EMAIL },
        to: [{ email: m.to, name: m.name }],
        subject: m.subject, htmlContent: emailHtml(m.text), textContent: m.text,
        headers: { idempotencyKey: m.key }, tags: [m.tag || 'payment-confirmation'],
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    return { ok: false, retry: true, reason: 'provider_unreachable', error: (e instanceof Error ? e.name : 'error').slice(0, 60), retryAfter: 0 };
  }
  let j: { messageId?: string; code?: string; message?: string } = {};
  try { j = await res.json(); } catch { /* empty or not json */ }
  if (res.ok) return { ok: true, messageId: j.messageId || null, duplicate: false };
  // the same key inside Brevo's window: this mail was already accepted once
  if (res.status === 400 && j.code === 'duplicate_parameter') return { ok: true, messageId: null, duplicate: true };
  const error = `${res.status} ${j.code || ''} ${(j.message || '').slice(0, 160)}`.trim();
  if (res.status === 429) return { ok: false, retry: true, reason: 'rate_limited', error, retryAfter: Number(res.headers.get('retry-after')) || 0 };
  if (res.status >= 500) return { ok: false, retry: true, reason: 'provider_error', error, retryAfter: 0 };
  // out of credits, or a sending limit reached: not the guest's address
  const quota = res.status === 402 || /credit|limit|quota/i.test(`${j.code || ''} ${j.message || ''}`);
  return { ok: false, retry: false, reason: res.status === 401 || res.status === 403 ? 'provider_auth' : quota ? 'quota' : 'rejected', error, retryAfter: 0, quota };
}

/** Resend (https://resend.com/docs/api-reference/emails/send-email): same message, same idempotency key (kept 24 hours). */
async function resendSend(env: Env, m: Mail): Promise<SendResult> {
  let res: Response;
  try {
    res = await fetch(resendUrl(env), {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json', 'idempotency-key': m.key },
      body: JSON.stringify({
        from: `${SENDER_NAME} <${env.RESEND_SENDER_EMAIL}>`,
        to: [m.to], subject: m.subject, html: emailHtml(m.text), text: m.text,
        tags: [{ name: 'category', value: 'payment-confirmation' }],
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    return { ok: false, retry: true, reason: 'provider_unreachable', error: 'resend ' + (e instanceof Error ? e.name : 'error').slice(0, 60), retryAfter: 0 };
  }
  let j: { id?: string; name?: string; message?: string } = {};
  try { j = await res.json(); } catch { /* empty or not json */ }
  if (res.ok) return { ok: true, messageId: j.id ? 'resend:' + j.id : null, duplicate: false };
  const error = `resend ${res.status} ${j.name || ''} ${(j.message || '').slice(0, 160)}`.trim();
  // the same key with the same body was already sent; another request with this key is still in flight
  if (res.status === 409 && j.name === 'concurrent_idempotent_requests') return { ok: false, retry: true, reason: 'provider_busy', error, retryAfter: 0 };
  if (res.status === 429) return { ok: false, retry: true, reason: /quota/.test(j.name || '') ? 'quota' : 'rate_limited', error, retryAfter: Number(res.headers.get('retry-after')) || 0 };
  if (res.status >= 500) return { ok: false, retry: true, reason: 'provider_error', error, retryAfter: 0 };
  return { ok: false, retry: false, reason: res.status === 401 || res.status === 403 ? 'provider_auth' : 'rejected', error, retryAfter: 0 };
}

// ---------- one sample email to the sender address itself ----------
const RESEND_SELF_TEST_KEY = 'email-self-test-resend-v1';
/** EMAIL_SELF_TEST="resend-once": one sample through Resend to RESEND_SENDER_EMAIL, guarded in TOKEN_KV. No Firestore. */
async function selfTestResend(env: Env): Promise<string> {
  if (!resendReady(env)) return 'skipped: Resend secrets missing';
  if (!env.TOKEN_KV) return 'skipped: no TOKEN_KV binding';
  if (await env.TOKEN_KV.get(RESEND_SELF_TEST_KEY)) return 'already done';
  await env.TOKEN_KV.put(RESEND_SELF_TEST_KEY, JSON.stringify({ state: 'sending', at: iso(Date.now()) }));
  const text = fill(DEFAULT_TEMPLATE, { 'שם': 'בדיקת מערכת', 'סכום': money(1), 'עבור': 'בדיקת שליחה דרך Resend', 'אירוע': '' });
  const r = await resendSend(env, { to: env.RESEND_SENDER_EMAIL!, name: SENDER_NAME, subject: '[בדיקה] ' + SUBJECT, text, key: await idempotencyKey('self-test-resend-v1') });
  await env.TOKEN_KV.put(RESEND_SELF_TEST_KEY, JSON.stringify(r.ok ? { state: 'sent', messageId: r.messageId, at: iso(Date.now()) } : { state: 'failed', error: r.error, at: iso(Date.now()) }));
  return r.ok ? 'sent ' + r.messageId : 'failed ' + r.error;
}

/** Sends exactly one sample confirmation to BREVO_SENDER_EMAIL, guarded in TOKEN_KV. Reads and writes no Firestore data. */
async function selfTest(env: Env): Promise<string> {
  if (!env.BREVO_API_KEY || !env.BREVO_SENDER_EMAIL) return 'skipped: Brevo secrets missing';
  if (!env.TOKEN_KV) return 'skipped: no TOKEN_KV binding';
  if (await env.TOKEN_KV.get(SELF_TEST_KEY)) return 'already done';
  await env.TOKEN_KV.put(SELF_TEST_KEY, JSON.stringify({ state: 'sending', at: iso(Date.now()) }));
  const text = fill(DEFAULT_TEMPLATE, { 'שם': 'בדיקת מערכת', 'סכום': money(1), 'עבור': 'בדיקת שליחה אוטומטית', 'אירוע': '' });
  const r = await brevoSend(env, { to: env.BREVO_SENDER_EMAIL, name: SENDER_NAME, subject: '[בדיקה] ' + SUBJECT, text, key: await idempotencyKey('self-test-v1') });
  const result = r.ok ? { state: 'sent', messageId: r.messageId, at: iso(Date.now()) } : { state: 'failed', error: r.error, at: iso(Date.now()) };
  await env.TOKEN_KV.put(SELF_TEST_KEY, JSON.stringify(result));
  return r.ok ? 'sent ' + (r.messageId || '(duplicate key)') : 'failed ' + r.error;
}
