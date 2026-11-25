// ביקורים ושימוש on a computer (K5): the site first, as designed; the app's own numbers follow under it.
import { useState } from 'react';
import { ddmm, dayName, MONTHS } from '../../app/v2/format';
import { fmt, many } from '../shared';
import type { Ranked, Traffic } from '../source';
import { Act, DCard, Failed, Empty, Notice, Page, Ranking, Tiles } from './desk';
import { axisAt, BarsCard, FarmSkeleton, inLast, inPeriod, PeriodChips, type FarmBar } from './farm';
import { CLICK, DEPTH, DEVICE, pct, ROLE, SCREEN, SECTION, SOURCE, TIME, trafficPeriods } from '../trafficNames';

/** Names that are too long for a row: short here, the whole name in the tooltip. */
const SHORT: Record<string, string> = { 'ישירות (קישור שמור או הקלדה)': 'ישירות', 'הוספת אירוע ליומן': 'הוספה ליומן', 'התראות על אירועים': 'התראות' };
const FEW = 6;

/** A ranking in a card: the first six, the rest one press away. */
function RankCard({ title, list, names, whole, empty, few = FEW }: { title: string; list: Ranked; names: Record<string, string>; whole?: number; empty: string; few?: number }) {
  const [all, setAll] = useState(false);
  const items = all ? list : list.slice(0, few);
  return (
    <DCard title={title} aside={list.length > few ? <Act onClick={() => setAll(!all)}>{all ? 'להראות פחות' : `הכול · ${list.length}`}</Act> : undefined}>
      <div className="df-rank"><Ranking empty={empty} total={whole} items={items.map((x) => { const full = names[x.key] || 'אחר'; return { key: x.key, label: <span title={full}>{SHORT[full] || full}</span>, value: x.count }; })} /></div>
    </DCard>
  );
}

const hh = (h: number) => String(h).padStart(2, '0');
/** Two hours to a column; the tooltip keeps each hour. */
function hourBars(hours: number[], one: string, other: string): FarmBar[] {
  const two = Array.from({ length: 12 }, (_, i) => ({ h: i * 2, a: hours[i * 2] || 0, b: hours[i * 2 + 1] || 0 }));
  const top = two.reduce((m, x) => Math.max(m, x.a + x.b), 0);
  const first = two.findIndex((x) => x.a + x.b === top);
  return two.map((x, i) => ({ key: String(x.h), value: x.a + x.b, on: top > 0 && i === first, label: String(x.h), tip: `${hh(x.h)}:00–${hh(x.h)}:59: ${many(x.a, one, other)} · ${hh(x.h + 1)}:00–${hh(x.h + 1)}:59: ${many(x.b, one, other)}`, aside: `${hh(x.h)}:00–${hh(x.h + 1)}:59: ${many(x.a + x.b, one, other)}` }));
}

type Day = Traffic['perDay'][number];
/** A column per day; over half a year, a column per month. */
export function dayBars(days: Day[], value: (d: Day) => number, text: (d: Day) => string): { bars: FarmBar[]; aside?: string; monthly: boolean } {
  if (days.length <= 180) {
    const bars = days.map((d, i) => ({ key: d.day, value: value(d), on: i === days.length - 1, label: axisAt(i, days.length) ? ddmm(d.day) : '', tip: `${i === days.length - 1 ? 'היום' : `${dayName(d.day)} ${ddmm(d.day)}`}: ${text(d)}` }));
    return { bars, aside: bars[bars.length - 1]?.tip, monthly: false };
  }
  const months = new Map<string, Day>();
  for (const d of days) {
    const k = d.day.slice(0, 7), m = months.get(k) || { day: k, views: 0, visitors: 0, opens: 0, users: 0 };
    months.set(k, { day: k, views: m.views + d.views, visitors: m.visitors + d.visitors, opens: m.opens + d.opens, users: m.users + d.users });
  }
  const list = [...months.values()];
  const bars = list.map((d, i) => { const name = MONTHS[Number(d.day.slice(5)) - 1]; return { key: d.day, value: value(d), on: i === list.length - 1, label: name.length > 4 ? name.slice(0, 3) + '׳' : name, tip: `${name}${i === 0 && list.length > 12 ? ` ${d.day.slice(0, 4)}` : ''}: ${text(d)}` }; });
  return { bars, aside: bars[bars.length - 1]?.tip, monthly: true };
}
const sum = (r: Ranked) => r.reduce((a, x) => a + x.count, 0);

export function TrafficDesk({ st, days, setDays }: { st: { data: Traffic | null; loading: boolean; error: string | null; reload: () => void }; days: number; setDays: (d: number) => void }) {
  const d = st.data;
  return (
    <Page group="החווה במספרים" title="ביקורים ושימוש" sub="נספר אצלנו, בלי שירות חיצוני ובלי פרטים אישיים" actions={<PeriodChips days={days} onChange={setDays} periods={trafficPeriods(d)} />}>
      <div className={st.loading && d ? 'df-flow is-loading' : 'df-flow'} aria-busy={st.loading || undefined}>
        {st.error && <DCard><Failed text={`לא הצלחנו לקרוא. ${st.error}`} retry={st.reload} /></DCard>}
        {!d && !st.error && <FarmSkeleton />}
        {d && d.totals.views === 0 && d.totals.opens === 0 && <DCard title="עוד לא נספרו ביקורים"><Empty>הספירה התחילה עם העדכון האחרון. המספרים יופיעו כאן אחרי הביקורים הראשונים.</Empty></DCard>}
        {d && (d.totals.views > 0 || d.totals.opens > 0) && <Numbers d={d} />}
      </div>
    </Page>
  );
}

function Numbers({ d }: { d: Traffic }) {
  const mobile = (d.site.devices.find((x) => x.key === 'mobile')?.count || 0) + (d.site.devices.find((x) => x.key === 'installed')?.count || 0);
  const installed = d.app.devices.find((x) => x.key === 'installed')?.count || 0;
  const visitors = dayBars(d.perDay, (x) => x.visitors, (x) => `${many(x.visitors, 'מבקר אחד', 'מבקרים')}, ${many(x.views, 'כניסה אחת', 'כניסות')}`);
  const users = dayBars(d.perDay, (x) => x.users, (x) => `${many(x.users, 'אדם אחד', 'אנשים')}, ${many(x.opens, 'פתיחה אחת', 'פתיחות')}`);
  return (
    <>
      {d.today.capped && <Notice>היום היו יותר מ־{fmt(d.cap)} ספירות, אז הספירה נעצרה עד חצות כדי לשמור את המכסה החינמית לאפליקציה.</Notice>}
      <Tiles items={[
        { value: fmt(d.today.visitors), label: 'מבקרים באתר היום' }, { value: fmt(d.totals.visitors), label: `מבקרים ${inPeriod(d.days)}` }, { value: `${pct(d.totals.returning, d.totals.visitors)}%`, label: 'חזרו שוב' },
        { value: `${pct(mobile, d.totals.views)}%`, label: 'מהטלפון' }, { value: fmt(d.today.users), label: 'נכנסו לאפליקציה היום' }, { value: fmt(d.today.opens), label: 'פתיחות של האפליקציה' },
      ]} />
      <div className="df-row">
        <BarsCard months={visitors.monthly} title={visitors.monthly ? 'מבקרים בכל חודש' : 'מבקרים בכל יום'} label={`מבקרים באתר, ${d.perDay.length} ימים`} aside={visitors.aside} data={visitors.bars} />
        <BarsCard title="באיזו שעה נכנסים" label="כניסות לאתר לפי שעה ביום" data={hourBars(d.site.hours, 'כניסה אחת', 'כניסות')} style={{ flex: 'none', width: 394 }} />
      </div>
      <div className="df-row df-three">
        <RankCard title="מאיפה הגיעו" list={d.site.sources} names={SOURCE} whole={d.totals.views} empty="עוד אין" />
        <RankCard title="מה ראו באתר" list={d.site.sections} names={SECTION} whole={d.totals.views} empty="עוד אין" />
        <RankCard title="על מה לחצו" list={d.site.clicks} names={CLICK} whole={d.totals.views} empty="עוד לא לחצו על כלום" />
      </div>
      <div className="df-row">
        <RankCard title="כמה זמן נשארו" list={d.site.time} names={TIME} whole={sum(d.site.time)} empty="עוד אין" />
        <RankCard title="עד איפה גללו" list={d.site.depth} names={DEPTH} whole={sum(d.site.depth)} empty="עוד אין" />
      </div>

      <h2 className="df-h">האפליקציה · {many(d.totals.users, 'כניסה אחת', 'כניסות')} של אנשים</h2>
      <Tiles items={[
        { value: fmt(d.totals.users), label: 'אנשים שנכנסו (לפי יום)' }, { value: fmt(d.totals.opens), label: `פתיחות ${inPeriod(d.days)}` },
        { value: `${pct(installed, sum(d.app.devices))}%`, label: 'מאפליקציה מותקנת' }, { value: d.totals.users ? (d.totals.opens / d.totals.users).toFixed(1) : '0', label: 'פתיחות לאדם ביום' },
      ]} />
      <div className="df-row">
        <BarsCard months={users.monthly} title={users.monthly ? 'אנשים בכל חודש' : 'אנשים בכל יום'} label={`אנשים שנכנסו לאפליקציה, ${d.perDay.length} ימים`} aside={users.aside} data={users.bars} />
        <BarsCard title="באיזו שעה משתמשים" label="פתיחות של האפליקציה לפי שעה ביום" data={hourBars(d.app.hours, 'פתיחה אחת', 'פתיחות')} style={{ flex: 'none', width: 394 }} />
      </div>
      <div className="df-row df-three">
        <RankCard title="המסכים שנפתחו הכי הרבה" list={d.app.screens.slice(0, 10)} names={SCREEN} few={10} empty="עוד אין" />
        <RankCard title="מי נכנס" list={d.app.roles} names={ROLE} whole={sum(d.app.roles)} empty="עוד אין" />
        <RankCard title="מאיפה" list={d.app.devices} names={DEVICE} whole={sum(d.app.devices)} empty="עוד אין" />
      </div>
      <p className="df-note">
        {many(d.totals.views, 'כניסה אחת', 'כניסות')} לאתר {inLast(d.days)}, {fmt(d.today.views)} מהן היום. האחוזים ליד מאיפה הגיעו, מה ראו ועל מה לחצו הם מתוך כל הכניסות; במה שראו: כמה הגיעו לחלק הזה בדף.{' '}
        איך זה נספר: כל כניסה שולחת לשרת שלנו רק מספרים (איזה חלק בדף, מאיזה סוג אתר הגיעו, טלפון או מחשב). לא נשמרים שמות, כתובות או מזהים. מבקר נספר פעם אחת ביום בכל דפדפן. ההדגמה, בדיקות ומסכי התצוגה המקדימה לא נספרים.
      </p>
    </>
  );
}
