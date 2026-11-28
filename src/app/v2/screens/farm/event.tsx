// F6-Event: the event as the team sees it before the day: countdown, offline readiness, event crew, my prep tasks; gate and stall.
import { AppScreen, go } from '../../core';
import { back } from '../../../router';
import { BottomBar, Button, EmptyState, Hero, ListCard, PageTitle, Row } from '../../kit';
import { dayName, daysFromToday, hhmm, longDate } from '../../format';
import type { ScreenProps } from '../../ctx';
import { useFarmEvent, useStaffing } from '../../data/farm';
import { EventProjects, EventTasks, PrepTaskCard, sectionPath } from '../events/preparation';
import { EventCrew } from '../events/staffing';
import { EventShopping, EventShoppingLink } from '../events/shopping';
import { EventTestTickets } from '../events/testTickets';
import { OfflineStatus } from '../events/offline';
import { TopRow } from './parts';

export function FarmEventScreen({ ctx, params }: ScreenProps) {
  const id = params.id || '';
  const ev = useFarmEvent(id);
  const staffing = useStaffing(id);
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
  if (params.section === 'staffing') return <EventCrew ctx={ctx} event={e} />;
  if (params.section === 'tasks') return <EventTasks ctx={ctx} event={e} />;
  if (params.section === 'shopping') return <AppScreen variant="detail" noNav>
    <TopRow flat onBack={() => back((ctx.manager ? '/manage/events/' : '/farm/events/') + encodeURIComponent(id))} end={<OfflineStatus />} />
    <PageTitle>קניות לאירוע</PageTitle><EventShopping event={e} ctx={ctx} />
  </AppScreen>;
  const bar = (e.entry !== false || e.stall !== false) ? (
    <BottomBar>
      {e.entry !== false && <Button size="bar" grow icon="qr" onClick={() => go(`/event/gate?e=${encodeURIComponent(id)}`)}>שער</Button>}
      {e.stall !== false && <Button size="bar" grow variant="secondary" icon="cart" onClick={() => go(`/event/stall?e=${encodeURIComponent(id)}`)}>דוכן</Button>}
    </BottomBar>
  ) : undefined;

  return (
    <AppScreen variant="detail" bar={bar} noNav>
      <TopRow flat onBack={() => back('/farm')} end={<OfflineStatus />} />
      <Hero className="farm-ev">
        <div className="farm-ev__top">
          <div className="farm-ev__titles">
            <span className="farm-ev__when">{dayName(e.start)}, {longDate(e.start)} · {hhmm(e.start)}{e.end ? `–${hhmm(e.end)}` : ''}</span>
            <h1 className="farm-ev__title">{e.title}</h1>
          </div>
          {left > 0 && <div className="farm-ev__count"><b>{left}</b><span>{left === 1 ? 'יום' : 'ימים'}</span></div>}
          {left === 0 && <div className="farm-ev__count"><b style={{ fontSize: 28 }}>היום</b></div>}
        </div>
        {(e.entry !== false || e.stall !== false) && <div className="farm-ev__tags">{e.entry !== false && <span className="farm-ev__tag">כניסה בסריקה</span>}{e.stall !== false && <span className="farm-ev__tag">אירוע עם דוכנים</span>}</div>}
      </Hero>
      <PrepTaskCard event={e} ctx={ctx} />
      <EventShoppingLink event={e} />
      <ListCard><Row title="צוות" meta={crew.map((p) => p.name).slice(0,4).join(', ')} onClick={() => go(sectionPath(id,'staffing'))} /></ListCard>
      <EventProjects ctx={ctx} event={e} /><EventTestTickets ctx={ctx} eventId={e.id} />
    </AppScreen>
  );
}
