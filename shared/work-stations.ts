// The keys are station identities. Names may change while closed event rows keep their snapshots.
export const stationCollection = 'work_stations';
export const stationRegistryId = 'farm';
export const defaultStations = { gate: 'שער', stall: 'דוכן', parking: 'חניה' } as const;
export type WorkStation = { id: string; name: string };
export type StationRecord = { name: string; archived: boolean; replacementId?: string };
export type StationMove = { from: string; to: string; startedAt: string };
export type StationRegistry = { id: string; stations: Record<string, StationRecord>; moving: StationMove | null };
export type StationPerson = { uid: string; name: string; hours: string; role?: string; startsAt?: string; endsAt?: string; assignmentId?: string };
export const emptyRegistry: StationRegistry = { id: stationRegistryId, stations: {}, moving: null };
export const cleanStationName = (value: string) => value.normalize('NFC').trim().replace(/\s+/gu, ' ');
export const assignmentKey = (person: StationPerson) => person.assignmentId || person.uid;

export function catalogStations(registry: StationRegistry, legacy: WorkStation[] = []): WorkStation[] {
  const names = new Map(Object.entries(defaultStations) as [string, string][]);
  for (const row of legacy) if (!names.has(row.id)) names.set(row.id, row.name);
  for (const [id, record] of Object.entries(registry.stations)) {
    if (record.archived) names.delete(id);
    else names.set(id, record.name);
  }
  return [...names].map(([id, name]) => ({ id, name }));
}
export function stationWritable(registry: StationRegistry, id: string) {
  return !registry.stations[id]?.archived && registry.moving?.from !== id;
}
/** The same person can be assigned at two stations with different jobs or hours. Retain each shift. */
export function moveStationPeople(sourceId: string, source: StationPerson[], target: StationPerson[]): StationPerson[] {
  const used = new Set(target.map(assignmentKey));
  return [...target, ...source.map((person, index) => {
    let id = person.assignmentId || 'shift:' + encodeURIComponent(sourceId) + ':' + encodeURIComponent(person.uid);
    if (used.has(id)) {
      const base = id + ':' + index;
      id = base;
      let suffix = 1;
      while (used.has(id)) id = base + ':' + suffix++;
    }
    used.add(id);
    return { ...person, assignmentId: id };
  })];
}
