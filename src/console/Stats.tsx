// סטטיסטיקות: how the farm is doing over a period: people, tasks (who did the most), shopping, visits, and how busy
// each day and each weekday was.
import { useState } from 'react';
import { BarList, Card, Chip, ChipRow, StatRow, StatTile } from '../app/v2/kit';
import { ddmm, dayName } from '../app/v2/format';
import { fmt, Section, useLoad } from './shared';
import { Columns } from './charts';
import { source } from './source';

export const PERIODS = [7, 30, 90, 365] as const;
export const periodText = (d: number) => (d === 7 ? 'שבוע' : d === 30 ? 'חודש' : d === 90 ? '3 חודשים' : 'שנה');
const ROLE: Record<string, string> = { owner: 'בעלים', manager: 'מנהלים', staff: 'צוות', vendor: 'דוכנים', guest: 'אורחים' };
const WEEKDAY = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

export function Period({ days, onChange }: { days: number; onChange: (d: number) => void }) {
  return <ChipRow label="תקופה">{PERIODS.map((d) => <Chip key={d} selected={days === d} onClick={() => onChange(d)}>{periodText(d)}</Chip>)}</ChipRow>;
}

export function StatsScreen() {
  const [days, setDays] = useState(30);
  const st = useLoad(() => source.stats(days), [days]);
  const f = st.data?.farm;
  const step = f ? Math.max(1, Math.ceil(f.activity.days.length / 6)) : 1;
  return (
    <>
      <div className="c-title">
        <div>
          <h1 className="c-h1">סטטיסטיקות</h1>
          <p className="c-sub">מה קרה בחווה ב{periodText(days)} האחרון: משימות, קניות, ביקורים ואנשים.</p>
        </div>
      </div>
      <Period days={days} onChange={setDays} />
      {st.error && <Card pad="md" className="c-error">לא הצלחנו לחשב. {st.error}</Card>}
      {st.loading && !f && <p className="c-soft">מחשב…</p>}
      {f && (
        <div className={st.loading ? 'c-stack c-loading' : 'c-stack'}>
          <Section title="משימות">
            <StatRow grid>
              <StatTile value={fmt(f.tasks.done)} label="בוצעו" />
              <StatTile value={fmt(f.tasks.created)} label="נוספו" />
              <StatTile value={fmt(f.tasks.open)} label="פתוחות עכשיו" />
              <StatTile value={fmt(f.tasks.overdue)} label="באיחור" />
            </StatRow>
            {!!f.tasks.doers.length && (
              <Card pad="lg" className="c-flat">
                <p className="c-card-title">מי ביצע הכי הרבה</p>
                <BarList items={f.tasks.doers.map((d) => ({ label: d.name, value: d.count, display: fmt(d.count) }))} />
              </Card>
            )}
          </Section>
          <Section title={`כמה פעולות היו בכל יום · ${fmt(f.activity.total)}`}>
            <Card pad="lg">
              <Columns label={`פעולות ביום, ${f.activity.days.length} ימים`}
                data={f.activity.days.map((d, i) => ({ key: d.day, value: d.actions, tip: `${dayName(d.day)} ${ddmm(d.day)}: ${d.actions} פעולות, ${d.tasksDone} משימות בוצעו`, axis: i % step === 0 ? ddmm(d.day) : '' }))} />
              <p className="c-note">כל פעולה שנרשמה ביומן הפעילות: משימה שנוספה או בוצעה, קנייה, אירוע, ביקור ועוד.</p>
            </Card>
            <Card pad="lg">
              <p className="c-card-title">לפי יום בשבוע</p>
              <Columns rtl label="פעולות לפי יום בשבוע" height={80} data={f.activity.weekday.map((v, i) => ({ key: String(i), value: v, tip: `${WEEKDAY[i]}: ${v} פעולות`, axis: WEEKDAY[i] }))} />
            </Card>
          </Section>
          <div className="c-two">
            <Section title="קניות">
              <StatRow grid>
                <StatTile value={fmt(f.shopping.bought)} label="נקנו" />
                <StatTile value={fmt(f.shopping.added)} label="נוספו לרשימה" />
                <StatTile value={fmt(f.shopping.open)} label="ברשימה עכשיו" />
              </StatRow>
            </Section>
            <Section title="ביקורים">
              <StatRow grid>
                <StatTile value={fmt(f.visits.requests)} label="בקשות" />
                <StatTile value={fmt(f.visits.approved)} label="אושרו" />
                <StatTile value={fmt(f.visits.people)} label="מבקרים שאושרו" />
                <StatTile value={fmt(f.visits.waiting)} label="מחכות לתשובה" />
              </StatRow>
            </Section>
          </div>
          <Section title={`אנשים · ${fmt(f.people.total)}`}>
            <Card pad="lg" className="c-flat">
              <BarList items={Object.entries(f.people.byRole).sort((a, b) => b[1] - a[1]).map(([r, n]) => ({ label: ROLE[r] || r, value: n, display: fmt(n) }))} />
              <p className="c-note">הצטרפו ב{periodText(days)} האחרון: {fmt(f.people.joined)}{f.people.blocked ? ` · חסומים: ${fmt(f.people.blocked)}` : ''}</p>
            </Card>
          </Section>
        </div>
      )}
    </>
  );
}
