// N14 all farm activity: one feed of the activity log, grouped by day, with search and a type filter.
import { useMemo, useState } from 'react';
import type { ScreenProps } from '../../ctx';
import { AppScreen } from '../../core';
import { Avatar, Button, Chip, ChipRow, EmptyState, PageTitle, SearchField, TopBar } from '../../kit';
import { dayName, ddmm, daysFromToday, hhmm, keyOf } from '../../format';
import type { Activity } from '../../../types';
import { useActivityAll, activityGroup, activityLine, activityMatches, isTeam, type ActivityFilter } from '../../data/manage';
import { lnk, Loading } from './shared';

const FILTERS: { v: ActivityFilter; l: string }[] = [
  { v: 'all', l: 'הכל' }, { v: 'money', l: 'כסף' }, { v: 'people', l: 'אנשים' }, { v: 'tasks', l: 'משימות' }, { v: 'events', l: 'אירועים' },
];
const PAGE = 40;
const dayLabel = (key: string) => { const d = daysFromToday(key); return d === 0 ? 'היום' : d === -1 ? 'אתמול' : `${dayName(key)} ${ddmm(key)}`; };

export function ActivityScreen({ ctx, params }: ScreenProps) {
  const [shown, setShown] = useState(PAGE);
  const { items, loading } = useActivityAll(true, Math.max(400, shown + 1));
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<ActivityFilter>((FILTERS.some((f) => f.v === params.filter) ? params.filter : 'all') as ActivityFilter);
  const team = useMemo(() => new Set<string>(ctx.team.filter(isTeam).map((p) => p.uid)), [ctx.team]);
  const rows = useMemo(() => items
    .filter((a) => !params.event || a.eventId === params.event)
    .filter((a) => filter === 'all' || activityGroup(a.kind) === filter)
    .map((a) => ({ a, line: activityLine(a, team) }))
    .filter(({ a, line }) => activityMatches(a, q, `${line.title} ${line.meta}`))
    .sort((x, y) => (x.a.at < y.a.at ? 1 : -1)), [items, filter, q, team, params.event]);
  const days = useMemo(() => {
    const m = new Map<string, { a: Activity; line: { title: string; meta: string } }[]>();
    for (const r of rows.slice(0, shown)) { const k = keyOf(r.a.at); m.set(k, [...(m.get(k) || []), r]); }
    return [...m.entries()];
  }, [rows, shown]);
  if (loading && !items.length) return <Loading back={{ label: 'ניהול', path: '/manage' }} />;
  return (
    <AppScreen variant="detail">
      <TopBar back={{ label: 'ניהול', ...lnk('/manage') }} />
      <PageTitle>כל הפעילות</PageTitle>
      <SearchField label="חיפוש: אדם, אירוע או פעולה" placeholder="חיפוש: אדם, אירוע או פעולה" value={q} onChange={(e) => { setQ(e.target.value); setShown(PAGE); }} />
      <ChipRow label="סינון">
        {FILTERS.map((f) => <Chip key={f.v} selected={filter === f.v} onClick={() => { setFilter(f.v); setShown(PAGE); }}>{f.l}</Chip>)}
      </ChipRow>
      {days.map(([key, list]) => (
        <section key={key} className="k-card manage-feed" aria-label={dayLabel(key)}>
          <h2 className="manage-feed__day">{dayLabel(key)}</h2>
          <ul className="k-list">
            {list.map(({ a, line }, i) => (
              <li key={a.id} className="manage-feed__item">
                <span className="manage-feed__time" dir="ltr">{hhmm(a.at)}</span>
                <span className="manage-feed__rail">
                  <Avatar name={a.by.name} />
                  <span className={i === list.length - 1 ? 'manage-feed__line manage-feed__line--end' : 'manage-feed__line'} />
                </span>
                <span className="manage-feed__body">
                  <span className="manage-feed__title">{line.title}</span>
                  {line.meta && <span className="manage-feed__meta">{line.meta}</span>}
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
