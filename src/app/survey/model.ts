import type { Place } from '../types';

export type Point = { lat: number; lng: number };
export type Fix = Point & { at: number; accuracy?: number | null };
export type Vertex = Point & { seq: number; segment: number };
export type Sample = Vertex & Fix & { quality: 'ok' | 'weak' | 'gap' | 'jump'; provider: string; mock: number };
export type Recording = {
  id: string;
  owner: string;
  state: 'recording' | 'paused' | 'interrupted' | 'review';
  started: number;
  count: number;
  lastAt?: number;
  reason: string;
};
export const CHUNK = 128;
export const MODES = { walk: 'הליכה', bike: 'אופניים', vehicle: 'רכב' } as const;
export type Mode = keyof typeof MODES;
export type Connection = {
  at: number;
  mode: Mode;
  target: 'place' | 'trail';
  targetId: string;
  lat: number;
  lng: number;
  targetVertex: number;
  targetGeometry: string;
};
export type Trail = {
  id: string;
  name: string;
  ownerUid: string;
  recordingId: string;
  revision: string;
  geometry: string;
  status: 'draft' | 'confirmed';
  modes: Mode[];
  connections: Connection[];
  count: number;
  chunks: number;
  updatedAt: number;
};
export type PlacePoint = Fix & { source: 'gps' | 'manual' | 'legacy' };
export type PlaceDraft = {
  id: string;
  editing: boolean;
  point: PlacePoint;
  name: string;
  photo: string;
  original?: Place;
  selected: boolean;
};
export const coordinate = (p: Point) =>
  Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;
export function quality(fix: Fix | null, now: number) {
  if (!fix || !coordinate(fix) || !Number.isFinite(fix.at)) return 'missing';
  if (now - fix.at > 15000 || fix.at > now + 2000) return 'stale';
  return fix.accuracy == null || !Number.isFinite(fix.accuracy) || fix.accuracy < 0 || fix.accuracy > 20
    ? 'weak'
    : 'fresh';
}
export function age(at: number, now = Date.now()) {
  const seconds = Math.max(0, Math.floor((now - at) / 1000));
  if (seconds < 60) return `לפני ${seconds} שנ׳`;
  if (seconds < 3600) return `לפני ${Math.floor(seconds / 60)} דק׳`;
  return new Date(at).toLocaleString('he-IL');
}
export const geometryOf = (raw: Sample[]): Vertex[] =>
  raw.map(({ seq, segment, lat, lng }) => ({ seq, segment, lat, lng }));
export function sections<T extends Vertex>(points: T[]): T[][] {
  const out: T[][] = [];
  for (const point of points) {
    const last = out[out.length - 1];
    if (last && last[0].segment === point.segment && last[last.length - 1].seq + 1 === point.seq) last.push(point);
    else out.push([point]);
  }
  return out;
}
export function chunked<T>(items: T[]): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK) chunks.push(items.slice(i, i + CHUNK));
  return chunks;
}
export function connectionCurrent(c: Connection, places: Place[], trails: Trail[]) {
  if (c.target === 'place')
    return places.some((p) => p.id === c.targetId && !p.archived && p.lat === c.lat && p.lng === c.lng);
  return trails.some(
    (t) =>
      t.id === c.targetId && t.geometry === c.targetGeometry && t.status === 'confirmed' && t.modes.includes(c.mode)
  );
}
export const hasLine = (points: Vertex[]) => sections(points).some((section) => section.length > 1);
export const vertexOk = (p: Vertex) =>
  coordinate(p) && Number.isSafeInteger(p.seq) && p.seq > 0 && Number.isSafeInteger(p.segment) && p.segment > 0;

export function unpack(trail: Trail, chunks: { index: number; points: Vertex[] }[]) {
  if (chunks.length !== trail.chunks) return null;
  const out: Vertex[] = [];
  for (let i = 0; i < chunks.length; i++) {
    if (chunks[i].index !== i || !Array.isArray(chunks[i].points) || !chunks[i].points.every(vertexOk)) return null;
    out.push(...chunks[i].points);
  }
  return out.length === trail.count ? out : null;
}
