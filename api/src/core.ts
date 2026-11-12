// Shared machinery for every write: idempotency, the activity record, member lookup and the read-back.
import { ApiError, invalid } from './http';
import type { Caller } from './auth';
import { type Doc, Firestore, type Write, backoff, enc, isContention, isUncertain, toApiError } from './firestore';
import { UUID_RE, autoId, canonical, sha256hex } from './util';

export type Person = { uid: string; name: string };
export const TEAM_ROLES = new Set(['owner', 'manager', 'staff']);
export const nowIso = () => new Date().toISOString();
/** Today's date in Asia/Jerusalem, YYYY-MM-DD (the app's todayKey). */
export const todayIL = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
export const isManager = (c: Caller) => c.actor.role === 'owner' || c.actor.role === 'manager';
export const isOwner = (c: Caller) => c.actor.role === 'owner';
export const notFound = (what: string) => new ApiError('NOT_FOUND', `${what} not found`);
export const forbidden = (why: string) => new ApiError('FORBIDDEN', why);

export type WriteResult = { status: number; data: Record<string, unknown> };
export type RunResult = { writes: Write[]; data: Record<string, unknown>; status?: number };

/**
 * Runs a write exactly once per (credential, actor, operation, Idempotency-Key). The idempotency record,
 * the entity and its activity are committed in one transaction, with a create-precondition on the record,
 * so two racing requests with the same key cannot both write. After a commit whose outcome is unknown,
 * the record is read back before anything is retried; the commit itself is never sent twice.
 */
export async function idempotent(
  fs: Firestore, caller: Caller, op: string, key: string | null, input: Record<string, unknown>,
  run: (tx: string) => Promise<RunResult>,
  readBack: (data: Record<string, unknown>) => Promise<Record<string, unknown>>,
): Promise<WriteResult & { replayed: boolean }> {
  if (!key) throw invalid('Idempotency-Key', 'Idempotency-Key header is required for writes');
  if (!UUID_RE.test(key)) throw invalid('Idempotency-Key', 'Idempotency-Key must be a UUID');
  const recordId = await sha256hex(`${caller.credentialId}\n${caller.actor.id}\n${op}\n${key.toLowerCase()}`);
  const payloadHash = await sha256hex(canonical(input));

  const replay = async (rec: Doc) => {
    if (rec.data.payloadHash !== payloadHash) throw new ApiError('IDEMPOTENCY_CONFLICT', 'this Idempotency-Key was already used with a different payload', { operation: op });
    const stored = JSON.parse(String(rec.data.response)) as WriteResult;
    return { status: 200, data: await readBack(stored.data), replayed: true };
  };

  for (let attempt = 0; ; attempt++) {
    const tx = await fs.begin();
    let committing = false;
    try {
      const existing = await fs.get('api_idempotency', recordId, tx);
      if (existing) { await fs.rollback(tx); return await replay(existing); }
      const r = await run(tx);
      const result: WriteResult = { status: r.status ?? 200, data: r.data };
      const record = fs.create('api_idempotency', recordId, {
        actor: caller.actor.id, credential: caller.credentialId, operation: op, payloadHash,
        response: JSON.stringify(result), createdAt: nowIso(),
      });
      committing = true;
      await fs.commit([record, ...r.writes], tx);
      return { ...result, data: await readBack(result.data), replayed: false };
    } catch (e) {
      await fs.rollback(tx);
      if (e instanceof ApiError) throw e;
      if (isContention(e) && attempt < 6) { await backoff(attempt); continue; }
      if (committing && isUncertain(e)) {
        const rec = await fs.get('api_idempotency', recordId).catch(() => null);
        if (rec) return await replay(rec);
        throw new ApiError('OUTCOME_UNKNOWN', 'the write was not acknowledged; resend with the same Idempotency-Key', { operation: op });
      }
      throw toApiError(e);
    }
  }
}

export type ActivityKind = 'task' | 'shopping' | 'event' | 'ticket' | 'tab' | 'place' | 'visit' | 'donation' | 'user' | 'settings';
/** The same record logActivity() in src/app/activity.ts writes. */
export function activity(fs: Firestore, by: Person, kind: ActivityKind, refId: string, action: string, text: string, extra: { subjectUid?: string; eventId?: string } = {}): Write {
  return fs.create('activity', autoId(), { kind, refId, action, text: text.slice(0, 500), by, at: nowIso(), subjectUid: extra.subjectUid || '', eventId: extra.eventId || '' });
}

/** An active team member (owner, manager or staff), as the {uid, name} the app stores. */
export async function member(fs: Firestore, uid: string, field: string, tx?: string): Promise<Person> {
  const u = await fs.get('users', uid, tx);
  if (!u || u.data.status !== 'active' || !TEAM_ROLES.has(String(u.data.role))) throw invalid(field, `${field} is not an active team member`);
  return { uid: u.id, name: String(u.data.displayName || '').slice(0, 80) };
}

/** The optional precondition every update/delete accepts: the updatedAt the caller last saw. */
export const IF_UPDATED_AT = { type: 'string', max: 40, he: 'updatedAt של הרשומה כפי שנקראה. אם השתנתה מאז (למשל באפליקציה) הפעולה נדחית ב־409 STALE_WRITE ולא דורסת' } as const;

/**
 * Refuses to overwrite a change made since the caller read the record. Inside the transaction the read
 * also locks the document, and the commit carries its updateTime as a precondition, so a change that
 * lands between this check and the commit fails the commit and the whole transaction is retried.
 */
export function fresh(d: Doc, ifUpdatedAt: unknown) {
  if (ifUpdatedAt === null || ifUpdatedAt === undefined) return;
  if (String(d.data.updatedAt ?? '') !== ifUpdatedAt) throw new ApiError('STALE_WRITE', 'the record changed since it was read', { currentUpdatedAt: d.data.updatedAt ?? null, sentUpdatedAt: ifUpdatedAt });
}

/** Reads a document inside the transaction, or fails with NOT_FOUND. */
export async function mustGet(fs: Firestore, col: string, id: string, tx: string, what: string): Promise<Doc> {
  const d = await fs.get(col, id, tx);
  if (!d) throw notFound(what);
  return d;
}

// ---------- read-back ----------

/** What a caller sees of a stored document: base64 images become flags, ticket secrets never leave. */
export function project(col: string, id: string, d: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { id };
  for (const [k, v] of Object.entries(d)) {
    if (k === 'secret') continue;
    if (k === 'photo' || k === 'donePhoto' || k === 'image' || k === 'dataUrl') { out['has' + k[0].toUpperCase() + k.slice(1)] = !!v; continue; }
    out[k] = v;
  }
  if (col === 'tickets') out.hasQr = true;
  return out;
}

export type Ref = { col: string; id: string; expected?: Record<string, unknown>; gone?: boolean };

/**
 * Reads every written document back after the commit. It runs only once the write is known to be stored,
 * so it never throws: a failed read gives "verified": false and "readBack": "unavailable".
 */
export const readBackRefs = (fs: Firestore) => async (data: Record<string, unknown>) => {
  const refs = (data.refs as Ref[]) || [];
  const { refs: _r, ...rest } = data;
  try {
    const records: Record<string, unknown>[] = [];
    let verified = true;
    for (const r of refs) {
      const d = await fs.get(r.col, r.id);
      if (r.gone) { verified &&= !d; continue; }
      if (!d) { verified = false; continue; }
      const rec = project(r.col, d.id, d.data);
      records.push(rec);
      if (r.expected) verified &&= Object.entries(r.expected).every(([k, v]) => canonical(rec[k]) === canonical(v));
    }
    return { ...rest, ...(records.length === 1 ? { record: records[0] } : { records }), verified };
  } catch {
    return { ...rest, verified: false, readBack: 'unavailable' };
  }
};

/** Equality query helper (outside any transaction). */
export async function whereEq(fs: Firestore, col: string, filters: Record<string, unknown>, limit = 500): Promise<Doc[]> {
  const fl = Object.entries(filters).map(([f, v]) => ({ fieldFilter: { field: { fieldPath: f }, op: 'EQUAL', value: enc(v) } }));
  return fs.query({ from: [{ collectionId: col }], ...(fl.length ? { where: fl.length === 1 ? fl[0] : { compositeFilter: { op: 'AND', filters: fl } } } : {}), limit });
}
