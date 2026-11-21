// T6 (history of done tasks) and C7 (the day's summary).
import { useState } from 'react';
import type { ScreenProps } from '../../ctx';
import { AppScreen } from '../../core';
import { TopBar, PageTitle, SearchField, Chip, ChipRow, ListCard, TextLink, Icon, Card, SectionHeader, Button, EmptyState } from '../../kit';
import { back } from '../../../router';
import { useClockVersion, dateKeyOf } from '../../../clock';
import { dayName, longDate, firstName, hhmm } from '../../format';
import type { Task } from '../../../types';
import {
  useDoneBetween, useRootTasks, historyGroups, countsByPerson, historyMeta, matchesSearch, dayEnd, waitingText, stripPlace, addDays,
} from '../../data/tasks';
import { to } from './shared';
import './tasks.css';

type Period = 'today' | 'week' | 'month' | 'all';
const PERIODS: { value: Period; label: string; summary: string; days: number }[] = [
  { value: 'today', label: 'היום', summary: 'היום', days: 1 },
  { value: 'week', label: 'השבוע', summary: 'השבוע', days: 7 },
  { value: 'month', label: 'החודש', summary: 'החודש', days: 31 },
  { value: 'all', label: 'כולם', summary: 'בסך הכל', days: 366 },
];
const SHOWN = 4;
/** Start of a day in Israel as an ISO instant, an hour early so it is safe in summer and winter (rows are then filtered by date). */
const dayStartIso = (key: string) => new Date(Date.parse(key + 'T00:00:00+03:00')).toISOString();
const OPEN_END = '9999-12-31';

export function HistoryScreen({ ctx }: ScreenProps) {
  useClockVersion();
  const [period, setPeriod] = useState<Period>('today');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const p = PERIODS.find((x) => x.value === period)!;
  // the list always reaches back a week, further for "החודש" / "כולם"; the summary counts only the chosen period
  const listFrom = addDays(ctx.today, -Math.max(p.days, 7) + 1);
  const r = useDoneBetween(ctx.manager, dayStartIso(listFrom), OPEN_END, period === 'all' ? 500 : 300);
  const periodFrom = addDays(ctx.today, -p.days + 1);
  const rows = r.items.filter((t) => t.doneAt && dateKeyOf(new Date(t.doneAt)) >= listFrom);
  const inPeriod = rows.filter((t) => dateKeyOf(new Date(t.doneAt!)) >= periodFrom);
  const found = rows.filter((t) => matchesSearch(t, q));
  const groups = historyGroups(found, ctx.today);
  const counts = countsByPerson(inPeriod);
  const searching = !!q.trim();

  return (
    <AppScreen variant="detail">
      <TopBar back={{ label: 'משימות', ...to('/tasks') }} />
      <PageTitle size="root">היסטוריה</PageTitle>
      <SearchField label="חיפוש בהיסטוריה" placeholder="חיפוש: משימה, מקום או שם" size="sm" value={q} onChange={(e) => setQ(e.target.value)} />
      <ChipRow label="תקופה">
        {PERIODS.map((x) => <Chip key={x.value} selected={period === x.value} onClick={() => setPeriod(x.value)}>{x.label}</Chip>)}
      </ChipRow>
      {!searching && (
        <p className="tasks-summary">
          <b>{`${p.summary} בוצעו ${inPeriod.length}.`}</b>
          {counts.length > 0 && ' ' + counts.map((c) => `${firstName(c.name)} ${c.n}`).join(' · ')}
        </p>
      )}
      {groups.map((g) => {
        const all = searching || open[g.key];
        const shown = all ? g.rows : g.rows.slice(0, SHOWN);
        const more = g.rows.length - shown.length;
        return (
          <ListCard key={g.key} title={g.title} count={g.rows.length} tone="quiet"
            end={more > 0 ? <TextLink onClick={() => setOpen({ ...open, [g.key]: true })}>{`עוד ${more}`}</TextLink> : undefined}>
            {shown.map((t) => <HistoryRow key={t.id} t={t} />)}
          </ListCard>
        );
      })}
      {!r.loading && groups.length === 0 && (
        <EmptyState variant="card" title={searching ? 'לא נמצא' : 'עוד אין משימות שבוצעו'} text={searching ? 'נסו מילה אחרת, או תקופה ארוכה יותר' : undefined} />
      )}
    </AppScreen>
  );
}

function HistoryRow({ t }: { t: Task }) {
  return (
    <li>
      <a className="tasks-hrow" {...to(`/tasks/${t.id}`)}>
        <span className="tasks-hrow__check" aria-hidden="true"><Icon name="check" size={20} /></span>
        <span className="tasks-hrow__body">
          <span className="tasks-hrow__title">{t.title}</span>
          <span className="tasks-hrow__meta">{historyMeta(t)}</span>
        </span>
      </a>
    </li>
  );
}

// ---------- C7 ----------
export function DayEndScreen({ ctx }: ScreenProps) {
  useClockVersion();
  const done = useDoneBetween(ctx.manager, dayStartIso(ctx.today), OPEN_END);
  const root = useRootTasks(ctx);
  const today = done.items.filter((t) => t.doneAt && dateKeyOf(new Date(t.doneAt)) === ctx.today);
  const d = dayEnd(today, root.items, ctx.user.uid, ctx.today);
  const max = Math.max(1, ...d.team.map((x) => x.n));
  const name = firstName(ctx.actor.name);
  return (
    <AppScreen variant="detail" gap={10} noNav>
      <div className="tasks-close"><Button variant="quiet" onClick={() => back('/tasks')}>סגירה</Button></div>
      <section className="tasks-dayhero">
        <span className="tasks-dayhero__date">{`${dayName(ctx.today)}, ${longDate(ctx.today)}`}</span>
        <div className="tasks-dayhero__line">
          <b className="tasks-dayhero__num">{d.mine.length}</b>
          <span className="tasks-dayhero__what">{d.mine.length === 1 ? 'משימה סגרת היום' : 'משימות סגרת היום'}</span>
        </div>
        <span className="tasks-dayhero__thanks">{`תודה, ${name}. כל הצוות יחד: ${d.total}.`}</span>
      </section>
      <Card as="section">
        <SectionHeader title="מה עשית" />
        <ul className="k-list k-list--flush" style={{ margin: 0 }}>
          {d.mine.length === 0 && <li className="tasks-drow"><span className="tasks-drow__title">עוד לא סגרת משימות היום</span></li>}
          {d.mine.map((t) => (
            <li key={t.id} className="tasks-drow">
              <span className="tasks-drow__check" aria-hidden="true"><Icon name="check" size={18} /></span>
              <span className="tasks-drow__title">{stripPlace(t.title, t.location?.placeName, true)}</span>
              <span className="tasks-drow__time">{t.doneAt ? hhmm(t.doneAt) : ''}</span>
            </li>
          ))}
        </ul>
      </Card>
      {d.team.length > 0 && (
        <section className="k-card tasks-team">
          <div className="tasks-team__head"><h2>הצוות היום</h2></div>
          <ul>
            {d.team.map((x) => (
              <li key={x.uid} className={`tasks-trow${x.uid === ctx.user.uid ? ' tasks-trow--me' : ''}`}>
                <span className="tasks-trow__name">{firstName(x.name)}</span>
                <span className="tasks-trow__bar"><span className="tasks-trow__fill" style={{ width: `${Math.round((x.n / max) * 100)}%` }} /></span>
                <b className="tasks-trow__n">{x.n}</b>
              </li>
            ))}
          </ul>
        </section>
      )}
      <a className="tasks-tomorrow" {...to('/tasks?view=mine')}>
        <span>{waitingText(d.waiting)}</span>
        <span className="tasks-tomorrow__chev" aria-hidden="true"><Icon name="chevron" size={20} /></span>
      </a>
    </AppScreen>
  );
}
