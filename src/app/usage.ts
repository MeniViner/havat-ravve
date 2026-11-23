// How the app is used, for the owners' console (ביקורים ושימוש): one beacon when the app opens (phone, computer or
// installed, and the role: staff, guest...), and when it goes to the background, how many times each screen was opened.
// Screens by their first part only ("/tasks/abc" counts as tasks), never an id or anything typed. Never in the demo.
// The counter itself is shared with the site: ../hits.ts.
import { useEffect } from 'react';
import { device, firstToday, hitsOn, sendHit } from '../hits';

// the same list as the Worker's (api/src/traffic.ts APP_SCREENS); anything else counts as "other"
const SCREENS = new Set(['day', 'tasks', 'shopping', 'people', 'places', 'projects', 'farm', 'event', 'events', 'manage', 'me', 'new',
  'notifications', 'search', 'vendor', 'welcome', 'install', 'offline', 'visit', 'donate', 'contact', 'login', 'more', 'calendar', 'terms']);
export const screenOf = (route: string) => {
  const seg = route.split('/').filter(Boolean)[0];
  return !seg ? 'home' : SCREENS.has(seg) ? seg : 'other';
};

let opened = false;
let listening = false;
const screens: Record<string, number> = {};
function flush() {
  if (!Object.keys(screens).length) return;
  sendHit({ t: 'leave', app: true, screens: { ...screens } });
  for (const k of Object.keys(screens)) delete screens[k];
}

/** From App.tsx: `ready` once the account is known; `role` null when nobody is signed in; `off` in the demo. */
export function useUsage(route: string, ready: boolean, role: string | null, off: boolean) {
  useEffect(() => {
    if (!ready || off || opened || !hitsOn()) return;
    opened = true;
    sendHit({ t: 'view', app: true, device: device(), role: role || 'signedout', ...firstToday('app') });
    if (!listening) {
      listening = true;
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
      addEventListener('pagehide', flush);
    }
  }, [ready, off, role]);
  useEffect(() => {
    if (off || !hitsOn()) return;
    const s = screenOf(route);
    screens[s] = (screens[s] || 0) + 1;
  }, [route, off]);
}
