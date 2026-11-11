// One door to the data: Firestore when signed in for real, the demo store when a demo persona is active,
// and both merged when demo examples are shown on top of real data. Screens never import firebase/firestore directly.
import { useEffect, useMemo, useState } from 'react';
import {
  collection, doc, onSnapshot, query, where, orderBy, limit, setDoc, updateDoc, deleteDoc, writeBatch, runTransaction,
  type QueryConstraint, type DocumentData,
} from 'firebase/firestore';
import { db } from './firebase';
import { demoOnly, demoVisible, demoItems, demoDoc, demoSet, demoUpdate, demoDelete, isDemoId, newDemoId, useDemo, useDemoVersion } from './demo/store';

export type Op = '==' | '!=' | '<' | '<=' | '>' | '>=' | 'in' | 'array-contains';
export type Spec = { where?: [string, Op, unknown][]; orderBy?: [string, 'asc' | 'desc'][]; limit?: number };
type Row = Record<string, unknown>;
const rid = (r: Row) => String(r.id ?? r.uid ?? '');

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
  const local = demo.on && demo.persona !== 'real';
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
    if (!demo.on) return fs;
    const extra = applySpec(demoItems(path) as T[], spec);
    if (local) return { items: extra, loading: false, error: '' };
    const merged = applySpec([...fs.items.filter((i) => !isDemoId(rid(i))), ...extra], { orderBy: spec.orderBy, limit: spec.limit });
    return { items: merged, loading: fs.loading, error: fs.error };
  }, [fs, demo.on, local, path, specKey, enabled, v]);
}
export function useDoc<T extends Row>(path: string, enabled = true): { item: T | null; loading: boolean } {
  const demo = useDemo(); const v = useDemoVersion();
  const id = path.slice(path.lastIndexOf('/') + 1);
  const local = demo.on && (demo.persona !== 'real' || isDemoId(id));
  const [fs, setFs] = useState<{ item: T | null; loading: boolean }>({ item: null, loading: enabled && !local });
  useEffect(() => {
    if (!enabled || local) { setFs({ item: null, loading: false }); return; }
    setFs({ item: null, loading: true });
    return onSnapshot(doc(db, path), (snap) => setFs({ item: snap.exists() ? ({ id: snap.id, ...(snap.data() as DocumentData) } as unknown as T) : null, loading: false }), () => setFs({ item: null, loading: false }));
  }, [path, enabled, local]);
  return useMemo(() => {
    if (!enabled) return { item: null, loading: false };
    if (local) return { item: (demoDoc(path) as T | null), loading: false };
    if (demo.on && !fs.item && !fs.loading) return { item: (demoDoc(path) as T | null), loading: false };
    return fs;
  }, [fs, demo.on, local, path, enabled, v]);
}

// ---------- writes ----------
const routeLocal = (id: string) => demoOnly() || (demoVisible() && isDemoId(id));
export const newId = (col: string) => (demoOnly() ? newDemoId(col) : doc(collection(db, col)).id);
export const write = {
  async set(col: string, id: string, data: Record<string, unknown>) { if (routeLocal(id)) return demoSet(col, id, data); await setDoc(doc(db, col, id), data); },
  async update(col: string, id: string, patch: Record<string, unknown>) { if (routeLocal(id)) return demoUpdate(col, id, patch); await updateDoc(doc(db, col, id), patch); },
  async remove(col: string, id: string) { if (routeLocal(id)) return demoDelete(col, id); await deleteDoc(doc(db, col, id)); },
  /** Several sets/updates that should land together. */
  async batch(ops: { op: 'set' | 'update' | 'remove'; col: string; id: string; data?: Record<string, unknown> }[]) {
    if (!ops.length) return;
    if (ops.every((o) => routeLocal(o.id))) { for (const o of ops) o.op === 'set' ? demoSet(o.col, o.id, o.data!) : o.op === 'update' ? demoUpdate(o.col, o.id, o.data!) : demoDelete(o.col, o.id); return; }
    const b = writeBatch(db);
    for (const o of ops) { const r = doc(db, o.col, o.id); o.op === 'set' ? b.set(r, o.data!) : o.op === 'update' ? b.update(r, o.data!) : b.delete(r); }
    await b.commit();
  },
  /** Read-then-write on one document. `fn` returns the full new document, or undefined to leave it alone. */
  async tx(col: string, id: string, fn: (current: Record<string, unknown> | null) => Record<string, unknown> | undefined) {
    if (routeLocal(id)) { const next = fn(demoDoc(`${col}/${id}`)); if (next) demoSet(col, id, next); return; }
    await runTransaction(db, async (t) => { const ref = doc(db, col, id); const snap = await t.get(ref); const next = fn(snap.exists() ? (snap.data() as Record<string, unknown>) : null); if (next) t.set(ref, next); });
  },
};
