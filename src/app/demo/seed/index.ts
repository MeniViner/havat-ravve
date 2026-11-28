// Builds the demo seed for a day scenario: the core data (demo/data.ts) plus each area's slice.
import { collections, documents } from '../data';
import type { Seed, Scenario, Slice } from './types';
import tasks from './tasks';
import shopping from './shopping';
import farm from './farm';
import map from './map';
import eventday from './eventday';
import live from './live';
import manage from './manage';
import events from './events';
import vendor from './vendor';
import broadcast from './broadcast';
import profile from './profile';
import projects from './projects';
import guest from './guest';

const SLICES: Slice[] = [tasks, shopping, farm, map, eventday, live, manage, events, vendor, broadcast, profile, projects, guest];
const cache = new Map<Scenario, Seed>();
export function seedFor(scenario: Scenario): Seed {
  let s = cache.get(scenario);
  if (s) return s;
  s = { collections: Object.fromEntries(Object.entries(collections).map(([k, v]) => [k, v.map((r) => ({ ...r }))])), documents: { ...documents } as Seed['documents'] };
  for (const slice of SLICES) slice(s, scenario);
  cache.set(scenario, s);
  return s;
}
export type { Seed, Scenario };
