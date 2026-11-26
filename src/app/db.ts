// One door to the data: Firestore when signed in for real, the demo store while demo mode is on. Never both.
// Demo on => no Firestore listener and no Firestore write. Demo off => an id that belongs to the demo data is refused.
// Screens never import firebase/firestore directly.
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  collection, doc, documentId, onSnapshot, getDocsFromServer, query, where, orderBy, limit, setDoc, updateDoc, deleteDoc, writeBatch, arrayUnion, arrayRemove, increment, serverTimestamp, runTransaction,
  type QueryConstraint, type DocumentData,
} from 'firebase/firestore';
import { db } from './firebase';
import { readOnlyLock } from './switches';
import { demoOnly, demoItems, demoDoc, demoSet, demoUpdate, demoDelete, isDemoId, newDemoId, useDemo, useDemoVersion, takeRefusal, getDemoStates } from './demo/store';
import { now } from './clock';

export type Op = '==' | '!=' | '<' | '<=' | '>' | '>=' | 'in' | 'array-contains';
export type Spec = { where?: [string, Op, unknown][]; orderBy?: [string, 'asc' | 'desc'][]; limit?: number };
type Row = Record<string, unknown>;

// ---------- in-memory evaluation of a spec (for demo rows) ----------
const get = (o: Record<string, unknown>, f: string) => f.split('.').reduce<unknown>((v, k) => (v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined), o);
const cmp = (a: unknown, b: unknown) => (a === b ? 0 : a === null || a === undefined ? -1 : b === null || b === undefined ? 1 : a < b ? -1 : 1);
function matches(row: Record<string, unknown>, w: [string, Op, unknown]) {
  const v = get(row, w[0]); const x = w[2];
  switch (w[1]) {
    case '==': return v === x;
    case '!=': return v !== x && v !== undefined;
    case '<': return v != null && (v as never) < (x as never);
    case '<=': return v != null && (v as never) <= (x as never);
    case '>': return v != null && (v as never) > (x as never);
    case '>=': return v != null && (v as never) >= (x as never);
    case 'in': return Array.isArray(x) && x.includes(v);
    case 'array-contains': return Array.isArray(v) && v.includes(x);
  }
}
export function applySpec<T extends Row>(rows: T[], spec: Spec): T[] {
  let out = rows.filter((r) => (spec.where || []).every((w) => matches(r, w)));
  for (const [f] of spec.orderBy || []) out = out.filter((r) => get(r, f) !== undefined && get(r, f) !== null);
  if (spec.orderBy?.length) out = [...out].sort((a, b) => { for (const [f, d] of spec.orderBy!) { const c = cmp(get(a, f), get(b, f)); if (c) return d === 'desc' ? -c : c; } return 0; });
  if (spec.limit) out = out.slice(0, spec.limit);
  return out;
}
const toConstraints = (spec: Spec): QueryConstraint[] => [
  ...(spec.where || []).map(([f, op, v]) => where(f === '__id__' ? documentId() : f, op, v)),
  ...(spec.orderBy || []).map(([f, d]) => orderBy(f, d)),
  ...(spec.limit ? [limit(spec.limit)] : []),
];

// ---------- reads ----------
export type ListState<T> = { items: T[]; loading: boolean; error: string };
export function useList<T extends Row>(path: string, spec: Spec, enabled = true): ListState<T> {
  const demo = useDemo(); const v = useDemoVersion();
  const specKey = JSON.stringify(spec);
  const local = demo.on;
  const [fs, setFs] = useState<ListState<T>>({ items: [], loading: enabled && !local, error: '' });
  useEffect(() => {
    if (!enabled || local) { setFs({ items: [], loading: false, error: '' }); return; }
    setFs((s) => ({ ...s, loading: true, error: '' }));
    return onSnapshot(query(collection(db, path), ...toConstraints(spec)), { includeMetadataChanges: false },
      (snap) => setFs({ items: snap.docs.map((d) => ({ id: d.id, ...(d.data() as DocumentData) }) as unknown as T), loading: false, error: '' }),
      (e) => setFs({ items: [], loading: false, error: readError(e) }));
  }, [path, specKey, enabled, local]);
  return useMemo(() => {
    if (!enabled) return { items: [], loading: false, error: '' };
    if (local) return { items: applySpec(demoItems(path) as T[], spec), loading: false, error: '' };
    return fs;
  }, [fs, local, path, specKey, enabled, v]);
}
/**
 * The owners' switches (settings/switches). A copy from the phone's offline store may be hours old, so maintenance and
 * read-only count only once the server confirms them: a phone in the field never stays locked after the owners turn
 * them off, and an offline phone is not locked by a switch it cannot check.
 */
export function useSwitchesSnapshot<T extends Row & { maintenance?: boolean; readOnly?: boolean }>(): { item: T | null; loading: boolean } {
  const demo = useDemo();
  const [st, setSt] = useState<{ item: T | null; loading: boolean }>({ item: null, loading: !demo.on });
  useEffect(() => {
    if (demo.on) { setSt({ item: null, loading: false }); return; }
    return onSnapshot(doc(db, 'settings/switches'), { includeMetadataChanges: true }, (snap) => {
      if (!snap.exists()) { setSt({ item: null, loading: false }); return; }
      const d = { id: snap.id, ...(snap.data() as DocumentData) } as unknown as T;
      setSt({ item: snap.metadata.fromCache ? { ...d, maintenance: false, readOnly: false } : d, loading: false });
    }, () => setSt({ item: null, loading: false }));
  }, [demo.on]);
  return st;
}

export function useDoc<T extends Row>(path: string, enabled = true): { item: T | null; loading: boolean; error?: string } {
  const demo = useDemo(); const v = useDemoVersion();
  const local = demo.on;
  // the state remembers which document it holds, so a new path never shows the previous document, not even for one render
  const [fs, setFs] = useState<{ path: string; item: T | null; loading: boolean; error?: string }>({ path, item: null, loading: enabled && !local });
  useEffect(() => {
    if (!enabled || local) { setFs({ path, item: null, loading: false }); return; }
    setFs({ path, item: null, loading: true });
    return onSnapshot(doc(db, path), (snap) => setFs({ path, item: snap.exists() ? ({ id: snap.id, ...(snap.data() as DocumentData) } as unknown as T) : null, loading: false }), (e) => setFs({ path, item: null, loading: false, error: readError(e) })); // a failed read is not "the document does not exist"
  }, [path, enabled, local]);
  return useMemo(() => {
    if (!enabled) return { item: null, loading: false };
    if (local) return { item: (demoDoc(path) as T | null), loading: false };
    if (fs.path !== path) return { item: null, loading: true };
    return { item: fs.item, loading: fs.loading, error: fs.error };
  }, [fs, local, path, enabled, v]);
}

/** One read from the server, no listener, never the local cache (which may hold only part of the answer). For maintenance work.
 *  Field '__id__' means the document id. */
export async function readOnce<T extends Row>(path: string, spec: Spec): Promise<T[]> {
  if (demoOnly()) return applySpec(demoItems(path) as T[], spec);
  const snap = await getDocsFromServer(query(collection(db, path), ...toConstraints(spec)));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as DocumentData) }) as unknown as T);
}

// ---------- writes ----------
// The farm has almost no reception, so no screen may wait for the server. A write is applied to the local cache at once
// (Firestore does that itself) and every list updates immediately. `settle` gives the server a short moment to answer:
// a quick refusal still reaches the form that asked, a slow or offline write resolves now and reports a late refusal to the shell.
const readError = (e: unknown) => {
  const code = (e as { code?: string })?.code || '';
  if (code === 'permission-denied') return 'אין הרשאה לפעולה הזו';
  if (code === 'failed-precondition') return 'המערכת עוד מתכוננת. נסו שוב בעוד דקה';
  if (code === 'unavailable') return 'אין קליטה כרגע';
  return (e as Error)?.message || 'הפעולה לא הושלמה';
};
export type SyncState = { pending: number; failure: { id: number; text: string } | null };
let sync: SyncState = { pending: 0, failure: null };
const syncListeners = new Set<() => void>();
const setSync = (next: Partial<SyncState>) => { sync = { ...sync, ...next }; syncListeners.forEach((l) => l()); };
/** How many writes still wait for the server, and the last write the server refused after the screen had moved on. */
export const useSync = () => useSyncExternalStore((l) => { syncListeners.add(l); return () => syncListeners.delete(l); }, () => sync);
export const syncState = () => sync;
let failureId = 0;
function settle(p: Promise<unknown>, quiet = false, wait = false): Promise<boolean> {
  setSync({ pending: sync.pending + 1 });
  return new Promise<boolean>((resolve, reject) => {
    let answered = false;
    // `wait`: maintenance work that must know the server stored it; it resolves only on the server's answer
    const timer = wait ? undefined : setTimeout(() => { answered = true; resolve(false); }, navigator.onLine ? 1500 : 0);
    p.then(
      () => { clearTimeout(timer); setSync({ pending: Math.max(0, sync.pending - 1) }); if (!answered) resolve(true); },
      (e) => {
        clearTimeout(timer); setSync({ pending: Math.max(0, sync.pending - 1) });
        const err = new Error(readError(e));
        if (!answered) reject(err); else if (!quiet) setSync({ failure: { id: ++failureId, text: err.message } });
      },
    );
  });
}

/** Field changes that must not depend on the copy this phone happens to hold: two phones can add to the same list at once. */
type FieldOp = { __op: 'union' | 'remove'; values: unknown[] } | { __op: 'inc'; by: number } | { __op: 'now' };
export const push = (...values: unknown[]): FieldOp => ({ __op: 'union', values });
export const pull = (...values: unknown[]): FieldOp => ({ __op: 'remove', values });
export const inc = (by: number): FieldOp => ({ __op: 'inc', by });
/** The server's time when the write arrives (also for a write queued offline). Demo mode: this device's time. */
export const serverNow = (): FieldOp => ({ __op: 'now' });
const isOp = (v: unknown): v is FieldOp => !!v && typeof v === 'object' && '__op' in (v as object);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const toFirestore = (patch: Record<string, unknown>) => Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, !isOp(v) ? v : v.__op === 'now' ? serverTimestamp() : v.__op === 'inc' ? increment(v.by) : v.__op === 'union' ? arrayUnion(...v.values) : arrayRemove(...v.values)]));
const isMap = (value: unknown): value is Row => !!value && typeof value === 'object' && !Array.isArray(value);
function mergeLocal(current: Row, patch: Row): Row {
  const merged = Object.entries(patch).map(([key, value]) => {
    const existing = current[key];
    return [key, isMap(existing) && isMap(value) && Object.keys(value).length ? mergeLocal(existing, value) : value];
  });
  return { ...current, ...Object.fromEntries(merged) };
}
function applyLocal(cur: Record<string, unknown>, patch: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...cur };
  for (const [k, v] of Object.entries(patch)) {
    if (!isOp(v)) { out[k] = v; continue; }
    if (v.__op === 'now') { out[k] = now().toISOString(); continue; }
    if (v.__op === 'inc') out[k] = Math.round(((Number(cur[k]) || 0) + v.by) * 100) / 100;
    else {
      const list = Array.isArray(cur[k]) ? (cur[k] as unknown[]) : [];
      out[k] = v.__op === 'union' ? [...list, ...v.values.filter((x) => !list.some((y) => same(x, y)))] : list.filter((y) => !v.values.some((x) => same(x, y)));
    }
  }
  return out;
}

/** Demo on: everything is local. Demo off: a demo id or a path under a demo document must never reach Firestore. */
const isDemoRef = (col: string, id: string) => isDemoId(id) || col.split('/').some(isDemoId);
function real(col: string, id: string) {
  if (isDemoRef(col, id)) throw new Error('זה פריט לדוגמה. הוא לא נשמר בשרת.');
  // the owners turned on read-only from the console (switches.ts): nothing reaches Firestore, owners excepted
  const lock = readOnlyLock();
  if (lock) throw new Error(lock);
  return doc(db, col, id);
}
export const newId = (col: string) => (demoOnly() ? newDemoId(col) : doc(collection(db, col)).id);
type WriteOpts = { quiet?: boolean; wait?: boolean };
export const write = {
  async set(col: string, id: string, data: Record<string, unknown>, o: WriteOpts = {}) { if (demoOnly()) return demoSet(col, id, applyLocal({}, data)); await settle(setDoc(real(col, id), toFirestore(data)), o.quiet); },
  async merge(col: string, id: string, data: Record<string, unknown>) {
    if (demoOnly()) return demoSet(col, id, mergeLocal(demoDoc(col + '/' + id) || {}, data));
    await settle(setDoc(real(col, id), data, { merge: true }));
  },
  async update(col: string, id: string, patch: Record<string, unknown>, o: WriteOpts = {}) {
    if (demoOnly()) return demoSet(col, id, applyLocal(demoDoc(`${col}/${id}`) || {}, patch));
    await settle(updateDoc(real(col, id), toFirestore(patch)), o.quiet);
  },
  async remove(col: string, id: string, o: WriteOpts = {}) { if (demoOnly()) return demoDelete(col, id); await settle(deleteDoc(real(col, id)), o.quiet); },
  /** Several sets/updates that should land together. */
  async batch(ops: { op: 'set' | 'update' | 'remove'; col: string; id: string; data?: Record<string, unknown> }[], o: WriteOpts = {}) {
    if (!ops.length) return true;
    if (demoOnly()) { for (const x of ops) x.op === 'set' ? demoSet(x.col, x.id, x.data!) : x.op === 'update' ? demoSet(x.col, x.id, applyLocal(demoDoc(`${x.col}/${x.id}`) || {}, x.data!)) : demoDelete(x.col, x.id); return true; }
    const refs = ops.map((x) => real(x.col, x.id)); // throws before anything is queued if one of them is a demo id
    const b = writeBatch(db);
    ops.forEach((x, i) => { x.op === 'set' ? b.set(refs[i], x.data!) : x.op === 'update' ? b.update(refs[i], toFirestore(x.data!)) : b.delete(refs[i]); });
    return settle(b.commit(), o.quiet, o.wait);
  },
};

// ---------- transactions with conflict detection (take / release / assign, gate scans) ----------
/** Someone else changed the document first (X1). The list already shows the real state. */
export class ConflictError extends Error { conflict = true; constructor(text = 'לא נשמר. מישהו אחר הקדים אותך.') { super(text); } }
export const isConflict = (e: unknown) => !!(e as { conflict?: boolean })?.conflict;
export type Tx = {
  get<T extends Row>(col: string, id: string): Promise<(T & { id: string }) | null>;
  set(col: string, id: string, data: Record<string, unknown>): void;
  update(col: string, id: string, patch: Record<string, unknown>): void;
  remove(col: string, id: string): void;
};
export type TransactOpts = {
  /** The gate: when the server does not answer in time (weak reception, or "online" without a network), the write is saved on
   *  this phone as an ordinary queued write, as when offline, instead of failing. A server that answers still refuses a second entry. */
  queue?: boolean;
  /** Never use cached data or queue mutations for this transaction. Its caller handles the server error. */
  serverOnly?: boolean;
};
/** How long a queued-on-failure transaction waits for the server before it saves on the phone (tests shorten it). */
export const txTiming = { waitMs: 4000 };
const unreachable = (e: unknown) => ['unavailable', 'deadline-exceeded'].includes((e as { code?: string })?.code || '');
/** The transaction gave up waiting and the phone saved the write itself: the late attempt must not commit too. */
class Abandoned extends Error {}
/** Reads and writes that must see the server's current copy: "take only if still free".
 *  Throw ConflictError inside `fn` when the precondition fails. A refusal by the rules is reported as such ("אין הרשאה"), not as X1.
 *  Demo: runs on the local copy (Z3 "refused write" makes the next one fail). Offline: a transaction cannot reach the server,
 *  so it runs on the cached copy as an ordinary write; the rules refuse a late conflicting write and the shell shows X1.
 *  `queue`: the same when the server cannot be reached in time (TransactOpts). */
export async function transact<T>(fn: (tx: Tx) => Promise<T>, o: TransactOpts = {}): Promise<T> {
  const offline = (typeof navigator !== 'undefined' && navigator.onLine === false) || getDemoStates().offline;
  if (o.serverOnly && offline) throw new ConflictError('אין חיבור לאינטרנט. נסו שוב אחרי החיבור.');
  if (demoOnly()) {
    if (takeRefusal()) throw new ConflictError();
    const ops: (() => void)[] = [];
    const out = await fn({
      get: async (col, id) => (demoDoc(`${col}/${id}`) as never) || null,
      set: (col, id, data) => ops.push(() => demoSet(col, id, applyLocal({}, data))),
      update: (col, id, patch) => ops.push(() => demoSet(col, id, applyLocal(demoDoc(`${col}/${id}`) || {}, patch))),
      remove: (col, id) => ops.push(() => demoDelete(col, id)),
    });
    ops.forEach((o) => o());
    return out;
  }
  if (offline) return queued(fn);
  setSync({ pending: sync.pending + 1 });
  let abandoned = false, committing = false;
  const attempt = runTransaction(db, async (t) => {
    const ops: ((t: import('firebase/firestore').Transaction) => void)[] = [];
    const out = await fn({
      get: async (col, id) => { const snap = await t.get(real(col, id)); return snap.exists() ? ({ id: snap.id, ...(snap.data() as DocumentData) } as never) : null; },
      set: (col, id, data) => ops.push((tt) => tt.set(real(col, id), toFirestore(data))),
      update: (col, id, patch) => ops.push((tt) => tt.update(real(col, id), toFirestore(patch))),
      remove: (col, id) => ops.push((tt) => tt.delete(real(col, id))),
    });
    if (abandoned) throw new Abandoned();
    committing = true; // from here the attempt may still land after the phone gave up waiting
    ops.forEach((o) => o(t));
    return out;
  });
  try {
    if (o.serverOnly || !o.queue) return await attempt;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<'late'>((r) => { timer = setTimeout(() => r('late'), txTiming.waitMs); });
    const first = await Promise.race([attempt.then((v) => ({ v })), late]).finally(() => clearTimeout(timer));
    if (first !== 'late') return first.v;
    abandoned = true;
    return await queued(fn, committing ? attempt : undefined);
  } catch (e) {
    if (isConflict(e) || o.serverOnly) throw e;
    if (o.queue && unreachable(e)) { abandoned = true; return await queued(fn); }
    throw new Error(readError(e));
  } finally { setSync({ pending: Math.max(0, sync.pending - 1) }); }
}
/** `fn` on the cached copy, its writes as one queued batch (Firestore sends it when the network is back).
 *  `attempt`: the transaction this replaces, when its commit was already on the way. If it still landed, the batch repeats it
 *  and the rules refuse the repeat (the scan id is fixed per entry), so that refusal is not a failure the shell should show. */
async function queued<T>(fn: (tx: Tx) => Promise<T>, attempt?: Promise<unknown>): Promise<T> {
  const ops: Parameters<typeof write.batch>[0] = [];
  const cache = new Map<string, unknown>();
  const out = await fn({
    get: async (col, id) => { const k = `${col}/${id}`; if (!cache.has(k)) cache.set(k, await readCached(col, id)); return cache.get(k) as never; },
    set: (col, id, data) => ops.push({ op: 'set', col, id, data }),
    update: (col, id, patch) => ops.push({ op: 'update', col, id, data: patch }),
    remove: (col, id) => ops.push({ op: 'remove', col, id }),
  });
  if (!ops.length) return out;
  const refs = ops.map((x) => real(x.col, x.id));
  const b = writeBatch(db);
  ops.forEach((x, i) => {
    if (x.op === 'remove') b.delete(refs[i]);
    else if (x.op === 'set') b.set(refs[i], toFirestore(x.data!));
    else b.update(refs[i], toFirestore(x.data!));
  });
  const commit = b.commit();
  await settle(attempt ? commit.catch(async (e) => { if (await attempt.then(() => true, () => false)) return; throw e; }) : commit);
  return out;
}
async function readCached(col: string, id: string): Promise<Row | null> {
  const { getDocFromCache } = await import('firebase/firestore');
  // a plain read of the phone's copy: read-only (real() refuses) must not make a queued change see "not found"
  try { const snap = await getDocFromCache(doc(db, col, id)); return snap.exists() ? { id: snap.id, ...(snap.data() as DocumentData) } : null; } catch { return null; }
}
