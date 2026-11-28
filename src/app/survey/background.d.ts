import type * as L from 'leaflet';
export type Base = 'osm' | 'satellite' | 'aerial';
export type TileState = 'loading' | 'ok' | 'partial' | 'error' | 'outside';
export const MAP_SOURCES: Record<Base, { url: string; nativeZoom: number; credit: string }>;
export function mountBackground(lib: typeof L, map: L.Map, key: Base, notify: (s: TileState) => void, images: {satellite: string; aerial: string}, creditChanged: (credit: string) => void): () => void;
export function arrangeMapLabels(entries: {el?: HTMLElement | null; priority?: boolean}[], obstacles: DOMRect[], frame: DOMRect): void;
