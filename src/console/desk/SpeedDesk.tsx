// מהירות on a computer: four tiles, the days' chart, every operation's times, the slowest requests and the 5-minute round.
import { useState } from 'react';
import { ddmm, dayName, daysFromToday } from '../../app/v2/format';
import { ago, fmt, many } from '../shared';
import type { Speed } from '../source';
import { Act, Chips, Col, Cols, DCard, Empty, Fact, Facts, Failed, Mono, Page, Ranking, Skeleton, SkeletonTiles, Small, Table, Tiles, VBars, type Column } from './desk';
import { opShort, sec } from './statusParts';

export const PERIODS = [1, 7, 30] as const;
export const periodText = (d: number) => (d === 1 ? 'יממה' : d === 7 ? 'שבוע' : 'חודש');
export const JOB: Record<string, string> = { email: 'מיילים על תשלומים', accounts: 'מחיקת חשבונות', push: 'התראות לטלפון', backup: 'גיבוי לילי', cleanup: 'ניקוי רשומות', monitor: 'ניטור' };
export const verdict = (p95: number) => (p95 < 1200 ? { t: 'השרת מהיר', d: 'כמעט כל בקשה נענית תוך פחות משנייה וחצי.' } : p95 < 3000 ? { t: 'השרת בסדר', d: 'רוב הבקשות מהירות, וחלק לוקחות כמה שניות.' } : { t: 'השרת איטי', d: 'יותר מדי בקשות לוקחות יותר מ־3 שניות. כדאי לבדוק מה איטי ברשימה למטה.' });

type P = { st: { data: Speed | null; error: string | null; loading: boolean; reload: () => void }; days: number; setDays: (d: number) => void };
type Op = Speed['ops'][number];
/** The table opens with the most used operations (slowest first, as the server sorts them); the rest are one click away. */
const COMMON = 7;

export function SpeedDesk({ st, days, setDays }: P) {
  const d = st.data;
  return (
    <Page group="מצב" title="מהירות" sub="כמה זמן לוקח לשרת לענות, לפי בקשות אמיתיות"
      actions={<Chips label="תקופה" value={String(days)} onChange={(v) => setDays(Number(v))} options={PERIODS.map((p) => ({ value: String(p), label: periodText(p) }))} />}>
      {st.error && <DCard><Failed text={`לא הצלחנו לחשב. ${st.error}`} retry={st.reload} /></DCard>}
      {!d && !st.error && (
        <>
          <SkeletonTiles n={4} />
          <Cols><Col><DCard><Skeleton lines={6} height={14} /></DCard><DCard><Skeleton lines={8} height={18} /></DCard></Col><Col width={380}><DCard><Skeleton lines={4} /></DCard><DCard><Skeleton lines={6} /></DCard></Col></Cols>
        </>
      )}
      {d && !d.total.count && <DCard><Empty>אין עדיין בקשות בתקופה הזאת. המהירות נמדדת בכל בקשה של מפתח API או של הקונסולה.</Empty></DCard>}
      {d && !!d.total.count && <Body key={d.days} d={d} busy={st.loading} />}
    </Page>
  );
}

function Body({ d, busy }: { d: Speed; busy: boolean }) {
  const [pick, setPick] = useState<string | null>(null);
  const op = d.ops.find((o) => o.op === pick) || null;
  const v = verdict(d.total.p95);
  const jobs = d.cron.jobs.map((j) => ({ ...j, tenths: j.ms > 0 ? Math.max(1, Math.round(j.ms / 100)) : 0 }));
  return (
    <div className={busy ? 'ds-speed ds-busy' : 'ds-speed'}>
      <Tiles items={[
        { value: sec(d.total.p50), label: 'בקשה רגילה' }, { value: sec(d.total.p95), label: '95% מהבקשות עד' },
        { value: fmt(d.total.slow), label: `איטיות, מעל ${d.slowMs / 1000} שנ׳` }, { value: fmt(d.total.errors), label: 'תקלות בשרת' },
      ]} />
      <Cols>
        <Col>
          {!!d.perDay.length && <Days d={d} />}
          <Ops d={d} pick={pick} onPick={(k) => setPick(k === pick ? null : k)} />
        </Col>
        <Col width={380}>
          {op && <OpCard o={op} onClose={() => setPick(null)} />}
          <DCard title="הבקשות האיטיות ביותר">
            {d.slowest.length ? <Facts style={{ marginTop: -4 }}>{d.slowest.map((s, i) => <Fact key={i} label={sec(s.ms)}><span title={s.at ? ago(s.at) : undefined}>{opShort(s.he) || <Mono>{s.op}</Mono>} · {s.key || 'מפתח'}{s.at && ` · ${daysFromToday(s.at) === 0 ? ago(s.at) : ddmm(s.at)}`}{s.status >= 500 && ' · נכשלה'}</span></Fact>)}</Facts>
              : <p className="d-empty d-empty--inline">אין בקשות איטיות בתקופה הזאת.</p>}
          </DCard>
          <DCard title="הסבב של כל 5 דקות" aside={d.cron.wallMs !== null ? <span title={d.cron.at ? ago(d.cron.at) : undefined}>האחרון: {sec(d.cron.wallMs)}</span> : undefined}>
            {jobs.length ? <Ranking items={jobs.map((j) => ({ key: j.id, label: <span title={`${sec(j.ms)} · ${ago(j.at)}${j.ok ? '' : ' · נכשל'}`}>{JOB[j.id] || 'משימה נוספת'}</span>, value: j.tenths, text: fmt(j.tenths) }))} /> : <p className="d-empty d-empty--inline">עוד לא היה סבב מאז העדכון.</p>}
            {!!jobs.length && <span className="ds-foot">בעשיריות שנייה. התקרה בתוכנית החינמית היא 50 פניות לריצה.</span>}
          </DCard>
          <DCard title={v.t}>
            <p className="ds-text ds-text--only">{v.d} {d.site.checks ? <>האתר עצמו נטען בדרך כלל תוך <b>{sec(d.site.p50)}</b>, ו־95% מהפעמים תוך <b>{sec(d.site.p95)}</b> ({fmt(d.site.checks)} בדיקות).</> : 'האתר עוד לא נבדק.'}</p>
          </DCard>
        </Col>
      </Cols>
    </div>
  );
}

function Days({ d }: { d: Speed }) {
  const [over, setOver] = useState<string | null>(null);
  const last = d.perDay[d.perDay.length - 1];
  const x = d.perDay.find((p) => p.day === over) || last;
  const step = Math.max(1, Math.ceil(d.perDay.length / 10));
  const name = daysFromToday(x.day) === 0 ? 'היום' : `${dayName(x.day)} ${ddmm(x.day)}`;
  return (
    <DCard title="95% מהבקשות נענו תוך" aside={<span aria-live="polite">{name}: {x.count ? <>{sec(x.p95)} · {many(x.count, 'בקשה אחת', 'בקשות')}</> : 'לא היו בקשות'}</span>}>
      <div className="ds-chart" onMouseLeave={() => setOver(null)}>
        <VBars height={126} label={`זמן התשובה של 95% מהבקשות, בכל יום, ${d.perDay.length} ימים. עמודה גבוהה: באותו יום היו בקשות איטיות יותר. יום בלי עמודה: לא היו בקשות`} onPick={setOver}
          data={d.perDay.map((p, i) => ({ key: p.day, value: p.p95, on: p === last, label: (d.perDay.length - 1 - i) % step === 0 ? ddmm(p.day) : '', tip: `${dayName(p.day)} ${ddmm(p.day)}: ${many(p.count, 'בקשה אחת', 'בקשות')}, רגילה ${sec(p.p50)}, 95% עד ${sec(p.p95)}` }))} />
      </div>
      {d.perDay.some((p) => !p.count) && <Small>עמודה גבוהה: באותו יום היו בקשות איטיות יותר. יום בלי עמודה: לא היו בקשות.</Small>}
    </DCard>
  );
}

const OPS: Column<Op>[] = [
  { key: 'op', head: 'פעולה', strong: true, wrap: true, cell: (o) => <span title={o.he || undefined}>{opShort(o.he) || <Mono>{o.op}</Mono>}{o.errors > 0 && <span className="ds-soft"> · {many(o.errors, 'תקלה אחת', 'תקלות')}</span>}</span> },
  { key: 'n', head: 'בקשות', width: 114, align: 'end', cell: (o) => fmt(o.count) },
  { key: 'p50', head: 'רגילה', width: 114, align: 'end', cell: (o) => sec(o.p50) },
  { key: 'p95', head: '95% עד', width: 114, align: 'end', cell: (o) => sec(o.p95) },
];
function Ops({ d, pick, onPick }: { d: Speed; pick: string | null; onPick: (k: string) => void }) {
  const [all, setAll] = useState(false);
  const more = d.ops.length > COMMON;
  const common = new Set([...d.ops].sort((a, b) => b.count - a.count).slice(0, COMMON).map((o) => o.op));
  const rows = all ? d.ops : d.ops.filter((o) => common.has(o.op));
  return (
    <DCard title="לפי פעולה" tight aside={<span className="ds-legend">{all ? `כל ${fmt(d.ops.length)} הפעולות` : `${fmt(rows.length)} הפעולות הנפוצות`}{more && <Act onClick={() => setAll(!all)}>{all ? 'רק הנפוצות' : `כל ${fmt(d.ops.length)} הפעולות`}</Act>}</span>}>
      <div className="ds-ops"><Table label="זמני התשובה לפי פעולה" columns={OPS} rows={rows} rowKey={(o) => o.op} selected={pick} onSelect={onPick} empty="אין פעולות" /></div>
      {d.truncated && <Small>בתקופה היו יותר מ־4,000 בקשות. החישוב לפי 4,000 האחרונות.</Small>}
    </DCard>
  );
}

/** One operation's numbers. Shown only after a row is picked. */
function OpCard({ o, onClose }: { o: Op; onClose: () => void }) {
  return (
    <DCard title={opShort(o.he) || <Mono>{o.op}</Mono>} aside={<Act onClick={onClose}>סגירה</Act>}>
      <Facts>
        <Fact label="בקשות">{fmt(o.count)} · {o.kind === 'write' ? 'שינוי' : 'קריאה'}</Fact>
        <Fact label="רגילה">{sec(o.p50)}</Fact>
        <Fact label="95% עד">{sec(o.p95)}</Fact>
        <Fact label="הכי איטית">{sec(o.max)}</Fact>
        <Fact label="תקלות">{o.errors ? fmt(o.errors) : 'אין'}</Fact>
        <Fact label="בקטלוג"><Mono>{o.op}</Mono></Fact>
      </Facts>
    </DCard>
  );
}
