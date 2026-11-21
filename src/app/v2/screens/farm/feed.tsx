// F5-Feed: today (yesterday, this week) at the farm: counts and a timeline of what people did, with result photos.
import { useMemo, useState } from 'react';
import { AppScreen, go } from '../../core';
import { Avatar, Chip, StatRow, StatTile } from '../../kit';
import { DAY_LETTERS, hhmm, keyOf, relDay } from '../../format';
import type { ScreenProps } from '../../ctx';
import type { ShoppingItem, Task } from '../../../types';
import { useDoneTasks, useFeed, useShopSince } from '../../data/farm';
import { addDays, feedCounts, feedLines, feedSentence, israelIso, weekDays, weekdayOf, type FeedLine } from './logic';
import { TopRow, femaleOf } from './parts';

type Range = 'today' | 'yesterday' | 'week';
const RANGES: { value: Range; label: string }[] = [{ value: 'today', label: 'היום' }, { value: 'yesterday', label: 'אתמול' }, { value: 'week', label: 'השבוע' }];
const LIST: Record<string, string> = { super: 'סופר', building: 'בניין', online: 'אינטרנט', giveaway: 'מחפשים' };

export function FeedScreen({ ctx, params }: ScreenProps) {
  const [range, setRange] = useState<Range>(params.range === 'yesterday' || params.range === 'week' ? params.range : 'today');
  const today = ctx.today;
  const fromKey = range === 'today' ? today : range === 'yesterday' ? addDays(today, -1) : weekDays(today)[0];
  const toKey = range === 'yesterday' ? today : addDays(today, 1);
  const fromIso = israelIso(fromKey, '00:00'), toIso = israelIso(toKey, '00:00');
  const feed = useFeed(fromIso, toIso);
  const tasks = useDoneTasks(fromIso, toIso, ctx.manager);
  const shop = useShopSince(fromIso);
  const taskById = useMemo(() => new Map(tasks.items.map((t) => [t.id, t])), [tasks.items]);
  const lines = useMemo(() => feedLines(feed.items), [feed.items]);
  const counts = feedCounts(feed.items);
  return (
    <AppScreen variant="root">
      <TopRow onBack={() => go('/farm')} />
      <h1 className="k-h1">היום בחווה</h1>
      <div className="k-chips k-chips--wrap" role="group" aria-label="תקופה">{RANGES.map((r) => <Chip key={r.value} selected={range === r.value} onClick={() => setRange(r.value)}>{r.label}</Chip>)}</div>
      <StatRow className="farm-stats">
        <StatTile value={counts.done} label="משימות בוצעו" />
        <StatTile value={counts.bought} label="קניות" />
        <StatTile value={counts.people} label="אנשים" />
      </StatRow>
      <section className="farm-card farm-feed">
        {lines.length ? (
          <ul className="farm-list">
            {lines.map((l, i) => <FeedRow key={l.id} l={l} last={i === lines.length - 1} range={range} ctx={ctx} task={taskById.get(l.refIds[0])} shop={l.refIds.map((id) => shop.get(id)).filter(Boolean) as ShoppingItem[]} />)}
          </ul>
        ) : <p className="farm-feed__empty">{feed.loading ? '' : range === 'today' ? 'עוד לא נרשם כלום היום.' : 'לא נרשם כלום בתקופה הזו.'}</p>}
      </section>
    </AppScreen>
  );
}

function FeedRow({ l, last, range, ctx, task, shop }: { l: FeedLine; last: boolean; range: Range; ctx: ScreenProps['ctx']; task?: Task; shop: ShoppingItem[] }) {
  const p = ctx.peopleByUid.get(l.by.uid);
  const female = femaleOf(l.by.name, p);
  let meta = '';
  let photo = '';
  if (l.kind === 'done' || l.kind === 'added') {
    meta = task?.templateId ? 'שגרה' : task?.location?.placeName || '';
    photo = l.kind === 'done' ? task?.donePhoto || '' : '';
  } else {
    const first = shop[0];
    meta = first ? [l.kind === 'addedShop' && first.urgent ? 'דחוף' : '', LIST[first.category] || ''].filter(Boolean).join(' · ') : '';
  }
  const href = l.kind === 'done' || l.kind === 'added' ? `/tasks/${encodeURIComponent(l.refIds[0])}` : l.refIds.length === 1 ? `/shopping/${encodeURIComponent(l.refIds[0])}` : '';
  return (
    <li className="farm-feed__li">
      <span className="farm-feed__time">{range === 'week' && <span className="farm-feed__day">{relDay(l.at) === 'היום' ? 'היום' : DAY_LETTERS[weekdayOf(keyOf(l.at))]}</span>}{hhmm(l.at)}</span>
      <div className="farm-feed__rail"><Avatar name={p?.displayName || l.by.name} /><span className={last ? 'farm-feed__line farm-feed__line--end' : 'farm-feed__line'} /></div>
      <div className="farm-feed__body" role={href ? 'link' : undefined} tabIndex={href ? 0 : undefined} style={href ? { cursor: 'pointer' } : undefined}
        onClick={href ? () => go(href) : undefined} onKeyDown={href ? (e) => { if (e.key === 'Enter') go(href); } : undefined}>
        <div className="farm-feed__text"><span className="farm-feed__title">{feedSentence(l, female)}</span>{meta && <span className="farm-feed__meta">{meta}</span>}</div>
        {photo && <img className="farm-feed__photo" src={photo} alt="תמונה מהביצוע" loading="lazy" />}
      </div>
    </li>
  );
}
