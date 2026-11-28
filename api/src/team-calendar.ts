// Older shared calendar entries have no audience and cannot match a Firestore equality query.
// Discover just their IDs. Firestore checks each subsequent document read, including live updates.
import { Firestore, toApiError, type Env } from './firestore';
import { verifyIdToken } from './idtoken';

function dateMillis(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
  const time = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(time) && new Date(time).toISOString().startsWith(value + 'T') ? time : NaN;
}

export async function teamCalendar(req: Request, env: Env): Promise<Response> {
  const origin = req.headers.get('origin') || '';
  const hosted = /^https:\/\/havat-ravve(?:--[a-z0-9-]+)?\.(?:web\.app|firebaseapp\.com)$/.test(origin);
  const local = !!env.FIRESTORE_EMULATOR_HOST && /^http:\/\/(?:localhost|127\.0\.0\.1):\d{1,5}$/.test(origin);
  if (origin && !hosted && !local && origin !== 'https://localhost') return new Response(null, { status: 403 });
  const headers = new Headers({ 'cache-control': 'private, no-store', 'vary': 'Origin',
    'access-control-allow-methods': 'GET, OPTIONS', 'access-control-allow-headers': 'Authorization' });
  if (origin) headers.set('access-control-allow-origin', origin);
  const empty = (status: number) => new Response(null, { status, headers });
  if (req.method === 'OPTIONS') return empty(204);
  if (req.method !== 'GET') return empty(405);
  const bearer = /^Bearer (\S+)$/.exec(req.headers.get('authorization') || '');
  if (!bearer) return empty(401);
  const params = new URL(req.url).searchParams;
  const from = params.get('from') || '', to = params.get('to') || '';
  const days = (dateMillis(to) - dateMillis(from)) / 86_400_000;
  if (!Number.isInteger(days) || days < 0 || days > 92) return empty(400);
  try {
    const { uid } = await verifyIdToken(bearer[1], env);
    const fs = new Firestore(env);
    const profile = await fs.get('users', uid);
    if (profile?.data.status !== 'active' || !['owner', 'manager', 'staff'].includes(String(profile.data.role))) return empty(403);
    const bound = (op: string, stringValue: string) => ({ fieldFilter: { field: { fieldPath: 'date' }, op, value: { stringValue } } });
    const docs = await fs.query({
      from: [{ collectionId: 'calendar' }],
      select: { fields: [{ fieldPath: 'audience' }] },
      where: { compositeFilter: { op: 'AND', filters: [bound('GREATER_THAN_OR_EQUAL', from), bound('LESS_THAN_OR_EQUAL', to)] } },
    });
    return Response.json({ ids: docs.filter(d => !Object.hasOwn(d.data, 'audience')).map(d => d.id) }, { headers });
  } catch (error) {
    return empty(toApiError(error).status);
  }
}
