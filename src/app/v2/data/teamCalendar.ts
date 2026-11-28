// Team members listen directly to shared rows. Older rows have no audience to query, so a
// role-checked Worker discovers their IDs; the same Firestore rules protect each live read.
import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { useList, type ListState, type Spec } from '../../db';
import { db, readyAuth } from '../../firebase';
import { useAuth } from '../../store';
import { apiBase } from '../../upload';
import type { FarmCalItem } from './farm';

type CalendarState = ListState<FarmCalItem>;
type LegacyState = CalendarState & { key: string };
const empty: CalendarState = { items: [], loading: false, error: '' };

function loadRanges(uid: string): Record<string, string[]> {
  try { return JSON.parse(localStorage.getItem('farm-shared-calendar:' + uid) || '{}') || {}; }
  catch { return {}; }
}
function storeRange(uid: string, range: string, ids: string[]) {
  try {
    const ranges = loadRanges(uid);
    delete ranges[range];
    localStorage.setItem('farm-shared-calendar:' + uid, JSON.stringify(Object.fromEntries([...Object.entries(ranges).slice(-11), [range, ids]])));
  } catch { /* The current session can still use its listeners when storage is full. */ }
}

function useLegacyRows(uid: string, from: string, to: string): CalendarState {
  const key = uid ? uid + '/' + from + '/' + to : '';
  const [state, setState] = useState<LegacyState>({ ...empty, key: '' });
  useEffect(() => {
    if (!uid) return;
    const range = from + '/' + to;
    const cached = loadRanges(uid)[range];
    const listeners = new Map<string, () => void>();
    const unresolved = new Set<string>();
    const rows = new Map<string, FarmCalItem>();
    const controller = new AbortController();
    let busy = false, discovering = !Array.isArray(cached), error = '';
    const publish = () => {
      if (!controller.signal.aborted) setState({ key, items: [...rows.values()], loading: discovering || unresolved.size > 0, error });
    };
    function subscribe(ids: string[]) {
      const wanted = new Set(ids);
      for (const [id, stop] of listeners) {
        if (!wanted.has(id)) { stop(); listeners.delete(id); rows.delete(id); unresolved.delete(id); }
      }
      for (const id of wanted) {
        if (listeners.has(id)) continue;
        unresolved.add(id);
        const stop = onSnapshot(doc(db, 'calendar', id), snap => {
          const data = snap.data();
          if (data && data.audience === undefined && data.date >= from && data.date <= to) rows.set(id, { ...data, id } as FarmCalItem);
          else rows.delete(id);
          unresolved.delete(id); publish();
        }, () => { rows.delete(id); unresolved.delete(id); publish(); });
        listeners.set(id, stop);
      }
      publish();
    }
    async function discover() {
      if (busy || document.visibilityState === 'hidden') return;
      busy = true;
      try {
        const base = apiBase(), user = (await readyAuth()).currentUser;
        if (!base || user?.uid !== uid) throw Error();
        const query = new URLSearchParams({ from, to });
        const res = await fetch(base + '/v1/team-calendar?' + query, {
          headers: { authorization: 'Bearer ' + await user.getIdToken() }, signal: controller.signal, cache: 'no-store',
        });
        if (controller.signal.aborted) return;
        if (res.status === 401 || res.status === 403) {
          subscribe([]); storeRange(uid, range, []);
          throw Error();
        }
        if (!res.ok) throw Error();
        const data = await res.json() as { ids?: unknown };
        if (controller.signal.aborted) return;
        if (!Array.isArray(data.ids) || !data.ids.every(id => typeof id === 'string' && id.length > 0 && !id.includes('/'))) throw Error();
        const ids = data.ids as string[];
        error = ''; subscribe(ids); storeRange(uid, range, ids);
      } catch { error = 'לא ניתן לעדכן כרגע את רשומות היומן הישנות.'; }
      finally { busy = false; discovering = false; publish(); }
    }
    subscribe(Array.isArray(cached) ? cached : []);
    void discover();
    window.addEventListener('online', discover);
    document.addEventListener('visibilitychange', discover);
    return () => {
      controller.abort(); listeners.forEach(stop => stop());
      window.removeEventListener('online', discover); document.removeEventListener('visibilitychange', discover);
    };
  }, [uid, from, to, key]);
  return !key ? empty : state.key === key ? state : { ...empty, loading: true };
}

export function useTeamCalendarRange(from: string, to: string, manager: boolean, enabled = true): CalendarState {
  const auth = useAuth(), demo = !auth.real;
  const where: NonNullable<Spec['where']> = [['date', '>=', from], ['date', '<=', to]];
  if (!manager && !demo) where.push(['audience', '==', 'all']);
  const current = useList<FarmCalItem>('calendar', { where, orderBy: [['date', 'asc']] }, enabled);
  const legacy = useLegacyRows(enabled && !manager && !demo ? auth.user?.uid || '' : '', from, to);
  return useMemo(() => {
    if (!enabled) return empty;
    if (manager) return current;
    const visible = new Map(legacy.items.map(row => [row.id, row]));
    for (const row of current.items) {
      if (row.audience === 'all' || (demo && row.audience === undefined)) visible.set(row.id, row);
    }
    return { items: [...visible.values()].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)),
      loading: current.loading || legacy.loading, error: current.error || legacy.error };
  }, [current, legacy, enabled, manager, demo]);
}
