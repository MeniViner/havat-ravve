import { useEffect, useRef, useState } from 'react';
import * as L from 'leaflet';
import type { Place } from '../../../types';
import {
  coordinate,
  quality,
  sections,
  type Fix,
  type Point,
  type Trail,
  type Vertex,
} from '../../../survey/model';
import basemap from '../../../survey/basemap.json';

export type DrawnTrail = { trail: Trail; points: Vertex[] };
export type View = { id: number; point?: Point; points?: Point[] };
type Props = {
  places: Place[];
  trails: DrawnTrail[];
  live: Fix | null;
  clock: number;
  draft?: Point;
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
    if (line.length > 1)
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
    else L.circleMarker(line[0], { color, radius: 3, interactive: false }).addTo(group);
  }
}
export function SurveyMap(props: Props) {
  const el = useRef<HTMLDivElement>(null),
    map = useRef<L.Map | null>(null),
    current = useRef(props),
    initial = useRef(false);
  current.current = props;
  const [tiles, setTiles] = useState<'loading' | 'ok' | 'error'>('loading');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const m = L.map(el.current!, {
      zoomControl: false,
      attributionControl: false,
      preferCanvas: true,
      zoomAnimation: false,
    }).fitWorld({ animate: false });
    map.current = m;
    L.control.zoom({ position: 'topleft', zoomInTitle: 'התקרבות', zoomOutTitle: 'התרחקות' }).addTo(m);
    const attribution = L.control.attribution({ prefix: false, position: 'bottomleft' }).addTo(m);
    const credit = document.createElement('a');
    credit.href = basemap.creditUrl;
    credit.textContent = basemap.credit;
    credit.target = '_blank';
    credit.rel = 'noopener';
    attribution.addAttribution(credit.outerHTML);
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
    if (!m || !props.online) return;
    setTiles('loading');
    const layer = L.tileLayer(basemap.tiles, {
      maxZoom: 19,
      updateWhenIdle: true,
      keepBuffer: 1,
      referrerPolicy: 'strict-origin-when-cross-origin',
    });
    layer.on('tileload', () => setTiles('ok'));
    layer.on('tileerror', () => setTiles('error'));
    layer.addTo(m);
    return () => {
      // Leaflet detaches the layer's map listeners on its own remove event.
      m.removeLayer(layer);
      layer.off();
    };
  }, [props.online, reload]);
  useEffect(() => {
    const m = map.current;
    if (!m || initial.current) return;
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
  }, [props.places, props.live, props.trails]);
  useEffect(() => {
    const m = map.current,
      v = props.view;
    if (!m || !v) return;
    initial.current = true;
    if (v.point) m.setView(v.point, Math.max(17, m.getZoom()), { animate: false });
    else frame(m, v.points || []);
  }, [props.view]);
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const group = L.layerGroup().addTo(m);
    for (const { trail, points } of props.trails)
      draw(
        group,
        points,
        trail.status === 'confirmed' ? '#20745b' : '#795930',
        props.selecting ? undefined : () => current.current.onTrail(trail.id),
        trail.status === 'draft'
      );
    draw(group, props.edit ?? props.raw, '#925114');
    for (const p of props.places.filter(coordinate)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'survey-place-button';
      button.setAttribute('aria-label', p.name);
      button.disabled = !!props.selecting;
      button.append(document.createElement('i'));
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        current.current.onPlace(p.id);
      });
      const marker = L.marker(p, {
        icon: L.divIcon({
          className: 'survey-marker' + (props.selected === p.id ? ' chosen' : ''),
          html: button,
          iconSize: [44, 48],
          iconAnchor: [22, 41],
        }),
        title: p.name,
        alt: p.name,
        keyboard: false,
        interactive: !props.selecting,
      }).addTo(group);
      marker.bindTooltip(label(p.name), { direction: 'top', offset: [0, -34] });
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
    return () => {
      m.removeLayer(group);
    };
  }, [
    props.places,
    props.trails,
    props.raw,
    props.edit,
    props.anchor,
    props.selected,
    props.draft,
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
      {(!props.online || tiles !== 'ok') && (
        <div className="survey-tile-status">
          {!props.online ? (
            'אין רשת · מפת הרקע אינה זמינה'
          ) : tiles === 'loading' ? (
            'טוען את מפת הרקע…'
          ) : (
            <>
              חלק ממפת הרקע לא נטען <button onClick={() => setReload((n) => n + 1)}>ניסיון נוסף</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
