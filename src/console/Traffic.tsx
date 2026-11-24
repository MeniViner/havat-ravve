// ביקורים ושימוש: how many came to the site and to the app, where from, what they looked at and pressed, and when.
// Counted by the farm itself (api/src/traffic.ts): daily totals only, no names, no ids, no outside service.
import { useState } from 'react';
import { BarList, Card, Chip, ChipRow, EmptyState, StatRow, StatTile, Strip } from '../app/v2/kit';
import { ddmm, dayName } from '../app/v2/format';
import { fmt, Section, useLoad } from './shared';
import { Columns } from './charts';
import { source, type Ranked, type Traffic } from './source';
import { useWide } from './desk/route';
import { inLast, periodText } from './desk/farm';
import { dayBars, TrafficDesk } from './desk/TrafficDesk';
import { CLICK, DEPTH, DEVICE, pct, ROLE, SCREEN, SECTION, SOURCE, TIME, trafficPeriods } from './trafficNames';

/** A ranked list as bars: the count, and its share of `whole` (visits or opens). */
const bars = (r: Ranked, names: Record<string, string>, whole?: number) =>
  r.map((x) => ({ label: names[x.key] || x.key, value: x.count, display: whole ? <><b className="k-num">{fmt(x.count)}</b> <span className="c-soft">· {pct(x.count, whole)}%</span></> : <b className="k-num">{fmt(x.count)}</b> }));
const hourAxis = (h: number) => (h % 3 === 0 ? String(h) : '');

const monthly = (bars: ReturnType<typeof dayBars>['bars']) => bars.map((b, i) => ({ key: b.key, value: b.value, tip: b.tip, axis: (bars.length - 1 - i) % 2 === 0 ? b.label : '' }));

export function TrafficScreen() {
  const [days, setDays] = useState(30);
  const st = useLoad(() => source.traffic(days), [days]);
  return useWide() ? <TrafficDesk st={st} days={days} setDays={setDays} /> : <TrafficPhone st={st} days={days} setDays={setDays} />;
}

function TrafficPhone({ st, days, setDays }: { st: { data: Traffic | null; loading: boolean; error: string | null }; days: number; setDays: (d: number) => void }) {
  const d = st.data;
  const step = d ? Math.max(1, Math.ceil(d.perDay.length / 6)) : 1;
  // a year of days is too many columns for a phone: a column per month
  const year = !!d && d.perDay.length > 180;
  const empty = d && d.totals.views === 0 && d.totals.opens === 0;
  const mobile = d ? (d.site.devices.find((x) => x.key === 'mobile')?.count || 0) + (d.site.devices.find((x) => x.key === 'installed')?.count || 0) : 0;
  const installed = d ? d.app.devices.find((x) => x.key === 'installed')?.count || 0 : 0;
  const appDevices = d ? d.app.devices.reduce((a, x) => a + x.count, 0) : 0;
  return (
    <>
      <div className="c-title">
        <div>
          <h1 className="c-h1">ביקורים ושימוש</h1>
          <p className="c-sub">כמה נכנסו לאתר ולאפליקציה {inLast(days)}, מאיפה הגיעו ומה עשו. נספר אצלנו, בלי שירות חיצוני ובלי פרטים אישיים.</p>
        </div>
      </div>
      <ChipRow label="תקופה">{trafficPeriods(d).map((p) => <Chip key={p} selected={days === p} onClick={() => setDays(p)}>{periodText(p)}</Chip>)}</ChipRow>
      {st.error && <Card pad="md" className="c-error">לא הצלחנו לקרוא. {st.error}</Card>}
      {st.loading && !d && <p className="c-soft">טוען…</p>}
      {d && empty && <EmptyState variant="card" icon="chart" title="עוד לא נספרו ביקורים" text="הספירה התחילה עם העדכון האחרון. המספרים יופיעו כאן אחרי הביקורים הראשונים." />}
      {d && !empty && (
        <div className={st.loading ? 'c-stack c-loading' : 'c-stack'}>
          {d.today.capped && <Strip icon="bolt">היום היו יותר מ־{fmt(d.cap)} ספירות, אז הספירה נעצרה עד חצות כדי לשמור את המכסה החינמית לאפליקציה.</Strip>}
          <Section title="היום">
            <StatRow grid>
              <StatTile value={fmt(d.today.visitors)} label="מבקרים באתר" />
              <StatTile value={fmt(d.today.views)} label="כניסות לאתר" />
              <StatTile value={fmt(d.today.users)} label="נכנסו לאפליקציה" />
              <StatTile value={fmt(d.today.opens)} label="פתיחות של האפליקציה" />
            </StatRow>
          </Section>

          <Section title={`האתר · ${fmt(d.totals.visitors)} מבקרים`}>
            <StatRow grid>
              <StatTile value={fmt(d.totals.visitors)} label="מבקרים (לפי יום)" />
              <StatTile value={fmt(d.totals.views)} label="כניסות" />
              <StatTile value={`${pct(d.totals.returning, d.totals.visitors)}%`} label="חזרו שוב" />
              <StatTile value={`${pct(mobile, d.totals.views)}%`} label="מהטלפון" />
            </StatRow>
            <Card pad="lg">
              <p className="c-card-title">{year ? 'מבקרים בכל חודש' : 'מבקרים בכל יום'}</p>
              <Columns label={`מבקרים באתר ביום, ${d.perDay.length} ימים`}
                data={year ? monthly(dayBars(d.perDay, (x) => x.visitors, (x) => `${fmt(x.visitors)} מבקרים, ${fmt(x.views)} כניסות`).bars) : d.perDay.map((x, i) => ({ key: x.day, value: x.visitors, tip: `${dayName(x.day)} ${ddmm(x.day)}: ${x.visitors} מבקרים, ${x.views} כניסות`, axis: i % step === 0 ? ddmm(x.day) : '' }))} />
            </Card>
            <div className="c-two">
              <Card pad="lg" className="c-flat">
                <p className="c-card-title">מאיפה הגיעו</p>
                {d.site.sources.length ? <BarList className="c-pct" items={bars(d.site.sources, SOURCE, d.totals.views)} /> : <p className="c-soft">עוד אין</p>}
              </Card>
              <Card pad="lg" className="c-flat">
                <p className="c-card-title">על מה לחצו</p>
                {d.site.clicks.length ? <BarList className="c-pct" items={bars(d.site.clicks, CLICK, d.totals.views)} /> : <p className="c-soft">עוד לא לחצו על כלום</p>}
              </Card>
            </div>
            <div className="c-two">
              <Card pad="lg" className="c-flat">
                <p className="c-card-title">מה ראו באתר</p>
                {d.site.sections.length ? <BarList className="c-pct" items={bars(d.site.sections, SECTION, d.totals.views)} /> : <p className="c-soft">עוד אין</p>}
                <p className="c-note">האחוז: מתוך כל הכניסות, כמה הגיעו לחלק הזה בדף.</p>
              </Card>
              <Card pad="lg" className="c-flat">
                <p className="c-card-title">כמה זמן נשארו</p>
                <BarList className="c-pct" items={bars(d.site.time, TIME, d.site.time.reduce((a, x) => a + x.count, 0))} />
                <p className="c-card-title">עד איפה גללו</p>
                <BarList className="c-pct" items={bars(d.site.depth, DEPTH, d.site.depth.reduce((a, x) => a + x.count, 0))} />
              </Card>
            </div>
            <Card pad="lg">
              <p className="c-card-title">באיזו שעה נכנסים</p>
              <Columns pick="max" label="כניסות לאתר לפי שעה ביום" height={80} data={d.site.hours.map((v, h) => ({ key: String(h), value: v, tip: `${String(h).padStart(2, '0')}:00–${String(h).padStart(2, '0')}:59: ${v} כניסות`, axis: hourAxis(h) }))} />
            </Card>
          </Section>

          <Section title={`האפליקציה · ${fmt(d.totals.users)} כניסות של אנשים`}>
            <StatRow grid>
              <StatTile value={fmt(d.totals.users)} label="אנשים שנכנסו (לפי יום)" />
              <StatTile value={fmt(d.totals.opens)} label="פתיחות" />
              <StatTile value={`${pct(installed, appDevices)}%`} label="מאפליקציה מותקנת" />
              <StatTile value={d.totals.users ? (d.totals.opens / d.totals.users).toFixed(1) : '0'} label="פתיחות לאדם ביום" />
            </StatRow>
            <Card pad="lg">
              <p className="c-card-title">{year ? 'אנשים בכל חודש' : 'אנשים בכל יום'}</p>
              <Columns label={`אנשים שנכנסו לאפליקציה ביום, ${d.perDay.length} ימים`}
                data={year ? monthly(dayBars(d.perDay, (x) => x.users, (x) => `${fmt(x.users)} אנשים, ${fmt(x.opens)} פתיחות`).bars) : d.perDay.map((x, i) => ({ key: x.day, value: x.users, tip: `${dayName(x.day)} ${ddmm(x.day)}: ${x.users} אנשים, ${x.opens} פתיחות`, axis: i % step === 0 ? ddmm(x.day) : '' }))} />
            </Card>
            <div className="c-two">
              <Card pad="lg" className="c-flat">
                <p className="c-card-title">המסכים שנפתחו הכי הרבה</p>
                {d.app.screens.length ? <BarList className="c-pct" items={bars(d.app.screens.slice(0, 10), SCREEN)} /> : <p className="c-soft">עוד אין</p>}
              </Card>
              <Card pad="lg" className="c-flat">
                <p className="c-card-title">מי נכנס</p>
                {d.app.roles.length ? <BarList className="c-pct" items={bars(d.app.roles, ROLE, d.app.roles.reduce((a, x) => a + x.count, 0))} /> : <p className="c-soft">עוד אין</p>}
                <p className="c-card-title">מאיפה</p>
                {d.app.devices.length ? <BarList className="c-pct" items={bars(d.app.devices, DEVICE, appDevices)} /> : <p className="c-soft">עוד אין</p>}
              </Card>
            </div>
            <Card pad="lg">
              <p className="c-card-title">באיזו שעה משתמשים</p>
              <Columns pick="max" label="פתיחות של האפליקציה לפי שעה ביום" height={80} data={d.app.hours.map((v, h) => ({ key: String(h), value: v, tip: `${String(h).padStart(2, '0')}:00–${String(h).padStart(2, '0')}:59: ${v} פתיחות`, axis: hourAxis(h) }))} />
            </Card>
          </Section>
          <p className="c-note">איך זה נספר: כל כניסה שולחת לשרת שלנו רק מספרים (איזה חלק בדף, מאיזה סוג אתר הגיעו, טלפון או מחשב). לא נשמרים שמות, כתובות או מזהים. מבקר נספר פעם אחת ביום בכל דפדפן. ההדגמה, בדיקות ומסכי התצוגה המקדימה לא נספרים.</p>
        </div>
      )}
    </>
  );
}
