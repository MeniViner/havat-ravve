// מצב השרת: is the server up, which version runs, how busy the last day was, what waits in the queues, when the
// scheduled jobs last ran, which switches are on, and the latest actions of the keys and the console.
import { Button, Card, Dot, ListCard, Row, StatRow, StatTile, Tag } from '../app/v2/kit';
import { ago, fmt, Section, useLoad } from './shared';
import { source } from './source';

const PUSH: Record<string, string> = { webpush: 'פועלות (Web Push)', fcm: 'פועלות (Firebase)', off: 'כבויות' };

export function OverviewScreen({ onKeys }: { onKeys: () => void }) {
  const ov = useLoad(() => source.overview());
  const recent = useLoad(() => source.recent(8));
  const o = ov.data;
  const cronLate = o?.crons ? Date.now() - Date.parse(o.crons.at) > 15 * 60_000 : true;
  return (
    <>
      <div className="c-title">
        <div>
          <h1 className="c-h1">מצב השרת</h1>
          <p className="c-sub">השרת של החווה ב־Cloudflare, המסלול החינמי.</p>
        </div>
        <Button variant="neutral" icon="download" onClick={() => { ov.reload(); recent.reload(); }} disabled={ov.loading}>רענון</Button>
      </div>
      {ov.error && <Card pad="md" className="c-error">לא הצלחנו לקרוא את מצב השרת. {ov.error}</Card>}
      {o && (
        <>
          <Card pad="lg" className="c-health">
            <Dot tone={o.server.status === 'ok' ? 'green' : 'red'} />
            <div className="c-health__body">
              <b>{o.server.status === 'ok' ? 'השרת עובד' : 'השרת לא עונה כמו שצריך'}</b>
              <span className="c-soft">
                גרסה <span className="k-ltr k-num">{o.server.version ? o.server.version.slice(0, 8) : '—'}</span>
                {o.server.deployedAt && <> · עלתה {ago(o.server.deployedAt)}</>}
                {' '}· קטלוג <span className="k-num">{o.server.catalogVersion}</span>
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
                <Row title="התראות לטלפון" meta={o.switches.push.missing ? 'חסרות הגדרות בשרת' : undefined} value={PUSH[o.switches.push.mode] || o.switches.push.mode} />
                <Row title="מיילים" meta={o.switches.email.configured ? (o.switches.email.brevo ? 'דרך Brevo' : o.switches.email.resend ? 'דרך Resend' : 'אין ספק מוגדר') : undefined}
                  value={o.switches.email.on ? 'פועלים' : 'כבויים'} />
                <Row title="אחסון קבצים (R2)" value={o.switches.files.r2 ? 'מחובר' : 'לא מחובר'} />
              </ListCard>
              <p className="c-note">שינוי המתגים מכאן יגיע בשלב הבא.</p>
            </Section>
          </div>

          <Section title="משימות מתוזמנות">
            <ListCard>
              <Row title="תזכורות, תורי התראות ומיילים" meta="רצות כל 5 דקות"
                value={o.crons ? ago(o.crons.at) : 'עוד לא נרשמה ריצה'}
                tags={o.crons && cronLate ? <Tag tone="urgent">מאחרות</Tag> : undefined} />
            </ListCard>
          </Section>
        </>
      )}

      <Section title="פעולות אחרונות" aside={<a className="c-link" href="/app/manage/instinct">ליומן המלא</a>}>
        {recent.error && <Card pad="md" className="c-error">{recent.error}</Card>}
        {recent.data && !recent.data.length && <Card pad="md" className="c-soft">עוד אין פעולות ביומן.</Card>}
        {!!recent.data?.length && (
          <ListCard>
            {recent.data.map((e) => (
              <Row key={e.id} title={<><b>{e.keyLabel}</b> {e.verb}: {e.opHe || e.op}</>} meta={ago(e.at)}
                tags={!e.ok ? <Tag tone="urgent">נכשל</Tag> : undefined} />
            ))}
          </ListCard>
        )}
        <div className="c-actions"><Button variant="link" icon="key" onClick={onKeys}>למפתחות</Button></div>
      </Section>
    </>
  );
}
