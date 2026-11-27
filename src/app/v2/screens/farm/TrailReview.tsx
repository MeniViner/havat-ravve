import { useState } from 'react';
import { useList } from '../../../db';
import type { Sample, Point } from '../../../survey/model';
import type { Place } from '../../../types';
import type { Review } from '../../../survey/local';
import {
  MODES,
  connectionCurrent,
  hasLine,
  sections,
  type Connection,
  type Mode,
  type Vertex,
} from '../../../survey/model';
import type { DrawnTrail } from './SurveyMap';
import { Button, Field } from '../../kit';

type Props = {
  review: Review;
  places: Place[];
  trails: DrawnTrail[];
  anchor: number;
  onAnchor: (n: number) => void;
  change: (r: Review) => void;
  edit: (p: Vertex[]) => void;
  move: () => void;
  locate: (p: Point) => void;
  undo: () => void;
  canUndo: boolean;
  save: (confirm: boolean) => void;
  close: () => void;
  discard: () => void;
  busy: boolean;
};
export function TrailReview({
  review: r,
  places,
  trails,
  anchor,
  onAnchor,
  change,
  edit,
  move,
  locate,
  undo,
  canUndo,
  save,
  close,
  discard,
  busy,
}: Props) {
  const t = r.trail,
    p = r.points.find((v) => v.seq === anchor);
  const lines = sections(r.points),
    line = lines.find((s) => s.some((v) => v.seq === anchor));
  const [target, setTarget] = useState(''),
    [otherSeq, setOtherSeq] = useState(0),
    [mode, setMode] = useState<Mode>('walk');
  const [connections, setConnections] = useState(false);
  const [page, setPage] = useState(0);
  const candidates = trails.filter(
    (x) => x.trail.id !== t.id && x.trail.status === 'confirmed' && x.trail.modes.includes(mode)
  );
  const other = candidates.find((x) => target === 'trail:' + x.trail.id);
  const targetPlace = places.find((x) => target === 'place:' + x.id);
  const vertex = other?.points.find((x) => x.seq === otherSeq);
  const update = (patch: Partial<typeof t>) => change({ ...r, trail: { ...t, ...patch } });
  const connect = () => {
    if (!p || !t.modes.includes(mode) || (!targetPlace && !vertex)) return;
    const q = targetPlace || vertex!;
    const c: Connection = {
      at: p.seq,
      mode,
      target: targetPlace ? 'place' : 'trail',
      targetId: targetPlace?.id || other!.trail.id,
      lat: q.lat,
      lng: q.lng,
      targetVertex: vertex?.seq || 0,
      targetGeometry: other?.trail.geometry || '',
    };
    if (!t.connections.some((x) => JSON.stringify(x) === JSON.stringify(c)))
      update({ connections: [...t.connections, c] });
    setConnections(false);
  };
  const source = useList<{ index: number; points: Sample[] }>(
    `surveyRecordings/${t.recordingId}/chunks`,
    { orderBy: [['index', 'asc']] },
    !r.raw
  );
  const raw = r.raw?.samples ?? source.items.flatMap((c) => c.points);
  const troubled = raw?.filter((p) => p.quality !== 'ok') || [];
  return (
    <section className="survey-panel survey-review">
      <h2>סקירת השביל</h2>
      <p>
        {r.points.length === 1 ? 'נקודה אחת' : r.points.length + ' נקודות'} ·{' '}
        {lines.length === 1 ? 'מקטע אחד' : lines.length + ' מקטעים נפרדים'}
      </p>
      {!!troubled.length && (
        <details>
          <summary>מדידות שדורשות בדיקה ({troubled.length})</summary>
          <div className="survey-scroll">
            {troubled.map((q) => (
              <button key={q.seq} onClick={() => onAnchor(q.seq)}>
                נקודה {q.seq} ·{' '}
                {q.quality === 'weak' ? 'דיוק נמוך' : q.quality === 'gap' ? 'פער בזמן' : 'שינוי מיקום חריג'}
              </button>
            ))}
          </div>
        </details>
      )}
      {raw.length > 0 && (
        <details>
          <summary>יומן המדידות ({raw.length})</summary>
          <p>זמני המדידה המקוריים לפי השעון המקומי במכשיר.</p>
          <ol className="survey-samples">
            {raw.slice(page * 20, page * 20 + 20).map((s) => (
              <li key={s.seq}>
                <b>{new Date(s.at).toLocaleTimeString('he-IL', { hour12: false })}</b> · מקטע {s.segment} · נקודה{' '}
                {s.seq}
                <br />
                <bdi>
                  {s.lat.toFixed(6)}, {s.lng.toFixed(6)}
                </bdi>{' '}
                · {s.accuracy == null ? 'ללא דיוק מדווח' : `דיוק משוער ${Math.round(s.accuracy)} מ׳`}
              </li>
            ))}
          </ol>
          <div className="survey-actions">
            <Button variant="quiet" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              הקודמות
            </Button>
            <Button variant="quiet" disabled={(page + 1) * 20 >= raw.length} onClick={() => setPage((p) => p + 1)}>
              הבאות
            </Button>
          </div>
        </details>
      )}
      <Field
        label="שם השביל"
        maxLength={120}
        value={t.name}
        onChange={(e) => update({ name: e.target.value })}
        placeholder="למשל, מהשער אל המחסן"
      />
      {!!r.points.length && (
        <details>
          <summary>תיקון נקודה או מקטע</summary>
          <label>
            נקודה לעריכה{' '}
            <input
              type="number"
              min={1}
              max={r.points.at(-1)?.seq}
              value={anchor || ''}
              onChange={(e) => onAnchor(Number(e.target.value))}
            />
          </label>
          <div className="survey-actions">
            <Button variant="outline" disabled={!p} onClick={move}>
              הזזה במפה
            </Button>
            <Button variant="neutral" disabled={!p} onClick={() => edit(r.points.filter((v) => v.seq !== anchor))}>
              הסרת נקודה
            </Button>
            <Button
              variant="neutral"
              disabled={!line}
              onClick={() => edit(r.points.filter((v) => !line?.includes(v)))}
            >
              הסרת מקטע
            </Button>
          </div>
        </details>
      )}
      {canUndo && (
        <Button variant="quiet" onClick={undo}>
          ביטול התיקון האחרון
        </Button>
      )}
      <fieldset>
        <legend>למי השביל מתאים?</legend>
        <div className="survey-modes">
          {(Object.keys(MODES) as Mode[]).map((m) => (
            <label key={m}>
              <input
                type="checkbox"
                checked={t.modes.includes(m)}
                onChange={(e) =>
                  update({
                    modes: e.target.checked ? [...t.modes, m] : t.modes.filter((v) => v !== m),
                    connections: t.connections.filter((c) => e.target.checked || c.mode !== m),
                  })
                }
              />
              {MODES[m]}
            </label>
          ))}
        </div>
      </fieldset>
      <details open={connections || undefined} onToggle={(e) => setConnections(e.currentTarget.open)}>
        <summary>כניסות וחיבורים ({t.connections.length})</summary>
        <p>בחרו נקודה על השביל ואת המקום או השביל שאפשר להגיע אליו בפועל.</p>
        <label>
          נקודת הכניסה בשביל הזה{' '}
          <input type="number" min={1} value={anchor || ''} onChange={(e) => onAnchor(Number(e.target.value))} />
        </label>
        <label>
          אופן המעבר{' '}
          <select
            value={mode}
            onChange={(e) => {
              setMode(e.target.value as Mode);
              setTarget('');
            }}
          >
            {(Object.keys(MODES) as Mode[]).map((m) => (
              <option key={m} value={m}>
                {MODES[m]}
              </option>
            ))}
          </select>
        </label>
        <label>
          יעד החיבור{' '}
          <select
            value={target}
            onChange={(e) => {
              setTarget(e.target.value);
              setOtherSeq(0);
            }}
          >
            <option value="">בחירת מקום או שביל</option>
            {places.map((p) => (
              <option key={p.id} value={'place:' + p.id}>
                {p.name}
              </option>
            ))}
            {candidates.map((o) => (
              <option key={o.trail.id} value={'trail:' + o.trail.id}>
                שביל · {o.trail.name}
              </option>
            ))}
          </select>
        </label>
        {other && (
          <label>
            נקודה בשביל היעד{' '}
            <select value={otherSeq} onChange={(e) => setOtherSeq(Number(e.target.value))}>
              <option value={0}>בחירת נקודה</option>
              {other.points.map((v) => (
                <option key={v.seq} value={v.seq}>
                  מקטע {v.segment} · נקודה {v.seq} · {v.lat.toFixed(5)}, {v.lng.toFixed(5)}
                </option>
              ))}
            </select>
          </label>
        )}
        {vertex && (
          <Button variant="quiet" onClick={() => locate(vertex)}>
            הצגת נקודת החיבור בשביל היעד
          </Button>
        )}
        {!t.modes.includes(mode) && <p>כדי לאשר מעבר, סמנו למעלה שהשביל מתאים ל{MODES[mode]}.</p>}
        <Button
          variant="outline"
          disabled={!p || !t.modes.includes(mode) || (!targetPlace && !vertex) || t.connections.length >= 32}
          onClick={connect}
        >
          אישור החיבור בשטח
        </Button>
        {t.connections.map((c, i) => (
          <div className="survey-row" key={i}>
            <span>
              {MODES[c.mode]} · נקודה {c.at} אל{' '}
              {places.find((p) => p.id === c.targetId)?.name ||
                trails.find((o) => o.trail.id === c.targetId)?.trail.name ||
                'יעד שמור'}
              {!connectionCurrent(
                c,
                places,
                trails.map((x) => x.trail)
              ) && ' · נדרש אישור מחדש'}
            </span>
            <Button
              variant="quiet"
              onClick={() => update({ connections: t.connections.filter((_, j) => i !== j) })}
            >
              הסרה
            </Button>
          </div>
        ))}
      </details>
      <div className="survey-actions">
        <Button
          disabled={busy || !t.name.trim() || !t.modes.length || !hasLine(r.points)}
          onClick={() => save(true)}
        >
          אישור ושמירת השביל
        </Button>
        <Button variant="outline" disabled={busy || !t.name.trim()} onClick={() => save(false)}>
          שמירת טיוטה
        </Button>
        <Button variant="quiet" disabled={busy} onClick={discard}>
          ויתור על הטיוטה
        </Button>
        <Button variant="quiet" onClick={close}>
          חזרה לסקר
        </Button>
      </div>
    </section>
  );
}
