// L3 (places on the farm) and L4 (one place): saved points that tasks and recurring tasks hang on.
import { useState } from 'react';
import type { ScreenProps } from '../../ctx';
import { AppScreen, go, mapsUrl, useExternal, useRemove, useToast } from '../../core';
import { TopBar, PageTitle, Button, Card, Icon, Field, BottomBar, ListCard, Row, EmptyState, SectionHeader, MoreMenu } from '../../kit';
import { tableCell, useTableView } from '../../patterns';
import { back, param } from '../../../router';
import { getPosition, usePlace } from '../../../store';
import { useEvent } from '../../../data';
import { useClockVersion, nowMs } from '../../../clock';
import type { Place, Task } from '../../../types';
import { useRootTasks, useTasksAt, placeMeta, sortPlaces, rowMeta, createPlace, savePlace, removePlace, type PlaceV2 } from '../../data/tasks';
import { to, useFail, usePhotoPicker } from './shared';
import './tasks.css';

/** The places list opens from the Farm tab card (and an old link from the manage screen, ?from=manage): back returns there. */
function placesBack() {
  const from = param('from');
  const [label, parent] = from === 'manage' ? ['ניהול', '/manage'] : ['החווה', '/farm'];
  return { label, onClick: () => back(parent) };
}

export function PlacesScreen({ ctx }: ScreenProps) {
  const root = useRootTasks(ctx); const fail = useFail();
  const [busy, setBusy] = useState(false);
  const [point, setPoint] = useState<Awaited<ReturnType<typeof getPosition>> | null>(null);
  const [name, setName] = useState('');
  const open = root.items.filter((t) => !t.done);
  // rule 5: table view and export are ⋯ items (Q5, Q9), managers only as before
  const table = useTableView({
    title: 'מקומות בחווה', filename: 'מקומות.csv', headers: ['שם', 'קו רוחב', 'קו אורך', 'נשמר'],
    rows: () => ctx.places.map((place) => [place.name, place.lat, place.lng, tableCell.date(place.createdAt)]),
  });
  const here = async () => {
    setBusy(true);
    try {
      setPoint(await getPosition()); setName('');
    } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const confirm = async () => {
    if (!point || !name.trim()) return;
    setBusy(true);
    try { const id = await createPlace(ctx.actor, name, point); go(`/places/${id}`); }
    catch (e) { fail(e); } finally { setBusy(false); }
  };
  if (table.active) return table.screen;
  return (
    <AppScreen variant="detail">
      <TopBar back={placesBack()} end={<MoreMenu title="מקומות" items={table.items.map((i) => ({ ...i, hidden: !ctx.manager || !ctx.places.length }))} />} />
      <PageTitle size="root">מקומות בחווה</PageTitle>
      {ctx.owner && <Button block icon="pin" onClick={()=>go('/farm/map')}>פתיחת מפת החווה</Button>}
      {point ? <Card><Field label="שם המקום" maxLength={120} value={name} onChange={e=>setName(e.target.value)}/><Button disabled={busy||!name.trim()} onClick={confirm}>שמירת המקום</Button><Button variant="quiet" onClick={()=>setPoint(null)}>ביטול</Button></Card> : <Button className="tasks-here" icon="pin" iconSize={22} disabled={busy} onClick={here}>אני עומד כאן, לשמור מקום</Button>}
      {ctx.places.length > 0 ? (
        <Card as="section">
          <ul className="k-list k-list--flush" style={{ margin: 0 }}>
            {sortPlaces(ctx.places, open, ctx.templates).map((p) => <PlaceRow key={p.id} p={p} open={open} ctx={ctx} />)}
          </ul>
        </Card>
      ) : (
        <EmptyState variant="card" title="עוד אין מקומות שמורים" text="עמדו במקום ולחצו על הכפתור למעלה" />
      )}
    </AppScreen>
  );
}

function PlaceRow({ p, open, ctx }: { p: Place; open: Task[]; ctx: ScreenProps['ctx'] }) {
  const at = open.filter((t) => t.location?.placeId === p.id);
  const evId = at.length && at.every((t) => t.eventId && t.eventId === at[0].eventId) ? at[0].eventId || '' : '';
  const ev = useEvent(evId, !!evId);
  return (
    <li>
      <a className="tasks-place" {...to(`/places/${p.id}`)}>
        <span className="tasks-place__pin" aria-hidden="true"><Icon name="pin" size={22} /></span>
        <span className="tasks-place__body">
          <span className="tasks-place__title">{p.name}</span>
          <span className="tasks-meta">{placeMeta(p.id, open, ctx.templates, ev.item ? [ev.item] : [])}</span>
        </span>
        <span className="tasks-place__chev" aria-hidden="true"><Icon name="chevron" size={20} /></span>
      </a>
    </li>
  );
}

export function PlaceScreen({ ctx, params }: ScreenProps) {
  const visible = ctx.places.find((x) => x.id === params.id);
  const archived = usePlace(params.id, !visible);
  const p = (visible || archived.item) as PlaceV2 | undefined;
  if (p?.archived) return <AppScreen variant="detail"><TopBar back={placesBack()} /><PageTitle>{p.name}</PageTitle><Card>המקום בארכיון. המשימות וההיסטוריה שלו נשמרו.</Card></AppScreen>;
  if (!p) {
    return (
      <AppScreen variant="detail">
        <TopBar back={{ label: 'מקומות', ...to('/places') }} />
        <EmptyState variant="card" title="המקום לא נמצא" text="אולי נמחק בינתיים" />
      </AppScreen>
    );
  }
  return <PlaceForm key={p.id} ctx={ctx} params={params} p={p} />;
}

function PlaceForm({ ctx, p }: ScreenProps & { p: PlaceV2 }) {
  useClockVersion();
  const toast = useToast(); const fail = useFail(); const external = useExternal();
  const fresh = param('new') === '1';
  const [name, setName] = useState(fresh && p.name === 'מקום חדש' ? '' : p.name);
  const [pos, setPos] = useState<{ lat: number; lng: number; accuracy?: number }>({ lat: p.lat, lng: p.lng, accuracy: p.accuracy });
  const [photo, setPhoto] = useState(p.photo || '');
  const [busy, setBusy] = useState(false);
  const pick = usePhotoPicker(setPhoto, 'place');
  const tasks = useTasksAt(p.id, ctx.manager);
  const rows = [...tasks.items].sort((a, b) => (a.dueDate || '9').localeCompare(b.dueDate || '9'));

  const relocate = async () => {
    try { const q = await getPosition(); setPos(q); toast.show({ text: 'המיקום עודכן. לשמור כדי לקבע' }); } catch (e) { fail(e); }
  };
  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try { await savePlace(ctx.actor, p, { name, lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy, photo }); toast.show({ text: 'נשמר' }); back('/places'); }
    catch (e) { fail(e); setBusy(false); }
  };
  const remove = useRemove();
  return (
    <AppScreen variant="detail" bar={<BottomBar><Button size="bar" grow disabled={busy || !name.trim()} onClick={save}>שמירה</Button></BottomBar>}>
      {pick.input}
      {/* rule 6: delete is ⋯ → "מחיקה" → Q8 (managers) */}
      <TopBar back={{ label: 'מקומות', ...to('/places') }} end={<MoreMenu title="מקום" items={[{
        label: 'העברה לארכיון', icon: 'trash', tone: 'danger', hidden: !ctx.manager,
        confirm: { title: 'להעביר את המקום לארכיון?', text: `"${p.name}" יועבר לארכיון. משימות שקשורות אליו נשארות.`,
          onConfirm: () => remove(() => removePlace(ctx.actor, p), { text: 'המקום הועבר לארכיון', after: () => go('/places', true) }) },
      }]} />} />
      <Field label="שם המקום" value={name} placeholder="למשל: ליד הלול" autoFocus={fresh} onChange={(e) => setName(e.target.value)} />
      <a className="tasks-map" role="img" aria-label="נקודה על המפה" href={mapsUrl(pos.lat, pos.lng)} onClick={(e) => { e.preventDefault(); external(mapsUrl(pos.lat, pos.lng)); }}>
        {photo && <img src={photo} alt="" />}
        {!photo && <><Icon name="pin" size={30} />{pos.accuracy ? `נקודה על המפה · דיוק ${pos.accuracy} מטר` : 'נקודה על המפה'}</>}
      </a>
      <div className="tasks-btnrow">
        <Button variant="outline" size="tall" icon="pin" iconSize={18} onClick={relocate}>לעדכן למקום שבו אני עומד</Button>
      </div>
      <div className="tasks-btnrow">
        <Button variant="outline" size="tall" icon="nav" iconSize={16} onClick={() => external(mapsUrl(pos.lat, pos.lng))}>ניווט חיצוני ב־Google Maps</Button>
        <Button variant="dashed" size="tall" icon="camera" iconSize={20} disabled={pick.busy} onClick={() => (photo ? setPhoto('') : pick.pick(true))}>{photo ? 'להסיר את התמונה' : 'תמונה של המקום'}</Button>
      </div>
      {rows.length > 0 ? (
        <ListCard title="משימות במקום הזה">
          {rows.map((t) => <Row key={t.id} title={t.title} meta={rowMeta(t, { uid: ctx.user.uid, view: 'placeList', today: ctx.today, now: nowMs() })} {...to(`/tasks/${t.id}`)} />)}
        </ListCard>
      ) : (
        <Card as="section"><SectionHeader title="משימות במקום הזה" /><p className="tasks-meta" style={{ margin: '0 14px 14px' }}>אין משימות פתוחות כאן</p></Card>
      )}
    </AppScreen>
  );
}
