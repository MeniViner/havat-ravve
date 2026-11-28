import { useEffect, useRef, useState } from 'react';
import * as L from 'leaflet';
import type { MapPlace, MapTrail, MapHome, MarkerIcon } from '../../../../../shared/farm-map';
import { validHome } from '../../../../../shared/farm-map';
import {
  coordinate,
  quality,
  sections,
  type Fix,
  type Point,
  type Trail,
  type Vertex,
} from '../../../survey/model';
import { MAP_SOURCES, mountBackground, arrangeMapLabels, type Base, type TileState } from '../../../survey/background';

export type DrawnTrail = { trail: Trail; points: Vertex[] };
export type View = { id: number; point?: Point; points?: Point[]; zoom?: number; detail?: boolean };
type Props = {
  places: MapPlace[];
  trails: { trail: MapTrail; points: Vertex[] }[];
  base?: Base;
  home?: MapHome | null;
  homeLoading?: boolean;
  onCamera?: (home: MapHome) => void;
  onManual?: () => void;
  selectedTrail?: string;
  live: Fix | null;
  clock: number;
  draft?: Point;
  previewPlace?: MapPlace;
  selected?: string;
  raw: Vertex[];
  edit?: Vertex[];
  anchor?: number;
  selecting: boolean;
  view: View | null;
  online: boolean;
  onPick: (p: Point) => void;
  onPlace: (id: string) => void;
  onTrail: (id: string) => void;
  onVertex: (seq: number) => void;
};
const glyphs: Record<MarkerIcon, string> = {
  pin: 'M12 21s7-7 7-12a7 7 0 0 0-14 0c0 5 7 12 7 12z M14.5 9a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0',
  farm: 'M3 20V10l8-6 8 6v10z M9 20v-7h4v7',
  gate: 'M3 21V5h3v16 M18 21V5h3v16 M6 8h12 M6 16h12 M7 15l10-6',
  tree: 'M12 2 5 11h3l-4 6h16l-4-6h3z M12 17v5',
  water: 'M12 2s-7 9-7 13a7 7 0 0 0 14 0c0-4-7-13-7-13z',
  bench: 'M4 7h16v5H4z M3 15h18 M6 15v5 M18 15v5',
  parking: 'M8 20V4h6a5 5 0 0 1 0 10H8',
  view: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M15 12a3 3 0 1 1-6 0 3 3 0 1 1 6 0',
};
export function PlaceSymbol({place}: { place: Pick<MapPlace,'photo' | 'markerDisplay' | 'markerIcon'> }) {
  const [failed, setFailed] = useState('');
  const photo = place.markerDisplay === 'photo' && place.photo;
  return <span className="map-place-symbol" aria-hidden="true">{photo && photo !== failed
    ? <img src={photo} alt="" onError={() => setFailed(photo)} />
    : <svg viewBox="0 0 24 24"><path d={glyphs[place.markerIcon || 'pin'] || glyphs.pin}/></svg>}</span>;
}
function markerGlyph(icon: MarkerIcon) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(svg.namespaceURI, 'path');
  path.setAttribute('d', glyphs[icon] || glyphs.pin);
  svg.append(path);
  return svg;
}
const label = (value: string) => {
  const span = document.createElement('span');
  span.textContent = value;
  return span;
};
function frame(m: L.Map, points: Point[]) {
  const valid = points.filter(coordinate);
  if (valid.length) m.fitBounds(L.latLngBounds(valid), { padding: [28, 28], maxZoom: 18, animate: false });
  else m.fitWorld({ animate: false });
}
function draw(group: L.LayerGroup, points: Vertex[], color: string, action?: () => void, dashed = false) {
  for (const line of sections(points)) {
    if (line.length > 1) {
      L.polyline(line, {color: '#fff', weight: 8, opacity: .85, interactive: false}).addTo(group);
      L.polyline(line, {
        color,
        weight: 5,
        opacity: 0.9,
        dashArray: dashed ? '7 7' : undefined,
        interactive: !!action,
      })
        .addTo(group)
        .on('click', (e) => {
          if (action) {
            L.DomEvent.stopPropagation(e);
            action();
          }
        });
    } else L.circleMarker(line[0], { color, radius: 3, interactive: false }).addTo(group);
  }
}
export function SurveyMap(props: Props) {
  const el = useRef<HTMLDivElement>(null),
    map = useRef<L.Map | null>(null),
    current = useRef(props),
    initial = useRef(false);
  current.current = props;
  const base = props.base || 'aerial';
  const [tiles, setTiles] = useState<TileState>('loading');
  const [credit, setCredit] = useState(MAP_SOURCES[base].credit);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const m = L.map(el.current!, {
      minZoom: 2, maxZoom: 19, zoomControl: false,
      attributionControl: false,
      preferCanvas: true,
      zoomAnimation: false,
    }).fitWorld({ animate: false });
    map.current = m;
    const camera = () => {
      const c = m.getCenter().wrap();
      current.current.onCamera?.({ lat: c.lat, lng: c.lng, zoom: m.getZoom() });
    };
    m.on('moveend zoomend', camera);
    m.on('dragstart boxzoomstart', () => {
      initial.current = true;
      current.current.onManual?.();
    });
    camera();
    L.control.zoom({ position: 'topleft', zoomInTitle: 'התקרבות', zoomOutTitle: 'התרחקות' }).addTo(m);
    const click = (e: L.LeafletMouseEvent) => {
      if (current.current.selecting) current.current.onPick({ lat: e.latlng.lat, lng: e.latlng.lng });
    };
    m.on('click', click);
    const resize = new ResizeObserver(() => m.invalidateSize({ pan: false }));
    resize.observe(el.current!);
    return () => {
      resize.disconnect();
      m.remove();
      map.current = null;
      initial.current = false;
    };
  }, []);
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    return mountBackground(L, m, base, setTiles, {satellite:'/assets/negev-s2-20261122.jpg',aerial:'/assets/beersheba-ortho-2015.jpg'}, setCredit);
  }, [base, props.online, reload]);
  useEffect(() => {
    const m = map.current;
    if (!m || initial.current || props.homeLoading) return;
    if (validHome(props.home)) {
      m.setView(props.home, props.home.zoom, { animate: false });
      initial.current = true;
      return;
    }
    const points = props.places.filter(coordinate);
    if (points.length) {
      frame(m, points);
      initial.current = true;
    } else if (props.live && quality(props.live, Date.now()) !== 'stale') {
      m.setView(props.live, 17);
      initial.current = true;
    } else if (props.trails.length && props.trails.some((t) => t.points.length)) {
      frame(
        m,
        props.trails.flatMap((t) => t.points)
      );
      initial.current = true;
    }
  }, [props.places, props.live, props.trails, props.home, props.homeLoading]);
  useEffect(() => {
    const m = map.current,
      v = props.view;
    if (!m || !v) return;
    initial.current = true;
    if (v.point) {
      const zoom = v.zoom ?? Math.max(17, m.getZoom());
      m.setView(v.point, zoom, { animate: false });
      if (v.detail) {
        const size = m.getSize();
        m.panBy(size.x < 740 ? [0, size.y * 0.16] : [Math.min(170, size.x * 0.18), 0], { animate: false });
      }
    } else frame(m, v.points || []);
  }, [props.view]);
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const group = L.layerGroup().addTo(m);
    for (const { trail, points } of props.trails)
      draw(
        group,
        points,
        props.selectedTrail === trail.id
          ? '#1267a2'
          : trail.status === 'draft'
            ? '#925114'
            : trail.modes.includes('vehicle')
              ? '#795930'
              : '#20745b',
        props.selecting ? undefined : () => current.current.onTrail(trail.id),
        trail.status === 'draft' || !trail.modes.includes('vehicle')
      );
    draw(group, props.edit ?? props.raw, '#925114');
    const names: { marker: L.Marker; priority: boolean }[] = [];
    const preview = props.previewPlace;
    const points = preview ? [preview, ...props.places.filter(p => p.id !== preview.id)] : props.places;
    for (const p of points.filter(coordinate)) {
      const isDraft = p === preview;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'survey-place-button';
      button.setAttribute('aria-label', p.name);
      button.disabled = isDraft || !!props.selecting;
      const badge = document.createElement('span');
      badge.className = 'survey-place-badge';
      const icon = markerGlyph(p.markerIcon || 'pin');
      if (p.markerDisplay === 'photo' && p.photo) {
        const photo = document.createElement('img');
        photo.alt = '';
        photo.src = p.photo;
        photo.onerror = () => badge.replaceChildren(icon);
        badge.append(photo);
      } else badge.append(icon);
      button.append(badge);
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        current.current.onPlace(p.id);
      });
      const marker = L.marker(p, {
        icon: L.divIcon({
          className: 'survey-marker' + (isDraft || props.selected === p.id ? ' chosen' : ''),
          html: button,
          iconSize: [44, 48],
          iconAnchor: [22, 41],
        }),
        title: p.name,
        alt: p.name,
        keyboard: false,
        interactive: !props.selecting,
      }).addTo(group);
      names.push({ marker, priority: isDraft || props.selected === p.id });
      marker.bindTooltip(label(p.name), {
        direction: 'top',
        permanent: true,
        offset: [0, -35],
        className: 'map-place-name',
      });
    }
    if (props.edit?.length) {
      const ends = [props.edit[0], props.edit[props.edit.length - 1]];
      ends.forEach((p, i) =>
        L.circleMarker(p, { radius: 6, color: '#214e3c', fillColor: '#fff', fillOpacity: 1, interactive: false })
          .addTo(group)
          .bindTooltip(label(i ? 'סיום' : 'התחלה'), { permanent: true, direction: i ? 'right' : 'left', className: 'survey-end-name' })
      );
    }
    if (props.edit?.length) {
      // A long walk stays usable. Select a vertex from any visible part of the line, or by its number in the review.
      const select = (e: L.LeafletMouseEvent) => {
        if (current.current.selecting) return;
        let best: Vertex | undefined,
          dist = 24;
        for (const p of current.current.edit || []) {
          const d = m.latLngToContainerPoint(p).distanceTo(e.containerPoint);
          if (d < dist) {
            best = p;
            dist = d;
          }
        }
        if (best) current.current.onVertex(best.seq);
      };
      m.on('click', select);
      group.once('remove', () => m.off('click', select));
      const p = props.edit.find((v) => v.seq === props.anchor);
      if (p)
        L.circleMarker(p, {
          radius: 8,
          color: '#fff',
          weight: 3,
          fillColor: '#9c5010',
          fillOpacity: 1,
          interactive: false,
        }).addTo(group);
    }
    if (props.draft)
      L.circleMarker(props.draft, {
        radius: 10,
        color: '#fff',
        weight: 3,
        fillColor: '#7042a1',
        fillOpacity: 1,
        interactive: false,
      }).addTo(group);
    names.sort((a,b) => Number(b.priority) - Number(a.priority));
    const layout = () => arrangeMapLabels(
      names.map(({marker, priority}) => ({ el: marker.getTooltip()?.getElement(), priority })),
      Array.from(m.getContainer().querySelectorAll('.survey-end-name')).map(el => el.getBoundingClientRect()),
      m.getContainer().getBoundingClientRect()
    );
    let raf = requestAnimationFrame(layout);
    const schedule = () => {cancelAnimationFrame(raf); raf = requestAnimationFrame(layout);};
    m.on('moveend zoomend resize', schedule);
    return () => {
      cancelAnimationFrame(raf);
      m.off('moveend zoomend resize',schedule);
      m.removeLayer(group);
    };
  }, [
    props.places,
    props.trails,
    props.raw,
    props.edit,
    props.anchor,
    props.selected,
    props.selectedTrail,
    props.draft,
    props.previewPlace,
    props.selecting,
  ]);
  useEffect(() => {
    const m = map.current,
      p = props.live;
    if (!m || !p || !coordinate(p)) return;
    const group = L.layerGroup().addTo(m),
      color = quality(p, props.clock) === 'stale' ? '#66727b' : '#19669e';
    if (p.accuracy != null && p.accuracy > 0)
      L.circle(p, { radius: p.accuracy, weight: 1, color, fillOpacity: 0.12, interactive: false }).addTo(group);
    L.circleMarker(p, {
      radius: 6,
      color: '#fff',
      weight: 2,
      fillColor: color,
      fillOpacity: 1,
      interactive: false,
    }).addTo(group);
    return () => {
      m.removeLayer(group);
    };
  }, [props.live, props.clock]);
  return (
    <div className={'survey-map' + (props.selecting ? ' picking' : '')}>
      <div ref={el} className="survey-map-canvas" role="region" aria-label="מפת החווה" />
      <div className="survey-base-credit" dir="ltr" dangerouslySetInnerHTML={{ __html: credit }} />
      {tiles !== 'ok' && (
        <div className="survey-tile-status" role="status">
          {tiles === 'outside' ? (
            'אין כיסוי אווירי באזור הזה. אפשר לבחור לוויין או מפה.'
          ) : !props.online ? (
            'אין חיבור לרשת · חלק מהרקע עשוי להיות חסר'
          ) : tiles === 'loading' ? (
            'טוען את מפת הרקע…'
          ) : (
            <>
              {tiles === 'partial' ? 'חלק מהרקע חסר' : 'הרקע באזור הזה לא נטען'} <button onClick={() => setReload((n) => n + 1)}>ניסיון נוסף</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
