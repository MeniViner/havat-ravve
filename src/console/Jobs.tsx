// משימות מתוזמנות: each part of the server's 5-minute round, what it did last time, run it now, pause it, or run a whole
// round; the last four hours of rounds; and the night cleanup: what is old enough to go, and what already went to the
// archive in the storage service (R2). Running the cleanup now, a whole round, or pausing the nightly backup or the
// monitoring, asks first. The computer's page: desk/JobsDesk.tsx.
import { useState } from 'react';
import { Button, Card, ConfirmSheet, ListCard, Row, Tag, Toggle } from '../app/v2/kit';
import { ago, fmt, many, QRow, Section, useLoad } from './shared';
import { collectionName, size } from './labels';
import { errorText, source, type Job, type Switches } from './source';
import { useWide } from './desk/route';
import { CLEAN_HE, JobsDesk, KEEP_ACCOUNTS, lastRound, lastText, roundPlan, roundsText, RoundsStrip, RoundWindow, useRound } from './desk/JobsDesk';

const PAUSE: Record<string, keyof Switches> = { email: 'emailPaused', push: 'pushPaused', monitor: 'monitorPaused', backup: 'backupPaused', cleanup: 'cleanupPaused' };
/** What needs a yes first, and what to say. */
type Ask = { j: Job | null; what: 'run' | 'pause' | 'round'; title: string; text: string; go: string };
type AskText = Omit<Ask, 'j' | 'what'>;
const ASK_RUN: Record<string, AskText> = {
  cleanup: { title: 'להריץ עכשיו את ניקוי הרשומות הישנות?', text: 'רשומות טכניות ישנות (לפי הטבלה בהמשך המסך) יעברו לארכיון בשירות האחסון ויימחקו ממסד הנתונים. הנתונים של החווה עצמה לא נמחקים.', go: 'כן, לנקות עכשיו' },
};
const ASK_PAUSE: Record<string, AskText> = {
  backup: { title: 'להשהות את הגיבוי הלילי?', text: 'עד שתפעילו שוב לא יישמר גיבוי חדש בלילות, ותגיע תזכורת כל בוקר. הגיבויים שכבר שמורים נשארים.', go: 'כן, להשהות' },
  monitor: { title: 'להשהות את בדיקת האתר והמכסה?', text: 'השרת יפסיק לבדוק את האתר ואת המכסה, ולא תגיע התראה אם האתר נופל או שהמכסה נגמרת, עד שתפעילו שוב.', go: 'כן, להשהות' },
};

export function JobsScreen({ notify }: { notify: (t: string, tone?: 'info' | 'alert') => void }) {
  const wide = useWide();
  const st = useLoad(() => source.jobs());
  const round = useRound(st.reload);
  const [one, setBusy] = useState<string | null>(null);
  const busy = round.running ? 'round' : one;
  const [ask, setAsk] = useState<Ask | null>(null);
  const d = st.data;
  const last = d && lastRound(d);
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
  const askRound = () => {
    if (!d) return;
    const plan = roundPlan(d.jobs);
    const go = plan.filter((s) => s.state === 'wait'), skip = plan.filter((s) => s.state === 'skip');
    setAsk({
      j: null, what: 'round', title: 'להריץ סבב מלא עכשיו?', go: 'כן, להריץ',
      text: `${go.length ? `המשימות ירוצו אחת אחרי השנייה: ${go.map((s) => s.he).join(', ')}. מיילים והתראות שמחכים יישלחו.` : 'אין כרגע משימה שאפשר להריץ.'}${go.some((s) => s.id === 'cleanup') ? ' הניקוי מעביר רשומות טכניות ישנות לארכיון ומוחק אותן ממסד הנתונים. הנתונים של החווה עצמה לא נמחקים.' : ''}${skip.length ? ` לא ירוצו: ${skip.map((s) => `${s.he} (${s.text})`).join(', ')}.` : ''}`,
    });
  };
  return (
    <>
      {wide ? <JobsDesk d={d} error={st.error} retry={st.reload} busy={busy} askRun={askRun} askPause={askPause} askRound={askRound} round={round} /> : (
        <>
          <div className="c-title">
            <div>
              <h1 className="c-h1">משימות מתוזמנות</h1>
              <p className="c-sub">השרת עושה סבב כל 5 דקות. כאן רואים מה כל חלק עשה בפעם האחרונה, ואפשר להריץ עכשיו או להשהות.</p>
            </div>
            {round.running ? <Button variant="neutral" onClick={round.show}>הסבב רץ, להצגה</Button> : <Button variant="neutral" disabled={!d || busy !== null} onClick={askRound}>להריץ סבב מלא עכשיו</Button>}
          </div>
          {st.error && <Card pad="md" className="c-error">לא הצלחנו לקרוא. {st.error}</Card>}
          {st.loading && !d && <p className="c-soft">טוען…</p>}
          {d && (
            <div className={st.loading ? 'c-stack c-loading' : 'c-stack'}>
              <p className="c-note">{last ? <>הסבב האחרון: {ago(last.at)}{last.by && `, ידנית, ${last.by}`}{last.ms !== null && <>, נמשך <bdi>{(last.ms / 1000).toFixed(1)}</bdi> שניות</>}</> : 'עוד לא היה סבב מאז העדכון.'}</p>
              <ListCard>
                {d.jobs.map((j) => (
                  <QRow key={j.id} title={<b>{j.he}</b>} tag={j.paused ? <Tag tone="waiting">בהשהיה</Tag> : null}
                    meta={<>{j.every}<br />{lastText(j)}{j.last && ` · ${ago(j.last.at)}`}{j.last?.by ? ` · הורצה ידנית על ידי ${j.last.by}` : ''}</>}>
                    {j.canPause && <span className="c-toggle"><Toggle checked={!j.paused} onChange={(on) => askPause(j, !on)} label={`${j.he} פועלת`} disabled={busy !== null} /><span aria-hidden="true">{j.paused ? 'בהשהיה' : 'פועלת'}</span></span>}
                    {j.canRun && <Button variant="neutral" disabled={busy !== null || (j.paused && j.id === 'push')} onClick={() => askRun(j)}>להריץ עכשיו</Button>}
                  </QRow>
                ))}
              </ListCard>
              <p className="c-note">{KEEP_ACCOUNTS}</p>

              {d.rounds && (
                <Section title="הסבבים בארבע השעות האחרונות">
                  <Card pad="lg" className="c-stack c-stack--sm"><RoundsStrip r={d.rounds} /><p className="c-note">{roundsText(d.rounds, d.jobs)}</p></Card>
                </Section>
              )}

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
        </>
      )}
      <RoundWindow round={round} wide={wide} />
      {ask && (
        <ConfirmSheet open title={ask.title} text={ask.text} confirmLabel={ask.go} cancelLabel="חזרה" tone={ask.what === 'round' ? 'primary' : 'danger'} onClose={() => setAsk(null)}
          onConfirm={async () => { const a = ask; setAsk(null); if (a.what === 'round') round.start(d!.jobs); else await (a.what === 'run' ? run(a.j!) : pause(a.j!, true)); }} />
      )}
    </>
  );
}
