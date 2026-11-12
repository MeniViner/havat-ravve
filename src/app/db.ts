// One door to the data: Firestore when signed in for real, the demo store while demo mode is on. Never both.
// Demo on => no Firestore listener and no Firestore write. Demo off => an id that belongs to the demo data is refused.
// Screens never import firebase/firestore directly.
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  collection, doc, onSnapshot, query, where, orderBy, limit, setDoc, updateDoc, deleteDoc, writeBatch, arrayUnion, arrayRemove, increment,
  type QueryConstraint, type DocumentData,
} from 'firebase/firestore';
import { db } from './firebase';
import { demoOnly, demoItems, demoDoc, demoSet, demoUpdate, demoDelete, isDemoId, newDemoId, useDemo, useDemoVersion } from './demo/store';

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
  ...(spec.where || []).map(([f, op, v]) => where(f, op, v)),
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
function settle(p: Promise<unknown>, quiet = false): Promise<void> {
  setSync({ pending: sync.pending + 1 });
  return new Promise<void>((resolve, reject) => {
    let answered = false;
    const timer = setTimeout(() => { answered = true; resolve(); }, navigator.onLine ? 1500 : 0);
    p.then(
      () => { clearTimeout(timer); setSync({ pending: Math.max(0, sync.pending - 1) }); if (!answered) resolve(); },
      (e) => {
        clearTimeout(timer); setSync({ pending: Math.max(0, sync.pending - 1) });
        const err = new Error(readError(e));
        if (!answered) reject(err); else if (!quiet) setSync({ failure: { id: ++failureId, text: err.message } });
      },
    );
  });
}

/** Field changes that must not depend on the copy this phone happens to hold: two phones can add to the same list at once. */
type FieldOp = { __op: 'union' | 'remove'; values: unknown[] } | { __op: 'inc'; by: number };
export const push = (...values: unknown[]): FieldOp => ({ __op: 'union', values });
export const pull = (...values: unknown[]): FieldOp => ({ __op: 'remove', values });
export const inc = (by: number): FieldOp => ({ __op: 'inc', by });
const isOp = (v: unknown): v is FieldOp => !!v && typeof v === 'object' && '__op' in (v as object);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const toFirestore = (patch: Record<string, unknown>) => Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, !isOp(v) ? v : v.__op === 'inc' ? increment(v.by) : v.__op === 'union' ? arrayUnion(...v.values) : arrayRemove(...v.values)]));
function applyLocal(cur: Record<string, unknown>, patch: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...cur };
  for (const [k, v] of Object.entries(patch)) {
    if (!isOp(v)) { out[k] = v; continue; }
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
  return doc(db, col, id);
}
export const newId = (col: string) => (demoOnly() ? newDemoId(col) : doc(collection(db, col)).id);
type WriteOpts = { quiet?: boolean };
export const write = {
  async set(col: string, id: string, data: Record<string, unknown>, o: WriteOpts = {}) { if (demoOnly()) return demoSet(col, id, data); await settle(setDoc(real(col, id), data), o.quiet); },
  async update(col: string, id: string, patch: Record<string, unknown>, o: WriteOpts = {}) {
    if (demoOnly()) return demoSet(col, id, applyLocal(demoDoc(`${col}/${id}`) || {}, patch));
    await settle(updateDoc(real(col, id), toFirestore(patch)), o.quiet);
  },
  async remove(col: string, id: string, o: WriteOpts = {}) { if (demoOnly()) return demoDelete(col, id); await settle(deleteDoc(real(col, id)), o.quiet); },
  /** Several sets/updates that should land together. */
  async batch(ops: { op: 'set' | 'update' | 'remove'; col: string; id: string; data?: Record<string, unknown> }[], o: WriteOpts = {}) {
    if (!ops.length) return;
    if (demoOnly()) { for (const x of ops) x.op === 'set' ? demoSet(x.col, x.id, x.data!) : x.op === 'update' ? demoSet(x.col, x.id, applyLocal(demoDoc(`${x.col}/${x.id}`) || {}, x.data!)) : demoDelete(x.col, x.id); return; }
    const refs = ops.map((x) => real(x.col, x.id)); // throws before anything is queued if one of them is a demo id
    const b = writeBatch(db);
    ops.forEach((x, i) => { x.op === 'set' ? b.set(refs[i], x.data!) : x.op === 'update' ? b.update(refs[i], toFirestore(x.data!)) : b.delete(refs[i]); });
    await settle(b.commit(), o.quiet);
  },
};
