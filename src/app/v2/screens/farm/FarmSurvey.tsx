import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useList, newId } from '../../../db';
import { useOnline, compressPhoto } from '../../../store';
import { demoOnly, setDemo } from '../../../demo/store';
import type { Place } from '../../../types';
import { useSurveyLocation } from '../../../survey/useLocation';
import {
  age,
  coordinate,
  geometryOf,
  quality,
  connectionCurrent,
  MODES,
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
import { AppScreen, go, mapsUrl, useExternal } from '../../core';
import { Button, Field, Icon, TopBar } from '../../kit';
import type { ScreenProps } from '../../ctx';
import { SurveyMap, type View } from './SurveyMap';
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
  return <Survey key={scopeOf(ctx.user.uid)} ctx={ctx} />;
}
function Survey({ ctx }: { ctx: ScreenProps['ctx'] }) {
  const scope = scopeOf(ctx.user.uid),
    online = useOnline(),
    ext = useExternal();
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
    [guide, setGuide] = useState(false);
  const [selection, setSelection] = useState<'new' | 'place' | 'vertex' | null>(null),
    [anchor, setAnchor] = useState(0);
  const [selected, setSelected] = useState(''),
    [search, setSearch] = useState(''),
    [list, setList] = useState(false);
  const [view, setView] = useState<View | null>(null),
    [undo, setUndo] = useState<Review | null>(null);
  const mapTop = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selection) mapTop.current?.scrollIntoView({ block: 'start' });
  }, [selection]);
  const photo = useRef<HTMLInputElement>(null),
    panel = useRef<HTMLDivElement>(null);
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
  const query = search.trim(),
    matches = useMemo(() => places.filter((p) => p.name.includes(query)), [places, query]);
  const shown = useMemo(() => drawn.filter((t) => t.trail.name.includes(query)), [drawn, query]);
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
  const reveal = () => setTimeout(() => panel.current?.scrollIntoView({ block: 'nearest' }), 80);
  function beginPlace(point: PlacePoint, p?: Place) {
    setSelected('');
    setSelection(null);
    setWorkingReview(false);
    setList(false);
    setDraft({
      id: p?.id || newId('places'),
      editing: !!p,
      original: p,
      point,
      name: p?.name || '',
      photo: p?.photo || '',
      selected: true,
    });
    reveal();
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
  function pick(p: Point) {
    const point: PlacePoint = { ...p, at: Date.now(), source: 'manual', accuracy: null };
    if (selection === 'new') beginPlace(point);
    if (selection === 'place' && place) setDraft({ ...place, point, selected: true });
    if (selection === 'vertex' && review)
      changeGeometry(review.points.map((v) => (v.seq === anchor ? { ...v, ...p } : v)));
    setSelection(null);
  }
  async function savePlace() {
    if (!place || !place.name.trim() || !coordinate(place.point)) return;
    await enqueue(scope, { place: { draft: place, actor: ctx.actor, at: new Date().toISOString() } }, placeKey);
    setQueue(await jobs(scope));
    setPlace(null);
    setSelected(place.id);
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
    setList(false);
    setAnchor(d.points[0]?.seq || 0);
    focus(undefined, d.points);
    reveal();
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
    reveal();
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
  return (
    <AppScreen variant="detail" className="survey-screen">
      {cloud.items.map((t) => (
        <Geometry key={t.id + '@' + t.geometry} trail={t} update={updateLayer} />
      ))}
      <TopBar
        back={{ label: 'החווה', onClick: () => go('/farm') }}
        end={
          <Button variant="quiet" onClick={() => setGuide((v) => !v)}>
            מדריך הסקר
          </Button>
        }
      />
      <header className="survey-title">
        <div>
          <h1>מפת החווה</h1>
          <p>
            {places.length === 1 ? 'מקום אחד' : places.length + ' מקומות'} ·{' '}
            {trails.length === 1 ? 'שביל אחד' : trails.length + ' שבילים'}
          </p>
        </div>
        <Button
          variant="outline"
          icon={list ? 'pin' : 'search'}
          onClick={() => {
            setList((v) => !v);
            setSelection(null);
          }}
        >
          {list ? 'מפה' : 'חיפוש ורשימה'}
        </Button>
      </header>
      {guide && (
        <section className="survey-panel">
          <h2>סקר החווה</h2>
          <ol>
            <li>פתחו גישה למיקום ובדקו את הדיוק.</li>
            <li>שמרו מקום בשם שיהיה קל לזהות.</li>
            <li>התחילו הקלטה והלכו לאורך השביל. אפשר להוסיף מקומות בדרך.</li>
            <li>בסיום, בדקו את המקטעים ואשרו את המעברים בשטח.</li>
          </ol>
          <Button variant="quiet" onClick={() => setGuide(false)}>
            חזרה למפה
          </Button>
        </section>
      )}
      {list && (
        <Field
          label="חיפוש במפה"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="שם מקום או שביל"
        />
      )}
      <div ref={mapTop} />
      <SurveyMap
        places={matches}
        trails={shown}
        live={gps.fix}
        clock={gps.clock}
        raw={gps.raw}
        draft={place?.point}
        selected={selected}
        edit={workingReview ? review?.points : undefined}
        anchor={anchor}
        selecting={!!selection}
        online={online}
        view={view}
        onPick={pick}
        onVertex={chooseVertex}
        onPlace={(id) => {
          setSelected(id);
          setList(false);
        }}
        onTrail={openTrail}
      />
      <div className="survey-tools">
        <Button variant="quiet" icon="pin" disabled={!gps.fix} onClick={() => gps.fix && focus(gps.fix)}>
          {q === 'stale' ? 'המדידה האחרונה' : 'המיקום שלי'}
        </Button>
        <Button
          variant="quiet"
          icon="farm"
          onClick={() => focus(undefined, [...places, ...drawn.flatMap((t) => t.points)])}
        >
          מבט על החווה
        </Button>
      </div>
      {selection && (
        <section className="survey-panel survey-pick">
          <b>געו בנקודה הרצויה במפה</b>
          <Button variant="quiet" onClick={() => setSelection(null)}>
            ביטול הבחירה
          </Button>
        </section>
      )}
      {error && (
        <p className="survey-error" role="alert">
          {error}
        </p>
      )}
      {note && (
        <p role="status" className="survey-note">
          {note}
        </p>
      )}
      {ctx.placesError && <p role="alert">{ctx.placesError}</p>}
      {cloud.error && <p role="alert">לא ניתן לקרוא את השבילים · {cloud.error}</p>}
      {Object.values(layers).some((l) => l.error) && <p role="status">חלק מהמקטעים עדיין אינם זמינים במכשיר.</p>}
      {(ctx.placesLoading || cloud.loading) && <p role="status">טוען מקומות ושבילים…</p>}
      {list && (
        <section className="survey-panel">
          <h2>מקומות ושבילים</h2>
          {matches.map((p) => (
            <button
              className="survey-hit"
              key={p.id}
              onClick={() => {
                setSelected(p.id);
                setList(false);
                if (coordinate(p)) focus(p);
              }}
            >
              <Icon name="pin" />
              {p.name}
            </button>
          ))}
          {shown.map((d) => (
            <button className="survey-hit" key={d.trail.id} onClick={() => openTrail(d.trail.id)}>
              <Icon name="nav" />
              {d.trail.name} · {d.trail.status === 'draft' ? 'טיוטה' : 'מאושר'}
            </button>
          ))}
          {!matches.length && !shown.length && (
            <p>{query ? 'אין תוצאות לחיפוש הזה' : 'עדיין אין מקומות או שבילים שמורים'}</p>
          )}
        </section>
      )}
      <div ref={panel} />
      {place && (
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
              <Button variant="quiet" onClick={() => setDraft({ ...place, point: { ...current, source: 'gps' } })}>
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
      {!place && workingReview && review && (
        <TrailReview
          review={review}
          places={places}
          trails={drawn}
          anchor={anchor}
          onAnchor={chooseVertex}
          change={setWork}
          locate={(p) => {
            focus(p);
            mapTop.current?.scrollIntoView({ block: 'start' });
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
            setWorkingReview(false);
            setSelection(null);
          }}
          busy={busy}
        />
      )}
      {!place && !workingReview && active && (
        <section className="survey-panel">
          <div className="survey-row">
            <h2>{active.name}</h2>
            <Button variant="quiet" onClick={() => setSelected('')}>
              סגירה
            </Button>
          </div>
          {drawn
            .filter((d) => d.trail.status === 'confirmed')
            .flatMap((d) =>
              d.trail.connections
                .filter(
                  (c) => c.target === 'place' && c.targetId === active.id && connectionCurrent(c, places, trails)
                )
                .map((c, i) => {
                  const entry = d.points.find((v) => v.seq === c.at);
                  return (
                    entry && (
                      <Button
                        key={d.trail.id + i}
                        variant="quiet"
                        icon="pin"
                        onClick={() => {
                          focus(entry);
                          mapTop.current?.scrollIntoView({ block: 'start' });
                        }}
                      >
                        כניסה ל{MODES[c.mode]} · {d.trail.name}
                      </Button>
                    )
                  );
                })
            )}
          {active.photo && <img className="survey-photo" src={active.photo} alt={active.name} />}
          <div className="survey-actions">
            <Button
              variant="outline"
              onClick={() =>
                beginPlace(
                  {
                    lat: active.lat,
                    lng: active.lng,
                    accuracy: active.accuracy,
                    at: active.measuredAt || 0,
                    source: active.source || 'legacy',
                  },
                  active
                )
              }
            >
              עריכת מקום
            </Button>
            <Button variant="quiet" onClick={() => go('/places/' + active.id)}>
              פרטי המקום ומשימות
            </Button>
            <Button variant="quiet" onClick={() => ext(mapsUrl(active.lat, active.lng))}>
              ניווט חיצוני ב־Google Maps
            </Button>
          </div>
        </section>
      )}
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
      {!place && !workingReview && (
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
              · {session.count} מדידות שמורות במכשיר
              {session.lastAt && ' · מדידה אחרונה ' + age(session.lastAt, gps.clock)}
            </p>
          )}
          {session?.state === 'interrupted' && <p>המשך ההקלטה יפתח מקטע חדש. המדידות הקודמות שמורות.</p>}
          <div className="survey-actions">
            {!session && !review && native && (
              <Button
                variant={places.length ? 'primary' : 'outline'}
                disabled={busy || !ready || !gps.grant || perm !== 'precise' || !gps.status.enabled}
                onClick={() => act(() => gps.control('start'))}
              >
                התחלת הקלטת שביל
              </Button>
            )}
            {session?.state === 'recording' && (
              <Button variant="outline" disabled={busy} onClick={() => act(() => gps.control('pause', session))}>
                השהיה
              </Button>
            )}
            {(session?.state === 'paused' || session?.state === 'interrupted') && (
              <Button
                disabled={busy || perm !== 'precise' || !gps.status.enabled}
                onClick={() => act(() => gps.control('resume', session))}
              >
                המשך הקלטה
              </Button>
            )}
            {session && session.state !== 'review' && (
              <Button variant="outline" disabled={busy} onClick={() => act(() => gps.control('finish', session))}>
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
            <Button
              variant={places.length ? 'outline' : 'primary'}
              icon="pin"
              disabled={!ready || !current}
              onClick={() => current && beginPlace({ ...current, source: 'gps' })}
            >
              שמירת מקום כאן
            </Button>
            <Button
              variant="quiet"
              disabled={!ready}
              onClick={() => {
                setSelection('new');
                setList(false);
                setSelected('');
              }}
            >
              בחירה ידנית במפה
            </Button>
          </div>
          {!native && (
            <p>
              {demoOnly()
                ? 'הקלטת הליכה זמינה באפליקציית Android אחרי כניסה לחשבון הבעלים.'
                : 'להקלטה בזמן נעילת המסך, פתחו את המפה באפליקציית Android של החווה.'}
            </p>
          )}
          {demoOnly() && (
            <Button
              variant="outline"
              onClick={() => {
                setDemo({ on: false });
                go('/farm/map', true);
              }}
            >
              מעבר לחשבון שלי לסקר שטח
            </Button>
          )}
          {native && !gps.status.notifications && (
            <Button variant="quiet" onClick={() => act(() => gps.settings('notifications'))}>
              הגדרות התראות להקלטה
            </Button>
          )}
        </section>
      )}
      {native && session?.state === 'recording' && (place || workingReview) && (
        <p className="survey-note" role="status">
          הקלטת השביל נמשכת · {session.count} מדידות שמורות
        </p>
      )}
      {queue.length > 0 && (
        <section className="survey-panel">
          <h2>{queue.length} שמירות ממתינות לסנכרון</h2>
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
    </AppScreen>
  );
}
