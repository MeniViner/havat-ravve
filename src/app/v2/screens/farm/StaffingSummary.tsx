import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Button, Icon } from '../../kit';
import { go } from '../../core';
import type { ScreenProps } from '../../ctx';
import type { FarmCalItem } from '../../data/farm';
import { hourLabel, plannedAt, staffingSummary, workStart, workEnd } from './staffing';

const roles = { management: 'מנהלים', volunteer: 'מתנדבים', other: 'תפקיד לא צוין' };
const roleText = { management: 'ניהול', volunteer: 'התנדבות', other: 'תפקיד לא צוין' };

function VolunteerNames({ people }: { people: { uid: string; name: string }[] }) {
  const rail = useRef<HTMLDivElement>(null);
  const names = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<'fit' | 'more' | 'end'>('fit');
  useEffect(() => {
    const frame = rail.current, scroller = names.current, content = strip.current;
    if (!frame || !scroller || !content) return;
    const measure = () => {
      const fits = content.offsetWidth <= frame.clientWidth + 1;
      const atEnd = Math.abs(scroller.scrollLeft) + scroller.clientWidth >= scroller.scrollWidth - 1;
      setPosition(fits ? 'fit' : atEnd ? 'end' : 'more');
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame); observer.observe(content);
    scroller.addEventListener('scroll', measure, { passive: true });
    return () => { observer.disconnect(); scroller.removeEventListener('scroll', measure); };
  }, []);
  const move = () => {
    const el = names.current;
    if (el) el.scrollTo({ left: position === 'end' ? 0 : el.scrollLeft - el.clientWidth * 0.8 });
  };
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const el = event.currentTarget;
    if (event.target !== el) return;
    const positions: Record<string, number> = {
      Home: 0, End: -el.scrollWidth,
      ArrowLeft: el.scrollLeft - el.clientWidth * 0.8, ArrowRight: el.scrollLeft + el.clientWidth * 0.8,
    };
    if (positions[event.key] !== undefined) {
      event.preventDefault();
      el.scrollTo({ left: positions[event.key] });
    }
  };
  const label = position === 'end' ? 'חזרה לשם הראשון' : 'הצגת עוד שמות מתנדבים';
  return <div ref={rail} className="staffing-volunteers">
    <div ref={names} className="staffing-names" role="region" tabIndex={0} aria-label="שמות מתנדבים" onKeyDown={onKey}>
      <div ref={strip} className="staffing-name-strip">
        {people.length ? people.map(p => <button key={p.uid} type="button" onClick={() => go(`/people/${p.uid}`)}>{p.name}</button>) : 'אין שיבוץ'}
      </div>
    </div>
    {position !== 'fit' && <button type="button" className="staffing-more-names" aria-label={label} title={label} onClick={move}>
      <Icon name={position === 'end' ? 'back' : 'chevron'} size={17} />
    </button>}
  </div>;
}
export function StaffingSummary({
  items,
  ctx,
  now,
  loading,
  error,
}: {
  items: FarmCalItem[];
  ctx: ScreenProps['ctx'];
  now: number;
  loading: boolean;
  error: string;
}) {
  const [hour, setHour] = useState(() => Math.max(6, Math.min(20, Math.floor(now / 60))));
  const { current, next, gap, people } = staffingSummary(items, ctx.today, now, ctx.peopleByUid, ctx.manager);
  return (
    <section className="staffing-summary" aria-label="בחווה עכשיו">
      <div className="staffing-title">
        <h2>בחווה עכשיו</h2>
        <bdi>{hourLabel(now)}</bdi>
      </div>
      <p className="staffing-caption">לפי מה שנרשם ביומן</p>
      {loading || error ? (
        <p role="status">{error ? 'לא ניתן לקרוא את היומן כרגע' : 'טוען את היומן…'}</p>
      ) : (
        <>
          <div className="staffing-now">
            <strong>{current.length} משובצים עכשיו</strong>
            {(Object.keys(roles) as (keyof typeof roles)[]).map(role => {
              const list = current.filter(p => p.role === role);
              if (role === 'other' && !list.length) return null;
              return (
                <div className="staffing-role" key={role}>
                  <span>
                    {roles[role]} · {list.length}
                  </span>
                  {role === 'volunteer' ? <VolunteerNames people={list} /> : <div className="staffing-names" tabIndex={0} aria-label={`שמות ${roles[role]}`}>
                    {list.length
                      ? list.map(p => (
                          <button type="button" key={p.uid} onClick={() => go(`/people/${p.uid}`)}>
                            {p.name}
                          </button>
                        ))
                      : 'אין שיבוץ'}
                  </div>}
                </div>
              );
            })}
          </div>
          <div className="staffing-change">
            <div className="staffing-title">
              <strong>השינוי הבא</strong>
              {!!next.length && <bdi>{hourLabel(next[0].at)}</bdi>}
            </div>
            {!next.length && <span>אין עוד שינויים להיום ביומן.</span>}
            {[true, false].map(arriving => {
              const changes = next.filter(e => e.arriving === arriving);
              return (
                changes.length > 0 && (
                  <div className="staffing-role" key={String(arriving)}>
                    <span>{arriving ? 'הגעה' : 'סיום'}</span>
                    <div className="staffing-names" tabIndex={0}>
                      {changes.map(e => `${e.person.name} (${roleText[e.person.role]})`).join(' · ')}
                    </div>
                  </div>
                )
              );
            })}
          </div>
          <div className={gap ? 'staffing-gap' : 'staffing-covered'}>
            <strong>
              {gap ? 'ללא מתנדבים' : now >= workEnd ? 'חלון התכנון להיום הסתיים' : 'יש כיסוי מתנדבים עד 20:00'}
            </strong>
            {gap && (
              <>
                <bdi>
                  {hourLabel(gap.start)}–{hourLabel(gap.end)}
                </bdi>
                <small>{gap.start <= now ? 'החלון כבר התחיל.' : `מתחיל בעוד ${gap.start - now} דקות.`}</small>
              </>
            )}
          </div>
          <details className="staffing-detail">
            <summary>
              שיבוצים לפי שעה <bdi>06:00–20:00</bdi>
            </summary>
            {people.map(p => (
              <div key={p.uid}>
                <span>
                  {p.name} · {roleText[p.role]}
                </span>
                <bdi>{p.spans.map(s => `${hourLabel(s.start)}–${hourLabel(s.end)}`).join(' / ')}</bdi>
                <span className={'staffing-track ' + p.role} aria-hidden="true">
                  {p.spans.map(s => {
                    const a = Math.max(workStart, s.start),
                      b = Math.min(workEnd, s.end);
                    return (
                      b > a && (
                        <i
                          key={s.start}
                          style={{
                            left: `${(100 * (a - workStart)) / (workEnd - workStart)}%`,
                            width: `${(100 * (b - a)) / (workEnd - workStart)}%`,
                          }}
                        />
                      )
                    );
                  })}
                </span>
              </div>
            ))}
            <label>
              ספירה לפי שעה{' '}
              <select value={hour} onChange={e => setHour(Number(e.target.value))}>
                {Array.from({ length: 15 }, (_, i) => i + 6).map(h => (
                  <option key={h} value={h}>
                    {hourLabel(h * 60)}
                  </option>
                ))}
              </select>
            </label>
            <p>{plannedAt(people, hour * 60).length} משובצים</p>
          </details>
        </>
      )}
      <Button variant="link" onClick={() => go('/farm/presence')}>
        שינוי הנוכחות שלי
      </Button>
    </section>
  );
}
