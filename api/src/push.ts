// Phone push: drains push_jobs (written by the app's notify(), src/app/v2/data/notify.ts) on the 5-minute cron.
// The in-app notification (users/{uid}/notifications) is the source of truth; a push is a best-effort copy.
//
// One switch, the Worker variable PUSH_MODE:
//   unset     nothing runs and nothing is read (today's production)
//   "off"     publishes settings/push = { mode: 'off' } once, so the app stops offering push; no jobs are read
//   "webpush" standard Web Push with VAPID (needs VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT)
//   "fcm"     Firebase Cloud Messaging HTTP v1 (needs FCM_VAPID_KEY and a service account with the FCM role)
// The mode and the PUBLIC keys are published to settings/push (world-readable) when they change; the app reads them
// to subscribe in the right mode. Private keys never leave the Worker. docs/push-setup.md has the steps.
//
// Each run is bounded for the Workers Free plan (50 subrequests per invocation, shared with email and accounts):
// BUDGET counts every Firestore call and every send. A job is claimed with an updateTime precondition (the lease),
// sent recipient by recipient from its cursor, and its progress is committed under that lease, so two runs never
// send the same job and a big job continues on the next run. sentAt is set when the last recipient is done.
// If a run dies between sending and recording, the next run may send that slice again; every push carries the
// job's tag (b_<id> for a broadcast), so the phone replaces the copy instead of showing two.
import { type Doc, type Env, Firestore } from './firestore';
import { allowedEndpoint, sendWebPush, type Vapid } from './webpush';
import { type FcmEnv, fcmConfigured, sendFcm } from './fcm';

export type PushEnv = Env & FcmEnv & {
  PUSH_MODE?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  /** "mailto:someone@…" or an https URL: who the push services contact about this sender. */
  VAPID_SUBJECT?: string;
  /** The Web Push certificate public key from the Firebase console (Cloud Messaging), for the app's getToken(). */
  FCM_VAPID_KEY?: string;
  /** Test mode only: comma-separated host:port of a local mock push service. */
  PUSH_TEST_HOSTS?: string;
};

export const JOBS = 'push_jobs';
const BUDGET = 30;
const QUERY_LIMIT = 10;
const USERS_PER_READ = 50;
const MAX_DEVICES = 6; // the app keeps at most 6 (push.ts saveDevice)
const LEASE_MS = 4 * 60_000;
/** A push about something older than this is noise on a lock screen: the in-app notification is enough. */
const STALE_MS = 6 * 3600_000;
const KINDS = new Set(['broadcast', 'task', 'urgent', 'trip', 'event', 'vendor', 'system']);
const TEAM = new Set(['owner', 'manager', 'staff']);
const MANAGERS = new Set(['owner', 'manager']);
/** Job kind -> the preference a person turns on or off (C1 "מה לקבל"); null = always comes. Same as the app's prefOf. */
const prefOf = (kind: string) => (kind === 'vendor' ? 'event' : kind === 'system' ? null : kind);

type Mode = 'off' | 'webpush' | 'fcm';
type Device = { id?: string; kind?: string; endpoint?: string; keys?: { p256dh?: string; auth?: string }; token?: string };
type Prefs = { enabled?: boolean; kinds?: string[]; devices?: Device[] } & Record<string, unknown>;
type Stats = { jobs: number; done: number; delivered: number; failed: number; removed: number; skipped: number; calls: number };

const testMode = (env: PushEnv) => !!env.FIRESTORE_EMULATOR_HOST && env.TEST_FAULTS === '1';
const iso = (ms: number) => new Date(ms).toISOString();
const ms = (t: unknown) => Date.parse(String(t || '').replace(/(\.\d{3})\d+/, '$1'));
const clip = (s: unknown, n: number) => String(s ?? '').slice(0, n);
/** Only an in-app path ever goes into a push ("/tasks/abc"); anything else opens the app's first screen. */
const appLink = (l: unknown) => (typeof l === 'string' && /^\/(?!\/)[\w\-./?=&%#]*$/.test(l) ? l.slice(0, 200) : '/');

/** The mode actually in force: a mode whose keys are missing is reported and treated as off. */
export function pushMode(env: PushEnv): { mode: Mode; missing?: string } {
  const want = (env.PUSH_MODE || '').trim();
  if (want === 'webpush') return env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && /^(mailto:|https:)/.test(env.VAPID_SUBJECT || '') ? { mode: 'webpush' } : { mode: 'off', missing: 'VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY or VAPID_SUBJECT' };
  if (want === 'fcm') return fcmConfigured(env) && env.FCM_VAPID_KEY ? { mode: 'fcm' } : { mode: 'off', missing: 'FCM_VAPID_KEY or a service account' };
  return { mode: 'off' };
}

/** What this isolate last saw in settings/push, so a warm isolate does not read it every run. */
let published = '';

async function publish(fs: Firestore, env: PushEnv, mode: Mode, now: string, st: Stats): Promise<string> {
  const want = { mode, vapidPublicKey: mode === 'webpush' ? env.VAPID_PUBLIC_KEY || '' : '', fcmVapidKey: mode === 'fcm' ? env.FCM_VAPID_KEY || '' : '' };
  const sig = JSON.stringify(want);
  if (published === sig) return 'same';
  st.calls++;
  const cur = await fs.get('settings', 'push');
  const d = cur?.data || {};
  if (cur && d.mode === want.mode && (d.vapidPublicKey || '') === want.vapidPublicKey && (d.fcmVapidKey || '') === want.fcmVapidKey) { published = sig; return 'same'; }
  st.calls++;
  await fs.commit([fs.set('settings', 'push', { ...want, updatedAt: now })]);
  published = sig;
  return 'published';
}

export async function runPush(env: PushEnv, nowMs = Date.now()): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = { cron: 'push' };
  if (!(env.PUSH_MODE || '').trim()) return { ...out, mode: 'unset' };
  const { mode, missing } = pushMode(env);
  const st: Stats = { jobs: 0, done: 0, delivered: 0, failed: 0, removed: 0, skipped: 0, calls: 0 };
  const fs = new Firestore(env);
  const now = iso(nowMs);
  out.mode = mode;
  if (missing) out.missing = missing;
  out.settings = await publish(fs, env, mode, now, st);
  if (mode === 'off') return { ...out, calls: st.calls };

  st.calls++;
  const jobs = (await fs.query({ from: [{ collectionId: JOBS }], where: { unaryFilter: { op: 'IS_NULL', field: { fieldPath: 'sentAt' } } }, limit: QUERY_LIMIT }))
    .sort((a, b) => ms(a.data.createdAt) - ms(b.data.createdAt) || a.id.localeCompare(b.id));
  const sender = makeSender(env, mode);
  for (const job of jobs) {
    // a job needs at least: the lease, one read, one send and the progress commit
    if (BUDGET - st.calls < 4) break;
    if (ms(job.data.leaseUntil) > nowMs) continue; // another run holds it
    st.jobs++;
    await drainJob(fs, job, sender, nowMs, st);
  }
  return { ...out, ...st };
}

// ---------- one job ----------
type Sender = (d: Device, payload: Payload) => Promise<{ ok: boolean; gone: boolean; status: number } | null>;
type Payload = { title: string; body: string; link: string; tag: string; urgent: boolean; ttl: number };

function makeSender(env: PushEnv, mode: Mode): Sender {
  const testHosts = testMode(env) ? (env.PUSH_TEST_HOSTS || '').split(',').map((s) => s.trim()).filter(Boolean) : [];
  if (mode === 'webpush') {
    const vapid: Vapid = { publicKey: env.VAPID_PUBLIC_KEY!, privateKey: env.VAPID_PRIVATE_KEY!, subject: env.VAPID_SUBJECT! };
    return async (d, p) => {
      if (d.kind !== 'webpush' || !d.endpoint || !d.keys?.p256dh || !d.keys?.auth) return null;
      if (!allowedEndpoint(d.endpoint, testHosts)) return { ok: false, gone: true, status: 0 }; // not a push service we know: drop it
      try {
        return await sendWebPush({ endpoint: d.endpoint, keys: { p256dh: d.keys.p256dh, auth: d.keys.auth } }, { title: p.title, body: p.body, link: p.link, tag: p.tag, urgent: p.urgent }, vapid, { ttl: p.ttl, urgency: p.urgent ? 'high' : 'normal', topic: p.tag });
      } catch { return { ok: false, gone: true, status: 0 }; } // malformed keys: the subscription can never work
    };
  }
  const urls = testMode(env) ? { api: env.FCM_API_URL, token: env.GOOGLE_TOKEN_URL } : {};
  return async (d, p) => {
    if (d.kind !== 'fcm' || !d.token || d.token.length > 4096) return null;
    return sendFcm(env, d.token, p, urls);
  };
}

async function drainJob(fs: Firestore, job: Doc, send: Sender, nowMs: number, st: Stats) {
  const j = job.data;
  const kind = String(j.kind || '');
  const to = (Array.isArray(j.to) ? j.to : []).map(String).slice(0, 500);
  const by = (j.createdBy || {}) as { uid?: string };
  const finishNow = async (reason: string) => {
    st.calls++;
    st.skipped++;
    await fs.commit([fs.patch(JOBS, job.id, { sentAt: iso(nowMs), outcome: reason, leaseUntil: null }, job.updateTime)]).catch(() => {});
  };
  if (!KINDS.has(kind) || !by.uid || !to.length) return finishNow('invalid');
  if (!(nowMs - ms(j.createdAt) < STALE_MS)) return finishNow('stale');

  // the lease
  st.calls++;
  let lease: string | undefined;
  try {
    const r = (await fs.commit([fs.patch(JOBS, job.id, { leaseUntil: iso(nowMs + LEASE_MS), attempts: Number(j.attempts || 0) + 1 }, job.updateTime)])) as { writeResults?: { updateTime?: string }[] };
    lease = r?.writeResults?.[0]?.updateTime;
  } catch { return; } // another run claimed it first
  if (!lease) return;

  const cursor = Math.max(0, Math.min(to.length, Number(j.cursor || 0)));
  const slice = to.slice(cursor, cursor + USERS_PER_READ);
  st.calls++;
  const users = new Map((await fs.getMany('users', [...new Set([by.uid, ...slice])])).map((d) => [d.id, d]));

  // the sender must be an active team member (a vendor only for 'vendor' requests); broadcasts and system pushes need a manager
  const creator = users.get(by.uid)?.data;
  const role = String(creator?.role || '');
  const active = creator?.status === 'active';
  // the server's own alerts to the owners (monitor.ts) have no profile: they are sent by the Worker itself
  const fromServer = by.uid === 'server' && kind === 'system';
  const allowed = fromServer || (active && (TEAM.has(role) ? (kind === 'broadcast' || kind === 'system' ? MANAGERS.has(role) : true) : role === 'vendor' && kind === 'vendor'));
  if (!allowed) {
    st.calls++; st.skipped++;
    await fs.commit([fs.patch(JOBS, job.id, { sentAt: iso(nowMs), outcome: 'refused', leaseUntil: null }, lease)]).catch(() => {});
    return;
  }

  const payload: Payload = {
    title: clip(j.title, 80) || 'חוות רווה', body: clip(j.body, 180), link: appLink(j.link),
    tag: clip(j.tag || job.id, 64), urgent: j.urgent === true || kind === 'urgent',
    ttl: Math.max(60, Math.floor((STALE_MS - (nowMs - ms(j.createdAt))) / 1000)),
  };
  const pref = prefOf(kind);
  const gone = new Map<string, { doc: Doc; prefs: Prefs; drop: Set<number> }>();
  let next = cursor;
  let delivered = 0, failed = 0;
  for (const uid of slice) {
    const u = users.get(uid);
    const p = (u?.data.push || {}) as Prefs;
    const rrole = String(u?.data.role || '');
    // who may receive: active people; a vendor only broadcasts (their event's) and nothing from another vendor
    const receives = !!u && u.data.status === 'active' && (TEAM.has(rrole) ? (role !== 'vendor' || MANAGERS.has(rrole)) : rrole === 'vendor' && kind === 'broadcast')
      && p.enabled === true && (!pref || !Array.isArray(p.kinds) || p.kinds.includes(pref)) && uid !== by.uid;
    const devices = receives && Array.isArray(p.devices) ? p.devices.slice(0, MAX_DEVICES) : [];
    // keep one call for the progress commit and one for a possible cleanup
    if (BUDGET - st.calls - 2 < devices.length) break;
    for (let i = 0; i < devices.length; i++) {
      const r = await send(devices[i], payload);
      if (!r) continue; // a device of the other mode
      st.calls++;
      if (r.ok) delivered++;
      else {
        failed++;
        if (r.gone) {
          const g = gone.get(uid) || { doc: u!, prefs: p, drop: new Set<number>() };
          g.drop.add(i); gone.set(uid, g);
        }
      }
    }
    next++;
  }
  const done = next >= to.length;
  st.delivered += delivered; st.failed += failed;
  st.calls++;
  try {
    await fs.commit([fs.patch(JOBS, job.id, {
      cursor: next, delivered: Number(j.delivered || 0) + delivered, failed: Number(j.failed || 0) + failed,
      leaseUntil: null, sentAt: done ? iso(nowMs) : null, ...(done ? { outcome: 'sent' } : {}),
    }, lease)]);
    if (done) st.done++;
  } catch { /* the lease ran out under a slow run: the next run continues from the last recorded cursor */ }

  // expired subscriptions: removed only if the person's document did not change since it was read
  for (const [uid, g] of gone) {
    if (BUDGET - st.calls < 1) break;
    st.calls++;
    const devices = (g.prefs.devices || []).filter((_, i) => !g.drop.has(i));
    try { await fs.commit([fs.patch('users', uid, { push: { ...g.prefs, devices } }, g.doc.updateTime)]); st.removed += g.drop.size; }
    catch { /* changed meanwhile (a new subscription): the next failed send removes it */ }
  }
}
