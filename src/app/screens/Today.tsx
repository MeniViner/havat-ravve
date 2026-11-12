// Today: what is on you, in one green field. Then the day's routine, then what anyone can take. No greeting, no counters.
import type { Task, FarmEvent, AppNotification, ShoppingItem } from '../types';
import type { TeamCtx } from '../ctx';
import { A, Icon, useDesktop, fmtDayLong, fmtTime, firstName, inText, fmtDateShort, fmtWeekday, todayISO, dateKey, relTime, money } from '../ui';
import { Head, Sect, Btn, Empty, useLeaving } from '../kit';
import { TaskRow, DoneLine, isRoutine, sortTasks, useTaskActions } from './Tasks';

type Props = { ctx: TeamCtx; open: Task[]; recent: Task[]; shopping: ShoppingItem[]; events: FarmEvent[]; inbox: AppNotification[]; loading: boolean };
const FREE_MAX = 6;

export function TodayScreen({ ctx, open, recent, shopping, events, inbox, loading }: Props) {
  const desktop = useDesktop(); const today = todayISO();
  const act = useTaskActions(ctx); const { leaving, leave } = useLeaving();
  const done = (t: Task) => leave(t.id, () => act.done(t));
  const sorted = [...open].sort(sortTasks(today));
  const mine = sorted.filter((t) => t.assignee?.uid === ctx.actor.uid);
  const routine = sorted.filter(isRoutine);
  const routineDone = recent.filter((t) => isRoutine(t) && t.dateKey === today);
  const free = sorted.filter((t) => !t.assignee && !isRoutine(t));
  const theirs = sorted.filter((t) => t.assignee && t.assignee.uid !== ctx.actor.uid);
  const doneToday = recent.filter((t) => t.doneAt && dateKey(new Date(t.doneAt)) === today);
  const published = events.filter((e) => e.published);
  const eventToday = published.find((e) => dateKey(new Date(e.start)) === today);
  const next = published.filter((e) => dateKey(new Date(e.start)) > today).sort((a, b) => a.start.localeCompare(b.start))[0];
  const urgentShop = shopping.filter((i) => i.urgent);

  const mineBlock = (
    <section className="r-mine" aria-label="המשימות שעליך">
      <Sect title="עליך" n={mine.length || undefined} />
      {loading ? <div className="r-empty">טוען…</div>
        : mine.length === 0 ? <Empty title="אין עליך כלום כרגע">{free.length ? 'אפשר לקחת משימה מהפנויות למטה.' : 'וגם אין משימות פנויות.'}</Empty>
          : mine.map((t) => <TaskRow key={t.id} t={t} ctx={ctx} today={today} leaving={leaving.has(t.id)} onDone={done} owner={false} />)}
    </section>
  );
  const routineBlock = (routine.length > 0 || routineDone.length > 0) && (
    <section>
      <Sect title="שגרת היום" n={`${routineDone.length} מתוך ${routine.length + routineDone.length}`} />
      {routine.map((t) => <TaskRow key={t.id} t={t} ctx={ctx} today={today} leaving={leaving.has(t.id)} onDone={done} owner={false} />)}
      {routineDone.map((t) => <DoneLine key={t.id} t={t} />)}
    </section>
  );
  const freeBlock = free.length > 0 && (
    <section>
      <Sect title="פנויות" n={free.length} more={free.length > FREE_MAX ? 'לכולן' : undefined} to="/tasks" />
      {free.slice(0, FREE_MAX).map((t) => <TaskRow key={t.id} t={t} ctx={ctx} today={today} leaving={leaving.has(t.id)} onDone={done} onTake={act.take} />)}
    </section>
  );
  const waitBlock = ctx.manager && inbox.length > 0 && (
    <section className="r-wait" aria-label="מחכה להחלטה שלך">
      <header>מחכה להחלטה שלך · {inbox.length}<A to="/manage/inbox">לכל התור</A></header>
      {inbox.slice(0, 3).map((n) => <A key={n.id} to={n.link}><b>{n.title}</b><span>{n.text} · {relTime(n.createdAt)}</span></A>)}
    </section>
  );
  const eventBlock = eventToday ? (
    <section className="r-eventday">
      <div className="r-over">האירוע היום · {fmtTime(eventToday.start)}–{fmtTime(eventToday.end)}</div>
      <h2>{eventToday.title}</h2>
      <div className="r-row"><Btn kind="gold" to={`/scan/${eventToday.id}`}>כניסה</Btn><Btn kind="ghost" to={`/stall/${eventToday.id}`}>דוכן</Btn></div>
    </section>
  ) : next ? (
    <A className="r-event" to={`/events-staff/${next.id}`}>
      <div className="r-day">{new Date(next.start).getDate()}<small>{fmtDateShort(next.start).replace(/^\d+\s*/, '')}</small></div>
      <div><b>{next.title}</b><span>{fmtWeekday(next.start)} · {inText(next.start)} · {fmtTime(next.start)}{next.price ? ` · ${money(next.price)}` : ''}</span></div>
      <Icon name="chev" />
    </A>
  ) : null;
  const restBlock = (
    <>
      {doneToday.length > 0 && <section>
        <Sect title="בוצע היום" n={doneToday.length} more="היסטוריה" to="/history" />
        {doneToday.slice(0, desktop ? 8 : 4).map((t) => <DoneLine key={t.id} t={t} />)}
      </section>}
      <div style={{ marginTop: 22 }}>
        {theirs.length > 0 && <A className="r-linkrow" to="/tasks"><div>אצל אחרים <span>· {theirs.length} משימות · {[...new Set(theirs.map((t) => firstName(t.assignee!.name)))].slice(0, 3).join(', ')}</span></div><Icon name="chev" /></A>}
        <A className="r-linkrow" to="/shopping"><div>קניות <span>· {shopping.length} ברשימה{urgentShop.length ? ` · דחוף: ${urgentShop.slice(0, 2).map((i) => i.title).join(', ')}` : ''}</span></div><Icon name="chev" /></A>
      </div>
    </>
  );
  return (
    <>
      <Head over={fmtDayLong(today)} title="היום" end={<A className="r-textlink" to="/more" aria-label={`הפרופיל שלי: ${ctx.profile.displayName}`}>{firstName(ctx.profile.displayName)}</A>} />
      {desktop ? (
        <div className="r-cols">
          <div>{mineBlock}{routineBlock}{freeBlock}</div>
          <div>{waitBlock}{eventBlock}{restBlock}</div>
        </div>
      ) : <>{waitBlock}{mineBlock}{eventBlock}{routineBlock}{freeBlock}{restBlock}</>}
    </>
  );
}
