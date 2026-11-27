import { Firestore, type Env } from './firestore';
import { publicPlace, type MapVertex } from '../../shared/farm-map';
const safeId = (id: unknown): id is string => typeof id === 'string' && /^[\p{L}\p{N}_-]{1,150}$/u.test(id);
const fields = (...names: string[]) => ({ fields: names.map((fieldPath) => ({ fieldPath })) });
const equal = (fieldPath: string, stringValue: string) => ({
  fieldFilter: { field: { fieldPath }, op: 'EQUAL', value: { stringValue } },
});
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, max-age=20',
  'X-Content-Type-Options': 'nosniff',
};
const reply = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: status === 200 ? headers : { ...headers, 'Cache-Control': 'no-store' } });

/** Bounded pages of public display data from the authoritative documents, including legacy places. */
export async function publicMap(req: Request, env: Env) {
  const url = new URL(req.url);
  if (req.method !== 'GET') return reply({}, 405);
  const kind = url.searchParams.get('layer') || 'places';
  const after = url.searchParams.get('after') || '';
  if (!['places', 'trails', 'geometry'].includes(kind) || (after && !safeId(after))) return reply({}, 400);
  try {
    if (
      env.RATE_LIMITER &&
      !(await env.RATE_LIMITER.limit({ key: 'public-map:' + (req.headers.get('cf-connecting-ip') || 'local') }))
        .success
    )
      return reply({}, 429);
    const db = new Firestore(env);
    let parent = '',
      collectionId = kind === 'places' ? 'places' : 'farmTrails';
    let select = fields('name', 'lat', 'lng', 'archived', 'photo', 'markerIcon', 'markerDisplay');
    if (kind === 'trails') select = fields('name', 'geometry', 'count', 'modes');
    if (kind === 'geometry') {
      const id = url.searchParams.get('id'),
        geometry = url.searchParams.get('version');
      if (!safeId(id) || !safeId(geometry)) return reply({}, 400);
      const trail = await db.get('farmTrails', id);
      if (trail?.data.status !== 'confirmed' || trail.data.geometry !== geometry) return reply({}, 404);
      parent = 'farmTrails/' + id + '/versions/' + geometry;
      collectionId = 'chunks';
      select = fields('index', 'points');
    }
    const pageSize = kind === 'places' ? 8 : 40;
    const rows = await db.query(
      {
        from: [{ collectionId }],
        select,
        ...(kind === 'trails' ? { where: equal('status', 'confirmed') } : {}),
        orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
        ...(after
          ? {
              startAt: {
                values: [{ referenceValue: db.name(parent ? parent + '/' + collectionId : collectionId, after) }],
                before: false,
              },
            }
          : {}),
        limit: pageSize,
      },
      parent
    );
    const items: unknown[] = [];
    for (const { id, data } of rows) {
      if (kind === 'places') {
        const place = publicPlace(id, data);
        if (place) items.push(place);
      } else if (kind === 'trails' && safeId(data.geometry) && typeof data.name === 'string') {
        items.push({
          id,
          name: data.name,
          geometry: data.geometry,
          count: data.count,
          status: 'confirmed',
          modes: Array.isArray(data.modes)
            ? data.modes.filter((m) => ['walk', 'bike', 'vehicle'].includes(m))
            : [],
        });
      } else if (kind === 'geometry' && Array.isArray(data.points)) {
        items.push({
          index: data.index,
          points: data.points.map(({ lat, lng, seq, segment }: MapVertex) => ({ lat, lng, seq, segment })),
        });
      }
    }
    return reply({ items, next: rows.length === pageSize ? rows[rows.length - 1].id : '' });
  } catch {
    return reply({ error: 'map_unavailable' }, 503);
  }
}
