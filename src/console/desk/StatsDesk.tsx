// סטטיסטיקות on a computer (K4): six numbers, what was done each day, who did the most, the weekdays, and beside them
// shopping, visits and people.
import { ddmm, dayName, DAY_LETTERS, DAY_NAMES } from '../../app/v2/format';
import { fmt, many } from '../shared';
import type { Stats } from '../source';
import { Col, Cols, DCard, Failed, Nums, Page, Ranking, Tiles } from './desk';
import { axisAt, BarsCard, FarmSkeleton, inPeriod, PeriodChips } from './farm';

const ROLE: Record<string, string> = { owner: 'בעלים', manager: 'מנהלים', staff: 'מתנדבים', vendor: 'בעלי דוכנים', guest: 'אורחים' };
const joinedIn = (d: number) => (d === 7 ? 'השבוע' : d === 30 ? 'החודש' : d === 365 ? 'השנה' : inPeriod(d));
export const actionsText = (actions: number, done: number) => `${many(actions, 'פעולה אחת', 'פעולות')}, ${many(done, 'משימה אחת בוצעה', 'משימות בוצעו')}`;

export function StatsDesk({ st, days, setDays }: { st: { data: Stats | null; loading: boolean; error: string | null; reload: () => void }; days: number; setDays: (d: number) => void }) {
  const f = st.data?.farm;
  const n = f?.activity.days.length || 0;
  const topDay = f ? f.activity.weekday.reduce((b, v, i) => (v > f.activity.weekday[b] ? i : b), 0) : 0;
  return (
    <Page group="החווה במספרים" title="סטטיסטיקות" sub="מה קרה בחווה: משימות, קניות, ביקורים ואנשים" actions={<PeriodChips days={days} onChange={setDays} />}>
      <div className={st.loading && f ? 'df-flow is-loading' : 'df-flow'} aria-busy={st.loading || undefined}>
        {st.error && <DCard><Failed text={`לא הצלחנו לחשב. ${st.error}`} retry={st.reload} /></DCard>}
        {!f && !st.error && <FarmSkeleton />}
        {f && st.data && (
          <>
            <Tiles items={[
              { value: fmt(f.tasks.done), label: 'משימות בוצעו' }, { value: fmt(f.tasks.created), label: 'משימות נוספו' }, { value: fmt(f.tasks.open), label: 'פתוחות עכשיו' },
              { value: fmt(f.tasks.overdue), label: 'באיחור' }, { value: fmt(f.shopping.bought), label: 'פריטים נקנו' }, { value: fmt(f.visits.people), label: 'מבקרים שאושרו' },
            ]} />
            <Cols className="d-cols--top">
              <Col>
                <BarsCard title={`פעולות בכל יום · ${fmt(f.activity.total)}`} height={150} label={`פעולות ביום, ${n} ימים`}
                  aside={n ? `היום: ${actionsText(f.activity.days[n - 1].actions, f.activity.days[n - 1].tasksDone)}` : undefined}
                  data={f.activity.days.map((d, i) => ({ key: d.day, value: d.actions, on: i === n - 1, label: axisAt(i, n) ? ddmm(d.day) : '', tip: `${i === n - 1 ? 'היום' : `${dayName(d.day)} ${ddmm(d.day)}`}: ${actionsText(d.actions, d.tasksDone)}` }))} />
                <div className="df-row df-pair">
                  <DCard title="מי ביצע הכי הרבה"><Ranking empty="לא בוצעו משימות בתקופה הזאת" items={f.tasks.doers.map((d) => ({ key: d.name, label: <span title={d.name}>{d.name}</span>, value: d.count }))} /></DCard>
                  <BarsCard title="לפי יום בשבוע" label="פעולות לפי יום בשבוע" aside={f.activity.total ? `${DAY_NAMES[topDay]}: ${fmt(f.activity.weekday[topDay])}` : undefined}
                    data={f.activity.weekday.map((v, i) => ({ key: String(i), value: v, on: i === topDay && v > 0, label: DAY_LETTERS[i], tip: `${DAY_NAMES[i]}: ${many(v, 'פעולה אחת', 'פעולות')}`, aside: `${DAY_NAMES[i]}: ${fmt(v)}` }))} />
                </div>
                <p className="df-note">כל פעולה שנרשמה ביומן הפעילות: משימה שנוספה או בוצעה, קנייה, אירוע, ביקור ועוד.{st.data.days > n ? ` בגרף: ${fmt(n)} הימים האחרונים. המספר שבכותרת וימי השבוע: כל התקופה.` : ''}</p>
              </Col>
              <Col width={360}>
                <DCard title="קניות"><Nums items={[{ value: fmt(f.shopping.bought), label: 'נקנו' }, { value: fmt(f.shopping.added), label: 'נוספו' }, { value: fmt(f.shopping.open), label: 'ברשימה' }]} /></DCard>
                <DCard title="ביקורים"><Nums items={[{ value: fmt(f.visits.requests), label: 'בקשות' }, { value: fmt(f.visits.approved), label: 'אושרו' }, { value: fmt(f.visits.waiting), label: f.visits.waiting === 1 ? 'מחכה' : 'מחכות' }]} /></DCard>
                <DCard title={`אנשים · ${fmt(f.people.total)}`} aside={`הצטרפו ${joinedIn(st.data.days)}: ${fmt(f.people.joined)}`}>
                  <Ranking items={Object.entries(f.people.byRole).sort((a, b) => b[1] - a[1]).map(([r, c]) => ({ key: r, label: ROLE[r] || 'אחר', value: c }))} />
                </DCard>
                {f.people.blocked > 0 && <p className="df-note">חסומים: {fmt(f.people.blocked)}</p>}
              </Col>
            </Cols>
          </>
        )}
      </div>
    </Page>
  );
}
