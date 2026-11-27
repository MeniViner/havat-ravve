import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { useDoc, write } from '../../../db';
import { demoOnly } from '../../../demo/store';
import { age, quality, MODES } from '../../../survey/model';
import type { useSurveyLocation } from '../../../survey/useLocation';
import { AppScreen, mapsUrl, useExternal } from '../../core';
import { Button, Icon } from '../../kit';
import { SurveyMap, type View } from './SurveyMap';
import { validHome, type MapHome } from '../../../../../shared/farm-map';
import './survey.css';

type MapProps = ComponentProps<typeof SurveyMap>;
type Sheet = 'search' | 'place' | 'trail' | 'location' | 'layers' | 'home' | null;
type Props = {
  map: MapProps;
  gps: ReturnType<typeof useSurveyLocation>;
  editing?: boolean;
  toggleEdit?: () => void;
  editPlace?: (id: string) => void;
  editTrail?: (id: string) => void;
  children?: ReactNode;
  dock?: ReactNode;
  feedback?: ReactNode;
  loading?: boolean;
};
export function MapWorkspace({
  map,
  gps,
  editing = false,
  toggleEdit,
  editPlace,
  editTrail,
  children,
  dock,
  feedback,
  loading,
}: Props) {
  const [sheet, setSheet] = useState<Sheet>(null),
    [id, select] = useState(''),
    [query, search] = useState('');
  const [expanded, expand] = useState(false),
    [follow, setFollow] = useState(false);
  const [layers, setLayers] = useState({ places: true, walk: true, vehicle: true, other: true, survey: true });
  const [view, setView] = useState<View | null>(null),
    [message, setMessage] = useState(''),
    [saving, setSaving] = useState(false);
  const [previewCamera, setPreviewCamera] = useState<MapHome | null>(null);
  const [locHint, setLocHint] = useState(() => {
    try {
      return !localStorage.getItem('farm-map-location-hint');
    } catch {
      return true;
    }
  });
  const dismissHint = () => {
    setLocHint(false);
    try {
      localStorage.setItem('farm-map-location-hint', '1');
    } catch {}
  };
  const headingFocus = useCallback((el: HTMLHeadingElement | null) => el?.focus({ preventScroll: true }), []);
  const camera = useRef<MapHome | null>(null),
    beforeHome = useRef<MapHome | null>(null),
    searchInput = useRef<HTMLInputElement>(null);
  const lastView = useRef(map.view);
  const homeDoc = useDoc<MapHome>('farmMap/home');
  const home = validHome(homeDoc.item) ? homeDoc.item : null;
  const external = useExternal();
  useEffect(() => {
    if (map.view && map.view !== lastView.current) {
      lastView.current = map.view;
      setFollow(false);
      setView(map.view);
    }
  }, [map.view]);
  const go = (next: Omit<View, 'id'>) => setView((v) => ({ ...next, id: (v?.id || 0) + 1 }));
  const cancelHome = () => {
    if (beforeHome.current) go({ point: beforeHome.current, zoom: beforeHome.current.zoom });
    beforeHome.current = null;
  };
  const close = () => {
    if (sheet === 'home') cancelHome();
    setSheet(null);
    search('');
    expand(false);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) {
        close();
        searchInput.current?.blur();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheet, saving]);
  const fixQuality = quality(gps.fix, gps.clock);
  const usable =
    gps.status.enabled &&
    ['browser', 'precise', 'approximate'].includes(gps.status.level) &&
    (fixQuality === 'fresh' || fixQuality === 'weak');
  useEffect(() => {
    if (follow && usable && gps.fix) go({ point: gps.fix });
  }, [follow, gps.fix, usable]);
  const trails = useMemo(
    () => map.trails.filter((t) => editing || t.trail.status === 'confirmed'),
    [map.trails, editing]
  );
  const visibleTrails = useMemo(
    () =>
      trails.filter(({ trail: t }) =>
        t.status === 'draft'
          ? layers.survey
          : (layers.walk && t.modes.includes('walk')) ||
            (layers.vehicle && t.modes.includes('vehicle')) ||
            (layers.other && !t.modes.includes('walk') && !t.modes.includes('vehicle'))
      ),
    [trails, layers]
  );
  const place = map.places.find((p) => p.id === id),
    trail = trails.find((t) => t.trail.id === id);
  const placeHits = map.places.filter((p) => p.name.includes(query.trim())),
    trailHits = trails.filter((t) => t.trail.name.includes(query.trim()));
  function showPlace(key: string) {
    const p = map.places.find((p) => p.id === key);
    if (!p) return;
    setLayers((v) => ({ ...v, places: true }));
    select(key);
    setFollow(false);
    expand(false);
    setSheet('place');
    search('');
    searchInput.current?.blur();
    go({ point: p, detail: true });
  }
  function showTrail(key: string) {
    const t = trails.find((t) => t.trail.id === key);
    if (!t) return;
    setLayers((v) => ({ ...v, walk: true, vehicle: true, other: true, survey: true }));
    select(key);
    setFollow(false);
    setSheet('trail');
    search('');
    searchInput.current?.blur();
    if (t.points.length) go({ points: t.points });
  }
  async function saveHome() {
    const c = camera.current;
    if (!validHome(c)) {
      setMessage('בחרו מרכז מפה תקין.');
      return;
    }
    setSaving(true);
    try {
      await write.batch([{ op: 'set', col: 'farmMap', id: 'home', data: { ...c } }], { wait: true });
      setMessage('מבט הפתיחה נשמר');
      setSheet(null);
      beforeHome.current = null;
    } catch {
      setMessage('שמירת מבט הפתיחה נכשלה. בדקו את החיבור ונסו שוב.');
    } finally {
      setSaving(false);
    }
  }
  function overview() {
    setFollow(false);
    close();
    if (home) go({ point: home, zoom: home.zoom });
    else go({ points: [...map.places, ...trails.flatMap((t) => t.points)] });
  }
  const status = !gps.status.enabled
    ? 'שירותי המיקום כבויים'
    : gps.status.level === 'blocked'
      ? 'הגישה למיקום חסומה'
      : gps.status.level === 'denied'
        ? 'הגישה למיקום נדחתה'
        : gps.issue === 'timeout'
          ? 'לא התקבל עדכון בזמן'
          : gps.issue === 'unavailable'
            ? 'המיקום אינו זמין'
            : gps.status.level === 'prompt'
              ? 'אפשר להציג את המיקום שלך'
              : fixQuality === 'missing'
                ? 'ממתינים למיקום'
                : fixQuality === 'stale'
                  ? 'המיקום אינו מתעדכן'
                  : fixQuality === 'weak'
                    ? 'דיוק המיקום נמוך'
                    : 'המיקום זמין';
  const hasPanel = !!sheet || !!(editing && children);
  return (
    <AppScreen variant="plain" className={'survey-screen map-workspace' + (hasPanel ? ' has-panel' : '')}>
      <div className="map-stage">
        <SurveyMap
          {...map}
          home={home}
          homeLoading={homeDoc.loading}
          places={layers.places ? map.places : []}
          trails={visibleTrails}
          raw={layers.survey ? map.raw : []}
          edit={layers.survey ? map.edit : undefined}
          selected={sheet === 'place' ? id : map.selected}
          selectedTrail={sheet === 'trail' ? id : undefined}
          view={view}
          onCamera={(c) => {
            camera.current = c;
            if (sheet === 'home') setPreviewCamera(c);
          }}
          onManual={() => setFollow(false)}
          onPlace={showPlace}
          onTrail={showTrail}
        />
        <div className="map-head">
          <label className="map-search">
            <Icon name="search" />
            <input
              type="search"
              ref={searchInput}
              aria-label="חיפוש במפה"
              placeholder="חיפוש מקום או שביל"
              value={query}
              disabled={sheet === 'home' || map.selecting}
              onFocus={() => setSheet('search')}
              onChange={(e) => {
                search(e.target.value);
                setSheet('search');
              }}
            />
          </label>
          {toggleEdit && (
            <Button
              icon={editing ? 'check' : 'edit'}
              disabled={saving}
              onClick={() => {
                close();
                setFollow(false);
                toggleEdit();
              }}
            >
              {editing ? 'סיום עריכה' : 'עריכת המפה'}
            </Button>
          )}
        </div>
        <div className="map-controls" aria-label="פעולות מפה">
          <button title="מבט על החווה" aria-label="מבט על החווה" disabled={sheet === 'home'} onClick={overview}>
            <Icon name="map" />
          </button>
          <button
            title="המיקום שלי"
            aria-label="המיקום שלי"
            aria-pressed={follow}
            disabled={sheet === 'home'}
            onClick={() => {
              setSheet('location');
              if (usable) setFollow(true);
            }}
          >
            <Icon name="nav" />
          </button>
          <button
            title="שכבות המפה"
            aria-label="שכבות המפה"
            disabled={sheet === 'home'}
            onClick={() => setSheet(sheet === 'layers' ? null : 'layers')}
          >
            <Icon name="grid" />
          </button>
        </div>
        {sheet === 'home' && (
          <div className="map-frame" aria-hidden="true">
            <span>+</span>
          </div>
        )}
        {!editing && !sheet && !dock && locHint && gps.status.level === 'prompt' && (
          <div className="map-loc-hint">
            <button
              onClick={() => {
                dismissHint();
                setSheet('location');
                setFollow(true);
                void gps.ask().catch(() => setMessage('לא ניתן לבקש מיקום'));
              }}
            >
              להצגת המיקום שלי בחווה
            </button>
            <button aria-label="אחר כך" onClick={dismissHint}>
              <Icon name="close" size={16} />
            </button>
          </div>
        )}
        <div className="map-status-stack">
          {dock && <div className="map-dock">{dock}</div>}
          {(feedback || message || loading || homeDoc.error) && (
            <div className="map-feedback" role="status">
              {feedback}
              {message && <button onClick={() => setMessage('')}>{message} · סגירה</button>}
              {loading && 'טוענים את מפת החווה…'}
              {homeDoc.error && 'מבט הפתיחה אינו זמין'}
            </div>
          )}
        </div>
        {hasPanel && (
          <aside
            className={'map-sheet' + (sheet === 'home' || map.selecting ? ' compact' : '')}
            aria-label={editing ? 'כלי המפה' : 'פרטים במפה'}
          >
            {sheet && (
              <button type="button" className="map-close" aria-label="סגירה" disabled={saving} onClick={close}>
                <Icon name="close" />
              </button>
            )}
            {sheet === 'search' && (
              <>
                <h2>{query ? 'תוצאות החיפוש' : 'מקומות ושבילים'}</h2>
                {placeHits.map((p) => (
                  <button key={p.id} className="survey-hit" onClick={() => showPlace(p.id)}>
                    <Icon name="pin" />
                    {p.name}
                  </button>
                ))}
                {trailHits.map((t) => (
                  <button key={t.trail.id} className="survey-hit" onClick={() => showTrail(t.trail.id)}>
                    <Icon name="nav" />
                    {t.trail.name}
                  </button>
                ))}
                {!placeHits.length && !trailHits.length && <p>אין תוצאות לחיפוש הזה</p>}
              </>
            )}
            {sheet === 'place' && place && (
              <>
                <h2 tabIndex={-1} ref={headingFocus}>
                  {place.name}
                </h2>
                {expanded && (
                  <>
                    {place.photo && <img className="survey-photo" src={place.photo} alt={place.name} />}
                    <p>
                      מיקום במפה ·{' '}
                      <bdi>
                        {place.lat.toFixed(5)}, {place.lng.toFixed(5)}
                      </bdi>
                    </p>
                  </>
                )}
                <div className="survey-actions">
                  <Button variant="quiet" onClick={() => expand(!expanded)}>
                    {expanded ? 'פחות פרטים' : 'פרטים נוספים'}
                  </Button>
                  <Button variant="outline" onClick={() => go({ point: place, detail: true })}>
                    מיקוד במקום
                  </Button>
                  <Button variant="quiet" onClick={() => external(mapsUrl(place.lat, place.lng))}>
                    ניווט חיצוני ב־Google Maps
                  </Button>
                  {editing && editPlace && (
                    <Button
                      onClick={() => {
                        close();
                        editPlace(place.id);
                      }}
                    >
                      עריכת מקום
                    </Button>
                  )}
                </div>
              </>
            )}
            {sheet === 'trail' && trail && (
              <>
                <h2>{trail.trail.name}</h2>
                <p>
                  {(Object.keys(MODES) as (keyof typeof MODES)[])
                    .map((m) => MODES[m] + ' · ' + (trail.trail.modes.includes(m) ? 'מתאים' : 'טרם נקבע'))
                    .join(' / ')}
                </p>
                {editing && editTrail && (
                  <Button
                    onClick={() => {
                      close();
                      editTrail(trail.trail.id);
                    }}
                  >
                    עריכת השביל והחיבורים
                  </Button>
                )}
              </>
            )}
            {sheet === 'layers' && (
              <>
                <h2>שכבות המפה</h2>
                {Object.entries({
                  places: 'מקומות',
                  walk: 'שבילי הליכה · קו מקווקו',
                  vehicle: 'שבילים לרכב · קו רציף',
                  other: 'שבילים נוספים',
                  ...(editing ? { survey: 'הסקר הנוכחי וטיוטות' } : {}),
                }).map(([key, label]) => (
                  <label className="map-choice" key={key}>
                    <input
                      type="checkbox"
                      checked={layers[key as keyof typeof layers]}
                      onChange={(e) => setLayers({ ...layers, [key]: e.target.checked })}
                    />
                    {label}
                  </label>
                ))}
              </>
            )}
            {sheet === 'location' && (
              <>
                <h2>{status}</h2>
                <p>
                  {gps.fix
                    ? (gps.fix.accuracy != null
                        ? 'דיוק משוער ' + Math.round(gps.fix.accuracy) + ' מ׳'
                        : 'הדיוק אינו ידוע') +
                      ' · ' +
                      age(gps.fix.at, gps.clock)
                    : 'גישה למיקום מאפשרת לראות איפה נמצאים ביחס לחווה.'}
                </p>
                {gps.status.level === 'blocked' && <p>אפשר לפתוח את הרשאות המיקום בהגדרות האתר או המכשיר.</p>}
                <Button
                  onClick={async () => {
                    try {
                      if (usable) {
                        setFollow(!follow);
                        if (!follow && gps.fix) go({ point: gps.fix });
                      } else if (gps.native && gps.status.level === 'blocked') await gps.settings('app');
                      else {
                        setFollow(true);
                        await gps.ask();
                      }
                    } catch {
                      setMessage('המיקום אינו זמין כרגע');
                    }
                  }}
                >
                  {usable ? (follow ? 'הפסקת מעקב' : 'חזרה למעקב אחרי המיקום') : 'הפעלת מיקום'}
                </Button>
              </>
            )}
            {sheet === 'home' && (
              <>
                <h2>מבט הפתיחה של החווה</h2>
                {previewCamera && (
                  <output aria-label="מרכז וזום">
                    <bdi>
                      {previewCamera.lat.toFixed(5)}, {previewCamera.lng.toFixed(5)}
                    </bdi>{' '}
                    · זום {previewCamera.zoom}
                  </output>
                )}
                <p>הזיזו את המפה וכוונו את הזום. זה המבט שייפתח לכולם בכניסה ובלחיצה על „מבט על החווה”.</p>
                <Button disabled={saving || !map.online} onClick={saveHome}>
                  {saving ? 'שומר…' : map.online ? 'שמירת המבט הזה' : 'נדרש חיבור לשמירת המבט'}
                </Button>
              </>
            )}
            {!sheet && children}
            {!sheet && editing && !map.selecting && (
              <Button
                variant="quiet"
                icon="map"
                onClick={() => {
                  beforeHome.current = camera.current;
                  setPreviewCamera(camera.current);
                  setFollow(false);
                  setSheet('home');
                }}
              >
                הגדרת מבט הפתיחה
              </Button>
            )}
          </aside>
        )}
        {demoOnly() && <small className="map-demo">מפת הדגמה</small>}
      </div>
    </AppScreen>
  );
}
