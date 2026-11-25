// Where the console is: #/<tab> (as always) and, after it, what is selected there: #/people/d-matan, #/data/tasks/t-8f2c1a.
// Selecting a row replaces the address (no history entry per arrow key), so a reload comes back to the same row.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

const parse = () => {
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  const rest = parts.slice(1).map((x) => { try { return decodeURIComponent(x); } catch { return x; } }).filter(Boolean);
  return { tab: parts[0] || '', rest };
};
const EVENT = 'console-route';
export const currentTab = () => parse().tab;
export function setRest(rest: string[]) {
  const { tab } = parse();
  history.replaceState(history.state, '', `${location.pathname}${location.search}#/${[tab, ...rest.map(encodeURIComponent)].join('/')}`);
  dispatchEvent(new Event(EVENT));
}
/** A link to a screen, with a row selected in it when given. */
export const toTab = (tab: string, ...rest: string[]) => `#/${[tab, ...rest.map(encodeURIComponent)].join('/')}`;

/** What is selected on this screen, from the address, and how to select something else ([] = nothing). */
export function useRest(tab: string): [string[], (rest: string[]) => void] {
  const read = () => { const r = parse(); return r.tab === tab ? r.rest.join('\n') : ''; };
  const [cur, setCur] = useState(read);
  useEffect(() => {
    const on = () => setCur(read());
    addEventListener(EVENT, on); addEventListener('hashchange', on);
    return () => { removeEventListener(EVENT, on); removeEventListener('hashchange', on); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);
  const set = useCallback((rest: string[]) => { if (parse().tab === tab) setRest(rest); }, [tab]);
  return [cur ? cur.split('\n') : [], set];
}
/**
 * One selected id: the one in the address if it is in the list, else (when `auto`) the first, which then goes into the
 * address too, so it stays selected when an action moves it or changes the list. When only the selected row left the
 * list (it was just deleted, sent or cancelled), nothing is selected: the next row must not slide under the same button.
 * `alias`: another name a link may call a row by (a key's label), as its id.
 */
export function useSelected(tab: string, ids: string[], auto = true, alias?: (want: string) => string | undefined): [string | null, (id: string | null) => void] {
  const [rest, set] = useRest(tab);
  const asked = rest[0] || null;
  const want = (asked && !ids.includes(asked) && alias?.(asked)) || asked;
  const before = useRef<{ ids: string[]; emptied: string | null }>({ ids: [], emptied: null });
  const key = ids.join('\n');
  let id: string | null = null;
  if (want && ids.includes(want)) id = want;
  else if (ids.length && auto) {
    const b = before.current;
    if (want && b.ids.includes(want) && b.ids.filter((x) => x !== want).join('\n') === key) b.emptied = key;
    id = b.emptied === key ? null : ids[0];
  }
  useEffect(() => {
    if (!ids.length) return;
    if (id) before.current = { ids, emptied: null };
    if (id !== asked) { if (id) set([id]); else if (auto) set([]); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, asked, want, key, auto, set]);
  return [id, useCallback((x: string | null) => { before.current.emptied = null; set(x ? [x] : []); }, [set])];
}
// A window's listeners run in the order they were added, so this one is added once, before any screen's own.
let guard: { dirty: () => boolean; ask: (go: () => void) => void } | null = null;
// Every entry of the history carries its place in it, so a refused move goes back over the same way and an accepted one
// goes on over it: the Back button then leads where it did before.
const placeOf = () => (history.state as { at?: number } | null)?.at;
const mark = (at: number) => history.replaceState({ ...(history.state as object | null), at }, '');
let place = placeOf() ?? 0;
mark(place);
/** The next change of address is this file's own: 'back' is not told to the screens, 'on' is. */
let own: 'back' | 'on' | null = null;
window.addEventListener('hashchange', (e: HashChangeEvent) => {
  const to = placeOf() ?? place + 1;
  if (placeOf() === undefined) mark(to);
  const step = to - place;
  if (own === 'back') { own = null; place = to; e.stopImmediatePropagation(); return; }
  if (own === 'on' || !step || !guard?.dirty()) { own = null; place = to; return; }
  e.stopImmediatePropagation();
  place = to;
  own = 'back';
  history.go(-step);
  guard.ask(() => { own = 'on'; history.go(step); });
});
/**
 * Work that was not saved is not dropped without asking: `dirty` says if there is any. A move to another screen (a link,
 * the back button) is put back and handed to `ask` with a way to go on; closing the tab asks the browser's own question.
 */
export function useLeaveGuard(dirty: () => boolean, ask: (go: () => void) => void) {
  const now = useRef({ dirty, ask });
  now.current = { dirty, ask };
  useEffect(() => {
    guard = { dirty: () => now.current.dirty(), ask: (go) => now.current.ask(go) };
    const mine = guard;
    const onClose = (e: BeforeUnloadEvent) => { if (now.current.dirty()) e.preventDefault(); };
    addEventListener('beforeunload', onClose);
    return () => { if (guard === mine) guard = null; removeEventListener('beforeunload', onClose); };
  }, []);
}
/** A value once it stopped changing for a moment, so walking a list with the arrows asks the server once. */
export function useSettled<T>(value: T, ms = 150): T {
  const [v, setV] = useState(value);
  useEffect(() => { if (Object.is(v, value)) return; const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [v, value, ms]);
  return v;
}

const wide = () => matchMedia('(min-width: 1024px)');
/** A computer screen (from 1024 px). Narrower: the phone layout. */
export const useWide = () => useSyncExternalStore((l) => { const m = wide(); m.addEventListener('change', l); return () => m.removeEventListener('change', l); }, () => wide().matches);
