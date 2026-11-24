// Where the console's data comes from. Live: the farm's Worker under /v1/console (signed in with Google, owners only)
// for the server, the keys and every action; Firestore directly for the long lists the owner may read anyway (people,
// the assistant log), so opening a screen costs no Worker request and leaves no line in the log.
// Demo (/admin?demo): the same screens over made-up data in memory. Nothing is read or written anywhere.
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { db, readyAuth } from '../app/firebase';
import { demoSource } from './demo';
import { DEMO_AT } from './demo/base';
import { freezeClock } from '../app/clock';

export type Me = { uid: string; name: string; role: 'owner' };
export type Overview = {
  server: { status: string; catalogVersion: string; version: string | null; deployedAt: string | null; project: string | null };
  /** p50: the regular request's time today, in ms (a newer Worker). */
  last24h: { requests: number | null; writes: number | null; failed: number | null; failures: number | null; p50?: number | null };
  queues: { pushPending: number | null; email: { pending: number | null; sent: number | null; failed: number | null } };
  crons: { at: string; wallMs?: number } | null;
  switches: { email: { on: boolean; configured: boolean; brevo: boolean; resend: boolean }; push: { mode: string; missing?: string }; files: { r2: boolean } };
};
export type KeyView = {
  id: string; label: string; actors: string[]; status: 'active' | 'revoked' | 'expired'; expiresAt: string | null;
  rotating: boolean; previousUntil: string | null; source: 'console' | 'secret'; createdAt: string | null; createdBy: string | null; updatedAt: string | null;
  /** null: everything its person may do; else only these scopes. */
  scopes: string[] | null;
};
export type Person = {
  uid: string; email: string; displayName: string; phone: string; role: 'owner' | 'manager' | 'staff' | 'guest' | 'vendor';
  status: 'active' | 'blocked' | 'pending'; customerNumber?: number; notes?: string; createdAt: string; updatedAt: string; vendorId?: string;
};
export type LogEntry = {
  id: string; at: string; credential: string; keyLabel: string; actor: { id: string; role: string; uid: string; name: string };
  kind: 'read' | 'write'; op: string; opHe: string; verb: string; ok: boolean; code: string; message: string; status: number;
  /** What was sent, as JSON text (writes only): its title names the record in the list. */
  body?: string; result?: string;
};
export type KeyAction = 'rename' | 'revoke' | 'restore' | 'expire' | 'rotate' | 'scopes';
export type Backup = { date: string; startedAt: string; finishedAt: string; docs: number; bytes: number; parts: number; collections: Record<string, number>; by: string };
export type Backups = { items: Backup[]; running: { date: string; docs: number; startedAt: string } | null };
export type BackupStep = { done: boolean; date: string | null; docs: number };
export type BackupDocRow = { path: string; title: string; updateTime: string | null };
export type BackupDoc = { path: string; then: Record<string, unknown>; now: Record<string, unknown> | null; thenUpdated: string | null; nowUpdated: string | null };
export type TrashItem = { key: string; path: string; collection: string; title: string; by: string; who: string; requestId: string; deletedAt: string };

export type SiteCheck = { at: string; ok: boolean; ms: number; status: number };
export type Quota = { at: string; since?: string; reads?: number; writes?: number; deletes?: number; error?: 'permission' | 'billing' | 'unavailable' | 'failed'; detail?: string };
export type HealthState = 'ok' | 'warn' | 'bad' | 'unknown';
export type Health = { at: string; date: string; by: string; worst: HealthState; items: { id: string; he: string; state: HealthState; detail: string }[]; r2Bytes: number | null };
/** daily: the morning summary, also when all is well (undefined: the server does not offer it yet). */
export type AlertSettings = { on: boolean; push: boolean; daily?: boolean; updatedAt: string | null; updatedBy: string | null };
export type Monitor = {
  site: { url: string; checks: SiteCheck[]; downSince: string | null; incidents: { from: string; to: string | null }[]; uptime: number | null };
  quota: Quota | null; limits: { reads: number; writes: number; deletes: number; r2Bytes: number }; health: Health | null;
  alerts: AlertSettings; cronAt: string | null;
  /** The last morning checks, oldest first: each check's state by its id (a newer Worker). */
  week?: { date: string; states: Record<string, HealthState> }[];
  /** What went wrong lately, newest first: how long it lasted and whether the owners were told (a newer Worker). */
  events?: MonitorEvent[];
};
export type MonitorEvent = { at: string; kind: 'site' | 'backup' | 'failures' | 'quota' | 'cron' | 'other'; he: string; minutes: number | null; until?: 'morning' | null; alerted: boolean };
export type SecurityEvent = { at: string; kind: 'refused' | 'limited' | 'console'; who: string; what: string; detail: string; ok: boolean };

export type DataCollection = { group: string; count: number | null; backupCount: number | null; readOnly: boolean };
/** fields: the record's simple fields (text, number, yes/no, a person's name), for the table's columns (a newer Worker). */
export type DataDocRow = { path: string; id: string; title: string; updateTime: string | null; fields?: Record<string, unknown> };
export type DataDoc = { path: string; id: string; group: string; title: string; fields: Record<string, unknown>; types: Record<string, string>; createTime: string | null; updateTime: string | null; subcollections: string[]; readOnly: boolean };
export type DocVersion = { updateTime: string | null; from: string; to: string; fields: Record<string, unknown> | null; gone?: boolean; changed: string[] };
export type DocHistory = { path: string; now: { updateTime: string | null; fields: Record<string, unknown> } | null; versions: DocVersion[]; activity: { at: string; text: string; by: string; action: string; via: string }[]; days: number };

export type Debt = { kind: 'ticket' | 'donation' | 'tab'; id: string; who: string; what: string; amount: number; since: string; claimed: boolean };
export type EventFunnel = { id: string; title: string; start: string; capacity: number; price: number; published: boolean; open: boolean; orders: number; tickets: number; cancelled: number; paid: number; entered: number; ticketMoney: number; stallMoney: number; stallOpen: number; upcoming: boolean };
export type Switches = {
  emailPaused: boolean; pushPaused: boolean; keysStopped: boolean; readOnly: boolean;
  maintenance: boolean; maintenanceText: string; registrationClosed: boolean;
  backupPaused: boolean; monitorPaused: boolean; cleanupPaused: boolean;
  /** "לשלוח גם במייל" messages wait (undefined: the server has no such switch yet). */
  broadcastEmailPaused?: boolean;
  updatedAt: string | null; updatedBy: string | null;
};
export type SwitchChange = { at: string; by: string; key: string; to: boolean; reason: string };
/** history: the last changes with the reason given (undefined: the server keeps none yet, and takes no reason). */
export type SwitchesView = { history?: SwitchChange[]; switches: Switches; server: { email: { on: boolean; configured: boolean }; push: { mode: string; missing?: string[] | string | null } } };
export type QueueEmail = { id: string; kind: string; status: string; reason: string; error: string; who: string; attempts: number; provider: string; createdAt: string; nextAt: string; updatedAt: string; updateTime: string };
export type QueuePush = { id: string; kind: string; title: string; body: string; to: number; done: number; createdAt: string; by: string; stale: boolean; updateTime: string };
/** sent: what went out lately, newest first; daily: the mail service's own count today (a newer Worker). */
export type QueueSent = { id: string; type: 'email' | 'push'; kind: string; who: string; what: string; to: number; attempts: number; at: string };
export type Queue = { emails: QueueEmail[]; pushes: QueuePush[]; switches: Switches; email: { on: boolean }; push: { mode: string }; sent?: QueueSent[]; sentToday?: number; daily?: { used: number; limit: number } };
/** One waiting, failed or sent email as the guest gets it (a newer Worker). uid: the person's card, when they have an account. */
export type QueueEmailView = { id: string; to: string; subject: string; text: string; uid: string; amount: number | null; by: string; createdAt: string; lastAttemptAt: string | null; providerSaid: string };
export type EmailPreview = { subject: string; from: string; template: string; custom: boolean; text: string; html: string };
export type JobRun = { at: string; ms: number; ok: boolean; result: Record<string, unknown>; by?: string };
export type Job = { id: string; he: string; every: string; canPause: boolean; paused: boolean; canRun: boolean; last: JobRun | null };
export type CleanupItem = { collection: string; he: string; days: number; due: number | null };
export type Jobs = {
  cronAt: string | null; cronMs: number | null; jobs: Job[];
  cleanup: { items: CleanupItem[]; last: { date: string; archived: number; deleted: number; done: boolean; at: string; by: string } | null };
  archive: { collections: { collection: string; files: number; bytes: number }[] };
  /** The last four hours of five-minute rounds, oldest first (a newer Worker). used: requests out of the free plan's 50. */
  rounds?: { items: { at: string; ok: boolean; ms: number; used?: number | null; failed?: string; why?: string }[]; limit: number };
};
/** How fast the server answers (api/src/speed.ts), from the assistant log's own timings. */
export type Speed = {
  days: number; from: string; slowMs: number; truncated: boolean;
  total: { count: number; p50: number; p95: number; max: number; slow: number; errors: number };
  ops: { op: string; he: string; kind: string; count: number; p50: number; p95: number; max: number; errors: number }[];
  perDay: { day: string; count: number; p50: number; p95: number }[];
  slowest: { at: string; op: string; he: string; ms: number; status: number; key: string }[];
  cron: { at: string | null; wallMs: number | null; jobs: { id: string; ms: number; at: string; ok: boolean }[] };
  site: { checks: number; p50: number; p95: number };
};
/** One operation of the API's catalog (GET /v1/catalog), as the console's "run any operation" shows it. */
export type CatalogParam = { type: string; required?: boolean; min?: number; max?: number; values?: readonly string[]; default?: unknown; he?: string; format?: string; maxItems?: number };
export type CatalogOp = {
  name: string; kind: 'read' | 'write'; he: string; method: 'GET' | 'POST'; path: string; idempotency?: 'required';
  pathParams?: Record<string, CatalogParam>; params?: Record<string, CatalogParam>; body?: Record<string, CatalogParam>; requiredScope: string; notes?: string[];
};
/** An operation's answer as it came, success or not. */
export type OpResult = { status: number; ms: number; json: unknown };
/** Site visits and app usage from our own daily counters (api/src/traffic.ts). Counts only, nothing personal. */
export type Ranked = { key: string; count: number }[];
export type Traffic = {
  days: number; from: string; cap: number;
  today: { day: string; views: number; visitors: number; opens: number; users: number; capped: boolean };
  totals: { views: number; visitors: number; returning: number; opens: number; users: number; appReturning: number; hits: number };
  perDay: { day: string; views: number; visitors: number; opens: number; users: number }[];
  site: { pages: Ranked; sections: Ranked; clicks: Ranked; sources: Ranked; devices: Ranked; depth: Ranked; time: Ranked; hours: number[] };
  app: { screens: Ranked; devices: Ranked; roles: Ranked; hours: number[] };
};
export type Stats = {
  from: string; to: string; days: number;
  farm: {
    people: { total: number; byRole: Record<string, number>; joined: number; blocked: number };
    tasks: { created: number; done: number; open: number; overdue: number; urgentOpen: number; doers: { name: string; count: number }[] };
    shopping: { added: number; bought: number; open: number };
    visits: { requests: number; approved: number; rejected: number; waiting: number; people: number };
    activity: { total: number; days: { day: string; actions: number; tasksDone: number }[]; weekday: number[] };
  };
  money: { received: { tickets: number; donations: number; tabs: number; total: number; donors: number }; waiting: { total: number; claimed: number; count: number }; months: { month: string; tickets: number; donations: number; tabs: number }[]; debts: Debt[] };
  events: EventFunnel[];
};

export type KeyUsage = { requests: number; failed: number; days: number };
/** Last entry to the app per person (Firebase Auth), and from what, when the server knows. */
export type PersonAccess = { at: string | null; device: 'phone' | 'computer' | null };
export type ImportBatch = { id: string; kind: 'tasks' | 'shopping'; at: string; by: string; count: number; undoUntil: string; undone: boolean };
/** A line of a person's permission history, from the app's activity log. */
export type AccessChange = { at: string; text: string; by: string };

export interface Source {
  demo: boolean;
  me(): Promise<Me>;
  overview(): Promise<Overview>;
  keys(): Promise<KeyView[]>;
  createKey(input: { label: string; actor: string; expiresAt: string | null; scopes?: string[] | null }): Promise<{ id: string; key: string }>;
  changeKey(id: string, action: KeyAction, body?: Record<string, unknown>): Promise<{ id: string; key?: string }>;
  people(): Promise<Person[]>;
  recent(n: number): Promise<LogEntry[]>;
  lastUse(ids: string[]): Promise<Record<string, string | null>>;
  /** Any API action (/v1/actions/<op>), as the signed-in owner. */
  action(op: string, body: Record<string, unknown>): Promise<Record<string, unknown>>;
  backups(): Promise<Backups>;
  runBackup(): Promise<BackupStep>;
  downloadBackup(date: string): Promise<void>;
  backupDocs(date: string, collection: string): Promise<{ items: BackupDocRow[]; total: number }>;
  backupDoc(date: string, path: string): Promise<BackupDoc>;
  restoreBackup(date: string, paths: string[]): Promise<{ restored: number; missing: number }>;
  trash(): Promise<TrashItem[]>;
  restoreTrash(keys: string[]): Promise<{ restored: string[]; exists: string[]; gone: string[] }>;
  monitor(): Promise<Monitor>;
  checkNow(): Promise<Monitor>;
  setAlerts(b: { on?: boolean; push?: boolean; daily?: boolean }): Promise<AlertSettings>;
  testAlert(): Promise<{ sent: boolean; push: boolean }>;
  security(days: number): Promise<{ since: string; items: SecurityEvent[] }>;
  dataCollections(): Promise<{ items: DataCollection[]; backupDate: string | null }>;
  dataDocs(group: string, after?: string | null, parent?: string | null): Promise<{ items: DataDocRow[]; next: string | null }>;
  dataDoc(path: string): Promise<DataDoc>;
  dataHistory(path: string, days: number): Promise<DocHistory>;
  editDoc(path: string, set: Record<string, unknown>, updateTime: string): Promise<{ path: string; updateTime: string | null }>;
  deleteDoc(path: string, updateTime: string): Promise<{ path: string; deleted: boolean }>;
  exportCsv(group: string): Promise<void>;
  stats(days: number): Promise<Stats>;
  traffic(days: number): Promise<Traffic>;
  speed(days: number): Promise<Speed>;
  catalog(): Promise<CatalogOp[]>;
  /** Any API operation as the signed-in owner (/v1/console/api/...). `path` is the operation's path with its ids filled in. */
  runOp(method: 'GET' | 'POST', path: string, body?: Record<string, unknown>, idempotencyKey?: string): Promise<OpResult>;
  switches(): Promise<SwitchesView>;
  /** reason: why, kept with the change (only when the server keeps a history). */
  setSwitches(b: Partial<Switches>, reason?: string): Promise<SwitchesView>;
  queue(): Promise<Queue>;
  emailAction(id: string, action: 'retry' | 'cancel', updateTime: string): Promise<{ id: string; status: string }>;
  cancelPush(id: string, updateTime: string): Promise<{ id: string; cancelled: boolean }>;
  emailPreview(): Promise<EmailPreview>;
  /** null: the server does not show single emails yet. */
  queueEmail(id: string): Promise<QueueEmailView | null>;
  /** null: the server does not count yet. */
  keyUsage(id: string): Promise<KeyUsage | null>;
  /** Everyone's last entry, one request for all; null: the server does not say yet. */
  peopleAccess(): Promise<Record<string, PersonAccess> | null>;
  accessChanges(uid: string): Promise<AccessChange[]>;
  /** null: the server keeps no imports yet (so nothing can be undone). */
  imports(): Promise<ImportBatch[] | null>;
  saveImport(kind: 'tasks' | 'shopping', ids: string[]): Promise<ImportBatch | null>;
  undoImport(id: string): Promise<{ removed: number; kept: number }>;
  jobs(): Promise<Jobs>;
  runJob(id: string): Promise<{ id: string; result: Record<string, unknown> | null }>;
}

export class ConsoleError extends Error {
  constructor(public code: string, message: string, public he = '') { super(message); }
}

const PROD = 'https://havat-ravve-api.meniviner.workers.dev';
const LOCAL_KEY = 'farm-console-api';
// Local testing only: /admin?api=http://127.0.0.1:8787 talks to a Worker under `wrangler dev`.
// Only on a developer's own machine: on the live site a crafted link must never send the owner's sign-in token elsewhere,
// so there ?api= and any stored override are ignored and cleared.
// (the build is plain esbuild, no import.meta.env: a local address is the developer's machine)
const localDev = () => location.hostname === 'localhost' || location.hostname === '127.0.0.1';
function apiBase() {
  try {
    if (!localDev()) { sessionStorage.removeItem(LOCAL_KEY); return PROD; }
    const q = new URLSearchParams(location.search).get('api');
    if (q && /^http:\/\/(localhost|127\.0\.0\.1):\d{2,5}$/.test(q)) sessionStorage.setItem(LOCAL_KEY, q);
    return sessionStorage.getItem(LOCAL_KEY) || PROD;
  } catch { return PROD; }
}

async function token() {
  const auth = await readyAuth();
  const user = auth.currentUser;
  if (!user) throw new ConsoleError('UNAUTHENTICATED', 'not signed in', 'צריך להתחבר עם Google');
  return user.getIdToken();
}

/** Saves a file the browser receives from the Worker (the backup download), with the signed-in token. */
async function download(path: string, filename: string) {
  const res = await fetch(apiBase() + '/v1/console' + path, { headers: { authorization: 'Bearer ' + (await token()) } }).catch(() => null);
  if (!res) throw new ConsoleError('NETWORK', 'no connection to the server', 'אין חיבור לשרת');
  if (!res.ok) { const j = await res.json().catch(() => null); throw new ConsoleError(j?.error?.code || 'HTTP_' + res.status, j?.error?.message || res.statusText, j?.error?.he || ''); }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const tk = await token();
  let res: Response;
  try {
    res = await fetch(apiBase() + '/v1/console' + path, {
      method,
      headers: { authorization: 'Bearer ' + tk, ...(body ? { 'content-type': 'application/json' } : {}), ...(method === 'POST' ? { 'idempotency-key': crypto.randomUUID() } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ConsoleError('NETWORK', 'no connection to the server', 'אין חיבור לשרת');
  }
  const j = await res.json().catch(() => null);
  if (!res.ok || !j?.ok) throw new ConsoleError(j?.error?.code || 'HTTP_' + res.status, j?.error?.message || res.statusText, j?.error?.he || '');
  return j.data as T;
}

/** A route only a newer Worker has: null while today's answers "no such route". */
async function ifServed<T>(run: () => Promise<T>): Promise<T | null> {
  try { return await run(); } catch (e) { if (e instanceof ConsoleError && e.code === 'NOT_FOUND') return null; throw e; }
}

const liveSource: Source = {
  demo: false,
  me: () => call('GET', '/me'),
  overview: () => call('GET', '/overview'),
  keys: async () => (await call<{ items: KeyView[] }>('GET', '/keys')).items,
  createKey: (input) => call('POST', '/keys', input),
  changeKey: (id, action, body = {}) => call('POST', `/keys/${encodeURIComponent(id)}/${action}`, body),
  people: async () => (await getDocs(collection(db, 'users'))).docs.map((d) => ({ ...(d.data() as Person), uid: d.id })),
  recent: async (n) => (await getDocs(query(collection(db, 'api_log'), where('kind', '==', 'write'), orderBy('at', 'desc'), limit(n)))).docs.map((d) => d.data() as LogEntry),
  lastUse: async (ids) => {
    const out: Record<string, string | null> = {};
    await Promise.all(ids.map(async (id) => {
      const s = await getDocs(query(collection(db, 'api_log'), where('credential', '==', id), orderBy('at', 'desc'), limit(1))).catch(() => null);
      out[id] = (s?.docs[0]?.data().at as string) || null;
    }));
    return out;
  },
  action: (op, body) => call('POST', '/api/actions/' + op, body),
  backups: () => call('GET', '/backups'),
  runBackup: () => call('POST', '/backups/run'),
  downloadBackup: (date) => download(`/backups/${date}/download`, `havat-ravve-backup-${date}.ndjson`),
  backupDocs: (date, collection) => call('GET', `/backups/${date}/docs?collection=${encodeURIComponent(collection)}`),
  backupDoc: (date, path) => call('GET', `/backups/${date}/doc?path=${encodeURIComponent(path)}`),
  restoreBackup: (date, paths) => call('POST', `/backups/${date}/restore`, { paths }),
  trash: async () => (await call<{ items: TrashItem[] }>('GET', '/trash')).items,
  restoreTrash: (keys) => call('POST', '/trash/restore', { keys }),
  monitor: () => call('GET', '/monitor'),
  checkNow: () => call('POST', '/monitor/check'),
  setAlerts: (b) => call('POST', '/monitor/alerts', b),
  testAlert: () => call('POST', '/monitor/test-alert'),
  security: (days) => call('GET', `/security?days=${days}`),
  dataCollections: () => call('GET', '/data'),
  dataDocs: (group, after, parent) => call('GET', `/data/docs?collection=${encodeURIComponent(group)}${after ? `&after=${encodeURIComponent(after)}` : ''}${parent ? `&parent=${encodeURIComponent(parent)}` : ''}`),
  dataDoc: (path) => call('GET', `/data/doc?path=${encodeURIComponent(path)}`),
  dataHistory: (path, days) => call('GET', `/data/history?path=${encodeURIComponent(path)}&days=${days}`),
  editDoc: (path, set, updateTime) => call('POST', '/data/edit', { path, set, updateTime }),
  deleteDoc: (path, updateTime) => call('POST', '/data/delete', { path, updateTime }),
  stats: (days) => call('GET', `/stats?days=${days}`),
  traffic: (days) => call('GET', `/traffic?days=${days}`),
  speed: (days) => call('GET', `/speed?days=${days}`),
  catalog: async () => (await call<{ operations: CatalogOp[] }>('GET', '/catalog')).operations,
  runOp: async (method, path, body, idem) => {
    const tk = await token();
    const t = performance.now();
    let res: Response;
    try {
      res = await fetch(apiBase() + '/v1/console/api' + path.replace(/^\/v1/, ''), {
        method,
        headers: { authorization: 'Bearer ' + tk, ...(method === 'POST' ? { 'content-type': 'application/json', 'idempotency-key': idem || crypto.randomUUID() } : {}) },
        body: method === 'POST' ? JSON.stringify(body || {}) : undefined,
      });
    } catch {
      throw new ConsoleError('NETWORK', 'no connection to the server', 'אין חיבור לשרת');
    }
    return { status: res.status, ms: Math.round(performance.now() - t), json: await res.json().catch(() => null) };
  },
  switches: () => call('GET', '/switches'),
  setSwitches: (b, reason) => call('POST', '/switches', reason ? { ...b, reason } : b),
  queue: () => call('GET', '/queue'),
  emailAction: (id, action, updateTime) => call('POST', `/queue/email/${encodeURIComponent(id)}/${action}`, { updateTime }),
  cancelPush: (id, updateTime) => call('POST', `/queue/push/${encodeURIComponent(id)}/cancel`, { updateTime }),
  emailPreview: () => call('GET', '/queue/preview'),
  queueEmail: (id) => ifServed(() => call<QueueEmailView>('GET', `/queue/email/${encodeURIComponent(id)}`)),
  keyUsage: (id) => ifServed(() => call<KeyUsage>('GET', `/keys/${encodeURIComponent(id)}/usage`)),
  peopleAccess: () => ifServed(async () => (await call<{ people: Record<string, PersonAccess> }>('GET', '/people/access')).people),
  accessChanges: async (uid) => (await getDocs(query(collection(db, 'activity'), where('subjectUid', '==', uid), orderBy('at', 'desc'), limit(40)))).docs
    .map((d) => d.data() as { at: string; kind: string; action: string; text: string; by?: { name?: string } })
    .filter((x) => x.kind === 'user' || x.kind === 'person' || /role|status|joined|blocked/.test(x.action || ''))
    .map((x) => ({ at: x.at, text: x.text || '', by: x.by?.name || '' })),
  imports: () => ifServed(async () => (await call<{ items: ImportBatch[] }>('GET', '/imports')).items),
  saveImport: (kind, ids) => ifServed(() => call<ImportBatch>('POST', '/imports', { kind, ids })),
  undoImport: (id) => call('POST', `/imports/${encodeURIComponent(id)}/undo`),
  jobs: () => call('GET', '/jobs'),
  runJob: (id) => call('POST', `/jobs/${id}/run`),
  exportCsv: (group) => download(`/data/export?collection=${encodeURIComponent(group)}`, `havat-ravve-${group.replace(/\/\*\//g, '-')}.csv`),
};

export const isDemo = () => { try { return new URLSearchParams(location.search).has('demo'); } catch { return false; } };
// the demo's clock stands at the designs' moment, in every place that says how long ago
if (isDemo()) freezeClock(DEMO_AT);
export const source: Source = isDemo() ? demoSource : liveSource;

const FALLBACK = 'משהו השתבש בשרת. נסו שוב בעוד רגע.';
/** The Hebrew line for a failure. */
export function errorText(e: unknown): string {
  if (e instanceof ConsoleError) {
    const known: Record<string, string> = {
      FORBIDDEN: 'אין הרשאה לפעולה הזאת', STALE_WRITE: 'מישהו שינה את זה בינתיים. רעננו ונסו שוב', NETWORK: 'אין חיבור לשרת. בדקו את האינטרנט ונסו שוב',
      RATE_LIMITED: 'יותר מדי בקשות בזמן קצר. נסו שוב בעוד דקה', NOT_FOUND: 'לא נמצא', UNAUTHENTICATED: 'צריך להתחבר מחדש',
    };
    // the technical words stay out of sight: in the browser console for whoever debugs, never on the screen
    console.warn('[console]', e.code, e.message);
    return known[e.code] || e.he || FALLBACK;
  }
  console.warn('[console]', e);
  return 'משהו השתבש. נסו שוב';
}
