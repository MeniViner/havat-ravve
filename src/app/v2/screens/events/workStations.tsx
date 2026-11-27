import { useCallback, useState } from 'react';
import { useParam } from '../../../router';
import { AppScreen } from '../../core';
import { Button, EmptyState, Field, ListCard, PageTitle, Row, Sheet, Tag, TopBar } from '../../kit';
import { backTo } from './shared';
import type { ScreenProps } from '../../ctx';
import { catalogStations, emptyRegistry, retireWorkStation, saveWorkStation, useLegacyStations, useStationRegistry, type WorkStation } from '../../data/workStations';
import { cleanStationName } from '../../../../../shared/work-stations';

export function StationNameForm({ initial, known, close, saved }: {
  initial?: WorkStation; known: WorkStation[]; close: () => void; saved: (station: WorkStation) => void;
}) {
  const [name, setName] = useState(initial?.name || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save() {
    if (busy || !cleanStationName(name)) return;
    setBusy(true);
    try { saved(await saveWorkStation(name, known, initial)); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <Sheet open onClose={close} title={initial ? 'עריכת שם התחנה' : 'הוספת תחנת עבודה'}>
    <form className="events-sheet" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <Field label="שם התחנה" value={name} maxLength={60} onChange={(e) => { setName(e.target.value); setError(''); }} />
      {error && <p role="alert">{error}</p>}
      <Button type="submit" size="bar" disabled={!cleanStationName(name) || busy}>{initial ? 'שמירת השם' : 'הוספת התחנה'}</Button>
    </form>
  </Sheet>;
}
type Editor = { kind: 'create' } | { kind: 'rename' | 'remove'; station: WorkStation };

export function WorkStationsScreen({ ctx }: ScreenProps) {
  const eventId = useParam('event');
  const current = useStationRegistry();
  const registry = current.item || emptyRegistry;
  const [revision, refresh] = useState(0);
  const history = useLegacyStations(ctx.manager, String(revision));
  const stations = catalogStations(registry, history.rows);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [progress, setProgress] = useState(false);
  const [error, setError] = useState('');
  const close = useCallback(() => setEditor(null), []);
  const done = () => { setEditor(null); refresh((v) => v + 1); };
  const resume = async () => {
    const move = registry.moving;
    if (!move || progress) return;
    const source = stations.find((s) => s.id === move.from);
    const target = stations.find((s) => s.id === move.to);
    if (!source || (move.to && !target)) return;
    setProgress(true); setError('');
    try { await retireWorkStation(source, target || null); done(); }
    catch (e) { setError((e as Error).message); }
    finally { setProgress(false); }
  };
  return <AppScreen variant="detail">
    <TopBar back={eventId ? backTo('צוות האירוע', '/manage/events/' + encodeURIComponent(eventId) + '/staffing') : backTo('ניהול', '/manage')} />
    <PageTitle>תחנות עבודה</PageTitle>
    <p className="k-note">התחנות זמינות לשיבוץ בכל אירוע של החווה.</p>
    {registry.moving && <section className="k-card events-sheet" aria-label="העברת שיבוצים">
      <b>העברת השיבוצים טרם הסתיימה</b>
      <Button disabled={progress} onClick={resume}>המשך העברת שיבוצים</Button>
    </section>}
    {error && <p role="alert">{error}</p>}
    {history.error && <p role="status">{history.error} <Button variant="quiet" onClick={() => refresh((v) => v + 1)}>ניסיון נוסף</Button></p>}
    <Button variant="outline" icon="plus" disabled={!!registry.moving} onClick={() => setEditor({ kind: 'create' })}>הוספת תחנה</Button>
    <ListCard title="תחנות החווה">{stations.map((station) => <Row key={station.id} title={station.name}
      meta={history.loading ? undefined : (history.counts[station.id] || 0) + ' שיבוצים באירועים פעילים'}
      actions={<div className="events-btnrow">
        <Button variant="quiet" aria-label={'עריכת ' + station.name} disabled={!!registry.moving} onClick={() => setEditor({ kind: 'rename', station })}>עריכה</Button>
        <Button variant="quiet" aria-label={'הסרת ' + station.name} disabled={!!registry.moving || history.loading || !!history.error} onClick={() => setEditor({ kind: 'remove', station })}>הסרה</Button>
      </div>} />)}</ListCard>
    {!current.loading && !history.loading && !stations.length && <EmptyState title="אין תחנות עבודה" text="אפשר להוסיף תחנה כדי להתחיל לשבץ אליה צוות." />}
    {(editor?.kind === 'create' || editor?.kind === 'rename') && <StationNameForm initial={editor.kind === 'rename' ? editor.station : undefined} known={stations} close={close} saved={done} />}
    {editor?.kind === 'remove' && <RemoveStation source={editor.station} alternatives={stations.filter((s) => s.id !== editor.station.id)}
      assignments={history.counts[editor.station.id] || 0} close={close} done={done} />}
  </AppScreen>;
}
function RemoveStation({ source, alternatives, assignments, close, done }: {
  source: WorkStation; alternatives: WorkStation[]; assignments: number; close: () => void; done: () => void;
}) {
  const [targetId, setTargetId] = useState('');
  const [newStation, setNewStation] = useState(false);
  const [added, setAdded] = useState<WorkStation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const closeNew = useCallback(() => setNewStation(false), []);
  const options = added && !alternatives.some((s) => s.id === added.id) ? [...alternatives, added] : alternatives;
  const transfer = async () => {
    if (busy || (assignments > 0 && !targetId)) return;
    setBusy(true); setError('');
    try { await retireWorkStation(source, options.find((s) => s.id === targetId) || null); done(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  return <Sheet open onClose={close} title={'הסרת ' + source.name}><div className="events-sheet">
    {assignments > 0 ? <>
      <Tag tone="waiting">{assignments} שיבוצים פעילים</Tag>
      <p>בחרו תחנה חלופית. כל שיבוץ יעבור לתחנה שבחרתם באותו אירוע, עם התפקיד ושעות ההגעה והסיום שלו.</p>
      <label className="k-field"><span>תחנה חלופית</span>
        <select className="k-input" aria-label="תחנה חלופית" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
          <option value="">בחירת תחנה</option>{options.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      <Button variant="quiet" icon="plus" onClick={() => setNewStation(true)}>הוספת תחנה חלופית</Button>
    </> : <p>אין שיבוצים פעילים בתחנה. לאחר ההסרה התחנה תישאר בהיסטוריית האירועים שהסתיימו.</p>}
    {error && <p role="alert">{error}</p>}
    <Button variant="danger" size="bar" disabled={busy || (assignments > 0 && !targetId)} onClick={transfer}>
      {assignments > 0 ? 'העברת השיבוצים והסרת התחנה' : 'הסרת התחנה'}
    </Button>
    <Button variant="outline" onClick={close} disabled={busy}>ביטול</Button>
    {newStation && <StationNameForm known={[source, ...options]} close={closeNew} saved={(s) => { setAdded(s); setTargetId(s.id); closeNew(); }} />}
  </div></Sheet>;
}
