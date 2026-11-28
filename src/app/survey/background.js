import osm from './basemap.json';

// Leaflet basemaps are independent of farm data, camera state and survey sessions.
const MAP_SOURCES = {
  osm: {
    url: osm.tiles, nativeZoom: 19,
    credit: '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a>',
  },
  aerial: {
    url: 'https://tiles.arcgis.com/tiles/JcXY3lLZni6BK4El/arcgis/rest/services/תצלום_אוויר_2015/MapServer/tile/{z}/{y}/{x}?blankTile=false',
    nativeZoom: 17, bounds: [[29.4924398, 34.2688036], [33.2946824, 35.852133]],
    credit: '<a href="https://www.arcgis.com/home/item.html?id=8d0dd08eb67847b2b5b6439c0c1fe000" target="_blank" rel="noopener">© מדינת ישראל · המרכז למיפוי ישראל · תצלום אוויר 2015</a>',
  },
  satellite: {
    url: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg', nativeZoom: 14,
    credit: '<a href="https://cloudless.eox.at" target="_blank" rel="noopener">EOxCloudless by EOX IT Services GmbH</a> · Contains modified Copernicus Sentinel data 2016',
  },
};

const REGIONAL_BOUNDS = [[31.212, 34.698], [31.270, 34.765]];
const REGIONAL_CREDIT = '<a href="https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a/items/S2A_36RXV_20261122_0_L2A" target="_blank" rel="noopener">Copernicus Sentinel-2 · 22.11.2026</a>';
function mountBackground(L, map, key, notify, images, creditChanged) {
  const source = MAP_SOURCES[key];
  const layer = L.tileLayer(source.url, {
    bounds: source.bounds, maxNativeZoom: source.nativeZoom, maxZoom: 21, keepBuffer: 1,
    updateWhenIdle: true, referrerPolicy: 'strict-origin-when-cross-origin',
  });
  const footprint = L.latLngBounds(key === "aerial" ? [[31.23628864179301, 34.72503662109375], [31.248030044481112, 34.73876953125]] : REGIONAL_BOUNDS);
  const coverage = source.bounds && L.latLngBounds(source.bounds);
  let regionReady = false, previousCredit = '', frame = 0, previous = '';
  const region = images[key] ? L.imageOverlay(images[key], footprint, {
    alt: key === 'aerial' ? 'תצלום אוויר של אזור באר שבע, 2015' : 'צילום לוויין של אזור באר שבע, 22 בנובמבר 2026', interactive: false,
    pane: 'tilePane', zIndex: 2, className: 'regional-satellite',
  }).on('load', () => { regionReady = true; schedule(); }).on('error', () => {
    regionReady = false; schedule();
  }) : null;
  function measure() {
    frame = 0;
    const viewport = map.getContainer().getBoundingClientRect();
    const cx = (viewport.left + viewport.right) / 2, cy = (viewport.top + viewport.bottom) / 2;
    let center = 'loading', missing = false;
    const container = layer.getContainer();
    if (container) for (const tile of container.querySelectorAll('img.leaflet-tile')) {
      if (Number(tile.dataset.level) !== Math.min(source.nativeZoom, Math.round(map.getZoom()))) continue;
      const box = tile.getBoundingClientRect();
      if (box.width === 0 || box.right <= viewport.left || box.left >= viewport.right ||
          box.bottom <= viewport.top || box.top >= viewport.bottom) continue;
      const status = tile.dataset.state;
      if (status === 'error') missing = true;
      if (box.left <= cx && cx < box.right && box.top <= cy && cy < box.bottom) center = status || 'loading';
    }
    const visible = map.getBounds();
    const seeRegion = region && regionReady && footprint.intersects(visible);
    let credit = source.credit;
    if (seeRegion) {
      if (key === 'satellite') credit = footprint.contains(visible) ? REGIONAL_CREDIT : REGIONAL_CREDIT + ' · ' + source.credit;
      if (footprint.contains(map.getCenter())) center = 'ok';
      if (footprint.contains(visible)) missing = false;
    }
    if (credit !== previousCredit) { previousCredit = credit; creditChanged(credit); }
    const status = coverage && !coverage.contains(map.getCenter()) ? 'outside' : center === 'ok' && missing ? 'partial' : center;
    if (status !== previous) { previous = status; notify(status); }
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(measure);
  }
  for (const [event, status] of [['tileloadstart', 'loading'], ['tileerror', 'error'], ['tileload', 'ok']]) {
    layer.on(event, e => {
      e.tile.dataset.level = String(e.coords.z);
      e.tile.dataset.state = status;
      schedule();
    });
  }
  layer.on('load tileunload', schedule);
  map.on('moveend zoomend resize', schedule);
  notify('loading');
  // Fetch network tiles only where the packaged observation cannot fill the viewport.
  function updateNetwork() {
    const needed = !regionReady || !footprint.contains(map.getBounds());
    if (needed && !map.hasLayer(layer)) layer.addTo(map);
    else if (!needed && map.hasLayer(layer)) map.removeLayer(layer);
    schedule();
  }
  map.on('moveend resize', updateNetwork);
  region?.on('load error',updateNetwork);
  region?.addTo(map);
  updateNetwork();
  schedule();
  return () => {
    map.off('moveend zoomend resize', schedule);
    map.off('moveend resize',updateNetwork);
    region?.off();
    region?.remove();
    layer.off();
    map.removeLayer(layer);
    cancelAnimationFrame(frame);
  };
}

// Keep marker buttons in place. Only their non-interactive labels are suppressed.
function arrangeMapLabels(entries, obstacles, frame) {
  const occupied = [...obstacles];
  for (const entry of entries) {
    const el = entry.el;
    if (!el) continue;
    el.style.visibility = '';
    const box = el.getBoundingClientRect();
    if (!box.width || !box.height) continue;
    const clipped = box.left < frame.left || box.right > frame.right ||
      box.top < frame.top || box.bottom > frame.bottom;
    const overlaps = occupied.some(r => box.left < r.right + 2 && box.right > r.left - 2 &&
      box.top < r.bottom + 2 && box.bottom > r.top - 2);
    if (!entry.priority && (overlaps || clipped)) el.style.visibility = 'hidden';
    else occupied.push(box);
  }
}

export { MAP_SOURCES, mountBackground, arrangeMapLabels };
