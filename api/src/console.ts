// The owners' console (/admin on the farm's site) talks to this Worker under /v1/console, signed in with Google:
//   Authorization: Bearer <Firebase ID token>. Only an active owner gets in (users/<uid>.role 'owner', status 'active').
//   GET  /v1/console/me                       who is signed in
//   GET  /v1/console/overview                 the server at a glance: version, crons, failures, requests, queues, switches
//   GET  /v1/console/keys                     every API key the server accepts (names, who it acts as, status; never hashes)
//   POST /v1/console/keys                     { label, actor: "user:<uid>", expiresAt? } -> { id, key } (the key is shown once)
//   POST /v1/console/keys/<id>/<action>       rename { label } | revoke | restore | expire { expiresAt|null } | rotate { graceHours }
//   ANY  /v1/console/api/<path>               any API operation (/v1/<path>), as the signed-in owner, without an API key
//   GET  /v1/console/backups                  the daily backups in R2 (backup.ts) and one in progress
//   POST /v1/console/backups/run              one step of a backup now (call again while done is false)
//   GET  /v1/console/backups/<day>/download   the whole backup as one NDJSON file
//   GET  /v1/console/backups/<day>/docs?collection=<c>   a collection as it was that day
//   GET  /v1/console/backups/<day>/doc?path=<p>          one document then and now
//   POST /v1/console/backups/<day>/restore    { paths: [...] } writes them back as they were
//   GET  /v1/console/trash                    what API requests deleted in the last 30 days
//   POST /v1/console/trash/restore            { keys: [...] } puts them back (never over a document created since)
// Every console request lands in the assistant log (api_log) as "קונסולה · <first name>".
import { ApiError, invalid } from './http';
import { type Env, Firestore } from './firestore';
import { verifyIdToken } from './idtoken';
import { type Caller, ROLE_SCOPES } from './auth';
import { CATALOG_VERSION } from './catalog';
import { emailEnabled } from './email';
import { changeKey, createKey, listKeys } from './keys';
import { type PushEnv, pushMode } from './push';
import { backupCollection, backupDoc, downloadBackup, listBackups, listTrash, restoreFromBackup, restoreFromTrash, runBackup } from './backup';

export const CONSOLE = 'console';
export const isConsolePath = (path: string) => path === '/v1/console' || path.startsWith('/v1/console/');
const ORIGIN_RE = /^(https:\/\/havat-ravve(--[a-z0-9-]{1,80})?\.(web\.app|firebaseapp\.com)|http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?)$/;
const OWNER_EMAIL = 'meniviner@gmail.com';

export function consoleCors(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') || '';
  return ORIGIN_RE.test(origin)
    ? { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'authorization, content-type, idempotency-key', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-max-age': '600', vary: 'Origin' }
    : { vary: 'Origin' };
}

/** The signed-in owner as an API caller (all of an owner's scopes), or UNAUTHENTICATED / FORBIDDEN. */
export async function consoleCaller(req: Request, env: Env, fs: Firestore): Promise<Caller> {
  const m = /^Bearer\s+(\S{20,4096})$/i.exec(req.headers.get('authorization') || '');
  if (!m) throw new ApiError('UNAUTHENTICATED', 'sign in with Google first');
  const who = await verifyIdToken(m[1], env);
  const p = (await fs.get('users', who.uid))?.data;
  const owner = !!p && p.status === 'active' && (p.role === 'owner' || String(p.email || '').toLowerCase() === OWNER_EMAIL);
  if (!owner) throw new ApiError('FORBIDDEN', 'the console is for the farm\'s owners only');
  const name = String(p!.displayName || who.email || 'בעלים').slice(0, 80);
  return { credentialId: CONSOLE, actor: { id: 'user:' + who.uid, role: 'owner', person: { uid: who.uid, name } }, scopes: new Set(ROLE_SCOPES.owner) };
}

async function count(fs: Firestore, col: string, filters: [string, string, unknown][]): Promise<number | null> {
  const enc = (v: unknown) => (v === null ? { nullValue: null } : typeof v === 'boolean' ? { booleanValue: v } : { stringValue: String(v) });
  const where = filters.map(([f, op, v]) => ({ fieldFilter: { field: { fieldPath: f }, op, value: enc(v) } }));
  try {
    return await fs.count({ from: [{ collectionId: col }], ...(where.length ? { where: where.length === 1 ? where[0] : { compositeFilter: { op: 'AND', filters: where } } } : {}) });
  } catch { return null; }
}

async function overview(env: Env, fs: Firestore) {
  const day = new Date(Date.now() - 24 * 3600_000).toISOString();
  const [requests, failed, writes, failures, pushPending, emailQueued, emailSent, emailFailed] = await Promise.all([
    count(fs, 'api_log', [['at', 'GREATER_THAN_OR_EQUAL', day]]),
    count(fs, 'api_log', [['at', 'GREATER_THAN_OR_EQUAL', day], ['ok', 'EQUAL', false]]),
    count(fs, 'api_log', [['at', 'GREATER_THAN_OR_EQUAL', day], ['kind', 'EQUAL', 'write']]),
    count(fs, 'api_failures', [['at', 'GREATER_THAN_OR_EQUAL', day]]),
    count(fs, 'push_jobs', [['sentAt', 'EQUAL', null]]),
    count(fs, 'email_outbox', [['status', 'EQUAL', 'pending']]),
    count(fs, 'email_outbox', [['status', 'EQUAL', 'sent']]),
    count(fs, 'email_outbox', [['status', 'EQUAL', 'failed']]),
  ]);
  let crons: unknown = null;
  try { crons = JSON.parse((await env.TOKEN_KV?.get(CRON_KEY)) || 'null'); } catch { /* none recorded yet */ }
  const v = env.CF_VERSION_METADATA;
  return {
    server: { status: 'ok', catalogVersion: CATALOG_VERSION, version: v?.id || null, deployedAt: v?.timestamp || null, project: env.FIRESTORE_PROJECT_ID || null },
    last24h: { requests, writes, failed, failures },
    queues: { pushPending, email: { pending: emailQueued, sent: emailSent, failed: emailFailed } },
    crons,
    switches: {
      email: { on: emailEnabled(env), configured: env.EMAIL_ENABLED === 'true', brevo: !!env.BREVO_API_KEY, resend: !!(env.RESEND_API_KEY && env.RESEND_SENDER_EMAIL) },
      push: pushMode(env as PushEnv),
      files: { r2: !!env.FILE_BUCKET },
    },
  };
}

/** The last cron run, kept for the console (one small KV write per run: 288 a day, inside the free 1,000). */
export const CRON_KEY = 'console:cron-last';
export async function recordCron(env: Env, run: Record<string, unknown>) {
  await env.TOKEN_KV?.put(CRON_KEY, JSON.stringify({ at: new Date().toISOString(), ...run }));
}

export type ConsoleOp = { name: string; he: string; kind: 'read' | 'write' };
const OPS: Record<string, ConsoleOp> = {
  me: { name: 'console.me', he: 'כניסה לקונסולה', kind: 'read' },
  overview: { name: 'console.overview', he: 'מצב השרת', kind: 'read' },
  'keys.list': { name: 'console.keys.list', he: 'רשימת מפתחות API', kind: 'read' },
  'keys.create': { name: 'console.keys.create', he: 'יצירת מפתח API', kind: 'write' },
  'keys.rename': { name: 'console.keys.rename', he: 'שינוי שם של מפתח API', kind: 'write' },
  'keys.revoke': { name: 'console.keys.revoke', he: 'ביטול מפתח API', kind: 'write' },
  'keys.restore': { name: 'console.keys.restore', he: 'החזרת מפתח API שבוטל', kind: 'write' },
  'keys.expire': { name: 'console.keys.expire', he: 'תוקף למפתח API', kind: 'write' },
  'keys.rotate': { name: 'console.keys.rotate', he: 'החלפת מפתח API', kind: 'write' },
  'backups.list': { name: 'console.backups.list', he: 'רשימת הגיבויים', kind: 'read' },
  'backups.run': { name: 'console.backups.run', he: 'גיבוי עכשיו', kind: 'write' },
  'backups.download': { name: 'console.backups.download', he: 'הורדת גיבוי', kind: 'read' },
  'backups.browse': { name: 'console.backups.browse', he: 'עיון בגיבוי', kind: 'read' },
  'backups.restore': { name: 'console.backups.restore', he: 'שחזור מגיבוי', kind: 'write' },
  'trash.list': { name: 'console.trash.list', he: 'סל המחזור', kind: 'read' },
  'trash.restore': { name: 'console.trash.restore', he: 'שחזור מסל המחזור', kind: 'write' },
};
export const consoleOp = (name: string) => Object.values(OPS).find((o) => o.name === name) || null;

/** The console's own routes (not /api/...). Returns the operation for the log and the answer. */
export async function consoleRoute(req: Request, env: Env, path: string, caller: Caller, fs: Firestore, body: () => Promise<Record<string, unknown>>): Promise<{ op: ConsoleOp; status?: number; data: unknown; logBody?: unknown; logResult?: unknown; raw?: Response }> {
  const m = req.method;
  const by = caller.actor.person.name;
  if (m === 'GET' && path === '/me') return { op: OPS.me, data: { uid: caller.actor.person.uid, name: by, role: 'owner' } };
  if (m === 'GET' && path === '/overview') return { op: OPS.overview, data: await overview(env, fs) };
  if (m === 'GET' && path === '/keys') return { op: OPS['keys.list'], data: { items: await listKeys(env) } };
  if (m === 'POST' && path === '/keys') {
    const b = await body();
    for (const k of Object.keys(b)) if (!['label', 'actor', 'expiresAt', 'id'].includes(k)) throw invalid(k, `unknown field ${k}`);
    // the key acts as an active team member, with that person's role (the same rule as for every key)
    const uid = String(b.actor || '').replace(/^user:/, '');
    const p = (await fs.get('users', uid))?.data;
    if (!p || p.status !== 'active' || !['owner', 'manager', 'staff'].includes(String(p.role))) throw invalid('actor', 'the key must act as an active team member');
    const made = await createKey(env, { label: String(b.label || ''), actor: 'user:' + uid, expiresAt: b.expiresAt ? String(b.expiresAt) : null, id: b.id ? String(b.id) : undefined }, by);
    // the log keeps what was asked and the new id, never the key
    return { op: OPS['keys.create'], status: 201, data: made, logBody: b, logResult: { id: made.id } };
  }
  const k = /^\/keys\/([a-z0-9-]{1,60})\/(rename|revoke|restore|expire|rotate)$/.exec(path);
  if (m === 'POST' && k) {
    const b = await body();
    const done = await changeKey(env, k[1], k[2], b, by);
    return { op: OPS['keys.' + k[2]], data: done, logBody: { id: k[1], ...b }, logResult: { id: done.id, rotated: !!done.key } };
  }
  // backups and the recycle bin (backup.ts)
  const q = new URL(req.url).searchParams;
  if (m === 'GET' && path === '/backups') return { op: OPS['backups.list'], data: await listBackups(env) };
  if (m === 'POST' && path === '/backups/run') {
    const r = await runBackup(env, { force: true, by: by });
    return { op: OPS['backups.run'], data: r || { done: true, date: null, docs: 0 } };
  }
  const bk = /^\/backups\/(\d{4}-\d{2}-\d{2})\/(download|docs|doc|restore)$/.exec(path);
  if (bk && m === 'GET' && bk[2] === 'download') return { op: OPS['backups.download'], data: { date: bk[1] }, raw: await downloadBackup(env, bk[1]) };
  if (bk && m === 'GET' && bk[2] === 'docs') return { op: OPS['backups.browse'], data: await backupCollection(env, bk[1], q.get('collection') || '') };
  if (bk && m === 'GET' && bk[2] === 'doc') return { op: OPS['backups.browse'], data: await backupDoc(env, bk[1], q.get('path') || '', fs) };
  if (bk && m === 'POST' && bk[2] === 'restore') {
    const b = await body();
    const done = await restoreFromBackup(env, bk[1], b.paths as string[], fs);
    return { op: OPS['backups.restore'], data: done, logBody: { date: bk[1], paths: b.paths }, logResult: done };
  }
  if (m === 'GET' && path === '/trash') return { op: OPS['trash.list'], data: await listTrash(env) };
  if (m === 'POST' && path === '/trash/restore') {
    const b = await body();
    const done = await restoreFromTrash(env, b.keys as string[], fs);
    return { op: OPS['trash.restore'], data: done, logBody: b, logResult: done };
  }
  throw new ApiError('NOT_FOUND', `no console route for ${m} ${path}`);
}
