// The farm's own visit counter, shared by the public site (site-hits.ts) and the app (app/usage.ts): a tiny beacon to
// the Worker's /v1/hit (api/src/traffic.ts), which only adds to daily counters. Nothing personal is sent or kept: no
// name, no id, no cookie. The only thing stored in the browser is the last day it counted (to tell new visitors from
// returning ones). Production only: localhost, preview channels and the emulators never count. For a local check,
// localStorage "farm-hits-debug" = "1" prints each beacon to the console instead of sending it.
export const HITS_URL = 'https://havat-ravve-api.meniviner.workers.dev/v1/hit';

const production = () => /^havat-ravve\.(web\.app|firebaseapp\.com)$/.test(location.hostname);
const debug = () => { try { return localStorage.getItem('farm-hits-debug') === '1'; } catch { return false; } };
export const hitsOn = () => production() || debug();

export const todayIL = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());

/** Was this browser already counted today (per surface: the site and the app count apart)? Remembers today. */
export function firstToday(surface: 'site' | 'app'): { newToday: boolean; returning: boolean } {
  const key = 'farm-hit-' + surface, today = todayIL();
  try {
    const last = localStorage.getItem(key);
    if (last !== today) localStorage.setItem(key, today);
    return { newToday: last !== today, returning: !!last && last !== today };
  } catch { return { newToday: false, returning: false }; } // storage blocked: count the view, not the visitor
}

export function device(): 'installed' | 'mobile' | 'desktop' {
  if (matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone) return 'installed';
  return matchMedia('(max-width: 800px), (pointer: coarse)').matches ? 'mobile' : 'desktop';
}

/** Sends one beacon. Plain text, so the browser sends it without a preflight, even while the page closes. */
export function sendHit(body: Record<string, unknown>) {
  if (!hitsOn()) return;
  const text = JSON.stringify(body);
  if (!production()) { console.info('[farm hit]', body); return; }
  try {
    if (navigator.sendBeacon?.(HITS_URL, new Blob([text], { type: 'text/plain' }))) return;
    void fetch(HITS_URL, { method: 'POST', body: text, keepalive: true, headers: { 'content-type': 'text/plain' } }).catch(() => {});
  } catch { /* counting never breaks a page */ }
}
