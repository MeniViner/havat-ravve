// כסף ואירועים on a computer (K6): what came in and how it splits, the open payments as a table, money by month, and
// beside them one event as a funnel with the other events under it. Pressing another event puts it in the funnel.
import { ddmm, daysFromToday, MONTHS } from '../../app/v2/format';
import { fmt, many, outHref } from '../shared';
import { debtState, ils, KIND, saveDebts, sinceText } from '../payments';
import type { Debt, EventFunnel, Stats } from '../source';
import { Act, Btn, Col, Cols, DCard, DTag, Empty, Failed, Page, Table, type Column } from './desk';
import { BarsCard, FarmSkeleton, inLast, PeriodChips } from './farm';
import { useSelected } from './route';

const SHORT_MONTH = ['ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני', 'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳'];
const monthAt = (ym: string) => Number(ym.slice(5, 7)) - 1;

const COLS: Column<Debt>[] = [
  { key: 'who', head: 'מי', strong: true, cell: (d) => d.who || 'בלי שם' },
  { key: 'what', head: 'על מה', cell: (d) => `${KIND[d.kind]} · ${d.what}` },
  { key: 'since', head: 'ממתי', width: 110, soft: true, cell: (d) => sinceText(d.since) },
  { key: 'state', head: 'מצב', width: 130, cell: (d) => <DTag tone={d.claimed ? 'amber' : 'neutral'}>{debtState(d)}</DTag> },
  { key: 'sum', head: 'סכום', width: 80, align: 'end', strong: true, cell: (d) => ils(d.amount) },
];

export function MoneyDesk({ st, days, setDays }: { st: { data: Stats | null; loading: boolean; error: string | null; reload: () => void }; days: number; setDays: (d: number) => void }) {
  const m = st.data?.money;
  return (
    <Page group="החווה במספרים" title="כסף ואירועים" sub="מה נכנס, מה עוד מחכה, ומה כל אירוע הביא. לפי מה שסומן באפליקציה כשולם"
      actions={<><PeriodChips days={days} onChange={setDays} /><Btn icon="download" disabled={!m?.debts.length} title="התשלומים הפתוחים, כקובץ לאקסל" onClick={() => m && saveDebts(m.debts)}>אקסל</Btn></>}>
      <div className={st.loading && m ? 'df-flow is-loading' : 'df-flow'} aria-busy={st.loading || undefined}>
        {st.error && <DCard><Failed text={`לא הצלחנו לחשב. ${st.error}`} retry={st.reload} /></DCard>}
        {!m && !st.error && <FarmSkeleton tiles={0} side={380} />}
        {m && st.data && (
          <>
            <MoneyHero m={m} days={st.data.days} />
            <Cols className="d-cols--top">
              <Col>
                <Payments m={m} />
                <Months m={m} />
                <p className="df-note">מאשרים באפליקציה, במסך התשלומים, אחרי שבודקים שהכסף הגיע.</p>
              </Col>
              <Col width={380}><Events events={st.data.events} /></Col>
            </Cols>
          </>
        )}
      </div>
    </Page>
  );
}

function MoneyHero({ m, days }: { m: Stats['money']; days: number }) {
  const r = m.received;
  const parts = [{ k: 'tickets', he: 'כרטיסים', v: r.tickets }, { k: 'donations', he: 'תרומות', v: r.donations }, { k: 'tabs', he: 'חשבונות דוכנים', v: r.tabs }];
  return (
    <section className="d-hero df-hero k-on-dark">
      <div className="df-hero__sum"><span>נכנס {inLast(days)}{r.donors ? ` · ${many(r.donors, 'תורם אחד', 'תורמים')}` : ''}</span><b>{ils(r.total)}</b></div>
      <div className="df-hero__split">
        <div className="df-hero__bar" role="img" aria-label={`חלוקה: ${parts.map((p) => `${p.he} ${ils(p.v)}`).join(', ')}`}>
          {r.total > 0 && parts.map((p) => <span key={p.k} className={`is-${p.k}`} title={`${p.he}: ${ils(p.v)} · ${Math.round((p.v / r.total) * 100)}%`} style={{ width: `${(p.v / r.total) * 100}%` }} />)}
        </div>
        <div className="df-hero__parts">{parts.map((p) => <span key={p.k}><b>{ils(p.v)}</b> {p.he}</span>)}</div>
      </div>
      <div className="df-hero__side"><div><b>{ils(m.waiting.total)}</b><span>עוד לא שולם</span></div><div><b>{ils(m.waiting.claimed)}</b><span>אמרו ששילמו</span></div></div>
    </section>
  );
}

function Payments({ m }: { m: Stats['money'] }) {
  return (
    <DCard tight title={`תשלומים פתוחים · ${fmt(m.waiting.count)}${m.waiting.count > m.debts.length ? ` (מוצגים ${fmt(m.debts.length)} הראשונים)` : ''}`}
      aside={m.debts.length > 0 ? <Act href={outHref('/app/manage')}>לאישור באפליקציה</Act> : undefined} style={{ paddingBottom: 6 }}>
      <div className="df-pay"><Table label="תשלומים פתוחים" columns={COLS} rows={m.debts} rowKey={(d) => d.kind + d.id} empty="אין תשלומים פתוחים. הכול שולם." /></div>
    </DCard>
  );
}

function Months({ m }: { m: Stats['money'] }) {
  const total = (x: Stats['money']['months'][number]) => x.tickets + x.donations + x.tabs;
  const last = m.months[m.months.length - 1];
  return (
    <BarsCard months title="כמה נכנס בכל חודש" label="הכנסות לפי חודש, 12 חודשים" aside={last && `${MONTHS[monthAt(last.month)]}: ${ils(total(last))}`}
      data={m.months.map((x) => ({ key: x.month, value: total(x), on: x === last, label: SHORT_MONTH[monthAt(x.month)], tip: `${MONTHS[monthAt(x.month)]}: ${ils(total(x))} (כרטיסים ${ils(x.tickets)}, תרומות ${ils(x.donations)}, דוכנים ${ils(x.tabs)})` }))} />
  );
}

const moneyOf = (e: EventFunnel) => e.ticketMoney + e.stallMoney;
/** "1,480 ₪"; an event that took no money and has no price was free. */
const moneyText = (e: EventFunnel) => (moneyOf(e) ? ils(moneyOf(e)) : e.price ? ils(0) : 'חינם');

function Events({ events }: { events: EventFunnel[] }) {
  // the event in the funnel: the nearest one ahead, until another is pressed
  const ahead = events.filter((e) => e.upcoming).sort((a, b) => (a.start < b.start ? -1 : 1));
  const before = events.filter((e) => !e.upcoming);
  const order = [...ahead, ...before];
  const [id, select] = useSelected('money', order.map((e) => e.id));
  const cur = order.find((e) => e.id === id);
  if (!cur) return <DCard title="אירועים"><Empty>אין אירועים בתקופה הזאת או בחצי השנה הקרובה.</Empty></DCard>;
  const first = order[0];
  const row = (e: EventFunnel) => (
    <button key={e.id} type="button" className="d-fact df-ev" aria-pressed={e === cur} title="לראות את המספרים של האירוע" onClick={() => select(e.id)}>
      <span className="d-fact__label">{e.title}</span>
      <span className="d-fact__value">{ddmm(e.start)} · {e.upcoming ? many(e.tickets, 'כרטיס אחד', 'כרטיסים') : e.entered === 1 ? 'אחד הגיע' : `${fmt(e.entered)} הגיעו`} · {moneyText(e)}</span>
    </button>
  );
  return (
    <>
      <EventCard e={cur} />
      {cur !== first && <div className="d-line"><Act onClick={() => select(null)}>בחזרה אל {first.title}</Act></div>}
      {ahead.length > 1 && <DCard title="עוד אירועים קרובים"><div className="df-evs">{ahead.filter((e) => e !== first).map(row)}</div></DCard>}
      {(ahead.length === 0 ? before.length > 1 : true) && <DCard title="אירועים קודמים">{before.length ? <div className="df-evs">{before.map(row)}</div> : <p className="d-empty d-empty--inline">לא היו אירועים בתקופה הזאת.</p>}</DCard>}
    </>
  );
}

function EventCard({ e }: { e: EventFunnel }) {
  const top = Math.max(1, e.capacity, e.tickets);
  const share = (part: number, whole: number) => (whole > 0 ? ` · ${Math.round((part / whole) * 100)}%` : '');
  const steps = [
    ...(e.capacity > 0 ? [{ he: 'מקומות', v: e.capacity, text: fmt(e.capacity) }] : []),
    { he: 'כרטיסים שהוזמנו', v: e.tickets, text: fmt(e.tickets) + (e.capacity > 0 ? share(e.tickets, e.capacity) : '') },
    { he: 'שולמו', v: e.paid, text: fmt(e.paid) + (e.tickets ? `${share(e.paid, e.tickets)} מההזמנות` : '') },
    ...(e.upcoming ? [] : [{ he: 'הגיעו', v: e.entered, text: fmt(e.entered) + (e.tickets ? `${share(e.entered, e.tickets)} מההזמנות` : '') }]),
  ];
  const foot = [
    many(e.orders, 'הזמנה אחת', 'הזמנות'),
    e.price || e.ticketMoney ? `${ils(e.ticketMoney)} מכרטיסים` : 'כניסה חינם',
    ...(e.stallMoney || e.stallOpen ? [`${ils(e.stallMoney)} מדוכנים${e.stallOpen ? ` (ועוד ${ils(e.stallOpen)} פתוח)` : ''}`] : []),
    ...(e.cancelled ? [e.cancelled === 1 ? 'אחד בוטל' : `${fmt(e.cancelled)} בוטלו`] : []),
  ].join(' · ');
  const away = daysFromToday(e.start);
  return (
    <DCard title={<a className="df-evlink" href={outHref(`/app/manage/events/${encodeURIComponent(e.id)}`)} title={away > 0 ? 'עוד לא התקיים. לפתוח באפליקציה' : 'לפתוח באפליקציה'}>{e.title} · {ddmm(e.start)}</a>}
      aside={!e.published ? <DTag>טיוטה</DTag> : e.open ? <DTag tone="green">ההרשמה פתוחה</DTag> : <DTag>ההרשמה סגורה</DTag>}>
      <div className="df-funnel">
        {steps.map((s) => (
          <div key={s.he} className="df-funnel__step" title={`${s.he}: ${fmt(s.v)}`}>
            <div className="df-funnel__head"><span>{s.he}</span><b>{s.text}</b></div>
            <span className="df-funnel__track"><span style={{ width: `${s.v ? Math.max(1, Math.round((s.v / top) * 100)) : 0}%` }} /></span>
          </div>
        ))}
      </div>
      <p className="df-foot">{foot}</p>
    </DCard>
  );
}
