// A thin Firestore REST client for Workers: typed value encoding, transactions, queries, and a
// service-account OAuth token signed with WebCrypto (no firebase-admin, no gRPC).
//
// Two modes:
//  - emulator (FIRESTORE_EMULATOR_HOST set): plain HTTP to the local emulator with "Bearer owner".
//  - Google (otherwise): HTTPS to firestore.googleapis.com with a service-account access token.
// The service-account path bypasses Firestore Rules, so every permission check lives in the Worker.
import { ApiError } from './http';
import { secondsToPacificMidnight, sleep } from './util';

export type Env = {
  FIRESTORE_PROJECT_ID?: string;
  FIRESTORE_EMULATOR_HOST?: string;
  GCP_SERVICE_ACCOUNT?: string;
  API_CREDENTIALS?: string;
  /** "1" enables X-Test-Fault and GOOGLE_TOKEN_URL. Honored only in emulator mode. */
  TEST_FAULTS?: string;
  GOOGLE_TOKEN_URL?: string;
};

/** Projects this build must never touch outside the emulator. Opening one is a separate, approved step. */
const LOCKED_PROJECTS = new Set(['havat-ravve']);

export class FsError extends Error {
  constructor(public http: number, public status: string, message: string) { super(message); }
}

// ---------- values ----------
type V = Record<string, unknown>;
export function enc(v: unknown): V {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  if (typeof v === 'object') return { mapValue: { fields: encFields(v as Record<string, unknown>) } };
  throw new Error('cannot encode ' + typeof v);
}
export const encFields = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, x]) => x !== undefined).map(([k, x]) => [k, enc(x)]));
export function dec(v: V): unknown {
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('stringValue' in v) return v.stringValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('referenceValue' in v) return v.referenceValue;
  if ('arrayValue' in v) return (((v.arrayValue as V).values as V[]) || []).map(dec);
  if ('mapValue' in v) return decFields(((v.mapValue as V).fields as Record<string, V>) || {});
  return null;
}
export const decFields = (f: Record<string, V>) => Object.fromEntries(Object.entries(f).map(([k, x]) => [k, dec(x)]));

export type Doc = { name: string; id: string; data: Record<string, unknown>; updateTime?: string };
const toDoc = (d: { name: string; fields?: Record<string, V>; updateTime?: string }): Doc =>
  ({ name: d.name, id: d.name.split('/').pop()!, data: decFields(d.fields || {}), updateTime: d.updateTime });

// ---------- Google OAuth (service account, RS256 via WebCrypto) ----------
type ServiceAccount = { client_email: string; private_key: string; private_key_id?: string; project_id?: string };
type TokenCache = { email: string; token: string; expiresAt: number };
let tokenCache: TokenCache | null = null;
let keyCache: { pem: string; key: CryptoKey } | null = null;

const b64urlBytes = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlJson = (o: unknown) => b64urlBytes(new TextEncoder().encode(JSON.stringify(o)));

async function signingKey(pem: string): Promise<CryptoKey> {
  if (keyCache?.pem === pem) return keyCache.key;
  const body = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  keyCache = { pem, key };
  return key;
}

export type TokenSource = 'emulator' | 'cache' | 'fresh';

async function googleToken(saJson: string, tokenUrl: string): Promise<{ token: string; source: TokenSource }> {
  let sa: ServiceAccount;
  try { sa = JSON.parse(saJson); } catch { throw new ApiError('INTERNAL', 'GCP_SERVICE_ACCOUNT is not valid JSON'); }
  if (!sa.client_email || !sa.private_key) throw new ApiError('INTERNAL', 'GCP_SERVICE_ACCOUNT is missing client_email or private_key');
  if (tokenCache && tokenCache.email === sa.client_email && Date.now() < tokenCache.expiresAt) return { token: tokenCache.token, source: 'cache' };

  const now = Math.floor(Date.now() / 1000);
  const unsigned = b64urlJson({ alg: 'RS256', typ: 'JWT', ...(sa.private_key_id ? { kid: sa.private_key_id } : {}) }) + '.' +
    b64urlJson({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', await signingKey(sa.private_key), new TextEncoder().encode(unsigned));
  const assertion = unsigned + '.' + b64urlBytes(new Uint8Array(sig));

  let res: Response;
  try {
    res = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + assertion,
      signal: AbortSignal.timeout(8000),
    });
  } catch { throw new ApiError('UPSTREAM_ERROR', 'Google token endpoint unreachable'); }
  // never log or return the response body: it may hold a token
  if (!res.ok) throw new ApiError('UPSTREAM_ERROR', `Google token exchange failed (${res.status})`);
  const j = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!j.access_token) throw new ApiError('UPSTREAM_ERROR', 'Google token exchange returned no token');
  tokenCache = { email: sa.client_email, token: j.access_token, expiresAt: Date.now() + Math.max(0, (j.expires_in ?? 3600) - 60) * 1000 };
  return { token: j.access_token, source: 'fresh' };
}

// ---------- client ----------
export type Write = Record<string, unknown>;

export class Firestore {
  readonly emulator: boolean;
  readonly project: string;
  private base: string;
  /** How the Google token for this request was obtained, for the request log. */
  tokenSource: TokenSource | null = null;
  private testMode: boolean;

  constructor(private env: Env, private faults: ReadonlySet<string> = new Set()) {
    this.emulator = !!env.FIRESTORE_EMULATOR_HOST;
    this.project = env.FIRESTORE_PROJECT_ID || '';
    if (!this.project) throw new ApiError('INTERNAL', 'FIRESTORE_PROJECT_ID is not configured');
    if (!this.emulator && LOCKED_PROJECTS.has(this.project)) throw new ApiError('PRODUCTION_LOCKED', `project ${this.project} is locked for this build`);
    if (!this.emulator && !env.GCP_SERVICE_ACCOUNT) throw new ApiError('INTERNAL', 'GCP_SERVICE_ACCOUNT is not configured');
    this.testMode = this.emulator && env.TEST_FAULTS === '1';
    this.base = (this.emulator ? `http://${env.FIRESTORE_EMULATOR_HOST}` : 'https://firestore.googleapis.com') + `/v1/projects/${this.project}/databases/(default)/documents`;
  }

  get root() { return `projects/${this.project}/databases/(default)/documents`; }
  name(col: string, id: string) { return `${this.root}/${col}/${id}`; }

  private async authorization(): Promise<string> {
    if (this.emulator) {
      // In test mode the real signing + exchange path runs against a mock token endpoint, so it is
      // exercised end to end; the emulator itself still gets the "owner" bypass token.
      if (this.testMode && this.env.GCP_SERVICE_ACCOUNT && this.env.GOOGLE_TOKEN_URL) this.noteToken((await googleToken(this.env.GCP_SERVICE_ACCOUNT, this.env.GOOGLE_TOKEN_URL)).source);
      else this.noteToken('emulator');
      return 'Bearer owner';
    }
    const t = await googleToken(this.env.GCP_SERVICE_ACCOUNT!, 'https://oauth2.googleapis.com/token');
    this.noteToken(t.source);
    return 'Bearer ' + t.token;
  }

  /** A request that had to fetch a fresh token at any point is logged as "fresh". */
  private noteToken(s: TokenSource) { if (this.tokenSource !== 'fresh') this.tokenSource = s; }

  private fault(name: string) { return this.testMode && this.faults.has(name); }

  private async call<T>(method: string, path: string, body?: unknown, timeoutMs = 8000): Promise<T> {
    if (this.fault('quota')) throw new FsError(429, 'RESOURCE_EXHAUSTED', 'simulated quota exhaustion');
    let res: Response;
    try {
      res = await fetch(this.base + path, {
        method,
        headers: { authorization: await this.authorization(), ...(body ? { 'content-type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      if (e instanceof ApiError) throw e;
      throw new FsError(0, 'DEADLINE_EXCEEDED', 'Firestore request failed: ' + (e instanceof Error ? e.name + ' ' + e.message : String(e)).slice(0, 160));
    }
    if (res.ok) return (await res.json()) as T;
    let status = 'UNKNOWN', message = `HTTP ${res.status}`;
    try { const j = (await res.json()) as { error?: { status?: string; message?: string } }; status = j.error?.status || status; message = j.error?.message || message; } catch { /* not json */ }
    throw new FsError(res.status, status, message);
  }

  /** Reads one document. Inside a transaction this goes through :batchGet, which locks it for the commit. */
  async get(col: string, id: string, transaction?: string): Promise<Doc | null> {
    if (transaction) {
      const rows = await this.call<{ found?: { name: string; fields?: Record<string, V>; updateTime?: string }; missing?: string }[]>('POST', ':batchGet', { documents: [this.name(col, id)], transaction });
      const found = rows.find((r) => r.found)?.found;
      return found ? toDoc(found) : null;
    }
    try {
      return toDoc(await this.call<{ name: string; fields?: Record<string, V>; updateTime?: string }>('GET', `/${col}/${encodeURIComponent(id)}`));
    } catch (e) {
      if (e instanceof FsError && e.http === 404) return null;
      throw e;
    }
  }

  async begin(): Promise<string> {
    return (await this.call<{ transaction: string }>('POST', ':beginTransaction', { options: { readWrite: {} } })).transaction;
  }

  async rollback(transaction: string) {
    await this.call('POST', ':rollback', { transaction }).catch(() => {});
  }

  /** Commits atomically. Test faults: "commit-timeout" applies the commit, then loses the acknowledgement; "commit-lost" never sends it. */
  async commit(writes: Write[], transaction?: string) {
    if (this.fault('commit-lost')) throw new FsError(0, 'DEADLINE_EXCEEDED', 'simulated commit that never arrived');
    const r = await this.call('POST', ':commit', { writes, ...(transaction ? { transaction } : {}) }, 10000);
    if (this.fault('commit-timeout')) throw new FsError(0, 'DEADLINE_EXCEEDED', 'simulated lost commit acknowledgement');
    return r;
  }

  async query(structuredQuery: Record<string, unknown>): Promise<Doc[]> {
    const rows = await this.call<{ document?: { name: string; fields?: Record<string, V>; updateTime?: string } }[]>('POST', ':runQuery', { structuredQuery });
    return rows.filter((r) => r.document).map((r) => toDoc(r.document!));
  }

  // write builders
  create(col: string, id: string, data: Record<string, unknown>): Write {
    return { update: { name: this.name(col, id), fields: encFields(data) }, currentDocument: { exists: false } };
  }
  patch(col: string, id: string, data: Record<string, unknown>, updateTime?: string): Write {
    return { update: { name: this.name(col, id), fields: encFields(data) }, updateMask: { fieldPaths: Object.keys(data) }, currentDocument: updateTime ? { updateTime } : { exists: true } };
  }
}

/** Errors worth retrying the whole transaction for: contention, or a lost race on a create precondition. */
export const isContention = (e: unknown) => e instanceof FsError && ['ABORTED', 'FAILED_PRECONDITION', 'ALREADY_EXISTS'].includes(e.status);
/** Errors after which a commit may or may not have been applied. */
export const isUncertain = (e: unknown) => e instanceof FsError && (e.http === 0 || e.http >= 500);

/** Maps a low-level failure to the API's error vocabulary (quota fails closed with Retry-After). */
export function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  if (e instanceof FsError) {
    if (e.http === 429 || e.status === 'RESOURCE_EXHAUSTED') {
      const s = secondsToPacificMidnight();
      return new ApiError('QUOTA_EXCEEDED', 'Firestore quota exhausted', { retryAfterSeconds: s }, { 'retry-after': String(s) });
    }
    return new ApiError('UPSTREAM_ERROR', `Firestore ${e.status}`, { upstream: e.status });
  }
  return new ApiError('INTERNAL', 'unexpected error');
}

export const backoff = (attempt: number) => sleep(15 * 2 ** attempt + Math.floor(Math.random() * 25));
