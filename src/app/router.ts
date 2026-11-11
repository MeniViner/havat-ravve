import { useSyncExternalStore } from 'react';

const BASE = '/app';
const listeners = new Set<() => void>();
const current = () => {
  const p = location.pathname.startsWith(BASE) ? location.pathname.slice(BASE.length) : '/';
  return p === '' ? '/' : p.replace(/\/+$/, '') || '/';
};
window.addEventListener('popstate', () => listeners.forEach((l) => l()));

export const useRoute = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, current);
export const href = (path: string) => BASE + (path === '/' ? '' : path);

export function navigate(path: string, replace = false) {
  const url = href(path);
  if (replace) history.replaceState(null, '', url); else history.pushState(null, '', url);
  listeners.forEach((l) => l());
  window.scrollTo(0, 0);
}
export function back(fallback = '/') {
  if (history.length > 1 && document.referrer !== '' || history.state !== null) history.back(); else navigate(fallback, true);
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
