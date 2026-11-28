// F1-Root: who is at the farm now (with hours), people per day this week, the next event, what was done today.
import { useMemo, useState } from 'react';
import { AppScreen, RootHead, go } from '../../core';
import { CaptureBar, Icon } from '../../kit';
import { DAY_LETTERS, dayOverline, hhmm, inDays, keyOf } from '../../format';
import { now } from '../../../clock';
import type { ScreenProps } from '../../ctx';
import { useCalendarRange, useFeed, useUpcoming } from '../../data/farm';
import { addDays, israelIso, barHeights, countsByDay, dayNum, feedLines, firstOf, weekDays, weekdayOf } from './logic';
import { LinkCard } from '../manage/shared';
import { StaffingSummary } from './StaffingSummary';
import { useNowMin } from './parts';

const MONTH_SHORT = ['ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני', 'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳'];
export const monthShort = (key: string) => MONTH_SHORT[Number(key.slice(5, 7)) - 1];

export function FarmRoot({ ctx }: ScreenProps) {
  const nowMin = useNowMin();
  const today = ctx.today;
  const week = weekDays(today);
  const cal = useCalendarRange(week[0], week[6], ctx.manager);
  const counts = countsByDay(cal.items, week);
  const heights = barHeights(counts);
  const events = useUpcoming();
  const next = events.items.find((e) => e.start && keyOf(e.end || e.start) >= today);
  // a day starts at midnight Israel time; the feed's own query is one listener shared with F5's "today"
  const feed = useFeed(israelIso(today, '00:00'), israelIso(addDays(today, 1), '00:00'));
  const lines = useMemo(() => feedLines(feed.items), [feed.items]);
  const done = lines.filter((l) => l.kind === 'done');
  const [text, setText] = useState('');
  return (
    <AppScreen variant="root" capture={<CaptureBar value={text} onChange={setText} placeholder="משימה או קנייה חדשה"
      onSubmit={(v) => { const t = v.trim(); setText(''); go(t ? `/new?text=${encodeURIComponent(t)}` : '/new'); }}
      onCamera={() => go('/new?camera=1')} onMic={() => go('/new?mic=1')} />}>
      <RootHead overline={`${dayOverline()} · ${hhmm(now())}`} title="החווה" />

      <StaffingSummary items={cal.items} ctx={ctx} now={nowMin} loading={cal.loading} error={cal.error} />

      <a href="#" className="farm-linkcard" onClick={(e) => { e.preventDefault(); go('/farm/map'); }}>
        <span className="farm-linkcard__box farm-linkcard__box--count"><Icon name="pin" size={22} /></span>
        <div className="farm-linkcard__body">
          <span className="farm-linkcard__sub">מפת החווה</span>
          <span className="farm-linkcard__over">{ctx.places.length === 1 ? 'מקום אחד שמור' : ctx.places.length ? `${ctx.places.length} מקומות שמורים` : ctx.owner ? 'פתיחת מפה וסקר שטח' : 'עוד לא נשמר מקום'}</span>
        </div>
        <span className="farm-linkcard__chev"><Icon name="chevron" size={20} /></span>
      </a>

      <section className="farm-card farm-week">
        <div className="farm-week__head">
          <h2>כמה אנשים בחווה השבוע</h2>
          <a className="farm-link" href="#" onClick={(e) => { e.preventDefault(); go('/farm/calendar?view=month'); }}>ליומן</a>
        </div>
        <div className="farm-week__bars">
          {week.map((d, i) => {
            const isToday = d === today;
            return (
              <a key={d} href="#" className="farm-week__day" aria-label={`יום ${DAY_LETTERS[weekdayOf(d)]} ${dayNum(d)}.${Number(d.slice(5, 7))}, ${counts[i]} אנשים`}
                onClick={(e) => { e.preventDefault(); go(`/farm/calendar?view=day&date=${d}`); }}>
                <span className={counts[i] ? 'farm-week__n' : 'farm-week__n farm-week__n--zero'}>{counts[i] || '–'}</span>
                <span className={isToday ? 'farm-week__bar farm-week__bar--today' : 'farm-week__bar'} style={{ height: heights[i] }} />
                <span className={isToday ? 'farm-week__label farm-week__label--today' : 'farm-week__label'}>{isToday ? 'היום' : DAY_LETTERS[weekdayOf(d)]}</span>
              </a>
            );
          })}
        </div>
      </section>

      {next && (
        <a href="#" className="farm-linkcard" onClick={(e) => { e.preventDefault(); go(`/farm/events/${next.id}`); }}>
          <span className="farm-linkcard__box"><b>{dayNum(keyOf(next.start))}</b><span>{monthShort(keyOf(next.start))}</span></span>
          <div className="farm-linkcard__body">
            <span className="farm-linkcard__over">האירוע הבא · {inDays(next.start)}</span>
            <span className="farm-linkcard__title">{next.title}</span>
          </div>
          <span className="farm-linkcard__chev"><Icon name="chevron" size={20} /></span>
        </a>
      )}

      <a href="#" className="farm-linkcard" onClick={(e) => { e.preventDefault(); go('/farm/today'); }}>
        <span className="farm-linkcard__box farm-linkcard__box--count"><b>{done.length}</b></span>
        <div className="farm-linkcard__body">
          <span className="farm-linkcard__over">נעשו היום בחווה</span>
          <span className="farm-linkcard__sub">{done.length ? `אחרון: ${firstOf(done[0].by.name)}, ${done[0].titles[0]}` : 'עוד לא סומנה משימה היום'}</span>
        </div>
        <span className="farm-linkcard__chev"><Icon name="chevron" size={20} /></span>
      </a>

      {!ctx.manager && <LinkCard path="/manage/activity" title="כל הפעילות" meta="פעילות הצוות בחווה" />}
    </AppScreen>
  );
}
