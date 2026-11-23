// Q16 all farm activity: one feed of the activity log, grouped by day, with search and two dropdowns (type, person).
// With ?event=<id> it is one event's history (the old "היסטוריית האירוע"): that event's log, types orders/payments/stall/edits.
// Table view and export are ⋯ items (Q5, Q9).
import { useMemo, useState } from 'react';
import type { ScreenProps } from '../../ctx';
import { AppScreen } from '../../core';
import { Avatar, Button, Dropdown, EmptyState, Inline, MoreMenu, PageTitle, SearchField, TopBar } from '../../kit';
import { tableCell, useTableView } from '../../patterns';
import { dayName, ddmm, daysFromToday, hhmm, keyOf } from '../../format';
import { KIND_LABELS, type Activity } from '../../../types';
import { ACTION_LABELS, useActivityForEvent } from '../../../activity';
import { useEvent } from '../../../data';
import {
  useActivityAll, activityInFilter, eventActivityIn, activityLine, activityMatches, isTeam, type ActivityFilter, type EventActivityFilter,
} from '../../data/manage';
import { lnk, Loading } from './shared';

const FILTERS: { v: ActivityFilter; l: string }[] = [
  { v: 'all', l: 'כל הסוגים' }, { v: 'money', l: 'כסף' }, { v: 'people', l: 'אנשים' }, { v: 'tasks', l: 'משימות' }, { v: 'shopping', l: 'קניות' },
  { v: 'events', l: 'אירועים' }, { v: 'settings', l: 'הגדרות' },
];
const EVENT_FILTERS: { v: EventActivityFilter; l: string }[] = [
  { v: 'all', l: 'כל הסוגים' }, { v: 'orders', l: 'הזמנות' }, { v: 'payments', l: 'תשלומים' }, { v: 'stall', l: 'דוכן' }, { v: 'edits', l: 'עריכות' },
];
const PAGE = 40;
const dayLabel = (key: string) => { const d = daysFromToday(key); return d === 0 ? 'היום' : d === -1 ? 'אתמול' : `${dayName(key)} ${ddmm(key)}`; };

export function ActivityScreen({ ctx, params }: ScreenProps) {
  const [shown, setShown] = useState(PAGE);
  const eventId = params.event || '';
  const all = useActivityAll(!eventId, Math.max(400, shown + 1));
  // One event: its own query (activity eventId + at), so an old event's lines are all there, not only the latest 400 of the farm.
  const ofEvent = useActivityForEvent(eventId, !!eventId);
  const event = useEvent(eventId).item;
  const { items, loading } = eventId ? ofEvent : all;
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<ActivityFilter>((FILTERS.some((f) => f.v === params.filter) ? params.filter : 'all') as ActivityFilter);
  const [efilter, setEfilter] = useState<EventActivityFilter>('all');
  const [who, setWho] = useState('');
  const people = useMemo(() => [...new Map(items.map((a) => [a.by.uid, a.by.name])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'he')), [items]);
  const team = useMemo(() => new Set<string>(ctx.team.filter(isTeam).map((p) => p.uid)), [ctx.team]);
  // A guest who fills the donation form and marks it paid did one thing: the "created" line is hidden when the same person's "claimed" follows.
  const claimed = useMemo(() => new Set(items.filter((a) => a.kind === 'donation' && a.action === 'claimed').map((a) => a.refId + a.by.uid)), [items]);
  const rows = useMemo(() => items
    .filter((a) => !(a.kind === 'donation' && a.action === 'created' && claimed.has(a.refId + a.by.uid)))
    .filter((a) => !eventId || a.eventId === eventId)
    .filter((a) => (eventId ? eventActivityIn(a, efilter) : activityInFilter(a.kind, filter)))
    .filter((a) => !who || a.by.uid === who)
    .map((a) => ({ a, line: activityLine(a, team) }))
    .filter(({ a, line }) => activityMatches(a, q, `${line.title} ${line.meta}`))
    .sort((x, y) => (x.a.at < y.a.at ? 1 : -1)), [items, filter, efilter, who, q, team, eventId, claimed]);
  const days = useMemo(() => {
    const m = new Map<string, { a: Activity; line: { title: string; meta: string } }[]>();
    for (const r of rows.slice(0, shown)) { const k = keyOf(r.a.at); m.set(k, [...(m.get(k) || []), r]); }
    return [...m.entries()];
  }, [rows, shown]);
  const title = eventId ? 'היסטוריית האירוע' : 'כל הפעילות';
  const table = useTableView({
    title, filename: eventId && event ? `${event.title} - היסטוריה.csv` : 'פעילות.csv', headers: ['מתי', 'מי', 'פעולה', 'מה', 'סוג'],
    rows: () => rows.map(({ a }) => [tableCell.time(a.at), a.by.name, ACTION_LABELS[a.action] || a.action, a.text, KIND_LABELS[a.kind] || a.kind]),
  });
  const back = eventId ? { label: event?.title || 'האירוע', path: `/manage/events/${eventId}` } : { label: 'ניהול', path: '/manage' };
  if (table.active) return table.screen;
  if (loading && !items.length) return <Loading back={back} />;
  const reset = () => setShown(PAGE);
  return (
    <AppScreen variant="detail">
      <TopBar back={{ label: back.label, ...lnk(back.path) }} end={<MoreMenu title={title} items={table.items} />} />
      <PageTitle>{title}</PageTitle>
      <SearchField label="חיפוש: אדם, אירוע או פעולה" placeholder="חיפוש: אדם, אירוע או פעולה" value={q} onChange={(e) => { setQ(e.target.value); reset(); }} />
      <Inline gap={8}>
        {eventId
          ? <Dropdown label="סוג" value={efilter} onChange={(v) => { setEfilter(v); reset(); }} options={EVENT_FILTERS.map((f) => ({ value: f.v, label: f.l }))} />
          : <Dropdown label="סוג" value={filter} onChange={(v) => { setFilter(v); reset(); }} options={FILTERS.map((f) => ({ value: f.v, label: f.l }))} />}
        <Dropdown label="אדם" value={who} onChange={(v) => { setWho(v); reset(); }}
          options={[{ value: '', label: 'כל האנשים' }, ...people.map(([uid, name]) => ({ value: uid, label: name, leading: <Avatar name={name} size={32} /> }))]} />
      </Inline>
      {days.map(([key, list]) => (
        <section key={key} className="k-card manage-feed" aria-label={dayLabel(key)}>
          <h2 className="manage-feed__day">{dayLabel(key)}</h2>
          <ul className="k-list">
            {list.map(({ a, line }) => (
              <li key={a.id} className="manage-feed__item">
                <span className="manage-feed__time" dir="ltr">{hhmm(a.at)}</span>
                <Avatar name={a.by.name} size={32} />
                <span className="manage-feed__body">
                  <span className="manage-feed__title">{line.title}</span>
                  {(line.meta || a.via) && <span className="manage-feed__meta">{[line.meta, a.via && `דרך ${a.via.label}`].filter(Boolean).join(' · ')}</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {rows.length > shown && <Button variant="outline" className="manage-more" onClick={() => setShown((n) => n + PAGE)}>עוד</Button>}
      {!rows.length && <EmptyState variant="fill" icon="search" title={q ? 'לא נמצא' : 'אין פעילות להצגה'} text={q ? 'נסו מילה אחרת או סינון אחר.' : 'כל פעולה בחווה נרשמת כאן.'} />}
    </AppScreen>
  );
}
