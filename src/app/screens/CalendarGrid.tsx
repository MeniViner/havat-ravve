import { useLayoutEffect, useMemo, useRef, type CSSProperties } from 'react';
import type { CalendarItem, Profile } from '../types';
import { A, DAY_SHORT, Sec, firstName, fmtDayLong, fmtWeekday } from '../ui';
import '../calendar.css';

export type CalendarView = 'month' | 'week' | 'day';
type CalendarPerson = Pick<Profile, 'uid' | 'displayName' | 'role'>;
type CalendarGridProps = {
  view: CalendarView;
  selectedDate: string;
  today: string;
  items: CalendarItem[];
  team: CalendarPerson[];
  onSelectDate: (date: string) => void;
  itemHref: (item: CalendarItem) => string | undefined;
};

const utcDate = (day: string) => new Date(day + 'T12:00:00Z');
const isoDay = (date: Date) => date.toISOString().slice(0, 10);
export function shiftCalendarDay(day: string, amount: number) {
  const date = utcDate(day);
  date.setUTCDate(date.getUTCDate() + amount);
  return isoDay(date);
}

export function calendarRange(view: CalendarView, day: string) {
  if (view === 'day') return { from: day, to: day };
  const date = utcDate(day);
  if (view === 'week') {
    const from = shiftCalendarDay(day, -date.getUTCDay());
    return { from, to: shiftCalendarDay(from, 6) };
  }
  date.setUTCDate(1);
  const from = isoDay(date);
  date.setUTCMonth(date.getUTCMonth() + 1, 0);
  return { from, to: isoDay(date) };
}

function rangeDays({ from, to }: ReturnType<typeof calendarRange>) {
  const days: string[] = [];
  for (let day = from; day <= to; day = shiftCalendarDay(day, 1)) {
    days.push(day);
    if (day === to) break;
  }
  return days;
}

function itemsByDay(items: CalendarItem[]) {
  const groups = new Map<string, CalendarItem[]>();
  for (const item of items) {
    const existing = groups.get(item.date);
    if (existing) existing.push(item);
    else groups.set(item.date, [item]);
  }
  return groups;
}

const isPresence = (item: CalendarItem) =>
  item.kind === 'presence' || (item.kind === 'manual' && !!item.ownerName && item.title.trim() === `${firstName(item.ownerName)} בחווה`);

export function calendarItemColor(item: CalendarItem) {
  if (item.kind === 'event' || item.kind === 'visit') return 'var(--ochre)';
  let hue = 2166136261;
  for (const letter of String(item.ownerUid || item.ownerName || '')) hue = Math.imul(hue ^ letter.codePointAt(0)!, 16777619);
  return `hsl(${(hue >>> 0) % 360} 46% 34%)`;
}

function PresenceDots({ items, team, limit }: { items: CalendarItem[]; team: CalendarPerson[]; limit: number }) {
  const attendees = new Map<string, { id: string; name: string; color: string; outline: boolean }>();
  for (const item of items) {
    if (!isPresence(item) || !item.ownerUid || attendees.has(item.ownerUid)) continue;
    const member = team.find((person) => person.uid === item.ownerUid);
    attendees.set(item.ownerUid, {
      id: item.ownerUid, name: member?.displayName || item.ownerName,
      color: calendarItemColor(item), outline: member?.role === 'staff',
    });
  }
  if (!attendees.size) return null;

  const people = [...attendees.values()].sort((a, b) => a.name.localeCompare(b.name, 'he'));
  const lead = people.find((person) => !person.outline);
  const volunteer = people.find((person) => person.outline);
  const visible = [lead, volunteer, ...people.filter((person) => person !== lead && person !== volunteer)]
    .filter((person) => person !== undefined).slice(0, limit);
  const excess = attendees.size - visible.length;
  const description = people.map((person) => person.name).join(', ');
  return (
    <span className="calendar-dots" role="img" aria-label={`בחווה: ${description}`} title={description}>
      {visible.map((person) => (
        <span key={person.id} className={'calendar-dot' + (person.outline ? ' outline' : '')}
          style={{ color: person.color }} title={person.name} aria-hidden="true" />
      ))}
      {excess > 0 && <span className="calendar-dot-more" dir="ltr" aria-hidden="true">+{excess}</span>}
    </span>
  );
}

export function PresenceLegend() {
  return (
    <div className="calendar-legend" role="group" aria-label="מקרא נוכחות">
      <span><span className="calendar-dot" aria-hidden="true" /> בעלים ומנהלים</span>
      <span><span className="calendar-dot outline" aria-hidden="true" /> מתנדבים</span>
    </div>
  );
}

export function WeekPresenceStrip({ today, items, team }: { today: string; items: CalendarItem[]; team: CalendarPerson[] }) {
  const groups = useMemo(() => itemsByDay(items), [items]);
  const days = rangeDays(calendarRange('week', today));
  return (
    <section className="calendar-presence-strip" aria-label="מי בחווה">
      <Sec title="מי בחווה" link="יומן" linkTo="/calendar" />
      <div className="calendar-presence-days">
        {days.map((day) => (
          <A key={day} to={`/calendar/day/${day}`} aria-current={day === today ? 'date' : undefined}>
            <span className="calendar-presence-date">{DAY_SHORT[utcDate(day).getUTCDay()]} {Number(day.slice(-2))}</span>
            <PresenceDots items={groups.get(day) || []} team={team} limit={2} />
          </A>
        ))}
      </div>
    </section>
  );
}

function CalendarAppointment({ item, href, style, layout }: { item: CalendarItem; href?: string; style?: CSSProperties; layout?: 'compact' | 'marker' }) {
  const color = { '--calendar-entry-color': calendarItemColor(item), ...style } as CSSProperties;
  const className = `calendar-appointment calendar-kind-${item.kind}${layout ? ' calendar-appointment-' + layout : ''}`;
  const label = item.time ? `${item.title} · ${item.time}` : item.title;
  const body = layout === 'marker' ? null : <>
    <span className="calendar-entry-title">{item.title}</span>
    {item.time && <span className="calendar-entry-time" dir="auto">{item.time}</span>}
  </>;
  if (href) return <A to={href} className={className} title={label} style={color}>{body}</A>;
  return <div className={className} title={label} style={color}>{body}</div>;
}

type DayGridProps = CalendarGridProps & { dates: string[]; groups: Map<string, CalendarItem[]> };

function MonthGrid({ dates, groups, today, selectedDate, team, onSelectDate, itemHref }: DayGridProps) {
  const leading = utcDate(dates[0]).getUTCDay();
  return (
    <div className="calendar-month" role="group" aria-label="תצוגת חודש">
      {DAY_SHORT.map((day) => <div key={day} className="calendar-month-weekday">{day}</div>)}
      {Array.from({ length: leading }, (_, index) => <span key={index} aria-hidden="true" />)}
      {dates.map((day) => {
        const entries = groups.get(day) || [];
        return (
          <div key={day} className="calendar-month-day" data-selected={day === selectedDate}>
            <button type="button" aria-label={fmtDayLong(day)} aria-current={day === today ? 'date' : undefined}
              aria-pressed={day === selectedDate} onClick={() => onSelectDate(day)}>
              <span className="calendar-date-number">{Number(day.slice(-2))}</span>
              <PresenceDots items={entries} team={team} limit={3} />
              {entries.some((item) => !isPresence(item)) && <span className="calendar-month-has-items" aria-label="פריטים ביומן" />}
            </button>
            <div className="calendar-month-entries">
              {entries.slice(0, 3).map((item) => <CalendarAppointment key={item.id} item={item} href={itemHref(item)} />)}
              {entries.length > 3 && <div className="calendar-month-extra">+{entries.length - 3}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const HOUR_HEIGHT = 54;
const DAY_MINUTES = 24 * 60;
const SHORT_MARKER_MINUTES = 30;
// Match the compact line height and the stacked text with padding in calendar.css.
const ONE_LINE_HEIGHT = 20;
const TWO_LINE_HEIGHT = 39;
type Scheduled = { item: CalendarItem; start: number; end: number };
type Positioned = Scheduled & { lane: number; columns: number };

function scheduleDay(entries: CalendarItem[]) {
  const allDay: CalendarItem[] = [];
  const timed: Scheduled[] = [];
  for (const item of entries) {
    const matches = /^(\d{1,2}):([0-5]\d)(?:[–-](\d{1,2}):([0-5]\d))?$/.exec(item.time?.trim() || '');
    if (!matches || Number(matches[1]) >= 24 || (matches[3] && Number(matches[3]) >= 24)) {
      allDay.push(item);
      continue;
    }
    const start = Number(matches[1]) * 60 + Number(matches[2]);
    const stop = matches[3] ? Number(matches[3]) * 60 + Number(matches[4]) : start;
    const end = stop > start ? stop : stop < start ? DAY_MINUTES : Math.min(start + SHORT_MARKER_MINUTES, DAY_MINUTES);
    timed.push({ item, start, end });
  }
  return { allDay, timed: positionEntries(timed) };
}

function positionEntries(entries: Scheduled[]) {
  const positioned: Positioned[] = [];
  let lanes: number[] = [];
  let group: (Scheduled & { lane: number })[] = [];
  let groupEnd = 0;
  const finishGroup = () => {
    const columns = lanes.length;
    for (const entry of group) positioned.push({ ...entry, columns });
    lanes = [];
    group = [];
    groupEnd = 0;
  };
  for (const entry of entries.sort((a, b) => a.start - b.start || b.end - a.end || a.item.id.localeCompare(b.item.id))) {
    if (entry.start >= groupEnd) finishGroup();
    const available = lanes.findIndex((end) => end <= entry.start);
    const lane = available >= 0 ? available : lanes.length;
    lanes[lane] = entry.end;
    group.push({ ...entry, lane });
    groupEnd = Math.max(groupEnd, entry.end);
  }
  finishGroup();
  return positioned;
}

function TimeGrid({ view, dates, groups, today, selectedDate, team, onSelectDate, itemHref }: DayGridProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const firstDay = dates[0];
  useLayoutEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 7 * HOUR_HEIGHT;
  }, [view, firstDay]);
  const days = dates.map((day) => ({ date: day, ...scheduleDay(groups.get(day) || []) }));
  const style = { '--calendar-days': dates.length, '--calendar-hour-height': HOUR_HEIGHT + 'px' } as CSSProperties;
  return (
    <div ref={scroller} className={'calendar-time-scroll ' + view} role="region"
      aria-label={view === 'week' ? 'תצוגת שבוע לפי שעה' : 'תצוגת יום לפי שעה'} tabIndex={0}>
      <div className="calendar-time-grid" style={style}>
        <div className="calendar-time-head calendar-time-gutter" />
        {dates.map((day) => (
          <button type="button" key={day} className="calendar-time-head" aria-label={fmtDayLong(day)}
            aria-current={day === today ? 'date' : undefined} aria-pressed={day === selectedDate} onClick={() => onSelectDate(day)}>
            <span>{fmtWeekday(day)} {Number(day.slice(-2))}</span>
            <PresenceDots items={groups.get(day) || []} team={team} limit={3} />
          </button>
        ))}
        <div className="calendar-daylong calendar-time-gutter">כל היום</div>
        {days.map(({ date, allDay }) => <div key={date} className="calendar-daylong">
          {allDay.map((item) => <CalendarAppointment key={item.id} item={item} href={itemHref(item)} />)}
        </div>)}
        <div className="calendar-time-hours calendar-time-gutter" aria-hidden="true">
          {Array.from({ length: 24 }, (_, hour) => <span key={hour} dir="ltr">{String(hour).padStart(2, '0')}:00</span>)}
        </div>
        {days.map(({ date, timed }) => (
          <div key={date} className="calendar-time-column" aria-label={fmtDayLong(date)}>
            {timed.map(({ item, start, end, lane, columns }) => {
              const height = (end - start) / 60 * HOUR_HEIGHT;
              const layout = height < ONE_LINE_HEIGHT ? 'marker' : height < TWO_LINE_HEIGHT ? 'compact' : undefined;
              return <CalendarAppointment key={item.id} item={item} href={itemHref(item)} layout={layout}
                style={{
                  insetBlockStart: start / 60 * HOUR_HEIGHT,
                  blockSize: height,
                  insetInlineStart: `calc(${lane * 100 / columns}% + 2px)`,
                  inlineSize: `calc(${100 / columns}% - 4px)`,
                }} />;
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export function CalendarGrid(props: CalendarGridProps) {
  const groups = useMemo(() => itemsByDay(props.items), [props.items]);
  const dates = rangeDays(calendarRange(props.view, props.selectedDate));
  return props.view === 'month' ? <MonthGrid {...props} dates={dates} groups={groups} /> : <TimeGrid {...props} dates={dates} groups={groups} />;
}
