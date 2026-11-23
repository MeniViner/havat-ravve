// משימות מתוזמנות: each part of the server's 5-minute round, what it did last time, run it now, pause it; and the night
// cleanup: what is old enough to go, and what already went to the archive in the storage service (R2). Running the
// cleanup now, or pausing the nightly backup or the monitoring, asks first.
import { useState } from 'react';
import { Button, Card, ConfirmSheet, ListCard, Row, Tag, Toggle } from '../app/v2/kit';
import { ago, fmt, many, QRow, Section, useLoad } from './shared';
import { collectionName, size } from './labels';
import { errorText, source, type Job, type Switches } from './source';

const PAUSE: Record<string, keyof Switches> = { email: 'emailPaused', push: 'pushPaused', monitor: 'monitorPaused', backup: 'backupPaused', cleanup: 'cleanupPaused' };
const n = (v: unknown) => (typeof v === 'number' ? v : 0);
/** The cleanup's lines in plain words (the server's own names speak of its API). */
const CLEAN_HE: Record<string, string> = { api_idempotency: 'רישום בקשות למניעת כפילויות', api_log: 'יומן הבקשות לשרת' };
/** What needs a yes first, and what to say. */
type Ask = { j: Job; what: 'run' | 'pause'; title: string; text: string; go: string };
const ASK_RUN: Record<string, Omit<Ask, 'j' | 'what'>> = {
  cleanup: { title: 'להריץ עכשיו את ניקוי הרשומות הישנות?', text: 'רשומות טכניות ישנות (לפי הטבלה בהמשך המסך) יעברו לארכיון בשירות האחסון ויימחקו ממסד הנתונים. הנתונים של החווה עצמה לא נמחקים.', go: 'כן, לנקות עכשיו' },
};
const ASK_PAUSE: Record<string, Omit<Ask, 'j' | 'what'>> = {
  backup: { title: 'להשהות את הגיבוי הלילי?', text: 'עד שתפעילו שוב לא יישמר גיבוי חדש בלילות, ותגיע תזכורת כל בוקר. הגיבויים שכבר שמורים נשארים.', go: 'כן, להשהות' },
  monitor: { title: 'להשהות את בדיקת האתר והמכסה?', text: 'השרת יפסיק לבדוק את האתר ואת המכסה, ולא תגיע התראה אם האתר נופל או שהמכסה נגמרת, עד שתפעילו שוב.', go: 'כן, להשהות' },
};

/** What a job's last turn did, in words. */
function lastText(j: Job): string {
  const l = j.last;
  if (!l) return 'עוד לא רצה מאז העדכון';
  const r = l.result;
  // a Hebrew reason is shown; a technical (English) one stays out of the line
  if (!l.ok) { const err = String(r.error || ''); return err && !/[A-Za-z]/.test(err) ? `נכשלה: ${err}` : 'נכשלה בפעם האחרונה'; }
  switch (j.id) {
    case 'email': return r.enabled === false ? 'כבויה בהגדרות השרת' : r.paused ? `בהשהיה. ${many(n(r.enqueued), 'מייל אחד נכנס לתור', 'נכנסו לתור')}` : `${many(n(r.sent), 'נשלח מייל אחד', 'נשלחו')}${n(r.failed) ? `, ${many(n(r.failed), 'אחד נכשל', 'נכשלו')}` : ''}${n(r.enqueued) ? `, ${many(n(r.enqueued), 'אחד נכנס לתור', 'נכנסו לתור')}` : ''}`;
    case 'push': return r.paused ? 'בהשהיה' : r.mode === 'unset' ? 'לא מוגדרת בשרת' : r.mode === 'off' ? 'כבויה בהגדרות השרת' : `${many(n(r.delivered), 'נשלחה התראה אחת', 'נשלחו')}${n(r.failed) ? `, ${many(n(r.failed), 'אחת נכשלה', 'נכשלו')}` : ''}`;
    case 'monitor': return r.health ? `בדיקה כללית: ${r.health === 'ok' ? 'הכל תקין' : 'יש מה לבדוק'}` : 'האתר נבדק';
    case 'backup': return r.done ? `הגיבוי הושלם${n(r.docs) ? `: ${fmt(n(r.docs))} רשומות` : ''}` : `בגיבוי: ${fmt(n(r.docs))} רשומות עד עכשיו`;
    case 'cleanup': return r.done ? `הסתיים: ${fmt(n(r.deleted))} רשומות עברו לארכיון ונמחקו` : `${fmt(n(r.deleted))} רשומות עד עכשיו`;
    case 'accounts': return n(r.deleted) ? many(n(r.deleted), 'נמחק חשבון אחד', 'חשבונות נמחקו') : 'אין חשבונות למחיקה';
    default: return 'רצה';
  }
}

export function JobsScreen({ notify }: { notify: (t: string, tone?: 'info' | 'alert') => void }) {
  const st = useLoad(() => source.jobs());
  const [busy, setBusy] = useState<string | null>(null);
  const [ask, setAsk] = useState<Ask | null>(null);
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
  const askRun = (j: Job) => (ASK_RUN[j.id] ? setAsk({ j, what: 'run', ...ASK_RUN[j.id] }) : run(j));
  // pausing the backup or the monitoring asks first; turning anything back on never does
  const askPause = (j: Job, paused: boolean) => (paused && ASK_PAUSE[j.id] ? setAsk({ j, what: 'pause', ...ASK_PAUSE[j.id] }) : pause(j, paused));
  return (
    <>
      <div className="c-title">
        <div>
          <h1 className="c-h1">משימות מתוזמנות</h1>
          <p className="c-sub">השרת עושה סבב כל 5 דקות. כאן רואים מה כל חלק עשה בפעם האחרונה, ואפשר להריץ עכשיו או להשהות.</p>
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
                {j.canPause && <span className="c-toggle"><Toggle checked={!j.paused} onChange={(on) => askPause(j, !on)} label={`${j.he} פועלת`} disabled={busy === j.id} /><span aria-hidden="true">{j.paused ? 'בהשהיה' : 'פועלת'}</span></span>}
                {j.canRun && <Button variant="neutral" disabled={busy === j.id || (j.paused && j.id === 'push')} onClick={() => askRun(j)}>להריץ עכשיו</Button>}
              </QRow>
            ))}
          </ListCard>
          <p className="c-note">מחיקת חשבונות לא נעצרת מכאן: היא בקשה של המשתמש, והיא מתבצעת 30 יום אחריה.</p>

          <Section title="ניקוי רשומות ישנות">
            <Card pad="lg" className="c-stack c-stack--sm">
              <p className="c-note">כל לילה, אחרי הגיבוי, רשומות טכניות ישנות עוברות לארכיון בשירות האחסון ונמחקות ממסד הנתונים, כדי שיישאר קטן וחינמי. הנתונים של החווה עצמה (משימות, אנשים, אירועים, תשלומים) לא נמחקים אף פעם.</p>
              <table className="c-table">
                <thead><tr><th>מה</th><th>נשמר</th><th>ממתין לניקוי</th></tr></thead>
                <tbody>{d.cleanup.items.map((i) => (
                  <tr key={i.collection}><td>{CLEAN_HE[i.collection] || i.he}</td><td>{i.days === 365 ? 'שנה' : `${i.days} ימים`}</td><td className="k-num">{i.due === null ? '—' : fmt(i.due)}</td></tr>
                ))}</tbody>
              </table>
              {d.cleanup.last && <p className="c-note">הניקוי האחרון ({ago(d.cleanup.last.at)}): {fmt(d.cleanup.last.deleted)} רשומות עברו לארכיון ונמחקו{d.cleanup.last.done ? '' : ', עוד ממשיך'}.</p>}
            </Card>
          </Section>
          {!!d.archive.collections.length && (
            <Section title="בארכיון">
              <ListCard>{d.archive.collections.map((c) => <Row key={c.collection} title={CLEAN_HE[c.collection] || d.cleanup.items.find((i) => i.collection === c.collection)?.he || collectionName(c.collection)} meta={many(c.files, 'קובץ אחד', 'קבצים')} value={<bdi>{size(c.bytes)}</bdi>} />)}</ListCard>
            </Section>
          )}
        </div>
      )}
      {ask && (
        <ConfirmSheet open title={ask.title} text={ask.text} confirmLabel={ask.go} cancelLabel="חזרה" onClose={() => setAsk(null)}
          onConfirm={async () => { const a = ask; setAsk(null); await (a.what === 'run' ? run(a.j) : pause(a.j, true)); }} />
      )}
    </>
  );
}
