// Havat Ravve API: a thin gateway between a personal assistant and the farm's Firestore.
// Stage 1 is synthetic only: synthetic actors, emulator or a separate test project, never production.
import { CATALOG, CATALOG_VERSION } from './catalog';
import { authenticate } from './auth';
import { ApiError, type Meta, fail, ok } from './http';
import { type Env, Firestore, toApiError } from './firestore';
import { addShopping, assignTask, completeTask, createTask, getTask, listShopping, listTasks, reopenTask, searchPeople, setBought } from './ops';
import { autoId, validate } from './util';
import { getResource, listResource, matchResource } from './resources';
import { WRITE_DEFS } from './writes';
import { getSettings, overview } from './overview';
import { whoami } from './whoami';
import { listFailures, recordFailure } from './failures';
import { type Scope, requireScope } from './auth';
import { runAccountDeletions } from './accounts';
import { runEmail } from './email';
import { pushQueueState, runPush } from './push';
import { handleFiles, isFilesPath } from './files';
import { type Audit, auditDoc, keyLabel, writeAudit } from './audit';
import { consoleCaller, consoleCors, consoleOpAt, consoleRoute, isConsolePath } from './console';
import { CRON_GROUPS, type CronGroup, type JobRun, type MonitorState, addRound, backupTurn, cronGap, monitorStep, readGroups, readMonitorStrict, recordCron, roundOf, saveGroup } from './monitor';
import { meter } from './meter';
import { guardKeys, readSwitches, runCleanup } from './control';
import { storedKeys } from './keys';
import { pruneBackups, runBackup, trashFor } from './backup';
import { handleHit } from './traffic';

const MAX_BODY = 16 * 1024;

const WRITES: Record<string, typeof createTask> = {
  'tasks.create': createTask, 'tasks.assign': assignTask, 'tasks.complete': completeTask, 'tasks.reopen': reopenTask,
  'shopping.add': addShopping, 'shopping.setBought': setBought,
};

async function readBody(req: Request): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (text.length > MAX_BODY) throw new ApiError('VALIDATION_FAILED', 'body too large', { field: 'body' });
  if (!text) return {};
  let v: unknown;
  try { v = JSON.parse(text); } catch { throw new ApiError('VALIDATION_FAILED', 'body is not valid JSON', { field: 'body' }); }
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new ApiError('VALIDATION_FAILED', 'body must be a JSON object', { field: 'body' });
  return v as Record<string, unknown>;
}

function faultsOf(req: Request, env: Env): Set<string> {
  if (env.TEST_FAULTS !== '1' || !env.FIRESTORE_EMULATOR_HOST) return new Set();
  return new Set((req.headers.get('x-test-fault') || '').split(',').map((s) => s.trim()).filter(Boolean));
}

async function route(req: Request, env: Env, url: URL, log: Record<string, unknown>, audit: Audit): Promise<{ status?: number; data: unknown; raw?: Response }> {
  let path = url.pathname.replace(/\/+$/, '') || '/';
  const m = req.method;

  if (m === 'GET' && path === '/v1/health') return { data: { status: 'ok', catalogVersion: CATALOG_VERSION } };
  if (m === 'GET' && path === '/v1/catalog') return { data: CATALOG };

  const fs = new Firestore(env, faultsOf(req, env));
  try {
    // a real person's role and name come from their profile in the app
    let caller;
    const consoleSub = isConsolePath(path) ? path.slice('/v1/console'.length) || '/' : null;
    try {
      // the owners' console signs in with Google (console.ts); everyone else with an API key, from the secret or the console's keys in KV
      caller = consoleSub !== null ? await consoleCaller(req, env, fs) : await authenticate(req, env.API_CREDENTIALS, async (uid) => (await fs.get('users', uid))?.data ?? null, await storedKeys(env));
    } catch (e) {
      // many failed authentications from one address: slow it down
      // (a Google account that is not an owner, knocking on the console, counts too: each try costs a read)
      if (e instanceof ApiError && (e.code === 'UNAUTHENTICATED' || (e.code === 'FORBIDDEN' && consoleSub !== null)) && env.AUTH_LIMITER) {
        const ip = req.headers.get('cf-connecting-ip') || 'local';
        if (!(await env.AUTH_LIMITER.limit({ key: 'auth:' + ip })).success) throw new ApiError('RATE_LIMITED', 'too many failed authentications', {}, { 'retry-after': '60' });
      }
      throw e;
    }
    log.actor = caller.actor.id;
    log.credential = caller.credentialId;
    audit.credential = caller.credentialId;
    audit.actor = { id: caller.actor.id, role: caller.actor.role, uid: caller.actor.person.uid, name: caller.actor.person.name };
    // the app's activity lines written through the API say which key did it
    audit.label = caller.label;
    fs.via = { credential: caller.credentialId, label: keyLabel(env, caller.credentialId, caller.actor.person.name, caller.label) };
    // the recycle bin (backup.ts): whatever this request deletes is kept for 30 days, with who deleted it
    fs.trash = trashFor(env, { credential: caller.credentialId, label: fs.via.label, name: caller.actor.person.name, requestId: String(log.requestId) });
    if (caller.keyVersion === 'previous') log.keyVersion = 'previous'; // shows when a client still uses a rotated key
    // one key in a loop (a confused assistant) must not burn the farm's daily Firestore quota
    if (env.RATE_LIMITER && !(await env.RATE_LIMITER.limit({ key: 'cred:' + caller.credentialId + (consoleSub !== null ? ':' + caller.actor.person.uid : '') })).success) {
      throw new ApiError('RATE_LIMITED', 'too many requests for this key', { credential: caller.credentialId }, { 'retry-after': '60' });
    }
    // the owners' switches (control.ts): every key stopped, or read-only; the console itself is never stopped
    if (consoleSub === null) await guardKeys(env, m);
    if (consoleSub !== null) {
      if (!consoleSub.startsWith('/api/')) {
        audit.op = consoleOpAt(m, consoleSub) || undefined;
        const c = await consoleRoute(req, env, consoleSub, caller, fs, () => readBody(req));
        log.op = c.op.name; audit.op = c.op.name; audit.body = c.logBody as Record<string, unknown> | undefined; audit.result = c.logResult ?? c.data;
        return { status: c.status, data: c.data, raw: c.raw };
      }
      // any API operation, as the signed-in owner
      path = '/v1' + consoleSub.slice('/api'.length);
      audit.path = path;
    }
    if (m === 'GET' && path === '/v1/system/failures') return { data: await listFailures(fs, caller, url.searchParams) };
    if (m === 'GET' && path === '/v1/tasks') return { data: await listTasks(fs, caller, url.searchParams) };
    const one = /^\/v1\/tasks\/([^/]+)$/.exec(path);
    if (m === 'GET' && one) { if ([...url.searchParams].length) throw new ApiError('VALIDATION_FAILED', 'tasks.get takes no query parameters', { field: [...url.searchParams.keys()][0] }); return { data: await getTask(fs, caller, decodeURIComponent(one[1])) }; }
    if (m === 'GET' && path === '/v1/people') return { data: await searchPeople(fs, caller, url.searchParams) };
    if (m === 'GET' && path === '/v1/shopping') return { data: await listShopping(fs, caller, url.searchParams) };
    if (m === 'GET' && path === '/v1/me') return { data: whoami(caller, url.searchParams) };
    if (m === 'GET' && path === '/v1/overview') return { data: await overview(fs, caller, url.searchParams) };
    if (m === 'GET' && path === '/v1/settings') return { data: await getSettings(fs, caller) };
    if (m === 'GET') {
      const res = matchResource(path);
      if (res) {
        if (res.id === null) return { data: await listResource(fs, caller, res.r, res.parentId, url.searchParams) };
        if ([...url.searchParams].length) throw new ApiError('VALIDATION_FAILED', `${res.r.name}.get takes no query parameters`, { field: [...url.searchParams.keys()][0] });
        return { data: await getResource(fs, caller, res.r, res.parentId, res.id) };
      }
    }
    const action = /^\/v1\/actions\/([A-Za-z.]+)$/.exec(path);
    if (m === 'POST' && action) {
      const key = req.headers.get('idempotency-key');
      const body = await readBody(req);
      log.op = action[1];
      audit.op = action[1]; audit.body = body; audit.idempotencyKey = key;
      let r: Awaited<ReturnType<typeof createTask>>;
      if (Object.hasOwn(WRITES, action[1])) r = await WRITES[action[1]](fs, caller, body, key);
      else {
        const d = WRITE_DEFS.find((x) => x.op.name === action[1]);
        if (!d) throw new ApiError('NOT_FOUND', `no such operation: ${action[1]}`);
        if (!d.op.alternativeScopes?.some((scope) => caller.scopes.has(scope as Scope))) requireScope(caller, d.op.requiredScope as Scope);
        r = await d.run(fs, caller, validate(d.op.body!, body), key);
      }
      log.replayed = r.replayed;
      audit.replayed = r.replayed; audit.result = r.data;
      const push = Number(r.data.queued) > 0 ? { pushState: pushQueueState(env, (await readSwitches(env)).pushPaused) } : {};
      return { status: r.status, data: { ...r.data, ...push, replayed: r.replayed } };
    }
    throw new ApiError('NOT_FOUND', `no route for ${m} ${path}`);
  } finally {
    log.token = fs.tokenSource;
  }
}

/** Which of the three runs this is: by its cron expression, else by the minute it was scheduled for (0 send, 1 people, 2 upkeep). */
function cronGroup(event: { cron?: string; scheduledTime?: number } | undefined): CronGroup {
  const norm = (c: string) => c.trim().replace(/\s+/g, ' ');
  const byCron = (Object.keys(CRON_GROUPS) as CronGroup[]).find((g) => event?.cron && norm(CRON_GROUPS[g]) === norm(event.cron));
  if (byCron) return byCron;
  const minute = new Date(event?.scheduledTime || Date.now()).getUTCMinutes() % 5;
  return minute === 1 ? 'people' : minute === 2 ? 'upkeep' : 'send';
}

/** True once a minute per key in this isolate: a flood of refused requests records one failure a minute, not one each. */
const failSeen = new Map<string, number>();
function firstThisMinute(key: string): boolean {
  const minute = Math.floor(Date.now() / 60_000);
  if (failSeen.get(key) === minute) return false;
  if (failSeen.size > 500) failSeen.clear();
  failSeen.set(key, minute);
  return true;
}

/** A job's result for the console, small: numbers, booleans and short strings only (never addresses or ids lists). */
function brief(r: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) {
    if (k === 'cron' || k === 'wallMs') continue;
    if (typeof v === 'number' || typeof v === 'boolean') out[k] = v;
    else if (typeof v === 'string') out[k] = v.slice(0, 80);
    else if (v && typeof v === 'object' && !Array.isArray(v)) out[k] = JSON.stringify(v).slice(0, 80);
    if (Object.keys(out).length >= 12) break;
  }
  return out;
}

export default {
  async fetch(req: Request, env: Env, ctx?: { waitUntil(p: Promise<unknown>): void }): Promise<Response> {
    const meta: Meta = { requestId: 'req_' + autoId(16), started: Date.now() };
    const url = new URL(req.url);
    // the app's images and event files (R2): its own sign-in and CORS, apart from the assistant API below
    if (isFilesPath(url.pathname)) return handleFiles(req, env, url, meta);
    // the site's and the app's visit counter (traffic.ts): public, no sign-in, counters only, always 204
    if (url.pathname === '/v1/hit') return handleHit(req, env, () => new Firestore(env, faultsOf(req, env)));
    const consolePath = isConsolePath(url.pathname);
    if (consolePath && req.method === 'OPTIONS') return new Response(null, { status: 204, headers: consoleCors(req) });
    const log: Record<string, unknown> = { requestId: meta.requestId, method: req.method, path: url.pathname };
    const audit: Audit = {};
    let res: Response;
    let error: ApiError | undefined;
    try {
      const r = await route(req, env, url, log, audit);
      if (req.method === 'GET') audit.result = r.data;
      if (log.credential) meta.keyVersion = log.keyVersion === 'previous' ? 'previous' : 'current';
      res = r.raw || ok(meta, r.data, r.status ?? 200);
    } catch (e) {
      const err = toApiError(e);
      if (!(e instanceof ApiError)) log.internal = e instanceof Error ? e.message.slice(0, 600) : String(e);
      log.code = err.code;
      error = err;
      res = fail(meta, err);
    }
    if (consolePath) for (const [k, v] of Object.entries(consoleCors(req))) res.headers.set(k, v);
    // one structured line per request, for `wrangler tail`; never contains keys, tokens or bodies
    log.status = res.status;
    log.wallMs = Date.now() - meta.started;
    console.log(JSON.stringify(log));
    // failures worth an alert are kept in Firestore (best effort, after the response) for system.failures
    // the owners' assistant log: every request of a recognised key, its body and answer (best effort, after the response)
    const doc = auditDoc(env, audit, { requestId: meta.requestId, method: req.method, path: audit.path || url.pathname, query: url.search.slice(1), status: res.status, ms: Date.now() - meta.started, error });
    // the console's own successful reads (opening a screen, refreshing the overview) would only bury what was done
    // (signing in, a check, and anything that takes data away, a download or an export, are always kept)
    const KEEP = ['console.me', 'console.monitor.check', 'console.backups.download', 'console.data.export'];
    const quietRead = doc?.credential === 'console' && doc.kind === 'read' && doc.ok && !KEEP.includes(doc.op);
    // a refused flood (rate limit, quota) writes nothing per request: that would spend the very quota it protects
    if (doc && !quietRead && log.code !== 'QUOTA_EXCEEDED' && log.code !== 'RATE_LIMITED') {
      const p = writeAudit(env, doc).catch((e) => console.log(JSON.stringify({ requestId: meta.requestId, auditFailed: String(e).slice(0, 200) })));
      if (ctx) ctx.waitUntil(p); else await p;
    }
    const limited = log.code === 'RATE_LIMITED' || log.code === 'QUOTA_EXCEEDED';
    if (res.status >= 500 || (limited && firstThisMinute(String(log.code) + ':' + (log.credential || req.headers.get('cf-connecting-ip') || 'local')))) {
      const p = recordFailure(env, log).catch(() => {});
      if (ctx) ctx.waitUntil(p); else await p;
    }
    return res;
  },
  /**
   * Cron Triggers (wrangler.toml [triggers]): three runs every 5 minutes, two minutes apart, each its own invocation, because
   * the free plan allows 50 subrequests (fetch, KV and R2 calls alike) per invocation and the jobs together need more:
   *   send   (minute 0, 5, ...)  payment-confirmation emails
   *   people (minute 1, 6, ...)  phone push, and account deletion after the grace period
   *   upkeep (minute 2, 7, ...)  the nightly backup, the night cleanup, watching (site, quota, the morning check)
   */
  async scheduled(event: { cron?: string; scheduledTime?: number } | undefined, bindings: Env) {
    const started = Date.now();
    // what this run spends of the free plan's 50 subrequests, for the rounds strip on the jobs screen
    const group = cronGroup(event);
    const { env, used } = meter(bindings, group === 'upkeep' ? 49 : 50);
    console.log(JSON.stringify({ cron: 'run', group, trigger: event?.cron || null }));
    // the owners' switches (control.ts): a paused job skips its turn
    const sw = await readSwitches(env, true);
    const ran: Record<string, JobRun> = {};
    // each job: one line per run for `wrangler tail` (counts and ids only, never addresses, keys or message bodies),
    // and its last result for the console's scheduled-jobs screen
    const step = async (id: string, run: () => Promise<Record<string, unknown> | null>) => {
      const t = Date.now();
      try {
        const r = await run();
        if (r) { console.log(JSON.stringify({ ...r, wallMs: Date.now() - t })); ran[id] = { at: new Date().toISOString(), ms: Date.now() - t, ok: true, result: brief(r) }; }
      } catch (e) {
        const internal = (e instanceof Error ? e.message : String(e)).slice(0, 300);
        console.log(JSON.stringify({ cron: id, internal, wallMs: Date.now() - t }));
        ran[id] = { at: new Date().toISOString(), ms: Date.now() - t, ok: false, result: { error: internal.slice(0, 120) } };
      }
    };
    if (group === 'send') {
      // payment emails (email.ts): paused still queues payments, it only holds the sending
      await step('email', () => runEmail(env, Date.now(), sw.emailPaused, sw.broadcastEmailPaused));
      await saveGroup(env, 'send', ran, started, used).catch(() => {});
      return;
    }
    if (group === 'people') {
      // phone push (push.ts): nothing is read while PUSH_MODE is unset; counts only, never endpoints or message text
      await step('push', async () => (sw.pushPaused ? { cron: 'push', paused: true } : runPush(env)));
      // account deletion after the grace period: uids are never logged, only counts
      await step('accounts', () => runAccountDeletions(env));
      await saveGroup(env, 'people', ran, started, used).catch(() => {});
      return;
    }
    // a record that cannot be read is left alone: this run watches nothing and writes nothing over it
    const prev: MonitorState | null = await readMonitorStrict(env).catch(() => null);
    // the nightly backup to R2 (backup.ts): nothing before 03:00 Israel time or once today's is done; one page per run
    await step('backup', async () => (sw.backupPaused ? null : runBackup(env)));
    // cleanup (control.ts): after tonight's backup, old logs and finished jobs go to the R2 archive, a page per run
    await step('cleanup', async () => (sw.cleanupPaused ? null : runCleanup(env)));
    // watching (monitor.ts): the site every 15 minutes, the free quota every hour, the morning check, alerts to owners
    if (!prev) return;
    let mon = prev;
    if (!sw.monitorPaused) {
      const t = Date.now();
      try {
        mon = await monitorStep(env, prev);
        const c = mon.uptime?.checks[mon.uptime.checks.length - 1];
        const line = { cron: 'monitor', site: c ? { ok: c.ok, ms: c.ms } : null, quota: mon.quota?.error || (mon.quota ? 'ok' : null), health: mon.health?.worst || null };
        console.log(JSON.stringify(line));
        ran.monitor = { at: new Date().toISOString(), ms: Date.now() - t, ok: true, result: brief(line) };
      } catch (e) {
        const internal = (e instanceof Error ? e.message : String(e)).slice(0, 300);
        console.log(JSON.stringify({ cron: 'monitor', internal }));
        ran.monitor = { at: new Date().toISOString(), ms: Date.now() - t, ok: false, result: { error: internal.slice(0, 120) } };
      }
    }
    cronGap(mon, prev.at, started);
    backupTurn(mon, ran.backup);
    // this round's line, with what the send and people runs left (two KV reads); it goes into the same one KV write
    const groups = await readGroups(env);
    // Retention uses at most 10 subrequests. Keep one more for the final KV write.
    if (!sw.backupPaused && used() <= 39 && new Date(event?.scheduledTime ?? started).getUTCMinutes() < 5) {
      await step('backupRetention', () => pruneBackups(env));
    }
    const round = roundOf(ran, groups, started, used() + 1);
    // the console's "last cron run": when it ran, how long it took, what it watched, each upkeep job's last result (one KV write)
    await recordCron(bindings, { ...mon, rounds: addRound(mon.rounds, round), jobs: { ...(prev.jobs || {}), ...ran }, wallMs: Date.now() - started }).catch(() => {});
  },
};
