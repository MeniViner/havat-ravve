import { useState, type FormEvent } from 'react';
import type { TeamCtx } from '../ctx';
import type { CalendarItem, CalendarKind } from '../types';
import { deleteCalendarItem, saveCalendarItem, useCalendar, useCalendarItem, type CalendarDraft } from '../data';
import { deferDelete, isHidden, useHiddenVersion } from '../kit';
import { navigate, param } from '../router';
import { useToday } from '../store';
import { Btn, Chips, Empty, Field, Input, Loading, Row, Sec, Select, Top, firstName, fmtDateShort, fmtDayLong, fmtMonthYear, useToast } from '../ui';
import { CalendarGrid, PresenceLegend, calendarItemColor, calendarRange, shiftCalendarDay, type CalendarView } from './CalendarGrid';

type EditableItem = CalendarItem & { kind: CalendarDraft['kind'] };
const kindLabels: Record<CalendarKind, string> = {
  presence: 'נוכחות בחווה',
  meeting: 'פגישת צוות',
  planning: 'הכנות לפסטיבל',
  manual: 'פריט אחר',
  visit: 'ביקור מאושר',
  event: 'אירוע',
};
const editableKinds: CalendarDraft['kind'][] = ['presence', 'meeting', 'planning', 'manual'];
const views: { value: CalendarView; label: string }[] = [
  { value: 'month', label: 'חודש' }, { value: 'week', label: 'שבוע' }, { value: 'day', label: 'יום' },
];
const calendarView = (input: string): CalendarView => input === 'week' || input === 'day' ? input : 'month';
const calendarPath = (view: CalendarView, date: string) => `/calendar/${view}/${date}`;
const dateAtNoon = (date: string) => `${date}T12:00:00Z`;
function validDate(input: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return '';
  const date = new Date(dateAtNoon(input));
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === input ? input : '';
}
function canEdit(item: CalendarItem, ctx: TeamCtx): item is EditableItem {
  if (item.kind === 'visit' || item.kind === 'event') return false;
  return ctx.manager || (item.kind === 'presence' && item.ownerUid === ctx.actor.uid);
}

export function CalendarScreen({ ctx, date = '', view: initialView = '' }: { ctx: TeamCtx; date?: string; view?: string }) {
  const today = useToday();
  useHiddenVersion();
  const view = calendarView(initialView);
  const selectedDate = validDate(date) || today;
  const { from, to } = calendarRange(view, selectedDate);
  const calendar = useCalendar(true, from, to);
  const items = calendar.items.filter((item) => item.date >= from && item.date <= to && !isHidden(item.id));
  const dayItems = items.filter((item) => item.date === selectedDate).sort((a, b) => a.time.localeCompare(b.time));
  const select = (nextView: CalendarView, nextDate: string) => navigate(calendarPath(nextView, nextDate), true, true);
  const newPath = `/calendar/new?${new URLSearchParams({ date: selectedDate, view })}`;
  const addLabel = ctx.manager ? 'הוספה ליומן' : 'הוספת נוכחות';

  function itemHref(item: CalendarItem) {
    if (item.kind === 'event' && item.refId) {
      const base = ctx.manager ? '/manage/events' : '/events-staff';
      return `${base}/${encodeURIComponent(item.refId)}`;
    }
    if (item.kind === 'visit' && item.refId && ctx.manager) return `/manage/visits/${encodeURIComponent(item.refId)}`;
    if (canEdit(item, ctx)) {
      const back = new URLSearchParams({ date: selectedDate, view });
      return `/calendar/${encodeURIComponent(item.id)}/edit?${back}`;
    }
  }

  function shift(direction: -1 | 1) {
    if (view === 'month') {
      const next = shiftCalendarDay(direction < 0 ? from : to, direction);
      select(view, calendarRange('month', next).from);
    } else {
      select(view, shiftCalendarDay(selectedDate, direction * (view === 'week' ? 7 : 1)));
    }
  }

  const period = view === 'month' ? fmtMonthYear(dateAtNoon(selectedDate))
    : view === 'week' ? `${fmtDateShort(dateAtNoon(from))} – ${fmtDateShort(dateAtNoon(to))}`
      : fmtDayLong(dateAtNoon(selectedDate));

  return (
    <section aria-label="יומן החווה">
      <Top title="מי בחווה" end={<Btn icon="plus" to={newPath}>{addLabel}</Btn>} />
      <div className="calendar-toolbar" style={{ justifyContent: 'space-between' }}>
        <Chips value={view} onChange={(next) => select(next, selectedDate)} options={views} />
        <Btn kind="quiet" onClick={() => select(view, today)}>היום</Btn>
      </div>
      <div className="calendar-toolbar" style={{ justifyContent: 'space-between' }}>
        <Btn kind="quiet" icon="back" onClick={() => shift(-1)}>הקודם</Btn>
        <b aria-live="polite">{period}</b>
        <Btn kind="quiet" icon="chev" onClick={() => shift(1)}>הבא</Btn>
      </div>
      <PresenceLegend />
      {calendar.error ? <Empty title="לא הצלחנו לטעון את היומן" text={calendar.error} />
        : calendar.loading && !items.length ? <Loading />
        : <CalendarGrid view={view} selectedDate={selectedDate} today={today} items={items} team={ctx.team} onSelectDate={(day) => select(view, day)} itemHref={itemHref} />}
      {!calendar.error && !calendar.loading && <section aria-label="סדר היום">
        <Sec title={fmtDayLong(dateAtNoon(selectedDate))} n={dayItems.length || undefined} />
        {dayItems.length ? <div className="list">
          {dayItems.map((item) => {
            const href = itemHref(item);
            const by = item.kind === 'event' || item.kind === 'visit' ? '' : item.ownerName;
            return <Row key={item.id} to={href} center chev={!!href} title={item.title}
              start={<span style={{ width: 8, minHeight: 32, borderRadius: 4, background: calendarItemColor(item) }} />}
              meta={<span>{[kindLabels[item.kind], item.time, by].filter(Boolean).join(' · ')}</span>} />;
          })}
        </div> : <p className="lead">אין פריטים ביום הזה.</p>}
      </section>}
    </section>
  );
}

export function CalendarEditor({ ctx, id = '' }: { ctx: TeamCtx; id?: string }) {
  const today = useToday();
  const { item, loading, error } = useCalendarItem(id, !!id);
  const editable = item && canEdit(item, ctx) ? item : null;
  const view = calendarView(param('view'));
  const initialDate = validDate(param('date')) || validDate(item?.date ?? '') || today;
  const back = calendarPath(view, initialDate);
  if (loading) return <Loading />;
  if (id && (!editable || isHidden(id))) {
    return <><Top title="יומן החווה" backTo={back} backLabel="יומן" /><Empty title={error || 'אין לך הרשאה לערוך את הפריט'} /></>;
  }
  return <CalendarForm key={id || 'new'} ctx={ctx} initialDate={initialDate} back={back} view={view} existing={editable} />;
}

function timeInput(value: string) {
  const parts = /^(\d{1,2}):([0-5]\d)$/.exec(value);
  return parts && Number(parts[1]) < 24 ? `${parts[1].padStart(2, '0')}:${parts[2]}` : '';
}

function CalendarForm({ ctx, initialDate, back, view, existing }: { ctx: TeamCtx; initialDate: string; back: string; view: CalendarView; existing: EditableItem | null }) {
  const toast = useToast();
  const [storedFrom = '', storedTo = ''] = existing?.time.split(/[–-]/) ?? [];
  const [date, setDate] = useState(existing?.date || initialDate);
  const [kind, setKind] = useState<CalendarDraft['kind']>(existing?.kind ?? 'presence');
  const [title, setTitle] = useState(existing?.title ?? '');
  const [from, setFrom] = useState(timeInput(storedFrom));
  const [to, setTo] = useState(timeInput(storedTo));
  const [timeChanged, setTimeChanged] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ownerUid, setOwnerUid] = useState(existing?.ownerUid ?? ctx.actor.uid);
  const previousOwner = existing ? { uid: existing.ownerUid, name: existing.ownerName } : ctx.actor;
  const team = [ctx.profile, ...ctx.team.filter((person) => person.uid !== ctx.actor.uid && person.status === 'active')];
  const pickedOwner = team.find((person) => person.uid === ownerUid);
  const owner = ctx.manager && kind === 'presence' && pickedOwner
    ? { uid: pickedOwner.uid, name: pickedOwner.displayName } : previousOwner;
  const defaultTitle = kind === 'presence' ? `${firstName(owner.name)} בחווה` : '';
  const finalTitle = title.trim() || defaultTitle;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!finalTitle || !validDate(date) || saving) return;
    const time = existing && !timeChanged ? existing.time : to && from ? `${from}–${to}` : from;
    setSaving(true);
    try {
      await saveCalendarItem(owner, { title: finalTitle, date, time, kind }, existing ?? undefined);
      navigate(calendarPath(view, date), true);
    } catch {
      toast({ text: 'לא הצלחנו לשמור את הפריט', kind: 'error' });
    } finally {
      setSaving(false);
    }
  }

  function remove() {
    if (!existing) return;
    const undo = deferDelete(existing.id, () => {
      deleteCalendarItem(existing.id).catch(() => toast({ text: 'לא הצלחנו להסיר את הפריט', kind: 'error' }));
    });
    toast({ text: 'הפריט הוסר מהיומן', action: { label: 'ביטול', onClick: undo } }, 6000);
    navigate(back, true);
  }

  return (
    <>
      <Top title={existing ? 'עריכת פריט ביומן' : ctx.manager ? 'פריט ביומן' : 'נוכחות בחווה'} backTo={back} backLabel="יומן" />
      <form onSubmit={save}>
        {ctx.manager && <Field label="סוג פריט"><Select aria-label="סוג פריט" value={kind} onChange={(event) => setKind(event.target.value as CalendarDraft['kind'])}>
          {editableKinds.map((value) => <option key={value} value={value}>{value === 'presence' ? 'אני בחווה' : kindLabels[value]}</option>)}
        </Select></Field>}
        {ctx.manager && kind === 'presence' && <Field label="מי בחווה"><Select aria-label="מי בחווה" value={ownerUid} onChange={(event) => setOwnerUid(event.target.value)}>
          {!pickedOwner && <option value={previousOwner.uid}>{previousOwner.name}</option>}
          {team.map((person) => <option key={person.uid} value={person.uid}>{person.displayName}</option>)}
        </Select></Field>}
        <Field label="כותרת"><Input value={title} maxLength={200} placeholder={defaultTitle || kindLabels[kind]} onChange={(event) => setTitle(event.target.value)} /></Field>
        <Field label="תאריך"><Input type="date" dir="ltr" value={date} required onChange={(event) => setDate(event.target.value)} /></Field>
        <div className="cols">
          <Field label="משעה"><Input type="time" dir="ltr" value={from} onChange={(event) => {
            setTimeChanged(true);
            setFrom(event.target.value);
            if (!event.target.value) setTo('');
          }} /></Field>
          <Field label="עד שעה"><Input type="time" dir="ltr" value={to} disabled={!from} onChange={(event) => {
            setTimeChanged(true);
            setTo(event.target.value);
          }} /></Field>
        </div>
        {existing?.time && !timeChanged && !from && <div className="inline pad">
          <span>שעה שמורה: {existing.time}</span>
          <Btn kind="quiet" onClick={() => setTimeChanged(true)}>כל היום</Btn>
        </div>}
        <div className="actions sticky">
          <Btn type="submit" size="big" disabled={!finalTitle || !validDate(date) || saving}>שמירה ליומן</Btn>
          {existing && <Btn kind="danger" disabled={saving} onClick={remove}>מחיקת פריט</Btn>}
        </div>
      </form>
    </>
  );
}
