import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useList, newId } from '../../../db';
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
import { removePlace } from '../../data/tasks';
import { MapWorkspace } from './MapWorkspace';
import { PlaceGlyph, type MapCamera } from './SurveyMap';
import {
  useFarmHomeView,
  saveFarmHomeView,
  saveFarmMapSetup,
  placeSymbols,
  type FarmMapSetup,
} from '../../../survey/mapSettings';
import type { ReactNode } from 'react';
import { Button, Field, Icon, type IconName } from '../../kit';
import './map-editor.css';

import type { ScreenProps } from '../../ctx';
import { SurveyMap, type View } from './SurveyMap';
import { TrailReview } from './TrailReview';
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

type EditPage =
  | 'tools'
  | 'places'
  | 'trails'
  | 'add'
  | 'form'
  | 'position'
  | 'review'
  | 'sketch'
  | 'prepare'
  | 'home'
  | 'location'
  | 'setup'
  | 'sync'
  | 'drafts'
  | 'saved'
  | 'remove'
  | 'discardPlace'
  | 'discardTrail';
type SetupDraft = Partial<FarmMapSetup> & { step: number };
const setupSteps = [
  'לפני שיוצאים לשטח',
  'גישה למיקום',
  'בדיקת המדידה',
  'אזור החווה והכניסה',
  'המקום הראשון',
  'השביל הראשון',
  'סקירה ושמירה',
];
function readSetup(scope: string): SetupDraft {
  try {
    return JSON.parse(localStorage.getItem(scope + ':farm-map-setup') || 'null') || { step: 0 };
  } catch {
    return { step: 0 };
  }
}
function ToolRow({
  icon,
  title,
  detail,
  onClick,
  disabled,
}: {
  icon: IconName;
  title: string;
  detail?: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button type="button" className="fme-tool" disabled={disabled} onClick={onClick}>
      <span className="fme-icon">
        <Icon name={icon} size={19} />
      </span>
      <span>
        <strong>{title}</strong>
        {detail && <small>{detail}</small>}
      </span>
      <Icon name="chevron" size={15} />
    </button>
  );
}
const manualPoint = (p: Point): PlacePoint => ({
  lat: p.lat,
  lng: p.lng,
  at: Date.now(),
  accuracy: null,
  source: 'manual',
});
const coordText = (p: Point) => (
  <bdi>
    {p.lat.toFixed(5)}, {p.lng.toFixed(5)}
  </bdi>
);
export function OwnerFarmMap({ ctx }: { ctx: ScreenProps['ctx'] }) {
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
    [note, setNote] = useState(''),
    [page, setPage] = useState<EditPage | null>(null);
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<'places' | 'trails' | 'settings'>('places');
  const [selection, setSelection] = useState<'new' | 'place' | 'vertex' | 'entrance'>('new');
  const [candidate, setCandidate] = useState<PlacePoint | null>(null);
  const [anchor, setAnchor] = useState(0);
  const [view, setView] = useState<View | null>(null),
    [undo, setUndo] = useState<Review | null>(null);
  const [following, setFollowing] = useState(false);
  const camera = useRef<MapCamera | null>(null),
    beforeFrame = useRef<MapCamera | null>(null);
  const photo = useRef<HTMLInputElement>(null);
  const shared = useFarmHomeView();
  const [wizard, setWizard] = useState<SetupDraft>(() => readSetup(scope));
  const [setupReturn, setSetupReturn] = useState(false);
  const [movingSketch, setMovingSketch] = useState<number | null>(null);
  const sketchStart = useRef<Review | null>(null);
  const [removing, setRemoving] = useState<Place | null>(null);
  const [filter, setFilter] = useState('');
  const updateWizard = (patch: Partial<SetupDraft>) => {
    const next = { ...wizard, ...patch };
    setWizard(next);
    try {
      localStorage.setItem(scope + ':farm-map-setup', JSON.stringify(next));
    } catch {
      setError('אין מקום במכשיר לשמירת שלבי ההגדרה');
    }
  };
  const placeKey = scope + ':place',
    reviewKey = scope + ':review';
  const updateLayer = useCallback(
    (key: string, layer: Layer) => setLayers((v) => ({ ...v, [key]: layer })),
    [],
  );
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
    [trails, queue, layers],
  );
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
  const focus = (point?: Point, points?: Point[]) =>
    setView((v) => ({ id: (v?.id || 0) + 1, point, points }));
  function beginPlace(point: PlacePoint, p?: Place) {
    setWorkingReview(false);
    setDraft({
      id: p?.id || newId('places'),
      editing: !!p,
      original: p,
      markerStyle: p?.markerStyle || 'icon',
      icon: p?.icon || 'pin',
      point,
      name: p?.name || '',
      photo: p?.photo || '',
      selected: true,
    });
    setPage('form');
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
      trail: {
        ...review.trail,
        geometry: crypto.randomUUID(),
        status: 'draft',
        modes: [],
        unsuitableModes: [],
        connections: [],
      },
    });
    setAnchor(points.find((p) => p.seq === anchor)?.seq ?? points[0]?.seq ?? 0);
    setNote('הגאומטריה עודכנה. יש לאשר מחדש את אפשרויות המעבר והחיבורים.');
  }
  async function savePlace() {
    if (!place || !place.name.trim() || !coordinate(place.point)) return;
    await enqueue(
      scope,
      { place: { draft: place, actor: ctx.actor, at: new Date().toISOString() } },
      placeKey,
    );
    setQueue(await jobs(scope));
    setPlace(null);
    if (setupReturn) {
      updateWizard({ placeId: place.id, step: 5 });
      setPage('setup');
      setSetupReturn(false);
    } else setPage('saved');
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
    setWorkingReview(true);
    setAnchor(d.points[0]?.seq || 0);
    focus(undefined, d.points);
    setPage('review');
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
    setAnchor(points[0]?.seq || 0);
    focus(undefined, points);
    setPage('review');
  }
  async function saveReview(confirm: boolean) {
    if (!review) return;
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
    if (setupReturn) {
      updateWizard({ trailId: trail.id, step: 6 });
      setPage('setup');
      setSetupReturn(false);
    } else setPage('saved');
    setNote('השביל נשמר במכשיר');
    retrySync();
    if (session?.id === trail.id && session.state === 'review') await gps.control('saved', session);
  }
  // If the process stopped after enqueuing the review but before acknowledging the recorder, release that same session only.
  const acknowledged =
    !!session &&
    (trails.some((t) => t.id === session.id) || queue.some((j) => j.review?.trail.id === session.id));
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
  function open(page: EditPage) {
    setError('');
    setNote('');
    setFilter('');
    setPage(page);
  }
  function editPlace(p: Place) {
    if (place && place.id !== p.id) {
      setError('יש טיוטת מקום פתוחה. אפשר לחזור אליה דרך הטיוטות שלי.');
      return;
    }
    if (place) open('form');
    else
      beginPlace(
        { lat: p.lat, lng: p.lng, source: p.source || 'legacy', accuracy: p.accuracy, at: p.measuredAt || 0 },
        p,
      );
    focus(p);
  }
  function position(type: typeof selection, point: PlacePoint | null = null) {
    setSelection(type);
    setCandidate(point);
    setFollowing(false);
    open('position');
    if (point) focus(point);
  }
  function confirmPosition() {
    if (!candidate) return;
    if (selection === 'entrance') {
      updateWizard({ entrance: { lat: candidate.lat, lng: candidate.lng } });
      open('setup');
    } else if (selection === 'vertex' && review) {
      changeGeometry(
        review.points.map((v) => (v.seq === anchor ? { ...v, lat: candidate.lat, lng: candidate.lng } : v)),
      );
      open('review');
    } else if (selection === 'place' && place) {
      setDraft({ ...place, point: candidate });
      open('form');
    } else beginPlace(candidate);
    setCandidate(null);
  }
  function startSketch() {
    if (session && !review) {
      open('prepare');
      return;
    }
    const id = review?.trail.id || newId('farmTrails');
    const next: Review = review || {
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
      points: [],
      base: '',
      dirtyGeometry: true,
    };
    sketchStart.current = next;
    setWork(next);
    setWorkingReview(true);
    setUndo(null);
    setMovingSketch(null);
    setFollowing(false);
    open('sketch');
  }
  function sketchPoint(p: Point) {
    if (!review || !coordinate(p)) return;
    const points = review.points;
    const last = points.at(-1);
    if (movingSketch !== null)
      changeGeometry(points.map((v) => (v.seq === movingSketch ? { ...v, lat: p.lat, lng: p.lng } : v)));
    else
      changeGeometry([
        ...points,
        { lat: p.lat, lng: p.lng, seq: (last?.seq || 0) + 1, segment: last?.segment || 1 },
      ]);
    setMovingSketch(null);
    setNote('');
  }
  function closePanel() {
    if (page === 'position') {
      open(
        selection === 'entrance'
          ? 'setup'
          : selection === 'vertex'
            ? 'review'
            : selection === 'place'
              ? 'form'
              : 'add',
      );
      return;
    }
    if (page === 'home' && beforeFrame.current)
      setView((v) => ({ id: (v?.id || 0) + 1, camera: beforeFrame.current! }));
    if (page === 'sketch') {
      open('review');
      return;
    }
    setPage(null);
    setError('');
    setNote('');
    setSetupReturn(false);
  }
  const locate = () => {
    if (current) {
      setFollowing(true);
      focus(current);
    } else open('location');
  };
  const fixDetails = gps.fix
    ? (gps.fix.accuracy != null ? 'דיוק משוער ' + Math.round(gps.fix.accuracy) + ' מ׳ · ' : '') +
      age(gps.fix.at, gps.clock)
    : 'אפשר לסמן נקודה במפה גם ידנית.';
  const locationButton = (
    <Button disabled={busy || (!gps.statusReady && !gps.issue)} onClick={locationAction}>
      {native && needsSettings
        ? 'פתיחת הגדרות המיקום'
        : perm === 'prompt'
          ? 'לאפשר גישה למיקום'
          : 'בדיקת מיקום מחדש'}
    </Button>
  );
  const locationInfo = (
    <>
      <strong>{statusText}</strong>
      <small>{fixDetails}</small>
      {gps.issue && !['timeout', 'unavailable'].includes(gps.issue) && <p role="alert">{gps.issue}</p>}
      {needsSettings && (
        <p>
          {!gps.status.enabled
            ? 'הפעילו את שירותי המיקום במכשיר.'
            : native
              ? 'בחרו בהרשאות האפליקציה גישה למיקום מדויק בזמן השימוש.'
              : 'בחרו בהגדרות האתר הרשאה לגישה למיקום.'}
        </p>
      )}
    </>
  );
  const recordState =
    session &&
    {
      recording: 'מקליט שביל',
      paused: 'ההקלטה מושהית',
      interrupted: 'ההקלטה נקטעה',
      review: 'ההקלטה מוכנה לסקירה',
    }[session.state];
  const recordActions = session && (
    <div className="fme-pair">
      {session.state === 'recording' && (
        <Button variant="outline" disabled={busy} onClick={() => act(() => gps.control('pause', session))}>
          השהיה
        </Button>
      )}
      {(session.state === 'paused' || session.state === 'interrupted') && (
        <Button
          disabled={busy || perm !== 'precise' || !gps.status.enabled}
          onClick={() => act(() => gps.control('resume', session))}
        >
          המשך הקלטה
        </Button>
      )}
      {session.state === 'review' ? (
        <Button disabled={busy || gps.raw.length !== session.count} onClick={recordingReview}>
          סקירה ושמירה
        </Button>
      ) : (
        <Button variant="outline" disabled={busy} onClick={() => act(() => gps.control('finish', session))}>
          סיום ההקלטה
        </Button>
      )}
    </div>
  );
  const locationPanel = (
    <>
      {locationInfo}
      {locationButton}
      {current && (
        <Button
          variant="outline"
          onClick={() => {
            locate();
            setPage(null);
          }}
        >
          הצגת המיקום במפה
        </Button>
      )}
      {native && !gps.status.notifications && (
        <Button variant="quiet" onClick={() => act(() => gps.settings('notifications'))}>
          הגדרות התראות להקלטה
        </Button>
      )}
    </>
  );
  const draftCount = Number(!!place) + Number(!!review);
  const action = (title: string, detail: string, icon: IconName, fn: () => void, disabled = false) => (
    <ToolRow key={title} {...{ title, detail, icon, disabled }} onClick={fn} />
  );
  const titles: Record<EditPage, string> = {
    tools: 'כלי עריכת המפה',
    places: 'בחירת מקום לעריכה',
    trails: 'בחירת שביל לעריכה',
    add: 'הוספת מקום',
    form: place?.editing ? 'עריכת מקום' : 'שמירת מקום',
    position: selection === 'entrance' ? 'מיקום הכניסה' : 'אישור נקודה במפה',
    review: 'סקירת השביל',
    sketch: 'עריכת תוואי השביל',
    prepare: 'הקלטת שביל',
    home: 'הגדרת מבט החווה',
    location: 'המיקום שלי',
    setup: 'מיפוי ראשון של החווה',
    sync: 'שמירה וסנכרון',
    drafts: 'הטיוטות שלי',
    saved: 'השמירה הושלמה',
    remove: 'העברת מקום לארכיון',
    discardPlace: 'מחיקת טיוטת מקום',
    discardTrail: 'מחיקת טיוטת שביל',
  };
  const wizardSelect = (
    label: string,
    items: { id: string; name: string }[],
    value: string | undefined,
    onChange: (id: string) => void,
  ) => (
    <label className="fme-label">
      {label}
      <select value={value || ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">בחירה מהרשימה</option>
        {items.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
  const actualEntrance = places.find((p) => p.lat === wizard.entrance?.lat && p.lng === wizard.entrance?.lng);
  function wizardContent() {
    switch (wizard.step) {
      case 0:
        return (
          <>
            <p>נסמן את הכניסה לחווה ונבחר את המקום והשביל הראשונים. אפשר לעצור בכל שלב ולהמשיך אחר כך.</p>
            <Button onClick={() => updateWizard({ step: 1 })}>מתחילים</Button>
          </>
        );
      case 1:
        return (
          <>
            <p>בעזרת המיקום תוכלו לסמן מקום שבו אתם עומדים ולמדוד שביל.</p>
            <Button
              onClick={() =>
                act(async () => {
                  await gps.ask();
                  updateWizard({ step: 2 });
                })
              }
            >
              לאפשר גישה למיקום
            </Button>
            <Button variant="quiet" onClick={() => updateWizard({ step: 2 })}>
              המשך בסימון ידני
            </Button>
          </>
        );
      case 2:
        return (
          <>
            {locationInfo}
            <Button onClick={() => updateWizard({ step: 3 })}>
              {current ? 'אישור המיקום' : 'המשך לבחירה במפה'}
            </Button>
          </>
        );
      case 3:
        return (
          <>
            {wizardSelect('כניסה קיימת', places, actualEntrance?.id, (id) => {
              const p = places.find((p) => p.id === id);
              updateWizard({ entrance: p ? { lat: p.lat, lng: p.lng } : undefined });
            })}
            <Button
              variant="outline"
              onClick={() => position('entrance', wizard.entrance ? manualPoint(wizard.entrance) : null)}
            >
              סימון כניסה על המפה
            </Button>
            {wizard.entrance && coordText(wizard.entrance)}
            <Button disabled={!wizard.entrance} onClick={() => updateWizard({ step: 4 })}>
              אישור האזור והכניסה
            </Button>
          </>
        );
      case 4:
        return (
          <>
            {wizardSelect('מקום ראשון', places, wizard.placeId, (id) => updateWizard({ placeId: id }))}
            <Button
              disabled={!places.some((p) => p.id === wizard.placeId)}
              onClick={() => updateWizard({ step: 5 })}
            >
              שימוש במקום הנבחר
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setSetupReturn(true);
                open(place ? 'form' : 'add');
              }}
            >
              הוספת מקום חדש
            </Button>
          </>
        );
      case 5:
        return (
          <>
            {wizardSelect('שביל קיים', trails, wizard.trailId, (id) => updateWizard({ trailId: id }))}
            <Button
              disabled={!trails.some((t) => t.id === wizard.trailId)}
              onClick={() => updateWizard({ step: 6 })}
            >
              שימוש בשביל הנבחר
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setSetupReturn(true);
                open(review ? 'review' : 'prepare');
              }}
            >
              הקלטת השביל הראשון
            </Button>
            <Button
              variant="quiet"
              onClick={() => {
                setSetupReturn(true);
                startSketch();
              }}
            >
              שרטוט שביל במפה
            </Button>
          </>
        );
      default:
        return (
          <>
            <dl className="fme-summary">
              <dt>כניסה</dt>
              <dd>{actualEntrance?.name || (wizard.entrance && coordText(wizard.entrance))}</dd>
              <dt>מקום ראשון</dt>
              <dd>{places.find((p) => p.id === wizard.placeId)?.name}</dd>
              <dt>שביל ראשון</dt>
              <dd>{trails.find((p) => p.id === wizard.trailId)?.name}</dd>
            </dl>
            <Button
              disabled={
                busy ||
                !online ||
                !wizard.entrance ||
                !places.some((p) => p.id === wizard.placeId) ||
                !trails.some((t) => t.id === wizard.trailId) ||
                queue.length > 0
              }
              onClick={() =>
                act(async () => {
                  await saveFarmMapSetup({
                    entrance: wizard.entrance!,
                    placeId: wizard.placeId!,
                    trailId: wizard.trailId!,
                  });
                  updateWizard({ step: 0 });
                  open('saved');
                  setNote('הגדרת החווה נשמרה');
                })
              }
            >
              שמירת הגדרת החווה
            </Button>
            {(!online || !!queue.length) && (
              <small>אפשר להשלים את ההגדרה לאחר סנכרון המקומות והשבילים.</small>
            )}
          </>
        );
    }
  }
  function content(): ReactNode {
    switch (page) {
      case 'tools':
        return (
          <>
            <div className="fme-tabs" aria-label="כלי עריכת המפה">
              {(
                [
                  ['places', 'מקומות'],
                  ['trails', 'שבילים'],
                  ['settings', 'הגדרה'],
                ] as const
              ).map(([key, label]) => (
                <button key={key} aria-pressed={tab === key} onClick={() => setTab(key)}>
                  {label}
                </button>
              ))}
            </div>
            <div className="fme-rows">
              {tab === 'places' && (
                <>
                  {action(
                    'הוספת מקום',
                    'סימון במפה או מדידה בשטח',
                    'plus',
                    () => open(place ? 'form' : 'add'),
                    !ready,
                  )}
                  {action('עריכת מקום', 'שם, תמונה או מיקום', 'pin', () => open('places'))}
                </>
              )}
              {tab === 'trails' && (
                <>
                  {action(
                    'הקלטת שביל',
                    'מדידת המסלול תוך כדי הליכה',
                    'nav',
                    () => open(review ? 'review' : 'prepare'),
                    !ready,
                  )}
                  {action('שרטוט שביל', 'הוספת נקודות ישירות במפה', 'plus', startSketch, !ready)}
                  {action('עריכת שביל וחיבור קצוות', 'תוואי, התאמה למעבר וחיבורים', 'link', () =>
                    open('trails'),
                  )}
                </>
              )}
              {tab === 'settings' && (
                <>
                  {action('הגדרת מבט החווה', 'מרכז המפה ורמת הזום בכניסה', 'farm', () => {
                    beforeFrame.current = camera.current;
                    setFollowing(false);
                    open('home');
                  })}
                  {action(
                    'מיפוי ראשון של החווה',
                    shared.setup ? 'עריכת הגדרת החווה' : 'כניסה, מקום ושביל ראשונים',
                    'pin',
                    () => {
                      if (!wizard.step && shared.setup) updateWizard({ ...shared.setup, step: 0 });
                      open('setup');
                    },
                  )}
                  {action('הרשאות ומיקום', statusText, 'nav', () => open('location'))}
                  {action(
                    'שמירה וסנכרון',
                    queue.length ? queue.length + ' שמירות בתור' : 'הנתונים במכשיר',
                    'server',
                    () => open('sync'),
                  )}
                </>
              )}
            </div>
            <div className="fme-section-label">עבודה אחרונה</div>
            {action(
              'הטיוטות שלי',
              draftCount ? draftCount + ' טיוטות פתוחות' : 'אין טיוטות פתוחות',
              'clock',
              () => open('drafts'),
            )}
          </>
        );
      case 'places':
      case 'trails': {
        const items = page === 'places' ? places : trails;
        const matches = items.filter((i) => i.name.includes(filter.trim()));
        return (
          <>
            <Field label="חיפוש" type="search" value={filter} onChange={(e) => setFilter(e.target.value)} />
            <div className="fme-rows">
              {matches.map((item) =>
                action(
                  item.name,
                  'lat' in item ? 'עריכת פרטי מקום' : item.status === 'draft' ? 'טיוטת שביל' : 'שביל מאושר',
                  'lat' in item ? 'pin' : 'nav',
                  () => ('lat' in item ? editPlace(item) : openTrail(item.id)),
                ),
              )}
            </div>
            {!matches.length && <p>אין {page === 'places' ? 'מקומות' : 'שבילים'} להצגה</p>}
          </>
        );
      }
      case 'add':
        return (
          <>
            <p>איפה נמצא המקום?</p>
            <Button
              disabled={busy}
              onClick={() => {
                if (current) position('new', { ...current, source: 'gps' });
                else void locationAction();
              }}
            >
              שימוש במיקום שלי
            </Button>
            {!current && <small>{statusText}</small>}
            <Button variant="outline" icon="pin" onClick={() => position('new')}>
              בחירת נקודה במפה
            </Button>
            <small>לאחר אישור המיקום אפשר להוסיף שם ותמונה.</small>
          </>
        );
      case 'position':
        return (
          <>
            <small>נגיעה במפה תזיז את הנקודה. אפשר גם להזיז את המפה ולבחור את מרכזה.</small>
            {candidate && coordText(candidate)}
            <div className="fme-pair">
              <Button
                variant="outline"
                onClick={() => {
                  if (camera.current) setCandidate(manualPoint(camera.current));
                }}
              >
                בחירת מרכז המפה
              </Button>
              <Button disabled={!candidate} onClick={confirmPosition}>
                אישור הנקודה
              </Button>
            </div>
            <Button variant="quiet" onClick={closePanel}>
              ביטול הבחירה
            </Button>
          </>
        );
      case 'form':
        return (
          place && (
            <>
              <Field
                label="שם המקום"
                maxLength={120}
                value={place.name}
                onChange={(e) => setDraft({ ...place, name: e.target.value })}
                placeholder="למשל, שער הכניסה"
              />
              <div className="fme-coordinate">
                <span>
                  {place.point.source === 'gps' ? 'מדידה מהמכשיר' : 'נקודה במפה'}
                  <small>{coordText(place.point)}</small>
                </span>
                <Button variant="quiet" onClick={() => position('place', place.point)}>
                  הזזה במפה
                </Button>
              </div>
              <label className="fme-label">סימון במפה</label>
              <div className="fme-tabs">
                {(
                  [
                    ['icon', 'סמל'],
                    ['thumbnail', 'תמונה'],
                  ] as const
                ).map(([key, name]) => (
                  <button
                    key={key}
                    aria-pressed={(place.markerStyle || 'icon') === key}
                    onClick={() => setDraft({ ...place, markerStyle: key })}
                  >
                    {name}
                  </button>
                ))}
              </div>
              {place.markerStyle !== 'thumbnail' && (
                <div className="fme-symbols">
                  {placeSymbols.map(([icon, label]) => (
                    <button
                      key={icon}
                      title={label}
                      aria-label={label}
                      aria-pressed={(place.icon || 'pin') === icon}
                      onClick={() => setDraft({ ...place, icon })}
                    >
                      <PlaceGlyph icon={icon} />
                    </button>
                  ))}
                </div>
              )}
              {place.photo && <img className="fme-photo" src={place.photo} alt="תמונת המקום" />}
              <input
                type="file"
                ref={photo}
                hidden
                accept="image/*"
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
              <Button variant="outline" icon="camera" disabled={busy} onClick={() => photo.current?.click()}>
                {place.photo
                  ? 'החלפת תמונה'
                  : place.markerStyle === 'thumbnail'
                    ? 'בחירת תמונה לסימון'
                    : 'הוספת תמונה'}
              </Button>
              <Button
                disabled={busy || !place.name.trim() || (place.markerStyle === 'thumbnail' && !place.photo)}
                onClick={() => act(savePlace)}
              >
                שמירת המקום
              </Button>
              <div className="fme-pair">
                <Button variant="quiet" onClick={() => open('discardPlace')}>
                  ביטול הטיוטה
                </Button>
                {place.editing && place.original && (
                  <Button
                    variant="quiet"
                    onClick={() => {
                      setRemoving(place.original!);
                      open('remove');
                    }}
                  >
                    העברה לארכיון
                  </Button>
                )}
              </div>
            </>
          )
        );
      case 'remove':
        return (
          removing && (
            <>
              <p>להעביר את ״{removing.name}״ לארכיון? המקום יוסר מהמפה.</p>
              <Button
                disabled={busy}
                onClick={() =>
                  act(async () => {
                    if (
                      cloud.loading ||
                      cloud.error ||
                      queue.some((j) => j.place?.draft.id === removing.id) ||
                      trails.some((t) =>
                        t.connections.some((c) => c.target === 'place' && c.targetId === removing.id),
                      )
                    )
                      throw new Error('לפני העברה לארכיון יש להשלים את הסנכרון ולהסיר חיבורי שבילים למקום.');
                    await removePlace(ctx.actor, { ...removing, accuracy: removing.accuracy ?? undefined });
                    setDraft(null);
                    setRemoving(null);
                    open('places');
                  })
                }
              >
                העברה לארכיון
              </Button>
              <Button variant="quiet" onClick={() => open('form')}>
                חזרה למקום
              </Button>
            </>
          )
        );
      case 'discardPlace':
      case 'discardTrail':
        return (
          <>
            <p>למחוק את הטיוטה מהמכשיר?</p>
            <Button
              onClick={() => {
                if (page === 'discardPlace') setDraft(null);
                else {
                  setWork(null);
                  setWorkingReview(false);
                }
                open('tools');
              }}
            >
              מחיקת הטיוטה
            </Button>
            <Button variant="quiet" onClick={() => open(page === 'discardPlace' ? 'form' : 'review')}>
              חזרה לעריכה
            </Button>
          </>
        );
      case 'location':
        return locationPanel;
      case 'prepare':
        return (
          <>
            {session ? (
              <>
                <strong>{recordState}</strong>
                <small>{session.count} מדידות שמורות במכשיר</small>
                {recordActions}
              </>
            ) : (
              <>
                {locationInfo}
                {(!current || perm === 'approximate') && locationButton}
                {native ? (
                  <Button
                    disabled={busy || !ready || !gps.grant || perm !== 'precise' || !current || q !== 'fresh'}
                    onClick={() =>
                      act(async () => {
                        await gps.control('start');
                        setPage(null);
                      })
                    }
                  >
                    התחלת הקלטת שביל
                  </Button>
                ) : (
                  <p>
                    להקלטת הליכה באמצעות GPS פתחו את אפליקציית Android של החווה. כאן אפשר לשרטט שביל על המפה.
                  </p>
                )}
                <Button variant="outline" onClick={startSketch}>
                  שרטוט שביל במפה
                </Button>
              </>
            )}
          </>
        );
      case 'sketch':
        return (
          review && (
            <>
              <small>
                {movingSketch !== null
                  ? 'בחרו מיקום חדש לנקודה.'
                  : 'לחצו על המפה להוספת נקודה או על נקודה קיימת להזזתה.'}
              </small>
              <div className="fme-coordinate">
                <b>{review.points.length} נקודות</b>
                <Button
                  variant="quiet"
                  onClick={() => {
                    if (camera.current) sketchPoint(camera.current);
                  }}
                >
                  {movingSketch !== null ? 'הזזה למרכז' : 'הוספה במרכז'}
                </Button>
              </div>
              <div className="fme-pair">
                <Button
                  variant="outline"
                  disabled={!undo}
                  onClick={() => {
                    if (undo) setWork(undo);
                    setUndo(null);
                  }}
                >
                  ביטול צעד
                </Button>
                <Button disabled={review.points.length < 2} onClick={() => open('review')}>
                  סקירת השביל
                </Button>
              </div>
              <Button
                variant="quiet"
                onClick={() => {
                  if (sketchStart.current) setWork(sketchStart.current);
                  setUndo(null);
                  open('review');
                }}
              >
                ביטול השינויים בתוואי
              </Button>
            </>
          )
        );
      case 'review':
        return (
          review && (
            <>
              <TrailReview
                review={review}
                places={places}
                trails={drawn}
                anchor={anchor}
                onAnchor={chooseVertex}
                change={setWork}
                locate={(p) => focus(p)}
                edit={changeGeometry}
                move={() => {
                  const p = review.points.find((v) => v.seq === anchor);
                  if (p) position('vertex', manualPoint(p));
                }}
                undo={() => {
                  if (undo) setWork(undo);
                  setUndo(null);
                }}
                canUndo={!!undo}
                save={(c) => act(() => saveReview(c))}
                close={closePanel}
                busy={busy}
              />
              <Button variant="outline" onClick={startSketch}>
                עריכת התוואי במפה
              </Button>
              <Button variant="quiet" onClick={() => open('discardTrail')}>
                מחיקת טיוטת השביל
              </Button>
            </>
          )
        );
      case 'setup':
        return (
          <>
            <div className="fme-coordinate">
              <strong>{setupSteps[wizard.step]}</strong>
              <small>שלב {wizard.step + 1} מתוך 7</small>
            </div>
            <div className="fme-steps">
              {setupSteps.map((s, i) => (
                <i key={s} data-active={i <= wizard.step} />
              ))}
            </div>
            {wizardContent()}
            <div className="fme-pair">
              {wizard.step > 0 && (
                <Button variant="quiet" onClick={() => updateWizard({ step: wizard.step - 1 })}>
                  חזרה
                </Button>
              )}
              <Button variant="quiet" onClick={closePanel}>
                שמירה והמשך מאוחר יותר
              </Button>
            </div>
          </>
        );
      case 'sync':
        return (
          <>
            {queue.length ? (
              <>
                <strong>{queue.length} שמירות ממתינות לסנכרון</strong>
                {queue.map((j) => (
                  <div className="fme-coordinate" key={j.key}>
                    <b>{j.place?.draft.name || j.review?.trail.name}</b>
                    <small>שמור במכשיר</small>
                  </div>
                ))}
                <p>{syncError || 'הנתונים יישלחו כשיהיה חיבור.'}</p>
                <Button onClick={retrySync}>ניסיון סנכרון נוסף</Button>
                {syncError.includes('השתנה') && (
                  <Button
                    variant="outline"
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
              </>
            ) : (
              <p>{syncError || 'תור הסנכרון ריק.'}</p>
            )}
          </>
        );
      case 'drafts':
        return (
          <>
            {place && action(place.name || 'מקום חדש', 'טיוטת מקום', 'pin', () => open('form'))}
            {review &&
              action(review.trail.name || 'שביל חדש', review.points.length + ' נקודות', 'nav', () => {
                setWorkingReview(true);
                open('review');
              })}
            {!draftCount && <p>אין כרגע טיוטות פתוחות.</p>}
          </>
        );
      case 'saved':
        return (
          <>
            <strong>{note}</strong>
            <small>
              {queue.length
                ? 'עותק נשמר במכשיר וממתין לסנכרון.'
                : demoOnly()
                  ? 'נשמר במצב הדגמה.'
                  : 'תור הסנכרון ריק.'}
            </small>
            <Button variant="outline" onClick={() => open('sync')}>
              מצב הסנכרון
            </Button>
            <Button onClick={closePanel}>חזרה למפה</Button>
          </>
        );
      default:
        return null;
    }
  }
  const panel =
    page && page !== 'home' ? (
      <section className="fme-panel">
        <div className="fme-heading">
          <div>
            {editing && <small>מצב עריכה</small>}
            <h2>{titles[page]}</h2>
          </div>
          <button aria-label="סגירה" onClick={closePanel}>
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="fme-content">{content()}</div>
      </section>
    ) : undefined;
  const warning =
    error ||
    ctx.placesError ||
    cloud.error ||
    shared.error ||
    (Object.values(layers).some((l) => l.error) && 'חלק מנקודות השבילים עדיין לא נטענו.');
  return (
    <>
      {cloud.items.map((t) => (
        <Geometry key={t.id + '@' + t.geometry} trail={t} update={updateLayer} />
      ))}
      <MapWorkspace
        isDemo={demoOnly()}
        places={places}
        trails={drawn}
        online={online}
        editing={editing}
        onToggleEdit={() => {
          if (!editing) open('tools');
          else closePanel();
          setEditing(!editing);
          if (editing) setPage(null);
        }}
        onOpenTools={() => open('tools')}
        onLocationDetails={() => open('location')}
        panel={panel}
        onClosePanel={closePanel}
        onEditPlace={editPlace}
        onEditTrail={(t) => openTrail(t.id)}
        locationLabel={statusText}
        locationDetail={fixDetails}
        onLocate={locate}
        onHome={() => {
          setFollowing(false);
          setView((v) => ({ id: (v?.id || 0) + 1, home: true }));
        }}
        onFocus={(points) => {
          setFollowing(false);
          focus(undefined, points);
        }}
        notice={
          warning ? (
            <span role="alert">{warning}</span>
          ) : page !== 'saved' && note ? (
            <span role="status">{note}</span>
          ) : undefined
        }
        toolbar={
          page === 'home' ? (
            <div className="fme-framing">
              <strong>הגדרת מבט החווה</strong>
              <Button variant="quiet" onClick={closePanel}>
                ביטול
              </Button>
              <Button
                disabled={busy || !online}
                onClick={() =>
                  act(async () => {
                    if (!camera.current) throw new Error('המפה עדיין נטענת');
                    await saveFarmHomeView(camera.current);
                    open('tools');
                    setNote('מבט החווה נשמר לצוות');
                  })
                }
              >
                שמירת המבט
              </Button>
            </div>
          ) : undefined
        }
        hint={page === 'home' ? 'הזיזו את המפה ובחרו את רמת הזום שתוצג לצוות.' : undefined}
        dock={
          session && page !== 'prepare' && page !== 'review' && page !== 'sketch' ? (
            <div className="fme-record">
              <button onClick={() => open('prepare')}>
                <i />
                {recordState} · {session.count} מדידות
              </button>
              {recordActions}
            </div>
          ) : undefined
        }
        renderMap={(ui) => (
          <SurveyMap
            places={places}
            trails={drawn}
            live={current}
            clock={gps.clock}
            raw={gps.raw}
            online={online}
            view={view}
            selected={ui.selected}
            selectedTrail={ui.selectedTrail}
            homeView={shared.homeView}
            onCameraChange={(v) => {
              camera.current = v;
            }}
            panelRef={ui.panelRef}
            layers={ui.layers}
            following={following}
            onStopFollowing={() => setFollowing(false)}
            sketch={page === 'sketch' && movingSketch === null}
            demoBase={ui.demoBase}
            draftPlace={place || undefined}
            draft={page === 'position' ? candidate || undefined : page === 'form' ? place?.point : undefined}
            edit={
              workingReview && ['sketch', 'review', 'position'].includes(page || '')
                ? review?.points
                : undefined
            }
            anchor={anchor}
            selecting={page === 'position' || page === 'sketch'}
            onPick={(p) => {
              if (page === 'sketch') sketchPoint(p);
              else if (page === 'position') setCandidate(manualPoint(p));
            }}
            onVertex={(seq) => {
              if (page === 'sketch') {
                setMovingSketch(seq);
                setAnchor(seq);
              } else chooseVertex(seq);
            }}
            onPlace={(id) => {
              if (page === 'home') return;
              setPage(null);
              ui.onPlace(id);
            }}
            onTrail={(id) => {
              if (page === 'home') return;
              setPage(null);
              ui.onTrail(id);
            }}
          />
        )}
      />
    </>
  );
}
