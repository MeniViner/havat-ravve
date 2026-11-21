// The one clock of the app. Every "now" goes through here, so demo scenarios can freeze time at the moment the designs show.
// Real use: the device clock. Demo: a fixed instant per day scenario (see demo/store.ts), so "בעוד 9 ימים" and "לפני 42 דקות" match the designs.
import { useSyncExternalStore } from 'react';

let frozen: number | null = null;
const listeners = new Set<() => void>();

/** Freezes the clock at an ISO instant (demo), or returns it to the device clock (null). */
export function freezeClock(iso: string | null) {
  const next = iso ? new Date(iso).getTime() : null;
  if (next === frozen) return;
  frozen = next;
  listeners.forEach((l) => l());
}
export const isClockFrozen = () => frozen !== null;
/** Milliseconds since the epoch: the replacement for Date.now(). */
export const nowMs = () => (frozen ?? Date.now());
/** The replacement for new Date(). */
export const now = () => new Date(nowMs());
export const nowIso = () => now().toISOString();
export const hoursAgoIso = (h: number) => new Date(nowMs() - h * 3600_000).toISOString();
const IL = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jerusalem' });
/** YYYY-MM-DD of an instant, in Israel. */
export const dateKeyOf = (d: Date) => IL.format(d);
/** Today's YYYY-MM-DD in Israel. */
export const todayKey = () => IL.format(now());
/** Re-renders when the clock is frozen or released. Components that show relative times call it. */
export const useClockVersion = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => frozen ?? -1);
