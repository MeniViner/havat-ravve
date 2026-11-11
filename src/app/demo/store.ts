// Demo mode: walk through the app as one of the example people (owner / manager / staff / guest ...).
// Demo is a sandbox: while it is on, nothing is read from or written to Firestore. Everything stays in this browser (localStorage).
// There is deliberately no "examples on top of my real account" mode: mixing the two let demo actions reach the real database.
import { useSyncExternalStore } from 'react';
import { collections as baseCollections, documents as baseDocuments, U } from './data';

export type Persona = 'real' | 'owner' | 'manager' | 'staff' | 'guest' | 'blocked' | 'anon';
export type DemoState = { on: boolean; persona: Persona };
/** 'real' means "not in demo": it is the persona only while demo is off. */
export const PERSONA_LABELS: Record<Persona, string> = { real: 'החשבון שלי', owner: 'בעלים · בני', manager: 'מנהלת · נועה', staff: 'מתנדב · יואב', guest: 'אורחת · מיכל', blocked: 'חסום · יוסי', anon: 'אורח לא מחובר' };
export const PERSONA_UID: Record<Persona, string> = { real: '', owner: U.beni, manager: U.noa, staff: U.yoav, guest: U.michal, blocked: U.yossi, anon: '' };

const KEY = 'farm-demo';
const OV_KEY = 'farm-demo-overrides';
const listeners = new Set<() => void>();
const read = <T,>(k: string, fallback: T): T => { try { const s = localStorage.getItem(k); return s ? { ...fallback, ...JSON.parse(s) } : fallback; } catch { return fallback; } };

/** on + 'real' is not a state: demo always has an example persona. */
const normalize = (s: DemoState, fallback: Persona = 'owner'): DemoState => (!s.on ? { on: false, persona: 'real' } : s.persona === 'real' || !(s.persona in PERSONA_LABELS) ? { on: true, persona: fallback } : s);
let state: DemoState = read(KEY, { on: false, persona: 'real' as Persona });
// a state saved by an older build (examples on top of the real account) goes back to the real account
if (state.on && state.persona === 'real') { state = { on: false, persona: 'real' }; try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode */ } }
// ?demo=owner (or staff / guest / on / off) switches from the address bar, for sharing a link with Beni.
const q = new URLSearchParams(location.search).get('demo');
if (q !== null) {
  if (q === 'off' || q === '0') state = { on: false, persona: 'real' };
  else if (q === '' || q === 'on' || q === '1') state = normalize({ ...state, on: true });
  else if ((Object.keys(PERSONA_LABELS) as Persona[]).includes(q as Persona)) state = { on: true, persona: q as Persona };
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
  const rest = new URLSearchParams(location.search); rest.delete('demo');
  history.replaceState(null, '', location.pathname + (rest.toString() ? '?' + rest.toString() : ''));
}

/** Per-document overrides: path -> id -> data (null = deleted). Persisted so that demo edits survive a reload. */
type Overrides = Record<string, Record<string, Record<string, unknown> | null>>;
let overrides: Overrides = read(OV_KEY, {});
let version = 0;
const emit = () => { version++; listeners.forEach((l) => l()); };
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); localStorage.setItem(OV_KEY, JSON.stringify(overrides)); } catch {} };

export const getDemo = () => state;
export const useDemo = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, getDemo);
/** Changes whenever demo data changes; hooks use it as a dependency. */
export const useDemoVersion = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => version);

/** Choosing the persona 'real' leaves demo. Turning demo on without a persona starts as `fallback`. */
export function setDemo(next: Partial<DemoState>, fallback: Persona = 'owner') {
  state = next.persona === 'real' ? { on: false, persona: 'real' } : normalize({ ...state, ...next }, fallback);
  persist(); emit();
}
export function resetDemoData() { overrides = {}; persist(); emit(); }
export const isDemoId = (id: string) => id.startsWith('demo-');
export const newDemoId = (col: string) => `demo-${col.replace(/[^a-z]/gi, '').slice(0, 6)}-${Math.random().toString(36).slice(2, 9)}`;
/** True when every read and write must stay local. That is whenever demo is on. */
export const demoOnly = () => state.on;

export function demoItems(path: string): Record<string, unknown>[] {
  const base = baseCollections[path] || [];
  const ov = overrides[path] || {};
  const seen = new Set<string>();
  const out: Record<string, unknown>[] = [];
  for (const item of base) {
    const id = String(item.id ?? item.uid); seen.add(id);
    if (id in ov) { if (ov[id]) out.push({ ...item, ...ov[id], id }); }
    else out.push(item);
  }
  for (const [id, data] of Object.entries(ov)) if (!seen.has(id) && data) out.push({ ...data, id });
  return out;
}
export function demoDoc(path: string): Record<string, unknown> | null {
  const [col, id] = splitPath(path);
  const ov = overrides[col]?.[id];
  if (ov === null) return null;
  const base = (baseCollections[col] || []).find((x) => (x.id ?? x.uid) === id) || (baseDocuments[path] as Record<string, unknown> | undefined) || null;
  if (!base && !ov) return null;
  return { ...(base || {}), ...(ov || {}), id };
}
const splitPath = (path: string): [string, string] => { const i = path.lastIndexOf('/'); return [path.slice(0, i), path.slice(i + 1)]; };

export function demoSet(col: string, id: string, data: Record<string, unknown>) { overrides[col] = { ...(overrides[col] || {}), [id]: { ...data } }; persist(); emit(); }
export function demoUpdate(col: string, id: string, patch: Record<string, unknown>) {
  const cur = demoDoc(`${col}/${id}`) || {};
  overrides[col] = { ...(overrides[col] || {}), [id]: { ...cur, ...patch } }; persist(); emit();
}
export function demoDelete(col: string, id: string) { overrides[col] = { ...(overrides[col] || {}), [id]: null }; persist(); emit(); }
