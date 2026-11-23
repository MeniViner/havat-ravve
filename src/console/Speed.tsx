// מהירות: how long the server takes to answer, from each request's own time in the assistant log, the 5-minute round
// and the site check. In seconds, in words an owner reads: a usual request, almost all requests, the slow ones.
import { useState } from 'react';
import { BarList, Card, Chip, ChipRow, EmptyState, ListCard, Row, StatRow, StatTile } from '../app/v2/kit';
import { ddmm, dayName } from '../app/v2/format';
import { ago, fmt, Section, useLoad } from './shared';
import { Columns } from './charts';
import { source } from './source';

const PERIODS = [1, 7, 30] as const;
const periodText = (d: number) => (d === 1 ? 'יממה' : d === 7 ? 'שבוע' : 'חודש');
const JOB: Record<string, string> = { email: 'מיילים על תשלומים', accounts: 'מחיקת חשבונות', push: 'התראות לטלפון', backup: 'גיבוי לילי', cleanup: 'ניקוי רשומות ישנות', monitor: 'ניטור' };
/** 0.4 שנ׳; under a tenth of a second, said so. */
export const sec = (ms: number) => (ms < 100 ? 'פחות מ־0.1 שנ׳' : `${(ms / 1000).toFixed(1)} שנ׳`);
const verdict = (p95: number) => (p95 < 1200 ? { t: 'השרת מהיר', d: 'כמעט כל בקשה נענית תוך פחות משנייה וחצי.' } : p95 < 3000 ? { t: 'השרת בסדר', d: 'רוב הבקשות מהירות, וחלק לוקחות כמה שניות.' } : { t: 'השרת איטי', d: 'יותר מדי בקשות לוקחות יותר מ־3 שניות. כדאי לבדוק מה איטי ברשימה למטה.' });

export function SpeedScreen() {
  const [days, setDays] = useState(7);
  const st = useLoad(() => source.speed(days), [days]);
  const d = st.data;
  const step = d ? Math.max(1, Math.ceil(d.perDay.length / 6)) : 1;
  const v = d && verdict(d.total.p95);
  return (
    <>
      <div className="c-title">
        <div>
          <h1 className="c-h1">מהירות</h1>
          <p className="c-sub">כמה זמן לוקח לשרת לענות. נמדד בכל בקשה: של מפתחות ה־API (כמו האינסטינקט) ושל הקונסולה.</p>
        </div>
      </div>
      <ChipRow label="תקופה">{PERIODS.map((p) => <Chip key={p} selected={days === p} onClick={() => setDays(p)}>{periodText(p)}</Chip>)}</ChipRow>
      {st.error && <Card pad="md" className="c-error">לא הצלחנו לחשב. {st.error}</Card>}
      {st.loading && !d && <p className="c-soft">מחשב…</p>}
      {d && !d.total.count && <EmptyState variant="card" icon="chart" title="אין עדיין בקשות בתקופה הזאת" text="המהירות נמדדת בכל בקשה של מפתח API או של הקונסולה." />}
      {d && !!d.total.count && v && (
        <div className={st.loading ? 'c-stack c-loading' : 'c-stack'}>
          <Card pad="lg" className={d.total.p95 < 3000 ? 'c-flat' : 'c-warn'}>
            <p className="c-card-title">{v.t}</p>
            <p className="c-note">{v.d}</p>
          </Card>
          <StatRow grid>
            <StatTile value={sec(d.total.p50)} label="בקשה רגילה" />
            <StatTile value={sec(d.total.p95)} label="95% מהבקשות עד" />
            <StatTile value={fmt(d.total.slow)} label={`איטיות (מעל ${d.slowMs / 1000} שנ׳)`} />
            <StatTile value={fmt(d.total.errors)} label="תקלות בשרת" />
          </StatRow>
          {!!d.perDay.length && (
            <Section title="95% מהבקשות נענו תוך">
              <Card pad="lg">
                <Columns label={`זמן התשובה של 95% מהבקשות, בכל יום, ${d.perDay.length} ימים`}
                  data={d.perDay.map((x, i) => ({ key: x.day, value: x.p95, tip: `${dayName(x.day)} ${ddmm(x.day)}: ${x.count} בקשות, רגילה ${sec(x.p50)}, 95% עד ${sec(x.p95)}`, axis: i % step === 0 ? ddmm(x.day) : '' }))} />
                <p className="c-note">עמודה גבוהה: באותו יום היו בקשות איטיות יותר. יום בלי עמודה: לא היו בקשות.</p>
              </Card>
            </Section>
          )}
          <Section title={`לפי פעולה · ${fmt(d.ops.length)}`}>
            <Card pad="lg" className="c-flat">
              <div className="c-tablewrap">
                <table className="c-table">
                  <thead><tr><th>פעולה</th><th>בקשות</th><th>רגילה</th><th>95% עד</th></tr></thead>
                  <tbody>{d.ops.map((o) => (
                    <tr key={o.op} title={`${o.op} · הכי איטית: ${sec(o.max)}${o.errors ? ` · ${o.errors} תקלות` : ''}`}>
                      <td>{o.he || o.op}{o.errors ? <span className="c-soft"> · {o.errors} תקלות</span> : null}</td>
                      <td className="k-num">{fmt(o.count)}</td><td className="k-num">{sec(o.p50)}</td><td className="k-num">{sec(o.p95)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              {d.truncated && <p className="c-note">בתקופה היו יותר מ־4,000 בקשות. החישוב לפי 4,000 האחרונות.</p>}
            </Card>
          </Section>
          {!!d.slowest.length && (
            <Section title="הבקשות האיטיות ביותר">
              <ListCard>{d.slowest.map((s, i) => <Row key={i} title={s.he || s.op} meta={`${s.key || 'מפתח'} · ${ago(s.at)}${s.status >= 500 ? ' · נכשלה' : ''}`} value={<bdi className="k-num">{sec(s.ms)}</bdi>} />)}</ListCard>
            </Section>
          )}
          <div className="c-two">
            <Section title="הסבב של כל 5 דקות">
              <Card pad="lg" className="c-flat">
                {d.cron.wallMs !== null && <p className="c-note">הסבב האחרון ({d.cron.at ? ago(d.cron.at) : ''}) נמשך <b>{sec(d.cron.wallMs)}</b>.</p>}
                {d.cron.jobs.length ? <BarList className="c-pct" items={d.cron.jobs.map((j) => ({ label: JOB[j.id] || j.id, value: j.ms, display: <b className="k-num">{sec(j.ms)}</b> }))} /> : <p className="c-soft">עוד לא היה סבב מאז העדכון</p>}
              </Card>
            </Section>
            <Section title="האתר">
              <Card pad="lg" className="c-flat">
                {d.site.checks ? <p className="c-note">בבדיקות האחרונות ({fmt(d.site.checks)}), האתר נטען בדרך כלל תוך <b>{sec(d.site.p50)}</b>, ו־95% מהפעמים תוך <b>{sec(d.site.p95)}</b>.</p> : <p className="c-soft">עוד אין בדיקות</p>}
              </Card>
            </Section>
          </div>
        </div>
      )}
    </>
  );
}
