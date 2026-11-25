// מצב כללי: is everything all right. The server and the site, what waits for the owner, this morning's check, the free
// quota, the last day's numbers, what sends, and the latest actions of the keys and the console.
import { useEffect, useState } from 'react';
import { Button, Card, Dot, ListCard, Row, StatRow, StatTile, Tag } from '../app/v2/kit';
import { hhmm } from '../app/v2/format';
import { ago, fmt, outHref, Section, useLoad, useNotice } from './shared';
import { errorText, source, type Monitor } from './source';
import { setFailedMails } from './desk/counts';
import { useWide } from './desk/route';
import { Attention } from './desk/desk';
import { OverviewDesk } from './desk/OverviewDesk';
import { actionText, checkDetail, checkName, cronLate, dayAt, healthWhen, outage, QuotaBody, sec, siteTypical, STATE, waiting, type Notify, type Wait } from './desk/statusParts';

const PUSH: Record<string, string> = { webpush: 'פועלות (Web Push)', fcm: 'פועלות (Firebase)', off: 'כבויות' };

export function OverviewScreen() {
  const wide = useWide();
  const notice = useNotice();
  const ov = useLoad(() => source.overview());
  const recent = useLoad(() => source.recent(8));
  const mon = useLoad(() => source.monitor());
  const queue = useLoad(() => source.queue());
  const [busy, setBusy] = useState(false);
  const o = ov.data;
  useEffect(() => { if (o) setFailedMails(o.queues.email.failed); }, [o]);
  const refresh = () => { ov.reload(); recent.reload(); mon.reload(); queue.reload(); };
  const checkNow = async () => {
    setBusy(true);
    try { mon.setData(await source.checkNow()); notice.show('הבדיקה הסתיימה'); }
    catch (e) { notice.show(errorText(e), 'alert'); }
    finally { setBusy(false); }
  };
  const waits = waiting(o, mon.data, queue.data, ago);
  if (wide) return <><OverviewDesk ov={ov} mon={mon} q={queue} recent={recent} waits={waits} busy={busy} refresh={refresh} checkNow={checkNow} notify={notice.show} />{notice.view}</>;
  const late = cronLate(o?.crons?.at);
  const s = queue.data?.switches;
  const p50 = o?.last24h.p50;
  const typical = p50 === undefined ? siteTypical(mon.data) : p50;
  return (
    <>
      <div className="c-title">
        <div>
          <h1 className="c-h1">מצב כללי</h1>
          <p className="c-sub">השרת של החווה, במסלול החינמי.</p>
        </div>
        <Button variant="neutral" onClick={refresh} disabled={ov.loading}>רענון</Button>
      </div>
      {ov.error && <Card pad="md" className="c-error">לא הצלחנו לקרוא את מצב השרת. {ov.error}</Card>}
      {ov.loading && !o && <p className="c-soft">טוען…</p>}
      {o && (
        <div className={ov.loading ? 'c-stack c-loading' : 'c-stack'}>
          <Card pad="lg" className="c-health">
            <Dot tone={o.server.status === 'ok' ? 'green' : 'red'} />
            <div className="c-health__body">
              <b>{o.server.status === 'ok' ? 'השרת עובד' : 'השרת לא עונה כמו שצריך'}</b>
              <span className="c-soft">
                גרסה <span className="k-ltr k-num">{o.server.version ? o.server.version.slice(0, 8) : '—'}</span>
                {o.server.deployedAt && <> · עלתה {ago(o.server.deployedAt)}</>}
                {' '}· רשימת הפעולות בגרסה <bdi className="k-num">{o.server.catalogVersion}</bdi>
              </span>
              {typical !== null && <span className="c-soft">{p50 === undefined ? 'זמן התשובה של האתר' : 'בקשה רגילה'}: <bdi className="k-num">{sec(typical)}</bdi></span>}
            </div>
          </Card>

          {mon.data && <SiteStrip m={mon.data} />}
          {waits.length > 0 && <div className="ds-waits">{waits.map((w: Wait) => <Attention key={w.id} tone={w.tone} title={w.title} text={w.text} link={w.link} href={w.href} />)}</div>}
          {!waits.length && mon.data && queue.data && <Card pad="md" className="c-flat">הכול עובד כרגיל. אין כאן דבר שמחכה לך.</Card>}
          {mon.error && <Card pad="md" className="c-error">לא הצלחנו לקרוא את הבדיקות. {mon.error}</Card>}
          {mon.data && <MorningPhone m={mon.data} busy={busy} checkNow={checkNow} notify={notice.show} />}

          <Section title="24 השעות האחרונות">
            <StatRow grid>
              <StatTile value={fmt(o.last24h.requests)} label="בקשות לשרת" />
              <StatTile value={fmt(o.last24h.writes)} label="פעולות שבוצעו" />
              <StatTile value={fmt(o.last24h.failed)} label="בקשות שנדחו" />
              <StatTile value={fmt(o.last24h.failures)} label="תקלות שרת" />
            </StatRow>
          </Section>

          <div className="c-two">
            <Section title="מה מחכה בתור">
              <ListCard>
                <Row title="התראות לטלפון שממתינות" value={<span className="k-num">{fmt(o.queues.pushPending)}</span>} />
                <Row title="מיילים שממתינים" value={<span className="k-num">{fmt(o.queues.email.pending)}</span>} />
                <Row title="מיילים שנכשלו" value={<span className="k-num">{fmt(o.queues.email.failed)}</span>} tags={o.queues.email.failed ? <Tag tone="urgent">לבדוק</Tag> : undefined} />
              </ListCard>
            </Section>
            <Section title="מתגים">
              <ListCard>
                <Row title="התראות לטלפון" meta={o.switches.push.missing ? 'חסרות הגדרות בשרת' : s?.pushPaused ? 'בהשהיה' : undefined} value={PUSH[o.switches.push.mode] || o.switches.push.mode} />
                <Row title="מיילים" meta={o.switches.email.configured ? (o.switches.email.brevo ? 'דרך Brevo' : o.switches.email.resend ? 'דרך Resend' : 'אין ספק מוגדר') : undefined}
                  value={!o.switches.email.on ? 'כבויים' : s?.emailPaused ? 'בהשהיה' : 'פועלים'} />
                <Row title="אחסון קבצים" value={o.switches.files.r2 ? 'מחובר' : 'לא מחובר'} />
              </ListCard>
              <p className="c-note"><a className="c-link c-linkbtn" href="#/switches">להדליק ולכבות במסך המתגים</a></p>
            </Section>
          </div>

          <Section title="משימות מתוזמנות">
            <ListCard>
              <Row title="תזכורות, תורי התראות ומיילים" meta="רצות כל 5 דקות"
                value={o.crons ? ago(o.crons.at) : 'עוד לא נרשמה ריצה'}
                tags={o.crons && late ? <Tag tone="urgent">מאחרות</Tag> : undefined} />
            </ListCard>
          </Section>
        </div>
      )}

      <Section title="פעולות אחרונות" aside={<a className="c-link c-linkbtn" href={outHref('/app/manage/instinct')}>ליומן המלא</a>}>
        {recent.error && <Card pad="md" className="c-error">{recent.error}</Card>}
        {recent.loading && !recent.data && <p className="c-soft">טוען…</p>}
        {recent.data && !recent.data.length && <Card pad="md" className="c-soft">עוד אין פעולות ביומן.</Card>}
        {!!recent.data?.length && (
          <ListCard className={recent.loading ? 'c-loading' : undefined}>
            {recent.data.map((e) => (
              <Row key={e.id} title={<><b>{e.keyLabel}</b> {actionText(e)}</>} meta={ago(e.at)}
                tags={!e.ok ? <Tag tone="urgent">נכשל</Tag> : undefined} />
            ))}
          </ListCard>
        )}
      </Section>
      {notice.view}
    </>
  );
}

/** The site's last day (phone). */
function SiteStrip({ m }: { m: Monitor }) {
  const out = outage(m);
  if (!m.site.checks.length) return null;
  return (
    <Section title="האתר ב־24 השעות האחרונות" aside={m.site.uptime !== null ? <span className="c-soft k-num">{m.site.uptime}%</span> : undefined}>
      <Card pad="lg" className="c-site">
        <div className="c-strip" role="img" aria-label={`${m.site.checks.filter((c) => !c.ok).length} בדיקות שלא עברו ב־24 השעות האחרונות`}>
          {m.site.checks.map((c) => <span key={c.at} className={c.ok ? '' : 'is-down'} title={`${hhmm(c.at)} · ${c.ok ? sec(c.ms) : 'לא ענה'}`} />)}
        </div>
        <div className="c-strip__axis"><span>לפני 24 שעות</span><span>עכשיו</span></div>
        {out && <p className="c-note">{out}</p>}
      </Card>
    </Section>
  );
}

/** The morning check and the free quota (phone). */
function MorningPhone({ m, busy, checkNow, notify }: { m: Monitor; busy: boolean; checkNow: () => void; notify: Notify }) {
  return (
    <>
      <Section title="בדיקת הבוקר" aside={m.health ? <span className="c-soft">{healthWhen(m.health)}</span> : undefined}>
        {m.health
          ? <ListCard>{m.health.items.map((i) => <Row key={i.id} leading={<span className={`c-state c-state--${i.state}`} role="img" aria-label={STATE[i.state]} />} title={checkName(i)} meta={checkDetail(i, m.cronAt, ago)} value={<span className={`c-state-text c-state-text--${i.state}`}>{STATE[i.state]}</span>} />)}</ListCard>
          : <Card pad="md" className="c-soft">הבדיקה הראשונה תרוץ מחר ב־07:00, או עכשיו בכפתור.</Card>}
        <Button variant="neutral" onClick={checkNow} disabled={busy}>{busy ? 'בודק…' : 'בדיקה מלאה עכשיו'}</Button>
      </Section>
      <Section title="המכסה החינמית היום" aside={<span className="c-soft">מתאפסת ב־10:00</span>}>
        <Card pad="lg"><QuotaBody m={m} long notify={notify} /></Card>
      </Section>
    </>
  );
}
