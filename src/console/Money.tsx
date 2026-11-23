// כסף ואירועים: what came in over a period (tickets, donations, stall accounts), what still waits, the payments people
// said they made that an owner has to confirm, money by month, and each event as a funnel (orders → paid → came in).
import { useState } from 'react';
import { BarList, Card, ListCard, Row, StatRow, StatTile, Tag } from '../app/v2/kit';
import { ddmm } from '../app/v2/format';
import { ago, fmt, Section, useLoad } from './shared';
import { Columns, Funnel } from './charts';
import { Period, periodText } from './Stats';
import { source, type Debt } from './source';

const ils = (n: number) => `${fmt(Math.round(n))} ₪`;
const KIND: Record<Debt['kind'], string> = { ticket: 'כרטיסים', donation: 'תרומה', tab: 'חשבון דוכן' };
const MONTHS = ['ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני', 'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳'];
const monthName = (ym: string) => MONTHS[Number(ym.slice(5, 7)) - 1] || ym;

export function MoneyScreen() {
  const [days, setDays] = useState(30);
  const st = useLoad(() => source.stats(days), [days]);
  const m = st.data?.money;
  const claimed = m?.debts.filter((d) => d.claimed) || [];
  const open = m?.debts.filter((d) => !d.claimed) || [];
  return (
    <>
      <div className="c-title">
        <div>
          <h1 className="c-h1">כסף ואירועים</h1>
          <p className="c-sub">מה נכנס, מה עוד מחכה, ומה כל אירוע הביא. הסכומים לפי מה שסומן באפליקציה כשולם.</p>
        </div>
      </div>
      <Period days={days} onChange={setDays} />
      {st.error && <Card pad="md" className="c-error">לא הצלחנו לחשב. {st.error}</Card>}
      {st.loading && !m && <p className="c-soft">מחשב…</p>}
      {m && st.data && (
        <div className={st.loading ? 'c-stack c-loading' : 'c-stack'}>
          <Section title={`נכנס ב${periodText(days)} האחרון`}>
            <Card pad="lg" className="c-money">
              <div className="c-money__hero"><span className="c-money__sum k-num">{ils(m.received.total)}</span><span className="c-soft">{m.received.donors ? `${fmt(m.received.donors)} תורמים` : ''}</span></div>
              <BarList items={[{ label: 'כרטיסים', value: m.received.tickets, display: ils(m.received.tickets) }, { label: 'תרומות', value: m.received.donations, display: ils(m.received.donations) }, { label: 'חשבונות דוכנים', value: m.received.tabs, display: ils(m.received.tabs) }]} />
            </Card>
          </Section>
          <StatRow grid>
            <StatTile value={ils(m.waiting.total)} label="עוד לא שולם" />
            <StatTile value={ils(m.waiting.claimed)} label="אמרו ששילמו, לאשר" />
            <StatTile value={fmt(m.waiting.count)} label="תשלומים פתוחים" />
          </StatRow>

          {!!claimed.length && (
            <Section title={`אמרו ששילמו · ${claimed.length}`}>
              <ListCard>{claimed.map((d) => <DebtRow key={d.kind + d.id} d={d} />)}</ListCard>
              <p className="c-note">מאשרים באפליקציה, במסך התשלומים, אחרי שבודקים שהכסף הגיע.</p>
            </Section>
          )}
          {!!open.length && (
            <Section title={`מחכים לתשלום · ${open.length}${m.waiting.count > m.debts.length ? ` (מוצגים ${fmt(m.debts.length)} הראשונים מתוך ${fmt(m.waiting.count)})` : ''}`}>
              <ListCard>{open.map((d) => <DebtRow key={d.kind + d.id} d={d} />)}</ListCard>
            </Section>
          )}

          <Section title="כמה נכנס בכל חודש">
            <Card pad="lg">
              <Columns label="הכנסות לפי חודש, 12 חודשים" data={m.months.map((x, i) => {
                const total = x.tickets + x.donations + x.tabs;
                return { key: x.month, value: total, tip: `${monthName(x.month)}: ${ils(total)} (כרטיסים ${ils(x.tickets)}, תרומות ${ils(x.donations)}, דוכנים ${ils(x.tabs)})`, axis: (m.months.length - 1 - i) % 2 === 0 ? monthName(x.month) : '' };
              })} />
              <p className="c-note">נגיעה בחודש (או מעבר עם העכבר) מראה את הפירוט שלו מתחת לגרף.</p>
            </Card>
          </Section>

          <Section title="אירועים">
            {!st.data.events.length && <Card pad="md" className="c-soft">אין אירועים בתקופה הזאת או בחצי השנה הקרובה.</Card>}
            {st.data.events.map((e) => (
              <Card key={e.id} pad="lg" className="c-event">
                <div className="c-event__head">
                  <div>
                    <b>{e.title}</b>
                    <div className="c-soft">{ddmm(e.start)}{e.upcoming ? ' · עוד לא התקיים' : ''} · {fmt(e.orders)} הזמנות</div>
                  </div>
                  {!e.published ? <Tag tone="outline">טיוטה</Tag> : e.open ? <Tag tone="paid">ההרשמה פתוחה</Tag> : <Tag tone="neutral">ההרשמה סגורה</Tag>}
                </div>
                <Funnel steps={[
                  { label: 'כרטיסים', value: e.tickets },
                  { label: 'שולמו', value: e.paid },
                  ...(e.upcoming ? [] : [{ label: 'הגיעו', value: e.entered }]),
                ]} />
                <p className="c-soft c-event__foot">
                  {e.capacity > 0 && <>תפוסה {Math.round((e.tickets / e.capacity) * 100)}% ({fmt(e.tickets)} מתוך {fmt(e.capacity)}) · </>}
                  כרטיסים {ils(e.ticketMoney)}{e.stallMoney || e.stallOpen ? <> · דוכנים {ils(e.stallMoney)}{e.stallOpen ? ` (ועוד ${ils(e.stallOpen)} פתוח)` : ''}</> : null}
                  {e.cancelled ? ` · ${fmt(e.cancelled)} בוטלו` : ''}
                </p>
              </Card>
            ))}
          </Section>
        </div>
      )}
    </>
  );
}

function DebtRow({ d }: { d: Debt }) {
  return <Row title={<><b>{d.who || 'בלי שם'}</b> · {d.what}</>} meta={<>{KIND[d.kind]} · {d.claimed ? `אמר ששילם ${ago(d.since)}` : `מאז ${ago(d.since)}`}</>} value={<span className="k-num">{ils(d.amount)}</span>} />;
}
