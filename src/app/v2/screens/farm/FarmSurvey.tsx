import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useList, newId, write } from '../../../db';
import { useOnline, compressPhoto } from '../../../store';
import { demoOnly } from '../../../demo/store';
import type { Place } from '../../../types';
import { useSurveyLocation } from '../../../survey/useLocation';
import {
  age,
  coordinate,
  geometryOf,
  quality,
  connectionCurrent,
  surveyMetrics,
  unpack,
  type PlaceDraft,
  type PlacePoint,
  type Point,
  type Trail,
  type Vertex,
} from '../../../survey/model';
import {
  draftAt,
  enqueue,
  flush,
  geometryPath,
  jobs,
  placeFields,
  readDraft,
  recoverJob,
  scopeOf,
  type Review,
} from '../../../survey/local';
import { MapWorkspace } from './MapWorkspace';
import { Setup } from './MapSetup';
import { PublicFarmMap } from './PublicFarmMap';
import { markerIcons, type MarkerIcon } from '../../../../../shared/farm-map';
import { Button, Field, Icon } from '../../kit';
import type { ScreenProps } from '../../ctx';
import { type View } from './SurveyMap';
import { TrailReview } from './TrailReview';
import './survey.css';

const EMPTY: Vertex[] = [];

type Layer = { points: Vertex[] | null; error: string };
function Geometry({ trail, update }: { trail: Trail; update: (key: string, layer: Layer) => void }) {
  const rows = useList<{ index: number; points: Vertex[] }>(geometryPath(trail), { orderBy: [['index', 'asc']] });
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
  if (!ctx.owner || ctx.viewAsStaff) return <PublicFarmMap />;
  return <Survey key={scopeOf(ctx.user.uid)} ctx={ctx} />;
}
function Survey({ ctx }: { ctx: ScreenProps['ctx'] }) {
  const scope = scopeOf(ctx.user.uid),
    online = useOnline();
  const gps = useSurveyLocation(ctx.user.uid),
    { session } = gps.status;
  const q = quality(gps.fix, gps.clock),
    current =
      gps.fix &&
      gps.status.enabled &&
      ['precise', 'approximate', 'browser'].includes(gps.status.level) &&
      (q === 'fresh' || q === 'weak')
        ? gps.fix
        : null;
  const cloud = useList<Trail>('farmTrails', {}),
    [layers, setLayers] = useState<Record<string, Layer>>({});
  const [queue, setQueue] = useState<Awaited<ReturnType<typeof jobs>>>([]),
    [syncError, setSyncError] = useState('');
  const [place, setPlace] = useState<PlaceDraft | null>(null),
    [review, setReview] = useState<Review | null>(null);
  const [workingReview, setWorkingReview] = useState(false),
    [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false),
    lock = useRef(false);
  const [error, setError] = useState(''),
    [note, setNote] = useState('');
  const [editing, setEditing] = useState(false);
  const [tool, setTool] = useState<'menu' | 'places' | 'trails' | 'location' | 'setup'>('menu');
  const [candidate, setCandidate] = useState<Point | null>(null);
  const [remove, setRemove] = useState(false);
  const [selection, setSelection] = useState<'new' | 'place' | 'vertex' | 'draw' | null>(null),
    [anchor, setAnchor] = useState(0);
  const [selected, setSelected] = useState('');
  const [view, setView] = useState<View | null>(null),
    [undo, setUndo] = useState<Review | null>(null);
  const photo = useRef<HTMLInputElement>(null);
  const placeKey = scope + ':place',
    reviewKey = scope + ':review';
  const updateLayer = useCallback((key: string, layer: Layer) => setLayers((v) => ({ ...v, [key]: layer })), []);
  const setDraft = (value: PlaceDraft | null) => {
    setPlace(value);
    void draftAt(placeKey, value).catch((e) => setError(e.message));
  };
  const setWork = (value: Review | null) => {
    setReview(value);
    void draftAt(reviewKey, value).catch((e) => setError(e.message));
  };
  const retrySync = useCallback(() => {
    setSyncError('');
    void flush(scope).catch((e) => setSyncError(e.message));
  }, [scope]);
  useEffect(() => {
    let live = true;
    const refresh = () => {
      void jobs(scope)
        .then((j) => {
          if (live) setQueue(j);
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    };
    void Promise.all([readDraft<PlaceDraft>(placeKey), readDraft<Review>(reviewKey)])
      .then(([p, r]) => {
        if (live) {
          setPlace(p ?? null);
          setReview(r ?? null);
          setWorkingReview(!!r && !p);
          setAnchor(r?.points[0]?.seq ?? 0);
          setReady(true);
        }
      })
      .catch((e) => setError(e.message));
    refresh();
    retrySync();
    window.addEventListener('farm-survey-change', refresh);
    window.addEventListener('online', retrySync);
    return () => {
      live = false;
      window.removeEventListener('farm-survey-change', refresh);
      window.removeEventListener('online', retrySync);
    };
  }, [scope, placeKey, reviewKey, retrySync]);
  const places = useMemo(() => {
    const all = new Map(ctx.places.map((p) => [p.id, p]));
    for (const j of queue)
      if (j.place) {
        const p = j.place.draft;
        all.set(p.id, {
          ...p.original,
          ...placeFields(j.place),
          id: p.id,
          createdBy: p.original?.createdBy || j.place.actor,
          createdAt: p.original?.createdAt || j.place.at,
        });
      }
    return [...all.values()].filter((p) => !p.archived);
  }, [ctx.places, queue]);
  const trails = useMemo(() => {
    const all = new Map(cloud.items.map((t) => [t.id, t]));
    for (const j of queue) if (j.review) all.set(j.review.trail.id, j.review.trail);
    return [...all.values()];
  }, [cloud.items, queue]);
  const drawn = useMemo(
    () =>
      trails.map((trail) => ({
        trail,
        points:
          [...queue].reverse().find((j) => j.review?.trail.id === trail.id)?.review?.points ??
          layers[trail.id + '@' + trail.geometry]?.points ??
          EMPTY,
      })),
    [trails, queue, layers]
  );
  const active = places.find((p) => p.id === selected);
  const act = async (fn: () => void | Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setNote('');
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message || 'הפעולה לא הושלמה');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const focus = (point?: Point, points?: Point[]) => setView((v) => ({ id: (v?.id || 0) + 1, point, points }));
  function beginPlace(point: PlacePoint, p?: Place) {
    if (place && (!p || place.id !== p.id)) {
      setError('יש טיוטת מקום פתוחה. שמרו או בטלו אותה לפני עריכת מקום נוסף.');
      return;
    }
    if (place && p?.id === place.id) return;
    setRemove(false);
    setTool('places');
    setSelected('');
    setSelection(null);
    setWorkingReview(false);
    setDraft({
      id: p?.id || newId('places'),
      editing: !!p,
      original: p,
      point,
      name: p?.name || '',
      photo: p?.photo || '',
      markerIcon: p?.markerIcon || 'pin',
      markerDisplay: p?.markerDisplay || 'icon',
      selected: true,
    });
  }
  function chooseVertex(seq: number) {
    setAnchor(seq);
    const p = review?.points.find((p) => p.seq === seq);
    if (p) focus(p);
  }
  function changeGeometry(points: Vertex[]) {
    if (!review) return;
    setUndo(review);
    setWork({
      ...review,
      points,
      dirtyGeometry: true,
      trail: { ...review.trail, geometry: crypto.randomUUID(), status: 'draft', modes: [], connections: [] },
    });
    setAnchor(points.find((p) => p.seq === anchor)?.seq ?? points[0]?.seq ?? 0);
    setNote('הגאומטריה עודכנה. יש לאשר מחדש את אפשרויות המעבר והחיבורים.');
  }
  function newDrawing() {
    if (review) {
      setWorkingReview(true);
      return;
    }
    const id = newId('farmTrails');
    setWork({
      trail: {
        id,
        name: '',
        ownerUid: ctx.user.uid,
        recordingId: id,
        revision: '',
        geometry: crypto.randomUUID(),
        status: 'draft',
        modes: [],
        connections: [],
        count: 0,
        chunks: 0,
        updatedAt: 0,
      },
      base: '',
      points: [],
      dirtyGeometry: true,
    });
    setSelection('draw');
    setWorkingReview(true);
    setTool('trails');
    setCandidate(null);
  }
  function pick(p: Point) {
    if (selection === 'draw' && review) {
      setUndo(review);
      const seq = (review.points.at(-1)?.seq || 0) + 1;
      setWork({
        ...review,
        dirtyGeometry: true,
        trail: { ...review.trail, geometry: crypto.randomUUID(), status: 'draft', modes: [], connections: [] },
        points: [...review.points, { ...p, seq, segment: review.points.at(-1)?.segment || 1 }],
      });
      setAnchor(seq);
      return;
    }
    setCandidate(p);
  }
  function confirmPick() {
    const p = candidate;
    if (!p) return;
    setCandidate(null);
    const point: PlacePoint = { ...p, at: Date.now(), source: 'manual', accuracy: null };
    if (selection === 'new') beginPlace(point);
    if (selection === 'place' && place) setDraft({ ...place, point, selected: true });
    if (selection === 'vertex' && review)
      changeGeometry(review.points.map((v) => (v.seq === anchor ? { ...v, ...p } : v)));
    setSelection(null);
  }
  async function savePlace() {
    if (!editing || !place || !place.name.trim() || !coordinate(place.point)) return;
    await enqueue(scope, { place: { draft: place, actor: ctx.actor, at: new Date().toISOString() } }, placeKey);
    setQueue(await jobs(scope));
    setPlace(null);
    setSelected(place.id);
    setTool(session ? 'trails' : 'menu');
    setSelection(null);
    setNote('המקום נשמר במכשיר');
    retrySync();
  }
  function openTrail(id: string) {
    if (place || (review && review.trail.id !== id)) {
      setError('לפני פתיחת שביל אחר, סיימו את הטיוטה הפתוחה.');
      return;
    }
    const d = drawn.find((d) => d.trail.id === id);
    if (!d || d.points.length !== d.trail.count) {
      setError('נקודות השביל עדיין לא זמינות. אפשר לנסות שוב עם חיבור לרשת.');
      return;
    }
    if (!review) setWork({ trail: d.trail, base: d.trail.revision, points: d.points, dirtyGeometry: false });
    setUndo(null);
    setSelected('');
    setWorkingReview(true);
    setAnchor(d.points[0]?.seq || 0);
    focus(undefined, d.points);
  }
  function recordingReview() {
    if (!session || session.state !== 'review' || gps.raw.length !== session.count) return;
    if (review && review.trail.id !== session.id) {
      setError('סיימו את עריכת השביל הפתוח ואז חזרו להקלטה');
      return;
    }
    const points = geometryOf(gps.raw);
    if (!review)
      setWork({
        trail: {
          id: session.id,
          name: '',
          ownerUid: ctx.user.uid,
          recordingId: session.id,
          revision: '',
          geometry: crypto.randomUUID(),
          status: 'draft',
          modes: [],
          connections: [],
          count: points.length,
          chunks: 0,
          updatedAt: 0,
        },
        base: '',
        points,
        dirtyGeometry: true,
        raw: { recording: session, samples: gps.raw },
      });
    setWorkingReview(true);
    setSelected('');
    setAnchor(points[0]?.seq || 0);
    focus(undefined, points);
  }
  async function saveReview(confirm: boolean) {
    if (!editing || !review) return;
    const { points, trail } = review;
    if (confirm && trail.connections.some((c) => !connectionCurrent(c, places, trails))) {
      throw new Error('אחד היעדים השתנה או טרם נטען. בדקו את החיבורים לפני אישור השביל.');
    }
    const saved = {
      ...review,
      trail: {
        ...trail,
        name: trail.name.trim(),
        revision: crypto.randomUUID(),
        updatedAt: Date.now(),
        status: confirm ? ('confirmed' as const) : ('draft' as const),
        count: points.length,
        chunks: Math.ceil(points.length / 128),
        connections: trail.connections,
      },
    };
    await enqueue(scope, { review: saved }, reviewKey);
    setQueue(await jobs(scope));
    setReview(null);
    setWorkingReview(false);
    setUndo(null);
    setNote('השביל נשמר במכשיר');
    retrySync();
    if (session?.id === trail.id && session.state === 'review') await gps.control('saved', session);
  }
  // If the process stopped after enqueuing the review but before acknowledging the recorder, release that same session only.
  const acknowledged =
    !!session && (trails.some((t) => t.id === session.id) || queue.some((j) => j.review?.trail.id === session.id));
  useEffect(() => {
    if (session?.state === 'review' && acknowledged && gps.grant && !lock.current)
      void gps.control('saved', session).catch((e) => setError(e.message));
  }, [session?.id, session?.state, acknowledged, gps.grant]);
  const fixText =
    q === 'fresh'
      ? 'מדידה עדכנית'
      : q === 'weak'
        ? 'מדידה בדיוק נמוך'
        : q === 'stale'
          ? 'מדידה ישנה'
          : 'טרם התקבלה מדידה';
  const perm = gps.status.level,
    native = gps.native;
  const statusText = !gps.statusReady
    ? 'בודקים גישה למיקום'
    : !gps.status.enabled
      ? 'שירותי המיקום כבויים'
      : perm === 'approximate'
        ? 'ניתנה גישה למיקום משוער'
        : perm === 'blocked'
          ? 'הגישה למיקום חסומה'
          : perm === 'denied'
            ? 'הגישה למיקום נדחתה'
            : perm === 'prompt'
              ? 'מיקום בסקר החווה'
              : gps.issue === 'timeout'
                ? 'הזמן לקבלת מדידה חלף'
                : gps.issue === 'unavailable'
                  ? 'המיקום אינו זמין'
                  : fixText;
  const needsSettings = !gps.status.enabled || perm === 'blocked' || perm === 'approximate';
  const locationAction = () =>
    act(async () => {
      if (native && needsSettings) await gps.settings(gps.status.enabled ? 'app' : 'device');
      else if (perm === 'prompt' || perm === 'denied') await gps.ask();
      else gps.refresh();
    });
  const prompting = perm === 'prompt' || perm === 'denied' || needsSettings;
  const startPlace = (id: string) => {
    const p = places.find((x) => x.id === id);
    if (p)
      beginPlace(
        { lat: p.lat, lng: p.lng, accuracy: p.accuracy, at: p.measuredAt || 0, source: p.source || 'legacy' },
        p
      );
  };
  const cancelPick = () => {
    setCandidate(null);
    setSelection(null);
  };
  const gpsPanel = (
    <section className="survey-panel survey-location">
      <div className="survey-row">
        <h2>{statusText}</h2>
        <i className={'survey-dot ' + (q === 'fresh' ? 'good' : '')} aria-hidden="true" />
      </div>
      {gps.statusReady && perm === 'prompt' && (
        <p>כדי לשמור את המקום שבו עומדים ולהקליט שביל, אפשרו גישה למיקום המדויק בזמן השימוש.</p>
      )}
      {(!gps.status.enabled || perm === 'blocked' || perm === 'approximate') && (
        <p>
          {!gps.status.enabled
            ? 'בהגדרות המכשיר הפעילו את שירותי המיקום וחזרו למפה.'
            : native
              ? 'בהגדרות האפליקציה בחרו הרשאות ← מיקום ← בזמן השימוש, והפעילו מיקום מדויק.'
              : 'בהגדרות האתר בדפדפן, אפשרו גישה למיקום וחזרו למפה.'}
        </p>
      )}
      {gps.fix && (
        <p>
          {statusText !== fixText && fixText + ' · '}
          {gps.fix.accuracy != null ? `דיוק משוער ${Math.round(gps.fix.accuracy)} מ׳` : 'הדיוק לא דווח'} ·{' '}
          {age(gps.fix.at, gps.clock)}
        </p>
      )}
      {!prompting && !gps.fix && <p>ממתינים למדידה מהמכשיר. אפשר לסמן מקום גם ידנית.</p>}
      {native && !gps.grant && !gps.issue && <p>מאמתים את חשבון הבעלים…</p>}
      {gps.issue && !['timeout', 'unavailable'].includes(gps.issue) && <p role="alert">{gps.issue}</p>}
      <Button
        variant={prompting ? 'primary' : 'quiet'}
        disabled={busy || (!gps.statusReady && !gps.issue)}
        onClick={locationAction}
      >
        {native && needsSettings ? 'פתיחת ההגדרות' : perm === 'prompt' ? 'לאפשר גישה למיקום' : 'בדיקת מיקום מחדש'}
      </Button>
    </section>
  );
  const feedback =
    error ||
    syncError ||
    ctx.placesError ||
    cloud.error ||
    (Object.values(layers).some((l) => l.error) ? 'חלק מהשבילים עדיין לא נטענו' : '') ||
    note;
  const recordingMetrics = useMemo(() => surveyMetrics(gps.raw), [gps.raw]);
  const seconds =
    !native && session && 'elapsedMs' in session
      ? Math.floor(
          (Number(session.elapsedMs) +
            (session.state === 'recording' && 'activeSince' in session
              ? Math.max(0, gps.clock - Number(session.activeSince))
              : 0)) /
            1000
        )
      : recordingMetrics.seconds;
  const dock = session && (
    <div>
      <b>
        {
          { recording: '● מקליט שביל', paused: 'Ⅱ מושהה', interrupted: 'ההקלטה נקטעה', review: 'מוכן לסקירה' }[
            session.state
          ]
        }
      </b>
      <span>
        {' '}
        · {native ? 'זמן מדוד' : 'זמן הקלטה'}{' '}
        <bdi>
          {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
        </bdi>{' '}
        ·{' '}
        {recordingMetrics.seconds > 0 ? Math.round(recordingMetrics.meters) + ' מ׳ מדודים' : 'ממתינים למדידת מרחק'}{' '}
        · {gps.fix?.accuracy != null ? 'דיוק משוער ' + Math.round(gps.fix.accuracy) + ' מ׳' : 'דיוק לא ידוע'}
      </span>
      {session.state === 'recording' &&
        (q === 'stale' || gps.issue === 'timeout' || gps.issue === 'unavailable') && (
          <strong> · אין עדכון מיקום</strong>
        )}
      {session.state === 'recording' && (
        <button disabled={busy} onClick={() => act(() => gps.control('pause', session))}>
          השהיית ההקלטה
        </button>
      )}
      {['paused', 'interrupted'].includes(session.state) && (
        <button
          disabled={busy || q !== 'fresh' || !current}
          onClick={() => act(() => gps.control('resume', session))}
        >
          חידוש ההקלטה
        </button>
      )}
      {session.state !== 'review' && (
        <button
          disabled={busy}
          onClick={() =>
            act(async () => {
              await gps.control('finish', session);
              setEditing(true);
              setTool('trails');
            })
          }
        >
          סיום וסקירה
        </button>
      )}
      {session.state === 'review' && !place && (
        <button
          disabled={gps.raw.length !== session.count}
          onClick={() => {
            setEditing(true);
            setTool('trails');
            recordingReview();
          }}
        >
          פתיחת הסקירה
        </button>
      )}
    </div>
  );
  return (
    <>
      {cloud.items.map((t) => (
        <Geometry key={t.id + '@' + t.geometry} trail={t} update={updateLayer} />
      ))}
      <MapWorkspace
        gps={gps}
        editing={editing}
        toggleEdit={() => {
          setEditing(!editing);
          cancelPick();
          setTool('menu');
        }}
        dock={dock}
        loading={ctx.placesLoading || cloud.loading}
        feedback={
          feedback ? (
            <button
              onClick={() => {
                setError('');
                setNote('');
                if (syncError) retrySync();
              }}
            >
              {feedback}
            </button>
          ) : undefined
        }
        editPlace={startPlace}
        editTrail={(id) => {
          setTool('trails');
          openTrail(id);
        }}
        map={{
          places,
          trails: drawn,
          live: gps.fix,
          clock: gps.clock,
          raw: gps.raw,
          draft: editing ? candidate || place?.point : undefined,
          selected,
          edit: editing && workingReview ? review?.points : undefined,
          anchor,
          selecting: editing && !!selection,
          online,
          view,
          onPick: pick,
          onVertex: chooseVertex,
          onPlace: startPlace,
          onTrail: openTrail,
        }}
      >
        {editing && (
          <>
            {selection && (
              <section className="survey-panel">
                <h2>{selection === 'draw' ? 'שרטוט שביל' : 'בחירת נקודה במפה'}</h2>
                <p>
                  {selection === 'draw'
                    ? 'לחצו על המפה להוספת נקודות לפי הסדר.'
                    : candidate
                      ? 'הנקודה מסומנת. אפשר לבחור נקודה אחרת או לאשר.'
                      : 'געו בנקודה הרצויה ואז אשרו את המיקום.'}
                </p>
                {selection === 'draw' ? (
                  <>
                    <Button disabled={(review?.points.length || 0) < 2} onClick={() => setSelection(null)}>
                      סקירת התוואי
                    </Button>
                    <Button
                      variant="quiet"
                      disabled={!review?.points.length}
                      onClick={() => review && setWork({ ...review, points: review.points.slice(0, -1) })}
                    >
                      ביטול נקודה אחרונה
                    </Button>
                  </>
                ) : (
                  <Button disabled={!candidate} onClick={confirmPick}>
                    אישור המיקום
                  </Button>
                )}
                <Button
                  variant="quiet"
                  onClick={() => {
                    cancelPick();
                    if (selection === 'draw') setWorkingReview(false);
                  }}
                >
                  חזרה לכלים
                </Button>
              </section>
            )}
            {!selection && !place && !workingReview && (
              <>
                {tool !== 'menu' && (
                  <Button variant="quiet" onClick={() => setTool('menu')}>
                    כל כלי העריכה
                  </Button>
                )}
                {tool === 'menu' && (
                  <>
                    <h2>עריכת המפה</h2>
                    <Button icon="pin" variant="outline" onClick={() => setTool('places')}>
                      מקומות
                    </Button>
                    <Button icon="nav" variant="outline" onClick={() => setTool('trails')}>
                      שבילים והקלטה
                    </Button>
                    <Button variant="quiet" onClick={() => setTool('setup')}>
                      הגדרה ראשונית
                    </Button>
                    {review && <Button onClick={() => setWorkingReview(true)}>המשך טיוטת השביל</Button>}
                  </>
                )}
                {tool === 'places' && (
                  <>
                    <h2>מקומות בחווה</h2>
                    <Button
                      disabled={!ready || !current}
                      onClick={() => current && beginPlace({ ...current, source: 'gps' })}
                    >
                      שמירת מקום כאן
                    </Button>
                    <Button
                      variant="outline"
                      disabled={!ready}
                      onClick={() => {
                        setSelection('new');
                        setCandidate(null);
                      }}
                    >
                      בחירה ידנית במפה
                    </Button>
                    {!current && (
                      <Button variant="quiet" onClick={() => setTool('location')}>
                        בדיקת גישה למיקום
                      </Button>
                    )}
                    {places.map((p) => (
                      <button className="survey-hit" key={p.id} onClick={() => startPlace(p.id)}>
                        <Icon name="edit" />
                        {p.name}
                      </button>
                    ))}
                  </>
                )}
                {(tool === 'location' || tool === 'trails') && gpsPanel}
                {tool === 'setup' && (
                  <Setup
                    scope={scope}
                    places={places}
                    trails={trails}
                    gpsPanel={gpsPanel}
                    onPlaces={() => setTool('places')}
                    onTrails={() => setTool('trails')}
                  />
                )}
              </>
            )}
            {place && !selection && (
              <section className="survey-panel">
                <h2>{place.editing ? 'עריכת מקום' : 'שמירת מקום'}</h2>
                <p>
                  {place.point.source === 'manual'
                    ? 'נקודה שנבחרה במפה'
                    : place.point.source === 'legacy'
                      ? 'נקודה שמורה'
                      : 'נקודה שנמדדה בשטח'}{' '}
                  ·{' '}
                  <bdi>
                    {place.point.lat.toFixed(6)}, {place.point.lng.toFixed(6)}
                  </bdi>
                  {place.point.accuracy != null && ` · דיוק משוער ${Math.round(place.point.accuracy)} מ׳`}
                </p>
                <Field
                  label="שם המקום"
                  maxLength={120}
                  value={place.name}
                  onChange={(e) => setDraft({ ...place, name: e.target.value })}
                  placeholder="למשל, שער הכניסה"
                />
                {place.photo && <img className="survey-photo" src={place.photo} alt="תמונת המקום" />}
                <input
                  ref={photo}
                  hidden
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f)
                      void act(async () => {
                        const image = await compressPhoto(f);
                        setDraft({ ...place, photo: image });
                      });
                  }}
                />
                <fieldset>
                  <legend>סמן במפה</legend>
                  <label className="map-choice">
                    <input
                      type="radio"
                      checked={place.markerDisplay !== 'photo'}
                      onChange={() => setDraft({ ...place, markerDisplay: 'icon' })}
                    />
                    אייקון
                  </label>
                  <label className="map-choice">
                    <input
                      type="radio"
                      disabled={!place.photo}
                      checked={place.markerDisplay === 'photo'}
                      onChange={() => setDraft({ ...place, markerDisplay: 'photo' })}
                    />
                    תמונה ממוזערת{!place.photo && ' · יש להוסיף תמונה'}
                  </label>
                  {place.markerDisplay !== 'photo' && (
                    <label>
                      אייקון המקום{' '}
                      <select
                        aria-label="אייקון המקום"
                        value={place.markerIcon || 'pin'}
                        onChange={(e) => setDraft({ ...place, markerIcon: e.target.value as MarkerIcon })}
                      >
                        {Object.entries(markerIcons).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </fieldset>
                {place.editing && (
                  <div>
                    {remove ? (
                      <>
                        <p>
                          להסיר את „{place.name}” מהמפה? הפניות היסטוריות יישמרו.{' '}
                          {
                            trails.filter((t) =>
                              t.connections.some((c) => c.target === 'place' && c.targetId === place.id)
                            ).length
                          }{' '}
                          שבילים מקושרים למקום.
                        </p>
                        <Button
                          disabled={busy}
                          onClick={() =>
                            act(async () => {
                              await write.batch(
                                [{ op: 'update', col: 'places', id: place.id, data: { archived: true } }],
                                { wait: true }
                              );
                              setDraft(null);
                              setSelected('');
                              setRemove(false);
                              setTool('menu');
                              setNote('המקום הוסר מהמפה');
                            })
                          }
                        >
                          אישור הסרת המקום
                        </Button>
                        <Button variant="quiet" onClick={() => setRemove(false)}>
                          ביטול הסרה
                        </Button>
                      </>
                    ) : (
                      <Button variant="quiet" onClick={() => setRemove(true)}>
                        הסרת המקום מהמפה
                      </Button>
                    )}
                  </div>
                )}
                <div className="survey-actions">
                  <Button variant="quiet" icon="camera" onClick={() => photo.current?.click()}>
                    {place.photo ? 'החלפת תמונה' : 'הוספת תמונה'}
                  </Button>
                  <Button
                    variant="quiet"
                    onClick={() => {
                      setSelection('place');
                      focus(place.point);
                    }}
                  >
                    תיקון במפה
                  </Button>
                  {current && (
                    <Button
                      variant="quiet"
                      onClick={() => setDraft({ ...place, point: { ...current, source: 'gps' } })}
                    >
                      שימוש במדידה הנוכחית
                    </Button>
                  )}
                </div>
                <div className="survey-actions">
                  <Button disabled={busy || !place.name.trim()} onClick={() => act(savePlace)}>
                    שמירת המקום
                  </Button>
                  <Button
                    variant="quiet"
                    onClick={() => {
                      setDraft(null);
                      setSelection(null);
                    }}
                  >
                    ביטול
                  </Button>
                </div>
              </section>
            )}
            {!place && !selection && workingReview && review && (
              <Button
                variant="outline"
                onClick={() => {
                  setSelection('draw');
                  setCandidate(null);
                }}
              >
                הוספת נקודות לתוואי
              </Button>
            )}
            {!place && !selection && workingReview && review && (
              <TrailReview
                review={review}
                places={places}
                trails={drawn}
                anchor={anchor}
                onAnchor={chooseVertex}
                change={setWork}
                locate={(p) => {
                  focus(p);
                }}
                edit={changeGeometry}
                move={() => {
                  setSelection('vertex');
                  chooseVertex(anchor);
                }}
                undo={() => {
                  if (undo) {
                    setWork(undo);
                    setUndo(null);
                    setNote('התיקון בוטל');
                  }
                }}
                canUndo={!!undo}
                save={(c) => act(() => saveReview(c))}
                close={() => {
                  setTool('trails');
                  setWorkingReview(false);
                  setSelection(null);
                }}
                discard={() =>
                  act(async () => {
                    if (!window.confirm('לוותר על טיוטת השביל במכשיר?')) return;
                    if (session?.state === 'review' && session.id === review.trail.id)
                      await gps.control('saved', session);
                    setWork(null);
                    setWorkingReview(false);
                    setTool('trails');
                  })
                }
                busy={busy}
              />
            )}
            {!place && !workingReview && !selection && tool === 'trails' && (
              <section className="survey-panel">
                <h2>{session ? 'הסקר הנוכחי' : places.length ? 'המשך הסקר' : 'המקום הראשון בחווה'}</h2>
                {session && (
                  <p>
                    <b>
                      {
                        {
                          recording: 'מקליט שביל',
                          paused: 'ההקלטה מושהית',
                          interrupted: 'ההקלטה נקטעה',
                          review: 'ההקלטה מוכנה לסקירה',
                        }[session.state]
                      }
                    </b>{' '}
                    · {session.count === 1 ? 'מדידה אחת שמורה' : session.count + ' מדידות שמורות'} במכשיר
                    {session.lastAt && ' · מדידה אחרונה ' + age(session.lastAt, gps.clock)}
                  </p>
                )}
                {session?.state === 'interrupted' && <p>המשך ההקלטה יפתח מקטע חדש. המדידות הקודמות שמורות.</p>}
                <div className="survey-actions">
                  {!session && !review && (
                    <Button
                      variant={places.length ? 'primary' : 'outline'}
                      disabled={
                        busy ||
                        !ready ||
                        (!native && !gps.browserReady) ||
                        (native && !gps.grant) ||
                        !current ||
                        q !== 'fresh' ||
                        (native && perm !== 'precise') ||
                        !gps.status.enabled
                      }
                      onClick={() => act(() => gps.control('start'))}
                    >
                      התחלת הקלטת שביל
                    </Button>
                  )}
                  {session?.state === 'recording' && (
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => act(() => gps.control('pause', session))}
                    >
                      השהיה
                    </Button>
                  )}
                  {(session?.state === 'paused' || session?.state === 'interrupted') && (
                    <Button
                      disabled={
                        busy || !current || q !== 'fresh' || (native && perm !== 'precise') || !gps.status.enabled
                      }
                      onClick={() => act(() => gps.control('resume', session))}
                    >
                      המשך הקלטה
                    </Button>
                  )}
                  {session && session.state !== 'review' && (
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => act(() => gps.control('finish', session))}
                    >
                      סיום ההקלטה
                    </Button>
                  )}
                  {session?.state === 'review' && !review && (
                    <Button disabled={busy || gps.raw.length !== session.count} onClick={recordingReview}>
                      סקירה ושמירה
                    </Button>
                  )}
                  {review && (
                    <Button
                      onClick={() => {
                        setWorkingReview(true);
                        focus(undefined, review.points);
                      }}
                    >
                      חזרה לעריכת השביל
                    </Button>
                  )}
                  {review && !session && (
                    <Button
                      variant="quiet"
                      onClick={() => {
                        if (window.confirm('למחוק את טיוטת העריכה מהמכשיר?')) {
                          setWork(null);
                          setWorkingReview(false);
                        }
                      }}
                    >
                      מחיקת טיוטת העריכה
                    </Button>
                  )}
                  {!review && !session && (
                    <Button variant="outline" onClick={newDrawing}>
                      שרטוט שביל במפה
                    </Button>
                  )}
                  {session && (
                    <Button variant="quiet" onClick={() => setTool('places')}>
                      הוספת מקום או תמונה
                    </Button>
                  )}
                  {drawn.map((d) => (
                    <Button key={d.trail.id} variant="quiet" onClick={() => openTrail(d.trail.id)}>
                      {d.trail.name} · {d.trail.status === 'confirmed' ? 'עריכה וחיבורים' : 'טיוטה'}
                    </Button>
                  ))}
                </div>
                {!native && (
                  <p>
                    {demoOnly()
                      ? 'בהדגמה אפשר להקליט מדידות מהמכשיר כשהמפה פתוחה.'
                      : 'להקלטה בזמן נעילת המסך, פתחו את המפה באפליקציית Android של החווה.'}
                  </p>
                )}
                {native && !gps.status.notifications && (
                  <Button variant="quiet" onClick={() => act(() => gps.settings('notifications'))}>
                    הגדרות התראות להקלטה
                  </Button>
                )}
              </section>
            )}
            {queue.length > 0 && (
              <section className="survey-panel">
                <h2>
                  {queue.length === 1 ? 'שמירה אחת ממתינה לסנכרון' : queue.length + ' שמירות ממתינות לסנכרון'}
                </h2>
                <p>{syncError || 'הנתונים שמורים במכשיר ויישלחו כשיהיה חיבור.'}</p>
                <Button variant="outline" onClick={retrySync}>
                  ניסיון סנכרון נוסף
                </Button>
                {syncError.includes('השתנה') && (
                  <Button
                    variant="quiet"
                    onClick={() =>
                      act(async () => {
                        await recoverJob(scope, queue[0].key);
                        setPlace((await readDraft<PlaceDraft>(placeKey)) ?? null);
                        retrySync();
                      })
                    }
                  >
                    שמירה כעותק נפרד
                  </Button>
                )}
              </section>
            )}
            {!queue.length && note.includes('נשמר') && (
              <p className="survey-note">{demoOnly() ? 'נשמר במצב ההדגמה' : 'הסנכרון הושלם'}</p>
            )}
          </>
        )}
      </MapWorkspace>
    </>
  );
}
