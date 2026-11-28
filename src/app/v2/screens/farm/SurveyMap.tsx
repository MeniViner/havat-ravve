import { useEffect, useRef, useState } from 'react';
import * as L from 'leaflet';
import type { Place, PlaceIcon } from '../../../types';
import { coordinate, quality, sections, type Fix, type Point, type Trail, type Vertex } from '../../../survey/model';
import basemap from '../../../survey/basemap.json';
import { useDemo } from '../../../demo/store';
import './survey-map-canvas.css';

export type DrawnTrail = { trail: Trail; points: Vertex[] };
export type MapCamera = Point & { zoom: number };
export type View = { id: number; point?: Point; points?: Point[]; camera?: MapCamera; home?: boolean; zoomBy?: number };
export type MapLayers = Partial<Record<'places' | 'walk' | 'vehicle' | 'unknown' | 'current', boolean>>;
type Props = {
  places: Place[];
  trails: DrawnTrail[];
  live: Fix | null;
  clock: number;
  draft?: Point;
  draftPlace?: Pick<Place, 'id' | 'name' | 'icon' | 'markerStyle' | 'photo'>;
  selected?: string;
  selectedTrail?: string;
  raw: Vertex[];
  edit?: Vertex[];
  anchor?: number;
  selecting: boolean;
  sketch?: boolean;
  view: View | null;
  online: boolean;
  demoBase?: 'terrain' | 'osm';
  homeView?: MapCamera | null;
  onCameraChange?: (camera: MapCamera) => void;
  following?: boolean;
  onStopFollowing?: () => void;
  layers?: MapLayers;
  panelRef?: { current: HTMLElement | null };
  onPick: (p: Point) => void;
  onPlace: (id: string) => void;
  onTrail: (id: string) => void;
  onVertex: (seq: number) => void;
};

const symbols: Record<PlaceIcon, string> = {
  pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0z"/><circle cx="12" cy="10" r="2.5"/>',
  tree: '<path d="m12 2 5 7h-2l5 7h-7v5h-2v-5H4l5-7H7z"/>',
  paw: '<ellipse cx="5" cy="9" rx="1.5" ry="2.5"/><ellipse cx="10" cy="5.5" rx="1.5" ry="2.5"/><ellipse cx="16" cy="6" rx="1.5" ry="2.5"/><ellipse cx="20" cy="10" rx="1.5" ry="2.5"/><path d="M7 15q5-10 10 0c5 7-3 5-5 4-4 2-9 2-5-4z"/>',
  sprout: '<path d="M12 21v-8M12 15Q2 15 3 5q10-1 9 10zm0-3Q12 2 21 3q0 9-9 9z"/>',
  flower: '<path d="M5 13h14l-2 7H7zM12 13V8M12 10Q5 10 5 4q7 0 7 6zm0-2q0-6 6-6 0 6-6 6z"/>',
  gate: '<path d="M3 21V4h3v17m12 0V4h3v17M6 8h12M6 16h12M7 16l10-8"/>',
  box: '<path d="m3 8 9-5 9 5v12H3zM7 20V10h10v10M8 13h8m-8 3h8"/>',
  store: '<path d="m4 5-2 6q2 3 4 0 2 3 4 0 2 3 4 0 2 3 4 0 2 3 4 0l-2-6zM4 13v7h16v-7M8 20v-5h5v5"/>',
};
const glyph = (icon?: string) => (icon && Object.hasOwn(symbols, icon) ? symbols[icon as PlaceIcon] : symbols.pin);
export function PlaceGlyph({ icon }: { icon: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: glyph(icon) }}
    />
  );
}
function placeMarker(
  place: Pick<Place, 'name' | 'icon' | 'markerStyle' | 'photo'>,
  selected: boolean,
  action?: () => void
) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'survey-place-button';
  button.setAttribute('aria-label', place.name);
  button.disabled = !action;
  const shape = document.createElement('span');
  shape.className = 'survey-pin-shape';
  shape.dataset.symbol = place.icon || 'pin';
  // Only the fixed icon collection can contribute SVG markup. Farm names always use textContent.
  shape.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    glyph(place.icon) +
    '</svg>';
  if (place.markerStyle === 'thumbnail' && place.photo) {
    const photo = document.createElement('img');
    photo.alt = '';
    photo.src = place.photo;
    photo.className = 'survey-pin-photo';
    photo.onerror = () => {
      photo.remove();
      shape.classList.remove('has-photo');
    };
    shape.classList.add('has-photo');
    shape.append(photo);
  }
  const name = document.createElement('span');
  name.className = 'survey-pin-label';
  name.textContent = place.name;
  button.append(shape, name);
  if (action)
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      action();
    });
  return L.divIcon({
    className: 'survey-marker' + (selected ? ' chosen' : ''),
    html: button,
    iconSize: [44, 44],
    iconAnchor: [22, 42],
  });
}
function padding(map: L.Map, panel?: HTMLElement | null) {
  const rect = map.getContainer().getBoundingClientRect();
  const cover = panel?.getBoundingClientRect();
  let right = 34;
  let bottom = 36;
  if (
    cover &&
    cover.width &&
    cover.height &&
    cover.left < rect.right &&
    cover.right > rect.left &&
    cover.top < rect.bottom &&
    cover.bottom > rect.top
  ) {
    if (cover.width > rect.width * 0.72) bottom = Math.min(rect.height * 0.66, rect.bottom - cover.top + 18);
    else right = Math.min(rect.width * 0.66, rect.right - cover.left + 18);
  }
  return { paddingTopLeft: L.point(34, 42), paddingBottomRight: L.point(right, bottom) };
}
function frame(map: L.Map, points: Point[], panel?: HTMLElement | null) {
  const valid = points.filter(coordinate);
  if (valid.length) map.fitBounds(L.latLngBounds(valid), { ...padding(map, panel), maxZoom: 18, animate: false });
  else map.fitWorld({ animate: false });
}
function center(map: L.Map, point: Point, zoom: number, panel?: HTMLElement | null) {
  const { paddingTopLeft, paddingBottomRight } = padding(map, panel);
  const offset = paddingBottomRight.subtract(paddingTopLeft).divideBy(2);
  map.setView(map.unproject(map.project(point, zoom).add(offset), zoom), zoom, { animate: false });
}
function home(map: L.Map, props: Props) {
  const view = props.homeView;
  if (view && coordinate(view) && Number.isFinite(view.zoom)) {
    map.setView(view, view.zoom, { animate: false });
    return true;
  }
  const points = [...props.places.filter((p) => !p.archived), ...props.trails.flatMap((t) => t.points)].filter(
    coordinate
  );
  if (points.length) {
    const size = map.getSize();
    const compact = size.x <= 760;
    const side = Math.min(compact ? 46 : 155, size.x * 0.19);
    map.fitBounds(L.latLngBounds(points), {
      paddingTopLeft: [side, Math.min(compact ? 115 : 155, size.y * 0.22)],
      paddingBottomRight: [side, Math.min(compact ? 125 : 140, size.y * 0.22)],
      maxZoom: compact ? 18.4 : 18.9,
      animate: false,
    });
  } else if (props.live && ['fresh', 'weak'].includes(quality(props.live, props.clock)))
    map.setView(props.live, 17, { animate: false });
  else return false;
  return true;
}
function draw(
  group: L.LayerGroup,
  points: Vertex[],
  color: string,
  dash?: string,
  action?: () => void,
  selected = false
) {
  for (const line of sections(points.filter(coordinate))) {
    if (line.length === 1) {
      L.circleMarker(line[0], {
        color: '#fff8e4',
        radius: 4,
        fillColor: color,
        fillOpacity: 1,
        interactive: false,
      }).addTo(group);
      continue;
    }
    L.polyline(line, {
      color: selected ? '#d3db67' : '#fff8e4',
      weight: selected ? 11 : 7,
      opacity: 0.88,
      interactive: false,
    }).addTo(group);
    L.polyline(line, { color, weight: dash ? 4 : 4.6, dashArray: dash, interactive: false }).addTo(group);
    if (action)
      L.polyline(line, { color, opacity: 0, weight: 22, bubblingMouseEvents: false }).on('click', action).addTo(group);
  }
}
function scaleAt(map: L.Map) {
  const y = map.getSize().y / 2;
  const distance = map.distance(map.containerPointToLatLng([0, y]), map.containerPointToLatLng([84, y]));
  if (!Number.isFinite(distance) || distance <= 0) return { width: 0, label: '' };
  const unit = 10 ** Math.floor(Math.log10(distance));
  const step = [5, 2, 1].find((n) => n * unit <= distance) ?? 1;
  const meters = step * unit;
  return {
    width: Math.round((84 * meters) / distance),
    label: meters >= 1000 ? meters / 1000 + ' ק״מ' : meters + ' מ׳',
  };
}
export function SurveyMap(props: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const current = useRef(props);
  const initialized = useRef(false);
  const userMoved = useRef(false);
  const initializedHome = useRef<string | undefined>(undefined);
  current.current = props;
  const [tiles, setTiles] = useState<'loading' | 'ok' | 'error'>('loading');
  const [reload, setReload] = useState(0);
  const [illustrated, setIllustrated] = useState(false);
  const showDemoTerrain = useDemo().on && props.demoBase !== 'osm';
  const [scale, setScale] = useState({ width: 0, label: '' });
  useEffect(() => {
    const m = L.map(el.current!, {
      zoomControl: false,
      attributionControl: false,
      preferCanvas: true,
      minZoom: 2,
      maxZoom: 21,
      zoomSnap: 0.05,
      zoomAnimation: false,
      fadeAnimation: false,
      markerZoomAnimation: false,
    }).fitWorld({ animate: false });
    map.current = m;
    const report = () => {
      const { lat, lng } = m.getCenter().wrap();
      current.current.onCameraChange?.({ lat, lng, zoom: m.getZoom() });
      setScale(scaleAt(m));
    };
    m.on('moveend zoomend resize', report);
    m.on('dragstart', () => {
      userMoved.current = true;
      current.current.onStopFollowing?.();
    });
    m.on('click', (e: L.LeafletMouseEvent) => {
      const state = current.current;
      if ((!state.selecting || state.sketch) && state.edit?.length && state.layers?.current !== false) {
        let closest: Vertex | undefined;
        let distance = state.sketch ? 16 : 24;
        for (const vertex of state.edit) {
          const d = m.latLngToContainerPoint(vertex).distanceTo(e.containerPoint);
          if (d < distance) {
            closest = vertex;
            distance = d;
          }
        }
        if (closest) {
          state.onVertex(closest.seq);
          return;
        }
      }
      if (state.selecting) {
        const { lat, lng } = e.latlng.wrap();
        state.onPick({ lat, lng });
      }
    });
    report();
    const resize = new ResizeObserver(() => m.invalidateSize({ animate: false }));
    resize.observe(el.current!);
    return () => {
      resize.disconnect();
      m.off('moveend zoomend resize', report);
      m.remove();
      map.current = null;
      initialized.current = false;
      initializedHome.current = undefined;
      userMoved.current = false;
    };
  }, []);
  useEffect(() => {
    const m = map.current;
    if (!m || !showDemoTerrain) {
      setIllustrated(false);
      return;
    }
    // This drawing belongs only to the published demo seed, at the design's exact bounds.
    const bounds = L.latLngBounds(
      [31.2436 - 2900 / 398000, 34.7283 - 900 / 340000],
      [31.2436 + 900 / 398000, 34.7283 + 3500 / 340000]
    );
    const artwork = L.imageOverlay('/assets/farm-map-demo-terrain.svg', bounds, {
      alt: 'תוואי שטח להמחשה',
      interactive: false,
    });
    let failed = false;
    const update = () => {
      const visible = !failed && bounds.contains(m.getBounds());
      if (visible && !m.hasLayer(artwork)) artwork.addTo(m);
      if (!visible && m.hasLayer(artwork)) m.removeLayer(artwork);
      setIllustrated(visible);
    };
    artwork.on('error', () => {
      failed = true;
      update();
    });
    m.on('moveend', update);
    update();
    return () => {
      m.off('moveend', update);
      m.removeLayer(artwork);
      artwork.off();
    };
  }, [showDemoTerrain]);
  useEffect(() => {
    const m = map.current;
    if (!m || !props.online || (illustrated && showDemoTerrain)) return;
    setTiles('loading');
    const layer = L.tileLayer(basemap.tiles, {
      maxZoom: 21,
      maxNativeZoom: 19,
      updateWhenIdle: true,
      keepBuffer: 1,
      referrerPolicy: 'strict-origin-when-cross-origin',
    });
    const failed = new Set<HTMLElement>();
    layer.on('tileload', () => {
      if (!failed.size) setTiles('ok');
    });
    layer.on('tileerror', (event: L.TileErrorEvent) => {
      failed.add(event.tile);
      setTiles('error');
    });
    layer.on('tileunload', (event: L.TileEvent) => {
      failed.delete(event.tile);
    });
    layer.on('load', () => setTiles(failed.size ? 'error' : 'ok'));
    layer.addTo(m);
    return () => {
      m.removeLayer(layer);
      layer.off();
    };
  }, [props.online, illustrated, showDemoTerrain, reload]);
  useEffect(() => {
    const m = map.current;
    if (!m || userMoved.current) return;
    const key = props.homeView && [props.homeView.lat, props.homeView.lng, props.homeView.zoom].join('/');
    if (!initialized.current || (key && key !== initializedHome.current)) {
      initialized.current = home(m, current.current);
      initializedHome.current = key || undefined;
    }
  }, [props.homeView?.lat, props.homeView?.lng, props.homeView?.zoom, props.places, props.live, props.trails]);
  useEffect(() => {
    const m = map.current,
      view = props.view;
    if (!m || !view) return;
    userMoved.current = true;
    const id = requestAnimationFrame(() => {
      const panel = current.current.panelRef?.current;
      if (view.home) {
        if (!home(m, current.current)) m.fitWorld({ animate: false });
      } else if (view.camera && coordinate(view.camera) && Number.isFinite(view.camera.zoom))
        m.setView(view.camera, view.camera.zoom, { animate: false });
      else if (view.zoomBy) m.setZoom(m.getZoom() + view.zoomBy, { animate: false });
      else if (view.point && coordinate(view.point)) center(m, view.point, Math.max(17, m.getZoom()), panel);
      else frame(m, view.points || [], panel);
    });
    return () => cancelAnimationFrame(id);
  }, [props.view]);
  useEffect(() => {
    const m = map.current,
      fix = props.live;
    if (!props.following || !m || !fix || !['fresh', 'weak'].includes(quality(fix, current.current.clock))) return;
    userMoved.current = true;
    center(m, fix, Math.max(m.getZoom(), 17), current.current.panelRef?.current);
  }, [props.following, props.live]);
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const group = L.layerGroup().addTo(m);
    const layers = props.layers || {};
    for (const { trail, points } of props.trails) {
      const modes = trail.modes || [];
      const mode = modes.includes('vehicle')
        ? 'vehicle'
        : modes.some((mode) => mode === 'walk' || mode === 'bike')
          ? 'walk'
          : 'unknown';
      if (layers[mode] === false) continue;
      const color = { vehicle: '#a66a32', walk: '#377957', unknown: '#63677b' }[mode];
      const dash = { vehicle: undefined, walk: '7 8', unknown: '2 7' }[mode];
      draw(
        group,
        points,
        color,
        dash,
        props.selecting ? undefined : () => current.current.onTrail(trail.id),
        props.selectedTrail === trail.id
      );
    }
    if (layers.current !== false) {
      const survey = (props.edit ?? props.raw).filter(coordinate);
      draw(group, survey, '#a64b36', '9 5');
      const endpoint = (p: Point, name: string) => {
        const text = document.createElement('span');
        text.textContent = name;
        L.marker(p, {
          icon: L.divIcon({ className: 'survey-endpoint', html: text, iconSize: [42, 19], iconAnchor: [21, 25] }),
          interactive: false,
          keyboard: false,
        }).addTo(group);
      };
      if (survey.length) endpoint(survey[0], 'התחלה');
      if (props.edit && survey.length > 1) endpoint(survey[survey.length - 1], 'סיום');
    }
    if (layers.places !== false)
      for (const p of props.places.filter(coordinate)) {
        if (p.archived || (props.draft && props.draftPlace?.id === p.id)) continue;
        L.marker(p, {
          icon: placeMarker(
            p,
            props.selected === p.id,
            props.selecting ? undefined : () => current.current.onPlace(p.id)
          ),
          title: p.name,
          alt: p.name,
          keyboard: false,
          interactive: !props.selecting,
          zIndexOffset: props.selected === p.id ? 950 : 0,
        }).addTo(group);
      }
    if (layers.current !== false && props.edit?.length) {
      if (props.sketch) {
        for (const vertex of props.edit.filter(coordinate)) {
          L.circleMarker(vertex, {
            radius: 5,
            weight: 2,
            color: '#994b32',
            fillColor: 'white',
            fillOpacity: 1,
            interactive: false,
          }).addTo(group);
        }
      }
      const p = props.edit.find((v) => v.seq === props.anchor);
      if (p)
        L.circleMarker(p, {
          radius: 8,
          color: '#fff',
          weight: 3,
          fillColor: '#a54835',
          fillOpacity: 1,
          interactive: false,
        }).addTo(group);
    }
    if (props.draft && coordinate(props.draft)) {
      if (props.draftPlace)
        L.marker(props.draft, {
          icon: placeMarker(props.draftPlace, true),
          interactive: false,
          keyboard: false,
          zIndexOffset: 1100,
        }).addTo(group);
      else
        L.circleMarker(props.draft, {
          radius: 10,
          color: '#fff',
          weight: 3,
          fillColor: '#a54835',
          fillOpacity: 1,
          interactive: false,
        }).addTo(group);
    }
    // Keep labels of edge pins readable without pulling off-screen places into view.
    const fitLabels = () => {
      const bounds = m.getContainer().getBoundingClientRect();
      const labels = m.getContainer().querySelectorAll<HTMLElement>('.survey-pin-label');
      for (const label of labels) {
        const marker = label.parentElement!.getBoundingClientRect();
        const x = marker.left + marker.width / 2;
        if (x < bounds.left || x > bounds.right) continue;
        const half = label.offsetWidth / 2;
        const shift = Math.max(0, bounds.left + 5 - x + half) - Math.max(0, x + half - bounds.right + 5);
        label.style.marginLeft = shift ? shift + 'px' : '';
      }
    };
    const id = requestAnimationFrame(fitLabels);
    m.on('moveend resize', fitLabels);
    return () => {
      cancelAnimationFrame(id);
      m.off('moveend resize', fitLabels);
      m.removeLayer(group);
    };
  }, [
    props.places,
    props.trails,
    props.raw,
    props.edit,
    props.anchor,
    props.sketch,
    props.selected,
    props.selectedTrail,
    props.draft,
    props.draftPlace,
    props.selecting,
    props.layers,
  ]);
  const fixQuality = quality(props.live, props.clock);
  useEffect(() => {
    const m = map.current,
      p = props.live;
    if (!m || !p || !coordinate(p)) return;
    const group = L.layerGroup().addTo(m);
    const color = fixQuality === 'stale' ? '#66727b' : '#237cbe';
    if (p.accuracy != null && p.accuracy > 0)
      L.circle(p, { radius: p.accuracy, weight: 1, color, fillOpacity: 0.13, interactive: false }).addTo(group);
    L.circleMarker(p, {
      radius: 7,
      color: '#fff',
      weight: 3,
      fillColor: color,
      fillOpacity: 1,
      interactive: false,
    }).addTo(group);
    return () => {
      m.removeLayer(group);
    };
  }, [props.live, fixQuality]);
  function zoom(delta: number) {
    const m = map.current;
    if (m) {
      userMoved.current = true;
      m.setZoom(m.getZoom() + delta);
    }
  }
  return (
    <div className={'survey-map survey-map--design' + (props.selecting ? ' picking' : '')}>
      <div ref={el} className="survey-map-canvas" role="region" aria-label="מפת החווה" />
      <div className="survey-north" aria-label="צפון" role="img">
        <span>צ</span>
        <svg width="32" height="37" viewBox="0 0 32 37" aria-hidden="true">
          <path fill="#283e32" d="M16 1 23 33 16 26z" />
          <path fill="#f5f5e9" stroke="#283e32" d="M16 1 9 33 16 26z" />
        </svg>
      </div>
      <div className="survey-zoom" aria-label="גודל המפה" role="group">
        <button
          type="button"
          className="leaflet-control-zoom-in"
          title="התקרבות"
          aria-label="התקרבות"
          onClick={() => zoom(1)}
        >
          +
        </button>
        <button
          type="button"
          className="leaflet-control-zoom-out"
          title="התרחקות"
          aria-label="התרחקות"
          onClick={() => zoom(-1)}
        >
          −
        </button>
      </div>
      {!(showDemoTerrain && illustrated) && (!props.online || tiles !== 'ok') && (
        <div className="survey-tile-status" role="status">
          {!props.online ? (
            'אין רשת · מפת הרקע אינה זמינה'
          ) : tiles === 'loading' ? (
            'טוען את מפת הרקע…'
          ) : (
            <>
              חלק ממפת הרקע לא נטען{' '}
              <button type="button" onClick={() => setReload((n) => n + 1)}>
                ניסיון נוסף
              </button>
            </>
          )}
        </div>
      )}
      <div className="survey-map-credit">
        {showDemoTerrain && illustrated ? (
          <span>מפת הדגמה · תוואי שטח להמחשה</span>
        ) : (
          <a href={basemap.creditUrl} target="_blank" rel="noopener noreferrer" dir="ltr">
            {basemap.credit}
          </a>
        )}
        <span className="survey-distance" style={{ width: scale.width }} aria-label={'קנה מידה ' + scale.label}>
          {scale.label}
        </span>
      </div>
    </div>
  );
}
