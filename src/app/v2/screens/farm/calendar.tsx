// F2-Month and F3-Day (plus the week view the segmented control offers): presence marks, event and visit dots, the day's items.
import { useMemo } from 'react';
import { AppScreen, go } from '../../core';
import { navigate, useParam } from '../../../router';
import { Avatar, Icon, Segmented } from '../../kit';
import { DAY_LETTERS, MONTHS, ddmm, dayName, hhmm, inDays, longDate } from '../../format';
import { now } from '../../../clock';
import type { ScreenProps, V2Ctx } from '../../ctx';
import type { Task } from '../../../types';
import { useCalendarRange, useRoutines } from '../../data/farm';
import {
  addDays, axisPct, barLabel, barSpan, barWidth, countsByDay, dayEntries, dayNum, dayPeople, firstOf, isPresence, monthEnd, monthGrid, monthStart, shiftMonth,
  weekDays, type CalItem, type Entry,
} from './logic';
import { AddPresenceButton, Arrows, TopRow, byStart, femaleOf, itemMeta, itemTime, useNowMin } from './parts';

type View = 'month' | 'week' | 'day';
const VIEWS: { value: View; label: string }[] = [{ value: 'month', label: 'חודש' }, { value: 'week', label: 'שבוע' }, { value: 'day', label: 'יום' }];
const validDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !Number.isNaN(Date.parse(s)) ? s : '';
const AXIS_TICKS = ['06', '09', '12', '15', '18'];

/** Where a calendar item opens: an event (F6), a visit (managers), an editable item (C11, managers), or nothing. */
export function itemTarget(ctx: V2Ctx, it: CalItem, date: string): string | null {
  if (it.kind === 'event' && it.refId) return `/farm/events/${encodeURIComponent(it.refId)}`;
  if (it.kind === 'visit') return ctx.manager && it.refId ? `/manage/visits/${encodeURIComponent(it.refId)}` : null;
  if (ctx.manager) return `/farm/calendar/${encodeURIComponent(it.id)}/edit?date=${date}`;
  return null;
}

/** Calendar rows: time, title, soft meta; tappable when there is somewhere to go. */
function ItemRow({ time, title, meta, href, done }: { time: string; title: string; meta: string; href: string | null; done?: boolean }) {
  const inner = (
    <>
      <span className="farm-item__time">{time}</span>
      <div className="farm-item__body"><span className="farm-item__title">{title}</span>{meta && <span className="farm-item__meta">{meta}</span>}</div>
      {done && <span className="farm-item__mark"><Icon name="check" size={20} /></span>}
    </>
  );
  return <li>{href ? <button type="button" className="farm-item" onClick={() => go(href)}>{inner}</button> : <div className="farm-item">{inner}</div>}</li>;
}

export function CalendarScreen({ ctx, params }: ScreenProps) {
  // the shell re-renders on path changes only (useRoute is the pathname); read the query directly so view/date changes show
  const qView = useParam('view') || params.view, qDate = useParam('date') || params.date;
  const view: View = qView === 'day' || qView === 'week' ? qView : 'month';
  const date = validDate(qDate) || ctx.today;
  const set = (v: View, d: string) => navigate(`/farm/calendar?view=${v}&date=${d}`, true, true);
  const header = <TopRow onBack={() => go('/farm')} end={<AddPresenceButton onClick={() => go('/farm/presence')} />} />;
  const seg = <Segmented className="farm-seg" label="תצוגה" value={view} onChange={(v) => set(v, date)} options={VIEWS} />;
  if (view === 'day') return <DayView ctx={ctx} date={date} set={set} header={header} seg={seg} />;
  if (view === 'week') return <WeekView ctx={ctx} date={date} set={set} header={header} seg={seg} />;
  return <MonthView ctx={ctx} date={date} set={set} header={header} seg={seg} />;
}
type ViewProps = { ctx: V2Ctx; date: string; set: (v: View, d: string) => void; header: React.ReactNode; seg: React.ReactNode };

// ---------- F2 month ----------
function MonthView({ ctx, date, set, header, seg }: ViewProps) {
  const from = monthStart(date), to = monthEnd(date);
  const cal = useCalendarRange(from, to, ctx.manager);
  const cells = monthGrid(date);
  const days = cells.filter(Boolean) as string[];
  const counts = useMemo(() => { const c = countsByDay(cal.items, days); return new Map(days.map((d, i) => [d, c[i]])); }, [cal.items, from]);
  const marks = useMemo(() => {
    const m = new Map<string, 'event' | 'visit'>();
    for (const it of cal.items) if (it.kind === 'event' || it.kind === 'visit') { if (m.get(it.date) !== 'event') m.set(it.date, it.kind as 'event' | 'visit'); }
    return m;
  }, [cal.items]);
  const month = Number(date.slice(5, 7));
  return (
    <AppScreen variant="root" gap={10}>
      {header}
      <div className="farm-titlerow">
        <h1 className="farm-h1">{MONTHS[month - 1]} {date.slice(0, 4)}</h1>
        <Arrows prevLabel="החודש הקודם" nextLabel="החודש הבא" prev={() => set('month', shiftMonth(date, -1))} next={() => set('month', shiftMonth(date, 1))} />
      </div>
      {seg}
      <section className="farm-card farm-month">
        <div className="farm-month__grid">
          {DAY_LETTERS.map((l) => <span key={l} className="farm-month__wd">{l}</span>)}
          {cells.map((d, i) => {
            if (!d) return <span key={`b${i}`} />;
            const n = counts.get(d) || 0;
            const mark = marks.get(d);
            return (
              <button key={d} type="button" className="farm-month__cell" aria-pressed={d === date}
                aria-label={`${dayNum(d)} ב${MONTHS[month - 1]}, ${n} בחווה${mark === 'event' ? ', אירוע' : mark === 'visit' ? ', ביקור' : ''}`}
                onClick={() => set('month', d)}>
                <span className="farm-month__top">
                  <b className={d === ctx.today ? 'farm-month__num farm-month__num--today' : 'farm-month__num'}>{dayNum(d)}</b>
                  {mark && <span className="farm-month__dot" />}
                </span>
                <span className="farm-month__bar" style={{ width: barWidth(n) }} />
              </button>
            );
          })}
        </div>
        <div className="farm-legend"><span><span className="farm-legend__bar" />כמה בחווה</span><span><span className="farm-month__dot" />ביקור או אירוע</span></div>
      </section>
      <DaySummary ctx={ctx} date={date} items={cal.items} onFull={() => set('day', date)} />
    </AppScreen>
  );
}

function DaySummary({ ctx, date, items, onFull }: { ctx: V2Ctx; date: string; items: CalItem[]; onFull: () => void }) {
  const nowMin = useNowMin();
  const people = dayPeople(items, date, ctx.today, nowMin);
  const list = items.filter((it) => it.date === date && !isPresence(it)).sort(byStart);
  return (
    <section className="farm-card" style={{ overflow: 'hidden' }}>
      <div className="farm-cardhead"><h2>{dayName(date)} {ddmm(date)}</h2><button type="button" className="farm-link" onClick={onFull}>ליום המלא</button></div>
      {people.length > 0 && (
        <div className="farm-chips">
          {people.map((e) => (
            <button key={e.uid} type="button" className="farm-chip" onClick={() => go(`/people/${e.uid}`)}>
              <Avatar name={ctx.peopleByUid.get(e.uid)?.displayName || e.name} size={28} tone={e.uid === ctx.user.uid ? 'me' : 'default'} />{firstOf(e.name)}
            </button>
          ))}
        </div>
      )}
      {list.length ? <ul className="farm-list">{list.map((it) => <ItemRow key={it.id} time={itemTime(it)} title={it.title} meta={itemMeta(ctx, it)} href={itemTarget(ctx, it, date)} />)}</ul>
        : <p className={people.length ? 'farm-empty' : 'farm-empty farm-empty--flat'}>אין פריטים ביום הזה.</p>}
    </section>
  );
}

// ---------- week (the control offers it; no artboard: built from the F2 parts) ----------
function WeekView({ ctx, date, set, header, seg }: ViewProps) {
  const days = weekDays(date);
  const cal = useCalendarRange(days[0], days[6], ctx.manager);
  const counts = countsByDay(cal.items, days);
  return (
    <AppScreen variant="root" gap={10}>
      {header}
      <div className="farm-titlerow">
        <h1 className="farm-h1">{ddmm(days[0])} – {ddmm(days[6])}</h1>
        <Arrows prevLabel="השבוע הקודם" nextLabel="השבוע הבא" prev={() => set('week', addDays(date, -7))} next={() => set('week', addDays(date, 7))} />
      </div>
      {seg}
      <section className="farm-card" style={{ overflow: 'hidden' }}>
        {days.map((d, i) => {
          const names = dayEntries(cal.items, d, -1).map((e) => firstOf(e.name));
          const n = cal.items.filter((it) => it.date === d && !isPresence(it)).length;
          return (
            <button key={d} type="button" className={d === ctx.today ? 'farm-weekday farm-weekday--today' : 'farm-weekday'} onClick={() => set('day', d)}>
              <span className="farm-item__time">{DAY_LETTERS[i]} {dayNum(d)}</span>
              <div className="farm-item__body">
                <span className="farm-item__title">{counts[i] ? `${counts[i]} בחווה` : 'אין רשומים'}{n ? ` · ${n} ביומן` : ''}</span>
                {names.length > 0 && <span className="farm-item__meta">{names.join(', ')}</span>}
              </div>
              <span className="k-row__chev" aria-hidden="true"><Icon name="chevron" size={20} /></span>
            </button>
          );
        })}
      </section>
    </AppScreen>
  );
}

// ---------- F3 day ----------
function DayView({ ctx, date, set, header, seg }: ViewProps) {
  const nowMin = useNowMin();
  const isToday = date === ctx.today;
  const cal = useCalendarRange(date, date, ctx.manager);
  const routines = useRoutines(date, ctx.manager);
  const people = dayPeople(cal.items, date, ctx.today, nowMin);
  const rows = useMemo(() => buildDayRows(ctx, date, cal.items, routines.items), [ctx, date, cal.items, routines.items]);
  const rel = inDays(date);
  const nowPct = axisPct(hhmm(now()));
  return (
    <AppScreen variant="root">
      {header}
      <div className="farm-titlerow">
        <div className="farm-titlerow__titles"><span className="farm-overline">{rel}</span><h1 className="farm-h1 farm-h1--day">{dayName(date)}, {longDate(date)}</h1></div>
        <Arrows prevLabel="היום הקודם" nextLabel="היום הבא" prev={() => set('day', addDays(date, -1))} next={() => set('day', addDays(date, 1))} />
      </div>
      {seg}
      <section className="farm-card farm-axiscard">
        <div className="farm-cardhead" style={{ padding: 0 }}><h2>מי בחווה · {people.length}</h2>{isToday && <span className="farm-cardhead__aside">עכשיו {hhmm(now())}</span>}</div>
        {people.length ? (
          <div className="farm-axis" role="img" aria-label={`ציר הנוכחות, משש בבוקר עד שמונה בערב${isToday ? `. עכשיו ${hhmm(now())}` : ''}`}>
            <div className="farm-axis__grid">
              {AXIS_TICKS.map((t) => { const p = axisPct(`${t}:00`); return <span key={t}><span className="farm-axis__tick" style={{ insetInlineStart: `${p}%` }}>{t}</span><span className="farm-axis__line" style={{ insetInlineStart: `${p}%` }} /></span>; })}
              {isToday && nowPct > 0 && nowPct < 100 && <span className="farm-axis__now" style={{ insetInlineStart: `${nowPct}%` }} />}
            </div>
            <div className="farm-axis__rows">{people.map((e) => <AxisRow key={e.uid} ctx={ctx} e={e} />)}</div>
          </div>
        ) : <p className="farm-empty farm-empty--flat" style={{ padding: 0 }}>אף אחד לא רשם נוכחות ביום הזה.</p>}
      </section>
      <section className="farm-card" style={{ overflow: 'hidden' }}>
        <div className="farm-cardhead"><h2>מה קורה · {rows.length}</h2>{ctx.manager && <button type="button" className="farm-link" onClick={() => go(`/farm/calendar/new?date=${date}`)}>הוספה</button>}</div>
        {rows.length ? <ul className="farm-list">{rows.map(({ key, ...r }) => <ItemRow key={key} {...r} />)}</ul> : <p className="farm-empty">אין פריטים ביום הזה.</p>}
      </section>
    </AppScreen>
  );
}

function AxisRow({ ctx, e }: { ctx: V2Ctx; e: Entry }) {
  const mine = e.uid === ctx.user.uid;
  const span = barSpan(e.hours);
  return (
    <button type="button" className="farm-axis__row" onClick={() => go(`/people/${e.uid}`)}>
      <span className={mine ? 'farm-axis__name farm-axis__name--me' : 'farm-axis__name'}>{firstOf(e.name)}</span>
      <span className="farm-axis__track">
        <span className={mine ? 'farm-axis__bar farm-axis__bar--me' : 'farm-axis__bar'} style={{ insetInlineStart: `${span.start}%`, width: `${span.width}%` }}>{barLabel(e.hours, mine && e.status === 'now')}</span>
      </span>
    </button>
  );
}

type DayRow = { key: string; time: string; sort: string; title: string; meta: string; href: string | null; done?: boolean };
/** F3 "מה קורה": calendar items (not presence) and the day's routines, by time. */
function buildDayRows(ctx: V2Ctx, date: string, items: CalItem[], routines: Task[]): DayRow[] {
  const rows: DayRow[] = items.filter((it) => it.date === date && !isPresence(it)).map((it) => ({
    key: it.id, time: itemTime(it), sort: itemTime(it) === 'כל היום' ? '00:00' : itemTime(it), title: it.title, meta: itemMeta(ctx, it), href: itemTarget(ctx, it, date),
  }));
  for (const t of routines) {
    if (!t.templateId) continue;
    const tpl = ctx.templates.find((x) => x.id === t.templateId);
    const by = t.done ? t.doneBy : t.assignee;
    const female = by ? femaleOf(by.name, ctx.peopleByUid.get(by.uid)) : false;
    const who = by ? (t.done ? ` · ${firstOf(by.name)} ${female ? 'סיימה' : 'סיים'}` : ` · ${firstOf(by.name)}`) : '';
    const time = tpl?.time || '';
    rows.push({ key: t.id, time: time || 'כל היום', sort: time || '00:00', title: tpl?.title || t.title, meta: `שגרה${who}`, href: `/tasks/${encodeURIComponent(t.id)}`, done: t.done });
  }
  return rows.sort((a, b) => a.sort.localeCompare(b.sort));
}
