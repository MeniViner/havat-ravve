// F6-Event: the event as the team sees it before the day: countdown, offline readiness, event crew, my prep tasks; gate and stall.
import { useState } from 'react';
import { AppScreen, go, useToast } from '../../core';
import { back } from '../../../router';
import { isConflict } from '../../../db';
import { BottomBar, Button, CheckButton, EmptyState, Hero, Icon, ListCard, Row } from '../../kit';
import { dayName, daysFromToday, ddmm, hhmm, longDate, relDay } from '../../format';
import type { ScreenProps } from '../../ctx';
import type { Task } from '../../../types';
import { markTaskDone, offlineStamp, refreshOffline, takeTask, useFarmEvent, usePrepTasks, useStaffing } from '../../data/farm';
import { firstOf, namesLine } from './logic';
import { TopRow } from './parts';

export function FarmEventScreen({ ctx, params }: ScreenProps) {
  const toast = useToast();
  const id = params.id || '';
  const ev = useFarmEvent(id);
  const staffing = useStaffing(id);
  const prep = usePrepTasks(id, ctx.manager);
  const [stamp, setStamp] = useState(() => offlineStamp(id, ctx.today));
  const [busy, setBusy] = useState(false);
  const e = ev.item;
  if (!e) {
    return (
      <AppScreen variant="detail">
        <TopRow flat onBack={() => back('/farm')} />
        {!ev.loading && <EmptyState variant="card" icon="calendar" title="האירוע לא נמצא" text="אולי הוא נמחק או שהקישור ישן." />}
      </AppScreen>
    );
  }
  const left = daysFromToday(e.start);
  const crew: { uid: string; name: string }[] = [];
  for (const s of staffing.items) for (const p of s.people || []) if (!crew.some((c) => c.uid === p.uid)) crew.push({ uid: p.uid, name: p.name });
  const tasks = [...prep.items].sort((a, b) => (a.dueDate || '9').localeCompare(b.dueDate || '9') || a.title.localeCompare(b.title, 'he'));

  async function refresh() {
    if (busy) return; setBusy(true);
    try { setStamp(await refreshOffline(id, ctx.manager)); } catch { toast.show({ text: 'אין קליטה כרגע. נסו שוב כשיש' }); } finally { setBusy(false); }
  }
  async function take(t: Task) {
    try { await takeTask(ctx.actor, t); } catch (err) { if (isConflict(err)) toast.refused(); else toast.refused(`לא נשמר. ${(err as Error).message}`); }
  }
  async function done(t: Task) {
    await markTaskDone(ctx.actor, t, true);
    toast.show({ text: `בוצע: ${t.title}`, check: true, actions: [{ label: 'ביטול', onClick: () => { void markTaskDone(ctx.actor, t, false); } }] });
  }
  const bar = (e.entry || e.stall) ? (
    <BottomBar>
      {e.entry && <Button size="bar" grow icon="qr" onClick={() => go(`/event/gate?e=${encodeURIComponent(id)}`)}>שער</Button>}
      {e.stall && <Button size="bar" grow variant="secondary" icon="cart" onClick={() => go(`/event/stall?e=${encodeURIComponent(id)}`)}>דוכן</Button>}
    </BottomBar>
  ) : undefined;

  return (
    <AppScreen variant="detail" bar={bar} noNav>
      <TopRow flat onBack={() => back('/farm')} />
      <Hero className="farm-ev">
        <div className="farm-ev__top">
          <div className="farm-ev__titles">
            <span className="farm-ev__when">{dayName(e.start)}, {longDate(e.start)} · {hhmm(e.start)}{e.end ? `–${hhmm(e.end)}` : ''}</span>
            <h1 className="farm-ev__title">{e.title}</h1>
          </div>
          {left > 0 && <div className="farm-ev__count"><b>{left}</b><span>{left === 1 ? 'יום' : 'ימים'}</span></div>}
          {left === 0 && <div className="farm-ev__count"><b style={{ fontSize: 28 }}>היום</b></div>}
        </div>
        {(e.entry || e.stall) && <div className="farm-ev__tags">{e.entry && <span className="farm-ev__tag">כניסה בסריקה</span>}{e.stall && <span className="farm-ev__tag">דוכן החווה</span>}</div>}
      </Hero>
      <ListCard>
        <Row className="farm-ready" minHeight={56} leading={<span className="farm-ready__icon"><Icon name="download" size={22} /></span>}
          title={stamp ? 'מוכן לעבודה בלי קליטה' : 'הרשימות עוד לא במכשיר'}
          meta={stamp ? `הרשימות במכשיר · עודכן ${relDay(stamp)} ${hhmm(stamp)}` : 'כדי לעבוד בשער ובדוכן גם בלי קליטה'}
          actions={<Button variant="outline" disabled={busy} onClick={refresh} style={{ padding: '0 12px' }}>רענון</Button>} />
        <Row className="farm-ready" minHeight={56} leading={<span className="farm-ready__icon"><Icon name="people" size={22} /></span>}
          title={crew.length ? `${crew.length} בצוות האירוע` : 'צוות האירוע עוד לא נקבע'} meta={crew.length ? namesLine(crew.map((c) => c.name)) : undefined} />
      </ListCard>
      <ListCard title="הכנות לאירוע" count={tasks.length} tone="quiet" end={<button type="button" className="farm-link" onClick={() => go(`/tasks?event=${encodeURIComponent(id)}`)}>הכל</button>}>
        {tasks.length ? tasks.slice(0, 6).map((t) => (
          <Row key={t.id} onClick={() => go(`/tasks/${encodeURIComponent(t.id)}`)} chevron={false}
            check={<CheckButton checked={false} onChange={() => done(t)} label={`סימון בוצע: ${t.title}`} />}
            title={t.title} meta={[t.assignee ? firstOf(t.assignee.name) : 'פנויה', t.dueDate && t.assignee ? `${dayName(t.dueDate)} ${ddmm(t.dueDate)}` : ''].filter(Boolean).join(' · ')}
            actions={!t.assignee ? <Button variant="outline" onClick={() => take(t)}>לקחת</Button> : undefined} />
        )) : <li className="farm-empty" style={{ borderTop: '1px solid var(--line)' }}>אין הכנות פתוחות.</li>}
      </ListCard>
    </AppScreen>
  );
}
