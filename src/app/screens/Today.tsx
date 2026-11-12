// Today: a short page. What is on you, what is free to take, the next event and what is urgent to buy. Everything else is one tap away.
import type { Task, FarmEvent, CalendarItem, AppNotification, ShoppingItem } from '../types';
import type { TeamCtx } from '../ctx';
import { A, Icon, fmtDayLong, fmtTime, firstName, greeting, inText, fmtDateShort, fmtWeekday, todayISO, useDesktop, money } from '../ui';
import { Head, Sect, Empty, useLeaving } from '../kit';
import { TaskRow, DoneLine, useTaskActions, sortTasks } from './Tasks';
import { catOf } from './New';

type Props = { ctx: TeamCtx; open: Task[]; recent: Task[]; shopping: ShoppingItem[]; events: FarmEvent[]; calendar: CalendarItem[]; inbox: AppNotification[]; loading: boolean };

export function TodayScreen({ ctx, open, recent, shopping, events, calendar, inbox, loading }: Props) {
  const desktop = useDesktop(); const today = todayISO();
  const act = useTaskActions(ctx); const { leaving, leave } = useLeaving();
  const done = (t: Task) => leave(t.id, () => act.done(t));
  const due = open.filter((t) => !t.dueDate || t.dueDate <= today || t.urgent).sort(sortTasks(today));
  const mineAll = open.filter((t) => t.assignee?.uid === ctx.actor.uid);
  const mine = due.filter((t) => t.assignee?.uid === ctx.actor.uid);
  const free = due.filter((t) => !t.assignee);
  const later = mineAll.length - mine.length;
  const doneToday = recent.filter((t) => (t.doneAt || '') >= today).sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''));
  const now = new Date().toISOString();
  const next = events.filter((e) => e.end >= now && e.published).sort((a, b) => a.start.localeCompare(b.start))[0];
  const eventToday = next && next.start.slice(0, 10) <= today && next.end.slice(0, 10) >= today ? next : null;
  const eventTo = (e: FarmEvent) => (ctx.manager ? `/manage/events/${e.id}` : `/events-staff/${e.id}`);
  const urgent = shopping.filter((i) => i.urgent);
  const row = (t: Task, dashed = false) => <TaskRow key={t.id} t={t} ctx={ctx} today={today} leaving={leaving.has(t.id)} onDone={done} onTake={act.take} owner={dashed} dashed={dashed} />;

  const side = (
    <>
      {next && !eventToday && <><Sect title="קרוב" more="האירוע" to={eventTo(next)} /><EventTeaser e={next} to={eventTo(next)} /></>}
      {urgent.length > 0 && <>
        <Sect title="דחוף לקנות" n={urgent.length} more="לרשימה" to="/shopping" />
        {urgent.slice(0, 4).map((i) => <A key={i.id} className="r-linkrow" to={`/shopping/${i.id}`}>{i.title}<span>{catOf(i.category).label}{i.qty ? ` · ${i.qty}` : ''}</span></A>)}
      </>}
      {ctx.manager && desktop && <>
        <Sect title="לטיפול" n={inbox.length} more="הכל" to="/manage/inbox" />
        {inbox.length ? inbox.slice(0, 5).map((n) => <A key={n.id} className="r-linkrow" to={n.link || '/manage/inbox'}>{n.title}<span>{n.text}</span></A>) : <Empty title="אין כלום שמחכה להחלטה" />}
        <Sect title="מי בחווה" more="יומן" to="/manage/calendar" />
        {calendar.filter((c) => c.date >= today).slice(0, 4).map((c) => <A key={c.id} className="r-linkrow" to="/manage/calendar">{c.title}<span>{c.date === today ? 'היום' : fmtWeekday(c.date)} · {c.time}</span></A>)}
      </>}
    </>
  );

  return (
    <>
      <Head over={fmtDayLong(today)} title={`${greeting()}, ${firstName(ctx.profile.displayName)}`} />
      {eventToday && (
        <A className="r-eventday" to={`/events-staff/${eventToday.id}`} style={{ display: 'block' }}>
          <span className="r-over">היום באירוע</span>
          <h2>{eventToday.title}</h2>
          <span>{fmtTime(eventToday.start)}–{fmtTime(eventToday.end)} · כניסה ודוכן מהטלפון</span>
        </A>
      )}
      <div className={desktop ? 'r-cols' : ''}>
        <div>
          <section className="r-mine" aria-label="המשימות שעליך">
            <Sect title="עליך" n={mine.length || undefined} more="כל המשימות" to="/tasks" />
            {loading && !due.length ? null : mine.length
              ? mine.slice(0, 6).map((t) => row(t))
              : <Empty title="אין כרגע משימות עליך">{free.length ? 'אפשר לקחת אחת מהפנויות.' : ''}</Empty>}
            {(later > 0 || mine.length > 6) && <A className="r-linkrow" to="/tasks" style={{ borderBottom: 0 }}>{mine.length > 6 ? `ועוד ${mine.length - 6} להיום` : `ועוד ${later} בימים הבאים`}<Icon name="chev" /></A>}
          </section>
          {(free.length > 0 || !loading) && <>
            <Sect title="פנויות" n={free.length} more={free.length > 5 ? 'כולן' : undefined} to="/tasks" />
            {free.length ? free.slice(0, 5).map((t) => row(t, true)) : <Empty title="אין משימות פנויות">כשמוסיפים משימה בלי שם, היא תופיע כאן.</Empty>}
          </>}
          {!desktop && side}
          {doneToday.length > 0 && <><Sect title="בוצע היום" n={doneToday.length} more="היסטוריה" to="/history" />{doneToday.slice(0, 3).map((t) => <DoneLine key={t.id} t={t} />)}</>}
        </div>
        {desktop && <div>{side}</div>}
      </div>
    </>
  );
}

export const byPriority = (uid: string, today: string) => (a: Task, b: Task) => {
  const score = (t: Task) => (t.dueDate && t.dueDate < today ? -1 : 0) + (t.urgent ? -4 : 0) + (t.assignee?.uid === uid ? -2 : 0) + (t.dueDate === today ? -1 : 0);
  return score(a) - score(b) || a.createdAt.localeCompare(b.createdAt);
};

/** "אני על זה": take a free task, with an undo. */
export function useTakeTask(ctx: TeamCtx) {
  return useTaskActions(ctx).take;
}

export function EventTeaser({ e, to }: { e: FarmEvent; to: string }) {
  return (
    <A to={to} className="r-event">
      <span className="r-day">{new Date(e.start).getDate()}<small>{fmtDateShort(e.start).replace(/^\d+\s*/, '')} · {fmtWeekday(e.start)}</small></span>
      <span><b>{e.title}</b><span>{inText(e.start)} · {fmtTime(e.start)}{e.price ? ` · ${money(e.price)} לכרטיס` : ' · חינם'}</span></span>
      <Icon name="chev" />
    </A>
  );
}
