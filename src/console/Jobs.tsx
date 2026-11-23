// משימות מתוזמנות: each part of the server's 5-minute round, what it did last time, run it now, pause it; and the night
// cleanup: what is old enough to go, and what already went to the archive in R2.
import { useState } from 'react';
import { Button, Card, ListCard, Row, Tag, Toggle } from '../app/v2/kit';
import { ago, fmt, QRow, Section, useLoad } from './shared';
import { collectionName, size } from './labels';
import { errorText, source, type Job, type Switches } from './source';

const PAUSE: Record<string, keyof Switches> = { email: 'emailPaused', push: 'pushPaused', monitor: 'monitorPaused', backup: 'backupPaused', cleanup: 'cleanupPaused' };
const n = (v: unknown) => (typeof v === 'number' ? v : 0);

/** What a job's last turn did, in words. */
function lastText(j: Job): string {
  const l = j.last;
  if (!l) return 'עוד לא רצה מאז העדכון';
  const r = l.result;
  if (!l.ok) return `נכשלה: ${String(r.error || 'שגיאה')}`;
  switch (j.id) {
    case 'email': return r.enabled === false ? 'כבויה בהגדרות השרת' : r.paused ? `בהשהיה. נכנסו לתור ${n(r.enqueued)}` : `נשלחו ${n(r.sent)}${n(r.failed) ? `, נכשלו ${n(r.failed)}` : ''}${n(r.enqueued) ? `, נכנסו לתור ${n(r.enqueued)}` : ''}`;
    case 'push': return r.paused ? 'בהשהיה' : r.mode === 'unset' ? 'לא מוגדרת בשרת' : r.mode === 'off' ? 'כבויה בהגדרות השרת' : `נשלחו ${n(r.delivered)}${n(r.failed) ? `, נכשלו ${n(r.failed)}` : ''}`;
    case 'monitor': return r.health ? `בדיקה כללית: ${r.health === 'ok' ? 'הכל תקין' : 'יש מה לבדוק'}` : 'האתר נבדק';
    case 'backup': return r.done ? `הגיבוי הושלם${n(r.docs) ? `: ${fmt(n(r.docs))} רשומות` : ''}` : `בגיבוי: ${fmt(n(r.docs))} רשומות עד עכשיו`;
    case 'cleanup': return r.done ? `הסתיים: ${fmt(n(r.deleted))} רשומות עברו לארכיון ונמחקו` : `${fmt(n(r.deleted))} רשומות עד עכשיו`;
    case 'accounts': return n(r.deleted) ? `נמחקו ${n(r.deleted)} חשבונות` : 'אין חשבונות למחיקה';
    default: return 'רצה';
  }
}

export function JobsScreen({ notify }: { notify: (t: string, tone?: 'info' | 'alert') => void }) {
  const st = useLoad(() => source.jobs());
  const [busy, setBusy] = useState<string | null>(null);
  const d = st.data;
  const pause = async (j: Job, paused: boolean) => {
    setBusy(j.id);
    try { await source.setSwitches({ [PAUSE[j.id]]: paused }); await st.reload(); notify(paused ? `${j.he}: בהשהיה` : `${j.he}: פועלת שוב`); }
    catch (e) { notify(errorText(e), 'alert'); } finally { setBusy(null); }
  };
  const run = async (j: Job) => {
    setBusy(j.id);
    try { await source.runJob(j.id); await st.reload(); notify(`${j.he}: רצה עכשיו`); }
    catch (e) { notify(errorText(e), 'alert'); } finally { setBusy(null); }
  };
  return (
    <>
      <div className="c-title">
        <div>
          <h1 className="c-h1">משימות מתוזמנות</h1>
          <p className="c-sub">השרת עושה סבב כל 5 דקות. כאן רואים מה כל חלק עשה בפעם האחרונה, ואפשר להריץ עכשיו או לעצור.</p>
        </div>
      </div>
      {st.error && <Card pad="md" className="c-error">לא הצלחנו לקרוא. {st.error}</Card>}
      {st.loading && !d && <p className="c-soft">טוען…</p>}
      {d && (
        <div className={st.loading ? 'c-stack c-loading' : 'c-stack'}>
          <p className="c-note">{d.cronAt ? <>הסבב האחרון: {ago(d.cronAt)}{d.cronMs !== null && <>, נמשך <bdi>{(d.cronMs / 1000).toFixed(1)}</bdi> שניות</>}</> : 'עוד לא היה סבב מאז העדכון.'}</p>
          <ListCard>
            {d.jobs.map((j) => (
              <QRow key={j.id} title={<b>{j.he}</b>} tag={j.paused ? <Tag tone="waiting">בהשהיה</Tag> : null}
                meta={<>{j.every}<br />{lastText(j)}{j.last && ` · ${ago(j.last.at)}`}{j.last?.by ? ` · הורצה ידנית על ידי ${j.last.by}` : ''}</>}>
                {j.canPause && <span className="c-toggle"><Toggle checked={!j.paused} onChange={(on) => pause(j, !on)} label={`${j.he} פועלת`} disabled={busy === j.id} /><span aria-hidden="true">{j.paused ? "עצורה" : "פועלת"}</span></span>}
                {j.canRun && <Button variant="neutral" disabled={busy === j.id || (j.paused && j.id === 'push')} onClick={() => run(j)}>להריץ עכשיו</Button>}
              </QRow>
            ))}
          </ListCard>
          <p className="c-note">מחיקת חשבונות לא נעצרת מכאן: היא בקשה של המשתמש, והיא מתבצעת 30 יום אחריה.</p>

          <Section title="ניקוי רשומות ישנות">
            <Card pad="lg" className="c-stack c-stack--sm">
              <p className="c-note">כל לילה, אחרי הגיבוי, רשומות טכניות ישנות עוברות לארכיון ב־R2 ונמחקות מהמסד, כדי שיישאר קטן וחינמי. הנתונים של החווה עצמה (משימות, אנשים, אירועים, תשלומים) לא נמחקים אף פעם.</p>
              <table className="c-table">
                <thead><tr><th>מה</th><th>נשמר</th><th>ממתין לניקוי</th></tr></thead>
                <tbody>{d.cleanup.items.map((i) => (
                  <tr key={i.collection}><td>{i.he}</td><td>{i.days === 365 ? 'שנה' : `${i.days} ימים`}</td><td className="k-num">{i.due === null ? '—' : fmt(i.due)}</td></tr>
                ))}</tbody>
              </table>
              {d.cleanup.last && <p className="c-note">הניקוי האחרון ({ago(d.cleanup.last.at)}): {fmt(d.cleanup.last.deleted)} רשומות עברו לארכיון ונמחקו{d.cleanup.last.done ? '' : ', עוד ממשיך'}.</p>}
            </Card>
          </Section>
          {!!d.archive.collections.length && (
            <Section title="בארכיון">
              <ListCard>{d.archive.collections.map((c) => <Row key={c.collection} title={d.cleanup.items.find((i) => i.collection === c.collection)?.he || collectionName(c.collection)} meta={`${fmt(c.files)} קבצים`} value={<bdi>{size(c.bytes)}</bdi>} />)}</ListCard>
            </Section>
          )}
        </div>
      )}
    </>
  );
}
