import { useMemo, useState } from 'react';
import type { Task, Profile, FarmEvent, CalendarItem } from '../types';
import { TaskList, TaskDetail, TaskForm, QuickPhotoButton, type TaskCtx } from './Tasks';
import { Icon, Empty, Avatar, fmtDayLong, firstName } from '../ui';
import { navigate } from '../router';
import { todayKey } from '../firebase';

type Props = { profile: Profile; open: Task[]; recent: Task[]; shoppingCount: number; urgentShopping: number; ctx: TaskCtx; loading: boolean; events: FarmEvent[]; calendarToday: CalendarItem[]; inboxCount: number; manager: boolean };

const isToday = (e: FarmEvent) => { const n = new Date(); return new Date(e.start).toDateString() === n.toDateString() || (new Date(e.start) <= n && new Date(e.end) >= n); };
const daysUntil = (iso: string) => Math.ceil((new Date(iso).getTime() - Date.now()) / 86400_000);

export function TodayScreen({ profile, open, recent, shoppingCount, urgentShopping, ctx, loading, events, calendarToday, inboxCount, manager }: Props) {
  const [selected, setSelected] = useState<Task | null>(null);
  const [adding, setAdding] = useState(false);
  const today = todayKey();
  const hour = new Date().getHours();
  const greeting = hour < 5 ? 'לילה טוב' : hour < 12 ? 'בוקר טוב' : hour < 17 ? 'צהריים טובים' : hour < 21 ? 'ערב טוב' : 'לילה טוב';
  const mine = open.filter((t) => t.assignee?.uid === ctx.actor.uid);
  const urgent = open.filter((t) => t.urgent && t.assignee?.uid !== ctx.actor.uid);
  const todays = open.filter((t) => (t.dateKey === today || t.dueDate === today) && !mine.includes(t) && !urgent.includes(t));
  const overdue = open.filter((t) => t.dueDate && t.dueDate < today && !mine.includes(t) && !urgent.includes(t));
  const doneToday = recent.filter((t) => (t.doneAt || '') >= today);
  const live = selected ? (open.find((t) => t.id === selected.id) || recent.find((t) => t.id === selected.id) || selected) : null;
  const eventToday = events.find(isToday);
  const nextEvent = useMemo(() => events.filter((e) => !isToday(e) && new Date(e.end).getTime() > Date.now()).sort((a, b) => a.start.localeCompare(b.start))[0], [events]);
  const whoToday = calendarToday.filter((c) => c.kind === 'manual');
  const headline = open.length === 0 ? 'הכל סגור. יופי.' : mine.length ? `${mine.length} ${mine.length === 1 ? 'משימה עליך' : 'משימות עליך'}` : open.length === 1 ? 'משימה אחת מחכה' : `${open.length} משימות מחכות`;
  return (
    <>
      <header className="topbar"><div><h1>{greeting}, {firstName(profile.displayName)}</h1><div className="sub">{fmtDayLong(today)}</div></div><div className="topbar-actions">{manager && inboxCount > 0 && <button type="button" className="icon-btn" onClick={() => navigate('/inbox')} aria-label="התראות"><span className="bell"><Icon name="info" /><i>{inboxCount}</i></span></button>}<button type="button" className="icon-btn" onClick={() => navigate('/more')} aria-label="הפרופיל שלי"><Avatar name={profile.displayName} size={36} /></button></div></header>
      <div className="hero-card">
        <div className="eyebrow">היום בחווה</div>
        <h2>{headline}</h2>
        <div className="hero-stats">
          <div><b>{doneToday.length}</b><span>בוצעו היום</span></div>
          <div><b>{todays.length + mine.filter((t) => t.dueDate === today || t.dateKey === today).length}</b><span>להיום</span></div>
          {overdue.length > 0 && <div><b>{overdue.length}</b><span>באיחור</span></div>}
          {urgent.length + mine.filter((t) => t.urgent).length > 0 && <div><b>{urgent.length + mine.filter((t) => t.urgent).length}</b><span>דחופות</span></div>}
        </div>
      </div>
      {eventToday && (
        <button type="button" className="event-today" onClick={() => navigate(`/events-staff/${eventToday.id}`)}>
          {eventToday.image && <img src={eventToday.image} alt="" />}
          <div className="event-today-body"><span className="eyebrow">היום מתקיים</span><h2>{eventToday.title}</h2><p>{new Date(eventToday.start).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' })}{eventToday.location ? ' · ' + eventToday.location : ''}</p><span className="btn primary sm">לכניסה ולדוכן <Icon name="chev" /></span></div>
        </button>
      )}
      <div className="quick">
        <a href="/app/tasks" onClick={(e) => { e.preventDefault(); navigate('/tasks'); }}><Icon name="list" />משימות<span className="n">{open.length}</span></a>
        <a href="/app/shopping" onClick={(e) => { e.preventDefault(); navigate('/shopping'); }}><Icon name="cart" />קניות<span className="n">{shoppingCount}{urgentShopping ? ` · ${urgentShopping} דחוף` : ''}</span></a>
      </div>
      <div className="people-row" style={{ marginTop: 12 }}>
        <QuickPhotoButton ctx={ctx} />
        {whoToday.length > 0 && whoToday.map((c) => <span className="person-chip" key={c.id}><Avatar name={c.ownerName} size={22} />{c.title}{c.time ? ` · ${c.time}` : ''}</span>)}
      </div>
      {!eventToday && nextEvent && (
        <a className="next-event" href={`/app/events-staff/${nextEvent.id}`} onClick={(e) => { e.preventDefault(); navigate(`/events-staff/${nextEvent.id}`); }}>
          <div className="date"><b>{new Date(nextEvent.start).getDate()}</b><span>{new Date(nextEvent.start).toLocaleDateString('he-IL', { month: 'short' })}</span></div>
          <div className="nx-main"><b>{nextEvent.title}</b><small>בעוד {daysUntil(nextEvent.start)} ימים{nextEvent.location ? ' · ' + nextEvent.location : ''}</small></div>
          <Icon name="chev" size={18} />
        </a>
      )}
      {loading && !open.length ? <div className="loading">טוען…</div> : (
        <>
          {mine.length > 0 && <div className="section"><div className="section-head"><h2>עליך</h2></div><TaskList tasks={mine} ctx={ctx} onOpen={setSelected} empty={null} /></div>}
          {urgent.length > 0 && <div className="section"><div className="section-head"><h2>דחוף</h2></div><TaskList tasks={urgent} ctx={ctx} onOpen={setSelected} empty={null} /></div>}
          {overdue.length > 0 && <div className="section"><div className="section-head"><h2>באיחור</h2></div><TaskList tasks={overdue} ctx={ctx} onOpen={setSelected} empty={null} /></div>}
          <div className="section"><div className="section-head"><h2>להיום</h2><a href="/app/tasks" onClick={(e) => { e.preventDefault(); navigate('/tasks'); }}>לכל המשימות</a></div>
            <TaskList tasks={todays} ctx={ctx} onOpen={setSelected} empty={<Empty title={open.length ? 'אין משימות שמחכות דווקא להיום' : 'אין משימות פתוחות'} text={open.length ? `יש ${open.length} משימות פתוחות ברשימה המלאה.` : 'כשתופיע משימה חדשה היא תהיה כאן.'} icon="repeat" />} /></div>
          {doneToday.length > 0 && <div className="section"><div className="section-head"><h2>בוצע היום · {doneToday.length}</h2></div><TaskList tasks={doneToday} ctx={ctx} onOpen={setSelected} empty={null} /></div>}
        </>
      )}
      <button type="button" className="fab" onClick={() => setAdding(true)}><Icon name="plus" />משימה</button>
      <TaskForm open={adding} onClose={() => setAdding(false)} ctx={ctx} />
      <TaskDetail task={adding ? null : live} onClose={() => setSelected(null)} ctx={ctx} onEdit={() => { setSelected(null); navigate('/tasks'); }} />
    </>
  );
}
