import { useSyncExternalStore } from 'react';

const BASE = '/app';
const listeners = new Set<() => void>();
const current = () => {
  const p = location.pathname.startsWith(BASE) ? location.pathname.slice(BASE.length) : '/';
  return p === '' ? '/' : p.replace(/\/+$/, '') || '/';
};
// Every history entry carries its depth, so "back" knows whether there is an entry of this app to go back to.
// (An installed PWA has no referrer and often starts on a deep link: there the back button falls back to the parent screen.)
export const depth = () => (history.state && typeof history.state.i === 'number' ? (history.state.i as number) : 0);
const scrolls = new Map<number, number>();
window.addEventListener('popstate', () => {
  listeners.forEach((l) => l());
  const y = scrolls.get(depth()) ?? 0;
  requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, y)));
});

export const useRoute = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, current);
export const href = (path: string) => BASE + (path === '/' ? '' : path);
export const param = (name: string) => new URLSearchParams(location.search).get(name) || '';

/** `keepScroll`: for a side panel that opens next to the list, where the list must not jump. */
export function navigate(path: string, replace = false, keepScroll = false) {
  const url = href(path);
  if (url === location.pathname + location.search) return;
  scrolls.set(depth(), window.scrollY);
  if (replace) history.replaceState({ i: depth() }, '', url); else history.pushState({ i: depth() + 1 }, '', url);
  listeners.forEach((l) => l());
  if (!keepScroll) window.scrollTo(0, 0);
}
/** Goes one step back inside the app; when this is the first entry, opens the parent screen instead. */
export function back(fallback = '/') {
  if (depth() > 0) history.back(); else navigate(fallback, true);
}

/** Matches "/manage/events/:id/tabs/:tid" against the route; returns params or null. "*" at the end matches any tail. */
export function match(route: string, pattern: string): Record<string, string> | null {
  const r = route.split('/').filter(Boolean), p = pattern.split('/').filter(Boolean);
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i] === '*') return params;
    if (r[i] === undefined) return null;
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(r[i]);
    else if (p[i] !== r[i]) return null;
  }
  return r.length === p.length ? params : null;
}
