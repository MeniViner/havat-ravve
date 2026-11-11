// One door to the data: Firestore when signed in for real, the demo store while demo mode is on. Never both.
// Demo on => no Firestore listener and no Firestore write. Demo off => an id that belongs to the demo data is refused.
// Screens never import firebase/firestore directly.
import { useEffect, useMemo, useState } from 'react';
import {
  collection, doc, onSnapshot, query, where, orderBy, limit, setDoc, updateDoc, deleteDoc, writeBatch, runTransaction,
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
      (e) => setFs({ items: [], loading: false, error: e.message }));
  }, [path, specKey, enabled, local]);
  return useMemo(() => {
    if (!enabled) return { items: [], loading: false, error: '' };
    if (local) return { items: applySpec(demoItems(path) as T[], spec), loading: false, error: '' };
    return fs;
  }, [fs, local, path, specKey, enabled, v]);
}
export function useDoc<T extends Row>(path: string, enabled = true): { item: T | null; loading: boolean } {
  const demo = useDemo(); const v = useDemoVersion();
  const local = demo.on;
  // the state remembers which document it holds, so a new path never shows the previous document, not even for one render
  const [fs, setFs] = useState<{ path: string; item: T | null; loading: boolean }>({ path, item: null, loading: enabled && !local });
  useEffect(() => {
    if (!enabled || local) { setFs({ path, item: null, loading: false }); return; }
    setFs({ path, item: null, loading: true });
    return onSnapshot(doc(db, path), (snap) => setFs({ path, item: snap.exists() ? ({ id: snap.id, ...(snap.data() as DocumentData) } as unknown as T) : null, loading: false }), () => setFs({ path, item: null, loading: false }));
  }, [path, enabled, local]);
  return useMemo(() => {
    if (!enabled) return { item: null, loading: false };
    if (local) return { item: (demoDoc(path) as T | null), loading: false };
    if (fs.path !== path) return { item: null, loading: true };
    return { item: fs.item, loading: fs.loading };
  }, [fs, local, path, enabled, v]);
}

// ---------- writes ----------
/** Demo on: everything is local. Demo off: a demo id or a path under a demo document must never reach Firestore. */
const isDemoRef = (col: string, id: string) => isDemoId(id) || col.split('/').some(isDemoId);
function real(col: string, id: string) {
  if (isDemoRef(col, id)) throw new Error('זה פריט לדוגמה. הוא לא נשמר בשרת.');
  return doc(db, col, id);
}
export const newId = (col: string) => (demoOnly() ? newDemoId(col) : doc(collection(db, col)).id);
export const write = {
  async set(col: string, id: string, data: Record<string, unknown>) { if (demoOnly()) return demoSet(col, id, data); await setDoc(real(col, id), data); },
  async update(col: string, id: string, patch: Record<string, unknown>) { if (demoOnly()) return demoUpdate(col, id, patch); await updateDoc(real(col, id), patch); },
  async remove(col: string, id: string) { if (demoOnly()) return demoDelete(col, id); await deleteDoc(real(col, id)); },
  /** Several sets/updates that should land together. */
  async batch(ops: { op: 'set' | 'update' | 'remove'; col: string; id: string; data?: Record<string, unknown> }[]) {
    if (!ops.length) return;
    if (demoOnly()) { for (const o of ops) o.op === 'set' ? demoSet(o.col, o.id, o.data!) : o.op === 'update' ? demoUpdate(o.col, o.id, o.data!) : demoDelete(o.col, o.id); return; }
    const refs = ops.map((o) => real(o.col, o.id)); // throws before anything is queued if one of them is a demo id
    const b = writeBatch(db);
    ops.forEach((o, i) => { o.op === 'set' ? b.set(refs[i], o.data!) : o.op === 'update' ? b.update(refs[i], o.data!) : b.delete(refs[i]); });
    await b.commit();
  },
  /** Read-then-write on one document. `fn` returns the full new document, or undefined to leave it alone. */
  async tx(col: string, id: string, fn: (current: Record<string, unknown> | null) => Record<string, unknown> | undefined) {
    if (demoOnly()) { const next = fn(demoDoc(`${col}/${id}`)); if (next) demoSet(col, id, next); return; }
    const ref = real(col, id);
    await runTransaction(db, async (t) => { const snap = await t.get(ref); const next = fn(snap.exists() ? (snap.data() as Record<string, unknown>) : null); if (next) t.set(ref, next); });
  },
};
