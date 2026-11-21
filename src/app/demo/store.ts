// Demo mode: walk through the app as one of the example people, on one of three designed days.
// Demo is a sandbox: while it is on, nothing is read from or written to Firestore, the Worker or push. Everything stays in this browser (localStorage).
// There is deliberately no "examples on top of my real account" mode: mixing the two let demo actions reach the real database.
// The clock is frozen at the scenario's moment (clock.ts), so relative texts match the designs.
import { useSyncExternalStore } from 'react';
import { freezeClock } from '../clock';
import { seedFor, type Scenario } from './seed';

export type Persona = 'real' | 'owner' | 'manager' | 'staff' | 'vendor' | 'helper' | 'guest' | 'blocked' | 'anon' | 'new';
export type { Scenario };
export type DemoState = { on: boolean; persona: Persona; scenario: Scenario };

/** 'real' means "not in demo": it is the persona only while demo is off. */
export const PERSONA_LABELS: Record<Persona, string> = {
  real: 'החשבון שלי', owner: 'בעלים · בני', manager: 'מנהלת · נועה', staff: 'מתנדב · יואב', vendor: 'בעל דוכן · רז', helper: 'עוזרת בדוכן · תמר',
  guest: 'אורחת · מיכל', blocked: 'חסום · יוסי', anon: 'אורח לא מחובר', new: 'הרשמה חדשה',
};
/** The role word in the demo strip: "מחובר כ<role>". */
export const PERSONA_ROLE: Record<Persona, string> = {
  real: '', owner: 'בעלים', manager: 'מנהלת', staff: 'מתנדב', vendor: 'בעל דוכן', helper: 'עוזרת בדוכן', guest: 'אורחת', blocked: 'חסום', anon: 'אורח', new: 'נרשם חדש',
};
/** Hints under each persona on the start page (Z1). */
export const PERSONA_HINTS: Partial<Record<Persona, string>> = {
  owner: 'רואה הכול, כולל כסף ומנהלים', manager: 'ניהול, אירועים ואנשים', staff: 'משימות, קניות והחווה', vendor: 'ההזמנה, האירוע והדוכן שלו', guest: 'כרטיסים, ביקור ותרומה',
};
/** The personas listed on the start page and in the switch sheet; the others are reachable by URL (?demo=helper, blocked, anon, new). */
export const LISTED_PERSONAS: Persona[] = ['owner', 'manager', 'staff', 'vendor', 'guest'];
export const NEW_DEMO_SESSION = { uid: 'demo-u-new', email: 'guest@example.test', displayName: '' };
export const PERSONA_UID: Record<Persona, string> = {
  real: '', owner: 'demo-u-beni', manager: 'demo-u-noa', staff: 'demo-u-yoav', vendor: 'demo-u-raz', helper: 'demo-u-tamar',
  guest: 'demo-u-michal', blocked: 'demo-u-yossi', anon: '', new: NEW_DEMO_SESSION.uid,
};

export const SCENARIOS: Record<Scenario, { label: string; now: string }> = {
  regular: { label: 'יום רגיל', now: '2026-11-19T10:30:00+02:00' },
  eventDay: { label: 'יום אירוע', now: '2026-11-28T17:20:00+02:00' },
  afterEvent: { label: 'אחרי אירוע', now: '2026-11-28T21:04:00+02:00' },
};
export const SCENARIO_KEYS = Object.keys(SCENARIOS) as Scenario[];

const KEY = 'farm-demo';
const OV_KEY = 'farm-demo-overrides';
const ST_KEY = 'farm-demo-states';
const listeners = new Set<() => void>();
const read = <T,>(k: string, fallback: T): T => { try { const s = localStorage.getItem(k); return s ? { ...fallback, ...JSON.parse(s) } : fallback; } catch { return fallback; } };

const OFF: DemoState = { on: false, persona: 'real', scenario: 'regular' };
/** on + 'real' is not a state: demo always has an example persona. */
const normalize = (s: DemoState, fallback: Persona = 'owner'): DemoState => {
  const scenario = s.scenario in SCENARIOS ? s.scenario : 'regular';
  if (!s.on) return { ...OFF, scenario };
  return { on: true, persona: s.persona === 'real' || !(s.persona in PERSONA_LABELS) ? fallback : s.persona, scenario };
};
let state: DemoState = read(KEY, OFF);
// a state saved by an older build (examples on top of the real account) goes back to the real account
if (state.on && state.persona === 'real') { state = { ...OFF }; try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode */ } }
state = normalize(state);
// ?demo=owner (or manager / staff / vendor / helper / guest / blocked / anon / new / on / off) and ?day=regular|eventDay|afterEvent switch from the address bar.
const params = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
const q = params.get('demo');
const day = params.get('day');
if (q !== null || day !== null) {
  if (q === 'off' || q === '0') state = { ...OFF };
  else if (q === '' || q === 'on' || q === '1') state = normalize({ ...state, on: true });
  else if (q && (Object.keys(PERSONA_LABELS) as Persona[]).includes(q as Persona)) state = normalize({ ...state, on: true, persona: q as Persona });
  if (day && day in SCENARIOS && state.on) state = { ...state, scenario: day as Scenario };
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode */ }
  const rest = new URLSearchParams(location.search); rest.delete('demo'); rest.delete('day');
  history.replaceState(history.state, '', location.pathname + (rest.toString() ? '?' + rest.toString() : ''));
}
const syncClock = () => freezeClock(state.on ? SCENARIOS[state.scenario].now : null);
syncClock();

/** Per-document overrides: path -> id -> data (null = deleted). Persisted so that demo edits survive a reload. */
type Overrides = Record<string, Record<string, Record<string, unknown> | null>>;
let overrides: Overrides = read(OV_KEY, {});
let version = 0;
const emit = () => { version++; listeners.forEach((l) => l()); };
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); localStorage.setItem(OV_KEY, JSON.stringify(overrides)); localStorage.setItem(ST_KEY, JSON.stringify(states)); } catch { /* private mode */ } };

export const getDemo = () => state;
export const useDemo = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, getDemo);
/** Changes whenever demo data changes; hooks use it as a dependency. */
export const useDemoVersion = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => version);

/** Choosing the persona 'real' leaves demo. Turning demo on without a persona starts as `fallback`. */
export function setDemo(next: Partial<DemoState>, fallback: Persona = 'owner') {
  state = next.persona === 'real' ? { ...OFF, scenario: state.scenario } : normalize({ ...state, ...next }, fallback);
  if (!state.on) states = { ...NO_STATES };
  syncClock(); persist(); emit();
}
export function resetDemoData() { overrides = {}; states = { ...NO_STATES }; persist(); emit(); }
export const isDemoId = (id: string) => id.startsWith('demo-');
export const newDemoId = (col: string) => `demo-${col.replace(/[^a-z]/gi, '').slice(0, 6)}-${Math.random().toString(36).slice(2, 9)}`;
/** True when every read and write must stay local. That is whenever demo is on. */
export const demoOnly = () => state.on;

// ---------- hard-to-reach states (Z3 "מצבים להדגמה"); they exist only in demo ----------
export type DemoStates = {
  /** C8: behave as if there is no reception, with pending writes. */
  offline: boolean;
  /** X1: the next take/assign/done write is refused as if someone else was first. */
  refuseNext: boolean;
  /** S3, L5, D10: show lists empty. */
  empty: boolean;
};
const NO_STATES: DemoStates = { offline: false, refuseNext: false, empty: false };
let states: DemoStates = read(ST_KEY, NO_STATES);
export const getDemoStates = () => states;
export const useDemoStates = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, getDemoStates);
export function setDemoStates(next: Partial<DemoStates>) { states = { ...states, ...next }; persist(); emit(); }
/** Consumes the "refuse next write" trigger: returns true once. */
export function takeRefusal() { if (!state.on || !states.refuseNext) return false; setDemoStates({ refuseNext: false }); return true; }

// ---------- data ----------
const seed = () => seedFor(state.scenario);
export function demoItems(path: string): Record<string, unknown>[] {
  const base = seed().collections[path] || [];
  const ov = overrides[path] || {};
  const seen = new Set<string>();
  const out: Record<string, unknown>[] = [];
  for (const item of base) {
    const id = String(item.id ?? item.uid); seen.add(id);
    if (id in ov) { if (ov[id]) out.push({ ...item, ...ov[id], id }); }
    else out.push({ ...item, id });
  }
  for (const [id, data] of Object.entries(ov)) if (!seen.has(id) && data) out.push({ ...data, id });
  return out;
}
export function demoDoc(path: string): Record<string, unknown> | null {
  const [col, id] = splitPath(path);
  const ov = overrides[col]?.[id];
  if (ov === null) return null;
  const s = seed();
  const base = (s.collections[col] || []).find((x) => String(x.id ?? x.uid) === id) || (s.documents[path] as Record<string, unknown> | undefined) || null;
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
