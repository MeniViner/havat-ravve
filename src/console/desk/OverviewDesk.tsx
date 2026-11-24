// מצב כללי on a computer: one screen that answers "is everything all right".
import { hhmm } from '../../app/v2/format';
import { ago, fmt, outHref } from '../shared';
import type { Health, LogEntry, Monitor, Overview, Queue } from '../source';
import { Act, Attention, Btn, CellStrip, Col, Cols, DCard, DDot, DTag, Failed, Hero, Nums, Page, Skeleton, Table, type Column } from './desk';
import { DIcon } from './icons';
import { toTab } from './route';
import { actionText, checkDetail, checkName, dayAt, DOT, downCells, healthWhen, outage, QuotaBody, QuotaSkeleton, sec, siteTypical, STATE, waitingText, type Notify, type Wait } from './statusParts';

export type Load<T> = { data: T | null; error: string | null; loading: boolean; reload: () => void };
type P = { ov: Load<Overview>; mon: Load<Monitor>; q: Load<Queue>; recent: Load<LogEntry[]>; waits: Wait[]; busy: boolean; refresh: () => void; checkNow: () => void; notify: Notify };

export function OverviewDesk({ ov, mon, q, recent, waits, busy, refresh, checkNow, notify }: P) {
  const o = ov.data, m = mon.data;
  const checked = o?.crons?.at || m?.cronAt;
  const sub = o ? (
    <span title={o.server.version ? `גרסת השרת ${o.server.version.slice(0, 8)}` : undefined}>
      גרסה {o.server.catalogVersion}{o.server.deployedAt && <> · עלתה {dayAt(o.server.deployedAt)}</>}{checked && <> · נבדק {ago(checked)}</>}
    </span>
  ) : 'השרת של החווה, במסלול החינמי';
  return (
    <Page group="מצב" title="מצב כללי" sub={sub} actions={<>
      <Btn icon="refresh" onClick={refresh} disabled={ov.loading}>רענון</Btn>
      <Btn kind="action" icon="pulse" onClick={checkNow} disabled={busy}>{busy ? 'בודק…' : 'בדיקה מלאה עכשיו'}</Btn>
    </>}>
      <StatusHero ov={ov} mon={mon} waits={waits} ready={!!q.data || !!q.error} />
      {((ov.error && o) || (mon.error && m)) && <DCard><Failed text={`הרענון לא הצליח, ומוצג מה שנקרא קודם. ${ov.error || mon.error}`} retry={refresh} /></DCard>}
      {(o || m) && (waits.length
        ? <div className="ds-waits">{waits.map((w) => <Attention key={w.id} tone={w.tone} title={w.title} text={w.text} link={w.link} href={w.href} />)}</div>
        : (o && m && (q.data || q.error)) ? <section className="d-card ds-calm"><DDot tone="ok" /><span>הכול עובד כרגיל. אין כאן דבר שמחכה לך.</span></section> : null)}
      <Cols className="ds-over">
        <Col>
          <DCard title="בדיקת הבוקר" aside={m?.health ? <span className="ds-aside" title={ago(m.health.at)}>{healthWhen(m.health)}</span> : undefined}>
            {mon.error && !m ? <Failed text={`לא הצלחנו לקרוא את בדיקת הבוקר. ${mon.error}`} retry={mon.reload} /> : !m ? <Skeleton lines={5} height={18} /> : <Morning h={m.health} cronAt={checked || null} />}
          </DCard>
          <section className="d-card d-card--tight ds-log">
            <div className="d-card__head"><h2>פעולות אחרונות דרך השרת</h2><Act href={outHref('/app/manage/instinct')}>ליומן המלא</Act></div>
            <Table label="פעולות אחרונות דרך השרת" columns={LOG} rows={recent.data} rowKey={(e) => e.id} loading={recent.loading} error={recent.error && `לא הצלחנו לקרוא את היומן. ${recent.error}`} retry={recent.reload} empty="עוד אין פעולות ביומן." skeleton={5} />
          </section>
        </Col>
        <Col width={340}>
          <DCard title="המכסה החינמית היום" aside={m ? <span title="חצות בקליפורניה">מתאפסת ב־10:00</span> : undefined}>
            {mon.error && !m ? <Failed text="לא הצלחנו לקרוא את המכסה." retry={mon.reload} /> : m ? <QuotaBody m={m} long notify={notify} /> : <QuotaSkeleton />}
          </DCard>
          <DCard title="24 השעות האחרונות">
            {o ? <Nums items={[{ value: fmt(o.last24h.requests), label: 'בקשות לשרת' }, { value: fmt(o.last24h.writes), label: 'פעולות שבוצעו' }, { value: fmt(o.last24h.failed), label: 'נדחו' }]} /> : ov.error ? <Failed text="לא הצלחנו לקרוא." retry={ov.reload} /> : <Skeleton lines={2} height={18} />}
          </DCard>
          <DCard title="שליחה" aside={<Act href={toTab('switches')}>למתגים</Act>}>
            {o ? <Sending o={o} q={q.data} /> : ov.error ? <Failed text="לא הצלחנו לקרוא." retry={ov.reload} /> : <Skeleton lines={3} height={18} />}
          </DCard>
        </Col>
      </Cols>
    </Page>
  );
}

function StatusHero({ ov, mon, waits, ready }: { ov: Load<Overview>; mon: Load<Monitor>; waits: Wait[]; ready: boolean }) {
  const o = ov.data, m = mon.data;
  const down = !!m?.site.downSince;
  const bad = (!!ov.error && !o) || (o && o.server.status !== 'ok') || down;
  const title = ov.error && !o ? 'לא הצלחנו לקרוא את המצב' : down ? 'האתר לא עונה' : !o ? 'בודק…' : o.server.status === 'ok' ? 'השרת עובד' : 'השרת לא עונה כמו שצריך';
  const p50 = o?.last24h.p50;
  const typical = p50 === undefined ? siteTypical(m) : null;
  return (
    <Hero>
      <div className="ds-hero__state">
        <span className={bad ? 'ds-hero__mark is-bad' : o ? 'ds-hero__mark' : 'ds-hero__mark is-wait'}><DIcon name={bad ? 'close' : o ? 'check' : 'clock'} size={28} /></span>
        <div><b>{title}</b><span>{ov.error && !o ? <>{ov.error} <button type="button" className="ds-hero__retry" onClick={ov.reload}>לנסות שוב</button></> : o && m && ready ? waitingText(waits.length) : mon.error && !m ? 'לא הצלחנו לקרוא את הניטור' : 'רגע…'}</span></div>
      </div>
      <div className="ds-hero__strip">
        {m ? (
          <>
            <div className="ds-hero__line"><span title={m.site.url}>האתר ב־24 השעות האחרונות{m.site.uptime !== null && <> · ענה ב־{m.site.uptime}% מהבדיקות</>}</span><span>{outage(m)}</span></div>
            {m.site.checks.length
              ? <CellStrip onDark height={22} label={`זמינות האתר ביממה האחרונה: ${downCells(m)}`} cells={m.site.checks.map((c) => ({ key: c.at, state: c.ok ? 'ok' : 'bad', tip: `${hhmm(c.at)} · ${c.ok ? sec(c.ms) : 'לא ענה'}` }))} />
              : <div className="ds-hero__none">האתר עוד לא נבדק</div>}
            <div className="ds-hero__axis" dir="ltr"><span>לפני 24 שעות</span><span>עכשיו</span></div>
          </>
        ) : mon.error ? <div className="ds-hero__none">לא הצלחנו לקרוא את הבדיקות. <button type="button" className="ds-hero__retry" onClick={mon.reload}>לנסות שוב</button></div> : <div className="ds-hero__none" aria-hidden="true">&nbsp;</div>}
      </div>
      <div className="ds-hero__nums">
        <div><b>{p50 !== undefined ? (p50 === null ? '—' : sec(p50)) : typical === null ? '—' : sec(typical)}</b><span>{p50 !== undefined || !o ? 'בקשה רגילה' : 'זמן התשובה של האתר'}</span></div>
        <div><b>{fmt(o?.last24h.failures)}</b><span>תקלות שרת היום</span></div>
      </div>
    </Hero>
  );
}

function Morning({ h, cronAt }: { h: Health | null; cronAt: string | null }) {
  if (!h) return <p className="d-empty d-empty--inline">הבדיקה הראשונה תרוץ מחר ב־07:00, או עכשיו בכפתור למעלה.</p>;
  const half = Math.ceil(h.items.length / 2);
  return (
    <div className="ds-morning">
      {[h.items.slice(0, half), h.items.slice(half)].map((part, n) => (
        <div key={n}>
          {part.map((i) => (
            <div key={i.id} className="ds-check">
              <DDot tone={DOT[i.state]} /><span className="ds-check__name">{checkName(i)}</span>
              <span className="ds-check__detail" title={i.detail}>{checkDetail(i, cronAt, ago)}</span>
              <span className={`ds-check__state is-${i.state}`}>{STATE[i.state]}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

const LOG: Column<LogEntry>[] = [
  { key: 'at', head: 'מתי', width: 134, soft: true, cell: (e) => ago(e.at) },
  { key: 'who', head: 'מי', width: 224, strong: true, cell: (e) => e.keyLabel },
  { key: 'what', head: 'מה', cell: (e) => <span title={e.opHe || undefined}>{actionText(e)}</span> },
  { key: 'state', head: '', width: 114, align: 'end', cell: (e) => (e.ok ? null : <DTag tone="red">לא הצליח</DTag>) },
];

const PUSH: Record<string, string> = { webpush: 'פועלות · Web Push', fcm: 'פועלות · Firebase', off: 'כבויות' };
function Sending({ o, q }: { o: Overview; q: Queue | null }) {
  const s = q?.switches;
  const email = o.switches.email;
  const pushOn = o.switches.push.mode === 'webpush' || o.switches.push.mode === 'fcm';
  const mail = !email.on ? 'כבויים' : s?.emailPaused ? 'בהשהיה' : !email.configured ? 'אין ספק מוגדר' : `פועלים${email.brevo ? ' · דרך Brevo' : email.resend ? ' · דרך Resend' : ''}`;
  const push = o.switches.push.missing ? 'חסרות הגדרות בשרת' : s?.pushPaused ? 'בהשהיה' : PUSH[o.switches.push.mode] || 'לא ידוע';
  const row = (ok: boolean, label: string, value: string, tip?: string) => <div className="ds-send" title={tip}><DDot tone={ok ? 'ok' : 'warn'} /><span>{label}</span><span>{value}</span></div>;
  return (
    <div className="ds-sends">
      {row(email.on && email.configured && !s?.emailPaused, 'מיילים על תשלומים', mail, `${fmt(o.queues.email.pending)} מחכים, ${fmt(o.queues.email.failed)} נכשלו`)}
      {row(pushOn && !s?.pushPaused && !o.switches.push.missing, 'התראות לטלפון', push, `${fmt(o.queues.pushPending)} מחכות`)}
      {row(o.switches.files.r2, 'אחסון קבצים', o.switches.files.r2 ? 'מחובר' : 'לא מחובר')}
    </div>
  );
}
