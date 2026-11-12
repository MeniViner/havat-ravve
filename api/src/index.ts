// Havat Ravve API: a thin gateway between a personal assistant and the farm's Firestore.
// Stage 1 is synthetic only: synthetic actors, emulator or a separate test project, never production.
import { CATALOG, CATALOG_VERSION } from './catalog';
import { authenticate } from './auth';
import { ApiError, type Meta, fail, ok } from './http';
import { type Env, Firestore, toApiError } from './firestore';
import { assignTask, createTask, getTask, listTasks, searchPeople } from './ops';
import { autoId } from './util';

const MAX_BODY = 16 * 1024;

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

  const caller = await authenticate(req, env.API_CREDENTIALS);
  log.actor = caller.actor.id;
  log.credential = caller.credentialId;
  const fs = new Firestore(env, faultsOf(req, env));
  try {
    if (m === 'GET' && path === '/v1/tasks') return { data: await listTasks(fs, caller, url.searchParams) };
    const one = /^\/v1\/tasks\/([^/]+)$/.exec(path);
    if (m === 'GET' && one) { if ([...url.searchParams].length) throw new ApiError('VALIDATION_FAILED', 'tasks.get takes no query parameters', { field: [...url.searchParams.keys()][0] }); return { data: await getTask(fs, caller, decodeURIComponent(one[1])) }; }
    if (m === 'GET' && path === '/v1/people') return { data: await searchPeople(fs, caller, url.searchParams) };
    const action = /^\/v1\/actions\/([a-z.]+)$/.exec(path);
    if (m === 'POST' && action) {
      const key = req.headers.get('idempotency-key');
      const body = await readBody(req);
      const run = action[1] === 'tasks.create' ? createTask : action[1] === 'tasks.assign' ? assignTask : null;
      if (!run) throw new ApiError('NOT_FOUND', `no such operation: ${action[1]}`);
      log.op = action[1];
      const r = await run(fs, caller, body, key);
      log.replayed = r.replayed;
      return { status: r.status, data: { ...r.data, replayed: r.replayed } };
    }
    throw new ApiError('NOT_FOUND', `no route for ${m} ${path}`);
  } finally {
    log.token = fs.tokenSource;
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const meta: Meta = { requestId: 'req_' + autoId(16), started: Date.now() };
    const url = new URL(req.url);
    const log: Record<string, unknown> = { requestId: meta.requestId, method: req.method, path: url.pathname };
    let res: Response;
    try {
      const r = await route(req, env, url, log);
      res = ok(meta, r.data, r.status ?? 200);
    } catch (e) {
      const err = toApiError(e);
      if (!(e instanceof ApiError)) log.internal = e instanceof Error ? e.message.slice(0, 200) : String(e);
      log.code = err.code;
      res = fail(meta, err);
    }
    // one structured line per request, for `wrangler tail`; never contains keys, tokens or bodies
    log.status = res.status;
    log.wallMs = Date.now() - meta.started;
    console.log(JSON.stringify(log));
    return res;
  },
};
