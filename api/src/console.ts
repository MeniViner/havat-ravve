// The owners' console (/admin on the farm's site) talks to this Worker under /v1/console, signed in with Google:
//   Authorization: Bearer <Firebase ID token>. Only an active owner gets in (users/<uid>.role 'owner', status 'active').
//   GET  /v1/console/me                       who is signed in
//   GET  /v1/console/overview                 the server at a glance: version, crons, failures, requests, queues, switches
//   GET  /v1/console/keys                     every API key the server accepts (names, who it acts as, status; never hashes)
//   POST /v1/console/keys                     { label, actor: "user:<uid>", expiresAt? } -> { id, key } (the key is shown once)
//   POST /v1/console/keys/<id>/<action>       rename { label } | revoke | restore | expire { expiresAt|null } | rotate { graceHours }
//   ANY  /v1/console/api/<path>               any API operation (/v1/<path>), as the signed-in owner, without an API key
//   GET  /v1/console/keys/<id>/usage          requests and failures of the last 7 days (usage.ts)
//   GET  /v1/console/people/access            everyone's last entry and from what (people.ts)
//   GET  /v1/console/imports                  the newest imports (imports.ts)
//   POST /v1/console/imports                  { kind: tasks|shopping, ids } -> the import, which can be undone until tomorrow
//   POST /v1/console/imports/<id>/undo        one step of undoing it (call again while left is above 0)
//   GET  /v1/console/backups                  the daily backups in R2 (backup.ts) and one in progress
//   POST /v1/console/backups/run              one step of a backup now (call again while done is false)
//   GET  /v1/console/backups/<day>/download   the whole backup as one NDJSON file
//   GET  /v1/console/backups/<day>/docs?collection=<c>   a collection as it was that day
//   GET  /v1/console/backups/<day>/doc?path=<p>          one document then and now
//   POST /v1/console/backups/<day>/restore    { paths: [...] } writes them back as they were
//   GET  /v1/console/trash                    what API requests deleted in the last 30 days
//   POST /v1/console/trash/restore            { keys: [...] } puts them back (never over a document created since)
//   GET  /v1/console/monitor                  site checks, free quota, the morning check, alert settings (monitor.ts)
//   POST /v1/console/monitor/check            run the morning check now (and read the quota afresh)
//   POST /v1/console/monitor/alerts           { on?, push?, daily? } alert settings
//   POST /v1/console/monitor/test-alert       a test alert to the signed-in owner
//   GET  /v1/console/security?days=7          refused requests, rate limits, and what was done from the console
//   GET  /v1/console/data                     every collection and its size (data.ts)
//   GET  /v1/console/data/docs?collection=&after=&parent=   a page of documents (parent: one document's subcollection)
//   GET  /v1/console/data/doc?path=           one document, its field types and subcollections
//   GET  /v1/console/data/history?path=&days= each version the backups saw, and the app's activity lines about it (days=0: the lines only)
//   POST /v1/console/data/edit                { path, set: { field: value }, updateTime } simple fields only
//   POST /v1/console/data/delete              { path, updateTime } (kept in the recycle bin)
//   GET  /v1/console/data/export?collection=  the collection as a CSV file for Excel
//   GET  /v1/console/stats?days=30            the farm, the money and each event as a funnel (stats.ts)
//   GET  /v1/console/traffic?days=30          site visits and app usage, from our own daily counters (traffic.ts)
//   GET  /v1/console/speed?days=7             how fast the server answers: per operation, per day, the slowest (speed.ts)
//   GET  /v1/console/switches                 the owners' switches (control.ts) and what the server is set up for
//   POST /v1/console/switches                 { emailPaused?, pushPaused?, keysStopped?, readOnly?, maintenance?, maintenanceText?, registrationClosed?, ..., reason? }
//   GET  /v1/console/queue                    payment emails and phone pushes that wait or failed, and what went out lately
//   GET  /v1/console/queue/email/<id>         one email as its guest gets it
//   POST /v1/console/queue/email/<id>/<retry|cancel>  { updateTime }
//   POST /v1/console/queue/push/<id>/cancel   { updateTime }
//   GET  /v1/console/queue/preview            the payment email as a guest gets it
//   GET  /v1/console/jobs                     each scheduled job: last result, paused or not, cleanup and archive
//   POST /v1/console/jobs/<id>/run            run one turn now (email, push, backup, cleanup, monitor)
// Every console request lands in the assistant log (api_log) as "קונסולה · <first name>".
import { ApiError, invalid } from './http';
import { type Env, Firestore } from './firestore';
import { verifyIdToken } from './idtoken';
import { type Caller, ROLE_SCOPES } from './auth';
import { CATALOG, CATALOG_VERSION } from './catalog';
import { emailEnabled } from './email';
import { changeKey, createKey, listKeys } from './keys';
import { type PushEnv, pushMode, pushQueueState } from './push';
import { JOB_HE, LIMITS, ROUND_LIMIT, addMorning, alertSettings, backupTurn, eventsView, healthCheck, type JobRun, type MonitorState, readJobs, readMonitor, readQuota, saveAlertSettings, saveMonitor, securityLog, testAlert, uptimePct, weekView } from './monitor';
import { stats } from './stats';
import { trafficStats } from './traffic';
import { pct, speed } from './speed';
import { keyUsage } from './usage';
import { peopleAccess } from './people';
import { importById, listImports, saveImport, undoImport } from './imports';
import { SWITCH_HE, archiveSummary, cancelPush, cleanupPreview, emailAction, emailPreview, readSwitchRecord, readSwitches, runCleanup, saveSwitches, sendQueue } from './control';
import { emailView, runEmail } from './email';
import { runPush } from './push';
import { collections, deleteDoc, docsPage, docView, editDoc, exportCsv, history } from './data';
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

/** The median time of the last 24 hours, from its latest 200 requests (up to 200 reads, kept 5 minutes in this isolate: the overview is opened often). */
const P50_SAMPLE = 200;
let p50Cache: { at: number; p50: number | null } | null = null;
async function medianMs(fs: Firestore, day: string): Promise<number | null> {
  if (!fs.emulator && p50Cache && Date.now() - p50Cache.at < 5 * 60_000) return p50Cache.p50;
  try {
    const rows = await fs.query({
      from: [{ collectionId: 'api_log' }], select: { fields: [{ fieldPath: 'ms' }] },
      where: { fieldFilter: { field: { fieldPath: 'at' }, op: 'GREATER_THAN_OR_EQUAL', value: { stringValue: day } } },
      orderBy: [{ field: { fieldPath: 'at' }, direction: 'DESCENDING' }], limit: P50_SAMPLE,
    });
    const ms = rows.map((d) => d.data.ms).filter((x): x is number => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b);
    const p50 = ms.length ? pct(ms, 0.5) : null;
    p50Cache = { at: Date.now(), p50 };
    return p50;
  } catch { return null; }
}

async function overview(env: Env, fs: Firestore) {
  const day = new Date(Date.now() - 24 * 3600_000).toISOString();
  const [requests, failed, writes, failures, pushPending, emailQueued, emailSent, emailFailed, p50] = await Promise.all([
    count(fs, 'api_log', [['at', 'GREATER_THAN_OR_EQUAL', day]]),
    count(fs, 'api_log', [['at', 'GREATER_THAN_OR_EQUAL', day], ['ok', 'EQUAL', false]]),
    count(fs, 'api_log', [['at', 'GREATER_THAN_OR_EQUAL', day], ['kind', 'EQUAL', 'write']]),
    count(fs, 'api_failures', [['at', 'GREATER_THAN_OR_EQUAL', day]]),
    count(fs, 'push_jobs', [['sentAt', 'EQUAL', null]]),
    count(fs, 'email_outbox', [['status', 'EQUAL', 'queued']]),
    count(fs, 'email_outbox', [['status', 'EQUAL', 'sent']]),
    count(fs, 'email_outbox', [['status', 'EQUAL', 'failed']]),
    medianMs(fs, day),
  ]);
  const mon = await readMonitor(env);
  const crons = mon.at ? { at: mon.at, wallMs: mon.wallMs ?? null } : null;
  const v = env.CF_VERSION_METADATA;
  return {
    server: { status: 'ok', catalogVersion: CATALOG_VERSION, version: v?.id || null, deployedAt: v?.timestamp || null, project: env.FIRESTORE_PROJECT_ID || null },
    last24h: { requests, writes, failed, failures, p50 },
    queues: { pushPending, email: { pending: emailQueued, sent: emailSent, failed: emailFailed } },
    crons,
    switches: {
      email: { on: emailEnabled(env), configured: env.EMAIL_ENABLED === 'true', brevo: !!env.BREVO_API_KEY, resend: !!(env.RESEND_API_KEY && env.RESEND_SENDER_EMAIL) },
      push: pushMode(env as PushEnv),
      files: { r2: !!env.FILE_BUCKET },
    },
  };
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
  'keys.scopes': { name: 'console.keys.scopes', he: 'הרשאות של מפתח API', kind: 'write' },
  'keys.usage': { name: 'console.keys.usage', he: 'שימוש במפתח API', kind: 'read' },
  'people.access': { name: 'console.people.access', he: 'כניסות אחרונות', kind: 'read' },
  'imports.list': { name: 'console.imports.list', he: 'ייבואים אחרונים', kind: 'read' },
  'imports.save': { name: 'console.imports.add', he: 'רישום ייבוא', kind: 'write' },
  'imports.undo': { name: 'console.imports.undo', he: 'ביטול ייבוא', kind: 'write' },
  'backups.list': { name: 'console.backups.list', he: 'רשימת הגיבויים', kind: 'read' },
  'backups.run': { name: 'console.backups.run', he: 'גיבוי עכשיו', kind: 'write' },
  'backups.download': { name: 'console.backups.download', he: 'הורדת גיבוי', kind: 'read' },
  'backups.browse': { name: 'console.backups.browse', he: 'עיון בגיבוי', kind: 'read' },
  'backups.restore': { name: 'console.backups.restore', he: 'שחזור מגיבוי', kind: 'write' },
  'trash.list': { name: 'console.trash.list', he: 'סל המחזור', kind: 'read' },
  'trash.restore': { name: 'console.trash.restore', he: 'שחזור מסל המחזור', kind: 'write' },
  'monitor.read': { name: 'console.monitor.read', he: 'ניטור השרת', kind: 'read' },
  'monitor.check': { name: 'console.monitor.check', he: 'בדיקת מצב עכשיו', kind: 'read' },
  'monitor.alerts': { name: 'console.monitor.alerts', he: 'הגדרות התראות', kind: 'write' },
  'monitor.testAlert': { name: 'console.monitor.testAlert', he: 'שליחת התראת בדיקה', kind: 'write' },
  security: { name: 'console.security', he: 'יומן אבטחה', kind: 'read' },
  'data.browse': { name: 'console.data.browse', he: 'דפדוף בנתונים', kind: 'read' },
  'data.history': { name: 'console.data.history', he: 'היסטוריה של רשומה', kind: 'read' },
  'data.edit': { name: 'console.data.edit', he: 'עריכת רשומה', kind: 'write' },
  'data.delete': { name: 'console.data.delete', he: 'מחיקת רשומה', kind: 'write' },
  'data.export': { name: 'console.data.export', he: 'ייצוא לאקסל', kind: 'read' },
  stats: { name: 'console.stats', he: 'סטטיסטיקות', kind: 'read' },
  traffic: { name: 'console.traffic', he: 'ביקורים ושימוש', kind: 'read' },
  speed: { name: 'console.speed', he: 'מהירות השרת', kind: 'read' },
  catalog: { name: 'console.catalog', he: 'רשימת הפעולות של ה־API', kind: 'read' },
  'switches.read': { name: 'console.switches.read', he: 'מתגים', kind: 'read' },
  'switches.set': { name: 'console.switches.set', he: 'שינוי מתג', kind: 'write' },
  'queue.read': { name: 'console.queue.read', he: 'תור השליחה', kind: 'read' },
  'queue.email': { name: 'console.queue.email', he: 'מייל מהתור', kind: 'read' },
  'queue.retry': { name: 'console.queue.retry', he: 'שליחה מחדש של מייל', kind: 'write' },
  'queue.cancel': { name: 'console.queue.cancel', he: 'ביטול שליחה', kind: 'write' },
  'queue.preview': { name: 'console.queue.preview', he: 'תצוגה של המייל', kind: 'read' },
  'jobs.read': { name: 'console.jobs.read', he: 'משימות מתוזמנות', kind: 'read' },
  'jobs.run': { name: 'console.jobs.run', he: 'הרצת משימה מתוזמנת', kind: 'write' },
};
/** Which operation a console request is, by its address: so one that failed is logged by its name too. */
const ROUTES: [string, RegExp, string | ((id: string) => string)][] = [
  ['POST', /^\/keys$/, 'keys.create'], ['POST', /^\/keys\/[^/]+\/([a-z]+)$/, (a) => 'keys.' + a], ['GET', /^\/keys\/[^/]+\/usage$/, 'keys.usage'],
  ['POST', /^\/imports$/, 'imports.save'], ['POST', /^\/imports\/[^/]+\/undo$/, 'imports.undo'],
  ['POST', /^\/backups\/run$/, 'backups.run'], ['POST', /^\/backups\/[^/]+\/restore$/, 'backups.restore'], ['GET', /^\/backups\/[^/]+\/download$/, 'backups.download'], ['GET', /^\/backups\/[^/]+\/docs?$/, 'backups.browse'],
  ['POST', /^\/trash\/restore$/, 'trash.restore'], ['POST', /^\/monitor\/check$/, 'monitor.check'], ['POST', /^\/monitor\/alerts$/, 'monitor.alerts'], ['POST', /^\/monitor\/test-alert$/, 'monitor.testAlert'],
  ['POST', /^\/data\/edit$/, 'data.edit'], ['POST', /^\/data\/delete$/, 'data.delete'], ['GET', /^\/data\/export$/, 'data.export'], ['GET', /^\/data\/history$/, 'data.history'], ['GET', /^\/data(\/docs?)?$/, 'data.browse'],
  ['POST', /^\/switches$/, 'switches.set'], ['POST', /^\/queue\/email\/[^/]+\/retry$/, 'queue.retry'], ['POST', /^\/queue\/(?:email|push)\/[^/]+\/cancel$/, 'queue.cancel'], ['GET', /^\/queue\/email\/[^/]+$/, 'queue.email'],
  ['POST', /^\/jobs\/[^/]+\/run$/, 'jobs.run'],
];
export function consoleOpAt(method: string, path: string): string | null {
  for (const [m, re, to] of ROUTES) {
    const hit = m === method && re.exec(path);
    if (hit) return OPS[typeof to === 'string' ? to : to(hit[1])]?.name || null;
  }
  return null;
}
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
    for (const k of Object.keys(b)) if (!['label', 'actor', 'expiresAt', 'id', 'scopes'].includes(k)) throw invalid(k, `unknown field ${k}`);
    // the key acts as an active team member, with that person's role (the same rule as for every key)
    const uid = String(b.actor || '').replace(/^user:/, '');
    const p = (await fs.get('users', uid))?.data;
    if (!p || p.status !== 'active' || !['owner', 'manager', 'staff'].includes(String(p.role))) throw invalid('actor', 'the key must act as an active team member');
    const made = await createKey(env, { label: String(b.label || ''), actor: 'user:' + uid, expiresAt: b.expiresAt ? String(b.expiresAt) : null, id: b.id ? String(b.id) : undefined, scopes: b.scopes }, by);
    // the log keeps what was asked and the new id, never the key
    return { op: OPS['keys.create'], status: 201, data: made, logBody: b, logResult: { id: made.id } };
  }
  const k = /^\/keys\/([a-z0-9-]{1,60})\/(rename|revoke|restore|expire|rotate|scopes)$/.exec(path);
  if (m === 'POST' && k) {
    const b = await body();
    const done = await changeKey(env, k[1], k[2], b, by);
    return { op: OPS['keys.' + k[2]], data: done, logBody: { id: k[1], ...b }, logResult: { id: done.id, rotated: !!done.key } };
  }
  const ku = /^\/keys\/([A-Za-z0-9_-]{1,60})\/usage$/.exec(path);
  if (m === 'GET' && ku) return { op: OPS['keys.usage'], data: await keyUsage(env, fs, ku[1]) };
  if (m === 'GET' && path === '/people/access') return { op: OPS['people.access'], data: await peopleAccess(env, fs) };
  // imports that can still be undone (imports.ts)
  if (m === 'GET' && path === '/imports') return { op: OPS['imports.list'], data: await listImports(env) };
  if (m === 'POST' && path === '/imports') {
    const b = await body();
    const done = await saveImport(env, b, by, req.headers.get('idempotency-key'));
    return { op: OPS['imports.save'], status: 201, data: done, logBody: { kind: done.kind, count: done.count }, logResult: done };
  }
  const iu = /^\/imports\/([A-Za-z0-9_-]{1,60})\/undo$/.exec(path);
  if (m === 'POST' && iu) {
    const batch = await importById(env, iu[1]);
    const done = await undoImport(env, fs, batch);
    return { op: OPS['imports.undo'], data: done, logBody: { id: iu[1], kind: batch.kind, count: batch.count }, logResult: done };
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
  // watching the server (monitor.ts)
  if (m === 'GET' && path === '/monitor') return { op: OPS['monitor.read'], data: await monitorView(env) };
  if (m === 'POST' && path === '/monitor/check') {
    const st = await readMonitor(env);
    await checkNow(env, fs, st, by);
    await saveMonitor(env, st);
    return { op: OPS['monitor.check'], data: await monitorView(env) };
  }
  if (m === 'POST' && path === '/monitor/alerts') {
    const b = await body();
    const done = await saveAlertSettings(env, b, by);
    return { op: OPS['monitor.alerts'], data: done, logBody: b, logResult: { on: done.on, push: done.push, daily: done.daily } };
  }
  if (m === 'POST' && path === '/monitor/test-alert') return { op: OPS['monitor.testAlert'], data: await testAlert(env, fs, caller.actor.person.uid) };
  if (m === 'GET' && path === '/security') return { op: OPS.security, data: await securityLog(env, fs, Number(q.get('days') || 7) || 7) };
  if (m === 'GET' && path === '/stats') return { op: OPS.stats, data: await stats(fs, Number(q.get('days') || 30)) };
  if (m === 'GET' && path === '/catalog') return { op: OPS.catalog, data: { version: CATALOG.version, operations: CATALOG.operations } };
  if (m === 'GET' && path === '/speed') return { op: OPS.speed, data: await speed(env, fs, Number(q.get('days') || 7)) };
  if (m === 'GET' && path === '/traffic') return { op: OPS.traffic, data: await trafficStats(fs, Number(q.get('days') || 30)) };
  // the data browser (data.ts)
  if (m === 'GET' && path === '/data') return { op: OPS['data.browse'], data: await collections(env, fs) };
  if (m === 'GET' && path === '/data/docs') return { op: OPS['data.browse'], data: await docsPage(fs, q.get('collection') || '', q.get('after'), q.get('parent')) };
  if (m === 'GET' && path === '/data/doc') return { op: OPS['data.browse'], data: await docView(fs, q.get('path') || '') };
  if (m === 'GET' && path === '/data/history') return { op: OPS['data.history'], data: await history(env, fs, q.get('path') || '', q.get('days') === '0' ? 0 : Number(q.get('days') || 7) || 7) };
  if (m === 'POST' && path === '/data/edit') {
    const b = await body();
    const done = await editDoc(fs, b);
    return { op: OPS['data.edit'], data: done, logBody: b, logResult: { path: done.path, before: done.before, after: done.after } };
  }
  if (m === 'POST' && path === '/data/delete') {
    const b = await body();
    const done = await deleteDoc(fs, b);
    return { op: OPS['data.delete'], data: done, logBody: b, logResult: done };
  }
  if (m === 'GET' && path === '/data/export') {
    const col = q.get('collection') || '';
    return { op: OPS['data.export'], data: { collection: col }, raw: await exportCsv(fs, col, new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date())) };
  }
  // switches, the send queue and the scheduled jobs (control.ts)
  if (m === 'GET' && path === '/switches') return { op: OPS['switches.read'], data: switchesView(env, await readSwitchRecord(env)) };
  if (m === 'POST' && path === '/switches') {
    const b = await body();
    const done = await saveSwitches(env, fs, b, by);
    const was = done.before as Record<string, unknown>, now = done.switches as Record<string, unknown>;
    const changed = Object.fromEntries(Object.keys(b).filter((k) => SWITCH_HE[k]).map((k) => [k, { from: was[k], to: now[k] }]));
    return { op: OPS['switches.set'], data: switchesView(env, done), logBody: b, logResult: changed };
  }
  if (m === 'GET' && path === '/queue') return { op: OPS['queue.read'], data: { ...(await sendQueue(env, fs)), switches: await readSwitches(env, true), email: { on: emailEnabled(env) }, push: pushMode(env as PushEnv) } };
  if (m === 'GET' && path === '/queue/preview') return { op: OPS['queue.preview'], data: await emailPreview(fs) };
  const qv = /^\/queue\/email\/([\w-]{1,200})$/.exec(path);
  if (m === 'GET' && qv) {
    const view = await emailView(fs, qv[1]);
    if (!view) throw new ApiError('NOT_FOUND', 'no such email job');
    return { op: OPS['queue.email'], data: view };
  }
  const qe = /^\/queue\/email\/([\w-]{1,120})\/(retry|cancel)$/.exec(path);
  if (m === 'POST' && qe) {
    const b = await body();
    const done = await emailAction(fs, qe[1], qe[2] as 'retry' | 'cancel', String(b.updateTime || ''), by);
    return { op: OPS[qe[2] === 'retry' ? 'queue.retry' : 'queue.cancel'], data: done, logBody: { id: qe[1], kind: 'email' }, logResult: done };
  }
  const qp = /^\/queue\/push\/([\w-]{1,120})\/cancel$/.exec(path);
  if (m === 'POST' && qp) {
    const b = await body();
    const done = await cancelPush(fs, qp[1], String(b.updateTime || ''), by);
    return { op: OPS['queue.cancel'], data: done, logBody: { id: qp[1], kind: 'push' }, logResult: done };
  }
  if (m === 'GET' && path === '/jobs') return { op: OPS['jobs.read'], data: await jobsView(env, fs) };
  const jr = /^\/jobs\/([a-z]{1,20})\/run$/.exec(path);
  if (m === 'POST' && jr) {
    const id = jr[1];
    const sw = await readSwitches(env, true);
    const t = Date.now();
    let r: Record<string, unknown> | null;
    if (id === 'email') r = await runEmail(env, Date.now(), sw.emailPaused, sw.broadcastEmailPaused);
    else if (id === 'push') { if (sw.pushPaused) throw invalid('id', 'phone pushes are paused: turn the switch off first'); r = await runPush(env as PushEnv); }
    else if (id === 'backup') r = await runBackup(env, { force: true, by });
    else if (id === 'cleanup') r = await runCleanup(env, { force: true, by });
    else if (id === 'monitor') {
      const st = await readMonitor(env);
      const h = await checkNow(env, fs, st, by);
      await saveMonitor(env, st);
      r = { health: h.worst };
    } else throw invalid('id', 'email, push, backup, cleanup or monitor');
    const st = await readMonitor(env);
    st.jobs = { ...(st.jobs || {}), [id]: { at: new Date().toISOString(), ms: Date.now() - t, ok: true, result: Object.fromEntries(Object.entries(r || { nothing: true }).filter(([k, v]) => k !== 'cron' && ['number', 'boolean', 'string'].includes(typeof v)).slice(0, 12)), by } as JobRun };
    if (id === 'backup') backupTurn(st, st.jobs.backup);
    await saveMonitor(env, st);
    return { op: OPS['jobs.run'], data: { id, result: r }, logBody: { id }, logResult: { id } };
  }
  throw new ApiError('NOT_FOUND', `no console route for ${m} ${path}`);
}

/** An owner's "check now": the quota and the check, in today's column of the week. The cron's own morning check still comes. */
async function checkNow(env: Env, fs: Firestore, st: MonitorState, by: string) {
  st.quota = await readQuota(env);
  st.health = await healthCheck(env, fs, st, by);
  addMorning(st, st.health);
  return st.health;
}

function switchesView(env: Env, rec: Awaited<ReturnType<typeof readSwitchRecord>>) {
  return {
    switches: rec.switches, history: rec.history,
    server: { email: { on: emailEnabled(env), configured: env.EMAIL_ENABLED === 'true' }, push: pushMode(env as PushEnv) },
  };
}

const JOB_LIST = [
  { id: 'email', every: 'כל 5 דקות', pause: 'emailPaused', run: true },
  { id: 'push', every: 'כל 5 דקות', pause: 'pushPaused', run: true },
  { id: 'monitor', every: 'האתר כל 15 דקות, המכסה כל שעה, בדיקה כללית כל בוקר', pause: 'monitorPaused', run: true },
  { id: 'backup', every: 'כל לילה מ־03:00', pause: 'backupPaused', run: true },
  { id: 'cleanup', every: 'כל לילה אחרי הגיבוי, עד 06:00', pause: 'cleanupPaused', run: true },
  { id: 'accounts', every: 'כל 5 דקות, 30 יום אחרי הבקשה', pause: null, run: false },
] as const;

async function jobsView(env: Env, fs: Firestore) {
  const [mon, sw, cleanup, archive] = await Promise.all([readMonitor(env), readSwitches(env, true), cleanupPreview(env, fs), archiveSummary(env)]);
  mon.jobs = await readJobs(env, mon);
  const blocked = {
    email: emailEnabled(env) ? null : 'email',
    push: pushMode(env).mode === 'off' ? 'phone' : null,
    backup: !env.FILE_BUCKET ? 'storage' : !env.TOKEN_KV ? 'settings' : null,
    cleanup: !env.FILE_BUCKET ? 'storage' : !env.TOKEN_KV ? 'settings' : null,
    monitor: !env.TOKEN_KV ? 'settings' : null,
    accounts: null,
  } as const;
  return {
    cronAt: mon.at || null, cronMs: mon.wallMs ?? null,
    jobs: JOB_LIST.map((j) => ({ id: j.id, he: JOB_HE[j.id], every: j.every, canPause: !!j.pause, paused: j.pause ? !!sw[j.pause] : false, canRun: j.run, blocked: blocked[j.id], last: mon.jobs?.[j.id] || null })),
    cleanup, archive,
    rounds: { items: mon.rounds || [], limit: ROUND_LIMIT },
  };
}

async function monitorView(env: Env) {
  const [st, sw] = await Promise.all([readMonitor(env), readSwitches(env, true)]);
  const u = st.uptime;
  return {
    site: { url: 'havat-ravve.web.app', checks: u?.checks || [], downSince: u?.downSince || null, incidents: u?.incidents || [], uptime: uptimePct(u) },
    quota: st.quota || null, limits: LIMITS, health: st.health || null,
    alerts: await alertSettings(env), monitorPaused: sw.monitorPaused, alertsAvailable: !!env.TOKEN_KV, pushState: pushQueueState(env, sw.pushPaused), cronAt: st.at || null,
    week: weekView(st), events: eventsView(st),
  };
}
