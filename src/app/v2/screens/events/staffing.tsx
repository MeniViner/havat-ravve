// V4 who works at the event: stations with people and hours, the station still missing someone, and who is free that day.
// Assigning someone sends them a personal notification; the bottom button opens the crew broadcast (B1) with the schedule.
import { useMemo, useState } from 'react';
import type { ScreenProps, V2Ctx } from '../../ctx';
import { AppScreen, go } from '../../core';
import { TopBar, PageTitle, StatRow, StatTile, Tag, Button, BottomBar, Sheet, Field, FieldRow, Avatar, RadioList, RadioRow } from '../../kit';
import { useEvent } from '../../../data';
import { dayName, ddmm, hhmm, keyOf } from '../../format';
import { useStaffing, usePresenceOn, assignToStation, updateStationPerson, removeFromStation } from '../../data/events';
import { stationsOf, staffingStats, stationMissing, hoursText, normTime, type Station } from './logic';
import { Loading, Missing, backTo, useRun } from './shared';
import type { FarmEvent, Staffing } from '../../../types';

export function StaffingScreen({ ctx, params }: ScreenProps) {
  const { item: e, loading } = useEvent(params.id, ctx.manager);
  if (loading && !e) return <Loading backLabel="האירוע" parent={`/manage/events/${params.id}`} />;
  if (!e) return <Missing backLabel="אירועים" parent="/manage/events" />;
  return <StaffingBody ctx={ctx} e={e} />;
}

type Person = Staffing['people'][number];
const splitHours = (h: string) => { const [a = '', b = ''] = h.split(/\s*[-–]\s*/); return [a, b]; };

function StaffingBody({ ctx, e }: { ctx: V2Ctx; e: FarmEvent }) {
  const saved = useStaffing(e.id, ctx.manager);
  const presence = usePresenceOn(keyOf(e.start), ctx.manager);
  const stations = stationsOf(e, saved.items);
  const teamUids = useMemo(() => ctx.team.map((p) => p.uid), [ctx.team]);
  const st = staffingStats(stations, presence, teamUids);
  const [assign, setAssign] = useState<Station | null>(null);
  const [person, setPerson] = useState<{ s: Station; p: Person } | null>(null);

  const sendText = () => {
    const lines = stations.map((s) => `${s.station}: ${s.people.length ? s.people.map((p) => `${p.name}${p.hours ? ' ' + hoursText(p.hours) : ''}`).join(', ') : 'חסר'}`);
    return `השיבוץ ל${e.title}, ${dayName(e.start)} ${ddmm(e.start)}\n${lines.join('\n')}`.slice(0, 200);
  };
  const bar = (
    <BottomBar>
      <Button size="bar" grow icon="megaphone" onClick={() => go(`/manage/broadcasts/new?audience=crew&event=${e.id}&text=${encodeURIComponent(sendText())}`)}>לשלוח לצוות את השיבוץ</Button>
    </BottomBar>
  );
  return (
    <AppScreen variant="detail" gap={10} bar={bar}>
      <TopBar back={backTo(e.title, `/manage/events/${e.id}`)} />
      <PageTitle>מי עובד באירוע</PageTitle>
      <StatRow>
        <StatTile value={st.assigned} label="משובצים" />
        <StatTile value={st.missing} label={st.missing === 1 ? 'עמדה חסרה' : 'עמדות חסרות'} />
        <StatTile value={st.available} label="פנויים באותו יום" />
      </StatRow>
      {stations.map((s) => {
        const missing = stationMissing(s);
        return (
          <section key={s.id} className="k-card k-card--list" aria-label={s.station}>
            <div className="k-cardhead">
              <h2 className="k-cardhead__title events-stationtitle">{s.station}{missing && <Tag tone="urgent">חסר</Tag>}</h2>
              <span className="k-cardhead__count">{s.people.length}</span>
            </div>
            <ul className="k-list">
              {s.people.map((p) => (
                <li key={p.uid} className="events-personrow">
                  <button type="button" className="events-personrow__hit" onClick={() => setPerson({ s, p })}>
                    <Avatar name={p.name} size={32} />
                    <span className="k-row__body">
                      <span className="k-row__title">{p.name}</span>
                      {p.hours && <span className="k-row__meta"><span dir="ltr">{hoursText(p.hours)}</span></span>}
                    </span>
                  </button>
                </li>
              ))}
              {missing && (
                <li className="events-addrow">
                  <Button variant="dashed" block icon="plus" onClick={() => setAssign(s)}>לשבץ מישהו ל{s.station}</Button>
                </li>
              )}
            </ul>
          </section>
        );
      })}
      <AssignSheet ctx={ctx} e={e} station={assign} stations={stations} freeUids={st.freeUids} presence={presence} onClose={() => setAssign(null)} />
      <PersonSheet ctx={ctx} e={e} sel={person} onClose={() => setPerson(null)} onMore={(s) => { setPerson(null); setAssign(s); }} />
    </AppScreen>
  );
}

function AssignSheet({ ctx, e, station, stations, freeUids, presence, onClose }: {
  ctx: V2Ctx; e: FarmEvent; station: Station | null; stations: Station[]; freeUids: string[]; presence: import('../../../types').CalendarItem[]; onClose: () => void;
}) {
  const run = useRun();
  const [uid, setUid] = useState('');
  const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const defFrom = hhmm(new Date(Date.parse(e.start) - 30 * 60_000)), defTo = hhmm(e.end);
  const candidates = useMemo(() => {
    if (!station) return [];
    const inStation = new Set(station.people.map((p) => p.uid));
    return ctx.team.filter((p) => p.status === 'active' && !inStation.has(p.uid))
      .sort((a, b) => Number(freeUids.includes(b.uid)) - Number(freeUids.includes(a.uid)) || a.displayName.localeCompare(b.displayName));
  }, [ctx.team, station, freeUids]);
  if (!station) return null;
  const metaOf = (u: string) => {
    const where = stations.find((s) => s.people.some((p) => p.uid === u));
    if (where) return `משובץ ב${where.station}`;
    const pr = presence.find((c) => c.ownerUid === u);
    return pr ? `בחווה באותו יום${pr.time ? ' · ' + pr.time : ''}` : undefined;
  };
  const save = async () => {
    const p = ctx.team.find((x) => x.uid === uid); if (!p) return;
    const a = normTime(from || defFrom), b = normTime(to || defTo);
    const ok = await run(async () => { await assignToStation(ctx.actor, e, station, { uid: p.uid, name: p.displayName, hours: a && b ? `${a}-${b}` : '' }); return true; });
    if (ok) { setUid(''); setFrom(''); setTo(''); onClose(); }
  };
  return (
    <Sheet open onClose={onClose} title={`לשבץ ל${station.station}`}>
      <div className="events-sheet">
        <RadioList label="מי">
          {candidates.map((p) => <RadioRow key={p.uid} checked={uid === p.uid} onSelect={() => setUid(p.uid)} title={p.displayName} meta={metaOf(p.uid)} leading={<Avatar name={p.displayName} size={32} />} />)}
        </RadioList>
        <FieldRow>
          <Field grow label="משעה" ltr inputMode="numeric" value={from} placeholder={defFrom} onChange={(ev) => setFrom(ev.target.value)} />
          <Field grow label="עד שעה" ltr inputMode="numeric" value={to} placeholder={defTo} onChange={(ev) => setTo(ev.target.value)} />
        </FieldRow>
        <Button size="bar" block disabled={!uid} onClick={save}>שיבוץ</Button>
      </div>
    </Sheet>
  );
}

function PersonSheet({ ctx, e, sel, onClose, onMore }: { ctx: V2Ctx; e: FarmEvent; sel: { s: Station; p: Person } | null; onClose: () => void; onMore: (s: Station) => void }) {
  const run = useRun();
  const [h, setH] = useState<[string, string] | null>(null);
  if (!sel) return null;
  const [a, b] = h || splitHours(sel.p.hours || '');
  const close = () => { setH(null); onClose(); };
  const save = async () => {
    const x = normTime(a), y = normTime(b);
    const ok = await run(async () => { await updateStationPerson(ctx.actor, e, sel.s, sel.p.uid, x && y ? `${x}-${y}` : ''); return true; });
    if (ok) close();
  };
  const remove = async () => {
    const ok = await run(async () => { await removeFromStation(ctx.actor, e, sel.s, sel.p); return true; });
    if (ok) close();
  };
  return (
    <Sheet open onClose={close} title={sel.p.name} aside={sel.s.station}>
      <div className="events-sheet">
        <FieldRow>
          <Field grow label="משעה" ltr inputMode="numeric" value={a} onChange={(ev) => setH([ev.target.value, b])} />
          <Field grow label="עד שעה" ltr inputMode="numeric" value={b} onChange={(ev) => setH([a, ev.target.value])} />
        </FieldRow>
        <div className="events-sheet__actions">
          <Button size="tall" block onClick={save}>שמירה</Button>
          <Button variant="outline" size="tall" block icon="plus" onClick={() => onMore(sel.s)}>לשבץ עוד מישהו ל{sel.s.station}</Button>
          <Button variant="danger" size="tall" block onClick={remove}>להוריד מהשיבוץ</Button>
        </div>
      </div>
    </Sheet>
  );
}
