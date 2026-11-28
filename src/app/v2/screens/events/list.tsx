// M3 Events: upcoming and past events with the one number that matters for each, and the vendor pool.
import { useMemo, useState } from 'react';
import { useEventClock } from '../../data/eventClock';
import type { ScreenProps } from '../../ctx';
import { AppScreen, go } from '../../core';
import { TopBar, PageTitle, SectionTitle, Tile, TileGrid, Card, DateBox, Tag, Button, EmptyState } from '../../kit';
import { useAllEvents, useVendors } from '../../../data';
import { nowMs, useClockVersion } from '../../../clock';
import { useTicketsIn, useTabsIn } from '../../data/events';
import { boardCard, dayOfMonth, monthShort, phaseOf } from './logic';
import { link, backTo, Chev } from './shared';
import type { FarmEvent, Ticket, Tab } from '../../../types';

const RECENT_DAYS = 90;

function EventCard({ e, tickets, tabs, now, next }: { e: FarmEvent; tickets: Ticket[]; tabs: Tab[]; now: number; next: boolean }) {
  const c = boardCard(e, tickets, tabs, now, next);
  return (
    <Card layout="row" pad="md" {...link(`/manage/events/${e.id}`)}>
      <DateBox day={dayOfMonth(e.start)} month={monthShort(e.start)} />
      <span className="events-card__body">
        <span className="events-card__title">{e.title}{c.tag && <Tag tone={c.tag.tone}>{c.tag.text}</Tag>}</span>
        <span className="events-card__meta">{c.meta}</span>
      </span>
      <Chev />
    </Card>
  );
}

export function EventsList({ ctx }: ScreenProps) {
  const all = useAllEvents(ctx.manager);
  const now = useEventClock(all.items.map((e)=>e.end));
  const pool = useVendors(ctx.manager);
  const [showOlder, setShowOlder] = useState(false);
  const { upcoming, recent, older } = useMemo(() => {
    const up = all.items.filter((e) => phaseOf(e, now) !== 'after').sort((a, b) => a.start.localeCompare(b.start));
    const past = all.items.filter((e) => phaseOf(e, now) === 'after').sort((a, b) => b.start.localeCompare(a.start));
    const cut = now - RECENT_DAYS * 86400_000;
    return { upcoming: up, recent: past.filter((e) => Date.parse(e.start) >= cut), older: past.filter((e) => Date.parse(e.start) < cut) };
  }, [all.items, now]);
  const shownPast = showOlder ? [...recent, ...older] : recent;
  const ids = useMemo(() => [...upcoming, ...shownPast].map((e) => e.id), [upcoming, shownPast]);
  const tickets = useTicketsIn(ids, ctx.manager);
  const tabs = useTabsIn(useMemo(() => shownPast.map((e) => e.id), [shownPast]), ctx.manager);
  const nextId = upcoming.find((e) => e.published)?.id;
  const of = <T extends { eventId: string }>(list: T[], id: string) => list.filter((x) => x.eventId === id);

  return (
    <AppScreen variant="detail" gap={10}>
      <TopBar back={backTo('ניהול', '/manage')} end={<Button icon="plus" iconSize={18} onClick={() => go('/manage/events/new')}>אירוע חדש</Button>} />
      <PageTitle>אירועים</PageTitle>
      <TileGrid className="events-resources">
        <Tile icon="pin" title="תחנות עבודה" {...link('/manage/work-stations')} />
        <Tile icon="cart" title="קטלוגים ומוצרים" {...link('/manage/farm-catalogs')} />
        <Tile icon="people" title="מאגר בעלי הדוכנים" meta={pool.loading ? undefined : pool.items.length + ' במאגר'} {...link('/manage/vendors')} />
      </TileGrid>
      {!all.loading && !all.items.length && (
        <EmptyState variant="card" icon="calendar" title="עוד אין אירועים" />
      )}
      {upcoming.length > 0 && <SectionTitle spaced>קרובים</SectionTitle>}
      {upcoming.map((e) => <EventCard key={e.id} e={e} tickets={of(tickets.items, e.id)} tabs={[]} now={now} next={e.id === nextId} />)}
      {shownPast.length > 0 && <SectionTitle spaced>ארכיון אירועים</SectionTitle>}
      {shownPast.map((e) => <EventCard key={e.id} e={e} tickets={of(tickets.items, e.id)} tabs={of(tabs.items, e.id)} now={now} next={false} />)}
      {older.length > 0 && !showOlder && (
        <button type="button" className="events-linkrow events-linkrow--quiet" onClick={() => setShowOlder(true)} aria-expanded={false}>
          <span>אירועים קודמים · {older.length}</span>
          <Chev />
        </button>
      )}
    </AppScreen>
  );
}
