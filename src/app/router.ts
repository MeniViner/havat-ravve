import { useSyncExternalStore } from 'react';

const BASE = '/app';
const listeners = new Set<() => void>();
const current = () => {
  const p = location.pathname.startsWith(BASE) ? location.pathname.slice(BASE.length) : '/';
  return p === '' ? '/' : p;
};
window.addEventListener('popstate', () => listeners.forEach((l) => l()));

export const useRoute = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, current);

export function navigate(path: string, replace = false) {
  const url = BASE + (path === '/' ? '' : path) + location.search;
  if (replace) history.replaceState(null, '', url); else history.pushState(null, '', url);
  listeners.forEach((l) => l());
  window.scrollTo(0, 0);
}

export function back(fallback = '/') {
  if (history.length > 1) history.back(); else navigate(fallback, true);
}
