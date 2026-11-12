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
import { listFailures, recordFailure } from './failures';
import { type Scope, requireScope } from './auth';

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

async function route(req: Request, env: Env, url: URL, log: Record<string, unknown>): Promise<{ status?: number; data: unknown }> {
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const m = req.method;

  if (m === 'GET' && path === '/v1/health') return { data: { status: 'ok', catalogVersion: CATALOG_VERSION } };
  if (m === 'GET' && path === '/v1/catalog') return { data: CATALOG };

  const fs = new Firestore(env, faultsOf(req, env));
  try {
    // a real person's role and name come from their profile in the app
    let caller;
    try {
      caller = await authenticate(req, env.API_CREDENTIALS, async (uid) => (await fs.get('users', uid))?.data ?? null);
    } catch (e) {
      // many failed authentications from one address: slow it down
      if (e instanceof ApiError && e.code === 'UNAUTHENTICATED' && env.AUTH_LIMITER) {
        const ip = req.headers.get('cf-connecting-ip') || 'local';
        if (!(await env.AUTH_LIMITER.limit({ key: 'auth:' + ip })).success) throw new ApiError('RATE_LIMITED', 'too many failed authentications', {}, { 'retry-after': '60' });
      }
      throw e;
    }
    log.actor = caller.actor.id;
    log.credential = caller.credentialId;
    // one key in a loop (a confused assistant) must not burn the farm's daily Firestore quota
    if (env.RATE_LIMITER && !(await env.RATE_LIMITER.limit({ key: 'cred:' + caller.credentialId })).success) {
      throw new ApiError('RATE_LIMITED', 'too many requests for this key', { credential: caller.credentialId }, { 'retry-after': '60' });
    }
    if (m === 'GET' && path === '/v1/system/failures') return { data: await listFailures(fs, caller, url.searchParams) };
    if (m === 'GET' && path === '/v1/tasks') return { data: await listTasks(fs, caller, url.searchParams) };
    const one = /^\/v1\/tasks\/([^/]+)$/.exec(path);
    if (m === 'GET' && one) { if ([...url.searchParams].length) throw new ApiError('VALIDATION_FAILED', 'tasks.get takes no query parameters', { field: [...url.searchParams.keys()][0] }); return { data: await getTask(fs, caller, decodeURIComponent(one[1])) }; }
    if (m === 'GET' && path === '/v1/people') return { data: await searchPeople(fs, caller, url.searchParams) };
    if (m === 'GET' && path === '/v1/shopping') return { data: await listShopping(fs, caller, url.searchParams) };
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
      let r: Awaited<ReturnType<typeof createTask>>;
      if (Object.hasOwn(WRITES, action[1])) r = await WRITES[action[1]](fs, caller, body, key);
      else {
        const d = WRITE_DEFS.find((x) => x.op.name === action[1]);
        if (!d) throw new ApiError('NOT_FOUND', `no such operation: ${action[1]}`);
        requireScope(caller, d.op.requiredScope as Scope);
        r = await d.run(fs, caller, validate(d.op.body!, body), key);
      }
      log.replayed = r.replayed;
      return { status: r.status, data: { ...r.data, replayed: r.replayed } };
    }
    throw new ApiError('NOT_FOUND', `no route for ${m} ${path}`);
  } finally {
    log.token = fs.tokenSource;
  }
}

export default {
  async fetch(req: Request, env: Env, ctx?: { waitUntil(p: Promise<unknown>): void }): Promise<Response> {
    const meta: Meta = { requestId: 'req_' + autoId(16), started: Date.now() };
    const url = new URL(req.url);
    const log: Record<string, unknown> = { requestId: meta.requestId, method: req.method, path: url.pathname };
    let res: Response;
    try {
      const r = await route(req, env, url, log);
      res = ok(meta, r.data, r.status ?? 200);
    } catch (e) {
      const err = toApiError(e);
      if (!(e instanceof ApiError)) log.internal = e instanceof Error ? e.message.slice(0, 600) : String(e);
      log.code = err.code;
      res = fail(meta, err);
    }
    // one structured line per request, for `wrangler tail`; never contains keys, tokens or bodies
    log.status = res.status;
    log.wallMs = Date.now() - meta.started;
    console.log(JSON.stringify(log));
    // failures worth an alert are kept in Firestore (best effort, after the response) for system.failures
    if (res.status >= 500 || log.code === 'RATE_LIMITED' || log.code === 'QUOTA_EXCEEDED') {
      const p = recordFailure(env, log).catch(() => {});
      if (ctx) ctx.waitUntil(p); else await p;
    }
    return res;
  },
};
