import { useDoc, transact } from '../db';
import { coordinate, type Point } from './model';
import type { PlaceIcon } from '../types';

export const placeSymbols = [
  ['pin', 'סיכת מקום'], ['gate', 'שער'], ['sprout', 'שתיל'], ['tree', 'עץ'],
  ['paw', 'בעלי חיים'], ['box', 'מחסן'], ['flower', 'עציץ'], ['store', 'דוכן'],
] as const satisfies ReadonlyArray<readonly [PlaceIcon, string]>;

export type FarmHomeView = Point & { zoom: number };
export type FarmMapSetup = { entrance: Point; placeId: string; trailId: string };
type MapSettings = { homeView?: FarmHomeView; setup?: FarmMapSetup };

export function useFarmHomeView() {
  const {item, loading, error} = useDoc<MapSettings>('farm_map/settings');
  return {homeView: item?.homeView ?? null, setup: item?.setup ?? null, loading, error};
}

const save = (patch: MapSettings) => transact(async (tx) => {
  const current = await tx.get('farm_map', 'settings');
  if (current) tx.update('farm_map', 'settings', patch);
  else tx.set('farm_map', 'settings', patch);
}, {serverOnly: true});

export async function saveFarmHomeView(camera: FarmHomeView) {
  if (!coordinate(camera) || !Number.isFinite(camera.zoom) || camera.zoom < 0 || camera.zoom > 22)
    throw new Error('בחרו מרכז ורמת זום תקינים במפה');
  await save({homeView: {lat: camera.lat, lng: camera.lng, zoom: camera.zoom}});
}

export async function saveFarmMapSetup(setup: FarmMapSetup) {
  if (!coordinate(setup.entrance) || !setup.placeId || !setup.trailId) throw new Error('בחרו כניסה, מקום ושביל');
  await save({setup});
}
