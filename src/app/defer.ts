import { useSyncExternalStore } from 'react';

// ---------- delete with a real undo ----------
// The record disappears from the lists at once, but is deleted only when the undo window closes. Undo then never has to
// re-create someone else's record (which the rules rightly refuse), and it works without reception.
const hidden = new Map<string, { run: () => void; timer: ReturnType<typeof setTimeout> }>();
const hiddenListeners = new Set<() => void>();
let hiddenVersion = 0;
const hiddenChanged = () => { hiddenVersion++; hiddenListeners.forEach((l) => l()); };
const flush = (id: string) => { const h = hidden.get(id); if (!h) return; clearTimeout(h.timer); hidden.delete(id); h.run(); hiddenChanged(); };
if (typeof window !== 'undefined') window.addEventListener('pagehide', () => [...hidden.keys()].forEach(flush));
/** Returns the undo function. */
export function deferDelete(id: string, run: () => void, ms = 6000) {
  hidden.set(id, { run, timer: setTimeout(() => flush(id), ms) });
  hiddenChanged();
  return () => { const h = hidden.get(id); if (!h) return; clearTimeout(h.timer); hidden.delete(id); hiddenChanged(); };
}
/** Re-renders when the set of records waiting to be deleted changes; use `isHidden` to filter lists. */
export const useHiddenVersion = () => useSyncExternalStore((l) => { hiddenListeners.add(l); return () => hiddenListeners.delete(l); }, () => hiddenVersion);
export const isHidden = (id: string) => hidden.has(id);

