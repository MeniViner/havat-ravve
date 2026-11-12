import type { Task, FarmEvent, CalendarItem, AppNotification, ShoppingItem } from '../types';
import type { TeamCtx } from '../ctx';
import { Top, Ledger, Sec, Row, Chk, Pill, Avatar, Btn, A, Icon, fmtDayLong, fmtTime, firstName, greeting, inText, fmtDateShort, fmtWeekday, todayISO, useDesktop, useOpenSections, useToast, relTime, money } from '../ui';
import { setTaskDone, editTask } from '../store';
import { ShopLine, useMarkBought, taskMeta } from './legacy';

type Props = { ctx: TeamCtx; open: Task[]; recent: Task[]; shopping: ShoppingItem[]; events: FarmEvent[]; calendar: CalendarItem[]; inbox: AppNotification[]; loading: boolean };

export function TodayScreen({ ctx, open, recent, shopping, events, calendar, inbox, loading }: Props) {
  const desktop = useDesktop();
  const today = todayISO();
  const mine = open.filter((t) => t.assignee?.uid === ctx.actor.uid);
  const overdue = open.filter((t) => t.dueDate && t.dueDate < today);
  const todays = open.filter((t) => !t.dueDate || t.dueDate <= today || t.urgent).sort(byPriority(ctx.actor.uid, today));
  const doneToday = recent.filter((t) => (t.doneAt || '') >= today).sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''));
  const upcoming = events.filter((e) => e.end >= new Date().toISOString() && e.published).sort((a, b) => a.start.localeCompare(b.start));
  const next = upcoming[0];
  const eventToday = next && next.start.slice(0, 10) <= today && next.end.slice(0, 10) >= today ? next : null;
  const urgentShop = shopping.filter((i) => i.urgent).length;
  const myToday = todays.filter((t) => t.assignee?.uid === ctx.actor.uid);
  const free = todays.filter((t) => !t.assignee);
  const theirs = todays.filter((t) => t.assignee && t.assignee.uid !== ctx.actor.uid);
  const myLater = mine.length - myToday.length;
  const markBought = useMarkBought(ctx);
  const { isOpen, toggle } = useOpenSections(['free', 'theirs', 'done', 'inbox', 'shop'], 'today2', ['theirs', 'done']);
  const toggleDone = (t: Task, v: boolean) => setTaskDone(ctx.actor, t, v).catch(() => {});

  return (
    <>
      <Top date={fmtDayLong(today)} title={`${greeting()}, ${firstName(ctx.profile.displayName)}`} end={desktop
        ? <><Btn kind="ghost" size="sm" icon="plus" to="/tasks/new">משימה</Btn><Btn kind="ghost" size="sm" icon="plus" to="/shopping/new">פריט לקניות</Btn></>
        : <A to="/more" aria-label="הפרופיל שלי"><Avatar name={ctx.profile.displayName} /></A>} />
      <Ledger items={[{ n: myToday.length, label: 'עליך' }, { n: free.length, label: 'פנויות' }, ...(ctx.manager ? [{ n: overdue.length, label: 'באיחור', tone: overdue.length ? 'rust' as const : undefined }] : []), { n: doneToday.length, label: 'בוצעו היום' }, ...(ctx.manager && desktop ? [{ n: shopping.length, label: 'פריטי קניות', to: '/shopping' }, { n: inbox.length, label: 'לטיפול', tone: inbox.length ? 'ochre' as const : undefined, to: '/manage/inbox' }] : [])]} />

      {eventToday && <A to={`/events-staff/${eventToday.id}`} className="paybox ok" style={{ display: 'block', marginTop: 14 }}><b>היום: {eventToday.title}</b>{fmtTime(eventToday.start)}–{fmtTime(eventToday.end)} · כניסה ודוכן מהטלפון</A>}
      {!eventToday && next && !desktop && <EventTeaser e={next} to={`/events-staff/${next.id}`} />}

      <div className={desktop ? 'cols' : ''}>
        <div>
          {/* what is on me comes first, in its own box, so nobody has to hunt for it in the shared list */}
          <section className="minebox" aria-label="המשימות שעליך">
            <header><h2>עליך{myToday.length > 0 && <span className="n"> · {myToday.length}</span>}</h2><A to="/tasks">כל המשימות</A></header>
            {loading && !todays.length ? null : myToday.length ? <div className="list">{myToday.slice(0, 8).map((t) => <TaskRow key={t.id} t={t} ctx={ctx} today={today} onDone={(v) => toggleDone(t, v)} />)}</div>
              : <p className="none">{free.length ? 'אין כרגע משימות עליך. אפשר לקחת אחת מהפנויות למטה.' : 'אין כרגע משימות עליך.'}</p>}
            {myLater > 0 && <A to="/tasks" className="more">ועוד {myLater} עליך בימים הבאים</A>}
          </section>
          {(free.length > 0 || !loading) && <>
            <Sec serif title="פנויות" n={free.length} open={isOpen('free')} onToggle={() => toggle('free')}><span className="hint">מי שפנוי לוקח</span></Sec>
            {isOpen('free') && (free.length ? <div className="list">{free.slice(0, desktop ? 12 : 8).map((t) => <TaskRow key={t.id} t={t} ctx={ctx} today={today} onDone={(v) => toggleDone(t, v)} />)}</div> : <p className="lead">אין משימות פנויות. כשמישהו מוסיף משימה בלי שם, היא תופיע כאן.</p>)}
          </>}
          {theirs.length > 0 && <>
            <Sec serif title="אצל אחרים" n={theirs.length} open={isOpen('theirs')} onToggle={() => toggle('theirs')} />
            {isOpen('theirs') && <div className="list">{theirs.slice(0, 10).map((t) => <TaskRow key={t.id} t={t} ctx={ctx} today={today} onDone={(v) => toggleDone(t, v)} />)}</div>}
          </>}
          <Sec serif title="בוצע היום" n={doneToday.length} link="היסטוריה" linkTo="/history" open={isOpen('done')} onToggle={() => toggle('done')} />
          {isOpen('done') && <div className="list">{doneToday.slice(0, 6).map((t) => <Row key={t.id} done to={`/tasks/${t.id}`} start={<Chk round on onChange={(v) => toggleDone(t, v)} label={`להחזיר לביצוע: ${t.title}`} />} title={t.title} meta={<><span>{firstName(t.doneBy?.name || '')} · {fmtTime(t.doneAt)}</span>{t.donePhoto && <Icon name="camera" />}</>} />)}
            {!doneToday.length && <p className="lead">עדיין לא סומן כלום היום.</p>}</div>}
        </div>
        {desktop && (
          <div>
            {ctx.manager && <>
              <Sec title="לטיפול" n={inbox.length} link="הכל" linkTo="/manage/inbox" open={isOpen('inbox')} onToggle={() => toggle('inbox')} />
              {isOpen('inbox') && <div className="list">{inbox.slice(0, 5).map((n) => <Row key={n.id} to={n.link} center title={n.title} meta={<span>{n.text} · {relTime(n.createdAt)}</span>} chev />)}{!inbox.length && <p className="lead">אין כלום שמחכה להחלטה.</p>}</div>}
            </>}
            {next && <><Sec title={inText(next.start)} n={`${fmtWeekday(next.start)} ${fmtDateShort(next.start)}`} link="האירוע" linkTo={ctx.manager ? `/manage/events/${next.id}` : `/events-staff/${next.id}`} /><EventTeaser e={next} to={ctx.manager ? `/manage/events/${next.id}` : `/events-staff/${next.id}`} /></>}
            {ctx.manager && <>
              <Sec title="מי בחווה" link="יומן" linkTo="/manage/calendar" />
              <div className="list">{calendar.filter((c) => c.date >= today).slice(0, 5).map((c) => <Row key={c.id} center to="/manage/calendar" title={c.title} meta={<span>{c.date === today ? 'היום' : fmtWeekday(c.date)} · {c.time}</span>} />)}{!calendar.length && <p className="lead">היומן ריק לשבוע הקרוב.</p>}</div>
            </>}
            <Sec title="קניות" n={`${shopping.length} פריטים${urgentShop ? ` · ${urgentShop} דחוף` : ''}`} link="לרשימה" linkTo="/shopping" open={isOpen('shop')} onToggle={() => toggle('shop')} />
            {isOpen('shop') && (shopping.length ? <div className="notes" style={{ paddingTop: 6 }}><div className="notepad">{[...shopping].sort((a, b) => Number(b.urgent) - Number(a.urgent)).slice(0, 6).map((i) => <ShopLine key={i.id} i={i} onMark={(v) => markBought(i, v)} />)}{shopping.length > 6 && <A to="/shopping" className="note-more">ועוד {shopping.length - 6} ברשימה</A>}</div></div> : <p className="lead">הרשימה ריקה.</p>)}
          </div>
        )}
      </div>
      {!desktop && <div className="phoneonly" style={{ padding: '16px 20px 0', display: 'flex', gap: 10 }}><Btn kind="ghost" size="sm" icon="cart" to="/shopping">קניות · {shopping.length}{urgentShop ? ` · ${urgentShop} דחוף` : ''}</Btn>{ctx.manager && inbox.length > 0 && <Btn kind="ghost" size="sm" icon="bell" to="/manage/inbox">לטיפול · {inbox.length}</Btn>}</div>}
    </>
  );
}

export const byPriority = (uid: string, today: string) => (a: Task, b: Task) => {
  const score = (t: Task) => (t.urgent ? 0 : 0) + (t.dueDate && t.dueDate < today ? 1 : 0) * -1 + (t.urgent ? -4 : 0) + (t.assignee?.uid === uid ? -2 : 0) + (t.dueDate === today ? -1 : 0);
  return score(a) - score(b) || a.createdAt.localeCompare(b.createdAt);
};

/**
 * One task. The end of the row always answers "whose is it": a gold "עליך", someone's name, or a button to take it.
 */
export function TaskRow({ t, ctx, today, onDone, selected }: { t: Task; ctx: TeamCtx; today: string; onDone: (v: boolean) => void; selected?: boolean }) {
  const take = useTakeTask(ctx);
  const mine = t.assignee?.uid === ctx.actor.uid;
  return (
    <div className={`row task${t.urgent ? ' urgent' : ''}${mine ? ' mine' : ''}${selected ? ' sel' : ''}`}>
      <Chk round on={t.done} onChange={onDone} label={`בוצע: ${t.title}`} rust={t.urgent} />
      <A to={`/tasks/${t.id}`} className="main lnk" style={{ display: 'flex', gap: 12, flex: 1, minWidth: 0 }}>
        {t.photo && <img className="thumb" src={t.photo} alt="" />}
        <div className="main"><div className="title">{t.title}</div><div className="meta">{t.urgent && <Pill tone="rust">דחוף</Pill>}{t.managersOnly && <Pill>מנהלים</Pill>}{taskMeta(t, ctx, today, true)}</div></div>
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
  if (t.templateId || !onTake) return <span className="owner all">לכולם</span>;
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
