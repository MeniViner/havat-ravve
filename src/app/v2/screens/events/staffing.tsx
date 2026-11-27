// Event crews share the same station and shift details in the manager and volunteer views.
import { useCallback, useState } from 'react';
import type { ScreenProps, V2Ctx } from '../../ctx';
import { AppScreen, go } from '../../core';
import { TopBar, PageTitle, StatRow, StatTile, Button, BottomBar, Sheet, Field, ListCard, Row, Tag } from '../../kit';
import { useEvent } from '../../../data';
import { dayName, ddmm, hhmm, keyOf } from '../../format';
import { useStaffing, usePresenceOn, saveEventAssignment, removeFromStation, type EventAssignment } from '../../data/events';
import { stationsOf, staffingStats, stationMissing, hoursText, isoFromLocal, localOf, type Station } from './logic';
import { StationNameForm, StationPicker } from './workStations';
import { catalogStations, currentStaffingEvent, emptyRegistry, useLegacyStations, useStationRegistry, type WorkStation } from '../../data/workStations';
import { assignmentKey, stationWritable } from '../../../../../shared/work-stations';
import { Loading, Missing, backTo, useRun } from './shared';
import type { FarmEvent } from '../../../types';

export function StaffingScreen({ ctx, params }: ScreenProps) {
  const { item:e, loading } = useEvent(params.id, ctx.manager);
  if (loading && !e) return <Loading backLabel="האירוע" parent={'/manage/events/' + params.id} />;
  if (!e) return <Missing backLabel="אירועים" parent="/manage/events" />;
  return <EventCrew ctx={ctx} event={e} />;
}
const shiftText = (p:EventAssignment) => p.startsAt && p.endsAt
  ? [p.role, dayName(p.startsAt) + ' ' + ddmm(p.startsAt) + ' ' + hhmm(p.startsAt), 'עד ' + dayName(p.endsAt) + ' ' + ddmm(p.endsAt) + ' ' + hhmm(p.endsAt)].filter(Boolean).join(' · ')
  : [p.role, p.hours && hoursText(p.hours)].filter(Boolean).join(' · ');
type Edit = { station:Station; person?:EventAssignment };
export function EventCrew({ctx,event:e}:{ctx:V2Ctx;event:FarmEvent}) {
  const staffing = useStaffing(e.id), presence = usePresenceOn(keyOf(e.start), ctx.manager);
  const source = useStationRegistry();
  const registry = source.item || emptyRegistry;
  const live = currentStaffingEvent(e);
  const stations = stationsOf(e, staffing.items, live ? registry : undefined);
  const stats = staffingStats(stations,presence,ctx.team.map((p) => p.uid));
  const [edit,setEdit] = useState<Edit | null>(null);
  const close = useCallback(() => setEdit(null), []);
  const discovery = useLegacyStations(ctx.manager && !!edit, e.id);
  const known = catalogStations(registry, [...discovery.rows, ...staffing.items.map((s) => ({id:s.id,name:s.station}))]);
  const choices = known.filter((s) => stationWritable(registry,s.id)).map((s) =>
    stations.find((row) => row.id===s.id) || {id:s.id, station:s.name, people:[], needed:1});
  const send = () => {
    const lines = stations.map((s) => s.station + ': ' + s.people.map((p) => p.name + ' ' + shiftText(p)).join(', '));
    go('/manage/broadcasts/new?audience=crew&event=' + encodeURIComponent(e.id) + '&text=' + encodeURIComponent((e.title + '\n' + lines.join('\n')).slice(0,200)));
  };
  return <AppScreen variant="detail" bar={ctx.manager && <BottomBar><Button grow size="bar" icon="megaphone" onClick={send}>לשלוח לצוות את השיבוץ</Button></BottomBar>}>
    <TopBar back={backTo(e.title,(ctx.manager ? '/manage/events/' : '/farm/events/') + e.id)} />
    <PageTitle>צוות</PageTitle>
    <StatRow><StatTile value={stats.assigned} label="שיבוצים" /><StatTile value={stats.missing} label="תחנות שחסר בהן צוות" /></StatRow>
    {ctx.manager && <div className="events-btnrow">
      {live && <Button variant="outline" icon="plus" disabled={source.loading} onClick={() => setEdit({station:choices[0] || {id:'',station:'',people:[],needed:1}})}>הוסף משובץ</Button>}
      <Button variant="outline" onClick={() => go('/manage/work-stations?event=' + encodeURIComponent(e.id))}>ניהול תחנות עבודה</Button>
    </div>}
    {stations.map((s) => <ListCard key={s.id} title={s.station} count={s.people.length}>
      {s.people.map((p) => <Row key={assignmentKey(p)} title={p.name} meta={shiftText(p) || 'השעות טרם נקבעו'} onClick={ctx.manager && live && stationWritable(registry,s.id) ? () => setEdit({station:s,person:p}) : undefined} />)}
      {stationMissing(s) && <Row title="חסר שיבוץ" tags={<Tag tone="waiting">חסר</Tag>} />}
    </ListCard>)}
    {edit && ctx.manager && <AssignmentForm ctx={ctx} event={e} edit={edit} stations={choices} close={close} />}
  </AppScreen>;
}
const fieldTime = (v:string) => { const p = localOf(v); return p.date + 'T' + p.time.padStart(5,'0'); };
const toIso = (v:string) => { const [d,t] = v.split('T'); return d && t ? isoFromLocal(d,t) : ''; };
function AssignmentForm({ctx,event:e,edit,stations,close}:{ctx:V2Ctx;event:FarmEvent;edit:Edit;stations:Station[];close:()=>void}) {
  const p = edit.person;
  const [addingStation,setAddingStation] = useState(false);
  const [added,setAdded] = useState<WorkStation | null>(null);
  const closeNew = useCallback(() => setAddingStation(false),[]);
  const choices = added && !stations.some((s)=>s.id===added.id) ? [...stations,{id:added.id,station:added.name,people:[],needed:1}] : stations;
  const [stationId,setStation] = useState(edit.station.id), [uid,setUid] = useState(p?.uid || '');
  const [role,setRole] = useState(p?.role || '');
  const [a,b] = (p?.hours || '').split(/\s*[-–]\s*/);
  const [start,setStart] = useState(p?.startsAt ? fieldTime(p.startsAt) : a ? keyOf(e.start) + 'T' + a.padStart(5,'0') : fieldTime(e.start));
  const [end,setEnd] = useState(p?.endsAt ? fieldTime(p.endsAt) : b ? keyOf(e.end || e.start) + 'T' + b.padStart(5,'0') : e.end ? fieldTime(e.end) : '');
  const [busy,setBusy] = useState(false);
  const run = useRun();
  const station = choices.find((s) => s.id === stationId);
  const team = ctx.team.filter((t) => t.status === 'active' && (t.uid === p?.uid || !station?.people.some((a) => a.uid === t.uid)));
  const startsAt = toIso(start), endsAt = toIso(end);
  const save = async () => {
    const member = team.find((m) => m.uid === uid); if (!station || !member || !role.trim() || !(endsAt > startsAt) || !startsAt || busy) return;
    setBusy(true);
    const ok = await run(async () => { await saveEventAssignment(ctx.actor,e,station,{uid,...(p?.assignmentId ? {assignmentId:p.assignmentId}:{}),name:member.displayName,role:role.trim(),startsAt,endsAt,hours:hhmm(startsAt)+'-'+hhmm(endsAt)}, p ? edit.station : undefined); return true; });
    setBusy(false); if (ok) close();
  };
  return <Sheet open onClose={close} title={p ? 'עריכת שיבוץ' : 'הוסף משובץ'}><div className="events-sheet">
    <StationPicker label="תחנה" value={stationId} stations={choices.map(s => ({ id: s.id, name: s.station }))}
      select={setStation} create={() => setAddingStation(true)} />
    <label className="k-field"><span className="k-field__label">איש צוות</span><select className="k-input" value={uid} disabled={!!p} onChange={(e) => setUid(e.target.value)}><option value="">בחירת אדם</option>{team.map((t) => <option key={t.uid} value={t.uid}>{t.displayName}</option>)}</select></label>
    <Field label="תפקיד בתחנה" value={role} maxLength={80} onChange={(e) => setRole(e.target.value)} />
    <Field label="הגעה" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
    <Field label="עד" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} error={endsAt && endsAt <= startsAt ? 'הסיום צריך להיות אחרי ההגעה' : undefined} />
    <Button size="bar" disabled={busy || !stationId || !uid || !role.trim() || !startsAt || endsAt <= startsAt} onClick={save}>שמירת השיבוץ</Button>
    {p && <Button variant="danger" disabled={busy} onClick={async () => { const ok = await run(async () => { await removeFromStation(ctx.actor,e,edit.station,p); return true; }); if (ok) close(); }}>הסרה מהשיבוץ</Button>}
    {addingStation && <StationNameForm known={choices.map((s)=>({id:s.id,name:s.station}))} close={closeNew} saved={(station)=>{setAdded(station);setStation(station.id);closeNew();}} />}
  </div></Sheet>;
}
