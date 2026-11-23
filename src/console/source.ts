// Where the console's data comes from. Live: the farm's Worker under /v1/console (signed in with Google, owners only)
// for the server, the keys and every action; Firestore directly for the long lists the owner may read anyway (people,
// the assistant log), so opening a screen costs no Worker request and leaves no line in the log.
// Demo (/admin?demo): the same screens over made-up data in memory. Nothing is read or written anywhere.
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { db, readyAuth } from '../app/firebase';
import { demoSource } from './demo';

export type Me = { uid: string; name: string; role: 'owner' };
export type Overview = {
  server: { status: string; catalogVersion: string; version: string | null; deployedAt: string | null; project: string | null };
  last24h: { requests: number | null; writes: number | null; failed: number | null; failures: number | null };
  queues: { pushPending: number | null; email: { pending: number | null; sent: number | null; failed: number | null } };
  crons: { at: string; wallMs?: number } | null;
  switches: { email: { on: boolean; configured: boolean; brevo: boolean; resend: boolean }; push: { mode: string; missing?: string }; files: { r2: boolean } };
};
export type KeyView = {
  id: string; label: string; actors: string[]; status: 'active' | 'revoked' | 'expired'; expiresAt: string | null;
  rotating: boolean; previousUntil: string | null; source: 'console' | 'secret'; createdAt: string | null; createdBy: string | null; updatedAt: string | null;
};
export type Person = {
  uid: string; email: string; displayName: string; phone: string; role: 'owner' | 'manager' | 'staff' | 'guest' | 'vendor';
  status: 'active' | 'blocked' | 'pending'; customerNumber?: number; notes?: string; createdAt: string; updatedAt: string; vendorId?: string;
};
export type LogEntry = {
  id: string; at: string; credential: string; keyLabel: string; actor: { id: string; role: string; uid: string; name: string };
  kind: 'read' | 'write'; op: string; opHe: string; verb: string; ok: boolean; code: string; message: string; status: number;
};
export type KeyAction = 'rename' | 'revoke' | 'restore' | 'expire' | 'rotate';
export type Backup = { date: string; startedAt: string; finishedAt: string; docs: number; bytes: number; parts: number; collections: Record<string, number>; by: string };
export type Backups = { items: Backup[]; running: { date: string; docs: number; startedAt: string } | null };
export type BackupStep = { done: boolean; date: string | null; docs: number };
export type BackupDocRow = { path: string; title: string; updateTime: string | null };
export type BackupDoc = { path: string; then: Record<string, unknown>; now: Record<string, unknown> | null; thenUpdated: string | null; nowUpdated: string | null };
export type TrashItem = { key: string; path: string; collection: string; title: string; by: string; who: string; requestId: string; deletedAt: string };

export type SiteCheck = { at: string; ok: boolean; ms: number; status: number };
export type Quota = { at: string; since?: string; reads?: number; writes?: number; deletes?: number; error?: 'permission' | 'unavailable' | 'failed'; detail?: string };
export type HealthState = 'ok' | 'warn' | 'bad' | 'unknown';
export type Health = { at: string; date: string; by: string; worst: HealthState; items: { id: string; he: string; state: HealthState; detail: string }[]; r2Bytes: number | null };
export type AlertSettings = { on: boolean; push: boolean; updatedAt: string | null; updatedBy: string | null };
export type Monitor = {
  site: { url: string; checks: SiteCheck[]; downSince: string | null; incidents: { from: string; to: string | null }[]; uptime: number | null };
  quota: Quota | null; limits: { reads: number; writes: number; deletes: number; r2Bytes: number }; health: Health | null;
  alerts: AlertSettings; cronAt: string | null;
};
export type SecurityEvent = { at: string; kind: 'refused' | 'limited' | 'console'; who: string; what: string; detail: string; ok: boolean };

export type DataCollection = { group: string; count: number | null; backupCount: number | null; readOnly: boolean };
export type DataDocRow = { path: string; id: string; title: string; updateTime: string | null };
export type DataDoc = { path: string; id: string; group: string; title: string; fields: Record<string, unknown>; types: Record<string, string>; createTime: string | null; updateTime: string | null; subcollections: string[]; readOnly: boolean };
export type DocVersion = { updateTime: string | null; from: string; to: string; fields: Record<string, unknown> | null; gone?: boolean; changed: string[] };
export type DocHistory = { path: string; now: { updateTime: string | null; fields: Record<string, unknown> } | null; versions: DocVersion[]; activity: { at: string; text: string; by: string; action: string; via: string }[]; days: number };

export interface Source {
  demo: boolean;
  me(): Promise<Me>;
  overview(): Promise<Overview>;
  keys(): Promise<KeyView[]>;
  createKey(input: { label: string; actor: string; expiresAt: string | null }): Promise<{ id: string; key: string }>;
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
  setAlerts(b: { on?: boolean; push?: boolean }): Promise<AlertSettings>;
  testAlert(): Promise<{ sent: boolean; push: boolean }>;
  security(days: number): Promise<{ since: string; items: SecurityEvent[] }>;
  dataCollections(): Promise<{ items: DataCollection[]; backupDate: string | null }>;
  dataDocs(group: string, after?: string | null, parent?: string | null): Promise<{ items: DataDocRow[]; next: string | null }>;
  dataDoc(path: string): Promise<DataDoc>;
  dataHistory(path: string, days: number): Promise<DocHistory>;
  editDoc(path: string, set: Record<string, unknown>, updateTime: string): Promise<{ path: string; updateTime: string | null }>;
  deleteDoc(path: string, updateTime: string): Promise<{ path: string; deleted: boolean }>;
  exportCsv(group: string): Promise<void>;
}

export class ConsoleError extends Error {
  constructor(public code: string, message: string, public he = '') { super(message); }
}

const PROD = 'https://havat-ravve-api.meniviner.workers.dev';
const LOCAL_KEY = 'farm-console-api';
// Local testing only: /admin?api=http://127.0.0.1:8787 talks to a Worker under `wrangler dev`.
function apiBase() {
  try {
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
  exportCsv: (group) => download(`/data/export?collection=${encodeURIComponent(group)}`, `havat-ravve-${group.replace(/\/\*\//g, '-')}.csv`),
};

export const isDemo = () => { try { return new URLSearchParams(location.search).has('demo'); } catch { return false; } };
export const source: Source = isDemo() ? demoSource : liveSource;

/** The Hebrew line for a failure. */
export function errorText(e: unknown): string {
  if (e instanceof ConsoleError) {
    const known: Record<string, string> = {
      FORBIDDEN: 'אין הרשאה לפעולה הזאת', STALE_WRITE: 'מישהו שינה את זה בינתיים. רעננו ונסו שוב', NETWORK: 'אין חיבור לשרת. בדקו את האינטרנט ונסו שוב',
      RATE_LIMITED: 'יותר מדי בקשות בזמן קצר. נסו שוב בעוד דקה', NOT_FOUND: 'לא נמצא', UNAUTHENTICATED: 'צריך להתחבר מחדש',
    };
    return known[e.code] || (e.he ? `${e.he} (${e.message})` : e.message);
  }
  return 'משהו השתבש. נסו שוב';
}
