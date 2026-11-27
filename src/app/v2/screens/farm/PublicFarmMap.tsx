import { useEffect, useMemo, useState } from 'react';
import { demoItems, demoOnly, useDemoVersion } from '../../../demo/store';
import { usePlaces, useOnline } from '../../../store';
import { apiBase } from '../../../upload';
import { useSurveyLocation } from '../../../survey/useLocation';
import { unpack, type Vertex, type Trail } from '../../../survey/model';
import { MapWorkspace } from './MapWorkspace';
import { publicPlace, type MapPlace, type MapTrail } from '../../../../../shared/farm-map';
type PublicTrail = MapTrail & { geometry: string; count: number };
type Layers = { places: MapPlace[]; trails: { trail: MapTrail; points: Vertex[] }[] };
async function pages<T>(base: string, params: Record<string, string>, signal: AbortSignal): Promise<T[]> {
  const items: T[] = [],
    seen = new Set<string>();
  let next = '';
  do {
    const url = new URL('/v1/public/map', base);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    if (next) url.searchParams.set('after', next);
    const res = await fetch(url, { signal });
    if (!res.ok) throw Error('לא ניתן לטעון את שכבות החווה');
    const page = (await res.json()) as { items: T[]; next: string };
    items.push(...page.items);
    next = page.next;
    if (next && seen.has(next)) throw Error('התקבל עמוד כפול');
    seen.add(next);
  } while (next);
  return items;
}
export function PublicFarmMap() {
  const demo = demoOnly(),
    online = useOnline(),
    gps = useSurveyLocation('', false),
    fixtures = usePlaces(demo);
  const demoVersion = useDemoVersion();
  const fixtureTrails = useMemo(() => {
    if (!demo) return [];
    const drawn: Layers['trails'] = [];
    for (const trail of demoItems('farmTrails') as Trail[]) {
      if (trail.status !== 'confirmed') continue;
      const chunks = demoItems('farmTrails/' + trail.id + '/versions/' + trail.geometry + '/chunks') as {
        index: number;
        points: Vertex[];
      }[];
      const points = unpack(
        trail,
        chunks.sort((a, b) => a.index - b.index)
      );
      if (points)
        drawn.push({ trail: { id: trail.id, name: trail.name, status: 'confirmed', modes: trail.modes }, points });
    }
    return drawn;
  }, [demo, demoVersion]);
  const [layers, setLayers] = useState<Layers>({ places: [], trails: [] }),
    [loading, setLoading] = useState(!demo),
    [error, setError] = useState('');
  const [retry, refresh] = useState(0);
  useEffect(() => {
    if (demo) return;
    const ctl = new AbortController();
    async function read() {
      setError('');
      setLoading(true);
      try {
        const base = apiBase();
        if (!base) throw Error();
        const [places, trails] = await Promise.all([
          pages<MapPlace>(base, { layer: 'places' }, ctl.signal),
          pages<PublicTrail>(base, { layer: 'trails' }, ctl.signal),
        ]);
        if (ctl.signal.aborted) return;
        setLayers({ places, trails: [] });
        const drawn: Layers['trails'] = [];
        let missing = false;
        for (let i = 0; i < trails.length; i += 4) {
          const group = await Promise.allSettled(
            trails.slice(i, i + 4).map(async (trail) => {
              const chunks = await pages<{ index: number; points: Vertex[] }>(
                base,
                { layer: 'geometry', id: trail.id, version: trail.geometry },
                ctl.signal
              );
              const points = unpack(
                { count: trail.count, chunks: Math.ceil(trail.count / 128) } as Trail,
                chunks.sort((a, b) => a.index - b.index)
              );
              if (!points) throw Error();
              return { trail, points };
            })
          );
          if (ctl.signal.aborted) return;
          for (const result of group) {
            if (result.status === 'fulfilled') drawn.push(result.value);
            else missing = true;
          }
        }
        if (!ctl.signal.aborted) {
          setLayers({ places, trails: drawn });
          if (missing) setError('חלק מהשבילים עדיין אינם זמינים');
        }
      } catch {
        if (!ctl.signal.aborted) setError('לא ניתן לעדכן את נתוני המפה');
      } finally {
        if (!ctl.signal.aborted) setLoading(false);
      }
    }
    void read();
    return () => ctl.abort();
  }, [demo, online, retry]);
  const places = useMemo(
    () => (demo ? fixtures.items.flatMap((p) => publicPlace(p.id, p) || []) : layers.places),
    [demo, fixtures.items, layers.places]
  );
  return (
    <MapWorkspace
      gps={gps}
      loading={demo ? fixtures.loading : loading}
      feedback={error ? <button onClick={() => refresh((n) => n + 1)}>{error} · ניסיון נוסף</button> : undefined}
      map={{
        places,
        trails: demo ? fixtureTrails : layers.trails,
        live: gps.fix,
        clock: gps.clock,
        raw: [],
        selecting: false,
        online,
        view: null,
        onPick: () => {},
        onPlace: () => {},
        onTrail: () => {},
        onVertex: () => {},
      }}
    />
  );
}
