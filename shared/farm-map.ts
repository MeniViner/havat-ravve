/** The fields a map viewer can receive. Survey receipts, raw fixes and actors stay private. */
export const markerIcons = {
  pin: 'מקום',
  farm: 'מבנה',
  gate: 'שער',
  tree: 'עץ',
  water: 'מים',
  bench: 'ישיבה',
  parking: 'חניה',
  view: 'תצפית',
} as const;
export type MarkerIcon = keyof typeof markerIcons;
export type MarkerStyle = { markerIcon?: MarkerIcon; markerDisplay?: 'icon' | 'photo' };
export type MapPlace = MarkerStyle & { id: string; name: string; lat: number; lng: number; photo?: string };
export type MapHome = { lat: number; lng: number; zoom: number };
export type MapTrail = {
  id: string;
  name: string;
  status: 'confirmed' | 'draft';
  modes: ('walk' | 'bike' | 'vehicle')[];
};
export type MapVertex = { lat: number; lng: number; seq: number; segment: number };
export function validHome(value: unknown): value is MapHome {
  if (!value || typeof value !== 'object') return false;
  const p = value as MapHome;
  return (
    Number.isFinite(p.lat) &&
    Math.abs(p.lat) <= 85.05113 &&
    Number.isFinite(p.lng) &&
    Math.abs(p.lng) <= 180 &&
    Number.isInteger(p.zoom) &&
    p.zoom >= 0 &&
    p.zoom <= 19
  );
}
export function publicPlace(id: string, p: Record<string, unknown>): MapPlace | null {
  if (
    p.archived ||
    typeof p.name !== 'string' ||
    !p.name.trim() ||
    typeof p.lat !== 'number' ||
    typeof p.lng !== 'number' ||
    !Number.isFinite(p.lat) ||
    !Number.isFinite(p.lng) ||
    Math.abs(p.lat) > 90 ||
    Math.abs(p.lng) > 180
  )
    return null;
  const photo =
    typeof p.photo === 'string' &&
    /^(data:image\/(jpeg|jpg|png|webp);base64,|https:\/\/havat-ravve-api\.meniviner\.workers\.dev\/v1\/files\/place\/)/.test(
      p.photo
    )
      ? p.photo
      : '';
  const markerIcon =
    typeof p.markerIcon === 'string' && Object.hasOwn(markerIcons, p.markerIcon)
      ? (p.markerIcon as MarkerIcon)
      : 'pin';
  return {
    id,
    name: p.name,
    lat: p.lat,
    lng: p.lng,
    photo,
    markerIcon,
    markerDisplay: photo && p.markerDisplay === 'photo' ? 'photo' : 'icon',
  };
}
export function centeredTab<T>(items: T[], center: T): T[] {
  const at = Math.ceil(items.length / 2);
  return [...items.slice(0, at), center, ...items.slice(at)];
}
