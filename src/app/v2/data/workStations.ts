import { useEffect, useState } from 'react';
import { ConflictError, newId, readOnce, transact, useDoc } from '../../db';
import { nowIso, nowMs } from '../../clock';
import type { FarmEvent, Staffing } from '../../types';
import { eventMillis } from '../screens/events/logic';
import {
  catalogStations, cleanStationName, emptyRegistry, moveStationPeople, stationCollection,
  stationRegistryId, stationWritable, type StationRegistry, type WorkStation
} from '../../../../shared/work-stations';

export { catalogStations, emptyRegistry, type StationRegistry, type WorkStation };
export const useStationRegistry = () => useDoc<StationRegistry>(stationCollection + '/' + stationRegistryId);
export const eventStaffingPath = (eventId: string) => 'events/' + eventId + '/staffing';
export function currentStaffingEvent(event: FarmEvent, at = nowMs()) {
  return !('closed' in event && event.closed) && eventMillis(event.end || event.start) > at;
}
export function useLegacyStations(enabled: boolean, version: string) {
  const [result, setResult] = useState<{ rows: WorkStation[]; counts: Record<string, number>; loading: boolean; error: string }>({
    rows: [], counts: {}, loading: true, error: ''
  });
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    async function load() {
      setResult((last) => ({ ...last, loading: true, error: '' }));
      const events = await readOnce<FarmEvent>('events', {});
      const names = new Map<string, string>();
      const counts: Record<string, number> = {};
      // Only management enumerates history. A gate or an assignment picker reads one catalog document.
      for (let start = 0; start < events.length; start += 15) {
        const chunk = events.slice(start, start + 15);
        const lists = await Promise.all(chunk.map((e) => readOnce<Staffing>(eventStaffingPath(e.id), {})));
        if (!live) return;
        lists.forEach((rows, i) => rows.forEach((row) => {
          if (!names.has(row.id)) names.set(row.id, row.station);
          if (currentStaffingEvent(chunk[i])) counts[row.id] = (counts[row.id] || 0) + row.people.length;
        }));
      }
      if (live) setResult({ rows: [...names].map(([id, name]) => ({ id, name })), counts, loading: false, error: '' });
    }
    void load().catch(() => { if (live) setResult((last) => ({ ...last, loading: false, error: 'כדי לבדוק את השיבוצים בכל האירועים דרוש חיבור.' })); });
    return () => { live = false; };
  }, [enabled, version]);
  return result;
}
function requireUnlocked(registry: StationRegistry) {
  if (registry.moving) throw new ConflictError('מתבצעת העברה בין תחנות. יש לסיים אותה תחילה.');
}
export async function saveWorkStation(name: string, legacy: WorkStation[], editing?: WorkStation): Promise<WorkStation> {
  const clean = cleanStationName(name);
  if (!clean || clean.length > 60) throw new Error('יש להזין שם תחנה באורך של עד 60 תווים.');
  const id = editing?.id || newId(stationCollection);
  await transact(async (tx) => {
    const registry = await tx.get<StationRegistry>(stationCollection, stationRegistryId) || emptyRegistry;
    requireUnlocked(registry);
    if (editing && registry.stations[id] && registry.stations[id].name!==editing.name) throw new ConflictError('שם התחנה השתנה. פתחו את העריכה מחדש.');
    if (registry.stations[id]?.archived) throw new ConflictError('התחנה כבר הוסרה.');
    if (catalogStations(registry, legacy).some((s) => s.id !== id && cleanStationName(s.name).toLocaleLowerCase('he') === clean.toLocaleLowerCase('he'))) {
      throw new ConflictError('כבר קיימת תחנה בשם הזה.');
    }
    const stations = { ...registry.stations };
    for (const row of legacy) if (!stations[row.id]) stations[row.id] = { name: row.name, archived: false };
    stations[id] = { name: clean, archived: false };
    tx.set(stationCollection, stationRegistryId, { stations, moving: null });
  }, {serverOnly:true});
  return { id, name: clean };
}

/**
 * A durable move prevents new assignments to its source. Each active event moves its own people in one
 * transaction. Interrupted moves resume from the remaining rows, and the source is retired only at the end.
 */
export async function retireWorkStation(source: WorkStation, target: WorkStation | null) {
  if (target?.id === source.id) throw new Error('יש לבחור תחנה חלופית אחרת.');
  const from = source.id, to = target?.id || '';
  const active = await transact(async (tx) => {
    const registry = await tx.get<StationRegistry>(stationCollection, stationRegistryId) || emptyRegistry;
    if (registry.stations[from]?.archived) return false;
    if (registry.moving) {
      if (registry.moving.from !== from || registry.moving.to !== to) requireUnlocked(registry);
      return true;
    }
    if (to && !stationWritable(registry, to)) throw new ConflictError('התחנה החלופית כבר הוסרה.');
    const stations = { ...registry.stations };
    // Persist encountered legacy names so replacement and recovery work in another browser too.
    stations[from] ||= { name: source.name, archived: false };
    if (target) stations[to] ||= { name: target.name, archived: false };
    tx.set(stationCollection, stationRegistryId, { stations, moving: { from, to, startedAt: nowIso() } });
    return true;
  }, {serverOnly:true});
  if (!active) return;
  const events = await readOnce<FarmEvent>('events', {});
  const eligible = events.filter((e) => currentStaffingEvent(e));
  let needsTarget = false;
  // The removal sheet can be stale. Inspect every active event before deleting even an empty row.
  if (!target) {
    for (const event of eligible) {
      needsTarget = await transact(async (tx) => {
        const current = await tx.get<FarmEvent>('events', event.id);
        if (!current || !currentStaffingEvent(current)) return false;
        const station = await tx.get<Staffing>(eventStaffingPath(event.id), from);
        return !!station?.people.length;
      }, {serverOnly:true});
      if (needsTarget) break;
    }
  }
  for (const event of needsTarget ? [] : eligible) {
    const needsOne = await transact(async (tx) => {
      const registry = await tx.get<StationRegistry>(stationCollection, stationRegistryId) || emptyRegistry;
      if (registry.moving?.from !== from || registry.moving.to !== to) return false;
      const fresh = await tx.get<FarmEvent>('events', event.id);
      if (!fresh || !currentStaffingEvent(fresh)) return false;
      const col = eventStaffingPath(event.id), original = await tx.get<Staffing>(col, from);
      if (!original) return false;
      if (original.people.length && !target) return true;
      if (target && original.people.length) {
        const replacement = await tx.get<Staffing>(col, to);
        const people = moveStationPeople(from, original.people, replacement?.people || []);
        tx.set(col, to, { station: registry.stations[to]?.name || replacement?.station || target.name,
          needed: replacement?.needed ?? original.needed ?? 1, people });
      }
      tx.remove(col, from);
      return false;
    }, {serverOnly:true});
    if (needsOne) { needsTarget = true; break; }
  }
  await transact(async (tx) => {
    const registry = await tx.get<StationRegistry>(stationCollection, stationRegistryId);
    if (!registry || registry.moving?.from !== from || registry.moving.to !== to) return;
    const stations = { ...registry.stations };
    if (!needsTarget) stations[from] = { name: stations[from]?.name || source.name, archived: true, ...(to ? { replacementId: to } : {}) };
    tx.set(stationCollection, stationRegistryId, { stations, moving: null });
  }, {serverOnly:true});
  if (needsTarget) throw new ConflictError('לתחנה נוספו שיבוצים. בחרו תחנה חלופית והעבירו אותם.');
}
