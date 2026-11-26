import { useSyncExternalStore } from 'react';

export type Appearance = 'light' | 'system' | 'dark';
const KEY = 'farm-app-appearance';
const media = window.matchMedia('(prefers-color-scheme: dark)');
const listeners = new Set<() => void>();

function read(): Appearance {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'dark' || saved === 'system') return saved;
  } catch { /* storage may be disabled */ }
  return 'light';
}

let appearance = read();
const current = () => appearance;

function apply() {
  const dark = appearance === 'dark' || (appearance === 'system' && media.matches);
  const html = document.documentElement;
  if (dark) html.dataset.theme = 'dark';
  else delete html.dataset.theme;
  const statusBar = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (statusBar) statusBar.content = dark ? '#181d1a' : lightStatusBar;
}
const lightStatusBar = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content || '#283a2e';

export function initAppearance() {
  apply();
  media.addEventListener('change', apply);
  window.addEventListener('storage', (event) => {
    if (event.key === KEY || event.key === null) update(read());
  });
}

function update(mode: Appearance) {
  if (appearance === mode) return;
  appearance = mode;
  apply();
  listeners.forEach((fn) => fn());
}

export function setAppearance(mode: Appearance) {
  try { localStorage.setItem(KEY, mode); } catch { /* apply for this session */ }
  update(mode);
}

export function useAppearance() {
  return useSyncExternalStore((fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, current);
}
