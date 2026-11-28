import { eventMillis } from '../screens/events/logic';
import { useEffect, useState } from 'react';
import { nowMs, useClockVersion } from '../../clock';
/** A screen left open changes to the archive at the event boundary, even with no Firestore document changes. */
export function useEventClock(ends: string[]) {
  useClockVersion();
  const [version, tick] = useState(0);
  const now = nowMs();
  const next = ends.map(eventMillis).filter((ms) => ms > now).reduce((n,ms) => Math.min(n,ms),Infinity);
  useEffect(() => {
    if (!Number.isFinite(next)) return;
    const timer = window.setTimeout(() => tick((n)=>n+1), Math.min(next-now+1,2147483647));
    const visible = () => { if (document.visibilityState==='visible') tick((n)=>n+1); };
    document.addEventListener('visibilitychange',visible);
    return () => { window.clearTimeout(timer);document.removeEventListener('visibilitychange',visible); };
  },[next,version]);
  return now;
}
