// מצב השרת: is the server up, which version runs, how busy the last day was, what waits in the queues, when the
// scheduled jobs last ran, which switches are on, and the latest actions of the keys and the console.
import { Button, Card, Dot, ListCard, Row, StatRow, StatTile, Tag } from '../app/v2/kit';
import { ago, fmt, outHref, Section, useLoad } from './shared';
import { source } from './source';
import { ON_NOW } from './Switches';
import { nowMs } from '../app/clock';

const PUSH: Record<string, string> = { webpush: 'פועלות (Web Push)', fcm: 'פועלות (Firebase)', off: 'כבויות' };
/** The switches that change what people can do: when one is on, the overview says so at the top. */
const LOUD = new Set(['maintenance', 'readOnly', 'keysStopped', 'registrationClosed']);

export function OverviewScreen() {
  const ov = useLoad(() => source.overview());
  const recent = useLoad(() => source.recent(8));
  const sw = useLoad(() => source.switches());
  const o = ov.data;
  const cronLate = o?.crons ? nowMs() - Date.parse(o.crons.at) > 15 * 60_000 : true;
  const s = sw.data?.switches;
  const loud = s ? ON_NOW.filter(([k]) => LOUD.has(k) && s[k]).map(([, he]) => he) : [];
  const quiet = s ? ON_NOW.filter(([k]) => !LOUD.has(k) && s[k]).map(([, he]) => he) : [];
  return (
    <>
      <div className="c-title">
        <div>
          <h1 className="c-h1">מצב השרת</h1>
          <p className="c-sub">השרת של החווה, במסלול החינמי.</p>
        </div>
        <Button variant="neutral" onClick={() => { ov.reload(); recent.reload(); sw.reload(); }} disabled={ov.loading}>רענון</Button>
      </div>
      {loud.length > 0 && (
        <Card pad="md" className="c-warn">
          <b>דלוק עכשיו: {loud.join(' · ')}.</b> <a className="c-link c-linkbtn" href="#/switches">למסך המתגים</a>
        </Card>
      )}
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
            </div>
          </Card>

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
              {quiet.length > 0 && <p className="c-note">גם: {quiet.join(' · ')}.</p>}
              <p className="c-note"><a className="c-link c-linkbtn" href="#/switches">להדליק ולכבות במסך המתגים</a></p>
            </Section>
          </div>

          <Section title="משימות מתוזמנות">
            <ListCard>
              <Row title="תזכורות, תורי התראות ומיילים" meta="רצות כל 5 דקות"
                value={o.crons ? ago(o.crons.at) : 'עוד לא נרשמה ריצה'}
                tags={o.crons && cronLate ? <Tag tone="urgent">מאחרות</Tag> : undefined} />
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
              <Row key={e.id} title={<><b>{e.keyLabel}</b> {e.verb}: {e.opHe || e.op}</>} meta={ago(e.at)}
                tags={!e.ok ? <Tag tone="urgent">נכשל</Tag> : undefined} />
            ))}
          </ListCard>
        )}
      </Section>
    </>
  );
}
