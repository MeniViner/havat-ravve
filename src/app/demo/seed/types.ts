// The demo seed: Firestore-shaped collections (path -> rows with `id`) and single documents (path -> data).
// Built once per day scenario. Area slices (seed/<area>.ts) add or replace rows for their screens.
export type Scenario = 'regular' | 'eventDay' | 'afterEvent';
export type Row = Record<string, unknown> & { id?: string; uid?: string };
export type Seed = { collections: Record<string, Row[]>; documents: Record<string, Row> };
export type Slice = (seed: Seed, scenario: Scenario) => void;

/** Adds rows to a collection, replacing rows with the same id. */
export function put(seed: Seed, path: string, rows: Row[]) {
  const list = seed.collections[path] || (seed.collections[path] = []);
  for (const r of rows) {
    const id = String(r.id ?? r.uid);
    const i = list.findIndex((x) => String(x.id ?? x.uid) === id);
    if (i >= 0) list[i] = { ...list[i], ...r }; else list.push(r);
  }
}
/** Removes rows by id. */
export function drop(seed: Seed, path: string, ids: string[]) {
  const list = seed.collections[path]; if (!list) return;
  seed.collections[path] = list.filter((x) => !ids.includes(String(x.id ?? x.uid)));
}
/** Patches one row in place (no-op when missing). */
export function patch(seed: Seed, path: string, id: string, data: Row) {
  const list = seed.collections[path] || [];
  const i = list.findIndex((x) => String(x.id ?? x.uid) === id);
  if (i >= 0) list[i] = { ...list[i], ...data };
}
