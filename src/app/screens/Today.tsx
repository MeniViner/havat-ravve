import { startTransition, useOptimistic } from 'react';
import type { Task, FarmEvent, CalendarItem, AppNotification, ShoppingItem } from '../types';
import type { TeamCtx } from '../ctx';
import { Top, Ledger, Sec, Row, Chk, Pill, Avatar, Btn, A, Icon, fmtDayLong, fmtTime, firstName, greeting, inText, fmtDateShort, fmtWeekday, todayISO, dateKey, useDesktop, useOpenSections, useToast, relTime, money } from '../ui';
import { setTaskDone, editTask } from '../store';
import { ShopLine, useMarkBought, taskMeta } from './legacy';
import { WeekPresenceStrip } from './CalendarGrid';
import { byPriority, fit } from '../taskOrder';
import { now } from '../clock';
export { byPriority, fit };

type Props = { ctx: TeamCtx; open: Task[]; recent: Task[]; shopping: ShoppingItem[]; events: FarmEvent[]; calendar: CalendarItem[]; inbox: AppNotification[]; loading: boolean };

export function TodayScreen({ ctx, open, recent, shopping, events, calendar, inbox, loading }: Props) {
  const desktop = useDesktop();
  const today = todayISO();
  const toast = useToast();
  const overdue = open.filter((t) => t.dueDate && t.dueDate < today);
  const dueToday = (t: Task) => !t.dueDate || t.dueDate <= today || t.urgent;
  const byId = new Map<string, Task>();
  for (const task of [...open, ...recent]) {
    if (task.managersOnly && !ctx.manager) continue;
    const previous = byId.get(task.id);
    if (!previous || task.updatedAt >= previous.updatedAt) byId.set(task.id, task);
  }
  const visible = [...byId.values()].filter((t) => {
    if (!t.done) return dueToday(t);
    const completed = Date.parse(t.doneAt || '');
    return Number.isFinite(completed) && dateKey(new Date(completed)) === today;
  });
  // Keep the pending row in the union while the independent open and done listeners catch up.
  const [tasks, showDone] = useOptimistic(visible, (current, next: Task) => [
    ...current.filter((t) => t.id !== next.id), next,
  ]);
  const todays = [...tasks].sort(byPriority(ctx.actor.uid, today));
  const upcoming = events.filter((e) => e.end >= now().toISOString() && e.published).sort((a, b) => a.start.localeCompare(b.start));
  const next = upcoming[0];
  const eventToday = next && next.start.slice(0, 10) <= today && next.end.slice(0, 10) >= today ? next : null;
  const eventModules = eventToday ? [eventToday.entry !== false && 'כניסה', eventToday.stall !== false && 'דוכן'].filter(Boolean).join(' ו') : '';
  const urgentShop = shopping.filter((i) => i.urgent).length;
  const myToday = todays.filter((t) => t.assignee?.uid === ctx.actor.uid);
  const free = todays.filter((t) => !t.assignee);
  const theirs = todays.filter((t) => t.assignee && t.assignee.uid !== ctx.actor.uid);
  const myLater = open.filter((t) => t.assignee?.uid === ctx.actor.uid && !dueToday(t)).length;
  const myOpen = myToday.filter((t) => !t.done).length;
  // The free ratio is currently unassigned open work out of all visible open and completed-today tasks.
  const freeOpen = free.filter((t) => !t.done).length;
  const mine = fit(myToday, 8); const freeRows = fit(free, desktop ? 12 : 8); const theirRows = fit(theirs, 10);
  const markBought = useMarkBought(ctx);
  const { isOpen, toggle } = useOpenSections(['free', 'theirs', 'inbox', 'shop'], 'today2', ['theirs']);
  const toggleDone = (task: Task, done: boolean) => startTransition(async () => {
    showDone({ ...task, done, doneAt: done ? now().toISOString() : null, doneBy: done ? ctx.actor : null });
    try { await setTaskDone(ctx.actor, task, done); }
    catch (error) { toast({ text: (error as Error).message || 'לא נשמר', kind: 'error' }); }
  });

  return (
    <div className="today-screen">
      <Top date={fmtDayLong(today)} title={`${greeting()}, ${firstName(ctx.profile.displayName)}`} end={desktop
        ? <><Btn kind="ghost" size="sm" icon="plus" to="/tasks/new">משימה</Btn><Btn kind="ghost" size="sm" icon="plus" to="/shopping/new">פריט לקניות</Btn></>
        : <A className="iconbtn" to="/more" aria-label="הפרופיל שלי"><Avatar name={ctx.profile.displayName} /></A>} />
      <Ledger items={[
        { n: myOpen, label: 'עליך' },
        { n: <span className="today-free-ratio">{freeOpen} מתוך {todays.length}</span>, label: 'פנויות' },
        ...(ctx.manager ? [{ n: overdue.length, label: 'באיחור', tone: overdue.length ? 'rust' as const : undefined }] : []),
        ...(ctx.manager && desktop ? [{ n: shopping.length, label: 'פריטי קניות', to: '/shopping' }, { n: inbox.length, label: 'לטיפול', tone: inbox.length ? 'ochre' as const : undefined, to: '/manage/inbox' }] : []),
      ]} />

      <WeekPresenceStrip today={today} items={calendar} team={ctx.team} />

      {eventToday && <A to={`/events-staff/${eventToday.id}`} className="paybox ok" style={{ display: 'block', marginTop: 14 }}><b>היום: {eventToday.title}</b>{fmtTime(eventToday.start)}–{fmtTime(eventToday.end)}{eventModules && ` · ${eventModules} מהטלפון`}</A>}
      {!eventToday && next && !desktop && <EventTeaser e={next} to={`/events-staff/${next.id}`} />}

      <div className={desktop ? 'cols' : ''}>
        <div>
          {/* what is on me comes first, in its own box, so nobody has to hunt for it in the shared list */}
          <section className="minebox" aria-label="המשימות שעליך">
            <header><h2>עליך{myOpen > 0 && <span className="n"> · {myOpen}</span>}</h2><A to="/tasks">כל המשימות</A></header>
            {loading && !todays.length ? null : myToday.length ? <div className="list">{mine.shown.map((t) => <TaskRow key={t.id} t={t} ctx={ctx} today={today} onDone={(v) => toggleDone(t, v)} />)}</div>
              : <p className="none">{free.length ? 'אין כרגע משימות עליך. אפשר לקחת אחת מהפנויות למטה.' : 'אין כרגע משימות עליך.'}</p>}
            <MoreDone n={mine.hidden} className="more" />
            {myLater > 0 && <A to="/tasks" className="more">ועוד {myLater} עליך בימים הבאים</A>}
          </section>
          {(free.length > 0 || !loading) && <section className="today-free" aria-label="משימות פנויות">
            <Sec serif title="פנויות" n={freeOpen} open={isOpen('free')} onToggle={() => toggle('free')} />
            {isOpen('free') && (free.length ? <><div className="list">{freeRows.shown.map((t) => <TaskRow key={t.id} t={t} ctx={ctx} today={today} onDone={(v) => toggleDone(t, v)} />)}</div><MoreDone n={freeRows.hidden} /></> : <p className="lead">אין משימות פנויות כרגע.</p>)}
          </section>}
          {theirs.length > 0 && <section className="today-others" aria-label="משימות אצל אחרים">
            <Sec title="אצל אחרים" n={theirs.filter((t) => !t.done).length} open={isOpen('theirs')} onToggle={() => toggle('theirs')} />
            {isOpen('theirs') && <><div className="list">{theirRows.shown.map((t) => <TaskRow key={t.id} t={t} ctx={ctx} today={today} onDone={(v) => toggleDone(t, v)} />)}</div><MoreDone n={theirRows.hidden} /></>}
          </section>}
          <A to="/history" className="today-history">היסטוריה</A>
        </div>
        {desktop && (
          <div>
            {ctx.manager && <>
              <Sec title="לטיפול" n={inbox.length} link="הכל" linkTo="/manage/inbox" open={isOpen('inbox')} onToggle={() => toggle('inbox')} />
              {isOpen('inbox') && <div className="list">{inbox.slice(0, 5).map((n) => <Row key={n.id} to={n.link} center title={n.title} meta={<span>{n.text} · {relTime(n.createdAt)}</span>} chev />)}{!inbox.length && <p className="lead">אין כלום שמחכה להחלטה.</p>}</div>}
            </>}
            {next && <><Sec title={inText(next.start)} n={`${fmtWeekday(next.start)} ${fmtDateShort(next.start)}`} link="האירוע" linkTo={ctx.manager ? `/manage/events/${next.id}` : `/events-staff/${next.id}`} /><EventTeaser e={next} to={ctx.manager ? `/manage/events/${next.id}` : `/events-staff/${next.id}`} /></>}
            <Sec title="קניות" n={`${shopping.length} פריטים${urgentShop ? ` · ${urgentShop} דחוף` : ''}`} link="לרשימה" linkTo="/shopping" open={isOpen('shop')} onToggle={() => toggle('shop')} />
            {isOpen('shop') && (shopping.length ? <div className="notes" style={{ paddingTop: 6 }}><div className="notepad">{[...shopping].sort((a, b) => Number(b.urgent) - Number(a.urgent)).slice(0, 6).map((i) => <ShopLine key={i.id} i={i} onMark={(v) => markBought(i, v)} />)}{shopping.length > 6 && <A to="/shopping" className="note-more">ועוד {shopping.length - 6} ברשימה</A>}</div></div> : <p className="lead">הרשימה ריקה.</p>)}
          </div>
        )}
      </div>
      {!desktop && <section className="today-shopping" aria-label="קניות">
        <h2>קניות</h2>
        <div className="today-shopping-summary">
          <span>{shopping.length} פריטים{urgentShop > 0 && <> · <b>{urgentShop} דחוף</b></>}</span>
          <Btn kind="ghost" size="sm" to="/shopping">לרשימת הקניות</Btn>
        </div>
      </section>}
      {!desktop && ctx.manager && inbox.length > 0 && <div className="actions"><Btn kind="ghost" size="sm" icon="bell" to="/manage/inbox">לטיפול · {inbox.length}</Btn></div>}
    </div>
  );
}

function MoreDone({ n, className = 'note-more' }: { n: number; className?: string }) {
  if (!n) return null;
  return <A to="/tasks" className={className}>ועוד {n === 1 ? 'אחת שבוצעה' : `${n} שבוצעו`} היום · לכל המשימות</A>;
}

/**
 * One task. The end of the row always answers "whose is it": a gold "עליך", someone's name, or a button to take it.
 */
export function TaskRow({ t, ctx, today, onDone, selected }: { t: Task; ctx: TeamCtx; today: string; onDone: (v: boolean) => void; selected?: boolean }) {
  const take = useTakeTask(ctx);
  const mine = t.assignee?.uid === ctx.actor.uid;
  return (
    <div className={`row task${t.done ? ' done' : ''}${t.urgent && !t.done ? ' urgent' : ''}${mine ? ' mine' : ''}${selected ? ' sel' : ''}`}>
      <Chk round stayVisible on={t.done} onChange={onDone} label={`בוצע: ${t.title}`} rust={t.urgent && !t.done} />
      <A to={`/tasks/${t.id}`} className="main lnk" style={{ display: 'flex', gap: 12, flex: 1, minWidth: 0 }}>
        {t.photo && <img className="thumb" src={t.photo} alt="" />}
        <div className="main"><div className="title">{t.title}</div><div className="meta">{t.urgent && !t.done && <Pill tone="rust">דחוף</Pill>}{t.managersOnly && <Pill>מנהלים</Pill>}{t.done ? <span>{firstName(t.doneBy?.name || '')} · {fmtTime(t.doneAt)}</span> : taskMeta(t, ctx, today, true)}</div></div>
      </A>
      <TaskOwner t={t} ctx={ctx} onTake={() => take(t)} />
    </div>
  );
}
/** "אני על זה": take a free task, with an undo. */
export function useTakeTask(ctx: TeamCtx) {
  const toast = useToast();
  return (t: Task) => editTask(ctx.actor, t, { assignee: ctx.actor }).then(() => toast({ text: `"${t.title}" עליך`, action: { label: 'ביטול', onClick: () => { editTask(ctx.actor, { ...t, assignee: ctx.actor }, { assignee: null }).catch(() => {}); } } }, 4000)).catch(() => toast({ text: 'לא נשמר', kind: 'error' }));
}
export function TaskOwner({ t, ctx, onTake }: { t: Task; ctx: TeamCtx; onTake?: () => void }) {
  if (t.assignee?.uid === ctx.actor.uid) return <span className="owner mine">עליך</span>;
  if (t.assignee) return <span className="owner other" title={`אצל ${t.assignee.name}`}><Avatar name={t.assignee.name} size="xs" light />{firstName(t.assignee.name)}</span>;
  if (t.done || !onTake) return <span className="owner all">לכולם</span>;
  return <button type="button" className="owner take" onClick={(e) => { e.stopPropagation(); onTake(); }}>אני על זה</button>;
}

export function EventTeaser({ e, to }: { e: FarmEvent; to: string }) {
  return (
    <A to={to} className="evcard" style={{ marginTop: 8 }}>
      <div className="date"><div className="d">{new Date(e.start).getDate()}</div><div className="m">{fmtDateShort(e.start).replace(/^\d+\s*/, '')} · {fmtWeekday(e.start)}</div></div>
      <div className="main" style={{ flex: 1, minWidth: 0 }}><div className="t">{e.title}</div><div className="meta" style={{ marginTop: 4, color: 'var(--muted)', fontSize: 14 }}>{inText(e.start)} · {fmtTime(e.start)}{e.price ? ` · ${money(e.price)} לכרטיס` : ' · חינם'}</div></div>
      <Icon name="chev" className="chev" size={18} />
    </A>
  );
}
