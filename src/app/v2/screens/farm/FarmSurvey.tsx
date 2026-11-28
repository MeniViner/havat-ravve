import { useCallback, useEffect, useMemo, useState } from 'react';
import { useList } from '../../../db';
import { useOnline } from '../../../store';
import { useDemo } from '../../../demo/store';
import {
  age,
  coordinate,
  quality,
  unpack,
  type Fix,
  type Point,
  type Trail,
  type Vertex,
} from '../../../survey/model';
import { geometryPath, scopeOf } from '../../../survey/local';
import { useFarmHomeView } from '../../../survey/mapSettings';
import type { ScreenProps } from '../../ctx';
import { SurveyMap, type View } from './SurveyMap';
import { MapPanel, MapWorkspace } from './MapWorkspace';
import { OwnerFarmMap } from './OwnerFarmMap';
import './survey.css';

const EMPTY: Vertex[] = [];

type Layer = { points: Vertex[] | null; error: string };
function Geometry({ trail, update }: { trail: Trail; update: (key: string, layer: Layer) => void }) {
  const rows = useList<{ index: number; points: Vertex[] }>(geometryPath(trail), {
    orderBy: [['index', 'asc']],
  });
  useEffect(() => {
    if (rows.loading) return;
    const points = unpack(trail, rows.items);
    update(trail.id + '@' + trail.geometry, {
      points,
      error: rows.error || (points === null ? 'טרם התקבלו כל נקודות השביל' : ''),
    });
  }, [rows, trail, update]);
  return null;
}
export function FarmSurvey({ ctx }: ScreenProps) {
  return ctx.owner ? (
    <OwnerFarmMap key={scopeOf(ctx.user.uid)} ctx={ctx} />
  ) : (
    <TeamFarmMap key={ctx.user.uid} ctx={ctx} />
  );
}

function TeamFarmMap({ ctx }: { ctx: ScreenProps['ctx'] }) {
  const online = useOnline();
  const demo = useDemo();
  const cloud = useList<Trail>('farmTrails', { where: [['status', '==', 'confirmed']] });
  const { homeView, error: homeError } = useFarmHomeView();
  const [geometry, setGeometry] = useState<Record<string, Layer>>({});
  const updateLayer = useCallback(
    (key: string, layer: Layer) => setGeometry((v) => ({ ...v, [key]: layer })),
    []
  );
  const [view, setView] = useState<View | null>(null);
  const places = useMemo(() => ctx.places.filter((p) => !p.archived && coordinate(p)), [ctx.places]);
  const trails = useMemo(() => cloud.items.filter((t) => t.status === 'confirmed'), [cloud.items]);
  const drawn = useMemo(
    () =>
      trails.map((trail) => ({ trail, points: geometry[trail.id + '@' + trail.geometry]?.points ?? EMPTY })),
    [trails, geometry]
  );
  const [locating, setLocating] = useState(false);
  const [following, setFollowing] = useState(false);
  const [showLocation, setShowLocation] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [fix, setFix] = useState<Fix | null>(null);
  const [clock, setClock] = useState(Date.now);
  useEffect(() => {
    if (!locating) return;
    if (!navigator.geolocation) {
      setLocationError('המכשיר לא מספק מיקום לדפדפן הזה.');
      setShowLocation(true);
      setLocating(false);
      setFollowing(false);
      return;
    }
    let active = true;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        if (!active) return;
        setClock(Date.now());
        setFix({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracy: p.coords.accuracy,
          at: p.timestamp,
        });
        setLocationError('');
      },
      (e) => {
        if (!active) return;
        setLocationError(
          e.code === 1
            ? 'כדי להציג מיקום, יש לאפשר גישה למיקום בהגדרות המכשיר או הדפדפן.'
            : 'לא התקבל מיקום מהמכשיר. אפשר לנסות שוב בשטח פתוח.'
        );
        setLocating(false);
        setFollowing(false);
        setFix(null);
        setShowLocation(true);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 }
    );
    const timer = window.setInterval(() => setClock(Date.now()), 2500);
    return () => {
      active = false;
      navigator.geolocation.clearWatch(id);
      window.clearInterval(timer);
    };
  }, [locating]);
  const hasFreshFix = !!fix && ['fresh', 'weak'].includes(quality(fix, clock));
  const focus = (points: Point[]) => {
    setFollowing(false);
    setView((prev) => ({ id: (prev?.id || 0) + 1, points }));
  };
  const locate = () => {
    setLocationError('');
    setLocating(true);
    setFollowing(true);
    setShowLocation(false);
    if (hasFreshFix && fix) setView((prev) => ({ id: (prev?.id || 0) + 1, point: fix }));
  };
  const locationLabel = fix
    ? hasFreshFix
      ? 'המיקום שלי'
      : 'המיקום האחרון שלי'
    : locating
      ? 'מחפש מיקום…'
      : undefined;
  const locationDetail = fix
    ? hasFreshFix && fix.accuracy != null
      ? 'דיוק של כ־' + Math.round(fix.accuracy) + ' מטר'
      : age(fix.at, clock)
    : undefined;
  const partial = trails.some((t) => geometry[t.id + '@' + t.geometry]?.error);
  return (
    <>
      {trails.map((t) => (
        <Geometry key={t.id + '@' + t.geometry} trail={t} update={updateLayer} />
      ))}
      <MapWorkspace
        places={places}
        trails={drawn}
        online={online}
        isDemo={demo.on}
        onFocus={focus}
        onHome={() => {
          setFollowing(false);
          setView((prev) => ({ id: (prev?.id || 0) + 1, home: true }));
        }}
        locationLabel={locationLabel}
        locationDetail={locationDetail}
        onLocate={locate}
        onLocationDetails={() => setShowLocation(true)}
        onClosePanel={() => setShowLocation(false)}
        panel={
          showLocation && (
            <MapPanel title="המיקום שלי" onClose={() => setShowLocation(false)}>
              <div className="fm-stack">
                <p>
                  {locationError ||
                    (fix
                      ? [locationLabel, locationDetail].join(' · ')
                      : 'אפשר להציג את מיקום המכשיר על המפה כדי להתמצא בחווה.')}
                </p>
                <button className="fm-btn fm-primary" onClick={locate}>
                  {fix ? 'מיקוד במיקום שלי' : 'קבלת מיקום מהמכשיר'}
                </button>
                {locating && (
                  <button
                    className="fm-btn"
                    onClick={() => {
                      setLocating(false);
                      setFix(null);
                      setFollowing(false);
                      setShowLocation(false);
                    }}
                  >
                    הפסקת הצגת המיקום
                  </button>
                )}
              </div>
            </MapPanel>
          )
        }
        notice={cloud.error || homeError || (partial ? 'חלק מהשבילים עדיין לא נטענו במלואם.' : '')}
        renderMap={(ui) => (
          <SurveyMap
            places={places}
            trails={drawn}
            live={fix}
            clock={clock}
            raw={EMPTY}
            selecting={false}
            selected={ui.selected}
            selectedTrail={ui.selectedTrail}
            online={online}
            view={view}
            layers={ui.layers}
            homeView={homeView}
            following={following && hasFreshFix}
            onStopFollowing={() => setFollowing(false)}
            panelRef={ui.panelRef}
            base={ui.base}
            onPlace={ui.onPlace}
            onTrail={ui.onTrail}
            onPick={() => {}}
            onVertex={() => {}}
          />
        )}
      />
    </>
  );
}
