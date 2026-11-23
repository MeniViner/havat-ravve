// E1-Home: the temporary "אירוע" tab on event day. Live hero, big "שער" and "דוכן" entries, my scan and sale counts.
// Opening it also brings the ticket list, products and tabs onto the phone, so the gate and the stall work without reception.
// No "recent scans" list here (tidy round): the gate shows the previous scan, and managers have the scans log (Y2).
import type { ReactNode } from 'react';
import { Hero, Icon, StatRow, StatTile } from '../../kit';
import { AppScreen, RootHead } from '../../core';
import { dayOverline, hhmm } from '../../format';
import { now, nowMs } from '../../../clock';
import type { ScreenProps } from '../../ctx';
import { useEventTickets, useEventTabs, useStallProducts, myScans, mySales, isEventClosed } from '../../data/eventday';
import { useRouteEvent, NoEvent, to } from './common';

export function EventHome({ ctx, params }: ScreenProps): ReactNode {
  const { id, event, loading } = useRouteEvent(ctx, params);
  const gate = !!event && event.entry !== false;
  const stall = !!event && event.stall !== false;
  const tickets = useEventTickets(id, gate || stall);
  const tabs = useEventTabs(id, stall);
  const products = useStallProducts(id, stall);
  if (!event || isEventClosed(event)) return <NoEvent loading={loading} closed={isEventClosed(event)} />;
  const ready = !tickets.loading && !tabs.loading && !products.loading;
  const q = id === ctx.eventToday?.id ? '' : `?e=${id}`;
  return (
    <AppScreen variant="root">
      <RootHead overline={`${dayOverline()} · ${hhmm(now())}`} title="אירוע" />
      <Hero>
        <span className="eventday-hero-over">{nowMs() >= Date.parse(event.start) ? 'קורה עכשיו' : 'היום'} · {hhmm(event.start)}–{hhmm(event.end)}</span>
        <h2 className="eventday-hero-title">{event.title}</h2>
        <span className="eventday-hero-line">
          <Icon name="check" size={18} />
          {ready ? 'הרשימות במכשיר. עובד גם בלי קליטה' : 'מוריד את הרשימות למכשיר…'}
        </span>
      </Hero>
      {gate && (
        <a className="eventday-entry eventday-entry--gate" {...to('/event/gate' + q)}>
          <span className="eventday-entry__icon"><Icon name="qr" size={40} /></span>
          <span className="eventday-entry__body"><b className="eventday-entry__title">שער</b><span className="eventday-entry__sub">סריקת כרטיסים וחיפוש בשם</span></span>
          <Icon name="chevron" size={24} />
        </a>
      )}
      {stall && (
        <a className="eventday-entry eventday-entry--stall" {...to('/event/stall' + q)}>
          <span className="eventday-entry__icon"><Icon name="cart" size={40} /></span>
          <span className="eventday-entry__body"><b className="eventday-entry__title">דוכן</b><span className="eventday-entry__sub">מכירה לחשבון של אורח</span></span>
          <Icon name="chevron" size={24} />
        </a>
      )}
      {(gate || stall) && (
        <StatRow>
          {gate && <StatTile value={myScans(tickets.items, ctx.user.uid, ctx.today)} label="סריקות שלך היום" />}
          {stall && <StatTile value={mySales(tabs.items, ctx.user.uid, ctx.today)} label="מכירות שלך היום" />}
        </StatRow>
      )}
    </AppScreen>
  );
}
