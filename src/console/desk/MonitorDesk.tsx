// ניטור on a computer: the morning check as a week (check × day), what went wrong lately, the owners' alerts, the quota.
import { monitorAlertControls } from '../delivery';
import { dayTime } from '../../app/v2/format';
import { ago, type useLoad } from '../shared';
import { type Health, type HealthState, type Monitor, type MonitorEvent } from '../source';
import { Act, Btn, Col, Cols, DCard, DDot, Fact, Facts, Failed, Page, Skeleton, Switch, Table, type Column } from './desk';
import { useRest } from './route';
import { checkDetail, checkName, DOT, eventLong, eventsOf, eventWhen, QuotaBody, QuotaSkeleton, STATE, weekDay, type Notify } from './statusParts';

type MonLoad = ReturnType<typeof useLoad<Monitor>>;
export type AlertActions = { busy: boolean; set: (b: { on?: boolean; push?: boolean; daily?: boolean }) => void; test: () => void };

export function MonitorDesk({ mon, busy, checkNow, alerts, notify }: { mon: MonLoad; busy: boolean; checkNow: () => void; alerts: AlertActions; notify: Notify }) {
  const m = mon.data;
  const [rest, setRest] = useRest('monitor');
  const pick = rest[0] || null;
  const setPick = (id: string | null) => setRest(id ? [id] : []);
  const item = m?.health?.items.find((i) => i.id === pick) || null;
  return (
    <Page group="מצב" title="ניטור" sub="השרת בודק את עצמו כל רבע שעה, ובדיקה מלאה כל בוקר ב־07:00"
      actions={<Btn kind="action" icon="pulse" onClick={checkNow} disabled={busy || !m}>{busy ? 'בודק…' : 'בדיקה עכשיו'}</Btn>}>
      {mon.error && !m ? <DCard><Failed text={`לא הצלחנו לקרוא את הניטור. ${mon.error}`} retry={mon.reload} /></DCard> : (
        <>
        {mon.error && <DCard><Failed text={`הרענון לא הצליח, ומוצג מה שנקרא קודם. ${mon.error}`} retry={mon.reload} /></DCard>}
        <Cols className={busy ? 'ds-mon ds-busy' : 'ds-mon'}>
          <Col>
            <WeekCard m={m} pick={pick} onPick={(id) => setPick(id === pick ? null : id)} />
            <DCard title="מה קרה לאחרונה" tight>{m ? <Events m={m} /> : <Skeleton lines={4} height={18} />}</DCard>
          </Col>
          <Col width={360}>
            {item && m && <CheckCard m={m} i={item} onClose={() => setPick(null)} />}
            <AlertsCard m={m} act={alerts} />
            <DCard title="המכסה החינמית" aside={m?.quota && !m.quota.error ? <span title="מתחדשת כל יום ב־10:00 (חצות בקליפורניה)">נמדד {ago(m.quota.at)}</span> : undefined}>
              {m ? <QuotaBody m={m} notify={notify} /> : <QuotaSkeleton />}
              {m?.quota && !!m.quota.error && <p className="ds-text">המכסה של מסד הנתונים מתחדשת כל יום ב־10:00 (חצות בקליפורניה).</p>}
            </DCard>
          </Col>
        </Cols>
        </>
      )}
    </Page>
  );
}

type Item = Health['items'][number];
const Legend = () => <span className="ds-legend"><DDot tone="ok" /> תקין <DDot tone="warn" /> לשים לב <DDot tone="bad" /> נכשל</span>;
const StateDot = ({ s, tip }: { s: HealthState | undefined; tip: string }) => (s ? <span title={tip}><DDot tone={DOT[s]} size={10} label={STATE[s]} /></span> : <span className="ds-none" title={`${tip}: לא נבדק`}>–</span>);

/** The week, when the server keeps it; else only today's column, with what the check found beside it. */
function WeekCard({ m, pick, onPick }: { m: Monitor | null; pick: string | null; onPick: (id: string) => void }) {
  const h = m?.health;
  const week = m?.week;
  const days = week || (h ? [{ date: h.date, states: Object.fromEntries(h.items.map((i) => [i.id, i.state])) }] : []);
  const columns: Column<Item>[] = [
    { key: 'name', head: 'בדיקה', strong: true, cell: (i) => checkName(i) },
    ...(week ? [] : [{ key: 'detail', head: 'מה נמצא', soft: true, wrap: true, cell: (i: Item) => checkDetail(i, m?.cronAt || null, ago) } as Column<Item>]),
    ...days.map((d): Column<Item> => ({ key: d.date, head: <span title={d.date === h?.date ? `רצה ${ago(h.at)}${h.by !== 'cron' ? ` · ${h.by}` : ''}` : undefined}>{weekDay(d.date)}</span>, width: 88, align: 'center',
      cell: (i) => <StateDot s={d.states[i.id]} tip={d.date === h?.date ? `${weekDay(d.date)}: ${i.detail}` : `${weekDay(d.date)}: ${d.states[i.id] ? STATE[d.states[i.id]] : ''}`} /> })),
  ];
  return (
    <DCard title={week || !m ? 'בדיקת הבוקר, שבוע אחורה' : 'בדיקת הבוקר, היום'} aside={<Legend />} tight>
      {!m ? <Skeleton lines={8} height={20} /> : !h ? <p className="d-empty d-empty--inline">הבדיקה הראשונה תרוץ מחר ב־07:00, או עכשיו בכפתור למעלה.</p>
        : <div className="ds-week"><Table label="בדיקת הבוקר לפי ימים" columns={columns} rows={h.items} rowKey={(i) => i.id} selected={pick} onSelect={onPick} empty="אין בדיקות" /></div>}
    </DCard>
  );
}

/** One check, as this morning's run found it. Shown only after a row is picked. */
function CheckCard({ m, i, onClose }: { m: Monitor; i: Item; onClose: () => void }) {
  const before = (m.week || []).filter((d) => d.date !== m.health!.date && d.states[i.id] && d.states[i.id] !== 'ok').reverse();
  return (
    <DCard title={checkName(i)} aside={<Act onClick={onClose}>סגירה</Act>}>
      <Facts>
        <Fact label="היום" labelWidth={80}><span className="ds-inline"><DDot tone={DOT[i.state]} /> {STATE[i.state]}</span></Fact>
        <Fact label="מה נמצא" labelWidth={80}>{i.detail}</Fact>
        <Fact label="נבדק" labelWidth={80}>{daysTime(m.health!)}</Fact>
        {m.week && <Fact label="השבוע" labelWidth={80}>{before.length ? before.map((d) => `${weekDay(d.date)}: ${d.states[i.id] === 'bad' ? 'נכשל' : STATE[d.states[i.id]]}`).join(' · ') : 'תקין בשאר הימים'}</Fact>}
      </Facts>
    </DCard>
  );
}
const daysTime = (h: Health) => `${dayTime(h.at)}${h.by !== 'cron' ? ` · ${h.by}` : ''}`;

function Events({ m }: { m: Monitor }) {
  const { items, told } = eventsOf(m);
  const columns: Column<MonitorEvent>[] = [
    { key: 'at', head: 'מתי', width: 154, soft: true, cell: (e) => eventWhen(e.at) },
    { key: 'what', head: 'מה', strong: true, cell: (e) => e.he },
    { key: 'long', head: 'כמה זמן', width: 114, cell: (e) => eventLong(e) },
    ...(told ? [{ key: 'told', head: 'התראה', width: 124, cell: (e: MonitorEvent) => (e.alerted ? 'נשלחה' : 'לא נשלחה') } as Column<MonitorEvent>] : []),
  ];
  return <div className="ds-events"><Table label="מה קרה לאחרונה" columns={columns} rows={items} rowKey={(e) => e.at + e.kind} empty={told ? 'לא קרה דבר חריג לאחרונה.' : 'האתר לא נפל לאחרונה.'} /></div>;
}

function AlertsCard({ m, act }: { m: Monitor | null; act: AlertActions }) {
  const a = m?.alerts;
  const c = m && monitorAlertControls(m);
  const row = (title: string, text: string, on: boolean, change: (v: boolean) => void, off?: boolean) => (
    <div className="ds-alert"><span><b>{title}</b><span>{text}</span></span><Switch on={on} onChange={change} label={title} disabled={act.busy || off} /></div>
  );
  return (
    <DCard title="התראות לבעלים">
      {!a || !c ? <Skeleton lines={6} height={18} /> : (
        <>
          <div className="ds-alerts">
            {row('להתריע כשמשהו לא בסדר', c.app.text, c.app.on, (on) => act.set({ on }), c.app.blocked)}
            {row('גם לטלפון', c.phone.text, c.phone.on, (push) => act.set({ push }), c.phone.blocked)}
            {a.daily !== undefined && row('סיכום בוקר יומי', c.daily.text, c.daily.on, (daily) => act.set({ daily }), c.daily.blocked)}
          </div>
          <p className="ds-text">התראה נשלחת כשהאתר לא עונה חצי שעה, כשבדיקת הבוקר מוצאת בעיה, או כשהמכסה עוברת 80%. אותה התראה לא חוזרת לפני 12 שעות.{a.updatedBy && ` שונה לאחרונה על ידי ${a.updatedBy}, ${ago(a.updatedAt)}.`}</p>
          <Btn icon="bell" onClick={act.test} disabled={act.busy}>לשלוח התראת בדיקה אליי</Btn>
        </>
      )}
    </DCard>
  );
}
